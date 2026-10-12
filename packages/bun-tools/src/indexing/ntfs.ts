import { Database } from "bun:sqlite";
import { positiveInteger, prepareDatabase } from "./common";

export interface JournalState {
  journalId: bigint;
  nextUsn: bigint;
  lowestValidUsn: bigint;
}
export interface MftEntry {
  record: number;
  parent: number;
  attributes: number;
  name: string;
}
export interface JournalEntry {
  record: number;
  parentRecord: number;
  attributes: number;
  name: string;
  usn: bigint;
  timestamp: bigint;
  reason: number;
}
export interface NtfsVolumeReader {
  queryJournal(): JournalState;
  enumerateMft(bufferBytes?: number): MftEntry[];
  readJournal(startUsn: bigint, journalId: bigint, bufferBytes?: number): { records: JournalEntry[]; next: bigint };
  close(): void;
}
export interface NtfsIndexOptions {
  dbPath: string;
  drive: string;
  bufferBytes?: number;
  maxEntries?: number;
  maxPages?: number;
  createVolume?: (drive: string) => NtfsVolumeReader;
}

async function volumeReader(options: NtfsIndexOptions): Promise<NtfsVolumeReader> {
  if (!/^[a-z]:?$/i.test(options.drive)) throw new TypeError("drive must be a Windows drive letter");
  if (options.createVolume) return options.createVolume(options.drive.replace(/:$/, ""));
  const { default: windows } = await import("bun:windows");
  return new windows.ntfs.Volume(options.drive.replace(/:$/, ""));
}

function schema(db: Database): void {
  db.exec(`PRAGMA busy_timeout=30000;
    CREATE TABLE IF NOT EXISTS ntfs_volumes (
      volume_id TEXT PRIMARY KEY, journal_id TEXT, next_usn TEXT,
      scan_status TEXT NOT NULL, entry_count INTEGER NOT NULL, updated_at TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS ntfs_entries (
      volume_id TEXT NOT NULL, record INTEGER NOT NULL, parent_record INTEGER NOT NULL,
      attributes INTEGER NOT NULL, name TEXT NOT NULL, is_directory INTEGER NOT NULL,
      PRIMARY KEY(volume_id,record,parent_record,name)
    ) STRICT;
    CREATE INDEX IF NOT EXISTS ntfs_entries_parent ON ntfs_entries(volume_id,parent_record);
    CREATE TABLE IF NOT EXISTS ntfs_entry_edges (
      volume_id TEXT NOT NULL, parent_record INTEGER NOT NULL, child_record INTEGER NOT NULL,
      PRIMARY KEY(volume_id,parent_record,child_record)
    ) STRICT;
    CREATE TABLE IF NOT EXISTS ntfs_journal_events (
      volume_id TEXT NOT NULL, journal_id TEXT NOT NULL, usn TEXT NOT NULL,
      record INTEGER NOT NULL, parent_record INTEGER NOT NULL, timestamp TEXT NOT NULL,
      reason INTEGER NOT NULL, attributes INTEGER NOT NULL, name TEXT NOT NULL,
      PRIMARY KEY(volume_id,journal_id,usn,record,parent_record,name)
    ) STRICT;`);
}

/** Replaces a volume baseline atomically; retains a pre-scan USN for replay of concurrent changes. */
export async function indexNtfs(options: NtfsIndexOptions) {
  const maxEntries = positiveInteger("maxEntries", options.maxEntries ?? 5_000_000);
  const bufferBytes = positiveInteger("bufferBytes", options.bufferBytes ?? 4 << 20, 64 << 20);
  await prepareDatabase(options.dbPath);
  const volume = await volumeReader(options);
  let db: Database | undefined;
  try {
    let before: JournalState | undefined;
    try {
      before = volume.queryJournal();
    } catch (error) {
      const code = (error as { winError?: number }).winError;
      if (code !== 1178 && code !== 1179) throw error;
    }
    const entries = volume.enumerateMft(bufferBytes);
    if (entries.length > maxEntries) throw new RangeError("MFT baseline exceeds maxEntries");
    const after = before ? volume.queryJournal() : undefined;
    if (before && after && (before.journalId !== after.journalId || before.nextUsn < after.lowestValidUsn))
      throw new Error("USN journal changed or expired during enumeration; baseline was not replaced");
    db = new Database(options.dbPath, { create: true, strict: true });
    schema(db);
    const volumeId = `${options.drive.replace(/:$/, "").toUpperCase()}:`;
    const put = db.query("INSERT INTO ntfs_entries VALUES(?,?,?,?,?,?) ON CONFLICT DO NOTHING");
    const edge = db.query("INSERT INTO ntfs_entry_edges VALUES(?,?,?) ON CONFLICT DO NOTHING");
    db.transaction(() => {
      db!.query("DELETE FROM ntfs_entries WHERE volume_id=?").run(volumeId);
      db!.query("DELETE FROM ntfs_entry_edges WHERE volume_id=?").run(volumeId);
      db!.query("DELETE FROM ntfs_journal_events WHERE volume_id=?").run(volumeId);
      for (const entry of entries) {
        put.run(
          volumeId,
          entry.record,
          entry.parent,
          entry.attributes >>> 0,
          entry.name,
          entry.attributes & 16 ? 1 : 0,
        );
        edge.run(volumeId, entry.parent, entry.record);
      }
      db!
        .query(`INSERT INTO ntfs_volumes VALUES(?,?,?,?,?,?) ON CONFLICT(volume_id) DO UPDATE SET
        journal_id=excluded.journal_id,next_usn=excluded.next_usn,scan_status=excluded.scan_status,
        entry_count=excluded.entry_count,updated_at=excluded.updated_at`)
        .run(
          volumeId,
          before ? String(before.journalId) : null,
          before ? String(before.nextUsn) : null,
          "complete",
          entries.length,
          new Date().toISOString(),
        );
    }).immediate();
    return {
      volume: volumeId,
      entries: entries.length,
      journalId: before ? String(before.journalId) : null,
      checkpointUsn: before ? String(before.nextUsn) : null,
    };
  } finally {
    try {
      db?.close();
    } finally {
      volume.close();
    }
  }
}

/** Commits each USN page and its checkpoint in one SQLite transaction. */
export async function syncNtfs(options: NtfsIndexOptions) {
  const maxPages = positiveInteger("maxPages", options.maxPages ?? 10_000);
  const bufferBytes = positiveInteger("bufferBytes", options.bufferBytes ?? 1 << 20, 64 << 20);
  await prepareDatabase(options.dbPath);
  const volume = await volumeReader(options);
  let db: Database | undefined;
  try {
    db = new Database(options.dbPath, { create: false, strict: true });
    schema(db);
    const volumeId = `${options.drive.replace(/:$/, "").toUpperCase()}:`;
    const baseline = db
      .query<{ journal_id: string | null; next_usn: string | null; scan_status: string }, [string]>(
        "SELECT journal_id,next_usn,scan_status FROM ntfs_volumes WHERE volume_id=?",
      )
      .get(volumeId);
    if (!baseline || baseline.scan_status !== "complete" || !baseline.journal_id || !baseline.next_usn)
      throw new Error("No complete NTFS baseline with active USN checkpoint");
    const current = volume.queryJournal();
    let next = BigInt(baseline.next_usn);
    if (String(current.journalId) !== baseline.journal_id || next < current.lowestValidUsn || next > current.nextUsn)
      throw new Error("USN checkpoint is stale; a full baseline is required");
    const event = db.query("INSERT INTO ntfs_journal_events VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING");
    const put = db.query(`INSERT INTO ntfs_entries VALUES(?,?,?,?,?,?) ON CONFLICT(volume_id,record,parent_record,name)
      DO UPDATE SET attributes=excluded.attributes,is_directory=excluded.is_directory`);
    const remove = db.query("DELETE FROM ntfs_entries WHERE volume_id=? AND record=? AND parent_record=? AND name=?");
    const edge = db.query("INSERT INTO ntfs_entry_edges VALUES(?,?,?) ON CONFLICT DO NOTHING");
    const pruneEdge = db.query(`DELETE FROM ntfs_entry_edges WHERE volume_id=? AND child_record=? AND parent_record=?
      AND NOT EXISTS(SELECT 1 FROM ntfs_entries WHERE volume_id=? AND record=? AND parent_record=?)`);
    let pages = 0;
    let changes = 0;
    while (next < current.nextUsn && pages < maxPages) {
      const page = volume.readJournal(next, current.journalId, bufferBytes);
      if (page.next <= next) throw new Error("USN reader did not advance");
      db.transaction(() => {
        for (const row of page.records) {
          if (row.record < 16) continue;
          event.run(
            volumeId,
            String(current.journalId),
            String(row.usn),
            row.record,
            row.parentRecord,
            String(row.timestamp),
            row.reason,
            row.attributes >>> 0,
            row.name,
          );
          if (row.reason & (0x200 | 0x1000)) {
            remove.run(volumeId, row.record, row.parentRecord, row.name);
            pruneEdge.run(volumeId, row.record, row.parentRecord, volumeId, row.record, row.parentRecord);
          } else if (row.name) {
            put.run(
              volumeId,
              row.record,
              row.parentRecord,
              row.attributes >>> 0,
              row.name,
              row.attributes & 16 ? 1 : 0,
            );
            edge.run(volumeId, row.parentRecord, row.record);
          }
        }
        const updated = db!
          .query(`UPDATE ntfs_volumes SET next_usn=?,updated_at=?,
          entry_count=(SELECT COUNT(*) FROM ntfs_entries WHERE volume_id=?) WHERE volume_id=? AND next_usn=? AND journal_id=?`)
          .run(
            String(page.next),
            new Date().toISOString(),
            volumeId,
            volumeId,
            String(next),
            String(current.journalId),
          );
        if (updated.changes !== 1) throw new Error("Another indexer advanced the NTFS checkpoint");
      }).immediate();
      next = page.next;
      pages++;
      changes += page.records.length;
    }
    return {
      volume: volumeId,
      pages,
      changes,
      checkpointUsn: String(next),
      complete: next >= current.nextUsn,
    };
  } finally {
    try {
      db?.close();
    } finally {
      volume.close();
    }
  }
}
