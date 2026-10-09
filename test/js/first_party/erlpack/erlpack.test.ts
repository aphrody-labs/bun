import { expect, test } from "bun:test";
import { pack, unpack } from "erlpack";
import zlib from "node:zlib";

test("erlpack resolves to the built-in module", () => {
  expect(require.resolve("erlpack")).toBe("erlpack");
});

test("pack matches the Erlang External Term Format bytes", () => {
  expect([...pack({ a: 1 })]).toEqual([131, 116, 0, 0, 0, 1, 109, 0, 0, 0, 1, 97, 97, 1]);
  expect([...pack(null)]).toEqual([131, 115, 3, 110, 105, 108]);
  expect([...pack(true)]).toEqual([131, 115, 4, 116, 114, 117, 101]);
  expect([...pack(300)]).toEqual([131, 98, 0, 0, 1, 44]);
  expect([...pack(-1)]).toEqual([131, 98, 255, 255, 255, 255]);
  expect([...pack(4294967295)]).toEqual([131, 110, 4, 0, 255, 255, 255, 255]);
  expect([...pack(1.5)]).toEqual([131, 70, 63, 248, 0, 0, 0, 0, 0, 0]);
  expect([...pack([])]).toEqual([131, 106]);
  expect([...pack(["é"])]).toEqual([131, 108, 0, 0, 0, 1, 109, 0, 0, 0, 2, 195, 169, 106]);
});

test("unpack inverts pack for gateway-shaped payloads", () => {
  const payload = {
    op: 0,
    s: 42,
    t: "MESSAGE_CREATE",
    d: { id: "1", content: "héllo 🐉", mentions: [], embeds: [{ fields: [1, 2.5, -7, null, false] }], big: 4294967295 },
  };
  expect(unpack(pack(payload))).toEqual({ ...payload, d: { ...payload.d, big: 4294967295 } });
  expect(unpack(pack({ n: null }))).toEqual({ n: null });
});

test("unpack handles atoms, tuples, strings, big integers and compressed terms", () => {
  expect(unpack(Buffer.from([131, 100, 0, 3, 102, 111, 111]))).toBe("foo");
  expect(unpack(Buffer.from([131, 104, 2, 97, 1, 97, 2]))).toEqual([1, 2]);
  expect(unpack(Buffer.from([131, 107, 0, 2, 7, 8]))).toEqual([7, 8]);
  expect(unpack(Buffer.from([131, 110, 8, 1, 255, 255, 255, 255, 255, 255, 255, 127]))).toBe("-9223372036854775807");
  const inner = pack({ k: "v" }).subarray(1);
  const compressed = Buffer.concat([Buffer.from([131, 80]), Buffer.alloc(4), zlib.deflateSync(inner)]);
  compressed.writeUInt32BE(inner.length, 2);
  expect(unpack(compressed)).toEqual({ k: "v" });
});

test("unpack rejects malformed input", () => {
  expect(() => unpack("x" as any)).toThrow("Attempting to unpack a non-object.");
  expect(() => unpack(Buffer.alloc(0))).toThrow("Zero length buffer.");
  expect(() => unpack(Buffer.from([130, 97, 1]))).toThrow("Bad version number.");
  expect(() => unpack(Buffer.from([131, 109, 0, 0, 0, 9, 1]))).toThrow("Reading sequence past the end of the buffer.");
  expect(() => unpack(Buffer.from([131, 255]))).toThrow("Unsupported erlang term type identifier found");
});
