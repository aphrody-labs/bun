import { expect, test } from "bun:test";
import { BunPython } from "bun:graph";
import { join } from "node:path";
import { tempDir } from "../../test/harness";
import { graphIndexerProvenance, indexCodebase } from "./graph-index";

test("the source frontend keeps a real Rust type/import collision unresolved across chunks", async () => {
  using directory = tempDir("graph-index-source-collision", {
    "src/runtime/a.rs": "pub struct Reader { pub file: File }",
    "src/runtime/b.rs": "use std::fs::File;\npub fn helper(){}",
  });
  const root = String(directory);
  using registry = new BunPython(join(root, "graph.sqlite"));
  const result = await indexCodebase(registry, root, {
    profile: "bun",
    revision: "a".repeat(40),
    concurrency: 1,
    filesPerChunk: 1,
    maxFiles: 10,
    artifactDirectory: join(root, "snapshots"),
  });
  expect(result.domains[0]!.coverage.symbolIdCollisions).toBe(1);
  const node = registry.db
    .query<{ provenance: string; metadata: string }, []>(
      "SELECT provenance,metadata FROM nodes WHERE id LIKE '%:symbol:file'",
    )
    .get()!;
  expect(node.provenance).toBe("UNRESOLVED");
  const evidence = JSON.parse(node.metadata);
  expect(evidence.unresolvedReason).toBe("native-symbol-id-collision");
  expect(evidence.conflicts).toContainEqual({
    source_file: null,
    source_location: null,
    file_type: "concept",
    label: "file",
  });
});

test("frontend and backend receipts keep separate source and executable identities", async () => {
  const receipt = await graphIndexerProvenance();
  expect(receipt.frontend.sourceRevision).toMatch(/^[a-f0-9]{40}$/);
  expect(receipt.frontend.sha256).toBe(
    new Bun.CryptoHasher("sha256")
      .update(await Bun.file(join(import.meta.dir, "../../src/js/bun/graph-index.ts")).bytes())
      .digest("hex"),
  );
  expect(receipt.nativeBackend.revision).toBe(Bun.revision);
  expect(receipt.nativeBackend.sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(receipt.changedBinaryQualified).toBe(false);
});
