import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readPublicSiteSnapshot, publishPublicSiteSnapshot } from "./site-neon-import";
import { publicSiteAPI } from "./site-api";
import { searchPublicSiteDocs, type SiteQuery } from "./site-neon";
import { createNeonHTTPClient } from "../../bun-plugin-neon/src/http";
import { readPublicNativeGraph } from "./site-native-graph";

const hash = (value: string | Uint8Array) => new Bun.CryptoHasher("sha256").update(value).digest("hex");
async function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "bun-public-site-"));
  const content = "---\ntitle: Bun Video\ndescription: Native frames\n---\nBun.Video frame resize metadata.\n";
  const db = new Database(join(directory, "monorepo.sqlite"));
  db.exec(`CREATE TABLE release_files(path TEXT,domain TEXT,content TEXT,sha256 TEXT);
    CREATE TABLE release_domains(name TEXT,files INTEGER);CREATE TABLE release_links(source TEXT,target TEXT,kind TEXT);`);
  const insert = db.prepare("INSERT INTO release_files VALUES(?,?,?,?)");
  insert.run("docs/runtime/video.mdx", "docs", content, hash(content));
  insert.run("docs/secrets/token.md", "docs", "PRIVATE", hash("PRIVATE"));
  insert.run("src/runtime/video.rs", "src/runtime", null, null);
  db.exec(`INSERT INTO release_domains VALUES('docs',2),('src/runtime',1),('.codex',1);
    INSERT INTO release_links VALUES('docs/runtime/video.mdx','src/runtime/video.rs','relative-reference');`);
  db.close(true);
  await Bun.write(join(directory, "releases.json"), "[]");
  const manifest = {
    schema: 1,
    source: "a".repeat(40),
    generatedAt: "2026-10-13T12:00:00Z",
    releaseRepository: "aphrody-labs/bun",
    artifacts: {
      "monorepo.sqlite": hash(await Bun.file(join(directory, "monorepo.sqlite")).bytes()),
      "releases.json": hash("[]"),
    },
  };
  const body = JSON.stringify(manifest);
  await Bun.write(join(directory, "manifest.json"), body);
  return { directory, manifestSHA256: hash(body) };
}

test("public release projection selects hash-qualified docs and graph without protected rows", async () => {
  const input = await fixture();
  try {
    const snapshot = await readPublicSiteSnapshot(input.directory, input.manifestSHA256);
    expect(snapshot.documents.map(doc => doc.path)).toEqual(["docs/runtime/video.mdx"]);
    expect(snapshot.documents[0].title).toBe("Bun Video");
    expect(snapshot.documents[0].chunks[0].body).toContain("Bun.Video");
    expect(snapshot.domains.map(domain => domain.name)).toEqual(["docs", "src/runtime"]);
    expect(snapshot.links).toEqual([{ source: "docs", target: "src/runtime", references_count: 1 }]);
    await expect(readPublicSiteSnapshot(input.directory, "f".repeat(64))).rejects.toThrow("differs");
    const db = new Database(join(input.directory, "monorepo.sqlite"));
    db.exec("UPDATE release_files SET content='changed' WHERE path='docs/runtime/video.mdx'");
    db.close(true);
    await expect(readPublicSiteSnapshot(input.directory, input.manifestSHA256)).rejects.toThrow("differs");
  } finally {
    rmSync(input.directory, { recursive: true, force: true });
  }
});

test("retrieval pins graph and documentation to the selected current snapshot and binds query text", async () => {
  const snapshot = {
    id: "b".repeat(64),
    profile: "bun",
    repository: "aphrody-labs/bun",
    source: "a".repeat(40),
    counts: {},
  };
  const calls: { text: string; parameters: readonly unknown[] }[] = [];
  const sql: SiteQuery = {
    async query<T>(text: string, parameters: readonly unknown[] = []): Promise<T[]> {
      calls.push({ text, parameters });
      return (
        calls.length === 1
          ? [snapshot]
          : [
              {
                path: "docs/runtime/video.mdx",
                title: "Bun Video",
                description: "Native frames",
                sha256: "c".repeat(64),
                score: 1,
                chunks: [],
              },
            ]
      ) as T[];
    },
  };
  const result = await searchPublicSiteDocs(sql, { query: "Bun.Video", limit: 8 });
  expect(calls[1].parameters).toEqual([snapshot.id, "Bun.Video", 8]);
  expect(result.documents[0].url).toContain(`/blob/${snapshot.source}/docs/runtime/video.mdx`);
  expect((await publicSiteAPI(new Request("https://aphrody.app/api/site/docs?q=x&limit=9"), sql)).status).toBe(400);
  expect(
    (await publicSiteAPI(new Request("https://aphrody.app/api/site/snapshot", { method: "POST" }), sql)).status,
  ).toBe(405);
});

test("Neon HTTP adapter fails closed for the destination and does not expose driver errors", async () => {
  expect(() => createNeonHTTPClient({ connectionString: "postgres://user:secret@host.invalid/bun_site" })).toThrow(
    "Neon endpoint",
  );
  expect(() =>
    createNeonHTTPClient({
      connectionString: "postgres://user:secret@ep.test.neon.tech/shenron",
      expectedDatabase: "bun_site",
    }),
  ).toThrow("expected destination");
});

test("French retrieval retries bounded literal terms only after the exact query is empty", async () => {
  const snapshot = { id: "a".repeat(64), source: "b".repeat(40), repository: "aphrody-labs/bun" };
  const calls: { text: string; parameters: readonly unknown[] }[] = [];
  const sql: SiteQuery = {
    async query<T>(text: string, parameters: readonly unknown[] = []): Promise<T[]> {
      calls.push({ text, parameters });
      return (
        calls.length === 1
          ? [snapshot]
          : calls.length === 2
            ? []
            : [
                {
                  path: "docs/runtime/video.mdx",
                  chunks: [],
                  score: 1,
                },
              ]
      ) as T[];
    },
  };
  const result = await searchPublicSiteDocs(sql, { query: "Comment utiliser Bun.Video avec Linux ?", limit: 2 });
  expect(calls[1].parameters).toEqual([snapshot.id, "Comment utiliser Bun.Video avec Linux ?", 2]);
  expect(calls[2].parameters).toEqual([snapshot.id, '"Bun.Video"', 2]);
  expect(calls[2].text).toBe(calls[1].text);
  expect(result.documents[0].url).toContain(`/blob/${snapshot.source}/`);
});

test("publication rejects stale or altered chunks before advancing the current pointer", async () => {
  const input = await fixture();
  try {
    const snapshot = await readPublicSiteSnapshot(input.directory, input.manifestSHA256);
    const statements: string[] = [];
    type TestSQL = {
      unsafe<T = unknown>(text: string): Promise<T>;
      begin<T>(fn: (sql: TestSQL) => Promise<T>): Promise<T>;
    };
    const tx: TestSQL = {
      unsafe: async <T>(text: string): Promise<T> => {
        statements.push(text);
        return (text.includes("FOR UPDATE") ? [{ source_date: "2026-10-14T00:00:00Z" }] : []) as T;
      },
      begin: async <T>(fn: (sql: TestSQL) => Promise<T>) => fn(tx),
    };
    await expect(publishPublicSiteSnapshot(tx, snapshot)).rejects.toThrow("older");
    expect(statements.some(statement => statement.startsWith("INSERT INTO"))).toBe(false);
    snapshot.documents[0].chunks[0].body = "changed";
    await expect(publishPublicSiteSnapshot(tx, snapshot)).rejects.toThrow("hash differs");
  } finally {
    rmSync(input.directory, { recursive: true, force: true });
  }
});

test("native graph export verifies profile, revision, namespace and public extracted endpoints", () => {
  const db = new Database(":memory:"),
    revision = "a".repeat(40),
    graphSHA = "b".repeat(64),
    producerSHA = "c".repeat(64),
    repository = "native-runtime",
    namespace = `${repository}:graph:${graphSHA}:`;
  try {
    db.exec(`CREATE TABLE repositories(id TEXT,revision TEXT,metadata TEXT); CREATE TABLE graph_snapshots(id TEXT,repository_id TEXT,sha256 TEXT,revision TEXT,metadata TEXT);
      CREATE TABLE nodes(id TEXT,repository_id TEXT,kind TEXT,label TEXT,file TEXT,line INTEGER,provenance TEXT); CREATE TABLE release_files(path TEXT,sha256 TEXT);
      CREATE TABLE edges(id TEXT,repository_id TEXT,source TEXT,target TEXT,kind TEXT,provenance TEXT,confidence REAL);`);
    db.prepare("INSERT INTO repositories VALUES(?,?,?)").run(
      repository,
      revision,
      JSON.stringify({ profile: "bun", domain: "src/runtime", source: "graph:bun:src:runtime" }),
    );
    db.prepare("INSERT INTO graph_snapshots VALUES(?,?,?,?,?)").run(
      "selected",
      repository,
      graphSHA,
      revision,
      JSON.stringify({
        namespace,
        nodes: 3,
        edges: 2,
        graph: {
          domain: "src/runtime",
          scope: { profile: "bun", source: "graph:bun:src:runtime" },
          producerSHA256: producerSHA,
        },
      }),
    );
    db.prepare("INSERT INTO release_files VALUES(?,?)").run("src/runtime/video.rs", "d".repeat(64));
    const node = db.prepare("INSERT INTO nodes VALUES(?,?,?,?,?,?,?)");
    node.run(namespace + "frame", repository, "code", "BunVideo.frame", "video.rs", 12, "EXTRACTED");
    node.run(namespace + "resize", repository, "code", "resize", "video.rs", 21, "EXTRACTED");
    node.run(namespace + "unknown", repository, "unresolved", "unknown", "video.rs", null, "UNRESOLVED");
    const edge = db.prepare("INSERT INTO edges VALUES(?,?,?,?,?,?,?)");
    edge.run(namespace + "edge:1", repository, namespace + "frame", namespace + "resize", "calls", "EXTRACTED", 1);
    edge.run(namespace + "edge:2", repository, namespace + "frame", namespace + "unknown", "calls", "UNRESOLVED", 0);
    const index = {
      profile: "bun",
      namespace: "bun",
      producerSHA256: producerSHA,
      revision,
      domains: [{ domain: "src/runtime", repository, snapshot: "selected", sha256: graphSHA }],
    };
    const result = readPublicNativeGraph(db, revision, index);
    expect(result.nodes.map(node => node.label)).toEqual(["BunVideo.frame", "resize"]);
    expect(result.nodes.map(node => node.path)).toEqual(["src/runtime/video.rs", "src/runtime/video.rs"]);
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].provenance).toBe("EXTRACTED");
    expect(result.coverage.truncated).toBe(true);
    expect(() => readPublicNativeGraph(db, revision, { ...index, profile: "dbfr" })).toThrow("Bun source");
    expect(() => readPublicNativeGraph(db, revision, { ...index, producerSHA256: "e".repeat(64) })).toThrow(
      "producer hash",
    );
  } finally {
    db.close(true);
  }
});
