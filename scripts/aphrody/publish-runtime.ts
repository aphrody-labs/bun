// Publishes the fork's runtime binary to npm, from the zips of a GitHub Release
// (`bun-<os>-<arch>.zip`, the same names upstream releases use):
//
//   @aphrody/bun-runtime              bins `bun`, `bunx`, `bun-runtime` (a Node launcher)
//   @aphrody/bun-runtime-<os>-<arch>  one per release zip, os/cpu/libc-gated, `bin/bun[.exe]`
//
// The root package installs the platform packages as optionalDependencies and
// its launcher execs the native binary, so it works without a postinstall
// (`bunx` and pnpm skip lifecycle scripts of untrusted packages).
//
//   bun scripts/aphrody/publish-runtime.ts version [--n 1]                    print <base>-aphrody.<n>
//   bun scripts/aphrody/publish-runtime.ts stage --version V --assets DIR [--out DIR]
//   bun scripts/aphrody/publish-runtime.ts publish --version V --assets DIR [--out DIR] [--dry-run]
//
// `publish` skips any package@version already on the registry, so re-running is safe.
// Auth: NPM_TOKEN (written into each staged .npmrc), else the user's ~/.npmrc.

import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { platforms as upstreamPlatforms } from "../../packages/bun-release/src/platform";
import { retirePlaceholder } from "./npm-placeholder";

export const ROOT = join(import.meta.dir, "..", "..");
export const RUNTIME_PACKAGE = "@aphrody/bun-runtime";
export const REPOSITORY = "https://github.com/aphrody-labs/bun";
export const TAG_PREFIX = "bun-v";

export type RuntimePlatform = {
  /** Release asset, e.g. `bun-linux-x64.zip`. */
  asset: string;
  /** Directory inside the zip, e.g. `bun-linux-x64`. */
  triplet: string;
  /** npm package, e.g. `@aphrody/bun-runtime-linux-x64`. */
  pkg: string;
  /** Launcher key: `${process.platform}-${process.arch}[-musl]`. */
  key: string;
  os: string;
  cpu: string;
  libc?: "glibc" | "musl";
  /** Binary path inside the platform package. */
  exe: string;
};

/** Every upstream release platform (aliases dropped), renamed into the fork's scope. */
export const runtimePlatforms: RuntimePlatform[] = upstreamPlatforms
  .filter(p => !p.alias)
  .map(p => {
    const libc = p.os === "linux" ? (p.abi === "musl" ? "musl" : "glibc") : undefined;
    return {
      asset: `${p.bin}.zip`,
      triplet: p.bin,
      pkg: `${RUNTIME_PACKAGE}-${p.bin.replace(/^bun-/, "")}`,
      key: `${p.os}-${p.arch}${libc === "musl" ? "-musl" : ""}`,
      os: p.os,
      cpu: p.arch,
      ...(libc ? { libc } : {}),
      exe: p.os === "win32" ? "bin/bun.exe" : "bin/bun",
    };
  });

/** Bun's own version: package.json is what the build stamps into the binary. */
export function readBaseVersion(root = ROOT): string {
  return JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
}

const SEMVER = /^\d+\.\d+\.\d+$/;

export function computeRuntimeVersion(base: string, n: number): string {
  if (!SEMVER.test(base)) throw new Error(`base version must be X.Y.Z, got ${JSON.stringify(base)}`);
  if (!Number.isInteger(n) || n < 1) throw new Error(`aphrody revision must be a positive integer, got ${n}`);
  return `${base}-aphrody.${n}`;
}

const RUNTIME_VERSION = /^(\d+\.\d+\.\d+)-aphrody\.([1-9]\d*)$/;

export function parseRuntimeVersion(version: string): { base: string; n: number } {
  if (SEMVER.test(version)) return { base: version, n: 0 };
  const m = RUNTIME_VERSION.exec(version);
  if (!m) throw new Error(`version must be X.Y.Z or <X.Y.Z>-aphrody.<n>, got ${JSON.stringify(version)}`);
  return { base: m[1], n: Number(m[2]) };
}

/** Accepts `aphrody-v1.4.3-aphrody.1`, `v1.4.3-aphrody.1` or `1.4.3-aphrody.1`. */
export function versionFromTag(tag: string): string {
  const version = tag.replace(/^refs\/tags\//, "").replace(/^(?:bun-v|aphrody-v|v)/, "");
  parseRuntimeVersion(version);
  return version;
}

export function releaseTag(version: string): string {
  const { n } = parseRuntimeVersion(version);
  return `${n ? "aphrody-v" : TAG_PREFIX}${version}`;
}

/** Platforms whose zip is present among `assetNames`. */
export function availablePlatforms(assetNames: string[]): RuntimePlatform[] {
  const names = new Set(assetNames);
  return runtimePlatforms.filter(p => names.has(p.asset));
}

export function platformManifest(p: RuntimePlatform, version: string) {
  return {
    name: p.pkg,
    version,
    description: `The ${p.os} ${p.cpu}${p.libc === "musl" ? " musl" : ""} binary of ${RUNTIME_PACKAGE}, the Aphrody runtime (based on Bun).`,
    license: "MIT",
    repository: { type: "git", url: `git+${REPOSITORY}.git` },
    homepage: REPOSITORY,
    preferUnplugged: true,
    files: ["bin"],
    os: [p.os],
    cpu: [p.cpu],
    ...(p.libc ? { libc: [p.libc] } : {}),
  };
}

export function rootManifest(version: string, platforms: RuntimePlatform[]) {
  return {
    name: RUNTIME_PACKAGE,
    version,
    description:
      "The Aphrody runtime (based on Bun) as a native binary: JavaScript and TypeScript runtime, bundler, test runner and package manager.",
    license: "MIT",
    repository: { type: "git", url: `git+${REPOSITORY}.git` },
    homepage: REPOSITORY,
    keywords: ["bun", "runtime", "javascript", "typescript", "aphrody"],
    bin: { bun: "bin/bun.js", bunx: "bin/bunx.js", "bun-runtime": "bin/bun.js" },
    files: ["bin", "platforms.json"],
    optionalDependencies: Object.fromEntries(platforms.map(p => [p.pkg, version])),
  };
}

/** `platforms.json`: what the launcher reads to find the native binary. */
export function launcherTable(platforms: RuntimePlatform[]): Record<string, { pkg: string; exe: string }> {
  return Object.fromEntries(platforms.map(p => [p.key, { pkg: p.pkg, exe: p.exe }]));
}

const LAUNCHER = `"use strict";
const { spawnSync } = require("child_process");
const { dirname, join } = require("path");

function isMusl() {
  if (process.platform !== "linux") return false;
  try {
    const report = process.report && process.report.getReport();
    return !(report && report.header && report.header.glibcVersionRuntime);
  } catch {
    return require("fs").existsSync("/etc/alpine-release");
  }
}

module.exports = function run(prefix) {
  const table = require("../platforms.json");
  const key = process.platform + "-" + process.arch;
  const candidates = isMusl() ? [key + "-musl", key] : [key];
  let exe;
  for (const k of candidates) {
    const entry = table[k];
    if (!entry) continue;
    try {
      exe = join(dirname(require.resolve(entry.pkg + "/package.json")), entry.exe);
      break;
    } catch {}
  }
  if (!exe) {
    console.error(
      "@aphrody/bun-runtime: no binary for " + candidates[0] + ". Supported: " + Object.keys(table).join(", ") +
        ". If yours is listed, reinstall without --no-optional / --omit=optional.",
    );
    process.exit(1);
  }
  const result = spawnSync(exe, prefix.concat(process.argv.slice(2)), { stdio: "inherit" });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.signal) process.kill(process.pid, result.signal);
  process.exit(result.status === null ? 1 : result.status);
};
`;

function readme(version: string, platforms: RuntimePlatform[]): string {
  return `# ${RUNTIME_PACKAGE}

The [aphrody-labs/bun](${REPOSITORY}) fork of the Bun runtime, as a native binary.

\`\`\`sh
bunx ${RUNTIME_PACKAGE} --version
npm i -g ${RUNTIME_PACKAGE}   # puts \`bun\` and \`bunx\` on PATH
\`\`\`

Version ${version}. Binaries: ${platforms.map(p => p.key).join(", ")}.
The same zips are attached to the GitHub Release \`${releaseTag(version)}\`.
`;
}

function unzipEntry(zip: string, entry: string, into: string): string {
  const out = mkdtempSync(join(tmpdir(), "aphrody-runtime-"));
  try {
    const r = spawnSync("unzip", ["-o", "-q", zip, entry, "-d", out], { stdio: "inherit" });
    if (r.status !== 0) throw new Error(`unzip ${zip} ${entry} failed (${r.error?.message ?? r.status})`);
    const data = readFileSync(join(out, entry));
    writeFileSync(into, data);
    chmodSync(into, 0o755);
    return into;
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

function npmrc(dir: string) {
  if (process.env.NPM_TOKEN) writeFileSync(join(dir, ".npmrc"), "//registry.npmjs.org/:_authToken=${NPM_TOKEN}\n");
}

export type Staged = { root: string; platforms: { platform: RuntimePlatform; dir: string }[] };

export function stage(version: string, assetsDir: string, outDir: string): Staged {
  parseRuntimeVersion(version);
  const platforms = availablePlatforms(readdirSync(assetsDir));
  if (!platforms.length) throw new Error(`no bun-<os>-<arch>.zip in ${assetsDir}`);
  rmSync(outDir, { recursive: true, force: true });
  const staged: Staged = { root: join(outDir, "bun-runtime"), platforms: [] };
  for (const p of platforms) {
    const dir = join(outDir, p.pkg.split("/")[1]);
    mkdirSync(join(dir, "bin"), { recursive: true });
    const exeName = p.exe.split("/").pop()!;
    unzipEntry(join(assetsDir, p.asset), `${p.triplet}/${exeName}`, join(dir, p.exe));
    writeFileSync(join(dir, "package.json"), JSON.stringify(platformManifest(p, version), null, 2) + "\n");
    writeFileSync(
      join(dir, "README.md"),
      `# ${p.pkg}\n\nNative binary of [${RUNTIME_PACKAGE}](${REPOSITORY}); install that package instead.\n`,
    );
    npmrc(dir);
    staged.platforms.push({ platform: p, dir });
  }
  const root = staged.root;
  mkdirSync(join(root, "bin"), { recursive: true });
  writeFileSync(join(root, "bin", "run.js"), LAUNCHER);
  writeFileSync(join(root, "bin", "bun.js"), `#!/usr/bin/env node\nrequire("./run.js")([]);\n`);
  writeFileSync(join(root, "bin", "bunx.js"), `#!/usr/bin/env node\nrequire("./run.js")(["x"]);\n`);
  for (const f of ["bun.js", "bunx.js"]) chmodSync(join(root, "bin", f), 0o755);
  writeFileSync(join(root, "platforms.json"), JSON.stringify(launcherTable(platforms), null, 2) + "\n");
  writeFileSync(join(root, "package.json"), JSON.stringify(rootManifest(version, platforms), null, 2) + "\n");
  writeFileSync(join(root, "README.md"), readme(version, platforms));
  npmrc(root);
  return staged;
}

async function isPublished(name: string, version: string): Promise<boolean> {
  const res = await fetch(`https://registry.npmjs.org/${name}/${version}`);
  if (res.status === 404) return false;
  if (!res.ok) throw new Error(`registry ${name}@${version}: HTTP ${res.status}`);
  return true;
}

function bunPublish(dir: string, dryRun: boolean) {
  const args = ["publish", "--access", "public", "--tag", "latest", ...(dryRun ? ["--dry-run"] : [])];
  const r = spawnSync(process.execPath, args, { cwd: dir, stdio: "inherit", env: process.env });
  if (r.status !== 0) throw new Error(`bun publish failed in ${dir}`);
}

export async function publish(staged: Staged, version: string, dryRun: boolean) {
  // Platform packages first: the root's optionalDependencies must resolve once it is live.
  const order = [
    ...staged.platforms.map(s => ({ name: s.platform.pkg, dir: s.dir })),
    { name: RUNTIME_PACKAGE, dir: staged.root },
  ];
  for (const { name, dir } of order) {
    if (await isPublished(name, version)) {
      console.log(`skip ${name}@${version}: already on npm`);
      continue;
    }
    console.log(`${dryRun ? "dry-run" : "publish"} ${name}@${version}`);
    bunPublish(dir, dryRun);
  }
  for (const { name, dir } of order) await retirePlaceholder(name, { cwd: dir, dryRun, published: version });
}

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
}

if (import.meta.main) {
  const [command, ...args] = process.argv.slice(2);
  if (command === "version") {
    console.log(
      flag(args, "--n") ? computeRuntimeVersion(readBaseVersion(), Number(flag(args, "--n"))) : readBaseVersion(),
    );
  } else if (command === "stage" || command === "publish") {
    const raw = flag(args, "--version");
    const assets = flag(args, "--assets");
    if (!raw || !assets) throw new Error(`usage: ${command} --version <V> --assets <dir> [--out <dir>]`);
    const version = versionFromTag(raw);
    const out = flag(args, "--out") ?? join(tmpdir(), `aphrody-bun-runtime-${version}`);
    const staged = stage(version, assets, out);
    console.log(
      `staged ${[RUNTIME_PACKAGE, ...staged.platforms.map(s => s.platform.pkg)].join(", ")} @ ${version} in ${out}`,
    );
    if (command === "publish") await publish(staged, version, args.includes("--dry-run"));
  } else {
    console.error("usage: publish-runtime.ts <version|stage|publish> ...");
    process.exit(2);
  }
}
