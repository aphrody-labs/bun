import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { indexFiles } from "./pyjs-index.ts";
import { BunPython, registryPath } from "./pyjs-store.ts";
import { v8HeaderVersion, v8RuntimeVersion } from "./v8.ts";

const args = process.argv.slice(2);
const option = (name: string, fallback?: string) => {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
};
const workspace = resolve(import.meta.dir, "../..");
const checkout = resolve(option("--root", join(workspace, ".coord", "v8"))!);
const out = resolve(option("--out", join(workspace, "tmp", "bun-python", "v8"))!);
const deno = option("--deno", Bun.which("deno") ?? undefined);
if (!deno) throw new Error("--deno requires a qualified executable");
mkdirSync(out, { recursive: true });
using registry = new BunPython(option("--db", registryPath));
const operation = registry.startRun("engine-graph", [process.execPath, ...process.argv.slice(1)], workspace, {
  checkout,
  out,
});
let finished = false;

async function command(argv: string[], cwd = workspace) {
  const run = registry.startRun("engine-graph-command", argv, cwd, { parent: operation });
  let recorded = false;
  try {
    await using proc = Bun.spawn({ cmd: argv, cwd, stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, code] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
    registry.finishRun(run, code, stdout, stderr);
    recorded = true;
    if (code !== 0) throw new Error(`${argv[0]} exited ${code}: ${stderr.trim()}`);
    return stdout.trim();
  } catch (error) {
    if (!recorded) registry.finishRun(run, 1, "", String(error));
    throw error;
  }
}

async function source(url: string, name: string) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(30000),
    headers: { "User-Agent": "aphrody-source-graph" },
  });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const text = await response.text();
  const path = join(out, name);
  await Bun.write(path, text);
  await registry.artifact(path, "engine-provenance-source", operation, { url });
  return text;
}

try {
  const versionText = await command([
    deno,
    "eval",
    "--no-config",
    "--no-lock",
    "--no-remote",
    "--no-npm",
    "console.log(JSON.stringify(Deno.version))",
  ]);
  const versions: unknown = JSON.parse(versionText);
  if (
    !versions ||
    typeof versions !== "object" ||
    !("deno" in versions) ||
    !("v8" in versions) ||
    typeof versions.deno !== "string" ||
    typeof versions.v8 !== "string" ||
    !/^\d+\.\d+\.\d+$/.test(versions.deno)
  )
    throw new Error("Invalid Deno runtime provenance");
  const runtimeV8 = v8RuntimeVersion(versions.v8);
  await registry.artifact(deno, "engine-executable", operation, { versions, engine: "V8" });
  const lockUrl = `https://raw.githubusercontent.com/denoland/deno/v${versions.deno}/Cargo.lock`;
  const lock = Bun.TOML.parse(await source(lockUrl, "deno-Cargo.lock")) as { package?: unknown };
  if (!Array.isArray(lock.package)) throw new Error("Deno Cargo.lock has no package graph");
  const packageV8: unknown = lock.package.find(
    (entry: unknown) => !!entry && typeof entry === "object" && "name" in entry && entry.name === "v8",
  );
  if (
    !packageV8 ||
    typeof packageV8 !== "object" ||
    !("version" in packageV8) ||
    typeof packageV8.version !== "string" ||
    !/^\d+\.\d+\.\d+$/.test(packageV8.version)
  )
    throw new Error("Deno Cargo.lock has no pinned rusty_v8");
  const rustyTag = `v${packageV8.version}`;
  const treeUrl = `https://api.github.com/repos/denoland/rusty_v8/git/trees/${rustyTag}`;
  const tree: unknown = JSON.parse(await source(treeUrl, "rusty-v8-tree.json"));
  if (
    !tree ||
    typeof tree !== "object" ||
    !("tree" in tree) ||
    !Array.isArray(tree.tree) ||
    !("sha" in tree) ||
    typeof tree.sha !== "string"
  )
    throw new Error("Invalid rusty_v8 Git tree");
  const gitlink: unknown = tree.tree.find(
    (entry: unknown) => !!entry && typeof entry === "object" && "path" in entry && entry.path === "v8",
  );
  if (
    !gitlink ||
    typeof gitlink !== "object" ||
    !("mode" in gitlink) ||
    gitlink.mode !== "160000" ||
    !("sha" in gitlink) ||
    typeof gitlink.sha !== "string" ||
    !/^[0-9a-f]{40}$/.test(gitlink.sha)
  )
    throw new Error("rusty_v8 tag has no exact V8 Git link");
  await source(`https://raw.githubusercontent.com/denoland/rusty_v8/${rustyTag}/.gitmodules`, "rusty-v8.gitmodules");
  const repositoryUrl = await command([
    "git",
    "config",
    "--file",
    join(out, "rusty-v8.gitmodules"),
    "--get",
    "submodule.v8.url",
  ]);
  if (repositoryUrl !== "https://github.com/denoland/v8.git") throw new Error("Unexpected V8 source repository");
  const remoteHeader = await source(
    `https://raw.githubusercontent.com/denoland/v8/${gitlink.sha}/include/v8-version.h`,
    "v8-version.h",
  );
  const sourceVersion = v8HeaderVersion(remoteHeader);
  if (sourceVersion !== runtimeV8) throw new Error(`V8 source ${sourceVersion} differs from runtime ${runtimeV8}`);

  if (!(await Bun.file(join(checkout, ".git", "HEAD")).exists())) await command(["git", "init", checkout]);
  const remotes = (await command(["git", "-C", checkout, "remote"])).split(/\r?\n/);
  if (!remotes.includes("origin")) await command(["git", "-C", checkout, "remote", "add", "origin", repositoryUrl]);
  if ((await command(["git", "-C", checkout, "remote", "get-url", "origin"])) !== repositoryUrl)
    throw new Error("V8 checkout origin differs from provenance");
  const dirty = await command(["git", "-C", checkout, "status", "--porcelain"]);
  if (dirty) throw new Error("V8 checkout contains concurrent work; choose another --root");
  await command(["git", "-C", checkout, "fetch", "--depth=1", "--filter=blob:none", "origin", gitlink.sha]);
  await command(["git", "-C", checkout, "checkout", "--detach", gitlink.sha]);
  const revision = await command(["git", "-C", checkout, "rev-parse", "HEAD"]);
  if (
    revision !== gitlink.sha ||
    v8HeaderVersion(await Bun.file(join(checkout, "include", "v8-version.h")).text()) !== runtimeV8
  )
    throw new Error("V8 checkout failed source qualification");
  const files = await indexFiles(registry, "v8", checkout);
  const repo = registry.repository("v8", "source", checkout, revision, {
    versions,
    sourceVersion,
    rustyTag,
    rustyTree: tree.sha,
    repositoryUrl,
  });
  const nodes: Record<string, unknown>[] = [
    { id: "deno", label: `Deno ${versions.deno}`, kind: "runtime", runtime: versions },
    {
      id: "rusty-v8",
      label: `rusty_v8 ${packageV8.version}`,
      kind: "rust-crate",
      tree: tree.sha,
      lock: lockUrl,
      crate: packageV8,
    },
    {
      id: "v8",
      label: `V8 ${sourceVersion}`,
      kind: "engine",
      revision,
      repositoryUrl,
      source_file: "include/v8-version.h",
      source_location: "L1",
    },
  ];
  const edges: Record<string, unknown>[] = [
    {
      source: "deno",
      target: "rusty-v8",
      relation: "locks-crate",
      confidence: "EXTRACTED",
      confidence_score: 1,
      lockUrl,
    },
    {
      source: "rusty-v8",
      target: "v8",
      relation: "pins-gitlink",
      confidence: "EXTRACTED",
      confidence_score: 1,
      treeUrl,
      revision,
    },
  ];
  for (const file of registry.db
    .query<
      { path: string; sha256: string; bytes: number; language: string | null },
      [string]
    >("SELECT path,sha256,bytes,language FROM files WHERE repository_id=? ORDER BY path")
    .iterate(repo)) {
    const id = `file:${file.path}`;
    nodes.push({
      id,
      label: file.path,
      kind: "source-file",
      source_file: file.path,
      sha256: file.sha256,
      bytes: file.bytes,
      language: file.language,
    });
    edges.push({ source: "v8", target: id, relation: "contains-file", confidence: "EXTRACTED", confidence_score: 1 });
  }
  const graph = {
    producer: "bun native Git and SHA256 index",
    built_at_commit: revision,
    directed: true,
    multigraph: false,
    graph: {
      versions,
      sourceVersion,
      rustyTag,
      scope:
        "Exact runtime provenance and indexed source file ownership; semantic call graph requires a qualified C++ extractor",
    },
    nodes,
    edges,
  };
  const graphPath = join(out, "graph-v8-provenance.json");
  await Bun.write(graphPath, JSON.stringify(graph));
  const sha = await registry.artifact(graphPath, "engine-source-graph", operation);
  const imported = await registry.importGraph(repo, graph, sha);
  registry.event("engine-graph-summary", { files, imported, versions, revision, sourceVersion, rustyTag }, operation);
  console.log(JSON.stringify({ checkout, graphPath, files, imported, versions, revision, sourceVersion, rustyTag }));
  registry.finishRun(operation, 0);
  finished = true;
  if (!args.includes("--no-export")) await registry.export();
} catch (error) {
  if (!finished) registry.finishRun(operation, 1, "", String(error));
  if (!args.includes("--no-export")) await registry.export();
  throw error;
}
