import { resolve } from "node:path";
import { readGraphFile } from "./engine-graph.ts";
import { indexCargo, indexFiles, parseCsv } from "./pyjs-index.ts";
import { recoverRuns, runRecorded } from "./pyjs-runs.ts";
import { BunPython, registryPath } from "./pyjs-store.ts";

const args = process.argv.slice(2);
const separator = args.indexOf("--");
const options = separator < 0 ? args : args.slice(0, separator);
const flag = (name: string, fallback?: string) => {
  const index = options.indexOf(name);
  if (index < 0) return fallback;
  const value = options[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
};
using registry = new BunPython(flag("--db", registryPath));
const command = args[0] ?? "status";
const exportState = async () => (options.includes("--no-export") ? registry.path : registry.export());
if (command === "recover") {
  console.log(JSON.stringify(await recoverRuns(registry)));
  console.log(await exportState());
} else if (command === "init" || command === "status") {
  console.log(JSON.stringify({ database: registry.path, counts: registry.counts() }, null, 2));
} else if (command === "export") {
  console.log(await registry.export(flag("--out")));
} else if (command === "event") {
  registry.event(flag("--kind", "action")!, JSON.parse(flag("--payload", "{}")!));
  console.log(await exportState());
} else if (command === "index") {
  const root = flag("--root");
  const name = flag("--name");
  if (!root || !name) throw new Error("index requires --root and --name");
  console.log(JSON.stringify(await indexFiles(registry, name, root)));
  console.log(await exportState());
} else if (command === "import-graph" || command === "import-cargo") {
  const input = flag("--input"),
    name = flag("--name"),
    root = flag("--root");
  if (!input || !name || !root) throw new Error(`${command} requires --input, --name and --root`);
  const repository = registry.repository(name, "source", resolve(root), flag("--revision") ?? null);
  const data =
    command === "import-graph" && Bun.file(input).size > 64 * 1024 * 1024
      ? await readGraphFile(input)
      : await Bun.file(input).json();
  const sha256 = await registry.artifact(input, command);
  console.log(
    JSON.stringify(
      command === "import-graph"
        ? await registry.importGraph(repository, data, sha256)
        : indexCargo(registry, repository, data),
    ),
  );
  console.log(await exportState());
} else if (command === "import-bench") {
  const input = flag("--input");
  if (!input) throw new Error("import-bench requires --input samples.csv");
  const rows = parseCsv(await Bun.file(input).text());
  const header = rows.shift();
  if (header?.join(",") !== "case,implementation,sample,milliseconds")
    throw new Error("Unsupported benchmark CSV header");
  const run = registry.startRun("benchmark-import", [input], process.cwd(), { imported: true });
  try {
    registry.db.transaction(() => {
      for (const row of rows) {
        if (row.length !== 4) throw new Error("Invalid benchmark CSV row");
        registry.sample(run, row[0]!, row[1]!, Number(row[2]), Number(row[3]));
      }
    })();
    await registry.artifact(input, "benchmark-csv", run);
    registry.finishRun(run, 0);
  } catch (error) {
    registry.finishRun(run, 1, "", String(error));
    throw error;
  }
  console.log(JSON.stringify({ run, samples: rows.length }));
  console.log(await exportState());
} else if (command === "run") {
  const at = args.indexOf("--");
  if (at < 0 || at === args.length - 1) throw new Error("run requires -- <command> [arguments]");
  const argv = args.slice(at + 1);
  const cwd = resolve(flag("--cwd", process.cwd())!);
  process.exitCode = await runRecorded(registry, flag("--kind", "test")!, argv, cwd, flag("--out"));
  await exportState();
} else {
  throw new Error(`Unknown bun_python command ${command}`);
}
