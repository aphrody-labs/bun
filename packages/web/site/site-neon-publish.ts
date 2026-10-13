import { isAbsolute, join } from "node:path";
import { applyMigrations, createNeonClient } from "@aphrody/bun-plugin-neon";
import { publishPublicSiteSnapshot, readPublicSiteSnapshot } from "./site-neon-import";
import { readProtected } from "../cloudflare/scripts/site-release";

export async function publishSiteSnapshotFromFile(directory: string, manifestSHA256: string, connectionFile: string) {
  if (!directory || !manifestSHA256 || !connectionFile || !isAbsolute(connectionFile))
    throw new Error("Expected a public release directory, manifest SHA256 and absolute protected URL file");
  const snapshot = await readPublicSiteSnapshot(directory, manifestSHA256);
  const sql = createNeonClient({
    connectionString: await readProtected(connectionFile),
    requireDirect: true,
    expectedDatabase: "bun_site",
  });
  try {
    await applyMigrations(sql, {
      directory: join(import.meta.dir, "migrations"),
      table: "_bun_site_migrations",
      lockKey: "aphrody_site:migrations",
    });
    return await publishPublicSiteSnapshot(sql, snapshot);
  } catch {
    throw new Error("Public site migration or publication failed; current snapshot transaction was not advanced");
  } finally {
    await sql.close();
  }
}

if (import.meta.main) {
  const [directory, manifestSHA256, connectionFile] = process.argv.slice(2);
  if (!directory || !manifestSHA256 || !connectionFile) throw new Error("Expected release, manifest and URL file");
  try {
    console.log(JSON.stringify(await publishSiteSnapshotFromFile(directory, manifestSHA256, connectionFile)));
  } catch {
    console.error("Public site publication failed; protected connection values are omitted");
    process.exitCode = 1;
  }
}
