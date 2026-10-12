import { expect, test } from "bun:test";
import { join } from "node:path";
import { startWorker } from "../src/index.ts";

const app = join(import.meta.dir, "..", "app");
const secret = "test-secret";

async function bundle() {
  const result = await Bun.build({
    entrypoints: [join(app, "src", "worker.ts")],
    target: "browser",
    format: "esm",
    external: ["cloudflare:*"],
  });
  if (!result.success) throw new AggregateError(result.logs, "bundle failed");
  return result.outputs[0].text();
}

test("aphrody.app Worker serves the API with its bindings", async () => {
  await using worker = await startWorker({
    script: await bundle(),
    compatibilityDate: "2026-10-06",
    d1Databases: ["DB"],
    kvNamespaces: ["CACHE"],
    r2Buckets: ["APHRODY", "DRAGONBALLFR"],
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
    (await Bun.file(join(app, "migrations", "0001_init.sql")).text())
      .replace(/--.*$/gm, "")
      .replace(/\s+/g, " "),
  );
  const auth = { Authorization: `Bearer ${secret}` };

  const health = await (await worker.fetch("/api/health")).json();
  expect(health).toMatchObject({ ok: true, buckets: ["aphrody", "dragonballfr"] });

  expect(
    (await worker.fetch("/api/files/aphrody/a.txt", { method: "PUT", body: "x" })).status,
  ).toBe(401);
  expect(
    (
      await worker.fetch("/api/files/aphrody/a.txt", {
        method: "PUT",
        body: "x",
        headers: { Authorization: "Bearer no" },
      })
    ).status,
  ).toBe(401);
  const put = await worker.fetch("/api/files/aphrody/dir/a.txt", {
    method: "PUT",
    body: "bonjour",
    headers: { ...auth, "Content-Type": "text/plain" },
  });
  expect(await put.json()).toMatchObject({ key: "dir/a.txt", size: 7 });
  expect(put.status).toBe(201);

  const list = (await (await worker.fetch("/api/files/aphrody")).json()) as {
    objects: { key: string }[];
  };
  expect(list.objects.map((o: { key: string }) => o.key)).toEqual(["dir/a.txt"]);

  const get = await worker.fetch("/api/files/aphrody/dir/a.txt");
  expect(await get.text()).toBe("bonjour");
  expect(get.headers.get("Content-Type")).toBe("text/plain");
  const range = await worker.fetch("/api/files/aphrody/dir/a.txt", {
    headers: { Range: "bytes=0-2" },
  });
  expect(await range.text()).toBe("bon");
  expect(range.status).toBe(206);
  const etag = get.headers.get("ETag")!;
  expect(
    (await worker.fetch("/api/files/aphrody/dir/a.txt", { headers: { "If-None-Match": etag } }))
      .status,
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

  const index = await worker.fetch("/api/index");
  expect(index.headers.get("X-Cache")).toBe("MISS");
  expect(Array.isArray(await index.json())).toBe(true);
});

type D1Like = { exec(sql: string): Promise<unknown> };
