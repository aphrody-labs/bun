import { mkdir } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import type { ForkCapabilities } from "./fork-capabilities.ts";
import { writeGraphDocs } from "./graph-docs.ts";

export async function exportForkGraphDocs(
  root: string,
  catalog: ForkCapabilities,
  options: { out: string; domains?: string[]; signal?: AbortSignal },
) {
  if (!isAbsolute(options.out)) throw new Error("--graph-docs must be an absolute staging directory");
  options.signal?.throwIfAborted();
  await mkdir(options.out, { recursive: true });
  const [{ BunPython }, { indexCodebase }] = await Promise.all([import("bun:graph"), import("bun:graph-index")]);
  using registry = new BunPython(join(options.out, "fork-graph.sqlite"));
  const index = await indexCodebase(registry, root, {
    profile: "bun",
    revision: catalog.source.revision,
    concurrency: 2,
    artifactDirectory: join(options.out, "snapshots"),
    ...(options.domains ? { domains: options.domains } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
  });
  const documents = [];
  for (const domain of index.domains) {
    options.signal?.throwIfAborted();
    const docs = await writeGraphDocs(registry, {
      workspace: root,
      repositoryId: domain.repository,
      snapshotId: domain.snapshot,
      domain: domain.domain,
      source: domain.source,
      profile: "bun",
      out: join(options.out, "docs"),
      maxRows: 10000,
      maxBytes: 64 * 1024 * 1024,
      ...(options.signal ? { signal: options.signal } : {}),
    });
    documents.push({ domain: domain.domain, source: domain.source, snapshot: domain.snapshot, out: docs.out });
  }
  const evidence = {
    schema: "bun-fork-native-docs/1",
    catalogSHA256: new Bun.CryptoHasher("sha256").update(JSON.stringify(catalog)).digest("hex"),
    source: catalog.source,
    coverage: catalog.coverage,
    runtime: { version: Bun.version, revision: Bun.revision },
    index,
    documents,
    capabilities: {
      catalog: "complete registered modules, scoped manifests, native library owners and committed source delta",
      graph: "native extraction with per-file hashes and explicit unsupported/metadata-only coverage",
      docs: "immutable Markdown, MDX, HTML, skill and JSON evidence with bounded tables",
      publication: false,
    },
  };
  await Bun.write(join(options.out, "evidence.json"), JSON.stringify(evidence, null, 2) + "\n");
  return evidence;
}
