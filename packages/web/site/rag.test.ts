import { expect, test } from "bun:test";
import { TypeSafeClient } from "@aphrody/typesafe-sdk";
import { buildBunRag } from "./rag";
import { RAG_POLICY } from "./rag-policy";
import type { SiteDocumentHit, SiteQuery } from "./site-neon";
import { publicSiteAPI } from "./site-api";

const snapshot = {
  id: "a".repeat(64),
  source: "b".repeat(40),
  profile: "bun",
  repository: "aphrody-labs/bun",
  counts: {},
};

test("external cancellation settles retrieval when a read-only database ignores its signal", async () => {
  const started = Promise.withResolvers<void>();
  let queries = 0;
  const sql: SiteQuery = {
    query() {
      queries++;
      started.resolve();
      return new Promise(() => {});
    },
  };
  const controller = new AbortController();
  const task = buildBunRag(sql, { query: "Bun.Video" }, controller.signal);
  await started.promise;
  const reason = new Error("cancel source retrieval");
  controller.abort(reason);
  await expect(task).rejects.toBe(reason);
  expect(queries).toBe(1);
});
function document(name: string, score = 1): SiteDocumentHit {
  return {
    path: "docs/" + name + ".mdx",
    title: name,
    description: "",
    sha256: "c".repeat(64),
    score,
    url: "",
    chunks: [{ ordinal: 0, body: "Bun.Video native frames " + name, sha256: "d".repeat(64) }],
  };
}
function database(documents: SiteDocumentHit[]) {
  const calls: { text: string; parameters: readonly unknown[] }[] = [];
  const sql: SiteQuery = {
    async query<T>(text: string, parameters: readonly unknown[] = []): Promise<T[]> {
      calls.push({ text, parameters });
      return (
        text.includes("FROM aphrody_site.snapshots") ? [snapshot] : text.includes("WITH ranked") ? documents : []
      ) as T[];
    },
  };
  return { sql, calls };
}
function jev(
  judge: (
    state: Record<string, any>,
  ) =>
    | { relevant?: number; injection?: number; grounded?: number }
    | Promise<{ relevant?: number; injection?: number; grounded?: number }>,
) {
  const requests: Record<string, any>[] = [];
  const client = new TypeSafeClient({
    apiKey: "local-test-fixture",
    retry: { maxRetries: 0 },
    logLevel: "off",
    fetch: async (_, init) => {
      const body = JSON.parse(String(init?.body));
      requests.push(body);
      const scores = await judge(body.state);
      const answers = Object.fromEntries(
        Object.keys(body.questions).map(name => [
          name,
          { type: "noul", noul: scores[name as keyof typeof scores] ?? 0 },
        ]),
      );
      return Response.json({ model: "fixture-jev", answers, usage: { input_tokens: 1, output_tokens: 1 } });
    },
  });
  return { client, requests };
}

test("HEAD reads public evidence without invoking Jev or generation", async () => {
  const db = database([document("video")]);
  const provider = jev(() => ({ relevant: 1, injection: 0 }));
  let generated = false;
  const result = await publicSiteAPI(
    new Request("https://bun.aphrody.app/api/site/rag?q=Bun.Video", { method: "HEAD" }),
    db.sql,
    {
      rag: {
        client: provider.client,
        generate: async () => {
          generated = true;
          return { text: "fixture [S1]", model: "fixture" };
        },
      },
    },
  );
  expect(result.status).toBe(200);
  expect(await result.text()).toBe("");
  expect(provider.requests).toHaveLength(0);
  expect(generated).toBe(false);
});

test("native retrieval pins source and graph, and no Jev key returns bounded cited extracts", async () => {
  const db = database(
    Array.from({ length: 8 }, (_, i) => ({
      ...document(String(i)),
      chunks: [{ ordinal: 0, body: "Bun.Video ".repeat(900), sha256: "d".repeat(64) }],
    })),
  );
  let generated = false;
  const result = await buildBunRag(db.sql, {
    query: "Bun.Video",
    generate: async () => {
      generated = true;
      return { text: "ignored", model: "fixture" };
    },
  });
  expect(result.judgement.status).toBe("not-configured");
  expect(result.generation.status).toBe("extractive");
  expect(generated).toBe(false);
  expect(result.answer.length).toBeLessThanOrEqual(RAG_POLICY.maximumAnswerCharacters);
  expect(result.answer).toMatch(/\[S\d+\]$/);
  expect(result.citations[0].url).toContain(snapshot.source);
  expect(db.calls.filter(call => call.text.includes("FROM aphrody_site.snapshots"))[1].parameters).toEqual([
    snapshot.id,
  ]);
});

test("Jev batches typed relevance and injection questions, rejects instructions and ranks relevant passages", async () => {
  const db = database([document("weak", 20), document("strong", 1), document("injected", 30)]);
  const provider = jev(state => ({
    relevant: state.passage.path.includes("strong") ? 0.95 : 0.6,
    injection: state.passage.path.includes("injected") ? 0.99 : 0.01,
  }));
  const result = await buildBunRag(db.sql, { query: "Bun.Video", client: provider.client });
  expect(result.citations.map(citation => citation.title)).toEqual(["strong", "weak"]);
  expect(result.judgement.status).toBe("complete");
  expect(provider.requests).toHaveLength(3);
  for (const request of provider.requests) expect(Object.keys(request.questions)).toEqual(["relevant", "injection"]);
});

test("a partially unavailable judge disables generation and preserves lexical order", async () => {
  const db = database([document("first", 20), document("second", 1)]);
  const provider = jev(state => {
    if (state.passage.path.includes("second")) throw new Error("fixture unavailable");
    return { relevant: 0.8, injection: 0.01 };
  });
  let generated = false;
  const result = await buildBunRag(db.sql, {
    query: "Bun.Video",
    client: provider.client,
    generate: async () => {
      generated = true;
      return { text: "false [S1]", model: "fixture" };
    },
  });
  expect(result.judgement.status).toBe("unavailable");
  expect(result.citations.map(citation => citation.title)).toEqual(["first", "second"]);
  expect(generated).toBe(false);
});

test("generated answers require known citations and a typed grounding check", async () => {
  const db = database([document("video")]);
  const provider = jev(state => (state.answer ? { grounded: 0.98 } : { relevant: 0.9, injection: 0.01 }));
  const result = await buildBunRag(db.sql, {
    query: "Bun.Video",
    client: provider.client,
    generate: async (_, signal) => {
      expect(signal).toBeDefined();
      return { text: "Bun.Video fournit des images [S1].", model: "fixture-generator" };
    },
  });
  expect(result.generation).toEqual({ status: "complete", model: "fixture-generator", grounding: 0.98 });
  expect(result.answer).toBe("Bun.Video fournit des images [S1].");
  expect(provider.requests).toHaveLength(2);
  expect(Object.keys(provider.requests[1].questions)).toEqual(["grounded"]);
  expect(provider.requests[1].state.sources[0].id).toBe("S1");
});

test("unknown citations and ungrounded generated claims fall back to source excerpts", async () => {
  for (const [text, grounding] of [
    ["invented [S99]", 0.99],
    ["unqualified platforms [S1]", 0.1],
  ] as const) {
    const db = database([document("video")]);
    const provider = jev(state => (state.answer ? { grounded: grounding } : { relevant: 0.9, injection: 0.01 }));
    const result = await buildBunRag(db.sql, {
      query: "Bun.Video",
      client: provider.client,
      generate: async () => ({ text, model: "fixture" }),
    });
    expect(result.generation.status).toBe("rejected");
    expect(result.answer).toContain("Bun.Video native frames");
    expect(result.answer).not.toBe(text);
  }
});

test("external cancellation interrupts even a generator that ignores its signal", async () => {
  const db = database([document("video")]);
  const provider = jev(() => ({ relevant: 0.9, injection: 0.01 }));
  const controller = new AbortController();
  let entered!: () => void;
  const started = new Promise<void>(resolve => {
    entered = resolve;
  });
  const task = buildBunRag(
    db.sql,
    {
      query: "Bun.Video",
      client: provider.client,
      generate: () => {
        entered();
        return new Promise(() => {});
      },
    },
    controller.signal,
  );
  await started;
  controller.abort(new Error("request cancelled"));
  await expect(task).rejects.toThrow("request cancelled");
});

test("invalid input is rejected before any SQL or model request", async () => {
  const db = database([]);
  await expect(buildBunRag(db.sql, { query: "" })).rejects.toThrow("Invalid");
  await expect(buildBunRag(db.sql, { query: "Bun", limit: 9 })).rejects.toThrow("Invalid");
  expect(db.calls).toHaveLength(0);
});
