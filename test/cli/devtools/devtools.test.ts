// `bun rename`, `bun docs`, `bun parse` and `bun bench` (src/runtime/cli/devtools_command.rs +
// src/js/eval/devtools.ts).
import { describe, expect, test } from "bun:test";
import { bunEnv, bunExe, tempDir } from "harness";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const env = {
  ...bunEnv,
  npm_lifecycle_event: undefined,
  NO_COLOR: "1",
  FORCE_COLOR: undefined,
  BUN_DOCS_DIR: undefined,
};

async function run(args: string[], cwd?: string) {
  await using proc = Bun.spawn({ cmd: [bunExe(), ...args], env, cwd, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
  return { stdout, stderr, exitCode };
}

function gitInit(cwd: string) {
  const { exitCode } = Bun.spawnSync({ cmd: ["git", "init", "-q"], cwd, env, stdout: "ignore", stderr: "ignore" });
  expect(exitCode).toBe(0);
}

describe("bun rename", () => {
  test("dry-run, apply with identifier boundaries and paths, then restore", async () => {
    using dir = tempDir("bun-rename", {
      "src/acme.ts": `import { acme } from "@acme/core";\nexport const acmeLike = acme;\n`,
      "src/other.ts": `export const x = "acme";\n`,
      "CHANGELOG.md": "acme\n",
      ".gitignore": "ignored.txt\n",
      "ignored.txt": "acme\n",
    });
    const cwd = String(dir);
    gitInit(cwd);
    const rules = ["--from", "@acme/", "--to", "@nova/", "--from", "acme", "--to", "nova"];

    const dry = await run(["rename", ...rules, "--paths", "--json"], cwd);
    const plan = JSON.parse(dry.stdout);
    expect(plan.schema).toBe("bun.rename/1");
    expect(plan.reports[0].files).toEqual([
      { path: "src/acme.ts", destination: "src/nova.ts", replacements: 3 },
      { path: "src/other.ts", destination: "src/other.ts", replacements: 1 },
    ]);
    expect(readFileSync(join(cwd, "src/acme.ts"), "utf8")).toContain("@acme/core");
    expect(dry.exitCode).toBe(0);

    const applied = await run(["rename", ...rules, "--paths", "--apply", "--json"], cwd);
    const journal = JSON.parse(applied.stdout).reports[0].journal;
    expect(existsSync(join(cwd, "src/acme.ts"))).toBe(false);
    expect(readFileSync(join(cwd, "src/nova.ts"), "utf8")).toBe(
      `import { nova } from "@nova/core";\nexport const acmeLike = nova;\n`,
    );
    expect(readFileSync(join(cwd, "CHANGELOG.md"), "utf8")).toBe("acme\n");
    expect(readFileSync(join(cwd, "ignored.txt"), "utf8")).toBe("acme\n");
    expect(applied.exitCode).toBe(0);

    const restored = await run(["rename", "--restore", journal, "--apply"], cwd);
    expect(restored.stdout).toBe("restore: 2 file(s) (applied)\n");
    expect(readFileSync(join(cwd, "src/acme.ts"), "utf8")).toBe(
      `import { acme } from "@acme/core";\nexport const acmeLike = acme;\n`,
    );
    expect(existsSync(join(cwd, "src/nova.ts"))).toBe(false);
    expect(restored.exitCode).toBe(0);
  });

  test("needs rules", async () => {
    using dir = tempDir("bun-rename-usage", { "a.txt": "a" });
    const { stderr, exitCode } = await run(["rename"], String(dir));
    expect(stderr).toContain("No rules");
    expect(exitCode).toBe(1);
  });
});

test("bun parse reports exports and imports", async () => {
  using dir = tempDir("bun-parse", {
    "mod.ts": `import { a } from "./a";\nimport type { T } from "./t";\nexport const b: T = a;\nexport default 1;\n`,
  });
  const { stdout, exitCode } = await run(["parse", "mod.ts", "--json"], String(dir));
  const report = JSON.parse(stdout);
  expect(report).toMatchObject({
    schema: "bun.parse/1",
    path: "mod.ts",
    lines: 5,
    exports: ["b", "default"],
    imports: [{ path: "./a", kind: "import-statement" }],
  });
  expect(exitCode).toBe(0);
});

test("bun bench --json", async () => {
  const { stdout, exitCode } = await run(["bench", "--iterations", "50", "--json"]);
  const report = JSON.parse(stdout);
  expect(report.schema).toBe("bun.bench/1");
  expect(report.results.map((r: { name: string }) => r.name)).toEqual([
    "Bun.hash.wyhash",
    "Bun.hash.crc32",
    "Bun.hash.rapidhash",
    "Bun.stringWidth",
    "Bun.stripANSI",
    "Bun.Transpiler.transformSync",
  ]);
  expect(exitCode).toBe(0);
});

test("bun docs searches a local docs directory", async () => {
  using dir = tempDir("bun-docs", {
    "docs/runtime/sqlite.mdx": `---\ntitle: SQLite\ndescription: bun:sqlite driver\n---\nDatabase body\n`,
    "docs/runtime/http.mdx": `---\ntitle: HTTP server\n---\nBun.serve\n`,
  });
  const cwd = String(dir);
  const found = await run(["docs", "sqlite", "--dir", "docs", "--json"], cwd);
  expect(JSON.parse(found.stdout).matches).toEqual([
    { path: "runtime/sqlite.mdx", title: "SQLite", description: "bun:sqlite driver" },
  ]);
  expect(found.exitCode).toBe(0);

  const body = await run(["docs", "Bun.serve", "--dir", "docs", "--content", "--json"], cwd);
  expect(JSON.parse(body.stdout).matches.map((m: { path: string }) => m.path)).toEqual(["runtime/http.mdx"]);

  const none = await run(["docs", "nothing-matches", "--dir", "docs", "--json"], cwd);
  expect(JSON.parse(none.stdout).total).toBe(0);
  expect(none.exitCode).toBe(1);
});

test.concurrent.each(["bench", "parse"])("a project %s file or script keeps running", async name => {
  using dir = tempDir("bun-devtools-project", {
    [`${name}.ts`]: `console.log("project ${name}");`,
  });
  const { stdout, exitCode } = await run([name], String(dir));
  expect(stdout).toBe(`project ${name}\n`);
  expect(exitCode).toBe(0);
});
