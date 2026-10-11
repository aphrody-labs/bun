// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { bunExe, bunEnv, tempDir } from "../../../test/harness";
import {
  decodeExport,
  encodeFrame,
  MAX_EXPORT_BYTES,
  MAX_FRAME_BYTES,
  validateExport,
  type ExportMessage,
} from "./protocol";

const message: ExportMessage = {
  schemaVersion: 1,
  type: "export",
  kind: "bookmarks",
  items: [{ id: "1", title: "Public fixture é日本", url: "https://example.invalid/" }],
};
const padding = (10 - (new TextEncoder().encode(JSON.stringify(message)).length % 256) + 256) % 256;
message.items[0]!.title = String(message.items[0]!.title) + "x".repeat(padding);
function command(origin: string) {
  return process.env.BUN_CHROME_NATIVE_TEST_EXE
    ? [process.env.BUN_CHROME_NATIVE_TEST_EXE, origin]
    : [bunExe(), join(import.meta.dir, "host.ts"), origin];
}
test("native framing preserves UTF-8 bytes and little-endian lengths", () => {
  const frame = encodeFrame(message);
  expect(frame[0]).toBe(0x0a);
  expect(new DataView(frame.buffer).getUint32(0, true)).toBe(frame.length - 4);
  expect(decodeExport(frame.subarray(4))).toEqual(message);
  expect(() => encodeFrame({ data: "x".repeat(MAX_FRAME_BYTES) })).toThrow();
  expect(() => decodeExport(new Uint8Array(MAX_EXPORT_BYTES + 1))).toThrow();
  expect(() => decodeExport(new Uint8Array([0xff]))).toThrow();
});
test.each([
  "javascript:alert(1)",
  "file:///C:/private",
  "chrome://settings",
  "https://user:password@example.invalid/",
])("reject disallowed URL %s", (url) => {
  expect(() => validateExport({ ...message, items: [{ ...message.items[0], url }] })).toThrow();
});
test("reject unknown fields, invocation verbs, kinds and oversized batches", () => {
  for (const value of [
    { ...message, path: "C:/private" },
    { ...message, type: "exec" },
    { ...message, kind: "cookies" },
    { ...message, items: [{ ...message.items[0], password: "forbidden" }] },
    { ...message, items: Array(501).fill(message.items[0]) },
  ])
    expect(() => validateExport(value)).toThrow();
  expect(() =>
    validateExport({
      schemaVersion: 1,
      type: "export",
      kind: "sessions",
      items: [
        {
          sessionId: "fixture",
          lastModified: 0,
          tabs: Array(101).fill({ title: "x", url: "https://example.invalid", pinned: false }),
        },
      ],
    }),
  ).toThrow();
});

test("real native stdio persists only projected batch in a synthetic private root", async () => {
  if (process.platform !== "win32") return;
  using dir = tempDir("chrome-native-bridge", {});
  const base = join(String(dir), "BunChromium");
  mkdirSync(join(base, "NativeMessaging"), { recursive: true });
  mkdirSync(join(base, "Exports"));
  await Bun.write(
    join(base, "NativeMessaging", "host-config.json"),
    "\uFEFF" + JSON.stringify({ extensionId: "a".repeat(32) }),
  );
  await using proc = Bun.spawn({
    cmd: command("chrome-extension://" + "a".repeat(32) + "/"),
    env: { ...bunEnv, LOCALAPPDATA: String(dir) },
    stdin: encodeFrame(message),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [output, error, code] = await Promise.all([
    new Response(proc.stdout).bytes(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  const length = new DataView(output.buffer, output.byteOffset).getUint32(0, true);
  const response = JSON.parse(new TextDecoder().decode(output.subarray(4, 4 + length)));
  expect(response).toMatchObject({
    ok: true,
    receipt: { kind: "bookmarks", count: 1, sourceExtensionId: "a".repeat(32) },
  });
  expect(JSON.stringify(response)).not.toContain("example.invalid");
  const entries = readdirSync(join(base, "Exports"));
  expect(entries).toEqual([response.receipt.batchId + ".json"]);
  const stored = await Bun.file(join(base, "Exports", entries[0]!)).json();
  expect(stored.items).toEqual(message.items);
  expect(stored.manifest.sha256).toBe(
    new Bun.CryptoHasher("sha256").update(JSON.stringify(message.items)).digest("hex"),
  );
  expect(error).toBe("");
  expect(code).toBe(0);
});

test("native origin allowlist rejects an unrelated extension without private writes", async () => {
  if (process.platform !== "win32") return;
  using dir = tempDir("chrome-native-origin", {});
  const base = join(String(dir), "BunChromium");
  mkdirSync(join(base, "NativeMessaging"), { recursive: true });
  mkdirSync(join(base, "Exports"));
  await Bun.write(
    join(base, "NativeMessaging", "host-config.json"),
    JSON.stringify({ extensionId: "a".repeat(32) }),
  );
  await using proc = Bun.spawn({
    cmd: command("chrome-extension://" + "b".repeat(32) + "/"),
    env: { ...bunEnv, LOCALAPPDATA: String(dir) },
    stdin: encodeFrame(message),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [output, code] = await Promise.all([new Response(proc.stdout).bytes(), proc.exited]);
  expect(JSON.parse(new TextDecoder().decode(output.subarray(4)))).toEqual({
    ok: false,
    error: "untrusted_origin",
  });
  expect(readdirSync(join(base, "Exports"))).toHaveLength(0);
  expect(code).toBe(0);
});
