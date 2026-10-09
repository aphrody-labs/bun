import { relative, resolve } from "node:path";
import { git } from "./pyjs-index.ts";
import { BunPython } from "./pyjs-store.ts";

type Range = { byteOffset: { start: number; end: number }; start: { line: number; column: number } };
type Item = { name: string; symbolType: string; range: Range; members?: Item[]; [key: string]: unknown };
type Outline = { path: string; language: string; items: Item[] };
const args = process.argv.slice(2);
const [name, directory, ...languages] = args;
if (!name || !directory || !languages.length)
  throw new Error("Usage: pyjs-ast.ts <repository> <directory> <languages...>");
const root = resolve(directory);
using registry = new BunPython();
const revision = await git(root, "rev-parse", "HEAD");
const repositoryRoot = name === "bun" ? await git(root, "rev-parse", "--show-toplevel") : root;
const repository = registry.repository(name, "source", repositoryRoot, revision);
const nodes: Record<string, unknown>[] = [];
const links: Record<string, unknown>[] = [];
const nodeIds = new Set<string>();
const edgeIds = new Set<string>();
const coverage: Record<string, number> = {};
const languageConfig = name === "jsc" ? resolve(import.meta.dir, "../../tmp/bun-python/jsc-outline.yml") : undefined;
if (languageConfig) await Bun.write(languageConfig, 'ruleDirs: []\nlanguageGlobs:\n  cpp: ["*.h", "*.inc"]\n');
await Promise.all(
  languages.map(async language => {
    const command = [
      "ast-grep",
      "outline",
      ...(languageConfig ? ["--config", languageConfig] : []),
      "--lang",
      language,
      "--items",
      "all",
      "--json=compact",
      "--no-ignore",
      "hidden",
      "--no-ignore",
      "vcs",
      root,
    ];
    const run = registry.startRun("ast-outline", command, root, { revision });
    await using child = Bun.spawn({ cmd: command, cwd: root, stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, code] = await Promise.all([child.stdout.text(), child.stderr.text(), child.exited]);
    registry.finishRun(run, code, stdout, stderr);
    if (code !== 0) throw new Error(`ast-grep ${language}: ${stderr}`);
    const outlines: Outline[] = JSON.parse(stdout);
    coverage[language] = outlines.length;
    for (const outline of outlines) {
      if (name === "jsc" && language === "c" && !outline.path.endsWith(".c")) continue;
      if (name === "jsc" && language === "cpp" && outline.path.endsWith(".c")) continue;
      const file = relative(repositoryRoot, outline.path).replaceAll("\\", "/");
      const fileId = `file:${file}`;
      if (!nodeIds.has(fileId)) {
        nodeIds.add(fileId);
        nodes.push({ id: fileId, label: file, kind: "source-file", source_file: file, language: outline.language });
      }
      const add = (item: Item, parent: string) => {
        const id = `${file}:${item.range.byteOffset.start}:${item.range.byteOffset.end}:${item.name}`;
        if (!nodeIds.has(id)) {
          nodeIds.add(id);
          nodes.push({
            ...item,
            id,
            label: item.name,
            kind: item.symbolType,
            source_file: file,
            source_location: `L${item.range.start.line + 1}`,
          });
        }
        const edgeId = JSON.stringify([parent, id]);
        if (!edgeIds.has(edgeId)) {
          edgeIds.add(edgeId);
          links.push({
            source: parent,
            target: id,
            relation: "contains",
            confidence: "EXTRACTED",
            confidence_score: 1,
          });
        }
        for (const member of item.members ?? []) add(member, id);
      };
      for (const item of outline.items) add(item, fileId);
    }
  }),
);
const graph = {
  producer: "ast-grep outline",
  built_at_commit: revision,
  directed: true,
  multigraph: true,
  graph: {
    source_root: repositoryRoot,
    scope: relative(repositoryRoot, root).replaceAll("\\", "/"),
    coverage,
    extraction: "syntactic declarations, imports and membership; no type or call resolution",
  },
  nodes,
  links,
};
const path = resolve(import.meta.dir, "../../tmp/bun-python", `graph-${name}-ast.json`);
await Bun.write(path, JSON.stringify(graph));
const sha256 = await registry.artifact(path, "ast-graph");
console.log(JSON.stringify(await registry.importGraph(repository, graph, sha256)));
registry.event("ast-coverage", { repository, revision, coverage });
