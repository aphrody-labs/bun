// Publishes the JS packages of the Aphrody runtime to npm under the @aphrody scope.
//
//   bun scripts/aphrody/publish-npm.ts [--dry-run] [--only <dir>[,<dir>]] [--out <dir>]
//
// Each package is copied into a staging directory, built there, and its
// manifest rewritten for publication (version, repository links, internal
// dependencies pinned to the versions published by this run), so the upstream
// package.json files stay untouched and merge cleanly. Versions follow
// `<base>-aphrody.<n>`: base is the Bun version from the root package.json for
// bun-types and the package's own version otherwise; --stable selects plain
// versions, with runtime-coupled packages fixed to the requested Bun version. A package whose packed
// content matches the newest published `<base>-aphrody.*` tarball is skipped,
// so re-running publishes nothing new.
//
// Published by their own scripts: @aphrody/bun-mdx-rs (napi addon built per
// platform, publish-mdx-rs.ts) and @aphrody/web-inspector-bun (built from a
// WebKit checkout, publish-web-inspector.ts).

import {
  chmodSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  readdirSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, posix, relative, resolve } from "node:path";
import { generate, inputFiles } from "../../packages/bun-agent-plugin/src/generate.ts";
import { isAphrodyBun } from "../../packages/bun-agent-plugin/src/hooks/common.ts";
import { SCOPE } from "./scope.ts";

const ROOT = join(import.meta.dir, "..", "..");
const REPO = "aphrody-labs/bun";
const DEP_FIELDS = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"] as const;

export function validateOutputDirectory(output: string, root = ROOT, temporary = tmpdir()): string {
  const canonical = (input: string): string => {
    let existing = resolve(input);
    const suffix: string[] = [];
    while (!existsSync(existing)) {
      const parent = dirname(existing);
      if (parent === existing) throw new Error(`Output has no existing ancestor: ${input}`);
      suffix.unshift(basename(existing));
      existing = parent;
    }
    return resolve(realpathSync(existing), ...suffix);
  };
  const inside = (parent: string, child: string) => {
    const path = relative(parent, child);
    return (
      path === "" ||
      (!isAbsolute(path) && path !== ".." && !path.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`))
    );
  };
  const checkout = canonical(root);
  const destination = canonical(output);
  const workspaceOutput = canonical(join(root, "tmp"));
  if (inside(destination, checkout) || (inside(checkout, destination) && !inside(workspaceOutput, destination)))
    throw new Error("Output must not overwrite the checkout or its tracked package sources");
  const allowed = [
    workspaceOutput,
    canonical(temporary),
    ...(process.env.RUNNER_TEMP ? [canonical(process.env.RUNNER_TEMP)] : []),
  ];
  if (!allowed.some(directory => inside(directory, destination)))
    throw new Error("Output must remain inside checkout tmp, the host temporary directory or RUNNER_TEMP");
  return destination;
}

export async function exportTrackedPackage(
  root: string,
  revision: string,
  directory: string,
  destination: string,
  sourcePaths?: readonly string[],
) {
  if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(revision) || !/^packages\/[^/\\:]+$/.test(directory))
    throw new Error("Expected an immutable source revision and one package directory");
  validateOutputDirectory(destination, root);
  if (existsSync(destination)) throw new Error("Package export destination must not exist");
  if (
    sourcePaths &&
    (!sourcePaths.includes("package.json") ||
      sourcePaths.some(
        path =>
          !path ||
          /[\\:\0*?{}]/.test(path) ||
          path.includes("[") ||
          path.includes("]") ||
          path.split("/").some(part => !part || part === "." || part === ".."),
      ))
  )
    throw new Error("Expected exact package source paths including its manifest");
  const listing = run(
    [
      "git",
      "--literal-pathspecs",
      "ls-tree",
      "-rz",
      "--long",
      "--full-tree",
      revision,
      "--",
      ...(sourcePaths ? sourcePaths.map(path => `${directory}/${path}`) : [directory]),
    ],
    root,
  );
  const entries = listing
    .split("\0")
    .filter(Boolean)
    .map(line => {
      const match = /^(100644|100755|120000) blob ([a-f0-9]+)\s+(\d+)\t(.+)$/.exec(line);
      if (!match) throw new Error("Unsupported package source entry");
      const [, mode, blob, size, sourcePath] = match;
      if (!mode || !blob || !size || !sourcePath || !sourcePath.startsWith(directory + "/"))
        throw new Error("Unsupported package source entry");
      const path = sourcePath.slice(directory.length + 1);
      if (
        path
          .split("/")
          .some(
            part =>
              ["..", ".ssh", ".codex", ".claude", ".aphrody", "cookies", "sessions"].includes(part) ||
              part === ".env" ||
              part.startsWith(".env.") ||
              /\.(?:pem|key|p12|sqlite|safetensors|gguf)$/i.test(part),
          )
      )
        throw new Error(`Protected package source: ${path}`);
      return { path, mode, blob, size: Number(size) };
    });
  if (!entries.length) throw new Error(`No tracked package sources: ${directory}`);
  const child = Bun.spawn(["git", "-C", root, "cat-file", "--batch"], {
    stdin: new Blob([entries.map(entry => entry.blob + "\n").join("")]),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [buffer, stderr, code] = await Promise.all([
    new Response(child.stdout).arrayBuffer(),
    Bun.readableStreamToText(child.stderr),
    child.exited,
  ]);
  if (code) throw new Error(`Package blob export failed: ${stderr.trim()}`);
  const bytes = new Uint8Array(buffer);
  let offset = 0;
  const files = entries.map(entry => {
    const end = bytes.indexOf(10, offset);
    const header = new TextDecoder().decode(bytes.subarray(offset, end));
    if (end < offset || header !== `${entry.blob} blob ${entry.size}`)
      throw new Error(`Package blob header differs: ${entry.path}`);
    offset = end + 1;
    const data = bytes.subarray(offset, offset + entry.size);
    const hash = new Bun.CryptoHasher(entry.blob.length === 64 ? "sha256" : "sha1")
      .update(`blob ${data.length}\0`)
      .update(data)
      .digest("hex");
    if (data.length !== entry.size || hash !== entry.blob) throw new Error(`Package blob hash differs: ${entry.path}`);
    offset += entry.size;
    if (bytes[offset++] !== 10) throw new Error(`Package blob separator differs: ${entry.path}`);
    return { ...entry, data, sha256: new Bun.CryptoHasher("sha256").update(data).digest("hex") };
  });
  if (offset !== bytes.length) throw new Error("Unexpected package blob trailing bytes");
  const byPath = new Map(files.map(file => [file.path, file]));
  for (const file of files.filter(file => file.mode === "120000")) {
    let current = file;
    const seen = new Set<string>();
    while (current.mode === "120000") {
      if (seen.has(current.path)) throw new Error(`Cyclic package symlink: ${file.path}`);
      seen.add(current.path);
      const link = new TextDecoder("utf-8", { fatal: true }).decode(current.data);
      if (posix.isAbsolute(link) || /[\\:\0]/.test(link)) throw new Error(`Escaping package symlink: ${file.path}`);
      const target = posix.normalize(posix.join(posix.dirname(current.path), link));
      if (target === ".." || target.startsWith("../") || !byPath.has(target))
        throw new Error(`Escaping or untracked package symlink: ${file.path}`);
      current = byPath.get(target)!;
    }
  }
  for (const file of files.filter(file => file.mode !== "120000")) {
    const target = join(destination, file.path);
    mkdirSync(dirname(target), { recursive: true });
    await Bun.write(target, file.data);
    chmodSync(target, file.mode === "100755" ? 0o755 : 0o644);
  }
  for (const file of files.filter(file => file.mode === "120000")) {
    const target = join(destination, file.path);
    mkdirSync(dirname(target), { recursive: true });
    symlinkSync(new TextDecoder("utf-8", { fatal: true }).decode(file.data), target, "file");
  }
  return {
    sourceRevision: revision,
    directory,
    ...(sourcePaths ? { sourcePaths } : {}),
    files: files.map(file => ({
      path: file.path,
      mode: file.mode,
      blob: file.blob,
      size: file.size,
      sha256: file.sha256,
    })),
  };
}

export interface PackageSpec {
  /** Directory under packages/, also the upstream npm name. */
  dir: string;
  /** npm name under the scope when it is not `dir` (fork-only packages). */
  name?: string;
  /** Use the Bun version as the version base instead of the package's own. */
  bunVersion?: boolean;
  /** Preparation invokes a build; excluded from no-build publication. */
  requiresBuild?: boolean;
  buildOutputs?: string[];
  /** Exact source roots for source-only facades; manifest expansion must remain within them. */
  sourcePaths?: readonly string[];
  /** Sources read by preparation outside the exported package. */
  sourceInputs?: (root: string) => string[];
  /** Read-only projections qualified by importing them on native Windows. */
  platform?: "win32";
  /** Fork packages imported by the published sources but not listed in the manifest. */
  addDependencies?: string[];
  /** Manifest fields set for publication. */
  fields?: Record<string, unknown>;
  prepare?: (staging: string, ctx: { base: string }) => Promise<void> | void;
}

function run(cmd: string[], cwd: string, env: Record<string, string> = {}) {
  const proc = Bun.spawnSync(cmd, {
    cwd,
    env: { ...process.env, ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  if (proc.exitCode !== 0) {
    throw new Error(`${cmd.join(" ")} failed (${proc.exitCode}):\n${proc.stdout}\n${proc.stderr}`);
  }
  return proc.stdout.toString();
}

export function assertPublicationSources(root: string, revision: string, paths: string[]): void {
  if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(revision) || !paths.length)
    throw new Error("Expected pinned publication sources");
  const scoped = [
    ...new Set(
      paths.map(path => {
        const local = relative(root, resolve(root, path));
        if (!local || isAbsolute(local) || local === ".." || local.startsWith("..\\") || local.startsWith("../"))
          throw new Error("Publication source must remain inside the checkout");
        return local.replaceAll("\\", "/");
      }),
    ),
  ];
  const changed = run(["git", "diff", "--name-only", revision, "--", ...scoped], root).trim();
  const untracked = run(["git", "ls-files", "--others", "--exclude-standard", "--", ...scoped], root).trim();
  if (changed || untracked) throw new Error("Publication sources differ from the pinned commit");
}

export const PACKAGES: PackageSpec[] = [
  {
    dir: "bun-types",
    buildOutputs: ["package.json", "CLAUDE.md", "docs/"],
    bunVersion: true,
    requiresBuild: true,
    sourceInputs: root => [join(root, "docs"), join(root, "src/cli/init/rule.md")],
    fields: {
      description: "Type definitions and documentation for Bun (Aphrody runtime, based on Bun)",
    },
    // Generates CLAUDE.md and docs/ next to the .d.ts files, as release.yml does upstream.
    prepare: (staging, { base }) =>
      void run([process.execPath, "scripts/build.ts", staging], join(ROOT, "packages", "bun-types"), {
        BUN_VERSION: base,
      }),
  },
  {
    dir: "bun-inspector-protocol",
    sourceInputs: root => [join(root, "packages/bun-debug-adapter-protocol/src/debugger/node-socket-framer.ts")],
    buildOutputs: ["src/inspector/node-socket-framer.ts", "src/inspector/node-socket.ts", "index.js"],
    requiresBuild: true,
    fields: {
      description: "WebKit Inspector Protocol client for Bun (Aphrody runtime, based on Bun)",
    },
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
    buildOutputs: ["src/"],
    addDependencies: ["bun-inspector-protocol"],
    fields: {
      description: "Debug Adapter Protocol implementation for Bun (Aphrody runtime, based on Bun)",
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
    fields: { description: "Svelte plugin for Bun (Aphrody runtime, based on Bun)" },
  },
  {
    dir: "bun-plugin-yaml",
    fields: { description: "YAML plugin for Bun (Aphrody runtime, based on Bun)" },
  },
  { dir: "bun-sql" },
  { dir: "bun-runtime-sdk" },
  { dir: "bun-supervisor", name: "supervisor", sourcePaths: ["src", "systemd"] },
  { dir: "bun-tools", sourcePaths: ["src"] },
  { dir: "bun-nginx", bunVersion: true },
  // REST services and explicit credential adapters over the qualified bun:google builtin.
  { dir: "bun-google", bunVersion: true },
  { dir: "bun-chromium", bunVersion: true },
  { dir: "bun-fuzzy", name: "fuzzy" },
  { dir: "bun-qr", name: "qr" },
  { dir: "bun-timeline", name: "timeline" },
  { dir: "bun-x", name: "x" },
  {
    dir: "bun-agent-plugin",
    sourceInputs: root => inputFiles(root),
    buildOutputs: ["plugins/"],
    bunVersion: true,
    fields: { files: ["bin", "src", "memory", "plugins", "README.md"] },
    prepare: async staging => {
      const files = generate({ root: ROOT, pkg: join(ROOT, "packages/bun-agent-plugin") });
      for (const [path, contents] of files) {
        const destination = join(staging, "plugins", path);
        mkdirSync(dirname(destination), { recursive: true });
        await Bun.write(destination, contents);
      }
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
      const name = npmName(PACKAGES.find(spec => spec.dir === dir)!);
      return rest.startsWith("index.ts") ? `${quote}${name}${quote}` : `${quote}${name}/${rest}`;
    },
  );
}

/** Next `<base>-aphrody.<n>` version and the newest existing one for that base. */
export function nextVersion(base: string, published: Iterable<string>): { next: string; previous: string | undefined } {
  const re = new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-aphrody\\.(\\d+)$`);
  let max = 0;
  let stableExists = false;
  for (const v of published) {
    if (v === base) stableExists = true;
    const m = re.exec(v);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return {
    next: `${base}-aphrody.${max + 1}`,
    previous: max ? `${base}-aphrody.${max}` : stableExists ? base : undefined,
  };
}

export function nextStableVersion(
  base: string,
  published: Iterable<string>,
): { next: string; previous: string | undefined } {
  if (!/^\d+\.\d+\.\d+$/.test(base)) throw new Error(`Stable package base must be X.Y.Z: ${base}`);
  const [major = 0, minor = 0, patch = 0] = base.split(".").map(Number);
  let latest = -1;
  for (const version of published) {
    if (!/^\d+\.\d+\.\d+$/.test(version)) continue;
    const [a, b, c = 0] = version.split(".").map(Number);
    if (a === major && b === minor && c >= patch) latest = Math.max(latest, c);
  }
  return {
    next: `${major}.${minor}.${latest < patch ? patch : latest + 1}`,
    previous: latest < patch ? undefined : `${major}.${minor}.${latest}`,
  };
}

export function assertLatestVersionDoesNotRegress(version: string, latest?: string): void {
  if (latest && Bun.semver.order(version, latest) < 0)
    throw new Error(`Refusing to move npm latest backwards from ${latest} to ${version}`);
}

function forkName(dep: string): string | undefined {
  const short = dep === "@types/bun" ? "bun-types" : dep.startsWith(`${SCOPE}/`) ? dep.slice(SCOPE.length + 1) : dep;
  return PACKAGES.find(spec => spec.dir === short || spec.name === short)?.dir;
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
  if (pkg.private === true) throw new Error(`${spec.dir}: private packages cannot be published`);
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
      next[npmName(PACKAGES.find(candidate => candidate.dir === fork)!)] = pinned;
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
  out.repository = {
    type: "git",
    url: `git+https://github.com/${REPO}.git`,
    directory: `packages/${spec.dir}`,
  };
  out.bugs = { url: `https://github.com/${REPO}/issues` };
  out.publishConfig = { access: "public" };
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function packument(registry: string, name: string): Promise<Record<string, any> | undefined> {
  const res = await fetch(`${registry}/${name.replace("/", "%2f")}`, {
    headers: { accept: "application/vnd.npm.install-v1+json" },
  });
  if (res.status === 404) return undefined;
  if (!res.ok) throw new Error(`GET ${name}: ${res.status} ${await res.text()}`);
  const record = await res.json();
  if (!isRecord(record)) throw new Error(`GET ${name}: registry returned an invalid package document`);
  return record;
}

function pack(staging: string, dest: string, noBuild = false): string {
  validateOutputDirectory(staging);
  validateOutputDirectory(dest);
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  run(
    [process.execPath, "pm", "pack", "--destination", dest, "--quiet", ...(noBuild ? ["--ignore-scripts"] : [])],
    staging,
  );
  const [tgz] = readdirSync(dest).filter(f => f.endsWith(".tgz"));
  if (!tgz) throw new Error(`bun pm pack produced no tarball in ${dest}`);
  return join(dest, tgz);
}

export async function verifyPreparedPackage(
  staging: string,
  files: { path: string; mode: string; sha256: string }[],
  allowed: string[],
) {
  const expected = new Map(files.map(file => [file.path, file]));
  const outputs: { path: string; sha256: string; mode: string; removed?: boolean }[] = [];
  const declared = (path: string) =>
    allowed.some(output => (output.endsWith("/") ? path.startsWith(output) : path === output));
  const walk = (directory: string): string[] =>
    readdirSync(join(staging, directory), { withFileTypes: true }).flatMap(entry => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? walk(path) : [path];
    });
  for (const path of walk("")) {
    const portable = path.replaceAll("\\", "/");
    if (
      portable
        .split("/")
        .some(
          part =>
            [".ssh", ".codex", ".claude", ".aphrody", "cookies", "sessions"].includes(part) ||
            part === ".env" ||
            part.startsWith(".env.") ||
            /\.(?:pem|key|p12|sqlite|safetensors|gguf)$/i.test(part),
        )
    )
      throw new Error(`Protected package build output: ${portable}`);
    const original = expected.get(portable);
    const stat = lstatSync(join(staging, path));
    if (stat.isSymbolicLink()) {
      const link = readlinkSync(join(staging, path));
      const target = relative(realpathSync(staging), realpathSync(join(staging, path)));
      if (isAbsolute(target) || target === ".." || target.startsWith("../") || target.startsWith("..\\"))
        throw new Error(`Escaping package build symlink: ${portable}`);
      const hash = new Bun.CryptoHasher("sha256").update(link).digest("hex");
      if (original?.mode !== "120000" || original.sha256 !== hash)
        throw new Error(`Changed package symlink: ${portable}`);
      expected.delete(portable);
      continue;
    }
    if (original && process.platform !== "win32" && Boolean(stat.mode & 0o111) !== (original.mode === "100755"))
      throw new Error(`Changed package source mode: ${portable}`);
    const sha256 = new Bun.CryptoHasher("sha256")
      .update(await Bun.file(join(staging, path)).arrayBuffer())
      .digest("hex");
    expected.delete(portable);
    if (original?.sha256 === sha256) continue;
    if (!declared(portable)) throw new Error(`Undeclared package build output: ${portable}`);
    outputs.push({ path: portable, sha256, mode: stat.mode & 0o111 ? "100755" : "100644" });
  }
  for (const file of expected.values()) {
    if (!declared(file.path)) throw new Error(`Undeclared removed package source: ${file.path}`);
    outputs.push({ path: file.path, sha256: file.sha256, mode: file.mode, removed: true });
  }
  return outputs;
}

export function facadeSourcePaths(
  manifest: Record<string, any>,
  declared: readonly string[],
  rootNames: readonly string[],
): string[] {
  const metadata = rootNames.filter(name => /^(?:licen[cs]e|readme|notice)(?:[._-].*)?$/i.test(name));
  const selected = ["package.json", ...declared, ...metadata];
  const covered = (written: string) => {
    const path = written.replace(/^\.\//, "");
    if (!path || /[\\:\0]/.test(path) || path.split("/").some(part => part === ".." || part === ".")) return false;
    if (!/[?*[{]/.test(path)) return selected.some(root => path === root || path.startsWith(root + "/"));
    if (!path.includes("/")) {
      const matches = rootNames.filter(name => new Bun.Glob(path).match(name));
      return matches.length > 0 && matches.every(name => metadata.includes(name));
    }
    const firstGlob = path.search(/[?*[{]/);
    const prefix = path.slice(0, path.lastIndexOf("/", firstGlob) + 1).replace(/\/$/, "");
    return declared.some(root => prefix === root || prefix.startsWith(root + "/"));
  };
  if (
    !Array.isArray(manifest.files) ||
    !manifest.files.length ||
    manifest.files.some(path => typeof path !== "string" || !covered(path))
  )
    throw new Error("Facade files exceed the qualified source closure");
  const targets = (value: unknown): boolean => {
    if (typeof value === "string") return covered(value);
    if (value && typeof value === "object") return Object.values(value).every(targets);
    return false;
  };
  for (const field of ["exports", "main", "module", "types", "bin"])
    if (manifest[field] !== undefined && !targets(manifest[field]))
      throw new Error("Facade entrypoints exceed the qualified source closure");
  return [...new Set(selected)].sort();
}

export function packageSourcePaths(root: string, revision: string, spec: PackageSpec, manifest: Record<string, any>) {
  if (!spec.sourcePaths) return undefined;
  if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(revision) || !/^[^/\\:]+$/.test(spec.dir))
    throw new Error("Expected pinned package source selection");
  const names = run(["git", "ls-tree", "--name-only", "-z", `${revision}:packages/${spec.dir}`], root)
    .split("\0")
    .filter(Boolean);
  return facadeSourcePaths(manifest, spec.sourcePaths, names);
}

async function stage(
  spec: PackageSpec,
  out: string,
  base: string,
  sourceRevision: string,
  manifest: Record<string, any>,
): Promise<string> {
  const staging = join(out, spec.dir);
  validateOutputDirectory(staging);
  rmSync(staging, { recursive: true, force: true });
  const sourcePaths = packageSourcePaths(ROOT, sourceRevision, spec, manifest);
  const receipt = await exportTrackedPackage(ROOT, sourceRevision, `packages/${spec.dir}`, staging, sourcePaths);
  await spec.prepare?.(staging, { base });
  const outputs = await verifyPreparedPackage(staging, receipt.files, spec.buildOutputs ?? []);
  if (!readdirSync(staging).some(f => /^licen[cs]e/i.test(f))) {
    const license = run(["git", "show", `${sourceRevision}:LICENSE.md`], ROOT);
    await Bun.write(join(staging, "LICENSE.md"), license);
    outputs.push({
      path: "LICENSE.md",
      mode: "100644",
      sha256: new Bun.CryptoHasher("sha256").update(license).digest("hex"),
    });
  }
  await Bun.write(join(out, `${spec.dir}.source.json`), JSON.stringify({ ...receipt, outputs }, null, 2) + "\n");
  return staging;
}

export interface Result {
  name: string;
  version: string;
  action: "published" | "pending" | "unchanged" | "dry-run";
  sourceRevision: string;
  sourceVerified: boolean;
  integrity?: string;
  contentHash: string;
}

export async function publicationStatus(
  response: Response,
  expected: { name: string; version: string; integrity: string },
): Promise<"published" | "pending"> {
  if (response.status === 404) return "pending";
  if (!response.ok)
    throw new Error(`${expected.name}@${expected.version}: public verification HTTP ${response.status}`);
  let record = await response.json();
  if (isRecord(record) && isRecord(record.versions)) {
    if (record.name !== expected.name)
      throw new Error(`${expected.name}@${expected.version}: registry returned a different package or version`);
    if (!(expected.version in record.versions)) return "pending";
    record = record.versions[expected.version];
  }
  if (!isRecord(record) || record.name !== expected.name || record.version !== expected.version) {
    throw new Error(`${expected.name}@${expected.version}: registry returned a different package or version`);
  }
  const dist = record.dist;
  if (
    !isRecord(dist) ||
    typeof dist.integrity !== "string" ||
    !dist.integrity.split(/\s+/).includes(expected.integrity)
  ) {
    throw new Error(`${expected.name}@${expected.version}: registry integrity differs from the uploaded tarball`);
  }
  return "published";
}

export async function publishAll(opts: {
  dryRun?: boolean;
  stable?: boolean;
  noBuild?: boolean;
  only?: string[];
  out?: string;
  registry?: string;
  portableQualification?: string;
  pluginQualification?: string;
  /** Owner waiver (2026-10-18): publish the plugin without a qualification record. Logged, never implied. */
  waivePluginQualification?: boolean;
}): Promise<Result[]> {
  if (opts.only?.some(dir => !PACKAGES.some(spec => spec.dir === dir)))
    throw new Error("Unknown package directory in --only");
  const includesPlugin = !opts.only?.length || opts.only.includes("bun-agent-plugin");
  if (opts.pluginQualification && !includesPlugin)
    throw new Error("Plugin qualification cannot authorize a selection without bun-agent-plugin");
  if (!opts.dryRun && includesPlugin && !opts.pluginQualification && !opts.waivePluginQualification)
    throw new Error(
      "Publishing bun-agent-plugin requires --plugin-qualification, including mixed or all-package selections",
    );
  if (opts.waivePluginQualification && includesPlugin && !opts.dryRun)
    console.warn("WAIVED: bun-agent-plugin is published without a qualification record, by the owner's instruction");
  if (!opts.dryRun && includesPlugin && !opts.waivePluginQualification) {
    const { verifyPluginNpmQualification } = await import("./release-portable-npm.ts");
    await verifyPluginNpmQualification(opts.pluginQualification!, run(["git", "rev-parse", "HEAD"], ROOT).trim());
  }
  if (opts.noBuild) {
    const building = PACKAGES.filter(
      spec => spec.requiresBuild && (!opts.only?.length || opts.only.includes(spec.dir)),
    );
    if (building.length)
      throw new Error(
        `--no-build cannot prepare ${building.map(spec => spec.dir).join(", ")}; select source packages with --only`,
      );
  }
  const registry = (opts.registry ?? process.env.NPM_CONFIG_REGISTRY ?? "https://registry.npmjs.org").replace(
    /\/$/,
    "",
  );
  const out = validateOutputDirectory(opts.out ?? join(tmpdir(), "aphrody-npm"));
  mkdirSync(out, { recursive: true });
  const sourceRevision = run(["git", "rev-parse", "HEAD"], ROOT).trim();
  const sourceManifest = (path: string) => JSON.parse(run(["git", "show", `${sourceRevision}:${path}`], ROOT));
  const bunVersion: string = sourceManifest("package.json").version;
  const selectedSpecs = PACKAGES.filter(spec => !opts.only?.length || opts.only.includes(spec.dir));
  const needed = new Set(selectedSpecs.map(spec => spec.dir));
  const visit = (spec: PackageSpec) => {
    const manifest = sourceManifest(`packages/${spec.dir}/package.json`);
    if (manifest.private === true) throw new Error(`${spec.dir}: private packages cannot be published`);
    for (const name of [
      ...DEP_FIELDS.flatMap(field => Object.keys(manifest[field] ?? {})),
      ...(spec.addDependencies ?? []),
    ]) {
      const fork = forkName(name);
      if (fork && !needed.has(fork)) {
        needed.add(fork);
        visit(PACKAGES.find(candidate => candidate.dir === fork)!);
      }
    }
  };
  for (const spec of selectedSpecs) visit(spec);
  const sourcePaths = [
    "package.json",
    "bun.lock",
    "LICENSE.md",
    "scripts/aphrody/publish-npm.ts",
    "scripts/aphrody/scope.ts",
    "packages/bun-agent-plugin/src",
    ...PACKAGES.filter(spec => needed.has(spec.dir)).flatMap(spec => [
      `packages/${spec.dir}`,
      ...(spec.sourceInputs?.(ROOT) ?? []),
    ]),
  ];
  if (!opts.dryRun) assertPublicationSources(ROOT, sourceRevision, sourcePaths);
  const resolved = new Map<string, string>();
  const results: Result[] = [];

  for (const spec of PACKAGES) {
    if (!needed.has(spec.dir)) continue;
    const name = npmName(spec);
    const selected = !opts.only?.length || opts.only.includes(spec.dir);
    const doc = await packument(registry, name);
    if (!selected) {
      // Dependents still need a version to pin.
      const latest = doc?.["dist-tags"]?.latest;
      if (latest) resolved.set(spec.dir, latest);
      continue;
    }

    const srcPkg = sourceManifest(`packages/${spec.dir}/package.json`);
    if (spec.platform && process.platform !== spec.platform)
      throw new Error(`${name}: qualification requires native ${spec.platform}`);
    if (spec.platform) require(join(ROOT, "packages", spec.dir, srcPkg.main));
    const base = spec.bunVersion || !srcPkg.version || srcPkg.version === "0.0.0" ? bunVersion : srcPkg.version;
    const { next, previous } = (opts.stable ? nextStableVersion : nextVersion)(base, Object.keys(doc?.versions ?? {}));
    if (opts.stable && next !== base && previous !== base) {
      throw new Error(`${name}: registry stable versions exceed the requested runtime ${base}`);
    }

    const manifest = publishManifest(srcPkg, spec, next, resolved);
    const staging = await stage(spec, out, base, sourceRevision, manifest);
    await Bun.write(join(staging, "package.json"), JSON.stringify(manifest, null, 2) + "\n");
    const tgz = pack(staging, join(out, "tarballs", spec.dir), opts.noBuild);
    if (!opts.dryRun) assertPublicationSources(ROOT, sourceRevision, sourcePaths);
    const files = await tarballFiles(await Bun.file(tgz).bytes());

    const packed = JSON.parse(new TextDecoder().decode(files.get("package/package.json")!));
    for (const field of DEP_FIELDS) {
      for (const [dep, range] of Object.entries<string>(packed[field] ?? {})) {
        if (/^(?:workspace|file|link):|^\.{0,2}\//.test(range)) {
          throw new Error(`${name}: ${field}.${dep} is still local (${range}) in the packed tarball`);
        }
      }
    }

    if (!opts.dryRun && spec.dir === "bun-agent-plugin" && !opts.waivePluginQualification) {
      const { verifyPluginNpmPublication } = await import("./release-portable-npm.ts");
      await verifyPluginNpmPublication(opts.pluginQualification!, {
        source: sourceRevision,
        directory: spec.dir,
        archive: tgz,
      });
    }
    if (previous) {
      const tarball = doc!.versions[previous].dist.tarball;
      const prevFiles = await tarballFiles(new Uint8Array(await (await fetch(tarball)).arrayBuffer()));
      if (contentHash(prevFiles) === contentHash(files) && (!opts.stable || previous === base)) {
        resolved.set(spec.dir, previous);
        results.push({
          name,
          version: previous,
          action: "unchanged",
          sourceRevision,
          sourceVerified: !opts.dryRun,
          integrity: doc!.versions[previous].dist.integrity,
          contentHash: contentHash(files),
        });
        console.log(`= ${name}@${previous} unchanged`);
        continue;
      }
    }
    if (opts.stable && next !== base) {
      throw new Error(`${name}@${base} already exists with different content; runtime versions are immutable`);
    }

    assertLatestVersionDoesNotRegress(next, doc?.["dist-tags"]?.latest);

    resolved.set(spec.dir, next);
    console.log(`${opts.dryRun ? "~" : "+"} ${name}@${next} (${files.size} files) ${tgz}`);
    if (opts.dryRun) {
      results.push({
        name,
        version: next,
        action: "dry-run",
        sourceRevision,
        sourceVerified: false,
        contentHash: contentHash(files),
      });
      continue;
    }
    if (opts.portableQualification) {
      const { verifyPortableNpmPublication } = await import("./release-portable-npm.ts");
      await verifyPortableNpmPublication(opts.portableQualification, {
        source: sourceRevision,
        only: opts.only?.join(",") ?? "",
        directory: spec.dir,
        archive: tgz,
      });
    }
    run(
      [
        process.execPath,
        "publish",
        tgz,
        "--access",
        "public",
        "--tag",
        "latest",
        ...(opts.noBuild ? ["--ignore-scripts"] : []),
      ],
      staging,
    );
    const response = await fetch(`${registry}/${name.replace("/", "%2f")}`, {
      headers: { accept: "application/json", "cache-control": "no-cache" },
    });
    const integrity = `sha512-${new Bun.CryptoHasher("sha512").update(await Bun.file(tgz).bytes()).digest("base64")}`;
    const action = await publicationStatus(response, { name, version: next, integrity });
    if (action === "pending")
      console.log(`? ${name}@${next}: upload accepted; exact version is not publicly available yet`);
    results.push({
      name,
      version: next,
      action,
      sourceRevision,
      sourceVerified: action === "published",
      integrity,
      contentHash: contentHash(files),
    });
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
    stable: args.includes("--stable"),
    noBuild: args.includes("--no-build"),
    ...(value("--only") ? { only: value("--only")!.split(",") } : {}),
    ...(value("--out") ? { out: value("--out")! } : {}),
    ...(value("--registry") ? { registry: value("--registry")! } : {}),
    ...(value("--portable-qualification") ? { portableQualification: value("--portable-qualification")! } : {}),
    ...(args.includes("--waive-plugin-qualification") ? { waivePluginQualification: true } : {}),
    ...(value("--plugin-qualification") ? { pluginQualification: value("--plugin-qualification")! } : {}),
  });
  const reportPath = value("--report");
  if (reportPath) {
    validateOutputDirectory(dirname(resolve(reportPath)));
    await Bun.write(
      resolve(reportPath),
      JSON.stringify({ schema: 1, sourceRevision: results[0]?.sourceRevision, packages: results }, null, 2) + "\n",
    );
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    const rows = results.map(r => `| \`${r.name}\` | \`${r.version}\` | ${r.action} |`).join("\n");
    await Bun.write(process.env.GITHUB_STEP_SUMMARY, `| package | version | result |\n| --- | --- | --- |\n${rows}\n`);
  }
}
