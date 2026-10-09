// R1, runtime lane: CompressionStream / DecompressionStream("gzip") round trip of 1 MiB.
// The compressed size depends on each runtime's zlib and is reported, not checked.
import { hashBytes, measureAsync, mix, prng, report } from "./common.mjs";

const rnd = prng(3);
const words = [];
for (let i = 0; i < 512; i++) words.push("w" + ((rnd() * 1e6) | 0).toString(36));
let text = "";
while (text.length < 1 << 20) text += words[(rnd() * words.length) | 0] + " ";
const input = new TextEncoder().encode(text.slice(0, 1 << 20));
let compressedBytes = 0;

async function roundTrip() {
  const gz = await new Response(new Blob([input]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer();
  compressedBytes = gz.byteLength;
  const out = new Uint8Array(
    await new Response(new Blob([gz]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer(),
  );
  return mix(hashBytes(2166136261, out.subarray(0, 4096)), out.length);
}

const r = await measureAsync("roundtrip", roundTrip);
report("gzip", "runtime", { roundtrip: r }, { inputBytes: input.length, compressedBytes });
