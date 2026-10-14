import { expect, test } from "bun:test";
import { yoloIdentity } from "../../../packages/bun-agent-plugin/src/identity";

const inputs = {
  version: "1.4.4",
  rules: "Use the qualified Bun runtime.",
  nativeRules: ["Prefer Bun.serve."],
  tools: [{ name: "docs_search", title: "Search public documentation" }],
  catalogSources: ["src/mcp/tools/mod.rs"],
  skills: [
    {
      name: "bun-yolo",
      source: "packages/bun-agent-plugin/skills/bun-yolo",
      files: new Map([["SKILL.md", "Use native typed decisions."]]),
    },
    { name: "local", source: "local-skills/local", files: new Map([["SKILL.md", "PRIVATE_LOCAL_MARKER"]]) },
    { name: "memory", source: "generated", files: new Map([["SKILL.md", "PRIVATE_MEMORY_MARKER"]]) },
  ],
};
test("Yolo home and dataset share public owners and exclude private or derived memory", () => {
  const first = yoloIdentity(inputs);
  expect(first).toEqual(yoloIdentity(inputs));
  const prompt = first.get("system-prompt.md")!;
  expect(prompt).toContain("Use the qualified Bun runtime.");
  expect(prompt).toContain("docs_search");
  expect(prompt).toContain("does not authorize an action");
  const rows = first
    .get("dataset.jsonl")!
    .trim()
    .split("\n")
    .map(line => JSON.parse(line));
  expect(rows).toHaveLength(3);
  expect(rows.find(row => row.kind === "system-prompt").content).toBe(prompt);
  for (const row of rows) {
    expect(row.sha256).toBe(new Bun.CryptoHasher("sha256").update(row.content).digest("hex"));
    expect(row.source.repository).toBe("https://github.com/aphrody-labs/bun");
  }
  expect([...first.values()].join("\n")).not.toContain("PRIVATE_");
  expect(first.has("home/USER.md")).toBe(false);
  expect(first.has("home/MEMORY.md")).toBe(false);
  const manifest = JSON.parse(first.get("manifest.json")!);
  expect(manifest.trainingQualified).toBe(false);
  expect(manifest.dataset.completeBunGraph).toBe(false);
  expect(manifest.dataset.sha256).toBe(
    new Bun.CryptoHasher("sha256").update(first.get("dataset.jsonl")!).digest("hex"),
  );
});
test("Yolo dataset refuses protected identity and path escapes", () => {
  expect(() => yoloIdentity({ ...inputs, rules: "Account github_pat_fakecredential" })).toThrow("protected");
  expect(() => yoloIdentity({ ...inputs, catalogSources: ["../private/session.json"] })).toThrow("escapes");
});

test("the generated plugin distributes one Yolo identity and dataset to every supported harness", async () => {
  const { generate } = await import("../../../packages/bun-agent-plugin/src/generate");
  const { TARGETS } = await import("../../../packages/bun-agent-plugin/src/spec");
  const files = generate({ root: new URL("../../../", import.meta.url).pathname.replace(/^\/(\w:)/, "$1") });
  const manifest = JSON.parse(String(files.get("yolo/manifest.json")));
  expect(manifest.trainingQualified).toBe(false);
  for (const target of TARGETS) {
    expect(files.get(`${target}/yolo/system-prompt.md`)).toBe(files.get("yolo/system-prompt.md"));
    expect(files.get(`${target}/yolo/dataset.jsonl`)).toBe(files.get("yolo/dataset.jsonl"));
  }
});
