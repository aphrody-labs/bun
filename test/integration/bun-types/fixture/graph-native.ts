import { executeGraph, type GraphInput } from "bun:graph-native";

// Input defaults and serialized output differ in src/graph/api.rs.
const graph: GraphInput = {
  nodes: [
    { id: "source", label: "source" },
    { id: "target", label: "target" },
  ],
  edges: [{ source: "source", target: "target", relation: "calls", confidence: "EXTRACTED" }],
};

async function serializedOutput() {
  const response = await executeGraph({ op: "export", scope: { source: "graph:types", profile: "bun" }, graph });
  const output = response.result.graph;
  const root: string | null = output.root;
  const revision: string | null = output.built_at_commit;
  for (const node of output.nodes) {
    const kind: "code" | "document" | "concept" | "rationale" = node.file_type;
    const source: string | null = node.source_file;
    const community: number | null = node.community;
    const language: string | null = node.lang;
    void [kind, source, community, language];
  }
  for (const link of output.links) {
    const score: number = link.confidence_score;
    const weight: number = link.weight;
    const context: string | null = link.context;
    void [score, weight, context];
  }
  void [root, revision];
}

void serializedOutput;
