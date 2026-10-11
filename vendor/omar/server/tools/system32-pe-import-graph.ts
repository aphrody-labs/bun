import windows from "bun:windows";
import { Database } from "bun:sqlite";
import { readFile, writeFile } from "node:fs/promises";

const dbPath = "C:/SSH/omar/server/var/index/omar.sqlite";
const provenancePath = "C:/SSH/omar/server/var/index/system32-pe-index-provenance.json";
const schemaPath = "C:/Windows/System32/apisetschema.dll";
const db = new Database(dbPath);
db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=30000; PRAGMA synchronous=NORMAL;");
const schemaBytes = await readFile(schemaPath);
const schemaPe = windows.pe.parse(schemaBytes, schemaPath);
const schemaSection = schemaPe.sections.find((s: any) => s.name === ".apiset");
if (!schemaSection) throw new Error("apisetschema.dll has no .apiset section");
const apiSetBytes = schemaBytes.subarray(schemaSection.rawOffset, schemaSection.rawOffset + schemaSection.rawSize);
const apiMap = windows.pe.parseApiSetSchema(apiSetBytes);
const apiMapNormalized = new Map([...apiMap].map(([key, hosts]: [string, string[]]) => [key.toLowerCase().replace(/\.dll$/i, ""), hosts]));
const ensureModuleExtension = (name: string) => /\.[^./\\]+$/.test(name) ? name.toLowerCase() : `${name.toLowerCase()}.dll`;
const sourceRows = db.query("SELECT path,imports_json FROM pe_artifacts ORDER BY path").all() as Array<{ path: string; imports_json: string }>;
const pathByBase = new Map<string, string[]>();
for (const row of db.query("SELECT path FROM pe_artifacts ORDER BY path").all() as Array<{ path: string }>) {
  const base = row.path.slice(row.path.lastIndexOf("\\") + 1).toLowerCase();
  const list = pathByBase.get(base) ?? [];
  list.push(row.path);
  pathByBase.set(base, list);
}

const existing = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='pe_import_edges'").get();
if (existing) {
  const cols = db.query("PRAGMA table_info(pe_import_edges)").all() as Array<{ name: string }>;
  const required = ["source_path", "import_ordinal", "module_name", "api_set_key", "resolved_path", "resolution_status", "symbols_json"];
  if (!required.every((name) => cols.some((col) => col.name === name))) {
    db.close();
    throw new Error("Existing pe_import_edges has an unexpected schema; no mutation made");
  }
} else {
  db.exec(`CREATE TABLE pe_import_edges (
    source_path TEXT NOT NULL, import_ordinal INTEGER NOT NULL, module_name TEXT NOT NULL,
    delay_import INTEGER NOT NULL, symbol_count INTEGER NOT NULL, symbols_json TEXT NOT NULL,
    api_set_key TEXT, api_set_hosts_json TEXT, resolved_module TEXT, resolved_path TEXT,
    resolved_paths_json TEXT NOT NULL, resolution_status TEXT NOT NULL,
    PRIMARY KEY(source_path, import_ordinal)
  )`);
}
db.exec(`CREATE INDEX IF NOT EXISTS idx_pe_import_edges_source ON pe_import_edges(source_path);
CREATE INDEX IF NOT EXISTS idx_pe_import_edges_module ON pe_import_edges(module_name);
CREATE INDEX IF NOT EXISTS idx_pe_import_edges_resolved ON pe_import_edges(resolved_path);
CREATE INDEX IF NOT EXISTS idx_pe_import_edges_status ON pe_import_edges(resolution_status);`);

const edges: Array<Record<string, unknown>> = [];
for (const source of sourceRows) {
  const imports = JSON.parse(source.imports_json) as Array<{ module: string; delay?: boolean; functions?: string[] }>;
  for (let ordinal = 0; ordinal < imports.length; ordinal++) {
    const imp = imports[ordinal];
    const moduleName = String(imp.module ?? "").toLowerCase();
    const looksApiSet = /^(api-ms-win-|ext-ms-)/i.test(moduleName);
    let apiKey: string | null = null;
    let apiHosts: string[] = [];
    let resolvedModule = moduleName;
    let candidates: string[] = [];
    let selectedPath: string | null = null;
    let status = "direct_unresolved";
    if (looksApiSet) {
      apiKey = windows.pe.apiSetKey(moduleName).toLowerCase().replace(/\.dll$/i, "");
      apiHosts = apiMapNormalized.get(apiKey) ?? [];
      if (apiHosts.length) {
        const hostCandidates = apiHosts.flatMap((host) => {
          const normalizedHost = ensureModuleExtension(host);
          return (pathByBase.get(normalizedHost) ?? []).map((path) => ({ host: normalizedHost, path }));
        });
        candidates = [...new Set(hostCandidates.map((x) => x.path))];
        resolvedModule = ensureModuleExtension(apiHosts[0]);
        const preferred = hostCandidates.filter((x) => x.host === resolvedModule).map((x) => x.path);
        const preferredRoot = preferred.filter((p) => !p.slice("C:\\Windows\\System32\\".length).includes("\\"));
        if (preferredRoot.length === 1) { selectedPath = preferredRoot[0]; status = "apiset_default_resolved"; }
        else if (preferred.length === 1) { selectedPath = preferred[0]; status = "apiset_default_resolved"; }
        else if (preferred.length > 1) status = "apiset_default_ambiguous";
        else if (candidates.length) { selectedPath = candidates[0]; status = "apiset_alternate_host_resolved"; }
        else {
          const rootHostPath = `C:/Windows/System32/${resolvedModule}`;
          if (!resolvedModule.includes("/") && !resolvedModule.includes("\\") && await Bun.file(rootHostPath).exists()) {
            selectedPath = rootHostPath;
            candidates = [rootHostPath];
            status = "apiset_default_present_unindexed";
          } else status = "apiset_host_missing";
        }
      } else status = "apiset_contract_unmapped";
    } else {
      candidates = pathByBase.get(moduleName) ?? [];
      const rootCandidates = candidates.filter((p) => !p.slice("C:\\Windows\\System32\\".length).includes("\\"));
      if (rootCandidates.length === 1) { selectedPath = rootCandidates[0]; status = "direct_root_resolved"; }
      else if (rootCandidates.length > 1) status = "direct_root_ambiguous";
      else if (candidates.length === 1) { selectedPath = candidates[0]; status = "direct_resolved"; }
      else if (candidates.length > 1) status = "direct_ambiguous";
      else if (!moduleName.includes("/") && !moduleName.includes("\\") && await Bun.file(`C:/Windows/System32/${moduleName}`).exists()) {
        selectedPath = `C:/Windows/System32/${moduleName}`;
        candidates = [selectedPath];
        status = "direct_present_unindexed";
      }
    }
    edges.push({
      source_path: source.path,
      import_ordinal: ordinal,
      module_name: moduleName,
      delay_import: Number(Boolean(imp.delay)),
      symbol_count: Array.isArray(imp.functions) ? imp.functions.length : 0,
      symbols_json: JSON.stringify(imp.functions ?? []),
      api_set_key: apiKey,
      api_set_hosts_json: apiHosts.length ? JSON.stringify(apiHosts) : null,
      resolved_module: looksApiSet ? resolvedModule : moduleName,
      resolved_path: selectedPath,
      resolved_paths_json: JSON.stringify(candidates),
      resolution_status: status,
    });
  }
}

const insert = db.prepare(`INSERT INTO pe_import_edges (
  source_path,import_ordinal,module_name,delay_import,symbol_count,symbols_json,api_set_key,
  api_set_hosts_json,resolved_module,resolved_path,resolved_paths_json,resolution_status
) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
ON CONFLICT(source_path,import_ordinal) DO UPDATE SET
  module_name=excluded.module_name,delay_import=excluded.delay_import,symbol_count=excluded.symbol_count,
  symbols_json=excluded.symbols_json,api_set_key=excluded.api_set_key,api_set_hosts_json=excluded.api_set_hosts_json,
  resolved_module=excluded.resolved_module,resolved_path=excluded.resolved_path,
  resolved_paths_json=excluded.resolved_paths_json,resolution_status=excluded.resolution_status`);
for (let offset = 0; offset < edges.length; offset += 250) {
  const batch = edges.slice(offset, offset + 250);
  db.transaction(() => {
    for (const e of batch) insert.run(e.source_path,e.import_ordinal,e.module_name,e.delay_import,e.symbol_count,e.symbols_json,e.api_set_key,e.api_set_hosts_json,e.resolved_module,e.resolved_path,e.resolved_paths_json,e.resolution_status);
  })();
}
const total = db.query("SELECT COUNT(*) AS edges,SUM(symbol_count) AS symbols,SUM(delay_import) AS delay_edges,SUM(CASE WHEN api_set_key IS NOT NULL THEN 1 ELSE 0 END) AS api_set_edges,SUM(CASE WHEN resolved_path IS NOT NULL THEN 1 ELSE 0 END) AS resolved_edges FROM pe_import_edges").get();
const statuses = db.query("SELECT resolution_status,COUNT(*) AS count FROM pe_import_edges GROUP BY resolution_status ORDER BY resolution_status").all();
const integrity = db.query("PRAGMA quick_check").get() as { quick_check: string };
const provenance = JSON.parse(await readFile(provenancePath, "utf8"));
provenance.apiSet = { source: schemaPath, section: ".apiset", sectionBytes: schemaSection.rawSize, contracts: apiMap.size, parser: "bun:windows.pe.parseApiSetSchema", version: new DataView(apiSetBytes.buffer, apiSetBytes.byteOffset, apiSetBytes.byteLength).getUint32(0, true) };
provenance.importGraph = { table: "pe_import_edges", ...total, statuses, integrity: integrity.quick_check };
await writeFile(provenancePath, JSON.stringify(provenance, null, 2) + "\n");
db.close();
console.log(JSON.stringify({ dbPath, sourceBinaries: sourceRows.length, edgesBuilt: edges.length, apiSetContracts: apiMap.size, total, statuses, integrity: integrity.quick_check }));

