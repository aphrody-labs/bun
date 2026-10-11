// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { join } from "node:path";
import { tempDir } from "../../../test/harness";
import { generateChromeApp, iconPNG, schemeColors } from "./generate";
import { projectExport } from "./projection";

test("real Chrome theme and MV3 assets are generated from an explicitly pinned owner scheme", async () => {
  const css =
    ":root{--md-sys-color-surface-container:#112233;--md-sys-color-surface:#223344;--md-sys-color-on-surface:#334455;--md-sys-color-background:#445566;--md-sys-color-on-background:#556677;--md-sys-color-primary:#667788;--md-sys-color-primary-container:#778899;}";
  using root = tempDir("chrome-app", { "scheme.css": css });
  const keys = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  const publicKey = Buffer.from(await crypto.subtle.exportKey("spki", keys.publicKey)).toString("base64");
  const options = {
    cssFile: join(String(root), "scheme.css"),
    cssSha256: new Bun.CryptoHasher("sha256").update(css).digest("hex"),
    outputRoot: join(String(root), "generated"),
    publicKey,
  };
  const receipt = await generateChromeApp(options);
  expect(receipt.extensionId).toMatch(/^[a-p]{32}$/);
  expect(receipt.allowedOrigin).toBe(`chrome-extension://${receipt.extensionId}/`);
  const manifest = await Bun.file(join(options.outputRoot, "extension/manifest.json")).json();
  expect(manifest.manifest_version).toBe(3);
  expect(manifest.permissions).toEqual(["storage"]);
  expect(manifest.optional_permissions).toContain("nativeMessaging");
  expect(manifest.chrome_settings_overrides.search_provider.search_url).toBe("https://aphrody.com/?q={searchTerms}");
  expect(manifest.chrome_settings_overrides.search_provider.is_default).toBe(true);
  expect(manifest.host_permissions).toBeUndefined();
  expect(manifest.oauth2).toBeUndefined();
  const theme = await Bun.file(join(options.outputRoot, "theme/manifest.json")).json();
  expect(theme.theme.colors.frame).toEqual([17, 34, 51]);
  expect(theme.background).toBeUndefined();
  for (const [path, sha256] of Object.entries(receipt.files))
    expect(new Bun.CryptoHasher("sha256").update(await Bun.file(path).bytes()).digest("hex")).toBe(sha256);
  expect(await (await generateChromeApp(options)).extensionId).toBe(receipt.extensionId);
  await expect(generateChromeApp({ ...options, cssSha256: "0".repeat(64) })).rejects.toThrow("SHA256 mismatch");
  expect(() => schemeColors(css + "--md-sys-color-primary:#000000;")).toThrow("Ambiguous");
});

test("generated PNG dimensions and image stream are real at every declared size", async () => {
  for (const size of [16, 32, 48, 128, 192, 512]) {
    const bytes = new Uint8Array(await iconPNG(size, [17, 34, 51], [240, 241, 242]).arrayBuffer());
    expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    const view = new DataView(bytes.buffer);
    expect(view.getUint32(16)).toBe(size);
    expect(view.getUint32(20)).toBe(size);
    let offset = 8;
    while (offset < bytes.length) {
      const length = view.getUint32(offset);
      if (new TextDecoder().decode(bytes.subarray(offset + 4, offset + 8)) === "IDAT")
        expect(
          Bun.inflateSync(bytes.subarray(offset + 8, offset + 8 + length), { library: "zlib", windowBits: 15 }).length,
        ).toBe(size * (size * 4 + 1));
      offset += length + 12;
    }
  }
});

test("Chrome data export projects bounded local data without credentials or arbitrary schemes", () => {
  const message = projectExport(
    "bookmarks",
    Array.from({ length: 501 }, (_, index) => ({
      id: String(index),
      title: "page",
      url: "https://example.test/",
      password: "never exported",
    })),
  );
  expect(message.items.length).toBe(500);
  expect(Object.keys(message.items[0]!)).toEqual(["title", "url", "id"]);
  expect(
    projectExport("tabs", [
      { url: "https://user:password@example.test" },
      { url: "javascript:alert(1)" },
      { url: "file:///private" },
    ]).items,
  ).toEqual([]);
  expect(
    projectExport("sessions", [
      { lastModified: 123, tab: { sessionId: "closed", url: "https://example.test", title: "closed" } },
    ]).items,
  ).toEqual([
    {
      sessionId: "closed",
      lastModified: 123,
      tabs: [{ title: "closed", url: "https://example.test/", pinned: false }],
    },
  ]);
  expect(() =>
    projectExport(
      "bookmarks",
      Array.from({ length: 500 }, () => ({ id: "x", title: "long", url: "https://example.test/" + "x".repeat(3000) })),
    ),
  ).toThrow("512KiB");
});
