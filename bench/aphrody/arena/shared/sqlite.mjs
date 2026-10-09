// R1, runtime lane: bun:sqlite against node:sqlite (Deno), in-memory, same SQL and data.
import { measureSync, prng, report, runtime } from "./common.mjs";

const db =
  runtime === "bun"
    ? new (await import("bun:sqlite")).Database(":memory:")
    : new (await import("node:sqlite")).DatabaseSync(":memory:");

db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, k INTEGER NOT NULL, v INTEGER NOT NULL, s TEXT NOT NULL)");
const ROWS = 5000;
const rnd = prng(11);
const rows = [];
for (let i = 0; i < ROWS; i++) rows.push([i, (rnd() * 64) | 0, (rnd() * 1e6) | 0, "row-" + ((rnd() * 1e9) | 0)]);
const insert = db.prepare("INSERT INTO t (id, k, v, s) VALUES (?, ?, ?, ?)");
const total = db.prepare("SELECT count(*) AS n, sum(v) AS sv FROM t");
const groups = db.prepare("SELECT k, count(*) AS n, max(v) AS mv FROM t GROUP BY k ORDER BY k");

function cycle() {
  db.exec("DELETE FROM t");
  db.exec("BEGIN");
  for (const r of rows) insert.run(r[0], r[1], r[2], r[3]);
  db.exec("COMMIT");
  const t = total.get();
  let h = (Number(t.n) * 31 + Number(t.sv)) >>> 0;
  for (const g of groups.all()) h = Math.imul(h ^ (Number(g.k) * 7 + Number(g.n) + Number(g.mv)), 16777619) >>> 0;
  return h;
}

report("sqlite", "runtime", { cycle: measureSync("cycle", cycle) }, { rows: ROWS });
