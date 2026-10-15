// Builds the Node-API addon of a fork-only native package (packages/bun-n2b,
// packages/bun-oxc) and copies it next to the package as
// `<napi.name>.<platform>.node`, the file the package's loader and the
// per-platform npm packages (scripts/aphrody/publish-native.ts) look for.
//
//   bun scripts/aphrody/build-napi.ts <package-dir> [--target <rust-triple>] [--debug] [--out <dir>] [--jobs <count>]
//
// The package.json of <package-dir> declares `"napi": { "name": "...", "crate": "..." }`.

import { existsSync } from "node:fs";
import { copyFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { availableParallelism } from "node:os";

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

export async function hostTriple(): Promise<string> {
  await using child = Bun.spawn(["rustc", "-vV"], { cwd: ROOT, stdout: "pipe", stderr: "pipe", windowsHide: true });
  const [out, stderr, code] = await Promise.all([child.stdout.text(), child.stderr.text(), child.exited]);
  if (code !== 0) throw new Error(`rustc -vV failed (exit ${code}): ${stderr.trim()}`);
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

export function napiBuildJobs(jobs = 1, available = 1024): number {
  if (!Number.isSafeInteger(jobs) || jobs < 1 || jobs > 1024)
    throw new Error("Native addon jobs must be an integer from 1 to 1024");
  if (!Number.isSafeInteger(available) || available < 1 || jobs > available)
    throw new Error("Native addon jobs exceed available CPUs");
  return jobs;
}

/** Root workspace build; Cargo's JSON output owns the target directory and actual library name. */
export function napiBuildPlan(
  dir: string,
  crate: string,
  opts: { target?: string; debug?: boolean; jobs?: number } = {},
  platform = process.platform,
  bun = process.execPath,
) {
  const profile = opts.debug ? "dev" : "release";
  const jobs = napiBuildJobs(opts.jobs);
  return {
    cwd: ROOT,
    manifest: join(resolve(dir), "crates/napi/Cargo.toml"),
    argv: [
      bun,
      join(ROOT, "scripts/build/rust/cargo-serial.ts"),
      ...(platform === "win32" ? ["--msvc"] : []),
      "build",
      "--manifest-path",
      join(ROOT, "Cargo.toml"),
      "--locked",
      "-p",
      crate,
      "--lib",
      "--jobs",
      String(jobs),
      "--message-format=json-render-diagnostics",
      "--config",
      `profile.${profile}.panic="unwind"`,
      ...(!opts.debug ? ["--release"] : []),
      ...(opts.target ? ["--target", opts.target] : []),
    ],
  };
}

function cargoMessages(output: string): any[] {
  return output
    .split(/\r?\n/)
    .filter(line => line.trim())
    .map(line => {
      try {
        return JSON.parse(line);
      } catch {
        throw new Error(`Cargo emitted non-JSON stdout: ${line.slice(0, 200)}`);
      }
    });
}

/** Select the exact addon's cdylib, including fresh artifacts, without inferring Cargo's output layout. */
export function cargoNapiArtifact(output: string, manifest: string, triple: string): string {
  const normalize = (path: string) => {
    const normalized = resolve(path).replaceAll("\\", "/");
    return process.platform === "win32" ? normalized.toLowerCase() : normalized;
  };
  const extension = triple.includes("windows") ? ".dll" : triple.includes("apple") ? ".dylib" : ".so";
  const artifacts = new Set<string>();
  for (const message of cargoMessages(output)) {
    if (
      message?.reason !== "compiler-artifact" ||
      typeof message.manifest_path !== "string" ||
      normalize(message.manifest_path) !== normalize(manifest) ||
      !Array.isArray(message.target?.crate_types) ||
      !message.target.crate_types.includes("cdylib")
    )
      continue;
    if (!Array.isArray(message.filenames)) throw new Error("Cargo cdylib artifact has no filenames");
    for (const filename of message.filenames)
      if (typeof filename === "string" && filename.endsWith(extension)) artifacts.add(filename);
  }
  if (artifacts.size !== 1)
    throw new Error(`Cargo reported ${artifacts.size} addon cdylibs for ${manifest} (${triple})`);
  return [...artifacts][0]!;
}

/** Builds the addon and returns the path of the copied `.node` file. */
export async function buildNapi(
  dir: string,
  opts: { target?: string; debug?: boolean; out?: string; jobs?: number } = {},
): Promise<string> {
  const jobs = napiBuildJobs(opts.jobs, availableParallelism());
  const pkgDir = resolve(dir);
  const { name, crate } = await napiConfig(pkgDir);
  const triple = opts.target ?? (await hostTriple());
  const platform = platformOf(triple);
  const plan = napiBuildPlan(pkgDir, crate, { ...opts, jobs });
  if (!existsSync(plan.manifest)) throw new Error(`addon manifest missing: ${plan.manifest}`);
  console.log(`$ ${plan.argv.join(" ")}  (${plan.cwd})`);
  await using child = Bun.spawn(plan.argv, {
    cwd: plan.cwd,
    stdin: "inherit",
    stdout: "pipe",
    stderr: "inherit",
    windowsHide: true,
  });
  const [stdout, code] = await Promise.all([child.stdout.text(), child.exited]);
  for (const message of cargoMessages(stdout))
    if (message?.reason === "compiler-message" && typeof message.message?.rendered === "string")
      process.stderr.write(message.message.rendered);
  if (code !== 0) throw new Error(`addon Cargo build failed (exit ${code})`);
  const built = cargoNapiArtifact(stdout, plan.manifest, triple);
  if (!existsSync(built)) throw new Error(`cargo produced no ${built}`);
  const outDir = resolve(opts.out ?? pkgDir);
  await mkdir(outDir, { recursive: true });
  const dest = join(outDir, `${name}.${platform.key}.node`);
  await copyFile(built, dest);
  console.log(`wrote ${dest}`);
  return dest;
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  const opt = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const dir = argv.find((a, i) => !a.startsWith("--") && !["--target", "--out", "--jobs"].includes(argv[i - 1] ?? ""));
  const jobArgument = opt("--jobs");
  if (argv.includes("--jobs") && (!jobArgument || !/^[1-9]\d{0,3}$/.test(jobArgument)))
    throw new Error("--jobs requires a positive integer from 1 to 1024");
  if (!dir)
    throw new Error("usage: build-napi.ts <package-dir> [--target <triple>] [--debug] [--out <dir>] [--jobs <count>]");
  const target = opt("--target");
  const out = opt("--out");
  await buildNapi(resolve(ROOT, dir), {
    debug: argv.includes("--debug"),
    ...(target === undefined ? {} : { target }),
    ...(out === undefined ? {} : { out }),
    ...(jobArgument === undefined ? {} : { jobs: napiBuildJobs(Number(jobArgument)) }),
  });
}
