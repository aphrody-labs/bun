// SPDX-License-Identifier: Apache-2.0
import { closeSync, fsyncSync, lstatSync, openSync, readSync, readdirSync, writeSync } from "node:fs";
import { dirname, join, resolve, parse } from "node:path";
import { decodeExport, encodeFrame, extensionId, MAX_FRAME_BYTES } from "./protocol";

function ordinaryDirectory(path: string) {
  let current = resolve(path);
  const root = parse(current).root;
  while (current !== root) {
    const stat = lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Unsafe private directory");
    current = dirname(current);
  }
}
function readExact(length: number): Uint8Array | undefined {
  const bytes = new Uint8Array(length);
  let offset = 0;
  while (offset < length) {
    const count = readSync(0, bytes, offset, length - offset, null);
    if (!count) {
      if (!offset) return undefined;
      throw new Error("Truncated native frame");
    }
    offset += count;
  }
  return bytes;
}
function send(value: unknown) {
  const frame = encodeFrame(value);
  let offset = 0;
  while (offset < frame.length) {
    const written = writeSync(1, frame, offset, frame.length - offset);
    if (!written) throw new Error("Native output unavailable");
    offset += written;
  }
}
async function main() {
  if (process.platform !== "win32" || !process.env.LOCALAPPDATA) throw new Error("Native Windows required");
  const base = resolve(process.env.LOCALAPPDATA, "BunChromium");
  const native = join(base, "NativeMessaging");
  const exports = join(base, "Exports");
  ordinaryDirectory(native);
  ordinaryDirectory(exports);
  const configPath = join(native, "host-config.json");
  const configStat = lstatSync(configPath);
  if (!configStat.isFile() || configStat.isSymbolicLink()) throw new Error("Unsafe native configuration");
  const configFile = Bun.file(configPath);
  if (configFile.size > 4096) throw new Error("Invalid native configuration");
  const config: unknown = await configFile.json();
  if (
    !config ||
    typeof config !== "object" ||
    !("extensionId" in config) ||
    typeof config.extensionId !== "string" ||
    !extensionId.test(config.extensionId)
  )
    throw new Error("Invalid native configuration");
  const origin = `chrome-extension://${config.extensionId}/`;
  if (process.argv[2] !== origin || process.argv.slice(3).some(value => !/^--parent-window=\d+$/.test(value))) {
    send({ ok: false, error: "untrusted_origin" });
    return;
  }
  for (let messages = 0; messages < 100; messages++) {
    const header = readExact(4);
    if (!header) return;
    const length = new DataView(header.buffer, header.byteOffset, 4).getUint32(0, true);
    if (!length || length > MAX_FRAME_BYTES) throw new Error("Invalid native frame");
    const payload = readExact(length);
    if (!payload) throw new Error("Truncated native frame");
    let message;
    try {
      message = decodeExport(payload);
    } catch {
      send({ ok: false, error: "invalid_message" });
      continue;
    }
    try {
      ordinaryDirectory(exports);
      if (readdirSync(exports).length >= 1000) throw new Error("Private export capacity reached");
      const batchId = crypto.randomUUID();
      const createdAt = new Date().toISOString();
      const content = JSON.stringify(message.items);
      const sha256 = new Bun.CryptoHasher("sha256").update(content).digest("hex");
      const receipt = {
        schemaVersion: 1,
        batchId,
        kind: message.kind,
        count: message.items.length,
        sha256,
        sourceExtensionId: config.extensionId,
        createdAt,
      };
      const envelope = new TextEncoder().encode(
        JSON.stringify({
          manifest: {
            ...receipt,
            source: "Chrome extension API",
            payloadEncoding: "JSON.stringify(items), UTF-8",
          },
          items: message.items,
        }),
      );
      const fd = openSync(join(exports, batchId + ".json"), "wx", 0o600);
      try {
        let offset = 0;
        while (offset < envelope.length) {
          const written = writeSync(fd, envelope, offset, envelope.length - offset);
          if (!written) throw new Error("Private storage unavailable");
          offset += written;
        }
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      send({ ok: true, receipt });
    } catch {
      send({ ok: false, error: "storage_unavailable" });
    }
  }
}
if (import.meta.main) {
  try {
    await main();
  } catch {
    try {
      send({ ok: false, error: "invalid_message" });
    } catch {}
    process.exitCode = 1;
  }
}
