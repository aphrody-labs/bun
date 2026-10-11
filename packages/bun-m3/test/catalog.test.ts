// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { join } from "node:path";
import { tempDir } from "harness";
import { createPublicCatalog, type PublicSnapshot } from "../src/catalog";

test("pinned catalogs preserve doc filters, real template details and public asset manifest", async () => {
  const docs = [
    { id: "one", category: "Runtime", title: "Bun", summary: "fast", content: "native", tags: ["Web"] },
    { id: "two", category: "UI", title: "M3", summary: "tokens", content: "design", tags: [] },
  ];
  using root = tempDir("public-catalog", {
    "docs.json": JSON.stringify(docs),
    "templates.json": '[{"id":"base"}]',
    "assets.json": "[]",
  });
  const pinned = async (name: string): Promise<PublicSnapshot> => ({
    path: join(String(root), name),
    sha256: new Bun.CryptoHasher("sha256").update(await Bun.file(join(String(root), name)).bytes()).digest("hex"),
  });
  const options = {
    docsFile: await pinned("docs.json"),
    templatesFile: await pinned("templates.json"),
    assetsFile: await pinned("assets.json"),
    uiShell: () => new Response("canonical template shell"),
  };
  const handler = await createPublicCatalog(options);
  const get = (path: string, method = "GET") => handler(new Request("http://localhost" + path, { method }));
  expect(await (await get("/api/docs?q=wEb&category=All"))!.json()).toEqual([docs[0]]);
  expect(await (await get("/api/docs?id=two"))!.json()).toEqual([docs[1]]);
  expect(await (await get("/api/docs?category=unknown"))!.json()).toEqual([]);
  expect(await (await get("/api/templates?category=ignored"))!.json()).toEqual([{ id: "base" }]);
  expect(await (await get("/assets/manifest"))!.json()).toEqual([]);
  expect(await (await get("/templates/base"))!.text()).toBe("canonical template shell");
  expect(await get("/templates/download")).toBeNull();
  expect(await get("/api/other")).toBeNull();
  expect(await (await get("/api/docs", "HEAD"))!.text()).toBe("");
  expect((await get("/api/templates", "POST"))!.status).toBe(405);
  await expect(
    createPublicCatalog({ ...options, docsFile: { ...options.docsFile, sha256: "0".repeat(64) } }),
  ).rejects.toThrow("SHA256 mismatch");
});

test("M3 route validates owner requests and never invents palette output", async () => {
  using root = tempDir("public-m3-owner", { "docs.json": "[]", "templates.json": "[]", "assets.json": "[]" });
  const pin = (name: string) => ({
    path: join(String(root), name),
    sha256: new Bun.CryptoHasher("sha256").update("[]").digest("hex"),
  });
  const options = {
    docsFile: pin("docs.json"),
    templatesFile: pin("templates.json"),
    assetsFile: pin("assets.json"),
    uiShell: () => new Response("canonical"),
  };
  const unavailable = await createPublicCatalog(options);
  expect((await unavailable(new Request("http://localhost/api/m3/css?sheet=scheme")))!.status).toBe(503);
  let calls = 0;
  const handler = await createPublicCatalog({
    ...options,
    m3Css: config => {
      calls++;
      expect(config).toEqual({ sheet: "scheme", seed: "#abc", variant: "tonal_spot", dark: true, contrast: 1 });
      return ":root{--owner-color:#abc}";
    },
  });
  const response = await handler(
    new Request("http://localhost/api/m3/css?sheet=scheme&seed=%23abc&variant=tonal_spot&dark=true&contrast=1"),
  );
  expect(await response!.text()).toBe(":root{--owner-color:#abc}");
  expect(response!.headers.get("content-type")).toBe("text/css; charset=utf-8");
  for (const query of [
    "sheet=invalid",
    "sheet=scheme&seed=bad",
    "sheet=scheme&dark=1",
    "sheet=scheme&contrast=2",
    "sheet=scheme&contrast=0x1",
    "sheet=scheme&variant=bad",
    "sheet=scheme&sheet=tokens",
  ])
    expect((await handler(new Request("http://localhost/api/m3/css?" + query)))!.status).toBe(400);
  expect(calls).toBe(1);
});
