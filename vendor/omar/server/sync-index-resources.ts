import { Database } from "bun:sqlite";
const root = "C:/SSH/omar";
const catalog = await Bun.file("C:/aphrody/tools/config/service-catalog.json").json();
const definitions = await Bun.file(`${root}/server/services.json`).json();
const db = new Database(`${root}/server/var/index/omar.sqlite`);
db.exec("PRAGMA busy_timeout=30000; CREATE TABLE IF NOT EXISTS omar_resources(id TEXT PRIMARY KEY,kind TEXT NOT NULL,name TEXT NOT NULL,canonical_path TEXT,metadata_json TEXT NOT NULL,updated_at TEXT NOT NULL)");
const put = db.query("INSERT INTO omar_resources VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,name=excluded.name,canonical_path=excluded.canonical_path,metadata_json=excluded.metadata_json,updated_at=excluded.updated_at");
db.transaction(() => {
  const at = new Date().toISOString();
  for (const item of [
    { id: "monorepo", name: "Omar", path: root, metadata: { git: "main", runtime: "Bun 1.4.4" } },
    { id: "bun-source", name: "Bun OS", path: "C:/bun", metadata: { remote: "aphrody-labs/bun-os", revision: Bun.revision } },
    { id: "aphrody-source", name: "Aphrody", path: "C:/aphrody", metadata: { owner: "aphrody-labs" } },
  ]) put.run(item.id, "repository", item.name, item.path, JSON.stringify(item.metadata), at);
  for (const s of catalog.services.filter((s: any) => s.host === "local")) put.run(`infra:${s.id}`, "service", s.id, s.target ?? s.health ?? "local", JSON.stringify({ runtime: s.runtime, health: s.health, public: s.public ?? false }), at);
  for (const s of definitions.services) put.run(`omar:${s.id}`, "service", s.id, s.cwd, JSON.stringify({ health: s.health, executable: s.command[0] }), at);
}).immediate();
console.log(JSON.stringify({ resources: (db.query("SELECT count(*) AS n FROM omar_resources").get() as { n: number }).n, database: `${root}/server/var/index/omar.sqlite` }));
db.close();
