// SPDX-License-Identifier: Apache-2.0
import { Database } from "bun:sqlite";

export interface ExplorerOptions {
  /** Existing metadata index. No index or user data is opened by default. */
  databasePath?: string;
  /** Optional NTFS volume filter; omitted searches all indexed volumes. */
  volume?: string;
  /** Resource table in the supplied index. Default: resources. */
  resourcesTable?: string;
  servicesUrl?: string;
  redisUrl?: string;
  cacheManifestKey?: string;
  assistant?: {
    baseUrl: string;
    model: string;
    apiKey?: string;
    maxTokens?: number;
    llamaContext?: boolean;
  };
}

const unavailable = (feature: string) =>
  Response.json({ error: `${feature} is not configured` }, { status: 503 });
const escapeLike = (value: string) => `%${value.replace(/[\\%_]/g, "\\$&")}%`;

export function createExplorer(options: ExplorerOptions = {}) {
  let db: Database | undefined;
  let cache: Bun.RedisClient | undefined;
  const resourcesTable = options.resourcesTable ?? "resources";
  if (!/^[a-z_][a-z0-9_]*$/i.test(resourcesTable)) throw new Error("Invalid resources table name");
  for (const endpoint of [options.servicesUrl, options.assistant?.baseUrl]) {
    if (endpoint && !["http:", "https:"].includes(new URL(endpoint).protocol))
      throw new Error("Explorer endpoints require HTTP or HTTPS");
  }
  const database = () => (db ??= new Database(options.databasePath!, { readonly: true }));
  const has = (table: string) =>
    Boolean(
      database()
        .query("SELECT 1 FROM sqlite_master WHERE type IN ('table','view') AND name=?")
        .get(table),
    );
  const count = (table: string) =>
    has(table)
      ? (database().query(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n
      : 0;
  const latest =
    "WITH ranked AS (SELECT id,repository_id,row_number() OVER(PARTITION BY repository_id ORDER BY created_at DESC,id DESC) AS position FROM graph_snapshots), current AS (SELECT id,repository_id FROM ranked WHERE position=1)";
  const pathOf = (entry: any) => {
    const parts = [entry.name];
    let parent = entry.parent_record;
    const seen = new Set<string>();
    for (let depth = 0; depth < 256; depth++) {
      if (seen.has(String(parent))) break;
      seen.add(String(parent));
      const next = database()
        .query(
          "SELECT record,parent_record,name FROM ntfs_entries WHERE volume_id=? AND record=? LIMIT 1",
        )
        .get(entry.volume_id, parent) as any;
      if (!next || next.record === next.parent_record) break;
      parts.unshift(next.name);
      parent = next.parent_record;
    }
    return `${String(entry.volume_id).replace(/[:\\/]+$/, "")}:/${parts.join("/")}`;
  };
  async function chat(req: Request): Promise<Response> {
    const assistant = options.assistant;
    if (!assistant) return unavailable("Assistant");
    let input: any;
    try {
      input = await req.json();
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }
    if (
      !Array.isArray(input?.messages) ||
      input.messages.length === 0 ||
      input.messages.length > 20 ||
      input.messages.some(
        (m: any) => !m || !["user", "assistant"].includes(m.role) || typeof m.content !== "string",
      )
    )
      return Response.json(
        { error: "Expected up to 20 user and assistant messages" },
        { status: 400 },
      );
    const messages = input.messages.map((m: any) => ({ role: m.role, content: m.content }));
    if (messages.at(-1).role !== "user" || !messages.at(-1).content.trim())
      return Response.json({ error: "A user message is required" }, { status: 400 });
    if (messages.some((m: any) => m.content.length > 32_000))
      return Response.json({ error: "Message is too large" }, { status: 413 });
    const maxTokens = assistant.maxTokens ?? 512;
    if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 32_768)
      return Response.json({ error: "Invalid assistant token budget" }, { status: 503 });
    const headers = {
      "Content-Type": "application/json",
      ...(assistant.apiKey ? { Authorization: `Bearer ${assistant.apiKey}` } : {}),
    };
    const endpoint = (path: string) => `${assistant.baseUrl.replace(/\/$/, "")}/${path}`;
    const signal = AbortSignal.any([req.signal, AbortSignal.timeout(120_000)]);
    let pruned = 0;
    if (assistant.llamaContext) {
      const read = async (path: string, payload?: unknown) => {
        const response = await fetch(endpoint(path), {
          headers,
          signal,
          ...(payload ? { method: "POST", body: JSON.stringify(payload) } : {}),
        });
        if (!response.ok) throw new Error("Assistant context preparation failed");
        return response.json();
      };
      try {
        const props = await read("props");
        const context = Number(props.default_generation_settings?.n_ctx);
        if (!Number.isFinite(context) || context <= maxTokens + 16)
          throw new Error("Invalid assistant context");
        while (true) {
          const rendered = await read("apply-template", { messages });
          if (typeof rendered.prompt !== "string") throw new Error("Invalid rendered prompt");
          const tokens = await read("tokenize", {
            content: rendered.prompt,
            add_special: true,
            parse_special: true,
          });
          if (!Array.isArray(tokens.tokens)) throw new Error("Invalid token response");
          if (tokens.tokens.length + maxTokens + 16 <= context) break;
          if (messages.length === 1)
            return Response.json(
              { error: "Message exceeds the assistant context" },
              { status: 413 },
            );
          messages.shift();
          pruned++;
          while (messages.length > 1 && messages[0].role !== "user") {
            messages.shift();
            pruned++;
          }
        }
      } catch {
        return Response.json({ error: "Assistant context preparation failed" }, { status: 503 });
      }
    }
    const response = await fetch(endpoint("v1/chat/completions"), {
      method: "POST",
      headers,
      signal,
      body: JSON.stringify({
        model: assistant.model,
        messages,
        stream: true,
        max_tokens: maxTokens,
      }),
    });
    return new Response(response.body, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("Content-Type") ?? "text/event-stream",
        "Cache-Control": "no-store",
        "X-Accel-Buffering": "no",
        "X-WebOS-History-Pruned": String(pruned),
      },
    });
  }
  return {
    close: () => {
      db?.close();
      db = undefined;
      cache?.close();
      cache = undefined;
    },
    async handle(action: string, req: Request): Promise<Response> {
      if (action === "chat") return chat(req);
      if (action === "cache") {
        if (!options.redisUrl) return unavailable("Cache");
        try {
          cache ??= new Bun.RedisClient(options.redisUrl);
          const [size, info, metadata] = await Promise.all([
            cache.send("DBSIZE", []),
            cache.send("INFO", ["memory"]),
            options.cacheManifestKey ? cache.get(options.cacheManifestKey) : null,
          ]);
          const fields = Object.fromEntries(
            String(info)
              .split(/\r?\n/)
              .filter((line) => line.includes(":"))
              .map((line) => {
                const i = line.indexOf(":");
                return [line.slice(0, i), line.slice(i + 1)];
              }),
          );
          const manifest = metadata ? JSON.parse(metadata) : null;
          return Response.json({
            available: true,
            keys: size,
            memoryBytes: Number(fields.used_memory),
            maxmemoryBytes: Number(fields.maxmemory),
            policy: fields.maxmemory_policy,
            snapshot: manifest
              ? {
                  complete: manifest.complete,
                  rows: manifest.totalRows,
                  chunks: manifest.totalChunks ?? manifest.chunks?.length,
                  tables: Object.keys(manifest.tables ?? {}).length,
                  publishedAt: manifest.publishedAt,
                  ttlSeconds: manifest.ttlSeconds,
                }
              : null,
          });
        } catch {
          return Response.json(
            { available: false, error: "Configured cache is unavailable" },
            { status: 503 },
          );
        }
      }
      if (action === "services") {
        if (!options.servicesUrl) return unavailable("Services");
        const response = await fetch(options.servicesUrl, {
          signal: AbortSignal.any([req.signal, AbortSignal.timeout(3000)]),
        });
        if (!response.ok)
          return Response.json(
            { error: "Service health endpoint is unavailable" },
            { status: 502 },
          );
        return Response.json(await response.json());
      }
      if (action === "summary")
        return Response.json({
          configured: Boolean(options.databasePath),
          runtime: { version: Bun.version, revision: Bun.revision },
          assistant: Boolean(options.assistant),
          services: Boolean(options.servicesUrl),
          ...(options.databasePath
            ? {
                ntfs: { entries: count("ntfs_entries"), paths: count("ntfs_paths") },
                system32: {
                  binaries: count("pe_artifacts"),
                  importEdges: count("pe_import_edges"),
                },
                resources: count(resourcesTable),
                code: {
                  nodes: count("nodes"),
                  edges: count("edges"),
                  snapshots: count("graph_snapshots"),
                },
              }
            : {}),
        });
      if (!options.databasePath) return unavailable("Metadata index");
      const params = new URL(req.url).searchParams;
      const q = (params.get("q") ?? "").trim().slice(0, 200);
      const offset = Math.max(0, Math.min(5_000_000, Number(params.get("offset")) || 0));
      const pattern = escapeLike(q);
      if (action === "resources")
        return Response.json(
          has(resourcesTable)
            ? database()
                .query(
                  `SELECT id,kind,name,canonical_path,metadata_json FROM ${resourcesTable} ORDER BY kind,name`,
                )
                .all()
            : [],
        );
      if (action === "binary") {
        if (!has("pe_artifacts")) return unavailable("Binary index");
        const row = database()
          .query(
            "SELECT root,path,relative_path,bytes,sha256,metadata_json FROM pe_artifacts WHERE path=? ORDER BY root LIMIT 1",
          )
          .get(params.get("path") ?? "") as any;
        if (!row) return Response.json({ error: "Binary is not indexed" }, { status: 404 });
        const metadata = JSON.parse(row.metadata_json);
        delete row.metadata_json;
        return Response.json({
          ...row,
          metadata,
          warnings: metadata.warnings ?? [],
          import_module_count: metadata.imports?.length ?? 0,
          imports: (metadata.imports ?? []).map((item: any) => ({
            module: item.module,
            symbols: item.functions?.length ?? item.names?.length ?? 0,
            delay: Boolean(item.delay ?? item.delayLoad),
          })),
          graph: has("pe_import_edges")
            ? database()
                .query(
                  "SELECT module,resolved_path,status,metadata_json FROM pe_import_edges WHERE root=? AND source_path=? LIMIT 100",
                )
                .all(row.root, row.path)
            : [],
        });
      }
      if (action === "graph") {
        if (!has("nodes") || !has("edges") || !has("graph_snapshots"))
          return unavailable("Code graph");
        const id = params.get("id");
        if (id) {
          const node = database()
            .query("SELECT id,label,file,line,kind,provenance FROM nodes WHERE id=?")
            .get(id) as any;
          if (!node) return Response.json({ error: "Node is not indexed" }, { status: 404 });
          const neighbors = database()
            .query(
              "SELECT e.kind AS relation,n.id,n.label,n.file,n.line,n.kind FROM edges e JOIN nodes n ON n.id=CASE WHEN e.source=? THEN e.target ELSE e.source END WHERE e.source=? OR e.target=? LIMIT 100",
            )
            .all(id, id, id) as any[];
          return Response.json({
            ...node,
            name: node.label,
            path: node.file,
            relative_path: node.label,
            imports: neighbors.map((n) => ({ id: n.id, module: n.label })),
            neighbors,
            import_module_count: (
              database()
                .query("SELECT count(*) AS n FROM edges WHERE source=? OR target=?")
                .get(id, id) as { n: number }
            ).n,
          });
        }
        const items = database()
          .query(
            `${latest} SELECT n.id,n.label AS name,n.file AS path,n.line,n.kind,n.provenance FROM nodes n JOIN current s ON n.repository_id=s.repository_id AND n.id>=s.id||':' AND n.id<s.id||';' WHERE n.label LIKE ? ESCAPE '\\' OR n.file LIKE ? ESCAPE '\\' ORDER BY n.label,n.id LIMIT 51 OFFSET ?`,
          )
          .all(pattern, pattern, offset);
        return Response.json({
          items: items.slice(0, 50),
          more: items.length > 50,
          offset,
          limit: 50,
        });
      }
      if (action === "search") {
        const mode = params.get("mode") === "pe" ? "pe" : "ntfs";
        let items: any[];
        if (mode === "pe") {
          if (!has("pe_artifacts")) return unavailable("Binary index");
          items = database()
            .query(
              "SELECT root,path,relative_path AS name,bytes,metadata_json FROM pe_artifacts WHERE relative_path LIKE ? ESCAPE '\\' ORDER BY relative_path,root LIMIT 51 OFFSET ?",
            )
            .all(pattern, offset);
          items = items.map(({ metadata_json, ...item }) => {
            const metadata = JSON.parse(metadata_json);
            return {
              ...item,
              machine: metadata.machine,
              imports: metadata.imports?.length ?? 0,
              exports: metadata.exports?.length ?? 0,
            };
          });
        } else {
          if (!has("ntfs_entries")) return unavailable("Filesystem index");
          const volume = options.volume ?? null;
          items = has("ntfs_paths")
            ? database()
                .query(
                  "SELECT e.volume_id,e.record,e.parent_record,e.name,e.is_directory,e.attributes,NULL AS path FROM ntfs_entries e WHERE (? IS NULL OR e.volume_id=?) AND e.name LIKE ? ESCAPE '\\' AND NOT EXISTS(SELECT 1 FROM ntfs_paths p WHERE upper(substr(p.path,1,2))=upper(e.volume_id) AND p.record=e.record) UNION ALL SELECT upper(substr(path,1,2)) AS volume_id,record,NULL AS parent_record,path AS name,0 AS is_directory,0 AS attributes,path FROM ntfs_paths WHERE (? IS NULL OR upper(substr(path,1,2))=upper(?)) AND path LIKE ? ESCAPE '\\' ORDER BY name,record LIMIT 51 OFFSET ?",
                )
                .all(volume, volume, pattern, volume, volume, pattern, offset)
            : database()
                .query(
                  "SELECT volume_id,record,parent_record,name,is_directory,attributes FROM ntfs_entries WHERE (? IS NULL OR volume_id=?) AND name LIKE ? ESCAPE '\\' ORDER BY name,record LIMIT 51 OFFSET ?",
                )
                .all(volume, volume, pattern, offset);
          items = items.map((item) => ({
            ...item,
            name: item.path ? item.path.split(/[\\/]/).at(-1) : item.name,
            path: item.path ?? pathOf(item),
          }));
        }
        return Response.json({
          items: items.slice(0, 50),
          more: items.length > 50,
          offset,
          limit: 50,
          mode,
        });
      }
      return Response.json({ error: "Unknown explorer operation" }, { status: 404 });
    },
  };
}
