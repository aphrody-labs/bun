import { Database } from "bun:sqlite";
import windows from "bun:windows";

const dbPath = "C:/SSH/omar/server/var/index/omar.sqlite";
const volumeId = "C:";
const drive = "C";
const pollMs = 2_000;
const batchBytes = 1 << 20;

type Health = {
  status: "starting" | "active" | "degraded" | "rescan-required";
  volume: string;
  journalId?: string;
  checkpointUsn?: string;
  nextUsn?: string;
  lagUsn?: string;
  lastSyncAt?: string;
  lastPageCount?: number;
  lastChangeCount?: number;
};

const health: Health = { status: "starting", volume: volumeId };
let stopped = false;
let syncing = false;

function syncOnce() {
  const db = new Database(dbPath, { create: false, strict: true });
  db.exec("PRAGMA busy_timeout=30000; PRAGMA foreign_keys=ON;");
  const vol = new windows.ntfs.Volume(drive);
  try {
    const baseline = db.query<{
      journal_id: string | null;
      journal_start_usn: string | null;
      scan_status: string;
    }, [string]>("SELECT journal_id,journal_start_usn,scan_status FROM ntfs_volumes WHERE volume_id=?").get(volumeId);
    if (!baseline || baseline.scan_status !== "complete" || !baseline.journal_id || !baseline.journal_start_usn)
      throw new Error("MFT baseline or initial journal checkpoint is unavailable");

    const current = vol.queryJournal();
    const journalId = String(current.journalId);
    const state = db.query<{ journal_id: string; next_usn: string }, [string]>(
      "SELECT journal_id,next_usn FROM ntfs_journal_state WHERE volume_id=?",
    ).get(volumeId);
    const cursor = state ? BigInt(state.next_usn) : BigInt(baseline.journal_start_usn);

    if (journalId !== baseline.journal_id || (state && state.journal_id !== journalId)) {
      db.query("UPDATE ntfs_volumes SET journal_tracking_status=? WHERE volume_id=?")
        .run("journal identity changed; full MFT rescan required", volumeId);
      health.status = "rescan-required";
      throw new Error("USN journal identity changed");
    }
    if (cursor < current.lowestValidUsn) {
      db.query("UPDATE ntfs_volumes SET journal_tracking_status=? WHERE volume_id=?")
        .run("checkpoint fell out of journal; full MFT rescan required", volumeId);
      health.status = "rescan-required";
      throw new Error("USN checkpoint expired");
    }

    const insertEvent = db.query(`INSERT INTO ntfs_journal_events(
      volume_id,journal_id,usn,record,parent_record,timestamp,reason,attributes,name
    ) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING`);
    const deleteEntry = db.query(`DELETE FROM ntfs_entries
      WHERE volume_id=? AND record=? AND parent_record=? AND name=?`);
    const removeUnusedEdge = db.query(`DELETE FROM ntfs_entry_edges
      WHERE volume_id=? AND parent_record=? AND child_record=?
        AND NOT EXISTS (SELECT 1 FROM ntfs_entries e WHERE e.volume_id=? AND e.parent_record=? AND e.record=?)`);
    const upsertEntry = db.query(`INSERT INTO ntfs_entries(
      volume_id,record,parent_record,attributes,name,is_directory,scanned_at
    ) VALUES(?,?,?,?,?,?,?) ON CONFLICT(volume_id,record,parent_record,name) DO UPDATE SET
      attributes=excluded.attributes,is_directory=excluded.is_directory,scanned_at=excluded.scanned_at`);
    const insertEdge = db.query(`INSERT INTO ntfs_entry_edges(volume_id,parent_record,child_record,relation)
      VALUES(?,?,?,'contains') ON CONFLICT DO NOTHING`);
    const applyPage = db.transaction((records: ReturnType<typeof vol.readJournal>["records"]) => {
      const now = new Date().toISOString();
      for (const row of records) {
        const record = Math.trunc(row.record);
        const parent = Math.trunc(row.parentRecord);
        if (record < 16) continue;
        insertEvent.run(volumeId, journalId, String(row.usn), record, parent, row.timestamp, row.reason, row.attributes, row.name);
        if (row.reason & 0x200) {
          deleteEntry.run(volumeId, record, parent, row.name);
          removeUnusedEdge.run(volumeId, parent, record, volumeId, parent, record);
        } else if (row.name.length > 0) {
          if (row.reason & 0x1000) {
            deleteEntry.run(volumeId, record, parent, row.name);
            removeUnusedEdge.run(volumeId, parent, record, volumeId, parent, record);
          } else {
            upsertEntry.run(volumeId, record, parent, row.attributes >>> 0, row.name,
              (row.attributes & 0x10) !== 0 ? 1 : 0, now);
            insertEdge.run(volumeId, parent, record);
          }
        }
      }
    });
    const writeState = db.query(`INSERT INTO ntfs_journal_state(volume_id,journal_id,next_usn,updated_at,status)
      VALUES(?,?,?,?,?) ON CONFLICT(volume_id) DO UPDATE SET journal_id=excluded.journal_id,
      next_usn=excluded.next_usn,updated_at=excluded.updated_at,status=excluded.status`);

    let next = cursor;
    let pages = 0;
    let changes = 0;
    while (next < current.nextUsn) {
      if (++pages > 10_000) throw new Error("USN catch-up page bound reached; checkpoint remains at the last committed page");
      const page = vol.readJournal(next, current.journalId, batchBytes);
      if (page.next < next || (page.next === next && next < current.nextUsn))
        throw new Error("USN reader did not advance; checkpoint remains at the last committed page");
      applyPage(page.records);
      changes += page.records.length;
      next = page.next;
      writeState.run(volumeId, journalId, String(next), new Date().toISOString(), "tracking active; event pages persisted");
    }
    if (pages === 0)
      writeState.run(volumeId, journalId, String(next), new Date().toISOString(), "tracking active; no new events");
    db.query("UPDATE ntfs_volumes SET journal_next_usn=?,journal_tracking_status=? WHERE volume_id=?")
      .run(String(next), "active; checkpoint advanced through paginated Bun readJournal", volumeId);

    health.status = "active";
    health.journalId = journalId;
    health.checkpointUsn = String(next);
    health.nextUsn = String(current.nextUsn);
    health.lagUsn = String(current.nextUsn - next);
    health.lastSyncAt = new Date().toISOString();
    health.lastPageCount = pages;
    health.lastChangeCount = changes;
  } finally {
    vol.close();
    db.close();
  }
}

async function syncLoop() {
  while (!stopped) {
    if (!syncing) {
      syncing = true;
      try {
        syncOnce();
      } catch {
        if (health.status !== "rescan-required") health.status = "degraded";
      } finally {
        syncing = false;
      }
    }
    await Bun.sleep(pollMs);
  }
}

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 8802,
  fetch(request) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health")
      return Response.json({ ...health, syncing });
    return new Response("not found", { status: 404 });
  },
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    stopped = true;
    server.stop(true);
  });
}

void syncLoop();
console.log(JSON.stringify({ phase: "ntfs-index-service-started", host: "127.0.0.1", port: 8802, volume: volumeId }));
