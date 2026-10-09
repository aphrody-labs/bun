import { mkdir, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { parseArgs } from "node:util";

export interface ForkCapabilities {
  schemaVersion: 1;
  repository: "aphrody-labs/bun";
  source: {
    revision: string;
    upstreamRevision: string;
    mergeBase: string;
    dirty: boolean;
    trackedFileCount: number;
  };
  modules: { name: string; source: string; sha256: string; forkOnly: boolean }[];
  packages: {
    name: string;
    version: string | null;
    manifest: string;
    sha256: string;
    exports?: unknown;
    os?: string[];
    cpu?: string[];
  }[];
  nativeCrates: { name: string; manifest: string; sha256: string; crateTypes: string[] }[];
  sourceDelta: { status: string; path: string }[];
  coverage: { modules: number; packages: number; nativeCrates: number; sourceDelta: number };
}

async function git(root: string, args: string[]) {
  const proc = Bun.spawn(["git", "-C", root, ...args], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) throw new Error(`git ${args[0]} failed (${code}): ${stderr.trim()}`);
  return stdout;
}

export function moduleNames(source: string): string[] {
  return [...new Set([...source.matchAll(/#\[strum\(serialize = "(bun:[^"]+)"\)\]/g)].map(m => m[1]!))].sort();
}

export function parseDelta(source: string): ForkCapabilities["sourceDelta"] {
  const fields = source.split("\0");
  if (fields.at(-1) === "") fields.pop();
  if (fields.length % 2) throw new Error("Invalid Git source delta");
  const entries: ForkCapabilities["sourceDelta"] = [];
  for (let i = 0; i < fields.length; i += 2) {
    const status = fields[i]!;
    const path = fields[i + 1]!;
    if (!/^[ACDMTUXB]$/.test(status) || !path || path.split("/").includes(".."))
      throw new Error("Invalid Git source delta entry");
    entries.push({ status, path });
  }
  return entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

async function hashedText(root: string, path: string) {
  const bytes = await Bun.file(join(root, path)).bytes();
  return { text: new TextDecoder().decode(bytes), sha256: new Bun.CryptoHasher("sha256").update(bytes).digest("hex") };
}

export async function exportForkCapabilities(checkout: string, upstream = "upstream/main"): Promise<ForkCapabilities> {
  const root = await realpath(resolve(checkout));
  const top = await realpath((await git(root, ["rev-parse", "--show-toplevel"])).trim());
  if (root !== top) throw new Error("--root must select the Bun checkout root");
  const [revision, upstreamRevision, mergeBase, status, tracked] = await Promise.all([
    git(root, ["rev-parse", "HEAD"]),
    git(root, ["rev-parse", "--verify", `${upstream}^{commit}`]),
    git(root, ["merge-base", "HEAD", upstream]),
    git(root, ["status", "--porcelain", "--untracked-files=no"]),
    git(root, ["ls-files", "-z"]),
  ]);
  const paths = tracked.split("\0").filter(Boolean).sort();
  const registry = "src/resolve_builtins/HardcodedModule.rs";
  if (!paths.includes(registry)) throw new Error("Selected checkout has no Bun builtin registry");
  const [current, upstreamModules, delta] = await Promise.all([
    hashedText(root, registry),
    git(root, ["show", `${mergeBase.trim()}:${registry}`]),
    git(root, ["diff", "--name-status", "--no-renames", "-z", `${mergeBase.trim()}..${revision.trim()}`]),
  ]);
  const upstreamNames = new Set(moduleNames(upstreamModules));
  const modules = moduleNames(current.text).map(name => ({
    name,
    source: registry,
    sha256: current.sha256,
    forkOnly: !upstreamNames.has(name),
  }));
  const packages: ForkCapabilities["packages"] = [];
  const nativeCrates: ForkCapabilities["nativeCrates"] = [];
  for (const path of paths) {
    if (!/^(?:packages|src)\//.test(path)) continue;
    if (path.endsWith("/package.json")) {
      const file = await hashedText(root, path);
      const manifest = JSON.parse(file.text);
      if (typeof manifest.name !== "string" || !manifest.name.startsWith("@aphrody/")) continue;
      packages.push({
        name: manifest.name,
        version: typeof manifest.version === "string" ? manifest.version : null,
        manifest: path,
        sha256: file.sha256,
        ...(manifest.exports === undefined ? {} : { exports: manifest.exports }),
        ...(manifest.os === undefined ? {} : { os: manifest.os }),
        ...(manifest.cpu === undefined ? {} : { cpu: manifest.cpu }),
      });
    } else if (path.endsWith("/Cargo.toml")) {
      const file = await hashedText(root, path);
      const manifest = Bun.TOML.parse(file.text) as {
        package?: { name?: string };
        lib?: { "crate-type"?: string[] };
      };
      const crateTypes = manifest.lib?.["crate-type"] ?? [];
      if (!crateTypes.some(type => type === "cdylib" || type === "staticlib")) continue;
      if (!manifest.package?.name) throw new Error(`Native crate name missing: ${path}`);
      nativeCrates.push({ name: manifest.package.name, manifest: path, sha256: file.sha256, crateTypes });
    }
  }
  const sourceDelta = parseDelta(delta);
  return {
    schemaVersion: 1,
    repository: "aphrody-labs/bun",
    source: {
      revision: revision.trim(),
      upstreamRevision: upstreamRevision.trim(),
      mergeBase: mergeBase.trim(),
      dirty: status.length > 0,
      trackedFileCount: paths.length,
    },
    modules,
    packages,
    nativeCrates,
    sourceDelta,
    coverage: {
      modules: modules.length,
      packages: packages.length,
      nativeCrates: nativeCrates.length,
      sourceDelta: sourceDelta.length,
    },
  };
}

if (import.meta.main) {
  try {
    const { values } = parseArgs({
      options: {
        root: { type: "string" },
        upstream: { type: "string" },
        out: { type: "string" },
        "graph-docs": { type: "string" },
        domain: { type: "string", multiple: true },
        help: { type: "boolean" },
      },
      strict: true,
    });
    if (values.help) {
      console.log(
        "Usage: fork-capabilities.ts [--root <checkout>] [--upstream <ref>] [--out <absolute-json>] [--graph-docs <absolute-directory>] [--domain <src/name|packages/name> ...]",
      );
    } else {
      if (values.out && !isAbsolute(values.out)) throw new Error("--out must be an absolute path");
      const catalog = await exportForkCapabilities(values.root ?? resolve(import.meta.dir, "../.."), values.upstream);
      if (values.domain && !values["graph-docs"]) throw new Error("--domain requires --graph-docs");
      const evidence = values["graph-docs"]
        ? await (
            await import("./fork-graph-docs.ts")
          ).exportForkGraphDocs(values.root ?? resolve(import.meta.dir, "../.."), catalog, {
            out: values["graph-docs"],
            ...(values.domain ? { domains: values.domain } : {}),
          })
        : undefined;
      const json = JSON.stringify(catalog, null, 2) + "\n";
      if (values.out) {
        await mkdir(dirname(values.out), { recursive: true });
        await Bun.write(values.out, json);
        console.log(
          JSON.stringify({
            out: values.out,
            revision: catalog.source.revision,
            coverage: catalog.coverage,
            graphDocs: evidence ? values["graph-docs"] : undefined,
          }),
        );
      } else {
        process.stdout.write(json);
      }
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
