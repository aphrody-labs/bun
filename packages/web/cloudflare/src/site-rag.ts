import { TypeSafeClient } from "@aphrody/typesafe-sdk";
import type { RagGenerationInput, RagOptions } from "../../site/rag";

type SiteRagEnv = Pick<Env, "TYPESAFE_API_KEY" | "AI" | "AI_MODEL" | "AI_GATEWAY">;

export function siteRag(env: SiteRagEnv): Pick<RagOptions, "client" | "generate"> {
  if (!env.TYPESAFE_API_KEY) return {};
  const client = new TypeSafeClient({
    apiKey: env.TYPESAFE_API_KEY,
    logLevel: "off",
    timeout: 5000,
    retry: { maxRetries: 0 },
  });
  return {
    client,
    async generate(input: RagGenerationInput, signal?: AbortSignal) {
      signal?.throwIfAborted();
      const result = await env.AI.run(
        env.AI_MODEL,
        {
          messages: [
            { role: "system", content: input.instructions },
            {
              role: "user",
              content: JSON.stringify({
                query: input.query,
                source: input.source,
                citations: input.citations,
                graph: input.graph,
              }),
            },
          ],
          max_tokens: 1000,
          temperature: 0,
          stream: false,
        },
        { gateway: { id: env.AI_GATEWAY } },
      );
      signal?.throwIfAborted();
      if (typeof result !== "object" || result === null) throw new Error("Invalid grounded answer");
      const first = "choices" in result ? result.choices?.[0] : undefined;
      const text = "response" in result ? result.response : first && "message" in first ? first.message?.content : null;
      if (typeof text !== "string" || !text.trim()) throw new Error("Empty grounded answer");
      return { text, model: env.AI_MODEL };
    },
  };
}
