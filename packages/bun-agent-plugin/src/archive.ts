// The archive `bun agent-plugin` carries in the executable: "BUNAGPL1", a u32 count, then for each file a u32
// path length, the UTF-8 path, a u32 data length and the data. Little-endian, sorted by path. The build compresses
// it (zstd) like the other embedded assets; src/runtime/cli/agent_plugin_command.rs reads it.

export const MAGIC = "BUNAGPL1";

export function pack(files: Map<string, string | Uint8Array>): Uint8Array {
  const enc = new TextEncoder();
  const entries = [...files.keys()].sort().map(k => {
    const v = files.get(k)!;
    return [enc.encode(k), typeof v === "string" ? enc.encode(v) : v] as const;
  });
  const size = 8 + 4 + entries.reduce((n, [p, d]) => n + 8 + p.length + d.length, 0);
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  out.set(enc.encode(MAGIC), 0);
  view.setUint32(8, entries.length, true);
  let o = 12;
  for (const [p, d] of entries) {
    view.setUint32(o, p.length, true);
    out.set(p, o + 4);
    o += 4 + p.length;
    view.setUint32(o, d.length, true);
    out.set(d, o + 4);
    o += 4 + d.length;
  }
  return out;
}

export function unpack(bytes: Uint8Array): Map<string, Uint8Array> {
  const dec = new TextDecoder();
  if (dec.decode(bytes.subarray(0, 8)) !== MAGIC) throw new Error("not an agent-plugin archive");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(8, true);
  const out = new Map<string, Uint8Array>();
  let o = 12;
  for (let i = 0; i < count; i++) {
    const pl = view.getUint32(o, true);
    const path = dec.decode(bytes.subarray(o + 4, o + 4 + pl));
    o += 4 + pl;
    const dl = view.getUint32(o, true);
    out.set(path, bytes.subarray(o + 4, o + 4 + dl));
    o += 4 + dl;
  }
  return out;
}
