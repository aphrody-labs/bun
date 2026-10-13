import { BunPython } from "bun:graph";
import { indexCodebase } from "bun:graph-index";
import { join } from "node:path";

if (import.meta.main) {
  const [database, snapshot, revision, output] = process.argv.slice(2);
  if (!database || !snapshot || !revision || !output) throw new TypeError("Release graph indexing arguments required");
  using registry = new BunPython(database);
  const result = await indexCodebase(registry, snapshot, {
    profile: "bun",
    revision,
    concurrency: 1,
    artifactDirectory: join(output, "snapshots"),
    maxFiles: 500000,
  });
  console.log(JSON.stringify(result));
}
