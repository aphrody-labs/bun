import { resolve } from "node:path";

const treePath = process.argv.find(arg => arg.startsWith("--tree="))?.slice(7);
if (!treePath) throw new Error("Pass --tree=<aphrody git api recursive tree JSON>");
const root = resolve(import.meta.dir, "../..");
const receiptPath = resolve(root, "docs/project/rio-upstream-source.json");
const receipt = await Bun.file(receiptPath).json();
const response = await Bun.file(resolve(treePath)).json();
const tree = response.body ?? response;
if (tree.truncated || tree.sha !== receipt.tree_sha) throw new Error("Unexpected or incomplete upstream tree");
const blobs = tree.tree.filter((entry: { type: string }) => entry.type === "blob");
const modified = [];
for (const entry of blobs) {
  const file = Bun.file(resolve(root, "src/rio", entry.path));
  if (!(await file.exists())) throw new Error(`Missing upstream source: ${entry.path}`);
  const bytes = await file.arrayBuffer();
  const hash = new Bun.CryptoHasher("sha1").update(`blob ${bytes.byteLength}\0`).update(bytes).digest("hex");
  if (hash !== entry.sha) modified.push({ path: entry.path, upstream_blob_sha: entry.sha, local_blob_sha: hash });
}
receipt.counts = { upstream_blobs: blobs.length, identical: blobs.length - modified.length, modified: modified.length };
receipt.modified_paths = modified;
const output = JSON.stringify(receipt, null, 2) + "\n";
if (process.argv.includes("--check")) {
  if ((await Bun.file(receiptPath).text()) !== output) throw new Error("Rio upstream source receipt has drifted");
} else await Bun.write(receiptPath, output);
console.log(
  `Rio upstream source: ${blobs.length} present, ${modified.length} adapted, ${blobs.length - modified.length} identical`,
);
