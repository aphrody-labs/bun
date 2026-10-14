import { expect, test } from "bun:test";
import { GraphRedisCache } from "bun:graphx";
import { code } from "bun:yolo";
import type { Request } from "bun:yolo";
import { tempDir } from "harness";
import { join, resolve } from "node:path";
import { writeFileSync } from "node:fs";
import { mcpDecisionTools, mcpTools } from "../../../packages/bun-agent-plugin/src/catalog";
import {
  CONTEXT_DECISION,
  contextCatalog,
  createContextSelector,
} from "../../../packages/bun-agent-plugin/src/decision";

const root = resolve(import.meta.dir, "../../..");
function answer(request: Request, pick: string | undefined, confidence = 1) {
  return {
    model: "fixture-local",
    usage: { input_tokens: 12, output_tokens: 0 },
    answers: Object.fromEntries(
      Object.entries(request.questions).map(([key, question]) => {
        if (question.type !== "choice") throw new Error("Expected an atomic Choice");
        const choices = Object.keys(question.criteria);
        const choice = choices.includes(pick ?? "") ? pick! : choices.find(value => value !== CONTEXT_DECISION.none)!;
        return [
          key,
          {
            type: "choice",
            choice,
            confidence,
            probabilities: Object.fromEntries(choices.map(value => [value, value === choice ? 1 : 0])),
          },
        ];
      }),
    ),
  };
}
const skills = [
  {
    name: "bun-yolo",
    description: "Typed decisions with native Choice confidence and abstention.",
    source: "packages/bun-agent-plugin/skills/bun-yolo",
    text: "FULL_SKILL_BODY_NEVER_TO_MODEL\n".repeat(100),
  },
];

test("registered source contracts decode literals/constants/concat and retain genuine annotations", () => {
  using dir = tempDir("decision-catalog", {
    "src/mcp/tools/mod.rs": "const BUILTIN: &[&[Tool]] = &[alpha::TOOLS, host::TOOLS];",
    "src/mcp/registry.rs":
      "const READ_ONLY: Self = Self { read_only: true, destructive: false, idempotent: true, open_world: false };",
    "src/mcp/tools/alpha.rs": String.raw`const NOTE: &str = " More evidence.";
const PAID: Annotations = Annotations { read_only: true, destructive: false, idempotent: false, open_world: true };
const TOOLS: &[Tool] = &[Tool { name: "quoted", title: "One, two", description: concat!("Quoted \\"word\\".", NOTE), annotations: PAID, call: first },
Tool { name: "unknown", title: "Unknown", description: dynamic_description(), annotations: dynamic_annotations(), call: second }];`.replaceAll(
      '\\\\"',
      '\\"',
    ),
    "src/mcp/tools/host.rs":
      "Tool { name: tools::FIND_NAME, title: tools::FIND_TITLE, description: tools::FIND_DESCRIPTION, annotations: Annotations::READ_ONLY, call: find }",
    "src/host/tools.rs":
      'pub const FIND_NAME: &str = "host_find";\npub const FIND_TITLE: &str = "Find a host";\npub const FIND_DESCRIPTION: &str = "Available resources.";',
    "src/mcp/tools/not_registered.rs": 'Tool { name: "not_registered", title: "Unused" }',
  });
  const tools = mcpDecisionTools(String(dir));
  expect(mcpTools(String(dir))).toEqual([
    { name: "quoted", title: "One, two" },
    { name: "unknown", title: "Unknown" },
    { name: "host_find", title: "Find a host" },
  ]);
  expect(tools[0]!.description).toBe('Quoted "word". More evidence.');
  expect(tools[0]!.annotations).toEqual({
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  });
  expect(tools[0]!.unresolved).toEqual([]);
  expect(tools[1]!.description).toBeNull();
  expect(tools[1]!.annotations).toBeNull();
  expect(tools[1]!.unresolved).toEqual(["description", "annotations"]);
  expect(tools[2]!.sources.map(source => source.path)).toContain("src/host/tools.rs");
  const previous = tools[2]!.sources.find(source => source.path === "src/host/tools.rs")!.sha256;
  writeFileSync(
    join(String(dir), "src/host/tools.rs"),
    'pub const FIND_NAME: &str = "host_find";\npub const FIND_TITLE: &str = "Find a host";\npub const FIND_DESCRIPTION: &str = "New source evidence.";',
  );
  const fresh = mcpDecisionTools(String(dir))[2]!;
  expect(fresh.description).toBe("New source evidence.");
  expect(fresh.sources.find(source => source.path === "src/host/tools.rs")!.sha256).not.toBe(previous);
});

test("real catalogue resolves every registered description, with paid aliases distinct from local reads", () => {
  const tools = mcpDecisionTools(root);
  expect(tools.map(tool => ({ name: tool.name, title: tool.title }))).toEqual(mcpTools(root));
  expect(tools.length).toBeGreaterThan(30);
  expect(tools.filter(tool => tool.unresolved.length)).toEqual([]);
  expect(tools.find(tool => tool.name === "yolo_decide")!.annotations).toEqual({
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  });
  expect(tools.find(tool => tool.name === "vfs_apply")!.annotations!.destructiveHint).toBe(true);
  expect(tools.find(tool => tool.name === "deps_read")!.sources.map(source => source.path)).toContain(
    "src/agent_tools/lib.rs",
  );
  expect(tools.every(tool => tool.sources.every(source => /^[a-f0-9]{64}$/.test(source.sha256)))).toBe(true);
});

test("one local native batch selects source references while bodies and schemas stay out of context", async () => {
  const catalog = contextCatalog(mcpDecisionTools(root), skills);
  const selector = createContextSelector(catalog);
  let calls = 0;
  const selected = await selector.select({
    task: "Read native Choice confidence and abstention decisions",
    provider: code(request => {
      calls++;
      expect(Object.keys(request.questions)).toEqual(["tool", "skill"]);
      expect(JSON.stringify(request)).not.toContain("FULL_SKILL_BODY");
      expect(JSON.stringify(request)).not.toContain("inputSchema");
      return answer(request, "bun-yolo");
    }),
  });
  expect(calls).toBe(1);
  expect(selected.selected.skill!.resource).toBe("skills/bun-yolo/SKILL.md");
  expect(selected.selected.skill!.resourceSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(selected.evidence!.model).toBe("fixture-local");
  expect(selected.evidence!.usage!.output_tokens).toBe(0);
  expect(selected.requestBytes).toBeLessThan(
    Buffer.byteLength(skills[0]!.text) + Buffer.byteLength(JSON.stringify(catalog.tools)),
  );
  expect(selected.sourceOnly).toBe(true);
});

test("unknown tasks cost zero calls; native low confidence and none_suitable abstain", async () => {
  const selector = createContextSelector(contextCatalog([], skills));
  let calls = 0;
  const provider = code(request => {
    calls++;
    return answer(request, undefined, 0.7);
  });
  expect((await selector.select({ task: "zzzzzzzz", provider })).evidence).toBeNull();
  expect(calls).toBe(0);
  const low = await selector.select({ task: "typed decisions", provider });
  expect(low.selected.skill).toBeNull();
  expect(low.evidence!.answers.skill).toMatchObject({ confidence: 0.7 });
  const none = await selector.select({
    task: "typed decisions",
    provider: code(request => answer(request, CONTEXT_DECISION.none)),
  });
  expect(none.selected.skill).toBeNull();
  expect(none.evidence).not.toBeNull();
  await expect(selector.select({ task: "typed decisions", provider, minimumConfidence: NaN })).rejects.toThrow();
  expect(calls).toBe(1);
});

test("byte budgets omit whole low-ranked candidates with counts, never alter meanings", async () => {
  const many = Array.from({ length: 20 }, (_, index) => ({
    ...skills[0]!,
    name: `skill-${index}`,
    description: "budgettopic " + "source evidence ".repeat(30),
  }));
  const selector = createContextSelector(contextCatalog([], many));
  const result = await selector.select({
    task: "budgettopic",
    maxCandidates: 20,
    maxRequestBytes: 2048,
    provider: code(request => {
      const question = request.questions.skill!;
      if (question.type !== "choice") throw new Error("Expected Choice");
      for (const [key, value] of Object.entries(question.criteria))
        if (key !== CONTEXT_DECISION.none) expect(value).toBe(many[0]!.description);
      return answer(request, undefined);
    }),
  });
  expect(result.requestBytes).toBeLessThanOrEqual(2048);
  expect(result.omittedByBudget.skill).toBeGreaterThan(0);
  expect(result.considered.skill.length + result.omittedByBudget.skill).toBe(20);
  expect(() => selector.shortlist("budgettopic", 255)).toThrow("1..254");
  await expect(
    selector.select({
      task: "q".repeat(8193),
      provider: code(() => {
        throw new Error("must not call");
      }),
    }),
  ).rejects.toThrow("UTF-8 bytes");
});

test("native cache keys cover provider, complete source catalogue and request; cache corruption never calls a provider", async () => {
  using native = new GraphRedisCache();
  const scope = { repository: "source:bun", revision: "a".repeat(40), sha256: "b".repeat(64) };
  let key = "";
  const cache = {
    ...native,
    async remember<T>(snapshot: typeof scope, query: string, parameters: readonly unknown[], read: () => Promise<T>) {
      key = native.key(snapshot, query, parameters);
      return await read();
    },
  } as GraphRedisCache;
  const selector = createContextSelector(contextCatalog([], skills));
  const provider = code(request => answer(request, "bun-yolo"));
  await selector.select({
    task: "typed decisions",
    provider,
    cache: { owner: cache, scope, providerIdentity: "fixture-v1" },
  });
  const first = key;
  await selector.select({
    task: "typed decisions",
    provider,
    cache: { owner: cache, scope, providerIdentity: "fixture-v2" },
  });
  expect(key).not.toBe(first);
  const changed = createContextSelector(contextCatalog([], [{ ...skills[0]!, text: "fresh skill" }]));
  await changed.select({
    task: "typed decisions",
    provider,
    cache: { owner: cache, scope, providerIdentity: "fixture-v1" },
  });
  expect(key).not.toBe(first);
  const corrupted = {
    ...cache,
    remember: async () => ({ model: "corrupt", answers: {}, usage: null }),
  } as unknown as GraphRedisCache;
  let calls = 0;
  await expect(
    selector.select({
      task: "typed decisions",
      provider: code(() => {
        calls++;
        throw new Error("must not retry");
      }),
      cache: { owner: corrupted, scope, providerIdentity: "fixture-v1" },
    }),
  ).rejects.toThrow();
  expect(calls).toBe(0);
});

test("cancellation and invalid local answers never fall through to another provider", async () => {
  const selector = createContextSelector(contextCatalog([], skills));
  let calls = 0;
  const provider = code(() => {
    calls++;
    return { model: "local-rejected", answers: {}, usage: null };
  });
  await expect(selector.select({ task: "typed decisions", provider })).rejects.toThrow();
  expect(calls).toBe(1);
  await expect(
    selector.select({ task: "zzzzzz", provider, signal: AbortSignal.abort(new Error("cancelled")) }),
  ).rejects.toThrow("cancelled");
  expect(calls).toBe(1);
});
