import { readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { applyMigrations, createNeonClient } from "@aphrody/bun-plugin-neon";
import { publishPublicSiteSnapshot, readPublicSiteSnapshot } from "./site-neon-import";

const [directory, manifestSHA256, connectionFile] = process.argv.slice(2);
if (!directory || !manifestSHA256 || !connectionFile || !isAbsolute(connectionFile))
  throw new Error(
    "Usage: bun site-neon-publish.ts <absolute-public-release> <manifest-sha256> <protected-direct-url-file>",
  );
const snapshot = await readPublicSiteSnapshot(directory, manifestSHA256);
const sql = createNeonClient({
  connectionString: (await readFile(connectionFile, "utf8")).trim(),
  requireDirect: true,
  expectedDatabase: "bun_site",
});
try {
  await applyMigrations(sql, {
    directory: join(import.meta.dir, "migrations"),
    table: "_bun_site_migrations",
    lockKey: "aphrody_site:migrations",
  });
  const report = await publishPublicSiteSnapshot(sql, snapshot);
  console.log(JSON.stringify(report));
} catch {
  throw new Error("Public site migration or publication failed; current snapshot transaction was not advanced");
} finally {
  await sql.close();
}
