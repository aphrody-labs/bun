import { join } from "node:path";

const root = join(import.meta.dir, "..");
const receipt = await Bun.file(join(root, "upstream-source.json")).json();
let unchanged = 0;
let adapted = 0;
for (const file of receipt.files) {
  const path = join(root, file.path);
  if (!(await Bun.file(path).exists())) throw new Error(`Missing Just source: ${file.path}`);
  const bytes = new Uint8Array(await Bun.file(path).arrayBuffer());
  const actual = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
  if (actual !== (file.integratedSha256 ?? file.sha256)) {
    throw new Error(`Just source hash changed: ${file.path}`);
  }
  if (actual === file.sha256) unchanged++;
  else adapted++;
}
console.log(JSON.stringify({ revision: receipt.revision, files: receipt.files.length, unchanged, adapted }));
