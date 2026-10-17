// Run by the bun a native SDK factory build just linked: one roundtrip through each
// vendored library it can reach from JavaScript. Prints the JSON native-sdk-registry.ts expects.
import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { brotliCompressSync, brotliDecompressSync } from "node:zlib";

const input = Buffer.from("bun native sdk smoke ".repeat(512));
const same = (output: Uint8Array) => Buffer.compare(Buffer.from(output), input) === 0;
const tar = new Bun.Archive({ "smoke.txt": input }, { compress: "gzip" });
const entry = (await new Bun.Archive(await tar.bytes()).files()).get("smoke.txt");

console.log(
  JSON.stringify({
    zlib: same(Bun.gunzipSync(Bun.gzipSync(input))),
    zstd: same(Bun.zstdDecompressSync(Bun.zstdCompressSync(input))),
    brotli: same(brotliDecompressSync(brotliCompressSync(input))),
    boringssl:
      createHash("sha256").update("abc").digest("hex") ===
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    libarchive: !!entry && same(await entry.bytes()),
    sqlite: (new Database(":memory:").query("select 40 + 2 as v").get() as { v: number }).v === 42,
  }),
);
