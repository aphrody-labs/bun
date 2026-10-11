import { Database } from "bun:sqlite";

const ROOT = "C:/SSH/omar";
const DB_PATH = `${ROOT}/server/var/index/omar.sqlite`;
let db: Database | undefined;
let cache: Bun.RedisClient | undefined;
const database = () => {
  if (!db) { db = new Database(DB_PATH, { readonly: true }); db.exec("PRAGMA busy_timeout=30000"); }
  return db;
};
const has = (table: string) => Boolean(database().query("SELECT 1 FROM sqlite_master WHERE type IN ('table','view') AND name=?").get(table));
const count = (table: string) => has(table) && /^[a-z_]+$/.test(table) ? (database().query(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n : 0;
const codeScope = "(repository_id GLOB 'source:bun-os/*' OR repository_id GLOB 'source:aphrody/*' OR repository_id GLOB 'source:omar-strict/*')";
const currentSnapshots = `WITH ranked_snapshots AS (SELECT id,repository_id,row_number() OVER(PARTITION BY repository_id ORDER BY created_at DESC,id DESC) AS position FROM graph_snapshots WHERE ${codeScope}), current_snapshots AS (SELECT id,repository_id FROM ranked_snapshots WHERE position=1)`;
const codeCount = (table: "nodes" | "edges") => has(table) ? (database().query(`${currentSnapshots} SELECT COALESCE(sum(json_extract(g.metadata,'$.${table}')),0) AS n FROM graph_snapshots g JOIN current_snapshots s ON g.id=s.id`).get() as { n: number }).n : 0;
const redis = () => cache ??= new Bun.RedisClient(Bun.env.REDIS_URL ?? "redis://127.0.0.1:6379");
async function cached<T>(key: string, read: () => T, ttl = 30): Promise<T> {
  const name = `omar:webos:v1:${key}`;
  try { const hit = await redis().get(name); if (hit) return JSON.parse(hit); } catch { /* SQLite remains available. */ }
  const value = read();
  try { await redis().send("SET", [name, JSON.stringify(value), "EX", String(ttl)]); } catch { /* Cache can be rebuilt. */ }
  return value;
}

export async function omarSummary() {
  return cached("summary", () => ({
    root: ROOT, runtime: { version: Bun.version, revision: Bun.revision },
    ntfs: { entries: count("ntfs_entries"), edges: count("ntfs_entry_edges"), paths: count("ntfs_paths"), coverage: "Allocated MFT records; additional hardlinks indexed separately for System32 PE files", volumes: has("ntfs_volumes") ? database().query("SELECT volume_id,drive,scan_status,entry_count,journal_tracking_status FROM ntfs_volumes").all() : [] },
    system32: { binaries: count("pe_artifacts"), importEdges: count("pe_import_edges") },
    resources: count("omar_resources"),
    code: { nodes: codeCount("nodes"), edges: codeCount("edges"), snapshots: count("graph_snapshots"), scopes: ["bun-os", "aphrody", "omar-strict"], coverage: "Snapshot source graph; unsupported or ambiguous symbols remain unresolved" },
    graphTables: database().query("SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE 'graph_%' OR name IN ('nodes','edges','repositories','snapshots')) ORDER BY name").all(),
  }), 15);
}

function ntfsPath(entry: any): string {
  const parts = [entry.name];
  let parent = entry.parent_record;
  const seen = new Set<string>();
  const lookup = database().query("SELECT record,parent_record,name FROM ntfs_entries WHERE volume_id=? AND record=? LIMIT 1");
  for (let depth = 0; depth < 256; depth++) {
    const key = String(parent);
    if (seen.has(key)) break;
    seen.add(key);
    const next = lookup.get(entry.volume_id, parent) as any;
    if (!next || next.record === next.parent_record) break;
    parts.unshift(next.name);
    parent = next.parent_record;
  }
  return `${entry.volume_id.replace(/[:\\/]+$/, "")}:/${parts.join("/")}`;
}

export async function omarSearch(req: Request) {
  const params = new URL(req.url).searchParams;
  const q = (params.get("q") ?? "").trim().slice(0, 200);
  const mode = params.get("mode") === "pe" ? "pe" : "ntfs";
  const offset = Math.max(0, Math.min(5_000_000, Number(params.get("offset")) || 0));
  const limit = 50;
  const pattern = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
  return cached(`search:${mode}:${Bun.hash(q)}:${offset}`, () => {
    if (mode === "pe") {
      const items = database().query("SELECT path,relative_path AS name,extension,bytes,sha256,machine,bits,import_module_count AS imports,export_count AS exports,parse_error FROM pe_artifacts WHERE relative_path LIKE ? ESCAPE '\\' ORDER BY relative_path LIMIT ? OFFSET ?").all(pattern, limit + 1, offset);
      return { items: items.slice(0, limit), more: items.length > limit, offset, limit, mode };
    }
    if (!has("ntfs_entries")) return { items: [], more: false, offset, limit, mode, pending: true };
    const items = has("ntfs_paths") ? database().query(`
      SELECT e.volume_id,e.record,e.parent_record,e.name,e.is_directory,e.attributes,NULL AS path
      FROM ntfs_entries e WHERE e.volume_id='C:' AND e.name LIKE ? ESCAPE '\\'
        AND NOT EXISTS(SELECT 1 FROM ntfs_paths p WHERE p.volume_id=e.volume_id AND p.file_record=e.record)
      UNION ALL SELECT volume_id,file_record AS record,NULL AS parent_record,path AS name,0 AS is_directory,0 AS attributes,path
      FROM ntfs_paths WHERE volume_id='C:' AND alias_complete=1 AND path LIKE ? ESCAPE '\\'
      ORDER BY name,record LIMIT ? OFFSET ?`).all(pattern,pattern,limit+1,offset) as any[]
      : database().query("SELECT volume_id,record,parent_record,name,is_directory,attributes FROM ntfs_entries WHERE volume_id='C:' AND name LIKE ? ESCAPE '\\' ORDER BY name,record LIMIT ? OFFSET ?").all(pattern,limit+1,offset) as any[];
    return { items: items.slice(0,limit).map(item=>({...item,name:item.path?item.path.split(/[\\/]/).at(-1):item.name,path:item.path??ntfsPath(item)})),more:items.length>limit,offset,limit,mode };
  }, 60);
}

export function omarBinary(req: Request) {
  const path = new URL(req.url).searchParams.get("path") ?? "";
  const row = database().query("SELECT path,relative_path,bytes,sha256,pe_kind,machine,bits,is_dotnet,section_count,import_module_count,import_symbol_count,export_count,imports_json,warnings_json,parse_error FROM pe_artifacts WHERE path=?").get(path) as any;
  if (!row) return Response.json({ error: "Binaire absent de l’index" }, { status: 404 });
  const imports = JSON.parse(row.imports_json);
  delete row.imports_json;
  const warnings = JSON.parse(row.warnings_json);
  delete row.warnings_json;
  return Response.json({ ...row, warnings, imports: imports.map((item: any) => ({ module: item.module, symbols: item.names?.length ?? 0, delay: Boolean(item.delayLoad) })), graph: has("pe_import_edges") ? database().query("SELECT * FROM pe_import_edges WHERE source_path=? LIMIT 100").all(path) : [] });
}

export function omarResources() {
  return has("omar_resources") ? database().query("SELECT id,kind,name,canonical_path,metadata_json FROM omar_resources ORDER BY kind,name").all() : [];
}

export async function omarGraph(req: Request) {
  const params = new URL(req.url).searchParams;
  const id = params.get("id");
  if (!has("nodes")) return { items: [], more: false, pending: true };
  if (id) {
    const node = database().query(`SELECT id,label,file,line,kind,provenance FROM nodes WHERE id=? AND ${codeScope}`).get(id) as any;
    if (!node) return Response.json({ error: "Nœud absent du graphe" }, { status: 404 });
    const neighbors = database().query("SELECT e.kind AS relation,n.id,n.label,n.file,n.line,n.kind FROM edges e JOIN nodes n ON n.id=CASE WHEN e.source=? THEN e.target ELSE e.source END WHERE e.source=? OR e.target=? LIMIT 100").all(id, id, id) as any[];
    const total = (database().query("SELECT count(*) AS n FROM edges WHERE source=? OR target=?").get(id, id) as { n: number }).n;
    return { ...node, name: node.label, path: node.file, relative_path: node.label, imports: neighbors.map(n => ({ id: n.id, module: n.label, symbols: 0 })), import_module_count: total, neighbors };
  }
  const q = (params.get("q") ?? "").slice(0, 200);
  const pattern = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
  const offset = Math.max(0, Math.min(5_000_000, Number(params.get("offset")) || 0));
  return cached(`code:${Bun.hash(q)}:${offset}`, () => {
    const items = database().query(`${currentSnapshots} SELECT n.id,n.label AS name,n.file AS path,n.line,n.kind,n.provenance FROM nodes n JOIN current_snapshots s ON n.repository_id=s.repository_id AND n.id>=s.id||':' AND n.id<s.id||';' WHERE (n.label LIKE ? ESCAPE '\\' OR n.file LIKE ? ESCAPE '\\') ORDER BY n.label,n.id LIMIT 51 OFFSET ?`).all(pattern, pattern, offset);
    return { items: items.slice(0, 50), more: items.length > 50, offset, limit: 50 };
  }, 30);
}

export async function omarCache() {
  try {
    const [size, info, metadata] = await Promise.all([redis().send("DBSIZE", []), redis().send("INFO", ["memory"]), redis().get("omar:metadata:manifest")]);
    const fields = Object.fromEntries(String(info).split(/\r?\n/).filter(line => line.includes(":")).map(line => { const i = line.indexOf(":"); return [line.slice(0, i), line.slice(i + 1)]; }));
    const manifest = metadata ? JSON.parse(metadata) : null;
    return { available: true, keys: size, memoryBytes: Number(fields.used_memory), maxmemoryBytes: Number(fields.maxmemory), policy: fields.maxmemory_policy, persistence: "AOF + RDB", backingStore: "SQLite", snapshot: manifest ? { complete: manifest.complete, rows: manifest.totalRows, chunks: manifest.totalChunks, tables: Object.keys(manifest.tables ?? {}).length, publishedAt: manifest.publishedAt, ttlSeconds: manifest.ttlSeconds } : null };
  } catch { return { available: false, backingStore: "SQLite", error: "Cache indisponible ; l’index SQLite reste consultable." }; }
}

export async function omarServices() {
  const response=await fetch("http://127.0.0.1:8797/health",{signal:AbortSignal.timeout(3000)});
  return response.json();
}

export async function omarChat(req: Request) {
  let input: { messages?: { role: string; content: string }[] };
  try { input = await req.json(); } catch { return Response.json({ error: "JSON invalide" }, { status: 400 }); }
  const messages = Array.isArray(input?.messages) ? input.messages.slice(-20).filter(m => m && ["user", "assistant"].includes(m.role) && typeof m.content === "string").map(m => ({ role: m.role, content: m.content })) : [];
  if (!messages.length || messages.at(-1)?.role !== "user" || !messages.at(-1)?.content.trim()) return Response.json({ error: "Message utilisateur requis" }, { status: 400 });
  if (messages.some(m => m.content.length > 32_000)) return Response.json({ error: "Un message dépasse la taille acceptée." }, { status: 413 });
  const key = (await Bun.file("C:/Users/omara/.aphrody/private/omar-server/llama-api-key.txt").text()).trim();
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${key}` };
  const template = { enable_thinking: false };
  let pruned = 0;
  // Native llama.cpp template/tokenizer count the actual prompt against its configured slot.
  // https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md
  try {
    const signal = AbortSignal.any([req.signal, AbortSignal.timeout(10_000)]);
    const props = await fetch("http://127.0.0.1:8081/props", { headers, signal }).then(async r => { if (!r.ok) throw new Error("props"); return r.json(); });
    const context = Number(props.default_generation_settings?.n_ctx);
    if (!Number.isFinite(context) || context < 768) throw new Error("context");
    while (true) {
      const rendered = await fetch("http://127.0.0.1:8081/apply-template", { method: "POST", headers, signal, body: JSON.stringify({ messages, chat_template_kwargs: template }) }).then(async r => { if (!r.ok) throw new Error("template"); return r.json(); });
      if (typeof rendered.prompt !== "string") throw new Error("prompt");
      const tokens = await fetch("http://127.0.0.1:8081/tokenize", { method: "POST", headers, signal, body: JSON.stringify({ content: rendered.prompt, add_special: true, parse_special: true }) }).then(async r => { if (!r.ok) throw new Error("tokenizer"); return r.json(); });
      if (!Array.isArray(tokens.tokens)) throw new Error("tokens");
      if (tokens.tokens.length + 512 + 16 <= context) break;
      if (messages.length === 1) return Response.json({ error: "Ce message dépasse le contexte du modèle local. Raccourcissez-le." }, { status: 413 });
      messages.shift(); pruned++;
      while (messages.length > 1 && messages[0].role !== "user") { messages.shift(); pruned++; }
    }
  } catch { return Response.json({ error: "Le serveur IA local ne peut pas préparer cette conversation." }, { status: 503 }); }
  const response = await fetch("http://127.0.0.1:8081/v1/chat/completions", {
    method: "POST", signal: req.signal, headers,
    body: JSON.stringify({ model: "omar-qwen3", messages, stream: true, max_tokens: 512, chat_template_kwargs: template }),
  });
  return new Response(response.body, { status: response.status, headers: { "Content-Type": response.headers.get("Content-Type") ?? "text/event-stream", "Cache-Control": "no-store", "X-Accel-Buffering": "no", "X-Omar-History-Pruned": String(pruned) } });
}
