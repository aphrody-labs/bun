// Publishes the fork's Node-API packages to npm:
//
//   @aphrody/bun-plugin-n2b            packages/bun-n2b (TS sources + docs), optionalDependencies below
//   @aphrody/bun-plugin-n2b-<platform> bun-plugin-n2b.<platform>.node, os/cpu/libc-gated
//   @aphrody/bun-plugin-oxc            packages/bun-oxc
//   @aphrody/bun-plugin-oxc-<platform> bun-plugin-oxc.<platform>.node
//
// The .node files are built per platform by .github/workflows/aphrody-publish-native.yml
// (scripts/aphrody/build-napi.ts --target <triple>), which then runs:
//
//   bun scripts/aphrody/publish-native.ts matrix                                     JSON build matrix
//   bun scripts/aphrody/publish-native.ts publish --artifacts DIR [--only n2b,oxc] [--out DIR] [--dry-run]
//
// Versions come from each package.json (they follow the Rust crates). Re-running skips any
// package@version already on the registry.

import { spawnSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PLATFORMS, type Platform } from "./build-napi";
import { retirePlaceholder } from "./npm-placeholder";
import { REPOSITORY } from "./publish-runtime";

const ROOT = resolve(import.meta.dir, "../..");
const SCOPE = "@aphrody";

export type NativePackage = { id: string; dir: string };

export const NATIVE_PACKAGES: NativePackage[] = [
  { id: "n2b", dir: "packages/bun-n2b" },
  { id: "oxc", dir: "packages/bun-oxc" },
];

/** GitHub runner per platform; Linux builds run in a container (old glibc, or Alpine for musl). */
export const RUNNERS: Record<string, { runner: string; container?: string }> = {
  "darwin-arm64": { runner: "macos-15" },
  "darwin-x64": { runner: "macos-15-intel" },
  "linux-x64-gnu": { runner: "ubuntu-24.04", container: "rust:1-bullseye" },
  "linux-arm64-gnu": { runner: "ubuntu-24.04-arm", container: "rust:1-bullseye" },
  "linux-x64-musl": { runner: "ubuntu-24.04", container: "rust:1-alpine" },
  "linux-arm64-musl": { runner: "ubuntu-24.04-arm", container: "rust:1-alpine" },
  "win32-x64-msvc": { runner: "windows-2025" },
  "win32-arm64-msvc": { runner: "windows-11-arm" },
};

type Manifest = Record<string, any> & { name: string; version: string; napi: { name: string; crate: string } };

function manifestOf(pkg: NativePackage): Manifest {
  return JSON.parse(readFileSync(join(ROOT, pkg.dir, "package.json"), "utf8"));
}

export const npmName = (pkg: NativePackage) => `${SCOPE}/${manifestOf(pkg).name}`;
export const nodeFile = (pkg: NativePackage, p: Platform) => `${manifestOf(pkg).napi.name}.${p.key}.node`;
export const platformPackage = (pkg: NativePackage, p: Platform) => `${npmName(pkg)}-${p.key}`;

/** What cargo writes for the cdylib on each OS. */
export function cdylibName(crate: string, p: Platform): string {
  const lib = crate.replaceAll("-", "_");
  return p.os === "win32" ? `${lib}.dll` : p.os === "darwin" ? `lib${lib}.dylib` : `lib${lib}.so`;
}

export function matrix() {
  const include = [];
  for (const pkg of NATIVE_PACKAGES)
    for (const p of PLATFORMS)
      include.push({
        id: pkg.id,
        dir: pkg.dir,
        crate: manifestOf(pkg).napi.crate,
        cdylib: cdylibName(manifestOf(pkg).napi.crate, p),
        ...p,
        ...RUNNERS[p.key],
        file: nodeFile(pkg, p),
      });
  return { include };
}

function platformManifest(pkg: NativePackage, p: Platform, version: string, license: string) {
  return {
    name: platformPackage(pkg, p),
    version,
    description: `The ${p.key} binary of ${npmName(pkg)}.`,
    license,
    repository: { type: "git", url: `git+${REPOSITORY}.git`, directory: pkg.dir },
    main: nodeFile(pkg, p),
    files: [nodeFile(pkg, p)],
    os: [p.os],
    cpu: [p.cpu],
    ...(p.libc ? { libc: [p.libc] } : {}),
  };
}

function rootManifest(pkg: NativePackage, src: Manifest, platforms: Platform[]) {
  const { scripts: _scripts, devDependencies: _dev, private: _private, ...rest } = src;
  return {
    ...rest,
    name: npmName(pkg),
    repository: { type: "git", url: `git+${REPOSITORY}.git`, directory: pkg.dir },
    homepage: `${REPOSITORY}/tree/main/${pkg.dir}`,
    files: (src.files as string[]).filter(f => !f.endsWith(".node")),
    optionalDependencies: Object.fromEntries(platforms.map(p => [platformPackage(pkg, p), src.version])),
  };
}

function npmrc(dir: string) {
  if (process.env.NPM_TOKEN) writeFileSync(join(dir, ".npmrc"), "//registry.npmjs.org/:_authToken=${NPM_TOKEN}\n");
}

export type Staged = { pkg: NativePackage; version: string; root: string; platforms: { p: Platform; dir: string }[] };

/** `artifacts` holds `<napi.name>.<key>.node` files, possibly in subdirectories (download-artifact). */
export function stage(pkg: NativePackage, artifacts: string, out: string): Staged {
  const src = manifestOf(pkg);
  const found = new Map<string, string>();
  for (const entry of readdirSync(artifacts, { recursive: true, withFileTypes: true }))
    if (entry.isFile() && entry.name.endsWith(".node")) found.set(entry.name, join(entry.parentPath, entry.name));
  const platforms = PLATFORMS.filter(p => found.has(nodeFile(pkg, p)));
  if (!platforms.length) throw new Error(`no ${src.napi.name}.<platform>.node under ${artifacts}`);

  const base = join(out, src.name);
  rmSync(base, { recursive: true, force: true });
  const staged: Staged = { pkg, version: src.version, root: join(base, "main"), platforms: [] };
  for (const p of platforms) {
    const dir = join(base, p.key);
    mkdirSync(dir, { recursive: true });
    copyFileSync(found.get(nodeFile(pkg, p))!, join(dir, nodeFile(pkg, p)));
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify(platformManifest(pkg, p, src.version, src.license), null, 2) + "\n",
    );
    writeFileSync(
      join(dir, "README.md"),
      `# ${platformPackage(pkg, p)}\n\nNative addon of ${npmName(pkg)}; install that.\n`,
    );
    npmrc(dir);
    staged.platforms.push({ p, dir });
  }
  mkdirSync(staged.root, { recursive: true });
  for (const entry of rootManifest(pkg, src, platforms).files) {
    const from = join(ROOT, pkg.dir, entry);
    if (!existsSync(from)) throw new Error(`${pkg.dir}: "files" lists missing ${entry}`);
    cpSync(from, join(staged.root, entry), { recursive: true });
  }
  if (existsSync(join(ROOT, pkg.dir, "LICENSE")))
    copyFileSync(join(ROOT, pkg.dir, "LICENSE"), join(staged.root, "LICENSE"));
  writeFileSync(join(staged.root, "package.json"), JSON.stringify(rootManifest(pkg, src, platforms), null, 2) + "\n");
  npmrc(staged.root);
  return staged;
}

async function publishedVersions(name: string): Promise<string[]> {
  const res = await fetch(`https://registry.npmjs.org/${name.replace("/", "%2f")}`);
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`registry ${name}: HTTP ${res.status}`);
  return Object.keys(((await res.json()) as { versions?: object }).versions ?? {});
}

export async function publish(staged: Staged, dryRun: boolean) {
  const order = [
    ...staged.platforms.map(s => ({ name: platformPackage(staged.pkg, s.p), dir: s.dir })),
    { name: npmName(staged.pkg), dir: staged.root },
  ];
  for (const { name, dir } of order) {
    if ((await publishedVersions(name)).includes(staged.version)) {
      console.log(`skip ${name}@${staged.version}: already on npm`);
      continue;
    }
    console.log(`${dryRun ? "dry-run" : "publish"} ${name}@${staged.version}`);
    const args = ["publish", "--access", "public", "--tag", "latest", ...(dryRun ? ["--dry-run"] : [])];
    const r = spawnSync(process.execPath, args, { cwd: dir, stdio: "inherit", env: process.env });
    if (r.status !== 0) throw new Error(`bun publish failed in ${dir}`);
  }
  for (const { name, dir } of order) await retirePlaceholder(name, { cwd: dir, dryRun });
}

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
}

if (import.meta.main) {
  const [command, ...args] = process.argv.slice(2);
  if (command === "matrix") {
    console.log(JSON.stringify(matrix()));
  } else if (command === "stage" || command === "publish") {
    const artifacts = flag(args, "--artifacts");
    if (!artifacts || !existsSync(artifacts)) throw new Error(`usage: ${command} --artifacts <dir> [--only n2b,oxc]`);
    const only = flag(args, "--only")?.split(",");
    const out = flag(args, "--out") ?? join(tmpdir(), "aphrody-native-npm");
    for (const pkg of NATIVE_PACKAGES) {
      if (only && !only.includes(pkg.id)) continue;
      const staged = stage(pkg, artifacts, out);
      console.log(`staged ${npmName(pkg)}@${staged.version} (${staged.platforms.map(s => s.p.key).join(", ")})`);
      if (command === "publish") await publish(staged, args.includes("--dry-run"));
    }
  } else {
    console.error("usage: publish-native.ts <matrix|stage|publish> ...");
    process.exit(2);
  }
}
