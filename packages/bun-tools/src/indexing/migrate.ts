import { Database } from "bun:sqlite";
import { lstat, mkdir, open, realpath, unlink } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { absolutePath, indexingProvenance, positiveInteger } from "./common";

export interface IndexMigrationOptions {
  sourceDbPath: string;
  destinationDbPath: string;
  maxDatabaseBytes?: number;
  maxRows?: number;
}

type Table = { name: string; sql: string };
const metadataTables = new Set([
  "ntfs_volumes",
  "ntfs_entries",
  "ntfs_entry_edges",
  "ntfs_journal_events",
  "ntfs_journal_state",
  "ntfs_paths",
  "pe_artifacts",
  "pe_import_edges",
  "omar_resources",
]);

function tableColumns(db: Database, table: string): Set<string> {
  return new Set(
    db
      .query<{ name: string }, []>(`PRAGMA table_info("${table}")`)
      .all()
      .map((row) => row.name),
  );
}

function requireColumns(columns: Set<string>, required: string[], table: string): void {
  if (!required.every((column) => columns.has(column)))
    throw new Error(`Unsupported legacy schema: ${table}`);
}

function integrity(db: Database): void {
  const rows = db.query<{ quick_check: string }, []>("PRAGMA quick_check").all();
  if (rows.length !== 1 || rows[0]?.quick_check !== "ok")
    throw new Error("Index database integrity check failed");
}

function databaseBytes(db: Database): number {
  const pageSize = Number(db.query<{ page_size: bigint }, []>("PRAGMA page_size").get()!.page_size);
  const pageCount = Number(
    db.query<{ page_count: bigint }, []>("PRAGMA page_count").get()!.page_count,
  );
  return pageSize * pageCount;
}

/** Creates a checked independent copy. Legacy metadata is archived in the copy; source connections remain read-only. */
export async function migrateIndexDatabase(options: IndexMigrationOptions) {
  absolutePath("sourceDbPath", options.sourceDbPath);
  absolutePath("destinationDbPath", options.destinationDbPath);
  const maxBytes = positiveInteger("maxDatabaseBytes", options.maxDatabaseBytes ?? 16 * 1024 ** 3);
  const maxRows = positiveInteger("maxRows", options.maxRows ?? 20_000_000);
  const sourcePath = await realpath(options.sourceDbPath);
  const sourceInfo = await lstat(sourcePath);
  if (!sourceInfo.isFile() || sourceInfo.size > maxBytes)
    throw new Error("Source database exceeds size budget or is not a file");
  const requestedDestination = resolve(options.destinationDbPath);
  await mkdir(dirname(requestedDestination), { recursive: true });
  const destinationPath = resolve(
    await realpath(dirname(requestedDestination)),
    basename(requestedDestination),
  );
  if (sourcePath.toLowerCase() === destinationPath.toLowerCase())
    throw new Error("Source and destination must differ");
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    const existing = await lstat(`${destinationPath}${suffix}`).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return null;
        throw error;
      },
    );
    if (existing)
      throw new Error(
        "Destination or SQLite sidecar already exists; migration never overwrites it",
      );
  }
  const reservation = await open(destinationPath, "wx");
  const identity = await reservation.stat();
  await reservation.close();
  let destination: Database | undefined;
  let complete = false;
  try {
    using source = new Database(sourcePath, { readonly: true, strict: true, safeIntegers: true });
    source.exec("PRAGMA busy_timeout=30000;");
    integrity(source);
    if (databaseBytes(source) > maxBytes)
      throw new RangeError("Source database exceeds maxDatabaseBytes");
    // VACUUM INTO owns a consistent read transaction and cannot run inside an explicit transaction.
    source.query("VACUUM main INTO ?").run(destinationPath);
    destination = new Database(destinationPath, {
      create: false,
      strict: true,
      safeIntegers: true,
    });
    destination.exec(
      "PRAGMA busy_timeout=30000; PRAGMA journal_mode=DELETE; PRAGMA foreign_keys=OFF;",
    );
    integrity(destination);
    const tables = destination
      .query<Table, []>(
        "SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all();
    if (tables.length > 1_024) throw new RangeError("Index migration exceeds table count budget");
    const knownTables = new Set(tables.map((table) => table.name));
    const preserved = tables.filter((table) => !metadataTables.has(table.name));
    const counts = new Map<string, number>();
    let rowCount = 0;
    for (const table of tables) {
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table.name))
        throw new Error("Unsupported noncanonical table name");
      const count = Number(
        destination.query<{ n: bigint }, []>(`SELECT COUNT(*) AS n FROM "${table.name}"`).get()!.n,
      );
      rowCount += count;
      counts.set(table.name, count);
      if (rowCount > maxRows) throw new RangeError("Index migration exceeds maxRows");
      if (table.name.startsWith("legacy_archive_"))
        throw new Error("Source already contains legacy migration archives");
    }
    const archives: string[] = [];
    const db = destination;
    const archive = (table: string) => {
      const dependents = db
        .query<{ name: string; sql: string }, []>(
          "SELECT name,sql FROM sqlite_master WHERE type IN ('view','trigger')",
        )
        .all();
      if (dependents.some((item) => new RegExp(`\\b${table}\\b`, "i").test(item.sql)))
        throw new Error(`Metadata views or triggers cannot be migrated automatically: ${table}`);
      for (const other of tables) {
        const foreignKeys = db
          .query<{ table: string }, []>(`PRAGMA foreign_key_list("${other.name}")`)
          .all();
        if (foreignKeys.some((key) => key.table === table))
          throw new Error(`Foreign keys reference legacy metadata: ${table}`);
      }
      const name = `legacy_archive_${table}`;
      db.exec(`ALTER TABLE "${table}" RENAME TO "${name}"`);
      archives.push(name);
    };
    const assertSameCount = (original: string, converted: string) => {
      const count = Number(
        db.query<{ n: bigint }, []>(`SELECT COUNT(*) AS n FROM "${converted}"`).get()!.n,
      );
      if (count !== counts.get(original))
        throw new Error(`Migration row count differs: ${original}`);
    };
    db.transaction(() => {
      if (knownTables.has("ntfs_volumes")) {
        const columns = tableColumns(db, "ntfs_volumes");
        if (columns.has("next_usn"))
          requireColumns(
            columns,
            ["volume_id", "journal_id", "next_usn", "scan_status", "entry_count", "updated_at"],
            "ntfs_volumes",
          );
        else {
          requireColumns(
            columns,
            [
              "volume_id",
              "journal_id",
              "journal_start_usn",
              "scan_status",
              "entry_count",
              "started_at",
              "completed_at",
            ],
            "ntfs_volumes",
          );
          let checkpoint = "v.journal_start_usn";
          let updated = "COALESCE(v.completed_at,v.started_at)";
          if (knownTables.has("ntfs_journal_state")) {
            requireColumns(
              tableColumns(db, "ntfs_journal_state"),
              ["volume_id", "journal_id", "next_usn", "updated_at"],
              "ntfs_journal_state",
            );
            if (
              db
                .query(`SELECT 1 FROM ntfs_journal_state s LEFT JOIN ntfs_volumes v ON v.volume_id=s.volume_id
              WHERE v.volume_id IS NULL OR s.journal_id IS NOT v.journal_id OR s.next_usn IS NULL LIMIT 1`)
                .get()
            )
              throw new Error("Legacy USN state does not match its volume baseline");
            checkpoint =
              "COALESCE((SELECT s.next_usn FROM ntfs_journal_state s WHERE s.volume_id=v.volume_id),v.journal_start_usn)";
            updated =
              "COALESCE((SELECT s.updated_at FROM ntfs_journal_state s WHERE s.volume_id=v.volume_id),v.completed_at,v.started_at)";
          }
          archive("ntfs_volumes");
          db.exec(`CREATE TABLE ntfs_volumes(volume_id TEXT PRIMARY KEY,journal_id TEXT,next_usn TEXT,
            scan_status TEXT NOT NULL,entry_count INTEGER NOT NULL,updated_at TEXT NOT NULL) STRICT;
            INSERT INTO ntfs_volumes SELECT v.volume_id,v.journal_id,CAST(${checkpoint} AS TEXT),v.scan_status,v.entry_count,${updated}
              FROM legacy_archive_ntfs_volumes v`);
          assertSameCount("ntfs_volumes", "ntfs_volumes");
        }
      }
      if (knownTables.has("ntfs_entries")) {
        const columns = tableColumns(db, "ntfs_entries");
        requireColumns(
          columns,
          ["volume_id", "record", "parent_record", "attributes", "name", "is_directory"],
          "ntfs_entries",
        );
        if (columns.has("scanned_at")) {
          archive("ntfs_entries");
          db.exec(`CREATE TABLE ntfs_entries(volume_id TEXT NOT NULL,record INTEGER NOT NULL,parent_record INTEGER NOT NULL,
            attributes INTEGER NOT NULL,name TEXT NOT NULL,is_directory INTEGER NOT NULL,
            PRIMARY KEY(volume_id,record,parent_record,name)) STRICT;
            INSERT INTO ntfs_entries SELECT volume_id,record,parent_record,attributes,name,is_directory FROM legacy_archive_ntfs_entries;
            CREATE INDEX generic_ntfs_entries_parent ON ntfs_entries(volume_id,parent_record)`);
          assertSameCount("ntfs_entries", "ntfs_entries");
        }
      }
      if (knownTables.has("ntfs_entry_edges")) {
        const columns = tableColumns(db, "ntfs_entry_edges");
        requireColumns(columns, ["volume_id", "parent_record", "child_record"], "ntfs_entry_edges");
        if (columns.has("relation")) {
          if (db.query("SELECT 1 FROM ntfs_entry_edges WHERE relation!='contains' LIMIT 1").get())
            throw new Error("Unsupported NTFS edge relation");
          archive("ntfs_entry_edges");
          db.exec(`CREATE TABLE ntfs_entry_edges(volume_id TEXT NOT NULL,parent_record INTEGER NOT NULL,child_record INTEGER NOT NULL,
            PRIMARY KEY(volume_id,parent_record,child_record)) STRICT;
            INSERT INTO ntfs_entry_edges SELECT volume_id,parent_record,child_record FROM legacy_archive_ntfs_entry_edges`);
          assertSameCount("ntfs_entry_edges", "ntfs_entry_edges");
        }
      }
      if (knownTables.has("ntfs_journal_events")) {
        requireColumns(
          tableColumns(db, "ntfs_journal_events"),
          [
            "volume_id",
            "journal_id",
            "usn",
            "record",
            "parent_record",
            "timestamp",
            "reason",
            "attributes",
            "name",
          ],
          "ntfs_journal_events",
        );
        archive("ntfs_journal_events");
        db.exec(`CREATE TABLE ntfs_journal_events(volume_id TEXT NOT NULL,journal_id TEXT NOT NULL,usn TEXT NOT NULL,
          record INTEGER NOT NULL,parent_record INTEGER NOT NULL,timestamp TEXT NOT NULL,reason INTEGER NOT NULL,
          attributes INTEGER NOT NULL,name TEXT NOT NULL,PRIMARY KEY(volume_id,journal_id,usn,record,parent_record,name)) STRICT;
          INSERT INTO ntfs_journal_events SELECT volume_id,journal_id,CAST(usn AS TEXT),record,parent_record,CAST(timestamp AS TEXT),reason,attributes,name
            FROM legacy_archive_ntfs_journal_events`);
        assertSameCount("ntfs_journal_events", "ntfs_journal_events");
      }
      if (knownTables.has("ntfs_journal_state")) archive("ntfs_journal_state");
      if (knownTables.has("ntfs_paths")) {
        const columns = tableColumns(db, "ntfs_paths");
        if (columns.has("declared_links"))
          requireColumns(columns, ["file_id", "path", "record", "declared_links"], "ntfs_paths");
        else {
          requireColumns(
            columns,
            ["file_id", "path", "file_record", "declared_link_count", "alias_complete"],
            "ntfs_paths",
          );
          if (db.query("SELECT 1 FROM ntfs_paths WHERE alias_complete!=1 LIMIT 1").get())
            throw new Error("Legacy hardlink aliases are incomplete");
          archive("ntfs_paths");
          db.exec(`CREATE TABLE ntfs_paths(file_id TEXT NOT NULL,path TEXT NOT NULL,record INTEGER NOT NULL,
            declared_links INTEGER NOT NULL,PRIMARY KEY(file_id,path)) STRICT;
            INSERT INTO ntfs_paths SELECT file_id,path,file_record,declared_link_count FROM legacy_archive_ntfs_paths`);
          assertSameCount("ntfs_paths", "ntfs_paths");
        }
      }
      if (knownTables.has("pe_artifacts")) {
        const columns = tableColumns(db, "pe_artifacts");
        if (columns.has("metadata_json"))
          requireColumns(
            columns,
            ["root", "path", "relative_path", "bytes", "sha256", "metadata_json"],
            "pe_artifacts",
          );
        else {
          requireColumns(
            columns,
            [
              "path",
              "relative_path",
              "bytes",
              "sha256",
              "pe_kind",
              "machine",
              "bits",
              "subsystem",
              "characteristics",
              "dll_characteristics",
              "timestamp",
              "image_base",
              "image_size",
              "entry_rva",
              "checksum",
              "is_dotnet",
              "sections_json",
              "imports_json",
              "exports_json",
              "export_name",
              "version_json",
              "warnings_json",
              "parse_error",
              "scan_id",
              "scanned_at",
            ],
            "pe_artifacts",
          );
          if (
            db
              .query(`SELECT 1 FROM pe_artifacts WHERE bytes IS NULL OR sha256 IS NULL OR parse_error IS NOT NULL
            OR length(relative_path)=0 OR lower(replace(substr(path,-length(relative_path)),char(92),'/'))!=lower(replace(relative_path,char(92),'/'))
            OR substr(path,length(path)-length(relative_path),1) NOT IN ('/',char(92))
            OR length(path)<=length(relative_path)+1 OR NOT json_valid(imports_json) OR NOT json_valid(exports_json)
            OR NOT json_valid(sections_json) OR NOT json_valid(version_json) OR NOT json_valid(warnings_json) LIMIT 1`)
              .get()
          )
            throw new Error("Legacy PE artifacts contain unsupported paths or incomplete metadata");
          archive("pe_artifacts");
          db.exec(`CREATE TABLE pe_artifacts(root TEXT NOT NULL,path TEXT NOT NULL,relative_path TEXT NOT NULL,
            bytes INTEGER NOT NULL,sha256 TEXT NOT NULL,metadata_json TEXT NOT NULL,PRIMARY KEY(root,path)) STRICT;
            INSERT INTO pe_artifacts SELECT substr(path,1,length(path)-length(relative_path)-1),path,relative_path,bytes,sha256,
              json_object('kind',pe_kind,'machine',machine,'bits',bits,'subsystem',subsystem,'characteristics',characteristics,
                'dllCharacteristics',dll_characteristics,'timestamp',timestamp,'imageBase',image_base,'imageSize',image_size,
                'entryRva',entry_rva,'checksum',checksum,'isDotnet',json(CASE WHEN is_dotnet THEN 'true' ELSE 'false' END),
                'sections',json(sections_json),'imports',json(imports_json),'exports',json(exports_json),
                'exportName',export_name,'version',json(version_json),'warnings',json(warnings_json),
                'legacyScanId',scan_id,'legacyScannedAt',scanned_at) FROM legacy_archive_pe_artifacts`);
          assertSameCount("pe_artifacts", "pe_artifacts");
        }
      }
      if (knownTables.has("pe_import_edges")) {
        const columns = tableColumns(db, "pe_import_edges");
        if (columns.has("metadata_json"))
          requireColumns(
            columns,
            [
              "root",
              "source_path",
              "ordinal",
              "module",
              "resolved_path",
              "status",
              "metadata_json",
            ],
            "pe_import_edges",
          );
        else {
          requireColumns(
            columns,
            [
              "source_path",
              "import_ordinal",
              "module_name",
              "delay_import",
              "symbols_json",
              "resolved_path",
              "resolved_paths_json",
              "resolution_status",
            ],
            "pe_import_edges",
          );
          if (
            !knownTables.has("pe_artifacts") ||
            db
              .query(`SELECT 1 FROM pe_import_edges e LEFT JOIN pe_artifacts p ON p.path=e.source_path
            WHERE p.path IS NULL OR NOT json_valid(e.symbols_json) OR NOT json_valid(e.resolved_paths_json) LIMIT 1`)
              .get()
          )
            throw new Error("Legacy PE import edges are orphaned or malformed");
          archive("pe_import_edges");
          db.exec(`CREATE TABLE pe_import_edges(root TEXT NOT NULL,source_path TEXT NOT NULL,ordinal INTEGER NOT NULL,module TEXT NOT NULL,
            resolved_path TEXT,status TEXT NOT NULL,metadata_json TEXT NOT NULL,PRIMARY KEY(root,source_path,ordinal)) STRICT;
            INSERT INTO pe_import_edges SELECT p.root,e.source_path,e.import_ordinal,e.module_name,e.resolved_path,
              CASE WHEN e.resolved_path IS NOT NULL THEN 'resolved' WHEN e.resolution_status LIKE '%ambiguous%' THEN 'ambiguous'
                WHEN e.resolution_status='apiset_contract_unmapped' THEN 'apiset-unmapped' ELSE 'missing' END,
              json_object('source',e.source_path,'ordinal',e.import_ordinal,'module',e.module_name,
                'delay',json(CASE WHEN e.delay_import THEN 'true' ELSE 'false' END),'symbols',json(e.symbols_json),
                'candidates',json(e.resolved_paths_json),'resolved',e.resolved_path,'legacyStatus',e.resolution_status)
              FROM legacy_archive_pe_import_edges e JOIN pe_artifacts p ON p.path=e.source_path`);
          assertSameCount("pe_import_edges", "pe_import_edges");
        }
      }
      if (knownTables.has("omar_resources")) {
        if (knownTables.has("resources"))
          throw new Error("Both legacy and generic resource catalogs exist");
        requireColumns(
          tableColumns(db, "omar_resources"),
          ["id", "kind", "name", "canonical_path", "metadata_json", "updated_at"],
          "omar_resources",
        );
        archive("omar_resources");
        db.exec(`CREATE TABLE resources(id TEXT PRIMARY KEY,kind TEXT NOT NULL,name TEXT NOT NULL,canonical_path TEXT,
          metadata_json TEXT NOT NULL CHECK(json_valid(metadata_json)),updated_at TEXT NOT NULL) STRICT;
          INSERT INTO resources SELECT id,kind,name,canonical_path,metadata_json,updated_at FROM legacy_archive_omar_resources`);
        assertSameCount("omar_resources", "resources");
      }
      for (const table of preserved) {
        const sql = db
          .query<{ sql: string }, [string]>(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name=?",
          )
          .get(table.name)?.sql;
        if (sql !== table.sql) throw new Error(`Preserved table schema changed: ${table.name}`);
        assertSameCount(table.name, table.name);
      }
      if (databaseBytes(db) > maxBytes)
        throw new RangeError("Migrated database exceeds maxDatabaseBytes");
      db.exec(
        `CREATE TABLE IF NOT EXISTS index_migrations(id TEXT PRIMARY KEY,metadata_json TEXT NOT NULL CHECK(json_valid(metadata_json))) STRICT`,
      );
      db.query("INSERT INTO index_migrations VALUES(?,?)").run(
        crypto.randomUUID(),
        JSON.stringify({
          schema: "bun-tools.index-migration/v1",
          createdAt: new Date().toISOString(),
          method: "read-only VACUUM INTO + transactional metadata normalization",
          provenance: indexingProvenance,
          archivedTables: archives,
          sourceTableRows: Object.fromEntries(counts),
        }),
      );
      if (databaseBytes(db) > maxBytes)
        throw new RangeError("Migration receipt exceeds maxDatabaseBytes");
    }).immediate();
    integrity(db);
    if (db.query("PRAGMA foreign_key_check").get())
      throw new Error("Migrated database has foreign key violations");
    const bytes = databaseBytes(db);
    destination.close();
    destination = undefined;
    complete = true;
    return {
      destinationDbPath: destinationPath,
      sourceDbPath: sourcePath,
      bytes,
      sourceRows: rowCount,
      archivedTables: archives,
      preservedTables: preserved.map((table) => table.name),
      integrity: "ok" as const,
    };
  } finally {
    try {
      destination?.close();
    } finally {
      if (!complete) {
        const owned = await lstat(destinationPath).catch(() => null);
        if (
          owned &&
          !owned.isSymbolicLink() &&
          owned.dev === identity.dev &&
          owned.ino === identity.ino
        ) {
          for (const suffix of ["-journal", "-wal", "-shm", ""])
            await unlink(`${destinationPath}${suffix}`).catch((error: NodeJS.ErrnoException) => {
              if (error.code !== "ENOENT") throw error;
            });
        }
      }
    }
  }
}
