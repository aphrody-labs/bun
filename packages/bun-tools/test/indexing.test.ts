import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { linkSync } from "node:fs";
import { join } from "node:path";
import { tempDir } from "harness";
import {
  indexNtfs,
  syncNtfs,
  scanPe,
  persistPe,
  resolvePeImports,
  indexFileAliases,
  readFileAliases,
  publishMetadataCache,
  persistResources,
  indexSources,
  migrateIndexDatabase,
  type NtfsVolumeReader,
  type JournalEntry,
  type MetadataRedis,
  type PeArtifact,
} from "../src/indexing/index";

test("unsupported legacy schemas leave the source intact and remove only the reserved failed copy", async () => {
  using directory = tempDir("legacy-schema-refusal", {});
  const sourceDbPath = join(String(directory), "unsupported.sqlite");
  const destinationDbPath = join(String(directory), "attempt.sqlite");
  {
    using db = new Database(sourceDbPath);
    db.exec("CREATE TABLE ntfs_volumes(unexpected TEXT); INSERT INTO ntfs_volumes VALUES('fixture')");
  }
  const bytes = await Bun.file(sourceDbPath).bytes();
  await expect(migrateIndexDatabase({ sourceDbPath, destinationDbPath })).rejects.toThrow("Unsupported legacy schema");
  expect(await Bun.file(sourceDbPath).bytes()).toEqual(bytes);
  expect(await Bun.file(destinationDbPath).exists()).toBe(false);
});

test("legacy index migration preserves source bytes and graph provenance while normalizing a separate copy", async () => {
  using directory = tempDir("legacy-index-copy", {});
  const sourceDbPath = join(String(directory), "legacy.sqlite");
  const destinationDbPath = join(String(directory), "generic.sqlite");
  {
    using db = new Database(sourceDbPath);
    db.exec(`
      CREATE TABLE ntfs_volumes(volume_id TEXT PRIMARY KEY,journal_id TEXT,journal_start_usn TEXT,
        scan_status TEXT,entry_count INTEGER,started_at TEXT,completed_at TEXT);
      INSERT INTO ntfs_volumes VALUES('D:','9007199254740993','10','complete',1,'start','end');
      CREATE TABLE ntfs_journal_state(volume_id TEXT PRIMARY KEY,journal_id TEXT,next_usn TEXT,updated_at TEXT);
      INSERT INTO ntfs_journal_state VALUES('D:','9007199254740993','9007199254740995','synced');
      CREATE TABLE ntfs_entries(volume_id TEXT,record INTEGER,parent_record INTEGER,attributes INTEGER,name TEXT,is_directory INTEGER,scanned_at TEXT);
      INSERT INTO ntfs_entries VALUES('D:',20,5,0,'sample.dll',0,'scan');
      CREATE TABLE ntfs_entry_edges(volume_id TEXT,parent_record INTEGER,child_record INTEGER,relation TEXT);
      INSERT INTO ntfs_entry_edges VALUES('D:',5,20,'contains');
      CREATE TABLE ntfs_journal_events(volume_id TEXT,journal_id TEXT,usn TEXT,record INTEGER,parent_record INTEGER,
        timestamp INTEGER,reason INTEGER,attributes INTEGER,name TEXT);
      INSERT INTO ntfs_journal_events VALUES('D:','9007199254740993','9007199254740994',20,5,9223372036854775806,256,0,'sample.dll');
      CREATE TABLE ntfs_paths(file_id TEXT,path TEXT,file_record INTEGER,declared_link_count INTEGER,alias_complete INTEGER);
      INSERT INTO ntfs_paths VALUES('volume:file','D:/images/sample.dll',20,1,1);
      CREATE TABLE pe_artifacts(path TEXT PRIMARY KEY,relative_path TEXT,bytes INTEGER,sha256 TEXT,pe_kind TEXT,machine TEXT,bits INTEGER,
        subsystem TEXT,characteristics INTEGER,dll_characteristics INTEGER,timestamp INTEGER,image_base TEXT,image_size INTEGER,
        entry_rva INTEGER,checksum INTEGER,is_dotnet INTEGER,sections_json TEXT,imports_json TEXT,exports_json TEXT,export_name TEXT,
        version_json TEXT,warnings_json TEXT,parse_error TEXT,scan_id TEXT,scanned_at TEXT);
      CREATE TABLE pe_import_edges(source_path TEXT,import_ordinal INTEGER,module_name TEXT,delay_import INTEGER,symbols_json TEXT,
        resolved_path TEXT,resolved_paths_json TEXT,resolution_status TEXT);
      CREATE TABLE omar_resources(id TEXT PRIMARY KEY,kind TEXT,name TEXT,canonical_path TEXT,metadata_json TEXT,updated_at TEXT);
      INSERT INTO omar_resources VALUES('project','repository','Public fixture','D:/fixture','{"revision":"fixture"}','at');
      CREATE TABLE graph_snapshots(id TEXT PRIMARY KEY,repository_id TEXT,revision TEXT,metadata TEXT);
      INSERT INTO graph_snapshots VALUES('snapshot:fixture','repo:fixture','source:fixture','{"producerSHA256":"unchanged"}');
    `);
    db.query(
      "INSERT INTO pe_artifacts VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    ).run(
      "D:/images/sample.dll",
      "sample.dll",
      128,
      "f".repeat(64),
      "dll",
      "x64",
      64,
      "windows",
      0,
      0,
      1,
      "9007199254740993",
      128,
      0,
      0,
      0,
      "[]",
      '[{"module":"absent.dll","functions":["Missing"]}]',
      "[]",
      null,
      "null",
      "[]",
      null,
      "scan-fixture",
      "scanned",
    );
    db.query("INSERT INTO pe_import_edges VALUES(?,?,?,?,?,?,?,?)").run(
      "D:/images/sample.dll",
      0,
      "absent.dll",
      0,
      '["Missing"]',
      null,
      "[]",
      "direct_unresolved",
    );
  }
  const before = new Bun.CryptoHasher("sha256")
    .update(await Bun.file(sourceDbPath).bytes())
    .digest("hex");
  const receipt = await migrateIndexDatabase({ sourceDbPath, destinationDbPath });
  expect(receipt.integrity).toBe("ok");
  expect(receipt.archivedTables).toContain("legacy_archive_ntfs_volumes");
  expect(receipt.preservedTables).toContain("graph_snapshots");
  expect(
    new Bun.CryptoHasher("sha256").update(await Bun.file(sourceDbPath).bytes()).digest("hex"),
  ).toBe(before);
  {
    using db = new Database(destinationDbPath, { readonly: true });
    expect(db.query("SELECT journal_id,next_usn,updated_at FROM ntfs_volumes").get()).toEqual({
      journal_id: "9007199254740993",
      next_usn: "9007199254740995",
      updated_at: "synced",
    });
    expect(db.query("SELECT timestamp FROM ntfs_journal_events").get()).toEqual({
      timestamp: "9223372036854775806",
    });
    expect(db.query("SELECT root,path FROM pe_artifacts").get()).toEqual({
      root: "D:/images",
      path: "D:/images/sample.dll",
    });
    const pe = db
      .query<{ metadata_json: string }, []>("SELECT metadata_json FROM pe_artifacts")
      .get()!;
    expect(JSON.parse(pe.metadata_json).imageBase).toBe("9007199254740993");
    expect(JSON.parse(pe.metadata_json).imports[0].module).toBe("absent.dll");
    expect(db.query("SELECT status FROM pe_import_edges").get()).toEqual({ status: "missing" });
    expect(db.query("SELECT id FROM resources").get()).toEqual({ id: "project" });
    expect(db.query("SELECT revision,metadata FROM graph_snapshots").get()).toEqual({
      revision: "source:fixture",
      metadata: '{"producerSHA256":"unchanged"}',
    });
    expect(db.query("SELECT COUNT(*) AS n FROM index_migrations").get()).toEqual({ n: 1 });
  }
  await expect(migrateIndexDatabase({ sourceDbPath, destinationDbPath })).rejects.toThrow(
    "never overwrites",
  );
  const rejected = join(String(directory), "rejected.sqlite");
  await expect(
    migrateIndexDatabase({ sourceDbPath, destinationDbPath: rejected, maxRows: 1 }),
  ).rejects.toThrow("maxRows");
  expect(await Bun.file(rejected).exists()).toBe(false);
  expect(
    new Bun.CryptoHasher("sha256").update(await Bun.file(sourceDbPath).bytes()).digest("hex"),
  ).toBe(before);
});

test("native source index retains domain scope, receipt label and bounded snapshot provenance", async () => {
  using directory = tempDir("native-source-index", {
    "src/lib.ts": "export function greet(name: string) { return `hello ${name}`; }",
    "packages/client/index.ts": "export const client = { ready: true };",
  });
  const dbPath = join(String(directory), "registry.sqlite");
  const artifactRoot = join(String(directory), "artifacts");
  const result = await indexSources({
    dbPath,
    root: String(directory),
    revision: "fixture-source-v1",
    namespace: "public-fixture",
    domains: ["src", "packages/client"],
    artifactRoot,
    concurrency: 1,
    maxFiles: 8,
    maxReadBytes: 64 << 10,
    maxFileBytes: 32 << 10,
    maxNodes: 128,
    maxEdges: 256,
    maxSnapshotBytes: 256 << 10,
  });
  expect(result.receiptNamespace).toBe("public-fixture");
  expect(result.revision).toBe("fixture-source-v1");
  expect(result.domains.map((domain) => domain.domain).sort()).toEqual(["packages/client", "src"]);
  expect(result.producerSHA256).toMatch(/^[a-f0-9]{64}$/);
  const { BunPython } = await import("bun:graph");
  using registry = new BunPython(dbPath);
  for (const domain of result.domains) {
    expect(domain.coverage.files).toBe(1);
    expect(domain.coverage.parseErrors).toBe(0);
    expect(domain.nodes).toBeGreaterThan(0);
    expect(domain.nodes).toBeLessThanOrEqual(128);
    expect(domain.edges).toBeLessThanOrEqual(256);
    expect(domain.artifact).toBeDefined();
    const path = domain.artifact!;
    expect(path.startsWith(join(artifactRoot, "public-fixture"))).toBe(true);
    const file = Bun.file(path);
    expect(file.size).toBeLessThanOrEqual(256 << 10);
    const bytes = await file.bytes();
    expect(new Bun.CryptoHasher("sha256").update(bytes).digest("hex")).toBe(domain.sha256);
    const snapshot = registry.getSnapshot(domain.repository);
    expect(snapshot?.revision).toBe("fixture-source-v1");
    expect(snapshot?.id).toBe(domain.snapshot);
  }
});

test.skipIf(process.platform !== "win32")(
  "native hardlink enumeration shares identity and returns both fixture paths",
  async () => {
    using directory = tempDir("native-alias-identity", { "original.txt": "hardlink fixture" });
    const original = join(String(directory), "original.txt");
    const alias = join(String(directory), "alias.txt");
    linkSync(original, alias);
    const first = await readFileAliases(original);
    const second = await readFileAliases(alias);
    const normalize = (path: string) => path.replaceAll("/", "\\").toLowerCase();
    expect(first.fileId).toBe(second.fileId);
    expect(first.record).toBe(second.record);
    expect(first.declaredLinks).toBe(2);
    expect(first.paths.map(normalize).sort()).toEqual([original, alias].map(normalize).sort());
    expect(second.paths.map(normalize).sort()).toEqual(first.paths.map(normalize).sort());
  },
);

function fakeVolume() {
  let next = 10n;
  let closed = 0;
  let entries = [{ record: 20, parent: 5, attributes: 0, name: "before.dll" }];
  let records: JournalEntry[] = [];
  const volume: NtfsVolumeReader = {
    queryJournal: () => ({ journalId: 1n, nextUsn: next, lowestValidUsn: 0n }),
    enumerateMft: () => entries,
    readJournal: () => ({ next, records }),
    close: () => {
      closed++;
    },
  };
  return {
    volume,
    get closed() {
      return closed;
    },
    set entries(value: typeof entries) {
      entries = value;
    },
    page(value: JournalEntry[]) {
      next++;
      records = value;
    },
  };
}

test("NTFS replacement removes vanished baseline entries and commits rename/checkpoint atomically", async () => {
  using directory = tempDir("generic-ntfs", {});
  const dbPath = join(String(directory), "index.sqlite");
  const fake = fakeVolume();
  const options = { dbPath, drive: "D", createVolume: () => fake.volume };
  await indexNtfs(options);
  fake.page([
    {
      record: 20,
      parentRecord: 5,
      attributes: 0,
      name: "before.dll",
      reason: 0x1000,
      usn: 10n,
      timestamp: 123456789012345678n,
    },
    {
      record: 20,
      parentRecord: 5,
      attributes: 0,
      name: "after.dll",
      reason: 0x2000,
      usn: 11n,
      timestamp: 123456789012345679n,
    },
  ]);
  expect((await syncNtfs(options)).checkpointUsn).toBe("11");
  {
    using db = new Database(dbPath);
    expect(db.query("SELECT name FROM ntfs_entries").all()).toEqual([{ name: "after.dll" }]);
    expect(db.query("SELECT timestamp FROM ntfs_journal_events ORDER BY usn").get()).toEqual({
      timestamp: "123456789012345678",
    });
  }
  fake.entries = [];
  await indexNtfs(options);
  using db = new Database(dbPath);
  expect(db.query("SELECT COUNT(*) AS n FROM ntfs_entries").get()).toEqual({ n: 0 });
  expect(db.query("SELECT COUNT(*) AS n FROM ntfs_entry_edges").get()).toEqual({ n: 0 });
  expect(fake.closed).toBe(3);
});

test("NTFS page failure rolls back events, entries and checkpoint together", async () => {
  using directory = tempDir("ntfs-atomic", {});
  const dbPath = join(String(directory), "index.sqlite");
  const fake = fakeVolume();
  const options = { dbPath, drive: "E", createVolume: () => fake.volume };
  await indexNtfs(options);
  {
    using db = new Database(dbPath);
    db.exec(
      "CREATE TRIGGER fail_checkpoint BEFORE UPDATE ON ntfs_volumes BEGIN SELECT RAISE(ABORT,'checkpoint blocked'); END",
    );
  }
  fake.page([
    {
      record: 21,
      parentRecord: 5,
      attributes: 0,
      name: "new.dll",
      reason: 0x100,
      usn: 10n,
      timestamp: 1n,
    },
  ]);
  await expect(syncNtfs(options)).rejects.toThrow("checkpoint blocked");
  using db = new Database(dbPath);
  expect(db.query("SELECT next_usn FROM ntfs_volumes").get()).toEqual({ next_usn: "10" });
  expect(db.query("SELECT COUNT(*) AS n FROM ntfs_journal_events").get()).toEqual({ n: 0 });
  expect(db.query("SELECT name FROM ntfs_entries").all()).toEqual([{ name: "before.dll" }]);
  expect(fake.closed).toBe(2);
});

test("PE scan budgets report incomplete results and persistence refuses them", async () => {
  using directory = tempDir("pe-bounds", { "app.exe": "image", "ignored.txt": "not an image" });
  const scan = await scanPe({
    root: String(directory),
    maxFileBytes: 2,
    parse: () => ({ imports: [] }),
  });
  expect(scan.complete).toBe(false);
  expect(scan.errors).toHaveLength(1);
  expect(scan.artifacts).toHaveLength(0);
  await expect(
    persistPe({ dbPath: join(String(directory), "index.sqlite"), scan }),
  ).rejects.toThrow("incomplete");
  expect(await Bun.file(join(String(directory), "index.sqlite")).exists()).toBe(false);
});

test("PE imports preserve ambiguity and normalize API-set hosts", () => {
  const artifact = (path: string, imports: PeArtifact["metadata"]["imports"] = []): PeArtifact => ({
    path,
    relativePath: path,
    bytes: 1,
    sha256: "0".repeat(64),
    metadata: { imports },
  });
  const edges = resolvePeImports(
    [
      artifact("C:/images/app.exe", [
        { module: "API-MS-WIN-TEST.dll" },
        { module: "duplicate.dll" },
        { module: "missing.dll" },
      ]),
      artifact("C:/images/host.dll"),
      artifact("C:/images/duplicate.dll"),
      artifact("C:/images/sub/duplicate.dll"),
    ],
    new Map([["api-ms-win-test", ["HOST"]]]),
  );
  expect(edges.map((edge) => edge.status)).toEqual(["resolved", "ambiguous", "missing"]);
  expect(edges[0]!.resolved).toBe("C:/images/host.dll");
  expect(edges[1]!.resolved).toBeNull();
});

test("complete PE root replacement prunes vanished artifacts and resource upserts are atomic", async () => {
  using directory = tempDir("pe-root", { "app.exe": "image" });
  const dbPath = join(String(directory), "index.sqlite");
  const scan = await scanPe({
    root: String(directory),
    parse: () => ({ imports: [{ module: "missing.dll" }] }),
  });
  expect(await persistPe({ dbPath, scan })).toEqual({
    artifacts: 1,
    edges: 1,
    resolved: 0,
    complete: true,
  });
  await persistPe({ dbPath, scan: { ...scan, artifacts: [] } });
  await persistResources(dbPath, [
    { id: "project", kind: "repository", name: "Project", metadata: { revision: "fixture" } },
  ]);
  await expect(
    persistResources(dbPath, [
      { id: "duplicate", kind: "service", name: "First" },
      { id: "duplicate", kind: "service", name: "Second" },
    ]),
  ).rejects.toThrow("unique");
  using db = new Database(dbPath);
  expect(db.query("SELECT COUNT(*) AS n FROM pe_artifacts").get()).toEqual({ n: 0 });
  expect(db.query("SELECT COUNT(*) AS n FROM pe_import_edges").get()).toEqual({ n: 0 });
  expect(db.query("SELECT id FROM resources").all()).toEqual([{ id: "project" }]);
});

test("alias persistence retains only complete deduplicated identity sets", async () => {
  using directory = tempDir("alias-coverage", {});
  const dbPath = join(String(directory), "index.sqlite");
  const result = await indexFileAliases({
    dbPath,
    paths: ["one", "duplicate", "incomplete"],
    readAliases: async (path) =>
      path === "incomplete"
        ? { fileId: "other", record: 30, declaredLinks: 2, paths: ["only-one"] }
        : { fileId: "same", record: 20, declaredLinks: 2, paths: ["one", "duplicate"] },
  });
  expect(result.completeFiles).toBe(1);
  expect(result.complete).toBe(false);
  using db = new Database(dbPath);
  expect(db.query("SELECT COUNT(*) AS n FROM ntfs_paths").get()).toEqual({ n: 2 });
});

function fakeRedis(expired: boolean) {
  const values = new Map<string, string>();
  let closed = false;
  const client: MetadataRedis = {
    async send(command, args) {
      if (command === "INFO") return "used_memory:0\r\nmaxmemory:536870912\r\nevicted_keys:0\r\n";
      if (command === "SET") {
        values.set(args[0]!, args[1]!);
        return "OK";
      }
      if (command === "TTL") return expired ? -2 : 60;
      if (command === "EVAL") {
        values.set(args[2]!, args[2 + Number(args[1])]!);
        return "OK";
      }
      throw new Error(`Unexpected Redis command: ${command}`);
    },
    async get(key) {
      return values.get(key) ?? null;
    },
    close() {
      closed = true;
    },
  };
  return {
    client,
    values,
    get closed() {
      return closed;
    },
  };
}

test("metadata publication verifies every chunk and preserves old manifest on expired staging", async () => {
  using directory = tempDir("metadata-publication", {});
  const dbPath = join(String(directory), "index.sqlite");
  {
    using db = new Database(dbPath);
    db.exec("CREATE TABLE metadata(name TEXT); INSERT INTO metadata VALUES('one'),('two')");
  }
  const redis = fakeRedis(false);
  const options = {
    dbPath,
    artifactRoot: join(String(directory), "cache"),
    redisUrl: "redis://example.invalid",
    tables: ["metadata"],
    namespace: "test:metadata",
    chunkRows: 1,
    createRedis: () => redis.client,
  };
  const manifest = await publishMetadataCache(options);
  expect(manifest.totalRows).toBe(2);
  expect(manifest.chunks).toHaveLength(2);
  expect(redis.values.get("test:metadata:manifest")).toBe(JSON.stringify(manifest));
  expect(redis.closed).toBe(true);
  const failing = fakeRedis(true);
  failing.values.set("test:metadata:manifest", "old-generation");
  await expect(
    publishMetadataCache({ ...options, createRedis: () => failing.client }),
  ).rejects.toThrow("expired");
  expect(failing.values.get("test:metadata:manifest")).toBe("old-generation");
  expect(failing.closed).toBe(true);
});
