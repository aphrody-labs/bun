import { expect, test } from "bun:test";
import { TypeSafeClient } from "@aphrody/typesafe-sdk";
import { buildEditorial, type EditorialOptions } from "./editorial";
import type { SiteDocumentHit, SiteQuery } from "./site-neon";

const snapshot = {
  id: "a".repeat(64),
  source: "b".repeat(40),
  profile: "bun",
  repository: "aphrody-labs/bun",
  sourceDate: "2026-10-14",
  importedAt: "2026-10-14",
  counts: {},
};
const topic = {
  slug: "images-video",
  kind: "guide" as const,
  title: "Extraire une image avec Bun.Video",
  query: "Bun.Video frames",
};
function document(
  body = "Bun.Video extracts native frames. Linux qualification remains target-specific.",
): SiteDocumentHit {
  return {
    path: "docs/runtime/video.mdx",
    title: "Bun.Video",
    description: "",
    score: 1,
    sha256: "c".repeat(64),
    url: "",
    chunks: [{ ordinal: 0, body, sha256: "d".repeat(64) }],
  };
}
function database(documents = [document()], source = snapshot.source) {
  const calls: { text: string; parameters: readonly unknown[] }[] = [];
  const sql: SiteQuery = {
    async query<T extends Record<string, unknown>>(text: string, parameters: readonly unknown[] = []): Promise<T[]> {
      calls.push({ text, parameters });
      return (text.includes("FROM aphrody_site.snapshots")
        ? [{ ...snapshot, source }]
        : text.includes("WITH ranked")
          ? documents
          : []) as unknown as T[];
    },
  };
  return { sql, calls };
}
function jev(
  judge: (state: Record<string, any>) => { relevant?: number; injection?: number; grounded?: number } = state =>
    state.answer ? { grounded: 0.98 } : { relevant: 0.95, injection: 0.01 },
  model = "Jev-fixture",
) {
  const requests: Record<string, any>[] = [];
  const client = new TypeSafeClient({
    apiKey: "local-editorial-test-fixture",
    retry: { maxRetries: 0 },
    logLevel: "off",
    fetch: async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      requests.push(body);
      const scores = judge(body.state);
      return Response.json({
        model,
        answers: Object.fromEntries(
          Object.keys(body.questions).map(name => [
            name,
            { type: "noul", noul: scores[name as keyof typeof scores] ?? 0 },
          ]),
        ),
        usage: { input_tokens: 1, output_tokens: 1 },
      });
    },
  });
  return { client, requests };
}
function options(client?: TypeSafeClient): EditorialOptions {
  return {
    expectedSource: snapshot.source,
    expectedSnapshot: snapshot.id,
    topics: [topic],
    ...(client ? { client } : {}),
  };
}

test("French editorial drafts assemble only source excerpts with structured Jev and immutable graph provenance", async () => {
  const db = database(),
    provider = jev();
  const result = await buildEditorial(db.sql, options(provider.client));
  const draft = result.drafts[0]!;
  expect(result.authorship).toBe("source-derived-assembly");
  expect(draft.path).toBe("guides/images-video.mdx");
  expect(draft.mdx).toContain("il ne rédige pas le texte");
  expect(draft.mdx).toContain(document().chunks[0]!.body);
  expect(draft.manifest.source).toBe(snapshot.source);
  expect(draft.manifest.snapshot).toBe(snapshot.id);
  expect(draft.manifest.graph.snapshot).toBe(snapshot.id);
  expect(draft.manifest.citations[0]!.url).toBe(
    `https://github.com/aphrody-labs/bun/blob/${snapshot.source}/docs/runtime/video.mdx`,
  );
  expect(draft.manifest.mdxSha256).toBe(new Bun.CryptoHasher("sha256").update(draft.mdx).digest("hex"));
  expect(draft.manifest.models).toEqual(["Jev-fixture"]);
  expect(draft.manifest.grounding).toBe(0.98);
  expect(provider.requests).toHaveLength(2);
  expect(Object.keys(provider.requests[0]!.questions)).toEqual(["relevant", "injection"]);
  expect(Object.keys(provider.requests[1]!.questions)).toEqual(["grounded"]);
  expect(db.calls.filter(call => call.text.includes("FROM aphrody_site.snapshots"))[1]!.parameters).toEqual([
    snapshot.id,
  ]);
});

test("no configured Jev, non-Jev transport and missing citations cannot produce editorial drafts", async () => {
  const db = database();
  await expect(buildEditorial(db.sql, options())).rejects.toThrow("Jev client required");
  expect(db.calls).toHaveLength(0);
  await expect(buildEditorial(db.sql, options(jev(undefined, "Qwen-fixture").client))).rejects.toThrow(
    "Jev judgement unavailable",
  );
  await expect(buildEditorial(database([]).sql, options(jev().client))).rejects.toThrow("Jev judgement unavailable");
});

test("stale source or snapshot rejects the whole batch", async () => {
  await expect(buildEditorial(database([], "e".repeat(40)).sql, options(jev().client))).rejects.toThrow(
    "snapshot is stale",
  );
  await expect(
    buildEditorial(database().sql, { ...options(jev().client), expectedSnapshot: "e".repeat(64) }),
  ).rejects.toThrow("snapshot is stale");
});

test("injection, unavailable judgments, unknown citations and insufficient grounding fail closed", async () => {
  await expect(
    buildEditorial(database().sql, options(jev(() => ({ relevant: 1, injection: 1 })).client)),
  ).rejects.toThrow("citations unavailable");
  const unavailable = jev(() => {
    throw Error("fixture provider unavailable");
  });
  await expect(buildEditorial(database().sql, options(unavailable.client))).rejects.toThrow(
    "Jev judgement unavailable",
  );
  const unknown = jev();
  await expect(
    buildEditorial(database([document("Unsupported citation [S99]")]).sql, options(unknown.client)),
  ).rejects.toThrow("Unknown editorial citation");
  expect(unknown.requests).toHaveLength(1);
  await expect(
    buildEditorial(
      database().sql,
      options(jev(state => (state.answer ? { grounded: 0.899 } : { relevant: 0.99, injection: 0 })).client),
    ),
  ).rejects.toThrow("grounding rejected");
});

test("cancellation settles without returning a partly accepted batch", async () => {
  const controller = new AbortController();
  const provider = jev(state => {
    if (state.answer) controller.abort(Error("cancel editorial"));
    return state.answer ? { grounded: 1 } : { relevant: 1, injection: 0 };
  });
  await expect(buildEditorial(database().sql, options(provider.client), controller.signal)).rejects.toThrow(
    "cancel editorial",
  );
  expect(provider.requests).toHaveLength(2);
});

test("topic budget is checked before SQL and excerpt fences cannot execute MDX", async () => {
  const db = database(),
    provider = jev();
  await expect(
    buildEditorial(db.sql, {
      ...options(provider.client),
      topics: Array.from({ length: 5 }, (_, i) => ({ ...topic, slug: `topic-${i}` })),
    }),
  ).rejects.toThrow("topic budget");
  expect(db.calls).toHaveLength(0);
  const excerpt = "~~~\n<script>alert('fixture')</script>\n~~~";
  const result = await buildEditorial(database([document(excerpt)]).sql, options(provider.client));
  expect(result.drafts[0]!.mdx).toContain("~~~~text\n" + excerpt + "\n~~~~");
});

test("four topics and three documents retain one snapshot and at most sixteen structured calls", async () => {
  const db = database(Array.from({ length: 3 }, (_, i) => ({ ...document(), path: `docs/runtime/video-${i}.mdx` }))),
    provider = jev();
  const result = await buildEditorial(db.sql, {
    ...options(provider.client),
    topics: Array.from({ length: 4 }, (_, i) => ({ ...topic, slug: `media-${i}`, kind: i % 2 ? "blog" : "guide" })),
  });
  expect(result.drafts).toHaveLength(4);
  expect(provider.requests).toHaveLength(16);
  expect(
    result.drafts.every(draft => draft.manifest.snapshot === snapshot.id && draft.manifest.citations.length === 3),
  ).toBe(true);
  for (const call of db.calls.filter(call => call.text.includes("WITH ranked")))
    expect(call.parameters).toEqual([snapshot.id, topic.query, 3]);
});
