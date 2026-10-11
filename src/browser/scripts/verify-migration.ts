// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const migration = JSON.parse(readFileSync(resolve(root, "MIGRATION.json"), "utf8"));
let bytes = 0;
let integratedBytes = 0;
for (const file of migration.files) {
  const data = readFileSync(resolve(root, file.destination));
  const actual = new Bun.CryptoHasher("sha256").update(data).digest("hex");
  if (
    actual !== (file.integratedSha256 ?? file.sha256) ||
    data.length !== (file.integratedBytes ?? file.bytes)
  ) {
    throw new Error(`Transferred source differs: ${file.destination}`);
  }
  bytes += file.bytes;
  integratedBytes += data.length;
}
const extra = JSON.parse(readFileSync(resolve(root, "BROWSER-MIGRATION.json"), "utf8"));
const repository = resolve(root, "../..");
let extraBytes = 0;
for (const file of extra.files) {
  const destination = resolve(repository, file.targetPath);
  if (!destination.startsWith(repository + "/") && !destination.startsWith(repository + "\\")) {
    throw new Error(`Invalid migration destination: ${file.targetPath}`);
  }
  const data = readFileSync(destination);
  const actual = new Bun.CryptoHasher("sha256").update(data).digest("hex");
  if (
    actual !== (file.integratedSha256 ?? file.targetSha256 ?? file.sha256) ||
    data.length !== (file.integratedBytes ?? file.bytes)
  ) {
    throw new Error(`Integrated source differs: ${file.targetPath}`);
  }
  extraBytes += file.bytes;
}
console.log(
  JSON.stringify({
    sourceCommit: migration.sourceCommit,
    verifiedFiles: migration.files.length,
    originalBytes: bytes,
    integratedBytes,
    extraVerifiedFiles: extra.files.length,
    extraOriginalBytes: extraBytes,
  }),
);
