// Publishes the fork's JS packages to npm under the @aphrody scope.
//
//   bun scripts/aphrody/publish-npm.ts [--dry-run] [--only <dir>[,<dir>]] [--out <dir>]
//
// Each package is copied into a staging directory, built there, and its
// manifest rewritten for publication (version, repository links, internal
// dependencies pinned to the versions published by this run), so the upstream
// package.json files stay untouched and merge cleanly. Versions follow
// `<base>-aphrody.<n>`: base is the Bun version from the root package.json for
// bun-types and the package's own version otherwise. A package whose packed
// content matches the newest published `<base>-aphrody.*` tarball is skipped,
// so re-running publishes nothing new.
//
// Published by their own scripts: @aphrody/bun-mdx-rs (napi addon built per
// platform, publish-mdx-rs.ts) and @aphrody/web-inspector-bun (built from a
// WebKit checkout, publish-web-inspector.ts).

import { cpSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { SCOPE } from "./scope.ts";

const ROOT = join(import.meta.dir, "..", "..");
const REPO = "aphrody-labs/bun";
const DEP_FIELDS = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"] as const;

export interface PackageSpec {
  /** Directory under packages/, also the upstream npm name. */
  dir: string;
  /** npm name under the scope when it is not `dir` (fork-only packages). */
  name?: string;
  /** Use the Bun version as the version base instead of the package's own. */
  bunVersion?: boolean;
  /** Fork packages imported by the published sources but not listed in the manifest. */
  addDependencies?: string[];
  /** Manifest fields set for publication. */
  fields?: Record<string, unknown>;
  prepare?: (staging: string, ctx: { base: string }) => Promise<void> | void;
}

function run(cmd: string[], cwd: string, env: Record<string, string> = {}) {
  const proc = Bun.spawnSync(cmd, { cwd, env: { ...process.env, ...env }, stdout: "pipe", stderr: "pipe" });
  if (proc.exitCode !== 0) {
    throw new Error(`${cmd.join(" ")} failed (${proc.exitCode}):\n${proc.stdout}\n${proc.stderr}`);
  }
  return proc.stdout.toString();
}

export const PACKAGES: PackageSpec[] = [
  {
    dir: "bun-types",
    bunVersion: true,
    fields: { description: "Type definitions and documentation for Bun (Aphrody fork of Bun)" },
    // Generates CLAUDE.md and docs/ next to the .d.ts files, as release.yml does upstream.
    prepare: (staging, { base }) =>
      void run([process.execPath, "scripts/build.ts", staging], join(ROOT, "packages", "bun-types"), {
        BUN_VERSION: base,
      }),
  },
  {
    dir: "bun-inspector-protocol",
    fields: { description: "WebKit Inspector Protocol client for Bun (Aphrody fork of Bun)" },
    // node-socket.ts borrows the framer from the debug adapter, which itself
    // depends on this package: ship a copy instead of a dependency cycle.
    prepare: async staging => {
      const framer = "src/debugger/node-socket-framer.ts";
      cpSync(
        join(ROOT, "packages", "bun-debug-adapter-protocol", framer),
        join(staging, "src/inspector/node-socket-framer.ts"),
      );
      const socket = join(staging, "src/inspector/node-socket.ts");
      const text = await Bun.file(socket).text();
      const next = text.replace(
        /(["'])(?:\.\.\/)+bun-debug-adapter-protocol\/src\/debugger\/node-socket-framer\.js\1/,
        "$1./node-socket-framer.js$1",
      );
      if (next === text) throw new Error("bun-inspector-protocol: node-socket.ts no longer imports the framer");
      await Bun.write(socket, next);
      run(
        [
          process.execPath,
          "build",
          "--target=node",
          "--outfile=index.js",
          "--minify-syntax",
          "./index.ts",
          "--external=ws",
        ],
        staging,
      );
    },
  },
  {
    dir: "bun-debug-adapter-protocol",
    addDependencies: ["bun-inspector-protocol"],
    fields: {
      description: "Debug Adapter Protocol implementation for Bun (Aphrody fork of Bun)",
      module: "./index.ts",
      types: "./index.ts",
      files: ["index.ts", "src", "!src/**/*.test.ts", "!src/**/fixtures", "README.md"],
    },
    // The sources reach into the inspector package through the monorepo; once
    // published they import it from npm instead.
    prepare: async staging => {
      for (const file of new Bun.Glob("src/**/*.ts").scanSync({ cwd: staging })) {
        const path = join(staging, file);
        const text = await Bun.file(path).text();
        const next = rewriteSiblingImports(text);
        if (next !== text) await Bun.write(path, next);
      }
    },
  },
  {
    dir: "bun-plugin-svelte",
    fields: { description: "Svelte plugin for Bun (Aphrody fork of Bun)" },
  },
  {
    dir: "bun-plugin-yaml",
    fields: { description: "YAML plugin for Bun (Aphrody fork of Bun)" },
  },
  {
    // Fork-only: Next.js on Bun (runner, withBun + next patch, codemods, testing helpers).
    dir: "bun-next",
    name: "next-bun",
  },
  {
    // Fork-only: Playwright-shaped page over Bun.WebView (moved from the aphrody monorepo).
    dir: "bun-webview-page",
    fields: { description: "Playwright-shaped page, locators and routing over Bun.WebView (Aphrody fork of Bun)" },
  },
  {
    // Fork-only: Tailwind CSS v4 for Bun.build, the HTML dev server and PostCSS.
    dir: "bun-plugin-tailwind",
    fields: { description: "Tailwind CSS v4 plugin for Bun and PostCSS (Aphrody fork of Bun)" },
    // dist/ holds the Node.js build (ES modules and the CommonJS PostCSS plugin).
    prepare: staging => {
      const dir = join(ROOT, "packages", "bun-plugin-tailwind");
      run([process.execPath, "install", "--frozen-lockfile"], dir);
      run([process.execPath, "scripts/build.ts", join(staging, "dist")], dir);
    },
  },
];

/** The scoped npm name of a fork package. */
export function npmName(spec: PackageSpec): string {
  return `${SCOPE}/${spec.name ?? spec.dir}`;
}

const FORK_NAMES = new Set(PACKAGES.map(p => p.dir));

/** Replaces relative imports of sibling fork packages with their scoped npm name. */
export function rewriteSiblingImports(code: string): string {
  return code.replace(
    /(["'])(?:\.\.\/)+([\w-]+)\/(index\.ts["']|[^"']*)/g,
    (match, quote: string, dir: string, rest: string) => {
      if (!FORK_NAMES.has(dir)) return match;
      return rest.startsWith("index.ts") ? `${quote}${SCOPE}/${dir}${quote}` : `${quote}${SCOPE}/${dir}/${rest}`;
    },
  );
}

/** Next `<base>-aphrody.<n>` version and the newest existing one for that base. */
export function nextVersion(base: string, published: Iterable<string>): { next: string; previous?: string } {
  const re = new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-aphrody\\.(\\d+)$`);
  let max = 0;
  for (const v of published) {
    const m = re.exec(v);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return { next: `${base}-aphrody.${max + 1}`, previous: max ? `${base}-aphrody.${max}` : undefined };
}

function forkName(dep: string): string | undefined {
  const short = dep === "@types/bun" ? "bun-types" : dep.startsWith(`${SCOPE}/`) ? dep.slice(SCOPE.length + 1) : dep;
  return FORK_NAMES.has(short) ? short : undefined;
}

/**
 * The manifest as published: version, links to the fork, and every dependency
 * on a fork package (scoped, upstream name, `@types/bun`, or a local path)
 * pinned to its published `@aphrody/*` version.
 */
export function publishManifest(
  pkg: Record<string, any>,
  spec: PackageSpec,
  version: string,
  resolved: ReadonlyMap<string, string>,
): Record<string, any> {
  const out: Record<string, any> = { ...pkg, name: npmName(spec), version };
  for (const field of DEP_FIELDS) {
    const deps = pkg[field];
    if (!deps) continue;
    const next: Record<string, string> = {};
    for (const [dep, range] of Object.entries<string>(deps)) {
      const fork = forkName(dep);
      if (!fork) {
        next[dep] = range;
        continue;
      }
      const pinned = resolved.get(fork);
      if (!pinned) throw new Error(`${spec.dir}: ${field}.${dep} needs ${fork}, which is not published yet`);
      next[`${SCOPE}/${fork}`] = pinned;
    }
    out[field] = next;
  }
  for (const fork of spec.addDependencies ?? []) {
    const pinned = resolved.get(fork);
    if (!pinned) throw new Error(`${spec.dir}: depends on ${fork}, which is not published yet`);
    out.dependencies = { ...out.dependencies, [`${SCOPE}/${fork}`]: pinned };
  }
  Object.assign(out, spec.fields);
  out.license ??= "MIT";
  out.homepage = `https://github.com/${REPO}/tree/main/packages/${spec.dir}#readme`;
  out.repository = { type: "git", url: `git+https://github.com/${REPO}.git`, directory: `packages/${spec.dir}` };
  out.bugs = { url: `https://github.com/${REPO}/issues` };
  out.publishConfig = { access: "public" };
  delete out.private;
  return out;
}

/** Hash of a packed tarball's content, ignoring the version so republishing the same files is detected. */
export function contentHash(files: ReadonlyMap<string, string | Uint8Array>): string {
  const hasher = new Bun.CryptoHasher("sha256");
  for (const name of [...files.keys()].sort()) {
    let data = files.get(name)!;
    if (name.replace(/^package\//, "") === "package.json") {
      const pkg = JSON.parse(typeof data === "string" ? data : new TextDecoder().decode(data));
      delete pkg.version;
      data = JSON.stringify(pkg);
    }
    hasher.update(`${name}\0`);
    hasher.update(data);
    hasher.update("\0");
  }
  return hasher.digest("hex");
}

async function tarballFiles(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  const out = new Map<string, Uint8Array>();
  for (const [name, file] of await new Bun.Archive(bytes).files()) out.set(name, await file.bytes());
  return out;
}

async function packument(registry: string, name: string): Promise<Record<string, any> | undefined> {
  const res = await fetch(`${registry}/${name.replace("/", "%2f")}`, {
    headers: { accept: "application/vnd.npm.install-v1+json" },
  });
  if (res.status === 404) return undefined;
  if (!res.ok) throw new Error(`GET ${name}: ${res.status} ${await res.text()}`);
  return res.json();
}

function pack(staging: string, dest: string): string {
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  run([process.execPath, "pm", "pack", "--destination", dest, "--quiet"], staging);
  const [tgz] = readdirSync(dest).filter(f => f.endsWith(".tgz"));
  if (!tgz) throw new Error(`bun pm pack produced no tarball in ${dest}`);
  return join(dest, tgz);
}

async function stage(spec: PackageSpec, out: string, base: string): Promise<string> {
  const src = join(ROOT, "packages", spec.dir);
  const staging = join(out, spec.dir);
  rmSync(staging, { recursive: true, force: true });
  cpSync(src, staging, { recursive: true, filter: s => !/[\\/]node_modules$/.test(s) });
  await spec.prepare?.(staging, { base });
  if (!readdirSync(staging).some(f => /^licen[cs]e/i.test(f))) {
    cpSync(join(ROOT, "LICENSE.md"), join(staging, "LICENSE.md"));
  }
  return staging;
}

export interface Result {
  name: string;
  version: string;
  action: "published" | "unchanged" | "dry-run";
}

export async function publishAll(opts: {
  dryRun?: boolean;
  only?: string[];
  out?: string;
  registry?: string;
}): Promise<Result[]> {
  const registry = (opts.registry ?? process.env.NPM_CONFIG_REGISTRY ?? "https://registry.npmjs.org").replace(
    /\/$/,
    "",
  );
  const out = resolve(opts.out ?? join(tmpdir(), "aphrody-npm"));
  mkdirSync(out, { recursive: true });
  const bunVersion: string = (await Bun.file(join(ROOT, "package.json")).json()).version;
  const resolved = new Map<string, string>();
  const results: Result[] = [];

  for (const spec of PACKAGES) {
    const name = npmName(spec);
    const selected = !opts.only?.length || opts.only.includes(spec.dir);
    const doc = await packument(registry, name);
    if (!selected) {
      // Dependents still need a version to pin.
      const latest = doc?.["dist-tags"]?.latest;
      if (latest) resolved.set(spec.dir, latest);
      continue;
    }

    const srcPkg = await Bun.file(join(ROOT, "packages", spec.dir, "package.json")).json();
    const base = spec.bunVersion || !srcPkg.version || srcPkg.version === "0.0.0" ? bunVersion : srcPkg.version;
    const { next, previous } = nextVersion(base, Object.keys(doc?.versions ?? {}));

    const staging = await stage(spec, out, base);
    const manifest = publishManifest(srcPkg, spec, next, resolved);
    await Bun.write(join(staging, "package.json"), JSON.stringify(manifest, null, 2) + "\n");
    const tgz = pack(staging, join(out, "tarballs", spec.dir));
    const files = await tarballFiles(await Bun.file(tgz).bytes());

    const packed = JSON.parse(new TextDecoder().decode(files.get("package/package.json")!));
    for (const field of DEP_FIELDS) {
      for (const [dep, range] of Object.entries<string>(packed[field] ?? {})) {
        if (/^(?:workspace|file|link):|^\.{0,2}\//.test(range)) {
          throw new Error(`${name}: ${field}.${dep} is still local (${range}) in the packed tarball`);
        }
      }
    }

    if (previous) {
      const tarball = doc!.versions[previous].dist.tarball;
      const prevFiles = await tarballFiles(new Uint8Array(await (await fetch(tarball)).arrayBuffer()));
      if (contentHash(prevFiles) === contentHash(files)) {
        resolved.set(spec.dir, previous);
        results.push({ name, version: previous, action: "unchanged" });
        console.log(`= ${name}@${previous} unchanged`);
        continue;
      }
    }

    resolved.set(spec.dir, next);
    console.log(`${opts.dryRun ? "~" : "+"} ${name}@${next} (${files.size} files) ${tgz}`);
    if (opts.dryRun) {
      results.push({ name, version: next, action: "dry-run" });
      continue;
    }
    run([process.execPath, "publish", tgz, "--access", "public", "--tag", "latest"], staging);
    results.push({ name, version: next, action: "published" });
  }
  return results;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const value = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const results = await publishAll({
    dryRun: args.includes("--dry-run"),
    only: value("--only")?.split(","),
    out: value("--out"),
    registry: value("--registry"),
  });
  if (process.env.GITHUB_STEP_SUMMARY) {
    const rows = results.map(r => `| \`${r.name}\` | \`${r.version}\` | ${r.action} |`).join("\n");
    await Bun.write(process.env.GITHUB_STEP_SUMMARY, `| package | version | result |\n| --- | --- | --- |\n${rows}\n`);
  }
}
