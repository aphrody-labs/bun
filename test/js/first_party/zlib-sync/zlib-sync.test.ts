import { expect, test } from "bun:test";
import { Inflate, Z_NO_FLUSH, Z_SYNC_FLUSH, Z_DATA_ERROR, ZLIB_VERSION } from "zlib-sync";
import zlib from "node:zlib";

// What a Discord gateway does: one zlib stream, every message ends with a sync flush.
function gatewayStream() {
  const deflate = zlib.createDeflate();
  const chunks: Buffer[] = [];
  deflate.on("data", c => chunks.push(c));
  return (message: string) =>
    new Promise<Buffer>(resolve => {
      deflate.write(message);
      deflate.flush(zlib.constants.Z_SYNC_FLUSH, () => resolve(Buffer.concat(chunks.splice(0))));
    });
}

test("zlib-sync resolves to the built-in module", () => {
  expect(require.resolve("zlib-sync")).toBe("zlib-sync");
  expect(Z_SYNC_FLUSH).toBe(zlib.constants.Z_SYNC_FLUSH);
  expect(Z_DATA_ERROR).toBe(-3);
  expect(ZLIB_VERSION).toBe(process.versions.zlib);
});

test("Inflate keeps its window across push() calls", async () => {
  const pack = gatewayStream();
  const inflate = new Inflate({ chunkSize: 65535, to: "string" });
  const messages = [
    JSON.stringify({ op: 10, d: { heartbeat_interval: 41250 } }),
    JSON.stringify({ op: 10, d: { heartbeat_interval: 41250 } }),
    JSON.stringify({ op: 0, t: "MESSAGE_CREATE", d: { content: "é".repeat(100_000) } }),
  ];
  for (const message of messages) {
    const packed = await pack(message);
    expect(packed.subarray(-4)).toEqual(Buffer.from([0, 0, 255, 255]));
    inflate.push(packed, Z_SYNC_FLUSH);
    expect(inflate.err).toBe(0);
    expect(inflate.msg).toBeNull();
    expect(inflate.result).toBe(message);
  }
});

test("Inflate buffers partial frames and returns bytes without to: 'string'", async () => {
  const pack = gatewayStream();
  const inflate = new Inflate();
  expect(inflate.chunkSize).toBe(16384);
  expect(inflate.windowBits).toBe(15);
  const message = JSON.stringify({ big: Buffer.alloc(200_000, "x").toString() });
  const packed = await pack(message);
  const half = packed.length >> 1;
  inflate.push(packed.subarray(0, half), Z_NO_FLUSH);
  inflate.push(packed.subarray(half), Z_SYNC_FLUSH);
  const result = inflate.result;
  expect(Buffer.isBuffer(result)).toBe(true);
  expect(result!.toString()).toBe(message);
});

test("Inflate reports data errors through err and msg", () => {
  const inflate = new Inflate();
  inflate.push(Buffer.from("this is not a zlib stream"), Z_SYNC_FLUSH);
  expect(inflate.err).toBe(Z_DATA_ERROR);
  expect(inflate.msg).toBe("data error");
  expect(inflate.result).toBeNull();
});
