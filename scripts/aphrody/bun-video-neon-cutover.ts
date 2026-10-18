import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createNeonClient } from "../../packages/bun-sql/src/neon";
import { defaultVideoCatalogPath } from "../../packages/bun-video/src/video-catalog";
import { importVideoCatalog, snapshotVideoCatalog } from "../../packages/bun-video/src/video-neon-migrate";

const source = defaultVideoCatalogPath();
const home = dirname(dirname(dirname(source)));
const marker = join(home, "config", "bun-video-neon.active");
const connectionFile = join(home, "config", "bun-video-neon.url");
const mainHost = "ep-lucky-star-b97hoksf.c-7.eu-central-1.aws.neon.tech";

async function main() {
  const apply = Bun.argv.slice(2).includes("--apply");
  if (Bun.argv.length > 3 || (Bun.argv.length === 3 && !apply))
    throw new TypeError("Usage: bun scripts/aphrody/bun-video-neon-cutover.ts [--apply]");
  if (apply && Bun.env.BUN_VIDEO_WRITERS_STOPPED !== "1")
    throw new Error("Stop every Bun Video SQLite writer before applying the cutover");
  if (existsSync(marker)) throw new Error("Bun Video cutover is already active");
  const file = Bun.file(connectionFile);
  if (!(await file.exists()) || file.size > 4096) throw new Error("Private Neon connection file is unavailable");
  const sql = createNeonClient({
    connectionString: (await file.text()).trim(),
    expectedHostname: mainHost,
    expectedDatabase: "bun_video",
    requireDirect: true,
  });
  let lock: Database | undefined;
  let imported = false;
  let activated = false;
  const temporaryMarker = `${marker}.${crypto.randomUUID()}.tmp`;
  try {
    const tables = await sql.unsafe<{ total: number }[]>(
      "SELECT count(*)::int AS total FROM pg_tables WHERE schemaname='bun_video'",
    );
    if (tables[0]?.total !== 0) throw new Error("Neon bun_video schema is not empty");
    if (apply) {
      lock = new Database(source, { strict: true });
      lock.exec("PRAGMA busy_timeout=15000; BEGIN IMMEDIATE");
    }
    const snapshot = snapshotVideoCatalog(source);
    if (!apply) {
      console.log(JSON.stringify({ sourceTables: snapshot.tables.length, counts: snapshot.counts, neonTables: 0 }));
      return;
    }
    const importedCatalog = await importVideoCatalog(sql, snapshot);
    imported = true;
    if (importedCatalog.digest !== snapshot.digest) throw new Error("Neon catalog verification failed");
    await Bun.write(
      temporaryMarker,
      JSON.stringify({
        projectId: "odd-sound-74350267",
        database: "bun_video",
        digest: snapshot.digest,
        activatedAt: new Date().toISOString(),
      }) + "\n",
    );
    await rename(temporaryMarker, marker);
    activated = true;
    console.log(JSON.stringify({ activated: true, tables: snapshot.tables.length, counts: snapshot.counts }));
  } catch (error) {
    if (imported && !activated && !existsSync(marker)) {
      try {
        await sql.unsafe("DROP SCHEMA bun_video CASCADE");
      } catch {
        console.error("Neon cleanup after failed cutover also failed; inspect the dedicated schema before retry");
      }
    }
    throw error;
  } finally {
    await rm(temporaryMarker, { force: true });
    if (lock) {
      lock.exec("ROLLBACK");
      lock.close();
    }
    await sql.close();
  }
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    const safe =
      error instanceof Error &&
      /^(Stop every Bun Video SQLite writer|Bun Video cutover is already active|Neon bun_video schema is not empty)/.test(
        error.message,
      )
        ? error.message
        : error instanceof Error
          ? error.name
          : "Error";
    console.error(`Bun Video cutover failed: ${safe}`);
    process.exitCode = 1;
  }
}
