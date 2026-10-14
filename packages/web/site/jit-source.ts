import { lstatSync, mkdirSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { GitTree } from "./collect";

/** Export only workspace metadata; dependency sources retain their canonical Git owners. */
export function jitWorkspaceMetadata(tree: Pick<GitTree, "files" | "readBytes">) {
  const root = tree.readBytes(["package.json", "bun.lock"]);
  const manifestBytes = root.get("package.json");
  if (!manifestBytes || !root.has("bun.lock")) throw new Error("JIT dependencies require the immutable root lock");
  const manifest = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(manifestBytes));
  const patterns = Array.isArray(manifest.workspaces) ? manifest.workspaces : manifest.workspaces?.packages;
  if (!Array.isArray(patterns) || !patterns.length || patterns.length > 128)
    throw new Error("JIT source requires bounded workspace patterns");
  const selected = new Set<string>();
  for (const raw of patterns) {
    if (typeof raw !== "string") throw new Error("Invalid workspace source pattern");
    const pattern = raw.replace(/^\.\//, "");
    if (
      !pattern ||
      isAbsolute(pattern) ||
      pattern.includes("\\") ||
      pattern.split("/").some(part => !part || part === ".." || part === ".")
    )
      throw new Error("Workspace source pattern escapes its owner");
    const glob = new Bun.Glob(pattern + "/package.json");
    for (const path of tree.files.keys()) if (glob.match(path)) selected.add(path);
  }
  if (!selected.size || selected.size > 256) throw new Error("Workspace metadata exceeds its bound");
  const files = new Map([...root, ...tree.readBytes([...selected].sort())]);
  const names = new Set<string>();
  for (const path of selected) {
    const bytes = files.get(path);
    if (!bytes || bytes.length > 1024 * 1024) throw new Error("Workspace manifest is missing or oversized");
    const metadata = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (typeof metadata.name !== "string" || !metadata.name || names.has(metadata.name))
      throw new Error("Workspace package names are missing or duplicate");
    names.add(metadata.name);
  }
  return files;
}

export async function exportJitWorkspaceMetadata(tree: GitTree, destination: string) {
  if (!isAbsolute(destination)) throw new Error("JIT output must be absolute");
  const root = realpathSync(destination);
  const files = jitWorkspaceMetadata(tree);
  const receipts: { path: string; bytes: number; sha256: string }[] = [];
  for (const [name, bytes] of files) {
    const path = resolve(root, name);
    const member = relative(root, path);
    if (isAbsolute(member) || member.startsWith("..")) throw new Error("JIT metadata escapes its output");
    for (let parent = dirname(path); parent !== root; parent = dirname(parent)) {
      try {
        const metadata = lstatSync(parent);
        if (metadata.isSymbolicLink() || !metadata.isDirectory()) throw new Error("JIT metadata parent is not owned");
      } catch (error) {
        if ((error as { code?: string }).code !== "ENOENT") throw error;
      }
    }
    const file = Bun.file(path);
    let existing = false;
    try {
      const metadata = lstatSync(path);
      if (metadata.isSymbolicLink() || !metadata.isFile()) throw new Error("JIT metadata file is not owned");
      existing = true;
    } catch (error) {
      if ((error as { code?: string }).code !== "ENOENT") throw error;
    }
    if (existing) {
      if (!Buffer.from(await file.bytes()).equals(bytes))
        throw new Error("JIT metadata differs from its immutable source");
    } else {
      mkdirSync(dirname(path), { recursive: true });
      await Bun.write(path, bytes);
    }
    receipts.push({
      path: name,
      bytes: bytes.length,
      sha256: new Bun.CryptoHasher("sha256").update(bytes).digest("hex"),
    });
  }
  const receipt = { schema: 1, source: tree.sha, scope: "workspace-metadata-only", files: receipts };
  await Bun.write(join(root, "jit-workspace-inputs.json"), JSON.stringify(receipt, null, 2) + "\n");
  return receipt;
}

/** Bind loaded graph sources to their Git export independently of the runtime executable. */
export async function verifyJitGraphFrontendSources(tree: GitTree, destination: string) {
  const root = resolve(destination);
  const paths = [
    "src/js/bun/graph-index.ts",
    "src/js/bun/graphx.ts",
    "scripts/aphrody/graph-index.ts",
    "scripts/aphrody/release-graph-index.ts",
    "scripts/aphrody/fork-graph-docs.ts",
  ];
  const files: { path: string; gitBlob: string; bytes: number; sha256: string }[] = [];
  for (const [path, expected] of tree.readBytes(paths)) {
    const file = join(root, path);
    for (let parent = dirname(file); parent !== root; parent = dirname(parent)) {
      const stat = lstatSync(parent);
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error("Graph frontend parent is not owned");
    }
    const stat = lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || !Buffer.from(await Bun.file(file).bytes()).equals(expected))
      throw new Error("Graph frontend differs from its immutable source: " + path);
    const gitBlob = tree.files.get(path);
    if (!gitBlob) throw new Error("Graph frontend has no immutable source blob");
    files.push({
      path,
      gitBlob,
      bytes: expected.length,
      sha256: new Bun.CryptoHasher("sha256").update(expected).digest("hex"),
    });
  }
  if (files.length !== paths.length) throw new Error("Incomplete immutable graph frontend closure");
  const receipt = {
    schema: 1,
    source: tree.sha,
    scope: "runtime-backed-graph-frontends",
    files,
    changedBinaryQualified: false,
  };
  await Bun.write(join(root, "jit-frontend-inputs.json"), JSON.stringify(receipt, null, 2) + "\n");
  return receipt;
}

async function ownerInstallCache(owner: string): Promise<string> {
  const child = Bun.spawn([process.execPath, "--no-env-file", "pm", "cache"], {
    cwd: owner,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    timeout: 10_000,
    maxBuffer: 64 * 1024,
  });
  const [code, stdout] = await Promise.all([child.exited, child.stdout.text(), child.stderr.text()]);
  const path = stdout.trim();
  if (code !== 0 || stdout.length > 32768 || !isAbsolute(path) || /[\r\n\0]/.test(path))
    throw new Error("Cloudflare owner install cache is unavailable");
  return realpathSync(path);
}

/** Reuse the installed Cloudflare owner only while its captured pins and lock agree. */
export async function verifyJitCloudflareDependencies(
  checkout: string,
  destination: string,
  source: string,
  installCache: (owner: string) => Promise<string> = ownerInstallCache,
) {
  const installed = join(checkout, "packages/bun-cloudflare");
  const captured = join(destination, "packages/bun-cloudflare");
  const [before, expected] = await Promise.all([
    Bun.file(join(installed, "package.json")).json(),
    Bun.file(join(captured, "package.json")).json(),
  ]);
  const pins = (manifest: Record<string, unknown>) =>
    JSON.stringify(
      Object.fromEntries(
        ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"].map(field => [
          field,
          Object.fromEntries(
            Object.entries((manifest[field] ?? {}) as Record<string, string>).sort(([a], [b]) => a.localeCompare(b)),
          ),
        ]),
      ),
    );
  if (before.name !== expected.name || pins(before) !== pins(expected))
    throw new Error("Installed Cloudflare dependency pins differ from their source owner");
  const lock = await Bun.file(join(captured, "bun.lock")).bytes();
  if (!Buffer.from(await Bun.file(join(installed, "bun.lock")).bytes()).equals(lock))
    throw new Error("Installed Cloudflare lock differs from its source owner");
  const parsedLock = Bun.JSONC.parse(new TextDecoder().decode(lock)) as {
    packages?: { wrangler?: unknown[] };
  };
  const locked = parsedLock.packages?.wrangler?.[0];
  const manifestPath = realpathSync(Bun.resolveSync("wrangler/package.json", join(captured, "src")));
  const ownerManifest = realpathSync(join(installed, "node_modules", "wrangler", "package.json"));
  if (manifestPath !== ownerManifest) throw new Error("Wrangler escapes its installed Cloudflare owner");
  const moduleRoot = realpathSync(join(installed, "node_modules"));
  const member = relative(moduleRoot, manifestPath);
  const metadata = await Bun.file(manifestPath).json();
  if (metadata.name !== "wrangler" || typeof metadata.version !== "string" || locked !== "wrangler@" + metadata.version)
    throw new Error("Wrangler bytes are labelled with a different captured version");
  if (isAbsolute(member) || member === ".." || member.startsWith(".." + sep)) {
    const cache = realpathSync(await installCache(installed));
    const parts = relative(cache, manifestPath).split(sep);
    const entry = parts[1];
    if (
      parts.length !== 5 ||
      parts[0] !== "links" ||
      parts[2] !== "node_modules" ||
      parts[3] !== "wrangler" ||
      parts[4] !== "package.json" ||
      typeof metadata.version !== "string" ||
      !entry?.startsWith("wrangler@" + metadata.version + "-") ||
      !/^[a-f0-9]{16}$/.test(entry.slice(("wrangler@" + metadata.version + "-").length))
    )
      throw new Error("Wrangler escapes its installed Cloudflare owner store");
    for (let index = 1; index <= parts.length; index++) {
      const stat = lstatSync(join(cache, ...parts.slice(0, index)));
      if (stat.isSymbolicLink() || (index === parts.length ? !stat.isFile() : !stat.isDirectory()))
        throw new Error("Wrangler store entry is not owned");
    }
  }
  const hash = (bytes: Uint8Array | string) => new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
  const receipt = {
    schema: 1,
    source,
    owner: "packages/bun-cloudflare",
    version: metadata.version as string,
    lockSha256: hash(lock),
    pinsSha256: hash(pins(expected)),
    manifestSha256: hash(await Bun.file(manifestPath).bytes()),
  };
  await Bun.write(join(destination, "jit-cloudflare-inputs.json"), JSON.stringify(receipt, null, 2) + "\n");
  return receipt;
}

if (import.meta.main) {
  const [checkout, source, output, mode] = Bun.argv.slice(2);
  if (!checkout || !source?.match(/^[a-f0-9]{40}$/) || !output)
    throw new Error("Expected checkout, immutable source commit and output");
  if (mode === "--verify-cloudflare")
    console.log(JSON.stringify(await verifyJitCloudflareDependencies(checkout, output, source)));
  else {
    if (mode) throw new Error("Unknown JIT metadata operation");
    const tree = new GitTree(checkout, source);
    const receipt = await exportJitWorkspaceMetadata(tree, output);
    const frontend = await verifyJitGraphFrontendSources(tree, output);
    console.log(
      JSON.stringify({ source: receipt.source, manifests: receipt.files.length, frontends: frontend.files.length }),
    );
  }
}
