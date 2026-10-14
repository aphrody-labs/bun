import { join, resolve } from "node:path";
import { FULLSTACK_SOURCES, verifySource } from "./vendor-fullstack";

const root = resolve(import.meta.dir, "../..");
const sources = [];
for (const source of FULLSTACK_SOURCES) {
  await verifySource(source);
  const receipt = await Bun.file(join(root, "docs/project", `${source.name}-source.json`)).json();
  const manifests = [];
  for (const entry of receipt.files) {
    if (entry.path !== "Cargo.toml" && !entry.path.endsWith("/Cargo.toml")) continue;
    const manifest = Bun.TOML.parse(await Bun.file(join(root, "vendor", source.name, entry.path)).text()) as Record<
      string,
      unknown
    >;
    manifests.push({
      path: entry.path,
      sha256: entry.sha256,
      package: manifest.package ?? null,
      workspace: manifest.workspace ?? null,
      features: manifest.features ?? {},
      dependencies: manifest.dependencies ?? {},
      devDependencies: manifest["dev-dependencies"] ?? {},
      buildDependencies: manifest["build-dependencies"] ?? {},
      target: manifest.target ?? {},
    });
  }
  sources.push({ ...source, manifests });
}
const path = join(root, "docs/project/fullstack-features.json");
const output = JSON.stringify({ schema: "bun.fullstack-features/1", sources }, null, 2) + "\n";
if (Bun.argv.includes("--write")) await Bun.write(path, output);
else if ((await Bun.file(path).text()) !== output) throw new Error("Fullstack feature inventory has drifted");
console.log(JSON.stringify(sources.map(source => ({ name: source.name, manifests: source.manifests.length }))));
