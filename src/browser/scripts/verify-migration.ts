// SPDX-License-Identifier: Apache-2.0
// Verifies the integrated hashes of the browser import ledgers. `--update` rewrites `integratedSha256` and
// `integratedBytes` from the files on disk (run it after an intentional edit of an imported file); the original
// `sha256` and `bytes` always describe the file at the source revision and are never rewritten.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const update = Bun.argv.includes("--update");
const root = resolve(import.meta.dir, "..");
const repository = resolve(root, "../..");

type Entry = { sha256: string; bytes: number; integratedSha256?: string; integratedBytes?: number } & Record<
  string,
  unknown
>;

function digest(path: string): { sha256: string; bytes: number } {
  const data = readFileSync(path);
  return { sha256: new Bun.CryptoHasher("sha256").update(data).digest("hex"), bytes: data.length };
}

function check(entries: Entry[], destination: (entry: Entry) => string, expected: (entry: Entry) => Entry["sha256"]) {
  let originalBytes = 0;
  let integratedBytes = 0;
  let rewritten = 0;
  for (const entry of entries) {
    const path = destination(entry);
    if (!path.startsWith(repository + "/") && !path.startsWith(repository + "\\")) {
      throw new Error(`Invalid migration destination: ${path}`);
    }
    const actual = digest(path);
    const sha = expected(entry);
    const bytes = entry.integratedBytes ?? entry.bytes;
    if (actual.sha256 !== sha || actual.bytes !== bytes) {
      if (!update) throw new Error(`Integrated source differs: ${path}`);
      entry.integratedSha256 = actual.sha256;
      entry.integratedBytes = actual.bytes;
      rewritten++;
    }
    originalBytes += entry.bytes;
    integratedBytes += actual.bytes;
  }
  return { originalBytes, integratedBytes, rewritten };
}

const migrationPath = resolve(root, "MIGRATION.json");
const migration = JSON.parse(readFileSync(migrationPath, "utf8"));
const main = check(
  migration.files,
  file => resolve(root, file.destination as string),
  file => file.integratedSha256 ?? file.sha256,
);

const extraPath = resolve(root, "BROWSER-MIGRATION.json");
const extra = JSON.parse(readFileSync(extraPath, "utf8"));
const more = check(
  extra.files,
  file => resolve(repository, file.targetPath as string),
  file => file.integratedSha256 ?? (file.targetSha256 as string | undefined) ?? file.sha256,
);

if (update) {
  writeFileSync(migrationPath, JSON.stringify(migration, null, 2) + "\n");
  writeFileSync(extraPath, JSON.stringify(extra, null, 2) + "\n");
}
console.log(
  JSON.stringify({
    sourceCommit: migration.sourceCommit,
    verifiedFiles: migration.files.length,
    originalBytes: main.originalBytes,
    integratedBytes: main.integratedBytes,
    extraVerifiedFiles: extra.files.length,
    extraOriginalBytes: more.originalBytes,
    ...(update ? { rewritten: main.rewritten + more.rewritten } : {}),
  }),
);
