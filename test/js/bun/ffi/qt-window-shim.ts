// Builds and loads qt-window.shim.cpp, the C ABI that qt-window.fixture.ts and
// kde-window.fixture.ts call through bun:ffi. Qt is C++ only and TinyCC (bun:ffi
// `cc`) compiles C, so the shim is built with the system C++ compiler and
// pkg-config, once per source/toolchain hash, into the OS temp directory.
//
// Toolchain lookup: Linux/macOS use `c++`/`g++`/`clang++` and `pkg-config` from
// PATH; Windows uses MSYS2 UCRT64 (`mingw-w64-ucrt-x86_64-{gcc,pkgconf,qt6-base}`,
// plus `kirigami` for KDE) from $BUN_QT_BIN_DIR or C:\msys64\ucrt64\bin.
import { dlopen, FFIType } from "bun:ffi";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type QtVariant = "qt" | "kirigami";

export interface QtToolchain {
  variant: QtVariant;
  cxx: string;
  pkgConfig: string;
  /** Windows: directory holding the Qt DLLs, prepended to PATH before loading the shim. */
  binDir: string | null;
  env: Record<string, string | undefined>;
  qtVersion: string;
  flags: string[];
}

const shimSource = join(import.meta.dir, "qt-window.shim.cpp");
const modules: Record<QtVariant, string[]> = {
  qt: ["Qt6Widgets"],
  kirigami: ["Qt6Widgets", "Qt6Quick", "Qt6Qml"],
};

function run(cmd: string[], env: Record<string, string | undefined>) {
  const proc = Bun.spawnSync({ cmd, env, stdout: "pipe", stderr: "pipe" });
  return { ok: proc.exitCode === 0, stdout: proc.stdout.toString().trim(), stderr: proc.stderr.toString().trim() };
}

/** Returns the toolchain, or a string saying what is missing. */
export function findQtToolchain(variant: QtVariant): QtToolchain | string {
  let cxx: string | null;
  let pkgConfig: string | null;
  let binDir: string | null = null;
  const env: Record<string, string | undefined> = { ...process.env };
  if (process.platform === "win32") {
    binDir = process.env.BUN_QT_BIN_DIR ?? "C:\\msys64\\ucrt64\\bin";
    cxx = join(binDir, "g++.exe");
    pkgConfig = join(binDir, "pkg-config.exe");
    if (!existsSync(cxx) || !existsSync(pkgConfig)) return `MSYS2 UCRT64 g++/pkg-config not found in ${binDir}`;
    const pathKey = Object.keys(env).find(k => k.toUpperCase() === "PATH") ?? "PATH";
    env[pathKey] = `${binDir};${env[pathKey] ?? ""}`;
  } else {
    cxx = Bun.which("c++") ?? Bun.which("g++") ?? Bun.which("clang++");
    pkgConfig = Bun.which("pkg-config") ?? Bun.which("pkgconf");
    if (!cxx) return "no C++ compiler (c++, g++ or clang++) on PATH";
    if (!pkgConfig) return "no pkg-config on PATH";
  }
  const exists = run([pkgConfig, "--exists", ...modules[variant]], env);
  if (!exists.ok) return `pkg-config cannot find ${modules[variant].join(" ")}`;
  const version = run([pkgConfig, "--modversion", "Qt6Widgets"], env).stdout;
  if (variant === "kirigami" && !findKirigami(pkgConfig, binDir, env))
    return "Kirigami QML module (KDE Frameworks 6) not installed";
  const flags = run([pkgConfig, "--cflags", "--libs", ...modules[variant]], env);
  if (!flags.ok) return `pkg-config --cflags --libs failed: ${flags.stderr}`;
  return {
    variant,
    cxx,
    pkgConfig,
    binDir,
    env,
    qtVersion: version,
    flags: flags.stdout.split(/\s+/).filter(Boolean),
  };
}

function findKirigami(pkgConfig: string, binDir: string | null, env: Record<string, string | undefined>) {
  const qmlDirs: string[] = [];
  const qtpaths = binDir ? join(binDir, "qtpaths6.exe") : (Bun.which("qtpaths6") ?? Bun.which("qtpaths"));
  if (qtpaths && existsSync(qtpaths)) {
    const query = run([qtpaths, "--query", "QT_INSTALL_QML"], env);
    if (query.ok) qmlDirs.push(query.stdout);
  }
  const libdir = run([pkgConfig, "--variable=libdir", "Qt6Core"], env).stdout;
  if (libdir) qmlDirs.push(join(libdir, "qt6", "qml"), join(libdir, "..", "share", "qt6", "qml"));
  return qmlDirs.some(dir => existsSync(join(dir, "org", "kde", "kirigami")));
}

/** Compiles the shim (cached) and returns the shared library path. */
export function buildQtShim(tc: QtToolchain): string {
  const source = readFileSync(shimSource, "utf8");
  const ext = process.platform === "win32" ? "dll" : process.platform === "darwin" ? "dylib" : "so";
  const key = Bun.hash(JSON.stringify([source, tc.variant, tc.cxx, tc.flags])).toString(16);
  const dir = join(tmpdir(), "bun-qt-window");
  const out = join(dir, `${tc.variant}-${key}.${ext}`);
  if (existsSync(out)) return out;
  mkdirSync(dir, { recursive: true });
  const partial = `${out}.${process.pid}.tmp`;
  const cmd = [tc.cxx, "-std=c++20", "-shared", "-O1", "-o", partial, shimSource, ...tc.flags];
  if (process.platform !== "win32") cmd.splice(3, 0, "-fPIC");
  if (tc.variant === "kirigami") cmd.splice(3, 0, "-DBUN_QT_KIRIGAMI");
  const result = run(cmd, tc.env);
  if (!result.ok) {
    rmSync(partial, { force: true });
    throw new Error(`building the Qt shim failed:\n$ ${cmd.join(" ")}\n${result.stderr}`);
  }
  renameSync(partial, out);
  return out;
}

const { ptr: p, i32, cstring } = FFIType;

/** Loads the shim, building it first if needed. Exits with status 2 and a reason if Qt is unavailable. */
export function loadQtShim(variant: QtVariant, shimPath?: string) {
  const tc = findQtToolchain(variant);
  if (typeof tc === "string") {
    console.error(`${variant === "qt" ? "qt" : "kde"}-window: ${tc}`);
    process.exit(2);
  }
  if (tc.binDir) prependDllSearchPath(tc.binDir);
  const path = shimPath || buildQtShim(tc);
  const signature = { args: [p, p, i32, i32, i32, p, p], returns: i32 } as const;
  const lib = dlopen(path, {
    bun_qt_version: { args: [], returns: cstring },
    bun_qt_window_run: signature,
    ...(variant === "kirigami" ? { bun_kirigami_window_run: signature } : {}),
  });
  const symbols = lib.symbols as unknown as Record<string, (...args: unknown[]) => unknown>;
  return {
    qtVersion: String(symbols.bun_qt_version()),
    run: symbols[variant === "qt" ? "bun_qt_window_run" : "bun_kirigami_window_run"] as (...args: unknown[]) => number,
  };
}

// The shim links against Qt DLLs that live next to MSYS2's g++, not next to the
// shim, so their directory has to be on this process's PATH before LoadLibrary.
function prependDllSearchPath(dir: string) {
  const { symbols } = dlopen("kernel32.dll", {
    SetEnvironmentVariableW: { args: [p, p], returns: i32 },
  });
  const wstr = (s: string) => Buffer.from(s + "\0", "utf16le");
  const current = process.env.PATH ?? process.env.Path ?? "";
  if (current.split(";").includes(dir)) return;
  const next = `${dir};${current}`;
  symbols.SetEnvironmentVariableW(wstr("PATH"), wstr(next));
  process.env.PATH = next;
}
