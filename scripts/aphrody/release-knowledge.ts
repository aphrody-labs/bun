import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pack } from "../../packages/bun-agent-plugin/src/archive.ts";
import { mcpTools, lspExtensions } from "../../packages/bun-agent-plugin/src/catalog.ts";
import { experimentalFeatureFlags } from "./release-feature-flags.ts";

export function completeReleaseKnowledge(out: string, origin = "https://aphrody.app") {
  const graph = JSON.parse(readFileSync(join(out, "graph.json"), "utf8"));
  using db = new Database(join(out, "monorepo.sqlite"), { readonly: true });
  const files = db
    .query<{ path: string; sha256: string }, []>(
      "SELECT path,sha256 FROM release_files WHERE content IS NOT NULL ORDER BY path",
    )
    .all();
  const docs = db
    .query<{ path: string; content: string; sha256: string }, []>(
      "SELECT path,content,sha256 FROM release_files WHERE content IS NOT NULL AND path LIKE 'docs/%' AND (path LIKE '%.md' OR path LIKE '%.mdx') ORDER BY path",
    )
    .all();
  const benchmarks = files.filter((file) => /(^|\/)(bench|benchmarks)\//.test(file.path));
  const changed: string[] = [];
  const write = (path: string, body: string | Uint8Array) => {
    mkdirSync(dirname(join(out, path)), { recursive: true });
    writeFileSync(join(out, path), body);
    changed.push(path);
  };
  const links: string[] = [];
  const full: string[] = [];
  const flagSource = db
    .query<{ content: string; sha256: string }, [string]>(
      "SELECT content,sha256 FROM release_files WHERE path=?",
    )
    .get("src/bun_core/env_var.rs");
  if (flagSource) {
    const flags = experimentalFeatureFlags(flagSource.content);
    const inventory = {
      source: graph.source,
      declaration: "src/bun_core/env_var.rs",
      declarationSha256: flagSource.sha256,
      flags,
    };
    const content = [
      "# Experimental feature switches",
      "",
      `Source: ${graph.source}; declaration SHA-256: ${flagSource.sha256}`,
      "",
      "These environment defaults are generated from native Rust declarations. Set an individual switch to 1 to opt in. Existing CLI switches and debug-build policies remain separate.",
      "",
      "Enabling a flag does not implement unavailable operations or grant host permissions.",
      "",
      "| Environment switch | Declared default |",
      "| --- | --- |",
      ...flags.map(
        (flag) =>
          "| `" + flag.name + "` | " + (flag.defaultEnabled ? "enabled" : "disabled") + " |",
      ),
      "",
    ].join("\n");
    write("site/knowledge/feature-flags.json", `${JSON.stringify(inventory, null, 2)}\n`);
    write("site/knowledge/feature-flags.md", content);
    links.push(`- [Experimental feature switches](${origin}/knowledge/feature-flags.md)`);
    full.push(content);
  }
  for (const doc of docs) {
    const path = `knowledge/source/${doc.path}`;
    write(`site/${path}`, doc.content);
    links.push(`- [${doc.path}](${origin}/${path})`);
    full.push(`# ${doc.path}\nSource: ${graph.source}; SHA-256: ${doc.sha256}\n\n${doc.content}`);
  }
  for (const doc of graph.documents) {
    const directory = doc.directory.split(/[\\/]/).at(-1);
    const path = `graph/domains/${directory}/graph.md`;
    const content = readFileSync(join(out, "graph-docs", directory, "graph.md"), "utf8");
    links.push(`- [${doc.domain} graph](${origin}/${path})`);
    full.push(content);
  }
  const tools = mcpTools(join(out, "source"));
  const languages = lspExtensions(join(out, "source"));
  const pluginFiles = new Map<string, Uint8Array | string>();
  const walk = (directory: string, prefix = "") => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const path = prefix + entry.name;
      if (entry.isDirectory()) walk(join(directory, entry.name), `${path}/`);
      else pluginFiles.set(path, readFileSync(join(directory, entry.name)));
    }
  };
  walk(join(out, "plugin"));
  const skills = [...pluginFiles.keys()].filter((path) =>
    /(?:SKILL\.md|references\/.*\.md)$/.test(path),
  );
  const cliSource =
    db
      .query<{ content: string }, [string]>("SELECT content FROM release_files WHERE path=?")
      .get("packages/bun-agent-plugin/src/cli.ts")?.content ?? "";
  const commands = [
    ...new Set([...cliSource.matchAll(/case\s+"([\w-]+)"\s*:/g)].map((match) => match[1]!)),
  ].sort();
  const usage = [
    ...(commands.includes("install")
      ? ["bun agent-plugin install claude codex agy", "bun agent-plugin install --update"]
      : []),
    ...(commands.includes("doctor") ? ["bun agent-plugin doctor"] : []),
    ...(commands.includes("generate")
      ? ["bun run agent-plugin generate --out tmp/agent-plugin"]
      : []),
  ];
  const pluginReadme = [
    "# Bun agent plugin",
    "",
    `Generated from source ${graph.source}.`,
    "",
    "Providers: Claude, Codex and Antigravity. This bundle is generated source material; installation does not qualify a newer native runtime.",
    "",
    "## Installation and checkout generation",
    "",
    "Use a qualified Aphrody Bun runtime to install its embedded plugin. Select one or more provider targets (`claude`, `codex`, `agy`); reload the provider session after installation. Checkout generation reads the selected checkout sources.",
    "",
    "```sh",
    ...usage,
    "```",
    "",
    `Commands registered in the pinned package CLI: ${commands.map((command) => `\`${command}\``).join(", ") || "none in this source fixture"}.`,
    "",
    "## Native MCP tools",
    "",
    ...tools.map((tool) => `- ${tool.name}: ${tool.title}`),
    "",
    "## Native LSP extensions",
    "",
    ...Object.keys(languages)
      .sort()
      .map((extension) => `- ${extension}: ${languages[extension]}`),
    "",
    "## Skills and references",
    "",
    ...skills.map((path) => `- [${path}](${origin}/knowledge/plugin/${path})`),
    "",
  ].join("\n");
  pluginFiles.set("README.md", pluginReadme);
  write("plugin/README.md", pluginReadme);
  write("package-README.md", pluginReadme);
  write("bun-agent-plugin.bin", pack(pluginFiles));
  for (const path of skills) {
    const content = pluginFiles.get(path)!;
    write(`site/knowledge/plugin/${path}`, content);
    links.push(`- [Plugin ${path}](${origin}/knowledge/plugin/${path})`);
    full.push(
      `# Plugin ${path}\nSource: ${graph.source}\n\n${new TextDecoder().decode(content as Uint8Array)}`,
    );
  }
  write("site/knowledge/plugin/README.md", pluginReadme);
  const measured = files.filter((file) =>
    /(?:perf-report|product-benchmarks)\.json$/.test(file.path),
  );
  const benchmarkReport = {
    source: graph.source,
    sourceFiles: benchmarks.map(({ path, sha256 }) => ({ path, sha256 })),
    reports: measured.map(({ path, sha256 }) => ({ path, sha256 })),
    qualification:
      "Source inventory and committed measurement reports only. No performance measurements were run by this documentation generator. Historical reports retain their recorded runtime, host and workload scope.",
  };
  write("site/benchmarks/source-inventory.json", `${JSON.stringify(benchmarkReport, null, 2)}\n`);
  links.push(
    `- [Benchmark source and measurement coverage](${origin}/benchmarks/source-inventory.json)`,
  );
  write(
    "site/llms.txt",
    `${readFileSync(join(out, "site/llms.txt"), "utf8").split("\n## Complete source knowledge\n")[0]}\n## Complete source knowledge\n\n${links.join("\n")}\n`,
  );
  write(
    "site/llms-full.txt",
    `${readFileSync(join(out, "site/llms-full.txt"), "utf8").split("\n<!-- complete-source-knowledge -->")[0]}\n<!-- complete-source-knowledge -->\n${full.join("\n\n")}\n`,
  );
  const report = {
    source: graph.source,
    generatorSha256: createHash("sha256")
      .update(readFileSync(import.meta.path))
      .digest("hex"),
    docs: docs.length,
    guides: docs.filter((doc) => doc.path.startsWith("docs/guides/")).length,
    graphDocuments: graph.documents.length,
    pluginSkillsAndReferences: skills.length,
    mcpTools: tools.length,
    benchmarkSourceFiles: benchmarks.length,
    committedMeasurementReports: measured.length,
    changed,
  };
  write("knowledge-coverage.json", `${JSON.stringify(report, null, 2)}\n`);
  write("site/knowledge/coverage.json", `${JSON.stringify(report, null, 2)}\n`);
  write(
    "site/knowledge/index.html",
    `<!doctype html><html lang="en"><meta charset="utf-8"><title>Bun source knowledge</title><h1>Bun source knowledge</h1><p>Source ${Bun.escapeHTML(graph.source)}. ${docs.length} documentation pages, ${report.guides} guides, ${graph.documents.length} graph domain documents and ${skills.length} plugin skills and references.</p><p><a href="coverage.json">Coverage and generator provenance</a> · <a href="/graph/">Monorepo graph</a> · <a href="/llms.txt">LLM index</a> · <a href="/llms-full.txt">Complete LLM text</a> · <a href="/benchmarks/source-inventory.json">Benchmark source coverage</a></p><ul>${docs.map((doc) => `<li><a href="source/${Bun.escapeHTML(doc.path)}">${Bun.escapeHTML(doc.path)}</a></li>`).join("")}</ul></html>`,
  );
  const finalCoverage = `${JSON.stringify(report, null, 2)}\n`;
  writeFileSync(join(out, "knowledge-coverage.json"), finalCoverage);
  writeFileSync(join(out, "site/knowledge/coverage.json"), finalCoverage);
  return report;
}

if (import.meta.main) {
  const out = process.argv[process.argv.indexOf("--out") + 1];
  if (!process.argv.includes("--out") || !out) throw new Error("Required --out artifact directory");
  const report = completeReleaseKnowledge(resolve(out));
  console.log(JSON.stringify({ ...report, changed: report.changed.length }));
}
