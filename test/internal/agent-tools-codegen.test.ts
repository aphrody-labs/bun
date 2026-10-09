import { describe, expect, test } from "bun:test";
import { bunEnv, bunExe, tempDir } from "harness";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { generate, plan, sanitize } from "../../src/codegen/generate-agent-tools.ts";

const root = join(import.meta.dir, "..", "..");
const script = join(root, "src", "codegen", "generate-agent-tools.ts");

async function run(...args: string[]) {
  await using proc = Bun.spawn({ cmd: [bunExe(), script, ...args], cwd: root, env: bunEnv, stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
  return { stdout, stderr, exitCode };
}

describe("generate-agent-tools", () => {
  test("checked-in outputs are current", async () => {
    const { stderr, exitCode } = await run("--check");
    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
  });

  test("two runs produce the same bytes", () => {
    const a = generate();
    const b = generate();
    expect([...a.keys()]).toEqual([...b.keys()]);
    for (const [path, text] of a) expect(b.get(path)).toBe(text);
  });

  test("the ninja plan names the schema sources and every output", () => {
    const { inputs, outputs } = plan();
    expect(inputs).toContain("src/agent_tools/tools.json");
    expect(inputs).toContain("src/agent_tools/skills.json");
    expect(outputs).toContain("src/agent_tools/generated/tools.rs");
    expect(outputs).toContain("docs/project/agent-tools.mdx");
    for (const name of ["cpp-bun", "webkit", "win32", "linux-kernel", "bun-deps"]) {
      expect(outputs).toContain(`.claude/skills/${name}/SKILL.md`);
    }
  });

  test("a schema change regenerates the Rust table, the docs page and the skill", async () => {
    const tools = JSON.parse(readFileSync(join(root, "src", "agent_tools", "tools.json"), "utf8"));
    tools.tools[0].description = "Changed description for the codegen test.";
    tools.tools[0].inputSchema.properties.extra_flag = { type: "boolean", description: "Added by the codegen test." };
    using dir = tempDir("agent-tools-codegen", { "tools.json": JSON.stringify(tools) });
    const out = join(String(dir), "out");
    const { stderr, exitCode } = await run("--tools", join(String(dir), "tools.json"), "--out", out);
    expect(stderr).toBe("");
    const rs = readFileSync(join(out, "src", "agent_tools", "generated", "tools.rs"), "utf8");
    const mdx = readFileSync(join(out, "docs", "project", "agent-tools.mdx"), "utf8");
    const skill = readFileSync(join(out, ".claude", "skills", "bun-deps", "SKILL.md"), "utf8");
    expect(rs).toContain("Changed description for the codegen test.");
    expect(rs).toContain("extra_flag");
    expect(mdx).toContain("Changed description for the codegen test.");
    expect(mdx).toContain("extra_flag");
    expect(skill).toContain("extra_flag");
    expect(exitCode).toBe(0);
  });

  test("machine-specific paths do not ship", () => {
    expect(sanitize("see C:\\Users\\someone\\code\\x.rs and /home/someone/x")).not.toContain("someone");
    expect(sanitize("https://github.com/oven-sh/bun")).toBe("https://github.com/oven-sh/bun");
  });
});
