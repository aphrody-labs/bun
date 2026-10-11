import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { tempDir } from "../../../test/harness.ts";
import {
  catalog,
  createClient,
  credentialsFromEnv,
  exec,
  getPlatformProxy,
  hasCredentials,
  installedVersion,
  resolveBin,
  serveModule,
  serveWorker,
  startWorker,
  toWorker,
} from "../src/index.ts";

const pkg = await Bun.file(join(import.meta.dir, "..", "package.json")).json();

describe("catalog", () => {
  test("matches package.json dependencies exactly", () => {
    expect(catalog.map(e => e.name).sort()).toEqual(Object.keys(pkg.dependencies).sort());
  });

  test("every package is installed and every bin resolves", async () => {
    const missing = catalog.filter(e => !installedVersion(e.name)).map(e => e.name);
    expect(missing).toEqual([]);
    for (const bin of catalog.flatMap(e => e.bins ?? [])) expect(await Bun.file(resolveBin(bin)).exists()).toBe(true);
  });
});

describe("bins", () => {
  test.concurrent.each([
    ["wrangler", /^4\.\d+\.\d+/],
    ["workerd", /^workerd \d{4}-\d{2}-\d{2}/],
  ])("%s runs under Bun", async (bin, version) => {
    const proc = exec(bin as string, ["--version"], { stdio: "pipe" });
    const [stdout, exitCode] = await Promise.all([new Response(proc.stdout as ReadableStream).text(), proc.exited]);
    expect(stdout.trim()).toMatch(version);
    expect(exitCode).toBe(0);
  });
});

describe("api", () => {
  test("credentials come from the environment", () => {
    const creds = credentialsFromEnv({ CLOUDFLARE_API_TOKEN: "t", CLOUDFLARE_ACCOUNT_ID: "a" });
    expect(creds).toEqual({ apiToken: "t", apiKey: undefined, apiEmail: undefined, accountId: "a" });
    expect(hasCredentials(creds)).toBe(true);
    expect(hasCredentials(credentialsFromEnv({ CLOUDFLARE_API_KEY: "k" }))).toBe(false);
  });

  test("createClient refuses to run without credentials", () => {
    expect(() => createClient({ credentials: {} })).toThrow("CLOUDFLARE_API_TOKEN");
    expect(createClient({ credentials: { apiToken: "t" } }).user).toBeDefined();
  });
});

describe("worker", () => {
  test("toWorker + serveModule run a Workers module in Bun", async () => {
    let waited = false;
    const worker = toWorker<{ GREETING: string }>(async (request, { env, ctx }) => {
      ctx.waitUntil(Promise.resolve().then(() => (waited = true)));
      return new Response(`${env.GREETING} ${new URL(request.url).pathname}`);
    });
    const { server, url, drain } = serveModule(worker, { GREETING: "hello" });
    try {
      const body = await (await fetch(new URL("/bun", url))).text();
      await drain();
      expect(body).toBe("hello /bun");
      expect(waited).toBe(true);
    } finally {
      server.stop(true);
    }
  });

  test("startWorker runs a Worker in workerd with a KV binding", async () => {
    await using worker = await startWorker({
      script: `export default {
        async fetch(request, env) {
          const key = new URL(request.url).pathname.slice(1);
          if (request.method === "PUT") { await env.KV.put(key, await request.text()); return new Response("stored"); }
          return new Response((await env.KV.get(key)) ?? "none");
        },
      };`,
      kvNamespaces: ["KV"],
    });
    expect(await (await worker.fetch("/greeting", { method: "PUT", body: "bonjour" })).text()).toBe("stored");
    expect(await (await worker.fetch("/greeting")).text()).toBe("bonjour");
    const env = await worker.bindings<{ KV: { get(key: string): Promise<string | null> } }>();
    expect(await env.KV.get("greeting")).toBe("bonjour");
  });

  test("getPlatformProxy gives Bun the bindings of wrangler.jsonc", async () => {
    using dir = tempDir("bun-cloudflare-proxy", {
      "wrangler.jsonc": JSON.stringify({
        name: "proxy",
        main: "index.js",
        compatibility_date: "2026-10-01",
        kv_namespaces: [{ binding: "KV", id: "local" }],
        vars: { MODE: "local" },
      }),
      "index.js": "export default { fetch: () => new Response('ok') };",
    });
    const proxy = await getPlatformProxy<{
      KV: { put(k: string, v: string): Promise<void>; get(k: string): Promise<string | null> };
      MODE: string;
    }>({
      configPath: join(String(dir), "wrangler.jsonc"),
      persist: false,
    });
    try {
      await proxy.env.KV.put("k", "v");
      expect(await proxy.env.KV.get("k")).toBe("v");
      expect(proxy.env.MODE).toBe("local");
    } finally {
      await proxy.dispose();
    }
  });

  test("serveWorker exposes the Worker over Bun.serve", async () => {
    await using served = await serveWorker({
      script: `export default { fetch: req => Response.json({ method: req.method, cf: typeof req.cf }) };`,
    });
    const res = await fetch(new URL("/x", served.url), { method: "POST", body: "1" });
    expect(await res.json()).toEqual({ method: "POST", cf: "object" });
  });
});
