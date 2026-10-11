import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { Database } from "bun:sqlite";

const stagePath = "C:/SSH/omar/server/var/index/system32-pe-artifacts.ndjson";
const provenancePath = "C:/SSH/omar/server/var/index/system32-pe-index-provenance.json";
const dbPath = "C:/SSH/omar/server/var/index/omar.sqlite";
await mkdir(dirname(dbPath), { recursive: true });
const staged = (await readFile(stagePath, "utf8")).split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
const provenance = JSON.parse(await readFile(provenancePath, "utf8"));
const stageHash = new Bun.CryptoHasher("sha256").update(await readFile(stagePath)).digest("hex");
if (staged.length !== provenance.parsed || provenance.parseErrors !== 0 || provenance.readErrors !== 0) {
  throw new Error(`Stage/provenance mismatch: ${staged.length} vs ${provenance.parsed}`);
}
if (stageHash !== provenance.stageSha256) throw new Error("Stage SHA-256 does not match scanner provenance");

const db = new Database(dbPath, { create: true });
db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=30000; PRAGMA synchronous=NORMAL;");
const existing = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='pe_artifacts'").get();
if (existing) {
  const cols = db.query("PRAGMA table_info(pe_artifacts)").all() as Array<{ name: string }>;
  const required = ["path", "scan_id", "sha256", "imports_json", "exports_json", "parse_error"];
  if (!required.every((name) => cols.some((col) => col.name === name))) {
    db.close();
    throw new Error("Existing pe_artifacts has an unexpected schema; no mutation made");
  }
} else {
  db.exec(`CREATE TABLE pe_artifacts (
    path TEXT PRIMARY KEY, relative_path TEXT NOT NULL, extension TEXT NOT NULL, bytes INTEGER,
    sha256 TEXT, pe_kind TEXT, machine TEXT, bits INTEGER, subsystem TEXT,
    characteristics INTEGER, dll_characteristics INTEGER, timestamp INTEGER, image_base TEXT,
    image_size INTEGER, entry_rva INTEGER, checksum INTEGER, is_dotnet INTEGER,
    section_count INTEGER NOT NULL, import_module_count INTEGER NOT NULL,
    import_symbol_count INTEGER NOT NULL, delay_import_count INTEGER NOT NULL,
    export_count INTEGER NOT NULL, sections_json TEXT NOT NULL, imports_json TEXT NOT NULL,
    exports_json TEXT NOT NULL, export_name TEXT, version_json TEXT NOT NULL,
    warnings_json TEXT NOT NULL, parse_error TEXT, scanned_at TEXT NOT NULL, scan_id TEXT NOT NULL
  )`);
}
db.exec(`CREATE INDEX IF NOT EXISTS idx_pe_artifacts_machine ON pe_artifacts(machine);
CREATE INDEX IF NOT EXISTS idx_pe_artifacts_sha256 ON pe_artifacts(sha256);
CREATE INDEX IF NOT EXISTS idx_pe_artifacts_extension ON pe_artifacts(extension);
CREATE INDEX IF NOT EXISTS idx_pe_artifacts_scan_id ON pe_artifacts(scan_id);`);

const insert = db.prepare(`INSERT INTO pe_artifacts (
  path,relative_path,extension,bytes,sha256,pe_kind,machine,bits,subsystem,characteristics,dll_characteristics,
  timestamp,image_base,image_size,entry_rva,checksum,is_dotnet,section_count,import_module_count,
  import_symbol_count,delay_import_count,export_count,sections_json,imports_json,exports_json,export_name,
  version_json,warnings_json,parse_error,scanned_at,scan_id
) VALUES (${Array(31).fill("?").join(",")})
ON CONFLICT(path) DO UPDATE SET
  relative_path=excluded.relative_path,extension=excluded.extension,bytes=excluded.bytes,sha256=excluded.sha256,
  pe_kind=excluded.pe_kind,machine=excluded.machine,bits=excluded.bits,subsystem=excluded.subsystem,
  characteristics=excluded.characteristics,dll_characteristics=excluded.dll_characteristics,timestamp=excluded.timestamp,
  image_base=excluded.image_base,image_size=excluded.image_size,entry_rva=excluded.entry_rva,checksum=excluded.checksum,
  is_dotnet=excluded.is_dotnet,section_count=excluded.section_count,import_module_count=excluded.import_module_count,
  import_symbol_count=excluded.import_symbol_count,delay_import_count=excluded.delay_import_count,
  export_count=excluded.export_count,sections_json=excluded.sections_json,imports_json=excluded.imports_json,
  exports_json=excluded.exports_json,export_name=excluded.export_name,version_json=excluded.version_json,
  warnings_json=excluded.warnings_json,parse_error=excluded.parse_error,scanned_at=excluded.scanned_at,scan_id=excluded.scan_id`);

for (let offset = 0; offset < staged.length; offset += 100) {
  const batch = staged.slice(offset, offset + 100);
  db.transaction(() => {
    for (const r of batch) insert.run(
      r.path,r.relative_path,r.extension,r.bytes,r.sha256,r.pe_kind,r.machine,r.bits,r.subsystem,
      r.characteristics,r.dll_characteristics,r.timestamp,r.image_base,r.image_size,r.entry_rva,r.checksum,
      r.is_dotnet,r.section_count,r.import_module_count,r.import_symbol_count,r.delay_import_count,r.export_count,
      r.sections_json,r.imports_json,r.exports_json,r.export_name,r.version_json,r.warnings_json,r.parse_error,r.scanned_at,r.scan_id
    );
  })();
}

const counts = db.query(`SELECT COUNT(*) AS rows, COUNT(DISTINCT scan_id) AS scans,
  SUM(CASE WHEN parse_error IS NOT NULL THEN 1 ELSE 0 END) AS parse_error_rows,
  SUM(CASE WHEN sha256 IS NOT NULL THEN 1 ELSE 0 END) AS hashed_rows,
  SUM(import_module_count) AS import_modules, SUM(import_symbol_count) AS import_symbols,
  SUM(export_count) AS exports FROM pe_artifacts WHERE scan_id=?`).get(provenance.scanId);
const integrity = db.query("PRAGMA quick_check").get();
provenance.stageLineCount = staged.length;
provenance.indexResult = { dbPath, table: "pe_artifacts", ...counts, integrity: (integrity as { quick_check: string }).quick_check };
await writeFile(provenancePath, JSON.stringify(provenance, null, 2) + "\n");
db.close();
console.log(JSON.stringify({ dbPath, stagedRows: staged.length, counts, integrity, scanId: provenance.scanId }));

