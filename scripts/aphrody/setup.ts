// One-command setup of an aphrody-labs/bun checkout: clone, toolchains, dependencies, first debug build.
//
//   bun scripts/aphrody/setup.ts [options]        set up the checkout this script lives in (or --dir)
//   bun setup.ts --dir ~/bun                      outside a checkout: clone aphrody-labs/bun there, then run its copy
//   bun scripts/aphrody/setup.ts deps [--write|--check]   the dependency inventory, scripts/aphrody/deps.json
//
// Options:
//   --dir <path>     checkout (default: this script's checkout, else $APHRODY_BUN_CHECKOUT, else ~/bun or C:\bun)
//   --ref <ref>      branch or tag to clone (default main)
//   --dry-run        print every step with its state and what it would run; changes nothing
//   --json           with --dry-run: the plan as JSON
//   --no-build       stop before `bun bd --version`
//   --no-system      skip system packages (apt/apk/brew/winget); toolchains still checked
//   --no-update      never fast-forward an existing checkout
//   --packages       also fetch the Cargo git dependencies of packages/* (our forks: oxc, pyo3, wry, ...)
//
// Each step checks its own result first, so a second run (or a run after a failure) only does what is
// missing. Downloads are verified with sha256 (rustup-init: its .sha256 file; LLVM: the release asset digest
// published by GitHub; bun: SHA256SUMS.txt of the fork release, in install.sh/install.ps1) and kept in a cache
// directory for the next run. The one-liner launchers are install-dev.sh and install-dev.ps1 next to this file.

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

const REPO = process.env.APHRODY_BUN_REPO ?? "aphrody-labs/bun";
const windows = process.platform === "win32";
const darwin = process.platform === "darwin";
const linux = process.platform === "linux";
const arm64 = process.arch === "arm64";
const scriptCheckout = resolve(import.meta.dir, "../..");

// ─── Options ────────────────────────────────────────────────────────────────

type Options = {
  command: "setup" | "deps";
  dir?: string;
  ref: string;
  dryRun: boolean;
  json: boolean;
  build: boolean;
  system: boolean;
  update: boolean;
  packages: boolean;
  write: boolean;
  check: boolean;
};

export function parseOptions(argv: string[]): Options {
  const o: Options = {
    command: "setup",
    ref: process.env.APHRODY_BUN_REF ?? "main",
    dryRun: false,
    json: false,
    build: true,
    system: true,
    update: true,
    packages: false,
    write: false,
    check: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      const v = a.includes("=") ? a.slice(a.indexOf("=") + 1) : argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === "deps") o.command = "deps";
    else if (a === "--dir" || a.startsWith("--dir=")) o.dir = resolve(value());
    else if (a === "--ref" || a.startsWith("--ref=")) o.ref = value();
    else if (a === "--dry-run" || a === "-n") o.dryRun = true;
    else if (a === "--json") o.json = true;
    else if (a === "--no-build") o.build = false;
    else if (a === "--no-system") o.system = false;
    else if (a === "--no-update") o.update = false;
    else if (a === "--packages") o.packages = true;
    else if (a === "--write") o.write = true;
    else if (a === "--check") o.check = true;
    else if (a === "--help" || a === "-h") {
      console.log(
        readFileSync(import.meta.path, "utf8")
          .split("\n\n")[0]
          .replace(/^\/\/ ?/gm, ""),
      );
      process.exit(0);
    } else throw new Error(`unknown argument ${a} (--help)`);
  }
  return o;
}

// ─── Small helpers ──────────────────────────────────────────────────────────

let dryRun = false;
const planned: string[] = [];

function log(message: string) {
  if (!jsonOutput) console.log(message);
}
let jsonOutput = false;

function quote(arg: string): string {
  return /^[\w@%+=:,./\\-]+$/.test(arg) ? arg : JSON.stringify(arg);
}

/** Runs a command with inherited stdio; in a dry run only records it. */
async function exec(cmd: string[], opts: { cwd?: string; env?: Record<string, string | undefined> } = {}) {
  const line = (opts.cwd ? `(cd ${quote(opts.cwd)}) ` : "") + cmd.map(quote).join(" ");
  planned.push(line);
  if (dryRun) return;
  log(`$ ${line}`);
  const proc = Bun.spawn(cmd, {
    cwd: opts.cwd,
    env: { ...process.env, ...opts.env },
    stdio: ["inherit", "inherit", "inherit"],
  });
  const code = await proc.exited;
  if (code !== 0) throw new Error(`${cmd[0]} exited with ${code}`);
}

/** Runs a command and returns its stdout, or undefined when it fails or does not exist. */
function capture(cmd: string[], cwd?: string): string | undefined {
  try {
    const r = Bun.spawnSync(cmd, { cwd, stdio: ["ignore", "pipe", "pipe"], env: process.env });
    return r.exitCode === 0 ? r.stdout.toString().trim() : undefined;
  } catch {
    return undefined;
  }
}

function which(name: string, extra: string[] = []): string | undefined {
  for (const dir of extra) {
    for (const file of windows ? [`${name}.exe`, `${name}.cmd`] : [name]) {
      const p = join(dir, file);
      if (existsSync(p)) return p;
    }
  }
  return Bun.which(name) ?? undefined;
}

function prependPath(dir: string) {
  const key = Object.keys(process.env).find(k => k.toUpperCase() === "PATH") ?? "PATH";
  const sep = windows ? ";" : ":";
  const parts = (process.env[key] ?? "").split(sep);
  if (!parts.some(p => p.toLowerCase() === dir.toLowerCase())) process.env[key] = [dir, ...parts].join(sep);
}

async function sha256File(path: string): Promise<string> {
  const hasher = new Bun.CryptoHasher("sha256");
  const stream = Bun.file(path).stream();
  for await (const chunk of stream) hasher.update(chunk);
  return hasher.digest("hex");
}

function githubHeaders(): Record<string, string> {
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  return {
    Accept: "application/vnd.github+json",
    "User-Agent": "aphrody-bun-setup",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

const cacheDir = join(process.env.BUN_INSTALL ?? join(homedir(), ".bun"), "setup-cache");

/** Downloads `url` into the setup cache unless a file with that sha256 is already there; returns its path. */
async function download(url: string, sha256: string): Promise<string> {
  const dest = join(cacheDir, `${sha256.slice(0, 16)}-${basename(new URL(url).pathname)}`);
  planned.push(`download ${url} (sha256 ${sha256})`);
  if (dryRun) return dest;
  if (existsSync(dest) && (await sha256File(dest)) === sha256) return dest;
  mkdirSync(cacheDir, { recursive: true });
  log(`download ${url}`);
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const part = `${dest}.part`;
      await Bun.write(part, res);
      const got = await sha256File(part);
      if (got !== sha256) {
        rmSync(part, { force: true });
        throw new Error(`sha256 mismatch for ${url}: expected ${sha256}, got ${got}`);
      }
      renameSync(part, dest);
      return dest;
    } catch (error) {
      lastError = error;
      if (String(error).includes("sha256 mismatch")) break;
    }
  }
  throw new Error(`download failed: ${url}: ${lastError}`);
}

// ─── Host ───────────────────────────────────────────────────────────────────

type Distro = { id: string; like: string[]; codename?: string };

function linuxDistro(): Distro | undefined {
  if (!linux) return undefined;
  let text = "";
  try {
    text = readFileSync("/etc/os-release", "utf8");
  } catch {}
  const field = (k: string) => text.match(new RegExp(`^${k}="?([^"\\n]*)"?$`, "m"))?.[1];
  return { id: field("ID") ?? "", like: (field("ID_LIKE") ?? "").split(/\s+/), codename: field("VERSION_CODENAME") };
}

const distro = linuxDistro();
const apt =
  !!distro &&
  (distro.id === "debian" || distro.id === "ubuntu" || distro.like.some(l => l === "debian" || l === "ubuntu"));
const alpine = !!distro && (distro.id === "alpine" || existsSync("/etc/alpine-release"));
const musl = alpine || (linux && /musl/i.test(capture(["ldd", "--version"]) ?? ""));

function sudo(): string[] {
  if (!linux && !darwin) return [];
  if (process.getuid?.() === 0) return [];
  if (Bun.which("sudo")) return ["sudo"];
  if (Bun.which("doas")) return ["doas"];
  throw new Error("system packages need root: run as root or install sudo");
}

// ─── Pins read from the checkout ────────────────────────────────────────────

type Pins = {
  llvm: string;
  rustChannel: string;
  msvcToolset: string;
  cmake: string;
  bun: string;
};

async function readPins(checkout: string): Promise<Pins> {
  const { pins } = await import(join(checkout, "scripts/build/ci-images/spec.ts"));
  const toolchain = readFileSync(join(checkout, "rust-toolchain.toml"), "utf8");
  const channel = toolchain.match(/^channel\s*=\s*"([^"]+)"/m)?.[1];
  if (!channel) throw new Error("rust-toolchain.toml has no channel");
  return {
    llvm: pins.llvm.version,
    rustChannel: channel,
    msvcToolset: pins.windowsSysroot.crt.split(".").slice(0, 2).join("."),
    cmake: pins.cmake.version,
    bun: pins.bun.version,
  };
}

// ─── Steps ──────────────────────────────────────────────────────────────────

type Step = {
  id: string;
  title: string;
  /** What is already there (step skipped), or undefined when the step has work to do. */
  check: () => Promise<string | undefined> | string | undefined;
  run: () => Promise<void>;
};

const cargoBin = join(process.env.CARGO_HOME ?? join(homedir(), ".cargo"), "bin");
const bunBin = join(process.env.BUN_INSTALL ?? join(homedir(), ".bun"), "bin");

function bunExe(): string {
  return which("bun", [bunBin]) ?? process.execPath;
}

function isForkBun(bun: string): boolean {
  // The fork resolves these npm names to built-in modules (src/js/thirdparty); upstream Bun cannot.
  const out = capture(
    [bun, "-e", "await import('picocolors'); await import('tiny-invariant'); console.log('aphrody')"],
    tmpdir(),
  );
  return out === "aphrody";
}

function llvmMajorMinor(version: string) {
  const [major, minor] = version.split(".");
  return { major, minor, series: `${major}.${minor}` };
}

function clangVersion(clang: string | undefined): string | undefined {
  if (!clang) return undefined;
  return capture([clang, "--version"])?.match(/clang version (\d+\.\d+\.\d+)/)?.[1];
}

function aptPackagesMissing(pkgs: string[]): string[] {
  return pkgs.filter(p => capture(["dpkg-query", "-W", "-f=${Status}", p])?.includes("install ok installed") !== true);
}

function apkPackagesMissing(pkgs: string[]): string[] {
  return pkgs.filter(p => capture(["apk", "info", "-e", p.replace(/@.*$/, "")]) === undefined);
}

const APT_PACKAGES = [
  "build-essential",
  "cmake",
  "git",
  "curl",
  "ca-certificates",
  "gnupg",
  "unzip",
  "xz-utils",
  "zstd",
  "pkg-config",
  "nasm",
  "ccache",
  "python3",
  "file",
];
const APK_PACKAGES = [
  "build-base",
  "linux-headers",
  "cmake",
  "git",
  "curl",
  "ca-certificates",
  "unzip",
  "xz",
  "zstd",
  "pkgconf",
  "nasm",
  "ccache",
  "python3",
  "bash",
  "libstdc++",
  "libgcc",
  "file",
];
const BREW_PACKAGES = ["cmake", "ccache", "nasm", "pkg-config", "git"];
const WINGET_PACKAGES: { id: string; exe: string; dirs: string[] }[] = [
  { id: "Git.Git", exe: "git", dirs: ["C:\\Program Files\\Git\\cmd"] },
  { id: "Kitware.CMake", exe: "cmake", dirs: ["C:\\Program Files\\CMake\\bin"] },
  { id: "NASM.NASM", exe: "nasm", dirs: ["C:\\Program Files\\NASM"] },
  { id: "Microsoft.PowerShell", exe: "pwsh", dirs: ["C:\\Program Files\\PowerShell\\7"] },
];

/** apt.llvm.org's signing key (llvm-snapshot.gpg.key). */
const APT_LLVM_KEY_FINGERPRINT = "6084F3CF814B57C1CF12EFD515CF4D18AF4F7421";

function systemStep(): Step {
  if (windows)
    return {
      id: "system",
      title: "Git, CMake, NASM, PowerShell 7 (winget)",
      check() {
        const missing = WINGET_PACKAGES.filter(p => !which(p.exe, p.dirs));
        for (const p of WINGET_PACKAGES) {
          const found = which(p.exe, p.dirs);
          if (found) prependPath(dirname(found));
        }
        return missing.length === 0 ? WINGET_PACKAGES.map(p => p.exe).join(", ") : undefined;
      },
      async run() {
        if (!Bun.which("winget")) throw new Error("winget is missing: install App Installer from the Microsoft Store");
        for (const p of WINGET_PACKAGES) {
          if (which(p.exe, p.dirs)) continue;
          await exec([
            "winget",
            "install",
            "--id",
            p.id,
            "-e",
            "--silent",
            "--accept-package-agreements",
            "--accept-source-agreements",
          ]);
          for (const d of p.dirs) if (existsSync(d)) prependPath(d);
        }
      },
    };
  if (darwin)
    return {
      id: "system",
      title: "Xcode Command Line Tools, Homebrew packages",
      check() {
        if (!capture(["xcode-select", "-p"]) || !Bun.which("brew")) return undefined;
        const missing = BREW_PACKAGES.filter(p => capture(["brew", "list", "--versions", p]) === undefined);
        return missing.length === 0 ? BREW_PACKAGES.join(", ") : undefined;
      },
      async run() {
        if (!capture(["xcode-select", "-p"])) {
          await exec(["xcode-select", "--install"]);
          throw new Error("Install the Xcode Command Line Tools from the dialog, then run the setup again");
        }
        if (!Bun.which("brew")) {
          throw new Error(
            'Homebrew is missing: /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)", then run the setup again',
          );
        }
        await exec(["brew", "install", ...BREW_PACKAGES]);
      },
    };
  if (apt)
    return {
      id: "system",
      title: "Build packages (apt)",
      check() {
        const missing = aptPackagesMissing(APT_PACKAGES);
        return missing.length === 0 ? `${APT_PACKAGES.length} packages` : undefined;
      },
      async run() {
        const env = { DEBIAN_FRONTEND: "noninteractive" };
        await exec([...sudo(), "apt-get", "update"], { env });
        await exec(
          [
            ...sudo(),
            "env",
            "DEBIAN_FRONTEND=noninteractive",
            "apt-get",
            "install",
            "-y",
            "--no-install-recommends",
            ...aptPackagesMissing(APT_PACKAGES),
          ],
          { env },
        );
      },
    };
  if (alpine)
    return {
      id: "system",
      title: "Build packages (apk)",
      check() {
        const missing = apkPackagesMissing(APK_PACKAGES);
        return missing.length === 0 ? `${APK_PACKAGES.length} packages` : undefined;
      },
      async run() {
        await exec([...sudo(), "apk", "add", "--no-cache", ...apkPackagesMissing(APK_PACKAGES)]);
      },
    };
  return {
    id: "system",
    title: "Build packages",
    check: () => undefined,
    async run() {
      throw new Error(
        `unsupported system ${distro?.id ?? process.platform}: install git, cmake, nasm, a C/C++ toolchain, then rerun with --no-system`,
      );
    },
  };
}

function llvmStep(pins: Pins): Step {
  const { major, series } = llvmMajorMinor(pins.llvm);
  const inSeries = (v: string | undefined) => v !== undefined && v.startsWith(`${series}.`);
  const winDir = join(process.env.LOCALAPPDATA ?? homedir(), "bun", "toolchain", `llvm-${pins.llvm}`);
  const candidates = (): (string | undefined)[] => {
    if (process.env.BUN_TOOLCHAIN_LLVM)
      return [join(process.env.BUN_TOOLCHAIN_LLVM, "bin", windows ? "clang-cl.exe" : "clang")];
    if (windows) return [join(winDir, "bin", "clang-cl.exe"), "C:\\Program Files\\LLVM\\bin\\clang-cl.exe"];
    if (darwin) return [`${capture(["brew", "--prefix"]) ?? "/opt/homebrew"}/opt/llvm@${major}/bin/clang`];
    return [
      `/usr/lib/llvm-${major}/bin/clang`,
      `/usr/lib/llvm${major}/bin/clang`,
      Bun.which(`clang-${major}`) ?? undefined,
    ];
  };
  return {
    id: "llvm",
    title: `LLVM ${series}.x (clang, lld, llvm-ar; scripts/build pins ${pins.llvm})`,
    check() {
      for (const c of candidates()) {
        if (c && existsSync(c) && inSeries(clangVersion(c))) {
          if (windows && c.startsWith(winDir) && !process.env.BUN_TOOLCHAIN_LLVM)
            process.env.BUN_TOOLCHAIN_LLVM = winDir;
          return `${c} ${clangVersion(c)}`;
        }
      }
      return undefined;
    },
    async run() {
      if (windows) {
        const triple = arm64 ? "aarch64-pc-windows-msvc" : "x86_64-pc-windows-msvc";
        const name = `clang+llvm-${pins.llvm}-${triple}.tar.xz`;
        const res = await fetch(`https://api.github.com/repos/llvm/llvm-project/releases/tags/llvmorg-${pins.llvm}`, {
          headers: githubHeaders(),
        });
        if (!res.ok) throw new Error(`llvm-project release llvmorg-${pins.llvm}: HTTP ${res.status}`);
        const release = (await res.json()) as {
          assets: { name: string; browser_download_url: string; digest?: string }[];
        };
        const asset = release.assets.find(a => a.name === name);
        const digest = asset?.digest?.replace(/^sha256:/, "");
        if (!asset || !digest) throw new Error(`llvmorg-${pins.llvm} has no ${name} with a sha256 digest`);
        const archive = await download(asset.browser_download_url, digest);
        const staging = `${winDir}.extract`;
        if (!dryRun) {
          rmSync(staging, { recursive: true, force: true });
          mkdirSync(staging, { recursive: true });
        }
        // System32 bsdtar reads .tar.xz; Git for Windows' tar would take "C:" for a remote host.
        await exec([
          join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe"),
          "-xf",
          archive,
          "-C",
          staging,
        ]);
        if (!dryRun) {
          const top = readdirSync(staging).find(d => d.startsWith("clang+llvm"));
          if (!top) throw new Error(`${name}: unexpected layout`);
          rmSync(winDir, { recursive: true, force: true });
          renameSync(join(staging, top), winDir);
          rmSync(staging, { recursive: true, force: true });
        }
        process.env.BUN_TOOLCHAIN_LLVM = winDir;
        await exec([
          "powershell",
          "-NoProfile",
          "-Command",
          `[Environment]::SetEnvironmentVariable('BUN_TOOLCHAIN_LLVM', '${winDir}', 'User')`,
        ]);
        return;
      }
      if (darwin) {
        await exec(["brew", "install", `llvm@${major}`]);
        return;
      }
      if (alpine) {
        // Alpine 3.24 ships LLVM 22; LLVM 23 comes from edge/main under the @edge tag.
        const repos = readFileSync("/etc/apk/repositories", "utf8");
        if (!/^@edge\s/m.test(repos)) {
          await exec([
            ...sudo(),
            "sh",
            "-c",
            "echo '@edge https://dl-cdn.alpinelinux.org/alpine/edge/main' >> /etc/apk/repositories",
          ]);
        }
        await exec([
          ...sudo(),
          "apk",
          "add",
          "--no-cache",
          ...[
            `clang${major}`,
            `lld${major}`,
            `llvm${major}`,
            `llvm${major}-linker-tools`,
            "compiler-rt",
            "llvm-runtimes",
          ].map(p => `${p}@edge`),
        ]);
        return;
      }
      if (!apt) throw new Error(`install LLVM ${pins.llvm} (clang, lld, llvm-ar) yourself, then rerun the setup`);
      const codename = distro?.codename;
      if (!codename) throw new Error("/etc/os-release has no VERSION_CODENAME");
      // apt.llvm.org signs with a SHA-1 key, refused by apt's sqv verifier since 2026-02-01 (llvm/llvm-project#153385):
      // same exception as the CI images and scripts/aphrody/linux.Dockerfile.
      const sequoia = "/usr/share/apt/default-sequoia.config";
      if (existsSync(sequoia)) {
        await exec([
          ...sudo(),
          "sh",
          "-c",
          `mkdir -p /etc/crypto-policies/back-ends && sed 's/sha1.second_preimage_resistance = 2026-02-01/sha1.second_preimage_resistance = 2028-02-01/' ${sequoia} > /etc/crypto-policies/back-ends/apt-sequoia.config`,
        ]);
      }
      const keyring = "/usr/share/keyrings/apt.llvm.org.gpg";
      if (!existsSync(keyring)) {
        const key = join(tmpdir(), "apt.llvm.org.asc");
        planned.push(`download https://apt.llvm.org/llvm-snapshot.gpg.key (fingerprint ${APT_LLVM_KEY_FINGERPRINT})`);
        if (!dryRun) {
          const res = await fetch("https://apt.llvm.org/llvm-snapshot.gpg.key");
          if (!res.ok) throw new Error(`apt.llvm.org key: HTTP ${res.status}`);
          await Bun.write(key, res);
          const fpr = capture(["gpg", "--show-keys", "--with-colons", key])?.match(/^fpr:+([0-9A-F]+):/m)?.[1];
          if (fpr !== APT_LLVM_KEY_FINGERPRINT)
            throw new Error(`apt.llvm.org key fingerprint ${fpr} != ${APT_LLVM_KEY_FINGERPRINT}`);
        }
        await exec([...sudo(), "gpg", "--batch", "--yes", "--dearmor", "-o", keyring, key]);
      }
      const list = `deb [signed-by=${keyring}] https://apt.llvm.org/${codename}/ llvm-toolchain-${codename}-${major} main`;
      await exec([...sudo(), "sh", "-c", `echo '${list}' > /etc/apt/sources.list.d/llvm-${major}.list`]);
      await exec([...sudo(), "apt-get", "update"]);
      await exec([
        ...sudo(),
        "env",
        "DEBIAN_FRONTEND=noninteractive",
        "apt-get",
        "install",
        "-y",
        "--no-install-recommends",
        `clang-${major}`,
        `lld-${major}`,
        `llvm-${major}`,
        `llvm-${major}-tools`,
        `libclang-rt-${major}-dev`,
      ]);
    },
  };
}

function rustupTriple(): string {
  const cpu = arm64 ? "aarch64" : "x86_64";
  if (windows) return `${cpu}-pc-windows-msvc`;
  if (darwin) return `${cpu}-apple-darwin`;
  return `${cpu}-unknown-linux-${musl ? "musl" : "gnu"}`;
}

function rustupStep(): Step {
  return {
    id: "rustup",
    title: "rustup",
    check() {
      const rustup = which("rustup", [cargoBin]);
      if (!rustup) return undefined;
      prependPath(dirname(rustup));
      return capture([rustup, "--version"])?.split("\n")[0];
    },
    async run() {
      const triple = rustupTriple();
      const exe = windows ? "rustup-init.exe" : "rustup-init";
      const url = `https://static.rust-lang.org/rustup/dist/${triple}/${exe}`;
      const res = await fetch(`${url}.sha256`);
      if (!res.ok) throw new Error(`${url}.sha256: HTTP ${res.status}`);
      const sha = (await res.text()).trim().split(/\s+/)[0];
      const init = await download(url, sha);
      if (!windows && !dryRun) Bun.spawnSync(["chmod", "+x", init]);
      await exec([init, "-y", "--profile", "minimal", "--default-toolchain", "none"]);
      prependPath(cargoBin);
    },
  };
}

function rustToolchainStep(checkout: string, pins: Pins): Step {
  return {
    id: "rust-toolchain",
    title: `Rust ${pins.rustChannel} (rust-toolchain.toml)`,
    check() {
      const rustup = which("rustup", [cargoBin]);
      if (!rustup) return undefined;
      // `rustup toolchain list` never installs anything, unlike `rustup run` under rustup's auto-install.
      const installed = (capture([rustup, "toolchain", "list"]) ?? "")
        .split("\n")
        .some(l => l.startsWith(`${pins.rustChannel}-`));
      if (!installed) return undefined;
      const components = capture([rustup, "component", "list", "--installed", "--toolchain", pins.rustChannel]) ?? "";
      return components.includes("rust-src") ? `${pins.rustChannel} with rust-src` : undefined;
    },
    async run() {
      const rustup = which("rustup", [cargoBin]) ?? "rustup";
      // In the checkout, with no argument, rustup installs the toolchain rust-toolchain.toml names, with its
      // components and targets.
      await exec([rustup, "toolchain", "install"], { cwd: checkout });
    },
  };
}

function bunStep(): Step {
  return {
    id: "bun",
    title: "Bun of the fork (aphrody-labs/bun releases)",
    check() {
      const bun = which("bun", [bunBin]);
      if (!bun || !isForkBun(bun)) return undefined;
      prependPath(dirname(bun));
      return `${bun} ${capture([bun, "--revision"])}`;
    },
    async run() {
      const script = join(scriptCheckout, "scripts/aphrody", windows ? "install.ps1" : "install.sh");
      if (windows) await exec(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script]);
      else await exec(["bash", script]);
      prependPath(bunBin);
    },
  };
}

function msvcStep(checkout: string, pins: Pins): Step {
  const selection = [
    "--arch",
    arm64 ? "arm64" : "x64",
    ...(arm64 ? ["--host", "x64"] : []),
    "--toolset",
    pins.msvcToolset,
  ];
  const msvc = (args: string[]): string[] => {
    const bun = bunExe();
    if (capture([bun, "msvc", "--help"]) !== undefined) return [bun, "msvc", ...args];
    const manifest = join(checkout, "vendor/find-msvc-tools/Cargo.toml");
    return ["cargo", "run", "--quiet", "--manifest-path", manifest, "--bin", "bun-msvc", "--", ...args];
  };
  return {
    id: "msvc",
    title: `MSVC ${pins.msvcToolset} + Windows SDK (bun msvc setup)`,
    check() {
      const r = Bun.spawnSync(msvc(["doctor", ...selection]), {
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, BUN_BE_BUN: "1" },
      });
      return r.exitCode === 0 ? `toolset ${pins.msvcToolset}` : undefined;
    },
    async run() {
      await exec(msvc(["setup", ...selection]), { env: { BUN_BE_BUN: "1" } });
    },
  };
}

function bunInstallStep(checkout: string): Step {
  return {
    id: "bun-install",
    title: "JS dependencies of the checkout (bun install)",
    check: () => undefined,
    async run() {
      await exec([bunExe(), "install"], { cwd: checkout });
    },
  };
}

function vendorStep(checkout: string): Step {
  return {
    id: "vendor",
    title: "Native dependencies (vendor/*, WebKit prebuilt, Node.js headers) at their pinned commits",
    check: () => undefined,
    async run() {
      const bun = bunExe();
      await exec([bun, "scripts/build.ts", "--profile=debug", "--configure-only"], { cwd: checkout });
      let targets: string[] = [];
      if (!dryRun) {
        const out = capture([bun, "scripts/build.ts", "--profile=debug", "-t", "targets", "all"], checkout) ?? "";
        targets = [
          ...new Set(
            out
              .split("\n")
              .map(l => l.split(":")[0].trim())
              .filter(t => /^clone-[\w.-]+$/.test(t)),
          ),
        ];
        if (targets.length === 0) throw new Error("build.ninja lists no clone-* target");
      } else targets = ["clone-<dep>…"];
      await exec([bun, "scripts/build.ts", "--profile=debug", ...targets.map(t => `--target=${t}`)], { cwd: checkout });
    },
  };
}

function packagesStep(checkout: string): Step {
  return {
    id: "packages",
    title: "Cargo git dependencies of packages/* (forks oxc, pyo3, wry, ...)",
    check: () => undefined,
    async run() {
      const inventory = (await Bun.file(join(checkout, "scripts/aphrody/deps.json")).json()) as Inventory;
      const manifests = new Set<string>();
      for (const d of inventory.dependencies) {
        if (d.kind !== "cargo-git") continue;
        if (d.visibility === "PRIVATE") {
          log(`skip ${d.repo} (private): ${d.usedBy.join(", ")}`);
          continue;
        }
        for (const m of d.usedBy) manifests.add(m);
      }
      for (const d of inventory.dependencies) {
        if (d.kind === "cargo-git" && d.visibility === "PRIVATE") for (const m of d.usedBy) manifests.delete(m);
      }
      for (const m of [...manifests].sort()) {
        await exec(["cargo", "fetch", "--manifest-path", m], { cwd: checkout });
      }
    },
  };
}

function buildStep(checkout: string): Step {
  return {
    id: "build",
    title: "Debug build and smoke run (bun bd --version)",
    check: () => undefined,
    async run() {
      await exec([bunExe(), "run", "bd", "--version"], { cwd: checkout });
    },
  };
}

// ─── Checkout ───────────────────────────────────────────────────────────────

function isCheckout(dir: string): boolean {
  return existsSync(join(dir, "scripts/build.ts")) && existsSync(join(dir, "scripts/aphrody/setup.ts"));
}

function defaultDir(): string {
  if (process.env.APHRODY_BUN_CHECKOUT) return resolve(process.env.APHRODY_BUN_CHECKOUT);
  return windows ? "C:\\bun" : join(homedir(), "bun");
}

async function ensureGit(o: Options) {
  if (Bun.which("git") || which("git", ["C:\\Program Files\\Git\\cmd"])) {
    const g = which("git", ["C:\\Program Files\\Git\\cmd"]);
    if (g) prependPath(dirname(g));
    return;
  }
  if (!o.system) throw new Error("git is missing (and --no-system was given)");
  if (windows)
    await exec([
      "winget",
      "install",
      "--id",
      "Git.Git",
      "-e",
      "--silent",
      "--accept-package-agreements",
      "--accept-source-agreements",
    ]);
  else if (darwin) await exec(["xcode-select", "--install"]);
  else if (apt) {
    await exec([...sudo(), "apt-get", "update"]);
    await exec([
      ...sudo(),
      "env",
      "DEBIAN_FRONTEND=noninteractive",
      "apt-get",
      "install",
      "-y",
      "--no-install-recommends",
      "git",
      "ca-certificates",
    ]);
  } else if (alpine) await exec([...sudo(), "apk", "add", "--no-cache", "git"]);
  else throw new Error("install git, then rerun the setup");
  prependPath("C:\\Program Files\\Git\\cmd");
}

/** Clones or fast-forwards `dir`; returns true when it holds a checkout afterwards. */
async function ensureCheckout(o: Options, dir: string): Promise<void> {
  await ensureGit(o);
  if (!existsSync(join(dir, ".git"))) {
    if (existsSync(dir) && readdirSync(dir).length > 0) throw new Error(`${dir} exists and is not a git checkout`);
    await exec(["git", "clone", "--filter=blob:none", "--branch", o.ref, `https://github.com/${REPO}.git`, dir]);
    return;
  }
  if (!o.update) return;
  const branch = capture(["git", "-C", dir, "symbolic-ref", "--quiet", "--short", "HEAD"]);
  const dirty = capture(["git", "-C", dir, "status", "--porcelain", "--untracked-files=no"]);
  if (!branch || dirty) {
    log(`${dir}: ${branch ? "local changes" : "detached HEAD"}, left as is`);
    return;
  }
  await exec(["git", "-C", dir, "pull", "--ff-only", "--quiet"]);
}

// ─── Inventory (deps.json) ──────────────────────────────────────────────────

export type Dependency = {
  /** owner/name on GitHub, or a host for non-GitHub downloads. */
  repo: string;
  kind: "self" | "github-archive" | "prebuilt" | "cargo-git" | "in-tree" | "provenance" | "toolchain";
  /** Commit, tag, branch or version the checkout pins. */
  ref: string;
  /** Who needs it: build (bun bd), setup, or the manifests/files that reference it. */
  usedBy: string[];
  /** Fork of ours (aphrody-labs) or third party. */
  internal: boolean;
  /** GitHub visibility when the inventory was written (`gh repo view`); undefined for non-GitHub sources. */
  visibility?: "PUBLIC" | "PRIVATE" | "INTERNAL";
  note?: string;
};
export type Inventory = { comment: string; dependencies: Dependency[] };

export async function collectDependencies(checkout: string): Promise<Dependency[]> {
  const deps: Dependency[] = [];
  const add = (d: Omit<Dependency, "internal">) =>
    deps.push({ ...d, internal: d.repo.startsWith("aphrody-labs/") } as Dependency);
  const pins = await readPins(checkout);
  const { pins: allPins } = await import(join(checkout, "scripts/build/ci-images/spec.ts"));

  add({
    repo: REPO,
    kind: "self",
    ref: "main (releases aphrody-v*)",
    usedBy: ["setup", "scripts/aphrody/install.sh", "scripts/aphrody/install.ps1"],
  });

  const depsDir = join(checkout, "scripts/build/deps");
  for (const file of readdirSync(depsDir)
    .filter(f => f.endsWith(".ts"))
    .sort()) {
    const text = readFileSync(join(depsDir, file), "utf8");
    const rel = `scripts/build/deps/${file}`;
    if (file === "webkit.ts") {
      const version = text.match(/export const WEBKIT_VERSION = "([0-9a-f]{40})"/)?.[1];
      if (!version) throw new Error(`${rel}: no WEBKIT_VERSION`);
      const aphrody = text.match(/WEBKIT_APHRODY_REPO = "([^"]+)"/)?.[1] ?? "aphrody-labs/WebKit";
      const upstream = text.match(/WEBKIT_UPSTREAM_REPO = "([^"]+)"/)?.[1] ?? "oven-sh/WebKit";
      add({
        repo: aphrody,
        kind: "prebuilt",
        ref: `autobuild-${version}`,
        usedBy: ["build", rel],
        note: "release assets bun-webkit-<os>-<arch>[-musl][-debug|-lto][-asan].tar.gz when published for this sha",
      });
      add({
        repo: upstream,
        kind: "prebuilt",
        ref: `autobuild-${version}`,
        usedBy: ["build", rel],
        note: "fallback for the prebuilts aphrody-labs/WebKit does not publish",
      });
      continue;
    }
    if (file === "nodejs-headers.ts") {
      add({
        repo: "nodejs.org",
        kind: "prebuilt",
        ref: `v${allPins.nodejs.version}`,
        usedBy: ["build", rel],
        note: "node-v<version>-headers.tar.gz",
      });
      continue;
    }
    const repo = text.match(/^\s*repo:\s*"([^"]+)"/m)?.[1];
    const commit = text.match(/const \w+_COMMIT = "([0-9a-f]{40})"/)?.[1];
    if (repo && commit) {
      add({ repo, kind: "github-archive", ref: commit, usedBy: ["build", rel] });
      continue;
    }
    const inTree = text.match(/kind:\s*"in-tree",\s*path:\s*"([^"]+)"/)?.[1];
    if (inTree) add({ repo: inTree, kind: "in-tree", ref: "checkout", usedBy: ["build", rel] });
  }
  for (const dir of ["vendor/find-msvc-tools", "vendor/windows-rs"]) {
    if (existsSync(join(checkout, dir))) add({ repo: dir, kind: "in-tree", ref: "checkout", usedBy: ["build"] });
  }

  // Cargo git dependencies outside the root workspace (its Cargo.lock has none).
  const gitDeps = new Map<string, Dependency>();
  const glob = new Bun.Glob("packages/**/Cargo.toml");
  for (const manifest of [...glob.scanSync({ cwd: checkout })].map(p => p.replaceAll("\\", "/")).sort()) {
    if (/\/(fixtures?|test|tests|node_modules|target)\//.test(manifest)) continue;
    const text = readFileSync(join(checkout, manifest), "utf8");
    for (const line of text.split("\n")) {
      if (line.trimStart().startsWith("#")) continue;
      const url = line.match(/git\s*=\s*"https:\/\/github\.com\/([^"]+?)(?:\.git)?"/)?.[1];
      if (!url) continue;
      const ref =
        line.match(/rev\s*=\s*"([^"]+)"/)?.[1] ??
        line.match(/branch\s*=\s*"([^"]+)"/)?.[1] ??
        line.match(/tag\s*=\s*"([^"]+)"/)?.[1] ??
        "default branch";
      const key = `${url}@${ref}`;
      const d =
        gitDeps.get(key) ??
        ({ repo: url, kind: "cargo-git", ref, usedBy: [], internal: url.startsWith("aphrody-labs/") } as Dependency);
      if (!d.usedBy.includes(manifest)) d.usedBy.push(manifest);
      gitDeps.set(key, d);
    }
  }
  deps.push(...gitDeps.values());

  // packages/buv embeds forks through vendor/ (uv) and records the others it was built from.
  const buv = join(checkout, "packages/buv/vendor.json");
  if (existsSync(buv)) {
    const vendor = JSON.parse(readFileSync(buv, "utf8")) as { sources: { name: string; url?: string; ref?: string }[] };
    for (const s of vendor.sources) {
      const repo = s.url?.match(/github\.com\/([^/]+\/[^/.]+)/)?.[1];
      if (repo && s.ref)
        add({ repo, kind: "in-tree", ref: s.ref, usedBy: ["packages/buv/vendor.json"], note: `source of ${s.name}` });
    }
    const manifest = JSON.parse(readFileSync(join(checkout, "packages/buv/buv.json"), "utf8")) as {
      predecessor?: { repository: string; revision: string };
    };
    const p = manifest.predecessor;
    if (p) {
      add({
        repo: p.repository,
        kind: "provenance",
        ref: p.revision,
        usedBy: ["packages/buv/buv.json"],
        note: "code packages/buv was absorbed from; not fetched",
      });
    }
  }

  const ninja = allPins.bunNinja as { tag: string };
  add({
    repo: "oven-sh/ninja",
    kind: "toolchain",
    ref: ninja.tag,
    usedBy: ["build", "scripts/build/ci-images/spec.ts"],
    note: "downloaded by scripts/build with pinned sha256",
  });
  add({
    repo: "llvm/llvm-project",
    kind: "toolchain",
    ref: `llvmorg-${pins.llvm}`,
    usedBy: ["setup", "build"],
    note: "apt.llvm.org (Debian/Ubuntu), edge/main (Alpine), brew llvm@N (macOS), release tarball (Windows)",
  });
  add({
    repo: "rust-lang/rustup",
    kind: "toolchain",
    ref: pins.rustChannel,
    usedBy: ["setup", "build", "rust-toolchain.toml"],
    note: "rustup-init from static.rust-lang.org (sha256), toolchain from rust-toolchain.toml",
  });
  add({
    repo: "Kitware/CMake",
    kind: "toolchain",
    ref: `>=3.24 (CI ${pins.cmake})`,
    usedBy: ["setup", "build"],
    note: "system package",
  });
  add({
    repo: "microsoft/MSVC",
    kind: "toolchain",
    ref: `toolset ${pins.msvcToolset}, SDK ${allPins.windowsSysroot.sdk}`,
    usedBy: ["setup (Windows)", "build"],
    note: "bun msvc setup (Visual Studio Installer / winget)",
  });
  return deps;
}

async function visibilityOf(repo: string): Promise<Dependency["visibility"]> {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || repo.startsWith("vendor/")) return undefined;
  const gh = Bun.which("gh");
  if (gh) {
    const out = capture([gh, "repo", "view", repo, "--json", "visibility", "-q", ".visibility"]);
    if (out === "PUBLIC" || out === "PRIVATE" || out === "INTERNAL") return out;
  }
  const res = await fetch(`https://api.github.com/repos/${repo}`, { headers: githubHeaders() });
  if (res.ok) return ((await res.json()) as { private: boolean }).private ? "PRIVATE" : "PUBLIC";
  return undefined;
}

const INVENTORY_COMMENT =
  "Every external and internal dependency of the aphrody-labs/bun build, generated by `bun scripts/aphrody/setup.ts deps --write` (visibility from `gh repo view`); `deps --check` fails when the sources pin something else.";

const keyOf = (d: Dependency) => `${d.kind} ${d.repo}@${d.ref} ${d.usedBy.join(",")}`;

async function depsCommand(o: Options, checkout: string) {
  const path = join(checkout, "scripts/aphrody/deps.json");
  const fresh = await collectDependencies(checkout);
  const previous: Inventory | undefined = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : undefined;
  if (o.check) {
    const want = new Set(fresh.map(keyOf));
    const have = new Set((previous?.dependencies ?? []).map(keyOf));
    const missing = [...want].filter(k => !have.has(k));
    const stale = [...have].filter(k => !want.has(k));
    if (missing.length || stale.length) {
      for (const k of missing) console.error(`missing from deps.json: ${k}`);
      for (const k of stale) console.error(`stale in deps.json: ${k}`);
      console.error("run: bun scripts/aphrody/setup.ts deps --write");
      process.exit(1);
    }
    console.log(`deps.json: ${fresh.length} dependencies, in sync`);
    return;
  }
  const known = new Map((previous?.dependencies ?? []).map(d => [d.repo, d.visibility]));
  for (const d of fresh) {
    d.visibility = (await visibilityOf(d.repo)) ?? known.get(d.repo);
    if (d.visibility === undefined) delete d.visibility;
  }
  const inventory: Inventory = { comment: INVENTORY_COMMENT, dependencies: fresh };
  if (o.write) {
    await Bun.write(path, JSON.stringify(inventory, null, 2) + "\n");
    console.log(`wrote ${path} (${fresh.length} dependencies)`);
  } else console.log(JSON.stringify(inventory, null, 2));
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const o = parseOptions(process.argv.slice(2));
  dryRun = o.dryRun;
  jsonOutput = o.json && o.dryRun;

  if (o.command === "deps") return depsCommand(o, scriptCheckout);

  const dir = o.dir ?? (isCheckout(scriptCheckout) ? scriptCheckout : defaultDir());
  if (resolve(dir) !== scriptCheckout || !isCheckout(dir)) {
    // Standalone copy (downloaded by install-dev.sh/.ps1): clone, then hand over to the checkout's own setup.ts.
    await ensureCheckout(o, dir);
    if (dryRun) {
      for (const line of planned) log(`    ${line}`);
      log(`would run ${join(dir, "scripts/aphrody/setup.ts")} ${process.argv.slice(2).join(" ")}`);
      if (!isCheckout(dir)) return;
    }
    const args = process.argv
      .slice(2)
      .filter((a, i, all) => !(a === "--dir" || a.startsWith("--dir=") || all[i - 1] === "--dir"));
    const proc = Bun.spawn(
      [process.execPath, join(dir, "scripts/aphrody/setup.ts"), ...args, "--dir", dir, "--no-update"],
      {
        stdio: ["inherit", "inherit", "inherit"],
      },
    );
    process.exit(await proc.exited);
  }

  if (o.update && !dryRun) await ensureCheckout(o, dir);
  const pins = await readPins(dir);
  const steps: Step[] = [];
  if (o.system) steps.push(systemStep());
  steps.push(bunStep(), llvmStep(pins), rustupStep(), rustToolchainStep(dir, pins));
  if (windows) steps.push(msvcStep(dir, pins));
  steps.push(bunInstallStep(dir), vendorStep(dir));
  if (o.packages) steps.push(packagesStep(dir));
  if (o.build) steps.push(buildStep(dir));

  const report: { id: string; title: string; done?: string; commands: string[] }[] = [];
  log(
    `aphrody-labs/bun setup: ${dir} (${process.platform}-${process.arch}${musl ? "-musl" : ""}${distro ? `, ${distro.id}` : ""})`,
  );
  for (const step of steps) {
    const done = await step.check();
    planned.length = 0;
    if (done !== undefined) {
      log(`✓ ${step.title}: ${done}`);
      report.push({ id: step.id, title: step.title, done, commands: [] });
      continue;
    }
    log(`${dryRun ? "·" : "→"} ${step.title}`);
    await step.run();
    if (dryRun) for (const line of planned) log(`    ${line}`);
    report.push({ id: step.id, title: step.title, commands: [...planned] });
    if (!dryRun) {
      const after = await step.check();
      if (after === undefined && !["bun-install", "vendor", "packages", "build"].includes(step.id)) {
        throw new Error(`${step.title}: still missing after the step ran`);
      }
    }
  }
  if (jsonOutput)
    console.log(JSON.stringify({ dir, platform: `${process.platform}-${process.arch}`, steps: report }, null, 2));
  else log(dryRun ? "dry run: nothing changed" : `done: ${dir}`);
}

if (import.meta.main) {
  main().catch(error => {
    console.error(`setup: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  });
}
