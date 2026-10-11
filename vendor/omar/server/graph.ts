import { BunPython, type GraphNode, type GraphSnapshot } from "bun:graph";

const DB_PATH = "C:/SSH/omar/server/var/index/omar.sqlite";
const SCOPES = ["omar-strict", "bun-os", "aphrody"] as const;
type ScopeName = (typeof SCOPES)[number];
const HARD_LIMIT = 1000;
const DEFAULT_LIMIT = 100;

type Args = { command: string; positional: string[]; options: Map<string, string | true> };

function parseArgs(argv: string[]): Args {
  const positional: string[] = [];
  const options = new Map<string, string | true>();
  for (let index = 0; index < argv.length; index++) {
    const item = argv[index]!;
    if (!item.startsWith("--")) { positional.push(item); continue; }
    const equal = item.indexOf("=");
    const key = item.slice(2, equal < 0 ? undefined : equal);
    if (!key) throw new Error("Option vide");
    if (!["scope","repository","limit","offset","direction","depth","kind","search","history","help"].includes(key)) throw new Error(`Option inconnue: --${key}`);
    if (options.has(key)) throw new Error(`Option répétée: --${key}`);
    if (["history","help"].includes(key)) {
      if (equal >= 0) throw new Error(`--${key} ne prend pas de valeur`);
      options.set(key,true); continue;
    }
    if (equal >= 0) options.set(key, item.slice(equal + 1));
    else if (argv[index + 1] && !argv[index + 1]!.startsWith("--")) options.set(key, argv[++index]!);
    else options.set(key, true);
  }
  return { command: positional.shift() ?? "status", positional, options };
}

function option(args: Args, name: string, fallback?: string): string | undefined {
  const value = args.options.get(name);
  if (value === true) throw new Error(`--${name} exige une valeur`);
  return value ?? fallback;
}

function numberOption(args: Args, name: string, fallback: number, maximum: number): number {
  const raw = option(args, name);
  if (raw === undefined) return fallback;
  if (!/^\d+$/.test(raw)) throw new Error(`--${name} doit être un entier positif`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) throw new Error(`--${name} doit être entre 1 et ${maximum}`);
  return value;
}

function selectedScope(args: Args): ScopeName {
  const value = option(args, "scope", "omar-strict")!;
  if (!(SCOPES as readonly string[]).includes(value)) throw new Error(`Scope invalide: ${value}. Choix: ${SCOPES.join(", ")}`);
  return value as ScopeName;
}

function safeText(value: unknown, max = 240): string | null {
  if (typeof value !== "string") return null;
  return value.replace(/[\r\n\t]+/g, " ").slice(0, max);
}

function nodeView(node: GraphNode & { depth?: number }) {
  return {
    id: node.id,
    repository: node.repository_id,
    kind: safeText(node.kind, 80),
    label: safeText(node.label),
    file: safeText(node.file, 500),
    line: node.line,
    provenance: node.provenance,
    ...(node.depth === undefined ? {} : { depth: node.depth }),
  };
}

function snapshotView(snapshot: GraphSnapshot) {
  let metadata: Record<string, unknown> = {};
  try { metadata = JSON.parse(snapshot.metadata); } catch { /* malformed metadata is omitted */ }
  const graph = typeof metadata.graph === "object" && metadata.graph !== null ? metadata.graph as Record<string, unknown> : {};
  const coverage = typeof graph.coverage === "object" && graph.coverage !== null ? graph.coverage as Record<string, unknown> : {};
  return {
    id: snapshot.id,
    repository: snapshot.repository_id,
    producer: safeText(snapshot.producer, 120),
    revision: safeText(snapshot.revision, 100),
    createdAt: snapshot.created_at,
    nodes: typeof metadata.nodes === "number" ? metadata.nodes : null,
    edges: typeof metadata.edges === "number" ? metadata.edges : null,
    files: typeof coverage.files === "number" ? coverage.files : null,
    parseErrors: typeof coverage.parseErrors === "number" ? coverage.parseErrors : null,
  };
}

function repoRows(db: BunPython, scope: ScopeName, limit = HARD_LIMIT) {
  return db.db.query<{ id: string; name: string; kind: string; root: string; revision: string | null }, [string, number]>(
    "SELECT id,name,kind,root,revision FROM repositories WHERE id GLOB ? ORDER BY id LIMIT ?",
  ).all(`source:${scope}/*`, limit);
}

function latestSnapshots(db: BunPython, scope: ScopeName, repoFilter?: string) {
  const repos = repoRows(db, scope);
  const selected = repoFilter ? repos.filter(row => row.id === repoFilter || row.name === repoFilter || row.id.endsWith(`/${repoFilter}`)) : repos;
  if (repoFilter && selected.length === 0) throw new Error(`Dépôt absent du scope ${scope}: ${repoFilter}`);
  return selected.map(repo => ({ repo, snapshot: db.getSnapshot(repo.id) })).filter((item): item is { repo: typeof repos[number]; snapshot: GraphSnapshot } => item.snapshot !== null);
}

function help() {
  console.log(`bun graph [commande] [options]

Commandes (status par défaut, lecture seule):
  status                         Dernier snapshot par dépôt et totaux actuels
  repositories                   Dépôts indexés dans le scope
  snapshots                      Derniers snapshots, ou historique avec --history
  nodes [--search texte]         Parcourir les nœuds du snapshot courant
  search <texte>                  Recherche de labels dans les snapshots courants
  neighbors <node-id>            Voisins immédiats
  traverse <node-id>             Parcours borné du graphe
  index                           Indexer le scope via server/source-graph-index.ts

Options: --scope omar-strict|bun-os|aphrody (défaut omar-strict)
         --repository <id|nom> --limit 1..1000 (défaut 100) --offset n
         --direction incoming|outgoing|both --depth 1..3 (défaut 2)
         --kind <type> --history (snapshots seulement)

Sorties limitées aux métadonnées de graphe; aucun contenu de fichier n'est affiché.`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (["help", "-h", "--help"].includes(args.command) || args.options.has("help")) { help(); return; }
  const scope = selectedScope(args);
  const limit = numberOption(args, "limit", DEFAULT_LIMIT, HARD_LIMIT);
  const offsetRaw = option(args, "offset", "0")!;
  if (!/^\d+$/.test(offsetRaw) || Number(offsetRaw) > HARD_LIMIT) throw new Error(`--offset doit être entre 0 et ${HARD_LIMIT}`);
  const offset = Number(offsetRaw);
  const repoFilter = option(args, "repository");
  if (args.command === "index") {
    const child = Bun.spawn({cmd:[process.execPath, "--no-env-file", "server/source-graph-index.ts", "--source", scope], cwd:"C:/SSH/omar", stdin:"inherit", stdout:"inherit", stderr:"inherit"});
    const code = await child.exited;
    if (code !== 0) process.exitCode = code;
    return;
  }
  using db = new BunPython(DB_PATH);
  const current = latestSnapshots(db, scope, repoFilter);
  if (args.command === "status") {
    const snapshots = current.map(({ snapshot }) => snapshotView(snapshot));
    console.log(JSON.stringify({ scope, repositories: current.length, currentSnapshots: snapshots.length,
      nodes: snapshots.reduce((sum, item) => sum + (item.nodes ?? 0), 0),
      edges: snapshots.reduce((sum, item) => sum + (item.edges ?? 0), 0), snapshots: snapshots.slice(offset, offset + limit) }, null, 2));
    return;
  }
  if (args.command === "repositories") {
    console.log(JSON.stringify(repoRows(db, scope, Math.min(HARD_LIMIT, offset + limit)).slice(offset, offset + limit).map(repo => ({ id: repo.id, name: repo.name, kind: repo.kind, root: repo.root, revision: repo.revision,
      snapshot: db.getSnapshot(repo.id) ? snapshotView(db.getSnapshot(repo.id)!) : null })), null, 2));
    return;
  }
  if (args.command === "snapshots") {
    const rows = repoFilter ? current : latestSnapshots(db, scope);
    const result = args.options.has("history")
      ? rows.flatMap(({ repo }) => db.snapshots(repo.id, { limit: Math.min(limit, 100), offset })).slice(0, limit).map(snapshotView)
      : rows.slice(offset, offset + limit).map(({ snapshot }) => snapshotView(snapshot));
    console.log(JSON.stringify({ scope, snapshots: result }, null, 2));
    return;
  }
  if (["nodes", "search"].includes(args.command)) {
    const search = args.command === "search" ? args.positional.join(" ").trim() : option(args, "search");
    if (args.command === "search" && !search) throw new Error("Fournis un texte à rechercher");
    const results: GraphNode[] = [];
    let skip = offset;
    for (const { repo, snapshot } of current) {
      const batch = db.queryNodes({ repositoryId: repo.id, snapshotId: snapshot.id, limit: Math.min(HARD_LIMIT * 2, limit + offset), offset: 0, search, kind: option(args, "kind") });
      if (skip >= batch.length) { skip -= batch.length; continue; }
      results.push(...batch.slice(skip)); skip = 0;
      if (results.length >= limit) break;
    }
    console.log(JSON.stringify({ scope, count: Math.min(results.length,limit), limit, nodes: results.slice(0, limit).map(nodeView) }, null, 2));
    return;
  }
  if (args.command === "neighbors" || args.command === "traverse") {
    const id = args.positional[0];
    if (!id) throw new Error(`${args.command} exige un node-id`);
    const direction = option(args, "direction", "both") as "incoming" | "outgoing" | "both";
    if (!( ["incoming", "outgoing", "both"] as string[]).includes(direction)) throw new Error("--direction invalide");
    const base = db.getNode(id);
    if (!base || !current.some(({ repo, snapshot }) => repo.id === base.repository_id && id >= JSON.parse(snapshot.metadata).namespace && id < JSON.parse(snapshot.metadata).namespace.slice(0, -1) + ";")) {
      throw new Error("Nœud absent des snapshots courants du scope choisi");
    }
    if (args.command === "neighbors") {
      const neighbors = db.neighbors(id, { direction, limit, kind: option(args, "kind"), snapshotId: current.find(item => item.repo.id === base.repository_id)!.snapshot.id });
      console.log(JSON.stringify({ scope, node: id, count: neighbors.length, neighbors: neighbors.map(item => ({ ...nodeView(item), edgeKind: safeText(item.edge_kind, 80), direction: item.direction })) }, null, 2));
    } else {
      const depth = numberOption(args, "depth", 2, 3);
      const result = await db.traverse(id, { direction, maxDepth: depth, nodeLimit: limit, workLimit: Math.min(20_000, limit * depth * 4), kind: option(args, "kind") });
      console.log(JSON.stringify({ scope, ...result, nodes: result.nodes.map(nodeView) }, null, 2));
    }
    return;
  }
  throw new Error(`Commande inconnue: ${args.command}. Utilise bun graph help.`);
}

main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
