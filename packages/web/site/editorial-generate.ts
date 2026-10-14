import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { TypeSafeClient } from "@aphrody/typesafe-sdk";
import { createNeonHTTPClient } from "@aphrody/bun-plugin-neon/http";
import { buildEditorial, type EditorialTopic } from "./editorial";
import { withNativeEditorialValidation } from "./editorial-native";
import { protectedReference } from "./protected-reference";

export const EDITORIAL_TOPICS: readonly EditorialTopic[] = [
  {
    slug: "decisions-typees-jev",
    kind: "guide",
    title: "Décisions typées avec Bun et Jev",
    query: "bun:yolo typed decisions native validation",
  },
  {
    slug: "graphe-de-code",
    kind: "guide",
    title: "Explorer le graphe de code Bun",
    query: "bun:graph source code graph",
  },
  {
    slug: "video-native",
    kind: "blog",
    title: "Bun.Video : sources et limites natives",
    query: "Bun.Video native frames platform qualification",
  },
  {
    slug: "qualite-native",
    kind: "blog",
    title: "Vérifier les sources avec les commandes natives",
    query: "bun check bun lint bun fmt native",
  },
];

export async function generateEditorial(argv: string[]) {
  const { values } = parseArgs({
    args: argv,
    strict: true,
    options: {
      "database-url-file": { type: "string" },
      "api-key-file": { type: "string" },
      source: { type: "string" },
      snapshot: { type: "string" },
      out: { type: "string" },
    },
  });
  if (!values.out || !isAbsolute(values.out) || existsSync(values.out))
    throw new TypeError("Expected a new absolute editorial output directory");
  if (!/^[a-f0-9]{40}$/.test(values.source ?? "") || !/^[a-f0-9]{64}$/.test(values.snapshot ?? ""))
    throw new TypeError("Expected immutable editorial source and snapshot");
  const home = resolve(process.env.APHRODY_HOME ?? join(homedir(), ".aphrody"));
  const sql = createNeonHTTPClient({
    connectionString: await protectedReference(
      values["database-url-file"] ?? join(home, "config", "bun-site-neon-http.url"),
    ),
    expectedDatabase: "bun_site",
  });
  let calls = 0;
  const client = new TypeSafeClient({
    apiKey: await protectedReference(values["api-key-file"] ?? join(home, "private", "typesafe.api-key")),
    timeout: 5000,
    retry: { maxRetries: 0 },
    logLevel: "off",
    fetch(input, init) {
      if (++calls > 16) throw new Error("Editorial request budget exceeded");
      return fetch(input, init);
    },
  });
  const result = await buildEditorial(
    sql,
    {
      expectedSource: values.source!,
      expectedSnapshot: values.snapshot!,
      topics: EDITORIAL_TOPICS,
      client: await withNativeEditorialValidation(client),
    },
    AbortSignal.timeout(120000),
  );
  // No output is created until the entire batch passes model and immutable-source gates.
  mkdirSync(values.out);
  for (const draft of result.drafts) {
    await Bun.write(join(values.out, draft.path), draft.mdx);
    await Bun.write(join(values.out, draft.path + ".json"), JSON.stringify(draft.manifest, null, 2) + "\n");
  }
  const receipt = {
    ...result,
    drafts: result.drafts.map(({ path, manifest }) => ({ path, manifest })),
    calls,
    validator: "bun:yolo",
    qualified: true,
  };
  await Bun.write(join(values.out, "editorial.json"), JSON.stringify(receipt, null, 2) + "\n");
  return {
    qualified: true,
    source: result.source,
    snapshot: result.snapshot,
    calls,
    articles: result.drafts.length,
    validator: "bun:yolo",
  };
}

if (import.meta.main) {
  try {
    console.log(JSON.stringify(await generateEditorial(process.argv.slice(2))));
  } catch (error) {
    console.error(
      JSON.stringify({ qualified: false, errorType: error instanceof Error ? error.name : "UnknownError" }),
    );
    process.exitCode = 1;
  }
}
