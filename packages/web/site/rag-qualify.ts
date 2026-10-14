import { parseArgs } from "node:util";
import { TypeSafeClient } from "@aphrody/typesafe-sdk";
import { createNeonHTTPClient } from "@aphrody/bun-plugin-neon/http";
import { buildBunRag } from "./rag";
import { protectedReference } from "./protected-reference";

const { values } = parseArgs({
  args: process.argv.slice(2),
  strict: true,
  options: {
    "database-url-file": { type: "string" },
    "api-key-file": { type: "string" },
    out: { type: "string" },
    native: { type: "boolean", default: false },
  },
});
let report: Record<string, unknown>;
try {
  const sql = createNeonHTTPClient({
    connectionString: await protectedReference(values["database-url-file"]),
    expectedDatabase: "bun_site",
  });
  let calls = 0;
  const client = new TypeSafeClient({
    apiKey: await protectedReference(values["api-key-file"]),
    timeout: 5000,
    retry: { maxRetries: 0 },
    logLevel: "off",
    fetch: (input, init) => {
      calls++;
      return fetch(input, init);
    },
  });
  const result = await buildBunRag(
    sql,
    {
      query: "Comment utiliser Bun.Video avec Linux ?",
      limit: 1,
      client: values.native ? await (await import("./editorial-native")).withNativeEditorialValidation(client) : client,
    },
    AbortSignal.timeout(20000),
  );
  report = {
    schema: 1,
    date: new Date().toISOString(),
    calls,
    validator: values.native ? "bun:yolo" : "application-sdk",
    source: result.snapshot?.source ?? null,
    snapshot: result.snapshot?.id ?? null,
    judgement: result.judgement,
    generation: result.generation,
    citationCount: result.citations.length,
    citations: result.citations.map(({ id, path, sha256 }) => ({ id, path, sha256 })),
    qualified: result.judgement.status === "complete" && result.citations.length > 0 && calls <= 1,
  };
} catch (error) {
  report = {
    schema: 1,
    date: new Date().toISOString(),
    qualified: false,
    errorType: error instanceof Error ? error.name : "UnknownError",
  };
}
if (values.out) await Bun.write(values.out, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report));
if (!report.qualified) process.exitCode = 1;
