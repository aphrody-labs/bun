import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import { generate, memoryFiches, repoSkills } from "./generate";

const root = resolve(import.meta.dir, "../../..");
const pages = [
  "docs/runtime/yolo.mdx",
  "docs/runtime/decisions.mdx",
  "src/agent_tools/sections/bun-yolo.md",
  "packages/bun-agent-plugin/docs/decision-context.md",
  "docs/project/bun-site-sync.md",
];
const blocks = (text: string) => [...text.matchAll(/```ts\r?\n([\s\S]*?)\r?\n```/g)].map(match => match[1]!);
const transpiler = new Bun.Transpiler({ loader: "ts" });
const hasNativeYolo = await import("bun:yolo").then(() => true, () => false);

test("public decision guides use Bun terminology and the canonical generic route", async () => {
  for (const path of pages) {
    const text = await Bun.file(join(root, path)).text();
    // `jev-latest` is the provider wire model id, not product terminology.
    expect(text).not.toMatch(/\bjev\b(?!-latest)/i);
    expect(text).not.toContain("/runtime/jev");
    for (const source of blocks(text)) expect(() => transpiler.transformSync(source)).not.toThrow();
  }
  const navigation = JSON.stringify(await Bun.file(join(root, "docs/docs.json")).json());
  expect(navigation).toContain("/runtime/decisions");
  expect(navigation).not.toContain("/runtime/jev");
  expect(existsSync(join(root, "docs/runtime/jev.mdx"))).toBe(false);
});

test("generated decision skill uses its canonical owner across provider bundles", () => {
  expect(repoSkills(root).find(skill => skill.name === "bun-yolo")?.source).toBe(
    ".claude/skills/bun-yolo",
  );
  const files = generate({ root });
  const resources = [...files.entries()].filter(([path]) => path.includes("/skills/bun-yolo/"));
  expect(resources.length).toBeGreaterThan(0);
  for (const [path, content] of resources) {
    expect(path).not.toContain("/runtime/jev");
    expect(String(content)).not.toMatch(/\bjev\b/i);
    if (path.endsWith("SKILL.md")) expect(String(content)).toContain("docs/runtime/decisions.mdx");
  }
  for (const fiche of memoryFiches(join(root, "packages/bun-agent-plugin"))) expect(fiche.text).not.toMatch(/\bjev\b/i);
});

const fixtureProvider = `
import { code as fixtureCode } from "bun:yolo";
let fixtureCalls = 0;
const fixtureProvider = fixtureCode(request => {
  fixtureCalls++;
  const answers = {};
  for (const [name, question] of Object.entries(request.questions)) {
    if (question.type === "noul") answers[name] = {type:"noul",noul:0.8};
    else if (question.type === "choice") {
      const keys=Object.keys(question.criteria);
      answers[name]={type:"choice",choice:keys[0],confidence:1,probabilities:Object.fromEntries(keys.map((key,index)=>[key,index===0?1:0]))};
    } else {
      const last=question.criteria.length-1;
      answers[name]={type:"score",score:last,confidence:1,legend:Object.fromEntries(question.criteria.map((entry,index)=>[String(index),entry])),probabilities:Object.fromEntries(question.criteria.map((_,index)=>[String(index),index===last?1:0]))};
    }
  }
  return {model:"documentation-fixture",answers,usage:null};
});
`;

async function execute(source: string, suffix: string) {
  const program = transpiler.transformSync(source) + "\n" + fixtureProvider + "\n" + suffix;
  const child = Bun.spawn([process.execPath, "--no-env-file", "-"], {
    cwd: join(root, "packages/bun-agent-plugin"),
    stdin: new TextEncoder().encode(program),
    stdout: "pipe",
    stderr: "pipe",
    timeout: 10000,
  });
  const [stdout, stderr, status] = await Promise.all([child.stdout.text(), child.stderr.text(), child.exited]);
  expect(stderr).toBe("");
  expect(status).toBe(0);
  return stdout.trim();
}

test.skipIf(!hasNativeYolo)("public TypeScript decision examples execute the native validator with explicit fixtures", async () => {
  const first = blocks(await Bun.file(join(root, pages[0]!)).text())[0]!;
  expect(await execute(first, "")).toBe("read allowed");
  const examples = [
    { page: pages[0]!, name: "decideSources", expected: { relevant: true, route: "docs", evidence: 2 } },
    { page: pages[1]!, name: "selectSource", expected: { relevant: true, route: "docs", support: 2 } },
    { page: pages[2]!, name: "routeSource", expected: { relevant: true, route: "docs" } },
  ];
  for (const example of examples) {
    const source = blocks(await Bun.file(join(root, example.page)).text()).find(block =>
      block.includes(`function ${example.name}`),
    )!;
    const actual = await execute(
      source,
      `const result=await ${example.name}(fixtureProvider);console.log(JSON.stringify({result,calls:fixtureCalls}));`,
    );
    expect(JSON.parse(actual)).toEqual({ result: example.expected, calls: 1 });
  }
});

test.skipIf(!hasNativeYolo)("context guide resolves the real package export and selects a fixture source without a paid fallback", async () => {
  const directory = mkdtempSync(join(tmpdir(), "bun-public-context-"));
  const target = resolve(directory),
    child = relative(resolve(tmpdir()), target);
  if (
    child.startsWith("..") ||
    child.includes("/") ||
    child.includes("\\") ||
    !basename(target).startsWith("bun-public-context-")
  )
    throw new Error("Unexpected context fixture cleanup path");
  try {
    const input = join(directory, "context-catalog.json");
    writeFileSync(
      input,
      JSON.stringify({
        schema: 1,
        sourceOnly: true,
        tools: [],
        cards: [
          {
            id: "tool:bun_site_docs_search",
            kind: "tool",
            name: "bun_site_docs_search",
            description: "Find callers of Bun.Video frame transforms",
            resource: "mcp:tools/list#bun_site_docs_search",
          },
        ],
      }),
    );
    const source = blocks(await Bun.file(join(root, pages[3]!)).text())[0]!.replace(
      '"yolo/context-catalog.json"',
      JSON.stringify(input),
    );
    const actual = await execute(
      source,
      "const result=await selectContext(fixtureProvider);console.log(JSON.stringify({name:result.selected.tool?.name,calls:fixtureCalls,usage:result.evidence?.usage}));",
    );
    expect(JSON.parse(actual)).toEqual({ name: "bun_site_docs_search", calls: 1, usage: null });
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});
