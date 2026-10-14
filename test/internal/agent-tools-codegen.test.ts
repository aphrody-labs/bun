import { describe, expect, test } from "bun:test";
import { bunEnv, bunExe, tempDir } from "harness";
import { existsSync, readFileSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { generate, glob, main, plan, sanitize } from "../../src/codegen/generate-agent-tools.ts";

const root = join(import.meta.dir, "..", "..");
const script = join(root, "src", "codegen", "generate-agent-tools.ts");

async function run(...args: string[]) {
  await using proc = Bun.spawn({ cmd: [bunExe(), script, ...args], cwd: root, env: bunEnv, stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
  return { stdout, stderr, exitCode };
}

describe("generate-agent-tools", () => {
  test("source globs skip cyclic, broken and external directory links", () => {
    using dir = tempDir("agent-tools-links", { "source/entry.rs": "", "outside/secret.rs": "" });
    symlinkSync(join(String(dir), "source"), join(String(dir), "source/cycle"), "junction");
    symlinkSync(join(String(dir), "missing"), join(String(dir), "source/broken"), "junction");
    symlinkSync(join(String(dir), "outside"), join(String(dir), "source/external"), "junction");
    expect(glob("source/**/*.rs", String(dir))).toEqual(["source/entry.rs"]);
    symlinkSync(join(String(dir), "outside"), join(String(dir), "alias"), "junction");
    expect(glob("alias/**/*.rs", String(dir))).toEqual([]);
    expect(glob("alias/nested/**/*.rs", String(dir))).toEqual([]);
  });

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
      expect(outputs).toContain(`.agents/skills/${name}/SKILL.md`);
    }
  });

  test("default check detects portable skill drift independently of Claude outputs", async () => {
    using dir = tempDir("agent-tools-portable-check", {});
    expect((await run("--out", String(dir))).exitCode).toBe(0);
    const portable = join(String(dir), ".agents/skills/bun-yolo/SKILL.md");
    const canonical = readFileSync(portable, "utf8");
    expect(canonical).toContain("docs/runtime/decisions.mdx");
    expect(canonical).not.toContain("docs/runtime/jev.mdx");
    await Bun.write(portable, canonical + "\nDrift.\n");
    const result = await run("--check", "--out", String(dir));
    expect(result.stderr).toContain("stale: .agents/skills/bun-yolo/SKILL.md");
    expect(result.stderr).not.toContain("stale: .claude/");
    expect(result.exitCode).toBe(1);
  });

  test("targeted portable refresh never writes Claude or Rust outputs and preserves custom skills", async () => {
    using dir = tempDir("agent-tools-portable-only", {
      ".claude/skills/bun-yolo/SKILL.md": "Concurrent Claude edit.\n",
      ".agents/skills/bun-yolo/SKILL.md": "Custom portable skill.\n",
      "src/agent_tools/generated/tools.rs": "Concurrent Rust edit.\n",
    });
    const result = await run("--skill-root=.agents", "--out", String(dir));
    expect(result.stderr).toContain("preserved: .agents/skills/bun-yolo/SKILL.md");
    expect(readFileSync(join(String(dir), ".agents/skills/bun-yolo/SKILL.md"), "utf8")).toBe(
      "Custom portable skill.\n",
    );
    expect(readFileSync(join(String(dir), ".claude/skills/bun-yolo/SKILL.md"), "utf8")).toBe(
      "Concurrent Claude edit.\n",
    );
    expect(readFileSync(join(String(dir), "src/agent_tools/generated/tools.rs"), "utf8")).toBe(
      "Concurrent Rust edit.\n",
    );
    expect(result.exitCode).toBe(1);
  });

  test.each([{ scope: ["--skill-root=.agents"] }, { scope: ["--skill-root", ".agents"] }])(
    "both scoped option forms write only portable skills: %j",
    async ({ scope }) => {
      using dir = tempDir("agent-tools-scoped-option", {
        ".claude/skills/bun-yolo/SKILL.md": "Concurrent Claude edit.\n",
        "src/agent_tools/generated/tools.rs": "Concurrent Rust edit.\n",
        "docs/project/agent-tools.mdx": "Concurrent documentation edit.\n",
      });
      const result = await run(...scope, `--out=${String(dir)}`);
      expect(readFileSync(join(String(dir), ".agents/skills/bun-yolo/SKILL.md"), "utf8")).toContain(
        "docs/runtime/decisions.mdx",
      );
      expect(readFileSync(join(String(dir), ".claude/skills/bun-yolo/SKILL.md"), "utf8")).toBe(
        "Concurrent Claude edit.\n",
      );
      expect(readFileSync(join(String(dir), "src/agent_tools/generated/tools.rs"), "utf8")).toBe(
        "Concurrent Rust edit.\n",
      );
      expect(readFileSync(join(String(dir), "docs/project/agent-tools.mdx"), "utf8")).toBe(
        "Concurrent documentation edit.\n",
      );
      expect(result.stderr).toBe("");
      expect(result.exitCode).toBe(0);
    },
  );

  test("invalid value options fail before generating or writing anything", () => {
    using dir = tempDir("agent-tools-invalid-options", {
      ".claude/skills/bun-yolo/SKILL.md": "Concurrent Claude edit.\n",
      "src/agent_tools/generated/tools.rs": "Concurrent Rust edit.\n",
    });
    for (const flag of ["--skill-root", "--tools", "--skills", "--out"]) {
      for (const invalid of [[flag], [`${flag}=`], [flag, "--check"], [flag, "one", `${flag}=two`]]) {
        // No --out: a missing or duplicate flag must reject even before the default checkout is selected.
        expect(() => main(invalid, new Set())).toThrow(
          new RegExp(`${flag} (needs a value|must be specified only once)`),
        );
      }
    }
    for (const invalid of ["../.agents", ".agents/skills", ".other"]) {
      expect(() => main([`--skill-root=${invalid}`, "--out", String(dir)], new Set())).toThrow(
        "--skill-root must be .agents or .claude",
      );
    }
    expect(readFileSync(join(String(dir), ".claude/skills/bun-yolo/SKILL.md"), "utf8")).toBe(
      "Concurrent Claude edit.\n",
    );
    expect(readFileSync(join(String(dir), "src/agent_tools/generated/tools.rs"), "utf8")).toBe(
      "Concurrent Rust edit.\n",
    );
    expect(existsSync(join(String(dir), ".agents"))).toBe(false);
  });

  test("targeted refresh preserves dirty managed files from the inventory", async () => {
    const path = ".agents/skills/bun-yolo/SKILL.md";
    const edited = generate().get(path)! + "\nConcurrent managed edit.\n";
    using dir = tempDir("agent-tools-dirty", { [path]: edited });
    expect(main(["--skill-root=.agents", "--out", String(dir)], new Set([path]))).toBe(1);
    expect(readFileSync(join(String(dir), path), "utf8")).toBe(edited);
  });

  test("removed generated skills do not delete adjacent custom resources", async () => {
    const managed = generate().get(".agents/skills/bun-yolo/SKILL.md")!;
    using dir = tempDir("agent-tools-retired-custom", {
      ".agents/skills/retired/SKILL.md": managed,
      ".agents/skills/retired/custom.md": "Custom resource.\n",
      ".agents/skills/bun-yolo/custom.md": "Custom owner without a generated skill.\n",
    });
    const result = await run("--skill-root=.agents", "--out", String(dir));
    expect(result.stderr).toContain("preserved: .agents/skills/retired");
    expect(result.stderr).toContain("preserved: .agents/skills/bun-yolo/SKILL.md");
    expect(readFileSync(join(String(dir), ".agents/skills/retired/custom.md"), "utf8")).toBe("Custom resource.\n");
    expect(result.exitCode).toBe(1);
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
