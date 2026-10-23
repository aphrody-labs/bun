import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "./config.ts";
import { createAphrodyServer } from "./server.ts";
import { entrySource } from "./build.ts";

let root: string, app: ReturnType<typeof createAphrodyServer>, base: string;
const auth = { authorization: "Bearer s3cret" };

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "aphrody-"));
  const site = join(root, "site");
  mkdirSync(join(site, "docs"), { recursive: true });
  writeFileSync(join(site, "index.html"), "<h1>home</h1>");
  writeFileSync(join(site, "404.html"), "<h1>missing</h1>");
  writeFileSync(join(site, "docs", "index.html"), "<h1>docs</h1>");
  writeFileSync(join(site, "install.sh"), "echo hi");
  const config = loadConfig({
    APHRODY_HOST: "127.0.0.1",
    APHRODY_PORT: "0",
    APHRODY_DATA_DIR: join(root, "data"),
    APHRODY_ASSETS_DIR: site,
    APP_SECRET: "s3cret",
    APHRODY_CONFIG: undefined,
  });
  app = createAphrodyServer(config);
  base = app.server.url.href.replace(/\/$/, "");
});
afterAll(() => {
  app.stop();
  rmSync(root, { recursive: true, force: true });
});

test("serves the static site with Worker-style html handling", async () => {
  expect(await (await fetch(base + "/")).text()).toBe("<h1>home</h1>");
  expect(await (await fetch(base + "/docs")).text()).toBe("<h1>docs</h1>");
  const miss = await fetch(base + "/nope");
  expect(miss.status).toBe(404);
  expect(await miss.text()).toBe("<h1>missing</h1>");
  expect((await fetch(base + "/install.sh")).status).toBe(200);
  expect((await fetch(base + "/../../etc/passwd")).status).toBeGreaterThanOrEqual(400);
});

test("health and public MCP come from the shared handler", async () => {
  const health = await (await fetch(base + "/api/health")).json();
  expect(health).toMatchObject({ ok: true, tag: "self-hosted", buckets: ["aphrody-assets"] });
  const mcp = await fetch(base + "/mcp", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
  expect(mcp.status).toBe(200);
  expect(((await mcp.json()) as { result: { tools: unknown[] } }).result.tools.length).toBeGreaterThan(0);
});

test("files: authenticated write, ranged read, listing, delete", async () => {
  const url = base + "/api/files/aphrody-assets/a/b.txt";
  expect((await fetch(url, { method: "PUT", body: "hello world" })).status).toBe(401);
  const put = await fetch(url, {
    method: "PUT",
    body: "hello world",
    headers: { ...auth, "content-type": "text/plain" },
  });
  expect(put.status).toBe(201);
  expect(await (await fetch(url)).text()).toBe("hello world");
  const ranged = await fetch(url, { headers: { range: "bytes=6-10" } });
  expect(ranged.status).toBe(206);
  expect(await ranged.text()).toBe("world");
  // Reading by key is public; enumerating the bucket or the upload index needs the secret.
  expect((await fetch(base + "/api/files/aphrody-assets?prefix=a/")).status).toBe(401);
  expect((await fetch(base + "/api/index")).status).toBe(401);
  const list = (await (await fetch(base + "/api/files/aphrody-assets?prefix=a/", { headers: auth })).json()) as {
    objects: { key: string }[];
  };
  expect(list.objects.map(o => o.key)).toEqual(["a/b.txt"]);
  expect((await fetch(base + "/api/index", { headers: auth })).status).toBe(200);
  expect((await fetch(url, { method: "DELETE", headers: auth })).status).toBe(204);
  expect((await fetch(url)).status).toBe(404);
});

test("rooms, and routes needing external services answer explicitly", async () => {
  const room = base + "/api/rooms/lobby";
  expect((await fetch(room, { method: "POST", headers: auth, body: JSON.stringify({ body: "hi" }) })).status).toBe(201);
  expect(await (await fetch(room)).json()).toMatchObject([{ body: "hi" }]);
  expect((await fetch(base + "/api/rooms/lobby/ws")).status).toBe(501);
  expect((await fetch(base + "/api/bun/search?q=serve")).status).toBe(501);
  expect((await fetch(base + "/api/site/docs?q=serve")).status).toBe(503);
});

test("compile entry embeds every asset", () => {
  const source = entrySource("/x", ["index.html", "a/b.css"]);
  expect(source).toContain('with { type: "file" }');
  expect(source).toContain('"a/b.css": a1');
});
