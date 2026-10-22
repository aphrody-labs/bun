import { expect, test } from "bun:test";
import { join } from "node:path";
import { startWorker } from "../src/index.ts";

const app = join(import.meta.dir, "..", "..", "web", "cloudflare");
const secret = "test-secret";

async function bundle() {
  const result = await Bun.build({
    entrypoints: [join(app, "src", "worker.ts")],
    target: "browser",
    format: "esm",
    // The Worker runs with nodejs_compat (wrangler.jsonc, startWorker's default): workerd provides node:*.
    external: ["cloudflare:*", "node:*"],
  });
  if (!result.success) throw new AggregateError(result.logs, "bundle failed");
  return result.outputs[0].text();
}

test("bun.aphrody.app Worker serves the API with its bindings", async () => {
  await using worker = await startWorker({
    script: await bundle(),
    compatibilityDate: "2026-10-06",
    d1Databases: ["DB"],
    kvNamespaces: ["CACHE"],
    r2Buckets: ["APHRODY"],
    durableObjects: { ROOMS: { className: "Room", useSQLite: true } },
    queueProducers: { JOBS: { queueName: "aphrody-app-jobs" } },
    workflows: { INGEST: { name: "aphrody-app-ingest", className: "Ingest" } },
    ratelimits: { WRITE_LIMITER: { namespace_id: "1001", simple: { limit: 60, period: 60 } } },
    versionMetadata: "VERSION",
    bindings: {
      APP_SECRET: secret,
      AI_MODEL: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
      PUBLIC_ORIGIN: "http://x",
    },
  });
  const env = await worker.bindings<{ DB: D1Like }>();
  await env.DB.exec(
    (await Bun.file(join(app, "migrations", "0001_init.sql")).text()).replace(/--.*$/gm, "").replace(/\s+/g, " "),
  );
  const auth = { Authorization: `Bearer ${secret}` };

  const health = await (await worker.fetch("/api/health")).json();
  expect(health).toMatchObject({ ok: true, buckets: ["aphrody-assets"] });

  expect((await worker.fetch("/api/files/aphrody-assets/a.txt", { method: "PUT", body: "x" })).status).toBe(401);
  expect(
    (
      await worker.fetch("/api/files/aphrody-assets/a.txt", {
        method: "PUT",
        body: "x",
        headers: { Authorization: "Bearer no" },
      })
    ).status,
  ).toBe(401);
  const put = await worker.fetch("/api/files/aphrody-assets/dir/a.txt", {
    method: "PUT",
    body: "bonjour",
    headers: { ...auth, "Content-Type": "text/plain" },
  });
  expect(await put.json()).toMatchObject({ key: "dir/a.txt", size: 7 });
  expect(put.status).toBe(201);

  const list = (await (await worker.fetch("/api/files/aphrody-assets")).json()) as {
    objects: { key: string }[];
  };
  expect(list.objects.map((o: { key: string }) => o.key)).toEqual(["dir/a.txt"]);

  const get = await worker.fetch("/api/files/aphrody-assets/dir/a.txt");
  expect(await get.text()).toBe("bonjour");
  expect(get.headers.get("Content-Type")).toBe("text/plain");
  const range = await worker.fetch("/api/files/aphrody-assets/dir/a.txt", {
    headers: { Range: "bytes=0-2" },
  });
  expect(await range.text()).toBe("bon");
  expect(range.status).toBe(206);
  const etag = get.headers.get("ETag")!;
  expect(
    (await worker.fetch("/api/files/aphrody-assets/dir/a.txt", { headers: { "If-None-Match": etag } })).status,
  ).toBe(304);

  expect((await worker.fetch("/api/files/nope")).status).toBe(404);

  const posted = await worker.fetch("/api/rooms/lobby", {
    method: "POST",
    body: JSON.stringify({ body: "salut" }),
    headers: { ...auth, "Content-Type": "application/json" },
  });
  expect(posted.status).toBe(201);
  const history = (await (await worker.fetch("/api/rooms/lobby")).json()) as { body: string }[];
  expect(history.map((m: { body: string }) => m.body)).toEqual(["salut"]);
  expect((await worker.fetch("/api/rooms/bad%20name")).status).toBe(400);

  expect((await worker.fetch("/api/bun/search")).status).toBe(400);
  expect((await worker.fetch(`/api/bun/search?q=${"x".repeat(501)}`)).status).toBe(400);
  expect((await worker.fetch("/api/bun/other?q=serve")).status).toBe(404);

  const index = await worker.fetch("/api/index");
  expect(index.headers.get("X-Cache")).toBe("MISS");
  expect(Array.isArray(await index.json())).toBe(true);
});

test("ovh.ts mirrors an OVH BIND export without SOA, NS and ACME challenges", async () => {
  const { parseZone, key } = await import("../../web/cloudflare/scripts/ovh.ts");
  const records = parseZone(
    [
      "$TTL 3600",
      "@\tIN SOA dns200.anycast.me. tech.ovh.net. (1 86400 3600 3600000 60)",
      "        IN NS     dns200.anycast.me.",
      "        IN MX     5 mx1.mail.ovh.net.",
      "    300 IN A     51.77.147.152",
      '        IN TXT     "v=spf1 include:mx.ovh.com ~all"',
      "_autodiscover._tcp        IN SRV     0 0 443 zimbra1.mail.ovh.net.",
      '_acme-challenge.www     60 IN TXT     "x"',
      "www    300 IN CNAME     example.com.",
      "cdn    300 IN CNAME     example.com.",
      "cdn    300 IN CNAME     example.com.",
      'google._domainkey        IN TXT     ( "v=DKIM1; p=AB" "CD" )',
    ].join("\n"),
    "example.com",
  );
  expect(records.map(key)).toEqual([
    "MX example.com mx1.mail.ovh.net",
    "A example.com 51.77.147.152",
    "TXT example.com v=spf1 include:mx.ovh.com ~all",
    "SRV _autodiscover._tcp.example.com 0 443 zimbra1.mail.ovh.net",
    "CNAME www.example.com example.com",
    "CNAME cdn.example.com example.com",
    "TXT google._domainkey.example.com v=DKIM1; p=ABCD",
  ]);
  expect(records[0]).toMatchObject({ priority: 5, ttl: 3600 });
  expect(records[1].ttl).toBe(300);
  expect(records[3].data).toEqual({ priority: 0, weight: 0, port: 443, target: "zimbra1.mail.ovh.net" });
});

type D1Like = { exec(sql: string): Promise<unknown> };
