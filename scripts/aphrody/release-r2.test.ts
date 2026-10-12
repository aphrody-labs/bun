import { expect, test } from "bun:test";
import { contentType, parseSums, prune, versionOf, windowsManifest } from "./release-r2.ts";

const sha = (c: string) => c.repeat(64);

test("parseSums reads sha256sum output and rejects anything else", () => {
  const sums = parseSums(`${sha("A")}  bun-linux-x64.zip\n${sha("b")} *bun-windows-x64.zip\n\n`);
  expect([...sums]).toEqual([
    ["bun-linux-x64.zip", sha("a")],
    ["bun-windows-x64.zip", sha("b")],
  ]);
  expect(() => parseSums(`${sha("a")}  ../escape.zip`)).toThrow("unexpected line");
  expect(() => parseSums(`${sha("a")}  x.zip\n${sha("b")}  x.zip`)).toThrow("listed twice");
});

test("windowsManifest points the product setup at the versioned archive", () => {
  const latest = {
    tag: "aphrody-v1.4.3-aphrody.4",
    version: versionOf("aphrody-v1.4.3-aphrody.4"),
    published: "2026-10-09T17:23:58Z",
    base: "https://dist.aphrody.app/bun/aphrody-v1.4.3-aphrody.4",
    assets: [{ name: "bun-windows-x64.zip", sha256: sha("c"), size: 1 }],
  };
  expect(windowsManifest(latest)).toMatchObject({
    version: "1.4.3-aphrody.4",
    path: "aphrody-v1.4.3-aphrody.4",
    archive: "bun-windows-x64.zip",
    sha256: sha("c"),
  });
  expect(windowsManifest({ ...latest, assets: [] })).toBeNull();
  expect(versionOf("bun-v1.4.4")).toBe("1.4.4");
});

test("prune keeps the current tag and the newest others", () => {
  const mirrored = [
    { tag: "a", uploaded: 1 },
    { tag: "b", uploaded: 2 },
    { tag: "c", uploaded: 3 },
    { tag: "d", uploaded: 4 },
  ];
  expect(prune(mirrored, "a", 2)).toEqual(["c", "b"]);
  expect(prune(mirrored, "d", 5)).toEqual([]);
  expect(contentType("bun.zip")).toBe("application/zip");
  expect(contentType("SHA256SUMS.txt")).toBe("text/plain; charset=utf-8");
});
