import { expect, test } from "bun:test";
import { siteRag } from "../src/site-rag";
import type { RagGenerationInput } from "../../site/rag";

const input: RagGenerationInput = {
  instructions: "Use the supplied immutable evidence and cite it.",
  query: "Bun.Video",
  source: "a".repeat(40),
  citations: [
    {
      id: "S1",
      path: "docs/runtime/video.mdx",
      title: "Video",
      url: "https://example.invalid/source",
      sha256: "b".repeat(64),
      excerpt: "Bun.Video extracts frames.",
      relevance: 1,
    },
  ],
  graph: { snapshot: null, domains: [], links: [], qualification: "fixture" },
};

function environment(run: (...args: unknown[]) => Promise<unknown>, key = "fixture-not-a-secret") {
  return {
    TYPESAFE_API_KEY: key,
    AI_MODEL: "@cf/qwen/qwen3-30b-a3b-fp8",
    AI_GATEWAY: "aphrody",
    AI: { run },
  } as unknown as Parameters<typeof siteRag>[0];
}

test("grounded generation forwards only cited evidence and reports the real configured model", async () => {
  let calls = 0;
  const options = siteRag(
    environment(async (model, request, metadata) => {
      calls++;
      expect(model).toBe("@cf/qwen/qwen3-30b-a3b-fp8");
      const body = request as { messages: { content: string }[]; max_tokens: number; stream: boolean };
      expect(body.messages[0].content).toBe(input.instructions);
      expect(JSON.parse(body.messages[1].content)).toEqual({
        query: input.query,
        source: input.source,
        citations: input.citations,
        graph: input.graph,
      });
      expect(body.max_tokens).toBe(1000);
      expect(body.stream).toBe(false);
      expect(metadata).toEqual({ gateway: { id: "aphrody" } });
      return { choices: [{ message: { content: "Bun.Video extracts frames. [S1]" } }] };
    }),
  );
  expect(await options.generate!(input)).toEqual({
    text: "Bun.Video extracts frames. [S1]",
    model: "@cf/qwen/qwen3-30b-a3b-fp8",
  });
  expect(calls).toBe(1);
});

test("missing Jev credentials keep generation disabled and abort prevents the provider call", async () => {
  let calls = 0;
  const env = environment(async () => {
    calls++;
    return { response: "ignored" };
  });
  expect(siteRag({ ...env, TYPESAFE_API_KEY: "" })).toEqual({});
  const controller = new AbortController();
  const reason = new Error("cancelled");
  controller.abort(reason);
  await expect(siteRag(env).generate!(input, controller.signal)).rejects.toBe(reason);
  expect(calls).toBe(0);
});

test("provider output must be a nonempty structured chat answer", async () => {
  for (const output of [null, "untyped text", {}, { response: "" }, { choices: [{ text: "raw completion" }] }])
    await expect(siteRag(environment(async () => output)).generate!(input)).rejects.toThrow();
});
