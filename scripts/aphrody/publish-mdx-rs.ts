// Publishes packages/bun-build-mdx-rs, the MDX → JSX native plugin for Bun.build
// (napi cdylib using mdxjs-rs), to npm:
//
//   @aphrody/bun-mdx-rs                 loader + `mdx()` plugin factory, optionalDependencies below
//   @aphrody/bun-mdx-rs-<platform>      bun-mdx-rs.<platform>.node, os/cpu/libc-gated
//
// The .node files are built per platform by .github/workflows/aphrody-publish-mdx-rs.yml
// (`cargo build --release --target <triple>`), which then runs:
//
//   bun scripts/aphrody/publish-mdx-rs.ts matrix                                    JSON build matrix
//   bun scripts/aphrody/publish-mdx-rs.ts publish --artifacts DIR [--version V] [--out DIR] [--dry-run]
//
// Version: `<Bun version>-aphrody.<n>`, n one above the newest published (the crate is 0.0.0).
// Re-running skips any package@version already on the registry.

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { retirePlaceholder } from "./npm-placeholder";
import { nextVersion } from "./publish-npm";
import { parseRuntimeVersion, readBaseVersion, REPOSITORY } from "./publish-runtime";

export const MDX_PACKAGE = "@aphrody/bun-mdx-rs";
export const CRATE_DIR = join(import.meta.dir, "..", "..", "packages", "bun-build-mdx-rs");

export type MdxPlatform = {
  /** napi platform key, also what the loader computes at runtime. */
  key: string;
  triple: string;
  os: "darwin" | "linux" | "win32";
  cpu: "x64" | "arm64";
  libc?: "glibc" | "musl";
  /** GitHub runner that builds it natively. */
  runner: string;
  /** Container the Linux build runs in: an old glibc, or Alpine for musl. */
  container?: string;
};

export const mdxPlatforms: MdxPlatform[] = [
  { key: "darwin-arm64", triple: "aarch64-apple-darwin", os: "darwin", cpu: "arm64", runner: "macos-15" },
  { key: "darwin-x64", triple: "x86_64-apple-darwin", os: "darwin", cpu: "x64", runner: "macos-15-intel" },
  {
    key: "linux-x64-gnu",
    triple: "x86_64-unknown-linux-gnu",
    os: "linux",
    cpu: "x64",
    libc: "glibc",
    runner: "ubuntu-24.04",
    container: "rust:1-bullseye",
  },
  {
    key: "linux-arm64-gnu",
    triple: "aarch64-unknown-linux-gnu",
    os: "linux",
    cpu: "arm64",
    libc: "glibc",
    runner: "ubuntu-24.04-arm",
    container: "rust:1-bullseye",
  },
  {
    key: "linux-x64-musl",
    triple: "x86_64-unknown-linux-musl",
    os: "linux",
    cpu: "x64",
    libc: "musl",
    runner: "ubuntu-24.04",
    container: "rust:1-alpine",
  },
  {
    key: "linux-arm64-musl",
    triple: "aarch64-unknown-linux-musl",
    os: "linux",
    cpu: "arm64",
    libc: "musl",
    runner: "ubuntu-24.04-arm",
    container: "rust:1-alpine",
  },
  { key: "win32-x64-msvc", triple: "x86_64-pc-windows-msvc", os: "win32", cpu: "x64", runner: "windows-2025" },
  { key: "win32-arm64-msvc", triple: "aarch64-pc-windows-msvc", os: "win32", cpu: "arm64", runner: "windows-11-arm" },
];

export const nodeFile = (p: MdxPlatform) => `bun-mdx-rs.${p.key}.node`;
export const platformPackage = (p: MdxPlatform) => `${MDX_PACKAGE}-${p.key}`;
export const mdxPackageNames = () => [...mdxPlatforms.map(platformPackage), MDX_PACKAGE];

/** What cargo writes for the cdylib on each OS. */
export function cdylibName(p: MdxPlatform): string {
  return p.os === "win32" ? "bun_mdx_rs.dll" : p.os === "darwin" ? "libbun_mdx_rs.dylib" : "libbun_mdx_rs.so";
}

export function platformManifest(p: MdxPlatform, version: string) {
  return {
    name: platformPackage(p),
    version,
    description: `The ${p.key} binary of ${MDX_PACKAGE}.`,
    license: "MIT",
    repository: { type: "git", url: `git+${REPOSITORY}.git`, directory: "packages/bun-build-mdx-rs" },
    main: nodeFile(p),
    files: [nodeFile(p)],
    os: [p.os],
    cpu: [p.cpu],
    ...(p.libc ? { libc: [p.libc] } : {}),
  };
}

export function rootManifest(version: string, platforms: MdxPlatform[]) {
  return {
    name: MDX_PACKAGE,
    version,
    description:
      "MDX → JSX in Bun.build as a native onBeforeParse plugin (mdxjs-rs), from the aphrody-labs fork of Bun.",
    license: "MIT",
    repository: { type: "git", url: `git+${REPOSITORY}.git`, directory: "packages/bun-build-mdx-rs" },
    homepage: `${REPOSITORY}/tree/main/packages/bun-build-mdx-rs`,
    keywords: ["bun", "mdx", "plugin", "napi"],
    main: "index.js",
    types: "index.d.ts",
    files: ["index.js", "index.d.ts"],
    engines: { bun: ">=1.1.0" },
    optionalDependencies: Object.fromEntries(platforms.map(p => [platformPackage(p), version])),
  };
}

export const LOADER = `"use strict";
const { existsSync, readdirSync } = require("fs");
const { join } = require("path");

function isMusl() {
  try {
    return readdirSync("/lib").some(f => f.startsWith("ld-musl-"));
  } catch {
    return false;
  }
}

function platformKey() {
  const { platform, arch } = process;
  if (platform === "linux") return \`linux-\${arch}-\${isMusl() ? "musl" : "gnu"}\`;
  if (platform === "win32") return \`win32-\${arch}-msvc\`;
  return \`\${platform}-\${arch}\`;
}

function load() {
  const key = platformKey();
  const local = join(__dirname, \`bun-mdx-rs.\${key}.node\`);
  if (existsSync(local)) return require(local);
  try {
    return require(\`${MDX_PACKAGE}-\${key}\`);
  } catch (cause) {
    throw new Error(\`${MDX_PACKAGE}: no native binary for \${key}; is ${MDX_PACKAGE}-\${key} installed?\`, { cause });
  }
}

const napiModule = load();
const symbol = "bun_mdx_rs";

/** Bun.build plugin: compiles every .mdx file to JSX before Bun parses it. */
function mdx() {
  return {
    name: "bun-mdx-rs",
    setup(build) {
      if (build.config) build.config.loader = { ...build.config.loader, ".mdx": "jsx" };
      build.onBeforeParse({ filter: /\\.mdx$/ }, { napiModule, symbol });
    },
  };
}

module.exports = mdx;
module.exports.default = mdx;
module.exports.mdx = mdx;
module.exports.napiModule = napiModule;
module.exports.symbol = symbol;
`;

export const TYPES = `import type { BunPlugin } from "bun";

/** Bun.build plugin: compiles every .mdx file to JSX (mdxjs-rs, GFM) before Bun parses it. */
declare function mdx(): BunPlugin;
declare namespace mdx {
  export { mdx as default, mdx };
  /** The napi module, for \`build.onBeforeParse(filter, { napiModule, symbol })\`. */
  export const napiModule: unknown;
  export const symbol: "bun_mdx_rs";
}
export = mdx;
`;

function readme(version: string, platforms: MdxPlatform[]): string {
  return `# ${MDX_PACKAGE}

MDX → JSX for \`Bun.build\`, as a native \`onBeforeParse\` plugin built on [mdxjs-rs](https://github.com/wooorm/mdxjs-rs)
(GFM on, JSX left for Bun). From [aphrody-labs/bun](${REPOSITORY}) (\`packages/bun-build-mdx-rs\`).

\`\`\`ts
import mdx from "${MDX_PACKAGE}";

await Bun.build({
  entrypoints: ["./index.tsx"],
  outdir: "./dist",
  plugins: [mdx()],
});
\`\`\`

The plugin sets the \`.mdx\` loader to \`jsx\`. Version ${version}; binaries: ${platforms.map(p => p.key).join(", ")}.
`;
}

function npmrc(dir: string) {
  if (process.env.NPM_TOKEN) writeFileSync(join(dir, ".npmrc"), "//registry.npmjs.org/:_authToken=${NPM_TOKEN}\n");
}

export type StagedMdx = { root: string; platforms: { platform: MdxPlatform; dir: string }[] };

/** `artifacts` holds `bun-mdx-rs.<key>.node` files, possibly in subdirectories (download-artifact). */
export function stage(version: string, artifacts: string, out: string): StagedMdx {
  const found = new Map<string, string>();
  for (const entry of readdirSync(artifacts, { recursive: true, withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".node")) found.set(entry.name, join(entry.parentPath, entry.name));
  }
  const platforms = mdxPlatforms.filter(p => found.has(nodeFile(p)));
  if (!platforms.length) throw new Error(`no bun-mdx-rs.<platform>.node under ${artifacts}`);
  rmSync(out, { recursive: true, force: true });
  const staged: StagedMdx = { root: join(out, "bun-mdx-rs"), platforms: [] };
  for (const p of platforms) {
    const dir = join(out, `bun-mdx-rs-${p.key}`);
    mkdirSync(dir, { recursive: true });
    copyFileSync(found.get(nodeFile(p))!, join(dir, nodeFile(p)));
    writeFileSync(join(dir, "package.json"), JSON.stringify(platformManifest(p, version), null, 2) + "\n");
    writeFileSync(
      join(dir, "README.md"),
      `# ${platformPackage(p)}\n\nNative binary of ${MDX_PACKAGE}; install that.\n`,
    );
    npmrc(dir);
    staged.platforms.push({ platform: p, dir });
  }
  mkdirSync(staged.root, { recursive: true });
  writeFileSync(join(staged.root, "index.js"), LOADER);
  writeFileSync(join(staged.root, "index.d.ts"), TYPES);
  writeFileSync(join(staged.root, "package.json"), JSON.stringify(rootManifest(version, platforms), null, 2) + "\n");
  writeFileSync(join(staged.root, "README.md"), readme(version, platforms));
  npmrc(staged.root);
  return staged;
}

async function publishedVersions(name: string): Promise<string[]> {
  const res = await fetch(`https://registry.npmjs.org/${name.replace("/", "%2f")}`);
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`registry ${name}: HTTP ${res.status}`);
  return Object.keys(((await res.json()) as { versions?: object }).versions ?? {});
}

export async function publish(staged: StagedMdx, version: string, dryRun: boolean) {
  const order = [
    ...staged.platforms.map(s => ({ name: platformPackage(s.platform), dir: s.dir })),
    { name: MDX_PACKAGE, dir: staged.root },
  ];
  for (const { name, dir } of order) {
    if ((await publishedVersions(name)).includes(version)) {
      console.log(`skip ${name}@${version}: already on npm`);
      continue;
    }
    console.log(`${dryRun ? "dry-run" : "publish"} ${name}@${version}`);
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
    console.log(
      JSON.stringify({ include: mdxPlatforms.map(p => ({ ...p, file: nodeFile(p), cdylib: cdylibName(p) })) }),
    );
  } else if (command === "stage" || command === "publish") {
    const artifacts = flag(args, "--artifacts");
    if (!artifacts || !existsSync(artifacts)) throw new Error(`usage: ${command} --artifacts <dir> [--version V]`);
    const version =
      flag(args, "--version") ?? nextVersion(readBaseVersion(), await publishedVersions(MDX_PACKAGE)).next;
    parseRuntimeVersion(version);
    const out = flag(args, "--out") ?? join(tmpdir(), `aphrody-bun-mdx-rs-${version}`);
    const staged = stage(version, artifacts, out);
    console.log(
      `staged ${mdxPackageNames()
        .filter(n => n === MDX_PACKAGE || staged.platforms.some(s => platformPackage(s.platform) === n))
        .join(", ")} @ ${version} in ${out}`,
    );
    if (command === "publish") await publish(staged, version, args.includes("--dry-run"));
  } else {
    console.error("usage: publish-mdx-rs.ts <matrix|stage|publish> ...");
    process.exit(2);
  }
}
