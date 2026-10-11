import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export async function verifyRelease(out: string) {
  const manifest = JSON.parse(readFileSync(join(out, "manifest.json"), "utf8"));
  const graph = JSON.parse(readFileSync(join(out, "graph.json"), "utf8"));
  if (!/^[a-f0-9]{40}$/.test(manifest.source) || graph.source !== manifest.source)
    throw new Error("Release graph source mismatch");
  let files = 0;
  for (const [path, expected] of Object.entries(manifest.artifacts)) {
    if (path.startsWith("/") || path.includes("\\") || path.split("/").includes(".."))
      throw new Error(`Unsafe artifact path: ${path}`);
    const hash = new Bun.CryptoHasher("sha256");
    for await (const bytes of Bun.file(join(out, path)).stream()) hash.update(bytes);
    if (hash.digest("hex") !== expected) throw new Error(`Artifact hash mismatch: ${path}`);
    files++;
  }
  return { source: manifest.source, files };
}

if (import.meta.main) {
  if (!process.argv[2]) throw new Error("Usage: bun release-verify.ts <artifact-directory>");
  console.log(JSON.stringify(await verifyRelease(resolve(process.argv[2]))));
}
