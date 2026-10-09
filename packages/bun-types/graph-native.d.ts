declare module "bun:graph-native" {
  export interface GraphScope {
    source: `graph:${string}`;
    profile: string;
  }
  export interface GraphLimits {
    max_files?: number;
    max_file_bytes?: number;
    max_source_bytes?: number;
    max_nodes?: number;
    max_edges?: number;
    max_ast_depth?: number;
    max_output_bytes?: number;
  }
  export type GraphConfidence = "EXTRACTED" | "INFERRED" | "AMBIGUOUS";
  export interface GraphNode {
    id: string;
    label: string;
    file_type?: "code" | "document" | "concept" | "rationale";
    source_file?: string | null;
    source_location?: string | null;
    lang?: string | null;
    community?: number | null;
    community_name?: string | null;
    package?: string | null;
  }
  export interface GraphLink {
    source: string;
    target: string;
    relation: string;
    confidence: GraphConfidence;
    confidence_score?: number;
    weight?: number;
    source_file?: string | null;
    source_location?: string | null;
    context?: string | null;
  }
  export interface GraphDocument {
    nodes: GraphNode[];
    links: GraphLink[];
    root?: string | null;
    built_at_commit?: string | null;
  }
  export type GraphInput = Omit<GraphDocument, "links"> &
    ({ links: GraphLink[]; edges?: never } | { edges: GraphLink[]; links?: never });
  export interface GraphSourceFile {
    path: string;
    content: string;
  }
  export interface GraphPackages {
    package_of?: Record<string, string>;
    package_dir?: Record<string, string>;
  }
  export interface GraphRequestBase {
    scope: GraphScope;
    limits?: GraphLimits;
  }
  export type GraphOperation =
    | {
        op: "build";
        files: GraphSourceFile[];
        packages?: GraphPackages;
        root?: string | null;
        built_at_commit?: string | null;
      }
    | {
        op: "query";
        graph: GraphInput;
        question: string;
        depth?: number;
        budget_tokens?: number;
        starts?: number;
        relations?: string[];
      }
    | { op: "path"; graph: GraphInput; from: string; to: string; directed?: boolean; relations?: string[] }
    | { op: "explain"; graph: GraphInput; node: string }
    | { op: "analyze"; graph: GraphInput; top?: number }
    | { op: "export"; graph: GraphInput };
  export type GraphRequest = GraphRequestBase & GraphOperation;
  export interface GraphBuildStats {
    calls: number;
    same_file: number;
    cross_file: number;
    external: number;
    unresolved: number;
    stubs_folded: number;
    imports_resolved: number;
    imports_external: number;
  }
  export interface GraphPathHop {
    node: string;
    edge: GraphLink | null;
    forward: boolean | null;
  }
  export interface GraphExplanation {
    label: string;
    id: string;
    source: string | null;
    kind: string;
    package: string | null;
    community: string | null;
    degree: number;
    connections: {
      direction: "incoming" | "outgoing";
      other: string;
      relation: string;
      confidence: GraphConfidence;
      at: string | null;
    }[];
  }
  export interface GraphResultMap {
    build: {
      op: "build";
      graph: GraphDocument;
      stats: GraphBuildStats;
      parse_errors: { path: string; error: string }[];
    };
    query: { op: "query"; graph: GraphDocument; starts: string[]; truncated: number; text: string };
    path: { op: "path"; hops: GraphPathHop[] | null };
    explain: { op: "explain"; explanation: GraphExplanation };
    analyze: { op: "analyze"; graph: GraphDocument; modularity: number; god_nodes: { id: string; degree: number }[] };
    export: { op: "export"; graph: GraphDocument };
  }
  export interface GraphResponse<R extends GraphRequest = GraphRequest> {
    scope: GraphScope;
    result: GraphResultMap[R["op"]];
  }
  /** Runs Rust extraction and graph algorithms in a worker. At most four jobs run; excess jobs reject. */
  export function executeGraph<R extends GraphRequest>(
    request: R,
    options?: { signal?: AbortSignal },
  ): Promise<GraphResponse<R>>;
  /** @internal Worker transport; jobs must be released by their registering owner. */
  export function __nativeGraph(action: "execute", id: string, input: string): string;
  /** @internal */
  export function __nativeGraph(action: "start" | "cancel" | "release", id: string, input: string): boolean;
}
