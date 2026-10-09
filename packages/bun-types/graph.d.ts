declare module "bun:graph" {
  import { Database } from "bun:sqlite";

  export const registryPath: string;
  export { BunPython as PyJS };

  export interface GraphNode {
    id: string;
    repository_id: string;
    kind: string;
    label: string;
    file: string | null;
    line: number | null;
    provenance: string;
    metadata: string;
  }
  export interface GraphSnapshot {
    id: string;
    repository_id: string;
    producer: string;
    revision: string | null;
    sha256: string;
    created_at: string;
    metadata: string;
  }
  export interface GraphFile {
    id: string;
    repository_id: string;
    path: string;
    sha256: string;
    language: string;
    bytes: number;
    metadata: string;
  }
  export type GraphDirection = "incoming" | "outgoing" | "both";
  export interface GraphNeighbor extends GraphNode {
    edge_id: string;
    edge_kind: string;
    edge_provenance: string;
    edge_confidence: number;
    edge_metadata: string;
    direction: GraphDirection;
  }
  export interface GraphPage {
    limit?: number;
    offset?: number;
  }
  export interface GraphScope {
    repositoryId: string;
    snapshotId?: string;
  }
  export interface GraphAdjacent {
    kind?: string;
    limit?: number;
    snapshotId?: string;
  }

  export class BunPython implements Disposable {
    readonly db: Database;
    readonly path: string;
    constructor(path?: string);
    repository(
      name: string,
      kind: string,
      root: string,
      revision?: string | null,
      metadata?: unknown,
      branch?: string | null,
    ): string;
    startRun(kind: string, command: string[], cwd: string, metadata?: unknown): string;
    finishRun(id: string, exitCode: number, stdout?: string, stderr?: string): void;
    sample(
      runId: string,
      name: string,
      implementation: string,
      sample: number,
      milliseconds: number,
      result?: string,
    ): void;
    event(kind: string, payload: unknown, runId?: string | null): void;
    artifact(path: string, kind: string, runId?: string | null, metadata?: unknown): Promise<string>;
    importGraph(
      repositoryId: string,
      graph: {
        nodes: Record<string, unknown>[];
        links?: Record<string, unknown>[];
        edges?: Record<string, unknown>[];
        [key: string]: unknown;
      },
      sha256: string,
      options?: { signal?: AbortSignal; batchSize?: number },
    ): Promise<{ nodes: number; edges: number; unresolved: number }>;
    getNode(id: string): GraphNode | null;
    queryNodes(
      options: GraphScope &
        GraphPage & {
          kind?: string;
          label?: string;
          file?: string;
          provenance?: string;
          search?: string;
          after?: string;
        },
    ): GraphNode[];
    snapshots(repositoryId: string, options?: GraphPage): GraphSnapshot[];
    getSnapshot(repositoryId: string, snapshotId?: string): GraphSnapshot | null;
    neighbors(id: string, options?: GraphAdjacent & { direction?: GraphDirection }): GraphNeighbor[];
    incoming(id: string, options?: GraphAdjacent): GraphNeighbor[];
    outgoing(id: string, options?: GraphAdjacent): GraphNeighbor[];
    traverse(
      id: string,
      options?: {
        direction?: GraphDirection;
        maxDepth?: number;
        nodeLimit?: number;
        workLimit?: number;
        kind?: string;
        signal?: AbortSignal;
      },
    ): Promise<{ nodes: (GraphNode & { depth: number })[]; truncated: boolean; steps: number }>;
    lookupFiles(
      repositoryId: string,
      options?: GraphPage & {
        path?: string;
        sha256?: string;
        language?: string;
        afterPath?: string;
      },
    ): GraphFile[];
    coverage(scope: GraphScope): {
      snapshot: GraphSnapshot | null;
      nodes: number;
      edges: number;
      nodeProvenance: Record<string, number>;
      edgeProvenance: Record<string, number>;
      unresolvedNodes: number;
    };
    queryRuns(
      options?: GraphPage & {
        kind?: string;
        status?: "running" | "passed" | "failed" | "interrupted";
      },
    ): Record<string, unknown>[];
    queryFixes(repositoryId: string, options?: GraphPage): Record<string, unknown>[];
    fix(
      repositoryId: string,
      summary: string,
      paths: string[],
      beforeRevision: string | null,
      afterRevision: string | null,
      validationRuns?: string[],
      metadata?: unknown,
    ): void;
    counts(): Record<
      | "repositories"
      | "files"
      | "nodes"
      | "edges"
      | "graph_snapshots"
      | "runs"
      | "samples"
      | "fixes"
      | "events"
      | "artifacts",
      number
    >;
    export(path?: string): Promise<string>;
    [Symbol.dispose](): void;
  }
}

declare module "buv:graph" {
  export * from "bun:graph";
}
declare module "pyjs:graph" {
  export * from "bun:graph";
}

declare module "bun:graphx" {
  import { Database } from "bun:sqlite";
  export interface SnapshotIdentity {
    repository: string;
    revision: string;
    sha256: string;
  }
  export interface JSONOptions {
    maxRowBytes?: number;
    maxBytes?: number;
    maxRows?: number;
    signal?: AbortSignal;
  }
  export class GraphRedisCache implements Disposable {
    readonly enabled: boolean;
    readonly prefix: string;
    readonly ttlSeconds: number;
    readonly maxBytes: number;
    readonly timeoutMs: number;
    constructor(options?: {
      url?: string;
      prefix?: string;
      ttlSeconds?: number;
      maxBytes?: number;
      timeoutMs?: number;
    });
    snapshotPrefix(scope: SnapshotIdentity): string;
    key(scope: SnapshotIdentity, query: string, parameters?: readonly unknown[]): string;
    remember<T>(
      scope: SnapshotIdentity,
      query: string,
      parameters: readonly unknown[],
      read: () => T | Promise<T>,
      signal?: AbortSignal,
    ): Promise<T>;
    invalidateSnapshot(scope: SnapshotIdentity, signal?: AbortSignal): Promise<{ removed: number; complete: boolean }>;
    clear(signal?: AbortSignal): Promise<{ removed: number; complete: boolean }>;
    close(): void;
    [Symbol.dispose](): void;
  }
  export function markdown(
    registry: { readonly db: Database },
    options?: { repository?: string; runId?: string; limit?: number },
  ): Promise<string>;
  export function html(source: string, title?: string): string;
  export function encodeJSON(value: unknown, maxBytes?: number): string;
  export function decodeJSON(input: string | Uint8Array, maxBytes?: number): unknown;
  export function jsonChunks(rows: Iterable<unknown>, options?: JSONOptions): Generator<string>;
  export function writeJSONRows(path: string, rows: Iterable<unknown>, options?: JSONOptions): Promise<string>;
}
declare module "buv:graphx" {
  export * from "bun:graphx";
}
declare module "pyjs:graphx" {
  export * from "bun:graphx";
}
