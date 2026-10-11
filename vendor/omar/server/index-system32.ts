import { readFile } from "node:fs/promises";
import path from "node:path";
import { Database } from "bun:sqlite";

const serverRoot = import.meta.dir;
const dbPath = "C:/SSH/omar/server/var/index/omar.sqlite";
const stagePath = "C:/SSH/omar/server/var/index/system32-pe-artifacts.ndjson";
const provenancePath = "C:/SSH/omar/server/var/index/system32-pe-index-provenance.json";
const steps = [
  { name: "scan", file: path.join(serverRoot, "tools/system32-pe-scan.ts") },
  { name: "import", file: path.join(serverRoot, "tools/system32-pe-import.ts") },
  { name: "import-graph", file: path.join(serverRoot, "tools/system32-pe-import-graph.ts") },
];

if (Bun.version !== "1.4.4") throw new Error(`Expected Bun 1.4.4, found ${Bun.version}`);

async function verifyStage() {
  const stage = Bun.file(stagePath);
  if (!(await stage.exists())) throw new Error("PE stage file was not created");
  const provenance = JSON.parse(await readFile(provenancePath, "utf8")) as {
    parsed: number; parseErrors: number; readErrors: number; stageSha256: string; scanId: string;
  };
  const digest = new Bun.CryptoHasher("sha256");
  const decoder = new TextDecoder();
  let lines = 0;
  let trailing = "";
  for await (const chunk of stage.stream()) {
    digest.update(chunk);
    const text = trailing + decoder.decode(chunk, { stream: true });
    for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) lines++;
    trailing = text.slice(text.lastIndexOf("\n") + 1);
  }
  const end = trailing + decoder.decode();
  if (end.length) lines++;
  const stageSha256 = digest.digest("hex");
  if (stageSha256 !== provenance.stageSha256) throw new Error("PE stage SHA-256 does not match scan provenance");
  if (lines !== provenance.parsed || provenance.parseErrors !== 0 || provenance.readErrors !== 0) {
    throw new Error(`PE stage does not meet complete-import gate: lines=${lines}, parsed=${provenance.parsed}, parseErrors=${provenance.parseErrors}, readErrors=${provenance.readErrors}`);
  }
  console.log(JSON.stringify({ phase: "stage-verified", scanId: provenance.scanId, lines, stageSha256 }));
}

async function verifyDatabase() {
  const db = new Database(dbPath, { readonly: true, strict: true });
  try {
    const peRows = db.query<{ rows: number; errors: number; hashed: number }, []>(
      "SELECT COUNT(*) AS rows, SUM(parse_error IS NOT NULL) AS errors, SUM(sha256 IS NOT NULL) AS hashed FROM pe_artifacts",
    ).get();
    const edgeRows = db.query<{ rows: number; resolved: number }, []>(
      "SELECT COUNT(*) AS rows, SUM(resolved_path IS NOT NULL) AS resolved FROM pe_import_edges",
    ).get();
    const check = db.query<{ quick_check: string }, []>("PRAGMA quick_check").get()?.quick_check;
    if (check !== "ok" || !peRows || !edgeRows || peRows.rows !== peRows.hashed || peRows.errors !== 0) {
      throw new Error(`PE database verification failed: quickCheck=${check}, artifacts=${JSON.stringify(peRows)}, edges=${JSON.stringify(edgeRows)}`);
    }
    console.log(JSON.stringify({ phase: "database-verified", artifacts: peRows.rows, parseErrors: peRows.errors, hashed: peRows.hashed, importEdges: edgeRows.rows, resolvedEdges: edgeRows.resolved, quickCheck: check }));
  } finally { db.close(); }
}

for (const step of steps) {
  console.log(JSON.stringify({ phase: "start", step: step.name }));
  await using child = Bun.spawn({
    cmd: [process.execPath, "--no-env-file", step.file],
    cwd: serverRoot,
    stdout: "inherit",
    stderr: "inherit",
  });
  const code = await child.exited;
  if (code !== 0) throw new Error(`System32 indexing step ${step.name} exited with ${code}`);
  if (step.name === "scan") await verifyStage();
}
await verifyDatabase();
console.log(JSON.stringify({ phase: "complete", dbPath, stagePath, provenancePath }));
