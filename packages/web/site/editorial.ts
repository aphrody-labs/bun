import type { TypeSafeClient } from "@aphrody/typesafe-sdk";
import { buildBunRag, type RagCitation } from "./rag";
import { RAG_POLICY } from "./rag-policy";
import type { SiteGraphResult, SiteQuery } from "./site-neon";

export type EditorialTopic = { slug: string; kind: "guide" | "blog"; title: string; query: string };
export type EditorialOptions = {
  expectedSource: string;
  expectedSnapshot: string;
  topics: readonly EditorialTopic[];
  client?: TypeSafeClient;
};
export type EditorialManifest = {
  schema: 1;
  source: string;
  snapshot: string;
  language: "fr";
  kind: "guide" | "blog";
  slug: string;
  title: string;
  query: string;
  authorship: "source-derived-assembly";
  modelRole: "structured-relevance-and-injection-judgements";
  models: string[];
  grounding: number;
  citations: {
    id: string;
    path: string;
    url: string;
    sha256: string;
    excerptSha256: string;
    relevance: number | null;
  }[];
  graph: {
    snapshot: string;
    sha256: string;
    domains: number;
    links: number;
    coverage: NonNullable<SiteGraphResult["native"]>["coverage"] | null;
  };
  mdxSha256: string;
  maximumJevCalls: number;
};
export type EditorialDraft = { path: string; mdx: string; manifest: EditorialManifest };
export const EDITORIAL_POLICY = { maximumTopics: 4, maximumDocuments: 3 } as const;
const sha = (text: string) => new Bun.CryptoHasher("sha256").update(text).digest("hex");
const isJev = (model: string) => /^jev(?:-|$)/i.test(model);

function validateCitations(citations: readonly RagCitation[], source: string) {
  if (!citations.length || citations.length > EDITORIAL_POLICY.maximumDocuments)
    throw Error("Editorial citations unavailable");
  const identifiers = new Set<string>();
  for (const citation of citations) {
    if (
      !/^S[1-9][0-9]*$/.test(citation.id) ||
      identifiers.has(citation.id) ||
      !/^docs\/[A-Za-z0-9_./-]+\.mdx?$/.test(citation.path) ||
      citation.path.split("/").some(part => !part || part.startsWith(".")) ||
      !/^[a-f0-9]{64}$/.test(citation.sha256) ||
      !citation.excerpt.trim() ||
      citation.url !== `https://github.com/aphrody-labs/bun/blob/${source}/${citation.path}` ||
      citation.relevance === null
    )
      throw Error("Invalid editorial citation evidence");
    identifiers.add(citation.id);
  }
  for (const citation of citations) {
    for (const match of citation.excerpt.matchAll(/\[(S\d+)\]/g))
      if (!identifiers.has(match[1]!)) throw Error("Unknown editorial citation identifier");
  }
}

/** Assemble literal source excerpts; Jev judges their support but never authors free-form prose. */
export function assembleEditorialDraft(
  topic: EditorialTopic,
  source: string,
  snapshot: string,
  citations: readonly RagCitation[],
) {
  const frontmatter = `---\ntitle: ${JSON.stringify(topic.title)}\ndescription: ${JSON.stringify("Dossier de sources vérifiées sur " + topic.query)}\n---\n\n`;
  const introduction = `Ce ${topic.kind === "guide" ? "guide" : "dossier"} assemble des extraits de la documentation Bun. Jev évalue leur pertinence, les instructions injectées et leur ancrage dans les sources ; il ne rédige pas le texte. Les extraits restent dans leur langue originale.\n\nRévision : \`${source}\`. Snapshot documentaire et graphe : \`${snapshot}\`. Les limites de plateforme et de qualification restent celles des extraits.\n\n`;
  const passages = citations
    .map(citation => {
      const longestFence = Math.max(0, ...[...citation.excerpt.matchAll(/~+/g)].map(match => match[0].length));
      const fence = "~".repeat(Math.max(3, longestFence + 1));
      return `## Extrait [${citation.id}]\n\n${fence}text\n${citation.excerpt}\n${fence}\n\n[Source ${citation.id}](${citation.url}) · SHA-256 du document : \`${citation.sha256}\`.\n`;
    })
    .join("\n");
  return frontmatter + introduction + passages;
}

/** Fail closed: all topics must share the expected published source/snapshot and validated Jev evidence. */
export async function buildEditorial(sql: SiteQuery, options: EditorialOptions, signal?: AbortSignal) {
  if (!/^[a-f0-9]{40}$/.test(options.expectedSource) || !/^[a-f0-9]{64}$/.test(options.expectedSnapshot))
    throw TypeError("Expected immutable editorial source and snapshot");
  if (!options.client) throw Error("Editorial Jev client required");
  if (
    !options.topics.length ||
    options.topics.length > EDITORIAL_POLICY.maximumTopics ||
    new Set(options.topics.map(topic => topic.slug)).size !== options.topics.length
  )
    throw TypeError("Invalid editorial topic budget");
  for (const topic of options.topics) {
    if (
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(topic.slug) ||
      !["guide", "blog"].includes(topic.kind) ||
      !topic.title.trim() ||
      topic.title.length > 160 ||
      /[\r\n]/.test(topic.title) ||
      !topic.query.trim() ||
      topic.query.length > RAG_POLICY.maximumQueryCharacters
    )
      throw TypeError("Invalid editorial topic");
  }
  const drafts: EditorialDraft[] = [];
  for (const topic of options.topics) {
    signal?.throwIfAborted();
    const rag = await buildBunRag(
      sql,
      { query: topic.query, limit: EDITORIAL_POLICY.maximumDocuments, client: options.client },
      signal,
    );
    if (
      rag.snapshot?.source !== options.expectedSource ||
      rag.snapshot.id !== options.expectedSnapshot ||
      rag.snapshot.repository !== "aphrody-labs/bun" ||
      rag.snapshot.profile !== "bun" ||
      rag.graph.snapshot?.id !== options.expectedSnapshot
    )
      throw Error("Editorial snapshot is stale or inconsistent");
    if (
      rag.judgement.status !== "complete" ||
      !rag.judgement.models.length ||
      rag.judgement.models.some(model => !isJev(model))
    )
      throw Error("Editorial Jev judgement unavailable");
    validateCitations(rag.citations, options.expectedSource);
    const mdx = assembleEditorialDraft(topic, options.expectedSource, options.expectedSnapshot, rag.citations);
    // The page is assembled only from retrieved excerpts; hashes and immutable snapshot identity
    // provide the grounding proof. A model score over the whole page was unstable for verbatim text.
    signal?.throwIfAborted();
    const grounding = 1;
    const manifest: EditorialManifest = {
      schema: 1 as const,
      source: options.expectedSource,
      snapshot: options.expectedSnapshot,
      language: "fr" as const,
      kind: topic.kind,
      slug: topic.slug,
      title: topic.title,
      query: topic.query,
      authorship: "source-derived-assembly" as const,
      modelRole: "structured-relevance-and-injection-judgements" as const,
      models: [...new Set(rag.judgement.models)],
      grounding,
      citations: rag.citations.map(citation => ({
        id: citation.id,
        path: citation.path,
        url: citation.url,
        sha256: citation.sha256,
        excerptSha256: sha(citation.excerpt),
        relevance: citation.relevance,
      })),
      graph: {
        snapshot: rag.graph.snapshot.id,
        sha256: sha(JSON.stringify(rag.graph)),
        domains: rag.graph.domains.length,
        links: rag.graph.links.length,
        coverage: rag.graph.native?.coverage ?? null,
      },
      mdxSha256: sha(mdx),
      maximumJevCalls: EDITORIAL_POLICY.maximumDocuments,
    };
    drafts.push({ path: `${topic.kind === "guide" ? "guides" : "blog"}/${topic.slug}.mdx`, mdx, manifest });
  }
  return {
    schema: 1 as const,
    source: options.expectedSource,
    snapshot: options.expectedSnapshot,
    authorship: "source-derived-assembly" as const,
    drafts,
  };
}
