import type { PublicNativeGraph } from "./site-native-graph";

export type PublicSiteDocument = {
  path: string;
  title: string;
  description: string;
  sha256: string;
  chunks: { ordinal: number; body: string; sha256: string }[];
};
export type PublicSiteSnapshot = {
  schema: 1;
  profile: "bun";
  repository: "aphrody-labs/bun";
  source: string;
  sourceDate: string;
  manifestSHA256: string;
  documents: PublicSiteDocument[];
  domains: { name: string; files: number }[];
  links: { source: string; target: string; references_count: number }[];
  nativeGraph?: PublicNativeGraph;
  releases: {
    tag: string;
    name: string;
    url: string;
    publishedAt: string;
    prerelease: boolean;
    assets: { name: string; url: string; size: number }[];
  }[];
};

const protectedPart =
  /(?:^|\/)(?:\.{1,2}|\.[^/]+|cookies|credentials|secrets|sessions|datasets|databases|models|weights|node_modules)(?:\/|$)/i;
export function publicSourcePath(path: string): boolean {
  return /^(?:docs|src|packages|scripts)(?:\/[A-Za-z0-9_.-]+)*$/.test(path) && !protectedPart.test(path);
}
export function validatePublicSiteSnapshot(value: PublicSiteSnapshot): void {
  if (
    value.schema !== 1 ||
    value.profile !== "bun" ||
    value.repository !== "aphrody-labs/bun" ||
    !/^[a-f0-9]{40}$/.test(value.source) ||
    !/^[a-f0-9]{64}$/.test(value.manifestSHA256) ||
    !Number.isFinite(Date.parse(value.sourceDate))
  )
    throw new TypeError("Public site snapshot needs an immutable Bun source and manifest hash");
  if (
    value.documents.length > 10_000 ||
    value.domains.length > 10_000 ||
    value.links.length > 100_000 ||
    value.releases.length > 100
  )
    throw new RangeError("Public site snapshot exceeds its row budget");
  const paths = new Set<string>(),
    domains = new Set<string>(),
    tags = new Set<string>();
  let bytes = 0;
  for (const doc of value.documents) {
    if (
      !publicSourcePath(doc.path) ||
      !/^docs\/.+\.mdx?$/.test(doc.path) ||
      paths.has(doc.path) ||
      !/^[a-f0-9]{64}$/.test(doc.sha256) ||
      doc.chunks.length > 256
    )
      throw new TypeError("Invalid public documentation record");
    paths.add(doc.path);
    bytes += new TextEncoder().encode(doc.title + doc.description).length;
    for (const [index, chunk] of doc.chunks.entries()) {
      const size = new TextEncoder().encode(chunk.body).length;
      if (chunk.ordinal !== index || size > 16384 || !/^[a-f0-9]{64}$/.test(chunk.sha256))
        throw new TypeError("Invalid public documentation chunk");
      bytes += size;
    }
  }
  for (const domain of value.domains) {
    if (
      !publicSourcePath(domain.name) ||
      domains.has(domain.name) ||
      !Number.isSafeInteger(domain.files) ||
      domain.files < 0
    )
      throw new TypeError("Invalid public graph domain");
    domains.add(domain.name);
  }
  for (const link of value.links)
    if (
      !domains.has(link.source) ||
      !domains.has(link.target) ||
      !Number.isSafeInteger(link.references_count) ||
      link.references_count < 1
    )
      throw new TypeError("Invalid public graph relation");
  if (value.nativeGraph) {
    const native = value.nativeGraph,
      sourceDomains = new Set(native.sources.map(source => source.domain)),
      nodeIds = new Set<string>();
    if (native.nodes.length > 40000 || native.edges.length > 80000 || sourceDomains.size !== native.sources.length)
      throw new RangeError("Native graph projection exceeds its bound");
    for (const source of native.sources)
      if (
        !publicSourcePath(source.domain) ||
        source.revision !== value.source ||
        !/^[a-f0-9]{64}$/.test(source.graph_sha256) ||
        !/^[a-f0-9]{64}$/.test(source.producer_sha256)
      )
        throw new TypeError("Invalid native graph source");
    for (const node of native.nodes) {
      if (
        !sourceDomains.has(node.domain) ||
        !publicSourcePath(node.path) ||
        !/^[a-f0-9]{64}$/.test(node.id) ||
        nodeIds.has(node.id) ||
        node.provenance !== "EXTRACTED" ||
        !/^[a-f0-9]{64}$/.test(node.file_sha256) ||
        Buffer.byteLength(node.label) > 16384 ||
        (node.line !== null && (!Number.isSafeInteger(node.line) || node.line < 1))
      )
        throw new TypeError("Invalid public native graph node");
      nodeIds.add(node.id);
    }
    for (const edge of native.edges)
      if (
        !nodeIds.has(edge.source) ||
        !nodeIds.has(edge.target) ||
        !Number.isFinite(edge.confidence) ||
        edge.confidence < 0 ||
        edge.confidence > 1
      )
        throw new TypeError("Invalid public native graph edge");
  }
  function publicURL(value: string): boolean {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash;
    } catch {
      return false;
    }
  }
  for (const release of value.releases) {
    if (
      !release.tag ||
      tags.has(release.tag) ||
      !publicURL(release.url) ||
      !Number.isFinite(Date.parse(release.publishedAt)) ||
      release.assets.length > 1000
    )
      throw new TypeError("Invalid public release fact");
    tags.add(release.tag);
    for (const asset of release.assets)
      if (!publicURL(asset.url) || !Number.isSafeInteger(asset.size) || asset.size < 0)
        throw new TypeError("Invalid public release asset");
  }
  if (bytes > 32 * 1024 * 1024) throw new RangeError("Public site documents exceed their byte budget");
}
