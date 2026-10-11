import { Database } from "bun:sqlite";
import { dlopen, ptr } from "bun:ffi";

const dbPath = "C:/SSH/omar/server/var/index/omar.sqlite";
const volumeId = "C:";
const scope = "System32 PE paths returned by the PE index; aliases queried through FindFirstFileNameW/FindNextFileNameW";

const kernel32Library = dlopen("kernel32.dll", {
  CreateFileW: { args: ["ptr", "u32", "u32", "ptr", "u32", "u32", "ptr"], returns: "i64" },
  GetFileInformationByHandle: { args: ["ptr", "ptr"], returns: "i32" },
  CloseHandle: { args: ["ptr"], returns: "i32" },
  FindFirstFileNameW: { args: ["ptr", "u32", "ptr", "ptr"], returns: "i64" },
  FindNextFileNameW: { args: ["ptr", "ptr", "ptr"], returns: "i32" },
  FindClose: { args: ["ptr"], returns: "i32" },
  GetLastError: { args: [], returns: "u32" },
});
const kernel32 = kernel32Library.symbols;

const INVALID_HANDLE = -1;
const FILE_READ_ATTRIBUTES = 0x80;
const FILE_SHARE_ALL = 0x1 | 0x2 | 0x4;
const OPEN_EXISTING = 3;
const FILE_FLAG_BACKUP_SEMANTICS = 0x02000000;
const ERROR_HANDLE_EOF = 38;
const ERROR_MORE_DATA = 234;
const NAME_BUFFER_CHARS = 32_768;

function wide(value: string) {
  return Buffer.from(`${value}\0`, "utf16le");
}

function infoFor(path: string) {
  const handle = kernel32.CreateFileW(
    wide(path), FILE_READ_ATTRIBUTES, FILE_SHARE_ALL, null, OPEN_EXISTING,
    FILE_FLAG_BACKUP_SEMANTICS, null,
  );
  if (!handle || handle === INVALID_HANDLE) return null;
  try {
    const info = Buffer.alloc(52);
    if (!kernel32.GetFileInformationByHandle(handle, ptr(info))) return null;
    const volumeSerial = info.readUInt32LE(28);
    const linkCount = info.readUInt32LE(40);
    const fileIndexHigh = info.readUInt32LE(44);
    const fileIndexLow = info.readUInt32LE(48);
    const fileIndex = (BigInt(fileIndexHigh) << 32n) | BigInt(fileIndexLow);
    const fileRecord = Number(fileIndex & ((1n << 48n) - 1n));
    return { fileId: `${volumeSerial.toString(16).padStart(8, "0")}:${fileIndex.toString(16).padStart(16, "0")}`, fileRecord, linkCount };
  } finally {
    kernel32.CloseHandle(handle);
  }
}

function enumerateNames(path: string) {
  let capacity = NAME_BUFFER_CHARS;
  let buffer = Buffer.alloc(capacity * 2);
  let length = Buffer.alloc(4);
  let cursor = INVALID_HANDLE;
  for (;;) {
    length.writeUInt32LE(capacity);
    cursor = kernel32.FindFirstFileNameW(wide(path), 0, ptr(length), ptr(buffer));
    if (cursor !== INVALID_HANDLE) break;
    if (kernel32.GetLastError() !== ERROR_MORE_DATA || capacity >= 1_048_576) return null;
    capacity *= 2;
    buffer = Buffer.alloc(capacity * 2);
  }

  const names: string[] = [];
  try {
    let more = true;
    while (more) {
      const chars = Math.min(length.readUInt32LE(0), capacity);
      names.push(buffer.subarray(0, chars * 2).toString("utf16le").replace(/\0+$/, ""));

      length = Buffer.alloc(4);
      length.writeUInt32LE(capacity);
      more = kernel32.FindNextFileNameW(cursor, ptr(length), ptr(buffer)) !== 0;
      if (!more) {
        const error = kernel32.GetLastError();
        if (error === ERROR_MORE_DATA) {
          capacity = Math.max(length.readUInt32LE(0), capacity * 2);
          if (capacity > 1_048_576) throw new Error("Win32 returned an unreasonable hardlink name length");
          buffer = Buffer.alloc(capacity * 2);
          length.writeUInt32LE(capacity);
          more = kernel32.FindNextFileNameW(cursor, ptr(length), ptr(buffer)) !== 0;
        } else if (error !== ERROR_HANDLE_EOF) {
          throw new Error(`FindNextFileNameW failed with Win32 error ${error}`);
        }
      }
    }
  } finally {
    kernel32.FindClose(cursor);
  }
  return names;
}

const db = new Database(dbPath, { create: false, strict: true });
db.exec("PRAGMA busy_timeout=30000; PRAGMA foreign_keys=ON;");
db.exec("PRAGMA journal_mode=WAL;");
db.exec(`
  CREATE TABLE IF NOT EXISTS ntfs_paths (
    volume_id TEXT NOT NULL,
    path TEXT NOT NULL,
    file_record INTEGER NOT NULL,
    file_id TEXT NOT NULL,
    declared_link_count INTEGER NOT NULL,
    observed_alias_count INTEGER NOT NULL,
    alias_complete INTEGER NOT NULL CHECK(alias_complete IN (0,1)),
    source TEXT NOT NULL,
    scanned_at TEXT NOT NULL,
    PRIMARY KEY(volume_id,path)
  ) STRICT;
  CREATE INDEX IF NOT EXISTS ntfs_paths_file_id ON ntfs_paths(volume_id,file_id);
  CREATE INDEX IF NOT EXISTS ntfs_paths_file_record ON ntfs_paths(volume_id,file_record);
  CREATE TABLE IF NOT EXISTS ntfs_path_scan_runs (
    run_id TEXT PRIMARY KEY,
    volume_id TEXT NOT NULL,
    source TEXT NOT NULL,
    started_at TEXT NOT NULL,
    completed_at TEXT NOT NULL,
    candidate_count INTEGER NOT NULL,
    unique_file_count INTEGER NOT NULL,
    opened_file_count INTEGER NOT NULL,
    complete_file_count INTEGER NOT NULL,
    incomplete_file_count INTEGER NOT NULL,
    declared_links_total INTEGER NOT NULL,
    observed_aliases_total INTEGER NOT NULL,
    failed_count INTEGER NOT NULL,
    metadata TEXT NOT NULL CHECK(json_valid(metadata))
  ) STRICT;
`);

const startedAt = new Date().toISOString();
const candidates = db.query<{ path: string }, []>(
  "SELECT path FROM pe_artifacts WHERE lower(path) LIKE 'c:\\windows\\system32\\%.exe' OR lower(path) LIKE 'c:\\windows\\system32\\%.dll' ORDER BY path",
).all();
const seen = new Set<string>();
const insertPath = db.query(`INSERT INTO ntfs_paths(
  volume_id,path,file_record,file_id,declared_link_count,observed_alias_count,alias_complete,source,scanned_at
) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(volume_id,path) DO UPDATE SET
  file_record=excluded.file_record,file_id=excluded.file_id,
  declared_link_count=excluded.declared_link_count,observed_alias_count=excluded.observed_alias_count,
  alias_complete=excluded.alias_complete,source=excluded.source,scanned_at=excluded.scanned_at`);
const insertBatch = db.transaction((rows: Array<{
  path: string; fileRecord: number; fileId: string; linkCount: number; aliases: number; complete: boolean;
}>) => {
  const scannedAt = new Date().toISOString();
  for (const row of rows)
    insertPath.run(volumeId, row.path, row.fileRecord, row.fileId, row.linkCount, row.aliases,
      row.complete ? 1 : 0, scope, scannedAt);
});

let uniqueFiles = 0;
let openedFiles = 0;
let completeFiles = 0;
let incompleteFiles = 0;
let declaredLinks = 0;
let observedAliases = 0;
let failed = 0;
let batch: Array<{ path: string; fileRecord: number; fileId: string; linkCount: number; aliases: number; complete: boolean }> = [];
try {
  for (const candidate of candidates) {
    const path = candidate.path;
    const file = infoFor(path);
    if (!file) {
      failed++;
      continue;
    }
    if (seen.has(file.fileId)) continue;
    seen.add(file.fileId);
    uniqueFiles++;
    openedFiles++;

    let names: string[] | null = null;
    try {
      names = enumerateNames(path);
    } catch {
      failed++;
    }
    if (!names || names.length !== file.linkCount) {
      incompleteFiles++;
      continue;
    }
    completeFiles++;
    declaredLinks += file.linkCount;
    observedAliases += names.length;
    for (const name of names) {
      const normalized = name.startsWith("\\") ? `C:${name}` : `C:\\${name}`;
      batch.push({ path: normalized, fileRecord: file.fileRecord, fileId: file.fileId,
        linkCount: file.linkCount, aliases: names.length, complete: true });
      if (batch.length >= 512) {
        insertBatch(batch);
        batch = [];
      }
    }
  }
  if (batch.length) insertBatch(batch);
  const completedAt = new Date().toISOString();
  const runId = `${completedAt}:${crypto.randomUUID()}`;
  db.query(`INSERT INTO ntfs_path_scan_runs(
    run_id,volume_id,source,started_at,completed_at,candidate_count,unique_file_count,opened_file_count,
    complete_file_count,incomplete_file_count,declared_links_total,observed_aliases_total,failed_count,metadata
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    runId, volumeId, scope, startedAt, completedAt, candidates.length, uniqueFiles, openedFiles,
    completeFiles, incompleteFiles, declaredLinks, observedAliases, failed,
    JSON.stringify({ method: "Win32 FindFirstFileNameW/FindNextFileNameW plus GetFileInformationByHandle", deduplicatedByFileId: true, onlyCompleteAliasSetsPersisted: true }),
  );
  console.log(JSON.stringify({ phase: "ntfs-hardlink-aliases-complete", runId, scope, candidateCount: candidates.length,
    uniqueFiles, openedFiles, completeFiles, incompleteFiles, declaredLinks, observedAliases, failed,
    aliasCoverage: declaredLinks === observedAliases && incompleteFiles === 0 && failed === 0 }));
} finally {
  db.close();
  kernel32Library.close();
}
