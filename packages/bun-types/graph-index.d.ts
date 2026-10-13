declare module "bun:graph-index" {
  import type { BunPython } from "bun:graph";
  export interface IndexOptions {
    profile: "bun";
    /** Namespaces source IDs and repository IDs so several owners can share one registry. */
    namespace?: string;
    signal?: AbortSignal;
    revision?: string;
    concurrency?: number;
    /** Repository-relative, real directory roots to scan; defaults to `src` and `packages`. */
    surfaces?: string[];
    /** Repository-relative paths to omit, including all descendants. */
    excludePaths?: string[];
    domains?: string[];
    artifactDirectory?: string;
    maxFiles?: number;
    maxReadBytes?: number;
    maxFileBytes?: number;
    maxAstDepth?: number;
    filesPerChunk?: number;
    sourceBytesPerChunk?: number;
    maxNodes?: number;
    maxEdges?: number;
    maxSnapshotBytes?: number;
  }
  export interface IndexCoverage {
    files: number;
    nativeFiles: number;
    unresolvedFiles: number;
    metadataOnlyFiles: number;
    chunks: number;
    parseErrors: number;
    /** Symbol IDs that collide across files and were kept unresolved rather than discarded. */
    symbolIdCollisions: number;
    calls: number;
    unresolvedCalls: number;
    sourceBytes: number;
    hashedSourceBytes: number;
    resolutionScope: "domain-chunk";
  }
  export interface DomainResult {
    domain: string;
    surface: string;
    repository: string;
    source: `graph:${string}`;
    snapshot: string;
    sha256: string;
    inputSHA256: string;
    cached: boolean;
    nodes: number;
    edges: number;
    coverage: IndexCoverage;
    artifact?: string;
  }
  export interface IndexResult {
    root: string;
    profile: "bun";
    namespace: string;
    surfaces: string[];
    revision: string;
    dirty: boolean | null;
    producerSHA256: string;
    domains: DomainResult[];
  }
  /** Indexes explicit Bun source domains with native Rust extraction and immutable per-file facts. */
  export function indexCodebase(registry: BunPython, root: string, options: IndexOptions): Promise<IndexResult>;
}
