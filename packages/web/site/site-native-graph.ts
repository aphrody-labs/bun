import type { Database } from "bun:sqlite";
import { publicSourcePath } from "./public-site-snapshot";

export type PublicNativeGraph = {
  sources: { domain: string; graph_sha256: string; revision: string; producer_sha256: string }[];
  nodes: {
    id: string;
    domain: string;
    kind: string;
    label: string;
    path: string;
    line: number | null;
    file_sha256: string;
    provenance: "EXTRACTED";
  }[];
  edges: { source: string; target: string; kind: string; provenance: string; confidence: number }[];
  coverage: {
    sourceNodes: number;
    sourceEdges: number;
    nodes: number;
    edges: number;
    maximumNodes: number;
    maximumEdges: number;
    truncated: boolean;
  };
};
export const nativeGraphLimits = { nodes: 40_000, edges: 80_000 } as const;
type NativeIndex = {
  profile: string;
  namespace: string;
  producerSHA256: string;
  revision: string;
  domains: { domain: string; repository: string; snapshot: string; sha256: string }[];
};

export function readPublicNativeGraph(db: Database, source: string, index: NativeIndex): PublicNativeGraph {
  if (
    index.profile !== "bun" ||
    index.namespace !== "bun" ||
    !/^[a-f0-9]{64}$/.test(index.producerSHA256) ||
    index.revision !== source ||
    index.domains.length > 10_000
  )
    throw new Error("Native graph index differs from its Bun source snapshot");
  const graph: PublicNativeGraph = {
    sources: [],
    nodes: [],
    edges: [],
    coverage: {
      sourceNodes: 0,
      sourceEdges: 0,
      nodes: 0,
      edges: 0,
      maximumNodes: nativeGraphLimits.nodes,
      maximumEdges: nativeGraphLimits.edges,
      truncated: false,
    },
  };
  const ids = new Map<string, string>();
  const sha = (id: string) => new Bun.CryptoHasher("sha256").update(id).digest("hex");
  const priority = (domain: string) => {
    const primary = ["src/runtime", "src/js", "packages/bun-video", "packages/bun-plugin-neon", "packages/web"];
    const index = primary.indexOf(domain);
    return index >= 0 ? index : domain.startsWith("src/") ? 10 : 20;
  };
  const ordered = [...index.domains].sort(
    (a, b) => priority(a.domain) - priority(b.domain) || a.domain.localeCompare(b.domain),
  );
  const scopes: { repository: string; namespace: string; end: string }[] = [];
  for (const selected of ordered) {
    if (!publicSourcePath(selected.domain)) continue;
    const row = db
      .query<
        {
          sha256: string;
          revision: string;
          metadata: string;
          repository_metadata: string;
          repository_revision: string;
        },
        [string, string]
      >(
        `SELECT s.sha256,s.revision,s.metadata,r.metadata AS repository_metadata,r.revision AS repository_revision
       FROM graph_snapshots s JOIN repositories r ON r.id=s.repository_id WHERE s.id=? AND s.repository_id=?`,
      )
      .get(selected.snapshot, selected.repository);
    if (!row) throw new Error("Selected native graph snapshot is absent");
    const saved = JSON.parse(row.metadata),
      repository = JSON.parse(row.repository_metadata),
      metadata = saved.graph;
    if (
      row.sha256 !== selected.sha256 ||
      !/^[a-f0-9]{64}$/.test(row.sha256) ||
      row.revision !== source ||
      row.repository_revision !== source ||
      repository.profile !== "bun" ||
      repository.domain !== selected.domain ||
      metadata?.scope?.profile !== "bun" ||
      metadata.domain !== selected.domain ||
      repository.source !== metadata.scope.source ||
      metadata.scope.source !== `graph:bun:${selected.domain.replaceAll("/", ":")}` ||
      metadata.producerSHA256 !== index.producerSHA256 ||
      !/^[a-f0-9]{64}$/.test(metadata.producerSHA256) ||
      saved.namespace !== `${selected.repository}:graph:${selected.sha256}:` ||
      !Number.isSafeInteger(saved.nodes) ||
      !Number.isSafeInteger(saved.edges)
    )
      throw new Error("Native graph namespace, source, profile or producer hash differs");
    const scope = {
      repository: selected.repository,
      namespace: saved.namespace,
      end: saved.namespace.slice(0, -1) + ";",
    };
    scopes.push(scope);
    graph.sources.push({
      domain: selected.domain,
      graph_sha256: selected.sha256,
      revision: source,
      producer_sha256: metadata.producerSHA256,
    });
    graph.coverage.sourceNodes += saved.nodes;
    graph.coverage.sourceEdges += saved.edges;
    const remaining = nativeGraphLimits.nodes - graph.nodes.length;
    if (!remaining) continue;
    for (const node of db
      .query<
        { id: string; kind: string; label: string; path: string; line: number | null; file_sha256: string },
        [string, string, string, number]
      >(
        `SELECT n.id,n.kind,substr(n.label,1,4096) AS label,n.file AS path,n.line,f.sha256 AS file_sha256
       FROM nodes n JOIN release_files f ON f.path=n.file WHERE n.repository_id=? AND n.id>=? AND n.id<?
       AND n.provenance='EXTRACTED' AND f.sha256 IS NOT NULL ORDER BY n.id LIMIT ?`,
      )
      .iterate(scope.repository, scope.namespace, scope.end, remaining)) {
      if (!publicSourcePath(node.path) || !/^[a-f0-9]{64}$/.test(node.file_sha256)) continue;
      const id = sha(node.id);
      ids.set(node.id, id);
      graph.nodes.push({ ...node, id, domain: selected.domain, provenance: "EXTRACTED" });
    }
  }
  const edgeKeys = new Set<string>();
  for (const scope of scopes) {
    const remaining = nativeGraphLimits.edges - graph.edges.length;
    if (!remaining) break;
    for (const edge of db
      .query<PublicNativeGraph["edges"][number], [string, string, string, number]>(
        "SELECT source,target,kind,provenance,confidence FROM edges WHERE repository_id=? AND id>=? AND id<? ORDER BY id LIMIT ?",
      )
      .iterate(scope.repository, scope.namespace, scope.end, remaining)) {
      const source = ids.get(edge.source),
        target = ids.get(edge.target);
      if (!source || !target) continue;
      const key = JSON.stringify([source, target, edge.kind, edge.provenance]);
      if (edgeKeys.has(key)) continue;
      edgeKeys.add(key);
      graph.edges.push({ ...edge, source, target });
    }
  }
  graph.coverage.nodes = graph.nodes.length;
  graph.coverage.edges = graph.edges.length;
  graph.coverage.truncated =
    graph.nodes.length < graph.coverage.sourceNodes || graph.edges.length < graph.coverage.sourceEdges;
  return graph;
}
