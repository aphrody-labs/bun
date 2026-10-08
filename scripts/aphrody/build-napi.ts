// Builds the Node-API addon of a fork-only native package (packages/bun-n2b,
// packages/bun-oxc) and copies it next to the package as
// `<napi.name>.<platform>.node`, the file the package's loader and the
// per-platform npm packages (scripts/aphrody/publish-native.ts) look for.
//
//   bun scripts/aphrody/build-napi.ts <package-dir> [--target <rust-triple>] [--debug] [--out <dir>]
//
// The package.json of <package-dir> declares `"napi": { "name": "...", "crate": "..." }`.

import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "../..");

export interface Platform {
  /** napi-rs style key: `win32-x64-msvc`, `linux-arm64-gnu`, `darwin-arm64`. */
  key: string;
  triple: string;
  os: string;
  cpu: string;
  libc?: "glibc" | "musl";
}

export const PLATFORMS: Platform[] = [
  { key: "win32-x64-msvc", triple: "x86_64-pc-windows-msvc", os: "win32", cpu: "x64" },
  { key: "win32-arm64-msvc", triple: "aarch64-pc-windows-msvc", os: "win32", cpu: "arm64" },
  { key: "darwin-x64", triple: "x86_64-apple-darwin", os: "darwin", cpu: "x64" },
  { key: "darwin-arm64", triple: "aarch64-apple-darwin", os: "darwin", cpu: "arm64" },
  { key: "linux-x64-gnu", triple: "x86_64-unknown-linux-gnu", os: "linux", cpu: "x64", libc: "glibc" },
  { key: "linux-arm64-gnu", triple: "aarch64-unknown-linux-gnu", os: "linux", cpu: "arm64", libc: "glibc" },
  { key: "linux-x64-musl", triple: "x86_64-unknown-linux-musl", os: "linux", cpu: "x64", libc: "musl" },
  { key: "linux-arm64-musl", triple: "aarch64-unknown-linux-musl", os: "linux", cpu: "arm64", libc: "musl" },
];

export function hostTriple(): string {
  const out = Bun.spawnSync(["rustc", "-vV"], { cwd: ROOT, stdout: "pipe" }).stdout.toString();
  const host = /^host: (.+)$/m.exec(out)?.[1]?.trim();
  if (!host) throw new Error("rustc -vV printed no host triple");
  return host;
}

export function platformOf(triple: string): Platform {
  const p = PLATFORMS.find(p => p.triple === triple);
  if (!p) throw new Error(`no npm platform for ${triple}`);
  return p;
}

export interface NapiConfig {
  name: string;
  crate: string;
}

export async function napiConfig(dir: string): Promise<NapiConfig> {
  const pkg = await Bun.file(join(dir, "package.json")).json();
  if (!pkg.napi?.name || !pkg.napi?.crate) throw new Error(`${dir}/package.json has no napi.name/napi.crate`);
  return pkg.napi;
}

function libraryFile(crate: string, triple: string): string {
  const lib = crate.replace(/-/g, "_");
  if (triple.includes("windows")) return `${lib}.dll`;
  if (triple.includes("apple")) return `lib${lib}.dylib`;
  return `lib${lib}.so`;
}

/** Builds the addon and returns the path of the copied `.node` file. */
export async function buildNapi(
  dir: string,
  opts: { target?: string; debug?: boolean; out?: string } = {},
): Promise<string> {
  const pkgDir = resolve(dir);
  const { name, crate } = await napiConfig(pkgDir);
  const triple = opts.target ?? hostTriple();
  const profile = opts.debug ? "debug" : "release";
  const args = ["cargo", "build", "-p", crate];
  if (!opts.debug) args.push("--release");
  if (opts.target) args.push("--target", opts.target);
  console.log(`$ ${args.join(" ")}  (${pkgDir})`);
  const r = Bun.spawnSync(args, { cwd: pkgDir, stdio: ["inherit", "inherit", "inherit"] });
  if (r.exitCode !== 0) throw new Error(`${args.join(" ")} failed (exit ${r.exitCode})`);
  const built = join(pkgDir, "target", ...(opts.target ? [opts.target] : []), profile, libraryFile(crate, triple));
  if (!existsSync(built)) throw new Error(`cargo produced no ${built}`);
  const outDir = resolve(opts.out ?? pkgDir);
  mkdirSync(outDir, { recursive: true });
  const dest = join(outDir, `${name}.${platformOf(triple).key}.node`);
  copyFileSync(built, dest);
  console.log(`wrote ${dest}`);
  return dest;
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  const opt = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const dir = argv.find((a, i) => !a.startsWith("--") && !["--target", "--out"].includes(argv[i - 1]));
  if (!dir) throw new Error("usage: build-napi.ts <package-dir> [--target <triple>] [--debug] [--out <dir>]");
  await buildNapi(resolve(ROOT, dir), { target: opt("--target"), debug: argv.includes("--debug"), out: opt("--out") });
}
