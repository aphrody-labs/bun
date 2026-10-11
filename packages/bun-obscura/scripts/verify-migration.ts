// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const migration = JSON.parse(readFileSync(resolve(root, "MIGRATION.json"), "utf8"));
let bytes = 0;
for (const file of migration.files) {
  let data = readFileSync(resolve(root, file.destination));
  if (file.destination === "crates/obscura-render/Cargo.toml") {
    data = Buffer.from(data.toString().replace('path = "../taffy"', 'path = "../../ui/taffy"'));
  }
  const actual = new Bun.CryptoHasher("sha256").update(data).digest("hex");
  if (actual !== file.sha256 || data.length !== file.bytes) {
    throw new Error(`Transferred source differs: ${file.destination}`);
  }
  bytes += file.bytes;
}
console.log(JSON.stringify({ sourceCommit: migration.sourceCommit, verifiedFiles: migration.files.length, bytes }));
