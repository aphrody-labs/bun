import { Database } from "bun:sqlite";
import windows from "bun:windows";

const dbPath = "C:/SSH/omar/server/var/index/omar.sqlite";
const drive = "C";
const volumeId = `${drive}:`;
const batchSize = 5_000;
const startedAt = new Date().toISOString();

const db = new Database(dbPath, { create: true, strict: true });
db.exec("PRAGMA busy_timeout=30000; PRAGMA foreign_keys=ON;");
if (db.query<{ journal_mode: string }, []>("PRAGMA journal_mode").get()?.journal_mode !== "wal") {
  db.exec("PRAGMA journal_mode=WAL;");
}
db.exec(`
  CREATE TABLE IF NOT EXISTS ntfs_volumes (
    volume_id TEXT PRIMARY KEY,
    drive TEXT NOT NULL,
    source TEXT NOT NULL,
    scan_status TEXT NOT NULL,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    entry_count INTEGER NOT NULL DEFAULT 0,
    journal_id TEXT,
    journal_start_usn TEXT,
    journal_next_usn TEXT,
    journal_lowest_valid_usn TEXT,
    journal_tracking_status TEXT NOT NULL,
    metadata TEXT NOT NULL CHECK(json_valid(metadata))
  ) STRICT;
  CREATE TABLE IF NOT EXISTS ntfs_entries (
    volume_id TEXT NOT NULL,
    record INTEGER NOT NULL,
    parent_record INTEGER NOT NULL,
    attributes INTEGER NOT NULL,
    name TEXT NOT NULL,
    is_directory INTEGER NOT NULL CHECK(is_directory IN (0,1)),
    scanned_at TEXT NOT NULL,
    PRIMARY KEY(volume_id, record, parent_record, name)
  ) STRICT;
  CREATE INDEX IF NOT EXISTS ntfs_entries_parent ON ntfs_entries(volume_id,parent_record);
  CREATE INDEX IF NOT EXISTS ntfs_entries_name ON ntfs_entries(volume_id,name);
  CREATE TABLE IF NOT EXISTS ntfs_entry_edges (
    volume_id TEXT NOT NULL,
    parent_record INTEGER NOT NULL,
    child_record INTEGER NOT NULL,
    relation TEXT NOT NULL CHECK(relation='contains'),
    PRIMARY KEY(volume_id,parent_record,child_record)
  ) STRICT;
  CREATE INDEX IF NOT EXISTS ntfs_edges_child ON ntfs_entry_edges(volume_id,child_record);
  CREATE TABLE IF NOT EXISTS ntfs_journal_events (
    volume_id TEXT NOT NULL,
    journal_id TEXT NOT NULL,
    usn TEXT NOT NULL,
    record INTEGER NOT NULL,
    parent_record INTEGER NOT NULL,
    timestamp INTEGER NOT NULL,
    reason INTEGER NOT NULL,
    attributes INTEGER NOT NULL,
    name TEXT NOT NULL,
    PRIMARY KEY(volume_id,journal_id,usn,record)
  ) STRICT;
  CREATE TABLE IF NOT EXISTS ntfs_journal_state (
    volume_id TEXT PRIMARY KEY,
    journal_id TEXT NOT NULL,
    next_usn TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    status TEXT NOT NULL
  ) STRICT;
`);

const volume = new windows.ntfs.Volume(drive);
let journalStart: ReturnType<typeof volume.queryJournal> | undefined;
try {
  journalStart = volume.queryJournal();
} catch (error) {
  const winError = (error as { winError?: number }).winError;
  if (winError !== 1179 && winError !== 1178) throw error;
}

const journalStatus = journalStart ? "available; checkpoint captured before MFT enumeration" : "no active USN journal; not created";
db.query(`
  INSERT INTO ntfs_volumes(
    volume_id,drive,source,scan_status,started_at,completed_at,entry_count,
    journal_id,journal_start_usn,journal_next_usn,journal_lowest_valid_usn,
    journal_tracking_status,metadata
  ) VALUES(?,?,?,'running',?,NULL,0,?,?,?,?,?,?)
  ON CONFLICT(volume_id) DO UPDATE SET
    source=excluded.source,scan_status='running',started_at=excluded.started_at,
    completed_at=NULL,journal_id=excluded.journal_id,
    journal_start_usn=excluded.journal_start_usn,
    journal_next_usn=excluded.journal_next_usn,
    journal_lowest_valid_usn=excluded.journal_lowest_valid_usn,
    journal_tracking_status=excluded.journal_tracking_status,
    metadata=excluded.metadata
`).run(
  volumeId, drive, "Bun 1.4.4 bun:windows NtfsVolume.enumerateMft; metadata only",
  startedAt, journalStart ? String(journalStart.journalId) : null,
  journalStart ? String(journalStart.nextUsn) : null,
  journalStart ? String(journalStart.nextUsn) : null,
  journalStart ? String(journalStart.lowestValidUsn) : null,
  journalStatus,
  JSON.stringify({ api: "enumerateMft", bufferBytes: 4 << 20, records: "allocated MFT entries returned by FSCTL_ENUM_USN_DATA", contentsRead: false }),
);

console.log(JSON.stringify({ phase: "enumerateMft", volume: volumeId, startedAt, rss: process.memoryUsage().rss }));
const entries = volume.enumerateMft(4 << 20);
console.log(JSON.stringify({ phase: "mftReady", count: entries.length, rss: process.memoryUsage().rss }));

const upsertEntry = db.query(`
  INSERT INTO ntfs_entries(volume_id,record,parent_record,attributes,name,is_directory,scanned_at)
  VALUES(?,?,?,?,?,?,?)
  ON CONFLICT(volume_id,record,parent_record,name) DO UPDATE SET
    attributes=excluded.attributes,is_directory=excluded.is_directory,scanned_at=excluded.scanned_at
`);
const upsertEdge = db.query(`
  INSERT INTO ntfs_entry_edges(volume_id,parent_record,child_record,relation)
  VALUES(?,?,?,'contains') ON CONFLICT DO NOTHING
`);
const insertRange = db.transaction((start: number, end: number) => {
  for (let i = start; i < end; i++) {
    const entry = entries[i]!;
    const record = Math.trunc(entry.record);
    const parentRecord = Math.trunc(entry.parent);
    const attributes = entry.attributes >>> 0;
    upsertEntry.run(volumeId, record, parentRecord, attributes, entry.name, (attributes & 0x10) !== 0 ? 1 : 0, startedAt);
    upsertEdge.run(volumeId, parentRecord, record);
  }
});

for (let offset = 0; offset < entries.length; offset += batchSize) {
  insertRange(offset, Math.min(offset + batchSize, entries.length));
  const count = Math.min(offset + batchSize, entries.length);
  if (count % 100_000 === 0 || count === entries.length) {
    console.log(JSON.stringify({ phase: "indexing", indexed: count, total: entries.length, rss: process.memoryUsage().rss }));
  }
}

let journalEnd: ReturnType<typeof volume.queryJournal> | undefined;
try {
  journalEnd = volume.queryJournal();
} catch {}
if (journalStart && journalEnd && journalStart.journalId === journalEnd.journalId) {
  db.query(`INSERT INTO ntfs_journal_state(volume_id,journal_id,next_usn,updated_at,status)
    VALUES(?,?,?,?,?) ON CONFLICT(volume_id) DO UPDATE SET journal_id=excluded.journal_id,
    next_usn=excluded.next_usn,updated_at=excluded.updated_at,status=excluded.status`)
    .run(volumeId, String(journalEnd.journalId), String(journalStart.nextUsn), new Date().toISOString(),
      "checkpoint is pre-scan; next incremental read can replay changes made during enumeration");
} else if (journalStart) {
  db.query("UPDATE ntfs_volumes SET journal_tracking_status=? WHERE volume_id=?")
    .run("journal identity changed during scan; rescan required", volumeId);
}

const completedAt = new Date().toISOString();
db.query(`UPDATE ntfs_volumes SET scan_status='complete',completed_at=?,entry_count=? WHERE volume_id=?`)
  .run(completedAt, entries.length, volumeId);
console.log(JSON.stringify({ phase: "complete", volume: volumeId, entries: entries.length, startedAt, completedAt, journalId: journalEnd ? String(journalEnd.journalId) : null, checkpointUsn: journalStart ? String(journalStart.nextUsn) : null, rss: process.memoryUsage().rss }));
volume.close();
db.close();
