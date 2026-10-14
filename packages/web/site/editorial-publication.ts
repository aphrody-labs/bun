import { lstatSync, realpathSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { assembleEditorialDraft, EDITORIAL_POLICY, type EditorialTopic, type EditorialManifest } from "./editorial";
import type { RagCitation } from "./rag";
import { RAG_POLICY } from "./rag-policy";
import { parseFrontmatter } from "./mdx";

const sha = (text: string) => new Bun.CryptoHasher("sha256").update(text).digest("hex");
type DraftManifest = EditorialManifest;
export type PublishedEditorial = {
  path: string;
  title: string;
  description: string;
  markdown: string;
  mdx: string;
  manifest: DraftManifest;
  manifestSha256: string;
};

/** Offline publication accepts only the exact validated source-derived assembler output. */
export async function loadEditorialDirectory(directory: string, expectedSource: string) {
  const root = resolve(directory);
  if (lstatSync(root).isSymbolicLink() || !lstatSync(root).isDirectory()) throw Error("Invalid editorial directory");
  const canonicalRoot = realpathSync(root);
  const read = async (path: string, maximum: number) => {
    const file = join(root, path),
      info = lstatSync(file);
    if (
      !info.isFile() ||
      info.isSymbolicLink() ||
      info.size < 1 ||
      info.size > maximum ||
      !realpathSync(file).startsWith(canonicalRoot + sep)
    )
      throw Error("Invalid editorial input file");
    const bytes = await Bun.file(file).bytes();
    if (bytes.length !== info.size || bytes.length > maximum) throw Error("Editorial input changed while reading");
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  };
  const receiptText = await read("editorial.json", 256 * 1024),
    receipt = JSON.parse(receiptText);
  if (
    receipt.schema !== 1 ||
    receipt.source !== expectedSource ||
    !/^[a-f0-9]{40}$/.test(receipt.source) ||
    !/^[a-f0-9]{64}$/.test(receipt.snapshot) ||
    receipt.qualified !== true ||
    receipt.validator !== "bun:yolo" ||
    receipt.authorship !== "source-derived-assembly" ||
    !Number.isInteger(receipt.calls) ||
    receipt.calls < 1 ||
    receipt.calls > EDITORIAL_POLICY.maximumTopics * (EDITORIAL_POLICY.maximumDocuments + 1) ||
    !Array.isArray(receipt.drafts) ||
    !receipt.drafts.length ||
    receipt.drafts.length > EDITORIAL_POLICY.maximumTopics
  )
    throw Error("Unqualified or stale editorial receipt");
  const paths = new Set<string>(),
    pages: PublishedEditorial[] = [];
  for (const draft of receipt.drafts) {
    if (!/^(guides|blog)\/[a-z0-9]+(?:-[a-z0-9]+)*\.mdx$/.test(draft.path) || paths.has(draft.path))
      throw Error("Invalid editorial publication path");
    paths.add(draft.path);
    const manifest = draft.manifest as DraftManifest;
    if (
      manifest.schema !== 1 ||
      manifest.source !== expectedSource ||
      manifest.snapshot !== receipt.snapshot ||
      manifest.language !== "fr" ||
      manifest.authorship !== "source-derived-assembly" ||
      manifest.modelRole !== "structured-relevance-injection-and-grounding-judgements" ||
      manifest.kind !== (draft.path.startsWith("guides/") ? "guide" : "blog") ||
      draft.path !== `${manifest.kind === "guide" ? "guides" : "blog"}/${manifest.slug}.mdx` ||
      !Array.isArray(manifest.models) ||
      !manifest.models.length ||
      manifest.models.some(model => typeof model !== "string" || !/^jev(?:-|$)/i.test(model)) ||
      !Number.isFinite(manifest.grounding) ||
      manifest.grounding < RAG_POLICY.minimumGrounding ||
      manifest.grounding > 1 ||
      !/^[a-f0-9]{64}$/.test(manifest.mdxSha256) ||
      manifest.graph?.snapshot !== receipt.snapshot ||
      !/^[a-f0-9]{64}$/.test(manifest.graph.sha256) ||
      !Array.isArray(manifest.citations) ||
      !manifest.citations.length ||
      manifest.citations.length > EDITORIAL_POLICY.maximumDocuments
    )
      throw Error("Invalid editorial evidence manifest");
    if (
      typeof manifest.title !== "string" ||
      !manifest.title.trim() ||
      manifest.title.length > 160 ||
      /[\r\n]/.test(manifest.title) ||
      typeof manifest.query !== "string" ||
      !manifest.query.trim() ||
      manifest.query.length > RAG_POLICY.maximumQueryCharacters
    )
      throw Error("Invalid editorial publication metadata");
    const sidecar = await read(draft.path + ".json", 64 * 1024);
    if (JSON.stringify(JSON.parse(sidecar)) !== JSON.stringify(manifest))
      throw Error("Editorial sidecar does not match its receipt");
    const mdx = await read(draft.path, 64 * 1024);
    if (sha(mdx) !== manifest.mdxSha256) throw Error("Editorial MDX hash mismatch");
    const excerpts = [...mdx.matchAll(/^(~{3,})text\n([\s\S]*?)\n\1$/gm)].map(match => match[2]!);
    if (excerpts.length !== manifest.citations.length) throw Error("Invalid editorial source excerpts");
    const citations: RagCitation[] = manifest.citations.map((citation, index) => {
      if (
        citation.id !== `S${index + 1}` ||
        !/^docs\/[A-Za-z0-9_./-]+\.mdx?$/.test(citation.path) ||
        citation.path.split("/").some(part => !part || part.startsWith(".")) ||
        citation.url !== `https://github.com/aphrody-labs/bun/blob/${expectedSource}/${citation.path}` ||
        !/^[a-f0-9]{64}$/.test(citation.sha256) ||
        sha(excerpts[index]!) !== citation.excerptSha256 ||
        typeof citation.relevance !== "number" ||
        citation.relevance < RAG_POLICY.minimumRelevance ||
        citation.relevance > 1
      )
        throw Error("Invalid editorial publication citation");
      return { ...citation, title: "", excerpt: excerpts[index]! };
    });
    const topic: EditorialTopic = {
      slug: manifest.slug,
      kind: manifest.kind,
      title: manifest.title,
      query: manifest.query,
    };
    if (assembleEditorialDraft(topic, expectedSource, receipt.snapshot, citations) !== mdx)
      throw Error("Editorial content is not the source-derived assembler output");
    const coverage = manifest.graph.coverage;
    if (
      ![manifest.graph.domains, manifest.graph.links].every(value => Number.isSafeInteger(value) && value >= 0) ||
      (coverage !== null &&
        (![coverage.nodes, coverage.edges, coverage.sourceNodes, coverage.sourceEdges].every(
          value => Number.isSafeInteger(value) && value >= 0,
        ) ||
          typeof coverage.truncated !== "boolean"))
    )
      throw Error("Invalid editorial graph coverage");
    const publicManifest: DraftManifest = {
      schema: 1,
      source: expectedSource,
      snapshot: receipt.snapshot,
      language: "fr",
      kind: manifest.kind,
      slug: manifest.slug,
      title: manifest.title,
      query: manifest.query,
      authorship: "source-derived-assembly",
      modelRole: "structured-relevance-injection-and-grounding-judgements",
      models: [...manifest.models],
      grounding: manifest.grounding,
      citations: manifest.citations.map(({ id, path, url, sha256, excerptSha256, relevance }) => ({
        id,
        path,
        url,
        sha256,
        excerptSha256,
        relevance,
      })),
      graph: {
        snapshot: receipt.snapshot,
        sha256: manifest.graph.sha256,
        domains: manifest.graph.domains,
        links: manifest.graph.links,
        coverage:
          coverage === null
            ? null
            : {
                nodes: coverage.nodes,
                edges: coverage.edges,
                sourceNodes: coverage.sourceNodes,
                sourceEdges: coverage.sourceEdges,
                truncated: coverage.truncated,
              },
      },
      mdxSha256: manifest.mdxSha256,
      maximumJevCalls: EDITORIAL_POLICY.maximumDocuments + 1,
    };
    const parsed = parseFrontmatter(mdx);
    pages.push({
      path: "/" + draft.path.replace(/\.mdx$/, ""),
      title: manifest.title,
      description: String(parsed.data.description ?? ""),
      markdown: parsed.body,
      mdx,
      manifest: publicManifest,
      manifestSha256: sha(sidecar),
    });
  }
  return {
    pages,
    source: receipt.source as string,
    snapshot: receipt.snapshot as string,
    receiptSha256: sha(receiptText),
    validator: "bun:yolo" as const,
  };
}
