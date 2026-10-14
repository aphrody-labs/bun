// `bun lint`, `bun fmt`, `bun n2b`, `bun migrate`, `bun wasm` and `bun build --target=wasm`
// Native quality and migration dispatch directly; wasm and templates use the JS entry script.
import { describe, expect, test } from "bun:test";
import { bunEnv, bunExe, tempDir } from "harness";
import { symlinkSync } from "node:fs";
import { join } from "node:path";

const env = {
  ...bunEnv,
  npm_lifecycle_event: undefined,
  NO_COLOR: "1",
  FORCE_COLOR: undefined,
  YOLO_HOME: undefined,
  BUN_CREATE_APHRODY_DIR: undefined,
};

async function run(args: string[], cwd?: string, extraEnv: Record<string, string | undefined> = {}) {
  await using proc = Bun.spawn({
    cmd: [bunExe(), ...args],
    env: { ...env, ...extraEnv },
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
  return { stdout, stderr, exitCode };
}

describe("embedded quality backend", () => {
  test("fmt reports an invalid file and still writes subsequent valid sources", async () => {
    using dir = tempDir("native-fmt-aggregate-errors", {
      "a-invalid.ts": "export const = ;",
      "z-valid.ts": "export const value={a:1};",
    });
    const result = await run(["fmt", "--write", "."], String(dir));
    expect(result).toMatchObject({ exitCode: 2, stderr: "" });
    expect(await Bun.file(join(String(dir), "a-invalid.ts")).text()).toBe("export const = ;");
    expect(await Bun.file(join(String(dir), "z-valid.ts")).text()).toBe("export const value = { a: 1 };\n");
    expect(result.stdout).toMatch(/^a-invalid\.ts: error: .+/m);
  });

  test.each(["fmt", "lint"])("%s prunes generated Python caches before reading or rewriting files", async command => {
    const invalid = "let = invalid";
    const unformatted = "export const cached={value:1};";
    const paths = [".pytest_cache", ".mypy_cache", ".ruff_cache", "__pycache__", ".venv"].flatMap(path => [
      path,
      `nested/${path}`,
    ]);
    using dir = tempDir("native-quality-python-caches", {
      "active.ts": "export const active = 1;\n",
      ...Object.fromEntries(
        paths.flatMap(path => [
          [`${path}/invalid.ts`, invalid],
          [`${path}/unformatted.ts`, unformatted],
        ]),
      ),
    });
    const flags = command === "fmt" ? ["--write"] : ["--fix"];
    expect(await run([command, ...flags, "."], String(dir))).toEqual({ stdout: "", stderr: "", exitCode: 0 });
    for (const path of paths) {
      expect(await Bun.file(join(String(dir), path, "invalid.ts")).text()).toBe(invalid);
      expect(await Bun.file(join(String(dir), path, "unformatted.ts")).text()).toBe(unformatted);
    }
    expect(await Bun.file(join(String(dir), "active.ts")).text()).toBe("export const active = 1;\n");
  });

  test("recursive formatting prunes Gitignored trees and protected stores before reading source", async () => {
    const ignored = "let = invalid";
    using dir = tempDir("native-fmt-pruned-trees", {
      ".gitignore": "generated/\n",
      "active.ts": "export const value={a:1};",
      "generated/secrets/fixture.ts": ignored,
      "generated/invalid.ts": ignored,
      "secrets/fixture.ts": ignored,
      ".codex/fixture.ts": ignored,
      ".claude/fixture.ts": ignored,
      ".aphrody/fixture.ts": ignored,
      "cookies/fixture.ts": ignored,
      "sessions/fixture.ts": ignored,
      "credentials/fixture.ts": ignored,
      "node_modules/fixture.ts": ignored,
      "target/fixture.ts": ignored,
    });
    expect(await run(["fmt", "--write", "."], String(dir))).toEqual({ stdout: "", stderr: "", exitCode: 0 });
    expect(await Bun.file(join(String(dir), "active.ts")).text()).toBe("export const value = { a: 1 };\n");
    for (const path of [
      "generated/secrets",
      "generated",
      "secrets",
      ".codex",
      ".claude",
      ".aphrody",
      "cookies",
      "sessions",
      "credentials",
      "node_modules",
      "target",
    ]) {
      const filename = path === "generated" ? "invalid.ts" : "fixture.ts";
      expect(await Bun.file(join(String(dir), path, filename)).text()).toBe(ignored);
    }
    expect(await run(["fmt", "--write", "generated"], String(dir))).toEqual({ stdout: "", stderr: "", exitCode: 0 });
  });

  test("recursive formatting preserves nested Gitignore negation", async () => {
    using dir = tempDir("native-fmt-nested-gitignore", {
      ".gitignore": "*.ts\n!active.ts\n",
      "active.ts": "export const active=1;",
      "nested/.gitignore": "!kept.ts\n",
      "nested/kept.ts": "export const kept=2;",
      "nested/ignored.ts": "let = invalid",
    });
    expect(await run(["fmt", "--write", "."], String(dir))).toEqual({ stdout: "", stderr: "", exitCode: 0 });
    expect(await Bun.file(join(String(dir), "active.ts")).text()).toBe("export const active = 1;\n");
    expect(await Bun.file(join(String(dir), "nested/kept.ts")).text()).toBe("export const kept = 2;\n");
    expect(await Bun.file(join(String(dir), "nested/ignored.ts")).text()).toBe("let = invalid");
  });

  test.each(["fmt", "lint"])("%s applies config and CLI ignores before reading ignored sources", async command => {
    const config = command === "fmt" ? ".oxfmtrc.json" : ".oxlintrc.json";
    using dir = tempDir("native-quality-config-ignores", {
      [config]: JSON.stringify({ ignorePatterns: ["generated/**"] }),
      "active.ts": "export const active = 1;\n",
      "generated/invalid.ts": "let = invalid",
      "cli-ignored/invalid.ts": "let = invalid",
    });
    for (const root of [".", "./"]) {
      expect(await run([command, "--ignore-pattern", "cli-ignored/**", root], String(dir))).toEqual({
        stdout: "",
        stderr: "",
        exitCode: 0,
      });
    }
    expect(await Bun.file(join(String(dir), "generated/invalid.ts")).text()).toBe("let = invalid");
    expect(await Bun.file(join(String(dir), "cli-ignored/invalid.ts")).text()).toBe("let = invalid");
    expect(await run([command, "generated/invalid.ts"], String(dir))).toEqual({ stdout: "", stderr: "", exitCode: 0 });
    expect(await run([command, "--ignore-pattern", "cli-ignored/**", "cli-ignored"], String(dir))).toEqual({
      stdout: "",
      stderr: "",
      exitCode: 0,
    });
  });

  test("fmt does not follow a symbolic link passed as an explicit root", async () => {
    using dir = tempDir("native-fmt-root-symlink", { "real/active.ts": "export const value={a:1};" });
    symlinkSync(join(String(dir), "real"), join(String(dir), "linked"), "junction");
    expect(await run(["fmt", "--write", "linked"], String(dir))).toEqual({ stdout: "", stderr: "", exitCode: 0 });
    expect(await Bun.file(join(String(dir), "real/active.ts")).text()).toBe("export const value={a:1};");
  });

  test.each(["--help", "-h"])("fmt treats %s after -- as a literal directory", async path => {
    using dir = tempDir("native-fmt-literal-help", { [`${path}/active.ts`]: "export const value={a:1};" });
    const result = await run(["fmt", "--check", "--", path], String(dir));
    expect(result.stdout).toContain("formatting differs");
    expect(result.stdout).not.toContain("Usage:");
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(1);
  });

  test.concurrent("global option values named fmt cannot narrow the native formatting scope", async () => {
    const source = "export const value={a:1};";
    using dir = tempDir("native-fmt-global-command-value", { fmt: "FMT_TEST_FIXTURE=1\n", "a.ts": source });
    const result = await run(["--env-file", "fmt", "fmt", "--check"], String(dir));
    expect(result.stdout).toContain("a.ts");
    expect(result.stdout).toContain("formatting differs");
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(1);
    expect(await Bun.file(join(String(dir), "a.ts")).text()).toBe(source);
  });

  test.concurrent("global option values named lint cannot narrow the native diagnostic scope", async () => {
    using dir = tempDir("native-lint-global-command-value", {
      lint: "LINT_TEST_FIXTURE=1\n",
      "a.ts": "debugger;\n",
      "lint.json": JSON.stringify({ rules: { "no-debugger": "error" } }),
    });
    const result = await run(["--env-file", "lint", "lint", "--config", "lint.json", "--format=json"], String(dir));
    expect(JSON.parse(result.stdout).diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "eslint(no-debugger)" })]),
    );
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(1);
  });

  test("stdin formatting shares the native core without opening a virtual file", async () => {
    using dir = tempDir("native-fmt-stdin", {
      "virtual.ts": "This file must remain untouched.\n",
      "config.json": JSON.stringify({ singleQuote: true }),
    });
    const format = async (source: string | Uint8Array, args: string[] = []) => {
      await using child = Bun.spawn([bunExe(), "fmt", "--stdin-filepath", "virtual.ts", ...args], {
        cwd: String(dir),
        env,
        stdin: new Blob([source]),
        stdout: "pipe",
        stderr: "pipe",
        timeout: 5000,
      });
      const [stdout, stderr, exitCode] = await Promise.all([child.stdout.text(), child.stderr.text(), child.exited]);
      return { stdout, stderr, exitCode };
    };
    const input = 'const value="hello"';
    const result = await format(input, ["--config", "config.json"]);
    expect(result).toEqual({ stdout: "const value = 'hello';\n", stderr: "", exitCode: 0 });
    expect(await format(input, ["--check"])).toEqual({ stdout: "", stderr: "", exitCode: 1 });
    expect(await format('const value = "hello";\n', ["--check"])).toEqual({ stdout: "", stderr: "", exitCode: 0 });
    for (const args of [["--write"], ["virtual.ts"], ["--stdin-filepath", "other.ts"]]) {
      const invalid = await format(input, args);
      expect(invalid.stdout).toBe("");
      expect(invalid.exitCode).toBe(2);
    }
    expect((await format(Uint8Array.of(0xff))).exitCode).toBe(2);
    expect((await format("let = ;")).exitCode).toBe(2);
    expect((await format(" ".repeat(8 * 1024 * 1024 + 1))).exitCode).toBe(2);
    expect(await Bun.file(join(String(dir), "virtual.ts")).text()).toBe("This file must remain untouched.\n");
  });
  test("native rule options preserve objects and reject invalid nested arrays", async () => {
    using dir = tempDir("native-rule-options", {
      "a.ts": "const _unused = 1; export {};\n",
      "lint.json": JSON.stringify({
        rules: {
          "no-unused-vars": ["error", { varsIgnorePattern: "^_", argsIgnorePattern: "^_" }],
        },
      }),
      "invalid.json": JSON.stringify({
        rules: { "no-unused-vars": ["error", [{ varsIgnorePattern: "^_" }]] },
      }),
    });
    const valid = await run(["lint", "--config", "lint.json", "a.ts"], String(dir));
    expect(valid.stderr).toBe("");
    expect(valid.stdout).toBe("");
    expect(valid.exitCode).toBe(0);
    const invalid = await run(["lint", "--config", "invalid.json", "a.ts"], String(dir));
    expect(invalid.stderr).toContain("Invalid 'vars' option for no-unused-vars");
    expect(invalid.exitCode).toBe(2);
  });

  test("compiler markers remain source protocol only inside builtin functions", async () => {
    const source =
      "$getter; export function a() {}\n$constructor; export function b() {}\n$linkTimeConstant; export function c() {}\n1 + 2;\n";
    using dir = tempDir("native-compiler-directives", {
      "src/js/builtins/markers.ts": source,
      "ordinary.ts": source,
      "lint.json": JSON.stringify({ rules: { "no-unused-expressions": "error" } }),
    });
    const builtin = await run(
      ["lint", "--config", "lint.json", "--format=json", "src/js/builtins/markers.ts"],
      String(dir),
    );
    expect(builtin.stderr).toBe("");
    expect(
      JSON.parse(builtin.stdout).diagnostics.filter((item: any) => item.code === "eslint(no-unused-expressions)"),
    ).toHaveLength(1);
    expect(builtin.exitCode).toBe(1);
    const ordinary = await run(["lint", "--config", "lint.json", "--format=json", "ordinary.ts"], String(dir));
    expect(ordinary.stderr).toBe("");
    expect(
      JSON.parse(ordinary.stdout).diagnostics.filter((item: any) => item.code === "eslint(no-unused-expressions)"),
    ).toHaveLength(4);
    expect(ordinary.exitCode).toBe(1);
  });

  test("custom rule respects parsed comment scopes and ignores strings or unrelated rules", async () => {
    const rule = "bun/no-duplicate-conditional-property-access";
    const plugin = await Bun.file(new URL("../../../scripts/oxlint-plugins/bun.js", import.meta.url)).text();
    using dir = tempDir("native-rule-comments", {
      "plugin.js": plugin,
      "lint.json": JSON.stringify({ jsPlugins: ["./plugin.js"], rules: { [rule]: "error" } }),
      "a.ts": `// oxlint-disable-next-line ${rule}\nif (obj.a) use(obj.a);\n/* oxlint-disable-next-line ${rule} */\nif (obj.b) use(obj.b);\nif (obj.c) use(obj.c); // oxlint-disable-line ${rule}\n/* oxlint-disable ${rule} */\nif (obj.d) use(obj.d);\n/* oxlint-enable ${rule} */\nif (obj.e) use(obj.e);\n// oxlint-disable-next-line no-debugger\nif (obj.f) use(obj.f);\nconst text = "oxlint-disable-next-line ${rule}";\nif (obj.g) use(obj.g);\n`,
    });
    const result = await run(["lint", "--config", "lint.json", "--format=json", "a.ts"], String(dir));
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout).diagnostics.filter((item: any) => item.code === rule)).toHaveLength(3);
    expect(result.exitCode).toBe(1);
  });
  test("compiled Bun getter rule preserves caching, writes and receiver semantics", async () => {
    const plugin = await Bun.file(new URL("../../../scripts/oxlint-plugins/bun.js", import.meta.url)).text();
    using dir = tempDir("native-bun-rule", {
      "plugin.js": plugin,
      "a.ts": "if (obj.x) use(obj.x);\nif (obj.x) obj.x++;\nif (obj.x) obj.x();\nif (local = obj.x) use(obj.x);\n",
      "lint.json": JSON.stringify({
        jsPlugins: ["./plugin.js"],
        rules: { "bun/no-duplicate-conditional-property-access": "error" },
      }),
    });
    const checked = await run(["lint", "--config", "lint.json", "--format=json", "a.ts"], String(dir));
    expect(checked.stderr).toBe("");
    const findings = JSON.parse(checked.stdout).diagnostics.filter(
      (diagnostic: any) => diagnostic.code === "bun/no-duplicate-conditional-property-access",
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain("`obj.x` is read");
    expect(checked.exitCode).toBe(1);
  });
  test("lint uses native configuration and never invokes an external override", async () => {
    using dir = tempDir("native-lint", {
      "a.ts": "debugger;\n",
      "lint.json": JSON.stringify({ rules: { "no-debugger": "error" } }),
      "external.ts": "throw new Error('external backend was invoked');",
    });
    await using proc = Bun.spawn({
      cmd: [bunExe(), "lint", "--no-n2b", "--config", "lint.json", "--format=json", "a.ts"],
      cwd: String(dir),
      env: { ...env, BUN_OXLINT: join(String(dir), "external.ts") },
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdout = await proc.stdout.text();
    expect(await proc.stderr.text()).toBe("");
    const result = JSON.parse(stdout);
    expect(result.diagnostics.some((diagnostic: any) => diagnostic.severity === "error")).toBe(true);
    expect(await proc.exited).toBe(1);
  });

  test("fmt checks, writes and then accepts native formatted source", async () => {
    using dir = tempDir("native-fmt", {
      "a.ts": "const x={a:1};",
      "format.json": JSON.stringify({ printWidth: 120 }),
    });
    const checked = await run(["fmt", "--check", "--config", "format.json", "a.ts"], String(dir));
    expect(checked.stdout).toContain("formatting differs");
    expect(checked.exitCode).toBe(1);
    const written = await run(["fmt", "--write", "--config", "format.json", "a.ts"], String(dir));
    expect(written.stdout).toBe("");
    expect(written.exitCode).toBe(0);
    const clean = await run(["fmt", "--check", "--config", "format.json", "a.ts"], String(dir));
    expect(clean.stdout).toBe("");
    expect(clean.exitCode).toBe(0);
  });

  test("native lint respects Gitignore and rejects unsupported flags", async () => {
    using dir = tempDir("native-ignore", {
      "a.ts": "debugger;",
      ".gitignore": "a.ts\n",
      "lint.json": JSON.stringify({ rules: { "no-debugger": "error" } }),
    });
    const ignored = await run(["lint", "--config", "lint.json", "--format=json", "."], String(dir));
    expect(JSON.parse(ignored.stdout).diagnostics).toEqual([]);
    expect(ignored.exitCode).toBe(0);
    const unsupported = await run(["lint", "--unknown-native-option"], String(dir));
    expect(unsupported.stderr).toContain("unsupported native option");
    expect(unsupported.exitCode).toBe(2);
  });
});

describe("routing", () => {
  test.concurrent.each(["check", "lint", "fmt", "n2b", "migrate"])(
    "%s rejects --external-backend as an unknown option",
    async command => {
      using dir = tempDir("native-toolchain-reject-external", { "app.ts": "export const value = 1;\n" });
      const result = await run([command, "--external-backend"], String(dir));
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("--external-backend");
      expect(result.exitCode).not.toBe(0);
    },
  );

  test.concurrent.each(["lint", "fmt"])("%s ignores external backend environment overrides", async command => {
    using dir = tempDir("native-toolchain-ignore-overrides", {
      "app.ts": "export const value = 1;\n",
      "external.ts": "await Bun.write(import.meta.dir + '/invoked', 'wrong'); process.exit(43);",
    });
    const args = command === "lint" ? ["lint", "--format=json", "app.ts"] : ["fmt", "--check", "app.ts"];
    const result = await run(args, String(dir), {
      BUN_OXLINT: join(String(dir), "external.ts"),
      BUN_OXFMT: join(String(dir), "external.ts"),
      BUN_N2B: join(String(dir), "external.ts"),
    });
    if (command === "lint") expect(JSON.parse(result.stdout).diagnostics).toEqual([]);
    else expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
    expect(await Bun.file(join(String(dir), "invoked")).exists()).toBe(false);
    expect(result.exitCode).toBe(0);
  });

  test.concurrent.each(["lint", "fmt"])("wasm crate named %s keeps the wasm dispatcher", async crate => {
    const result = await run(["wasm", "build", crate, "--help"]);
    expect(result.stdout).toContain("Usage: bun wasm <command>");
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
  });

  test.concurrent.each(["lint", "fmt"])("%s treats --external-backend after -- as a path", async command => {
    using dir = tempDir("quality-literal-external-path", {
      "--external-backend/app.ts": "export const value = 1;\n",
      "external.ts": "throw new Error('external backend was invoked');",
    });
    const args = command === "lint" ? ["lint", "--format=json"] : ["fmt", "--check"];
    const result = await run([...args, "--", "--external-backend"], String(dir), {
      BUN_OXLINT: join(String(dir), "external.ts"),
      BUN_OXFMT: join(String(dir), "external.ts"),
    });
    if (command === "lint") expect(JSON.parse(result.stdout).diagnostics).toEqual([]);
    else expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
  });

  test.concurrent("check analyzes --external-backend after -- as a literal source path", async () => {
    using dir = tempDir("native-check-literal-backend-path", {
      "--external-backend/app.ts": "export const value: number = 'wrong';\n",
      "tsconfig.json": JSON.stringify({ compilerOptions: { strict: true, noEmit: true, lib: ["esnext"], types: [] } }),
    });
    const result = await run(["check", "--", "--external-backend/app.ts"], String(dir), {
      AGENT: "0",
      CLAUDECODE: undefined,
      GITHUB_ACTIONS: undefined,
    });
    expect(result.stdout).toContain("TS2322");
    expect(result.stdout.replaceAll("\\", "/")).toContain("--external-backend/app.ts");
    expect(result.stderr).toMatch(/^Found 1 error in 1 file, checked 1 file \[/);
    expect(result.exitCode).toBe(1);
  });

  test.concurrent("native commands reserve their names; explicit run executes package scripts", async () => {
    using dir = tempDir("toolchain-script", {
      "package.json": JSON.stringify({
        scripts: { lint: "echo the lint script ran", fmt: "echo the fmt script ran" },
      }),
    });
    const nativeLint = await run(["lint", "--help"], String(dir));
    const nativeFmt = await run(["fmt", "--help"], String(dir));
    expect(nativeLint.stdout).toContain("Embedded OXC");
    expect(nativeFmt.stdout).toContain("Embedded OXC");
    expect(nativeLint.exitCode).toBe(0);
    expect(nativeFmt.exitCode).toBe(0);
    const lint = await run(["run", "lint"], String(dir));
    const fmt = await run(["run", "fmt"], String(dir));
    expect(lint.stdout.trim()).toBe("the lint script ran");
    expect(fmt.stdout.trim()).toBe("the fmt script ran");
    expect(lint.exitCode).toBe(0);
    expect(fmt.exitCode).toBe(0);
  });

  test.concurrent("inside that script, `bun lint` is the command", async () => {
    using dir = tempDir("toolchain-script-self", {
      "package.json": JSON.stringify({ scripts: { lint: `${bunExe()} lint --help` } }),
    });
    const { stdout, exitCode } = await run(["run", "lint"], String(dir));
    expect(stdout).toContain("Usage: bun lint");
    expect(exitCode).toBe(0);
  });

  test.concurrent.each([
    ["lint", "Usage: bun lint"],
    ["fmt", "Usage: bun fmt"],
    ["n2b", "--report"],
    ["migrate", "Usage: bun migrate"],
    ["wasm", "Usage: bun wasm <command>"],
  ])("bun %s --help", async (command, usage) => {
    using dir = tempDir("toolchain-help", {});
    const { stdout, stderr, exitCode } = await run([command, "--help"], String(dir));
    expect(stderr).toBe("");
    expect(stdout).toContain(usage);
    expect(exitCode).toBe(0);
  });

  test.concurrent("bun build --target=wasm is the wasm build", async () => {
    const help = await run(["build", "--target=wasm", "--help"]);
    expect(help.stdout).toContain("Usage: bun wasm <command>");
    expect(help.exitCode).toBe(0);
    const unknown = await run(["build", "--target", "wasm", "--bogus"]);
    expect(unknown.stderr).toContain("Unknown flag --bogus");
    expect(unknown.exitCode).toBe(1);
  });

  test.concurrent("bun build without --target=wasm still bundles", async () => {
    using dir = tempDir("toolchain-build-js", { "index.ts": `console.log("wasm" as string);` });
    const { stdout, exitCode } = await run(["build", "index.ts", "--target=bun"], String(dir));
    expect(stdout).toContain(`console.log("wasm")`);
    expect(exitCode).toBe(0);
  });
});

describe("bun n2b / bun migrate", () => {
  const dryRunLog = "[migrate] dry-run : aucun effet de bord exécuté\n[migrate]   [run] — bun install\n";

  test.concurrent("reserves native migration commands and runs package scripts only through bun run", async () => {
    using dir = tempDir("native-n2b-package-script", {
      "package.json": JSON.stringify({ scripts: { n2b: "echo package n2b", migrate: "echo package migrate" } }),
    });
    const nativeN2b = await run(["n2b", "--help"], String(dir));
    const nativeMigrate = await run(["migrate", "--help"], String(dir));
    expect(nativeN2b.stdout).toContain("--report");
    expect(nativeMigrate.stdout).toContain("Usage: bun migrate");
    expect(nativeN2b.stderr).toBe("");
    expect(nativeMigrate.stderr).toBe("");
    expect([nativeN2b.exitCode, nativeMigrate.exitCode]).toEqual([0, 0]);
    const n2b = await run(["run", "n2b"], String(dir));
    const migrate = await run(["run", "migrate"], String(dir));
    expect(n2b.stdout.trim()).toBe("package n2b");
    expect(migrate.stdout.trim()).toBe("package migrate");
    expect([n2b.exitCode, migrate.exitCode]).toEqual([0, 0]);
  });

  test.concurrent("lists linked rules without consulting an external override", async () => {
    using dir = tempDir("native-n2b-rules", {
      "external.ts": "throw new Error('external n2b backend was invoked');",
    });
    const result = await run(["n2b", "rules", "--report=json"], String(dir), {
      BUN_N2B: join(String(dir), "external.ts"),
    });
    const rules = JSON.parse(result.stdout);
    expect(rules).toEqual(expect.arrayContaining([expect.objectContaining({ id: "api/fs-readFileSync" })]));
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
  });

  test.concurrent.each(["--cwd", "--cwd="])("scans local sources as JSON and honors global %s", async cwdFlag => {
    const source = "#!/usr/bin/env node\nconsole.log('hello');\n";
    using dir = tempDir("native-n2b-scan", { "app.js": source });
    const cwdArgs = cwdFlag === "--cwd" ? [cwdFlag, String(dir)] : [`${cwdFlag}${dir}`];
    const result = await run([...cwdArgs, "n2b", "--report=json", "--agent"]);
    const report = JSON.parse(result.stdout);
    expect(report.schema_version).toBe(2);
    expect(report.tool).toBe("node2bun");
    expect(report.files.find((file: any) => file.path === "app.js").findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ rule_id: "shebang/node" })]),
    );
    expect(await Bun.file(join(String(dir), "app.js")).text()).toBe(source);
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(1);
  });

  test.concurrent("rejects --cwd after the command instead of silently scanning another directory", async () => {
    using dir = tempDir("native-n2b-cwd-after", { "nested/app.js": "console.log('hello');\n" });
    const result = await run(["n2b", "--cwd", "nested", "--report=json"], String(dir));
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("--cwd");
    expect(result.exitCode).toBe(2);
  });

  test.concurrent("migrate aliases plan the same changes without writing or installing", async () => {
    const manifest = JSON.stringify({ name: "fixture", private: true, scripts: { start: "node app.js" } });
    using dir = tempDir("native-n2b-migrate", { "package.json": manifest, "app.js": "console.log('hello');\n" });
    const migrate = await run(["migrate", "--dry-run", "--report=json", "--agent"], String(dir));
    const n2b = await run(["n2b", "--agent", "--report", "json", "migrate", "--dry-run", "."], String(dir));
    const direct = await run(["n2b", "--migrate", "--dry-run", "--report=json", "--agent"], String(dir));
    const report = JSON.parse(migrate.stdout);
    expect(report.migration_plan.dry_run).toBe(true);
    expect(report.migration_plan.steps).toEqual(
      expect.arrayContaining([expect.objectContaining({ action: "run", detail: "bun install" })]),
    );
    const expected = {
      ...report,
      report_card: { ...report.report_card, timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) },
    };
    expect(JSON.parse(n2b.stdout)).toEqual(expected);
    expect(JSON.parse(direct.stdout)).toEqual(expected);
    expect([migrate.stderr, n2b.stderr, direct.stderr]).toEqual([dryRunLog, dryRunLog, dryRunLog]);
    expect([migrate.exitCode, n2b.exitCode, direct.exitCode]).toEqual([0, 0, 0]);
    expect(await Bun.file(join(String(dir), "package.json")).text()).toBe(manifest);
    expect(await Bun.file(join(String(dir), "bun.lock")).exists()).toBe(false);
    expect(await Bun.file(join(String(dir), ".n2b/state.json")).exists()).toBe(false);
  });

  test.concurrent("keeps option values and paths after -- out of migration alias parsing", async () => {
    using dir = tempDir("native-n2b-literal-migrate", {
      "migrate/app.js": "#!/usr/bin/env node\n",
      "--external-backend/app.js": "#!/usr/bin/env node\n",
    });
    const result = await run(["n2b", "--report", "json", "--agent", "--ignore", "migrate", "."], String(dir));
    expect(JSON.parse(result.stdout).mode).toBe("check");
    const literal = await run(["n2b", "--report=json", "--agent", "--", "migrate"], String(dir));
    const report = JSON.parse(literal.stdout);
    expect(report.mode).toBe("check");
    expect(report.root.replaceAll("\\", "/")).toEndWith("/migrate");
    expect(report.files.find((file: any) => file.path === "app.js").findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ rule_id: "shebang/node" })]),
    );
    expect(literal.stderr).toBe("");
    expect(literal.exitCode).toBe(1);
    const backendPath = await run(["n2b", "--report=json", "--agent", "--", "--external-backend"], String(dir));
    const backendReport = JSON.parse(backendPath.stdout);
    expect(backendReport.root.replaceAll("\\", "/")).toEndWith("/--external-backend");
    expect(backendReport.files.find((file: any) => file.path === "app.js").findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ rule_id: "shebang/node" })]),
    );
    expect(backendPath.stderr).toBe("");
    expect(backendPath.exitCode).toBe(1);
    // A leading delimiter also makes --dry-run an operand; losing it would select migration.
    const leading = await run(["n2b", "--", "migrate", "--dry-run"], String(dir));
    expect(leading.stdout).toBe("");
    expect(leading.stderr).toContain("--dry-run");
    expect(leading.exitCode).toBe(2);
  });

  test.concurrent("global option values named n2b cannot replace the parsed command", async () => {
    using dir = tempDir("n2b-global-command-value", {
      "n2b": "N2B_TEST_FIXTURE=1\n",
      "app.js": "#!/usr/bin/env node\n",
    });
    const result = await run(["--env-file", "n2b", "n2b", "--report=json", "--agent"], String(dir));
    const report = JSON.parse(result.stdout);
    expect(report.files.find((file: any) => file.path === "app.js").findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ rule_id: "shebang/node" })]),
    );
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(1);
  });

  test.concurrent.each(["--help", "--external-backend"])("migrate treats %s after -- as a path", async root => {
    const manifest = JSON.stringify({ name: "literal-help", private: true });
    using dir = tempDir("native-migrate-help-path", { [`${root}/package.json`]: manifest });
    const result = await run(["migrate", "--dry-run", "--report=json", "--agent", "--", root], String(dir));
    const report = JSON.parse(result.stdout);
    expect(report.root.replaceAll("\\", "/")).toEndWith(`/${root}`);
    expect(report.migration_plan.dry_run).toBe(true);
    expect(result.stderr).toBe(dryRunLog);
    expect(result.exitCode).toBe(0);
    expect(await Bun.file(join(String(dir), root, "package.json")).text()).toBe(manifest);
    expect(await Bun.file(join(String(dir), root, "bun.lock")).exists()).toBe(false);
  });
});

describe("bun create aphrody/<template>", () => {
  const stack = {
    "aphrody/m3/templates/stack.toml": [
      `[meta]\nname = "aphrody-stack"\n`,
      `[template.base]\npath = "m3/templates/base"\ndescription = "server"\nrequired = true\n`,
      `[template.web]\npath = "m3/templates/web"\ndescription = "web"\nexclusive = "frontend"\n`,
      `[template.react]\npath = "m3/templates/react"\ndescription = "react"\nexclusive = "frontend"\ndependencies = { react = "19.3.0" }\n`,
    ].join("\n"),
    "aphrody/m3/templates/base/package.json": JSON.stringify({
      name: "__NAME__",
      dependencies: { "@aphrody/runtime-sdk": "file:__YOLO__/packages/engine/runtime" },
      devDependencies: {},
    }),
    "aphrody/m3/templates/base/gitignore": "node_modules\n",
    "aphrody/m3/templates/base/src/home.ts": `export const home = "base __IDENT__";\n`,
    "aphrody/m3/templates/web/src/home.ts": `export const home = "web";\n`,
    "aphrody/m3/templates/react/src/app.tsx": `export {};\n`,
  };

  test.concurrent("composes the required layer and the requested ones", async () => {
    using dir = tempDir("toolchain-create", stack);
    const { stdout, stderr, exitCode } = await run(
      ["create", "aphrody/web", "my-app", "--templates", "aphrody/m3/templates"],
      String(dir),
    );
    expect(stderr).toBe("");
    expect(stdout).toContain("Created my-app (3 files: base, web)");
    const app = join(String(dir), "my-app");
    expect(await Bun.file(join(app, "src/home.ts")).text()).toBe(`export const home = "web";\n`);
    expect(await Bun.file(join(app, ".gitignore")).text()).toBe("node_modules\n");
    const pkg = await Bun.file(join(app, "package.json")).json();
    expect(pkg.name).toBe("my-app");
    expect(pkg.dependencies["@aphrody/runtime-sdk"]).toMatch(/^file:.*\/aphrody\/packages\/engine\/runtime$/);
    expect(exitCode).toBe(0);
  });

  test.concurrent("finds the templates of the checkout around the working directory", async () => {
    using dir = tempDir("toolchain-create-checkout", stack);
    const { stdout, exitCode } = await run(["create", "aphrody/react", "app"], join(String(dir), "aphrody"));
    expect(stdout).toContain("Created app (4 files: base, react)");
    const pkg = await Bun.file(join(String(dir), "aphrody", "app", "package.json")).json();
    expect(pkg.dependencies.react).toBe("19.3.0");
    expect(exitCode).toBe(0);
  });

  test.concurrent("rejects two templates of one exclusive group", async () => {
    using dir = tempDir("toolchain-create-exclusive", stack);
    const { stderr, exitCode } = await run(["create", "aphrody/web+react", "app"], join(String(dir), "aphrody"));
    expect(stderr).toContain("Choose one frontend template: web or react");
    expect(exitCode).toBe(1);
  });

  test.concurrent("bun create aphrody --list lists the templates", async () => {
    using dir = tempDir("toolchain-create-list", stack);
    const { stdout, exitCode } = await run(["create", "aphrody", "--list"], join(String(dir), "aphrody"));
    const row = (id: string, always: boolean, description: string) =>
      `  ${id.padEnd(8)} ${always ? "(always) " : "         "}${description}`;
    expect(stdout.split("\n").slice(1)).toEqual([
      row("base", true, "server"),
      row("web", false, "web"),
      row("react", false, "react"),
      "",
    ]);
    expect(exitCode).toBe(0);
  });
});

describe("bun:wasm", () => {
  test.concurrent("invalid wasm options are rejected before starting external tools", async () => {
    const { stdout, exitCode } = await run([
      "-e",
      `const wasm = require("bun:wasm");
const errors = [];
for (const run of [() => wasm.build(null), () => wasm.optimize("missing.wasm", { level: "invalid" })]) {
  try { await run(); } catch (error) { errors.push(error.message); }
}
console.log(JSON.stringify(errors));`,
    ]);
    const errors = JSON.parse(stdout);
    expect(errors).toHaveLength(2);
    expect(errors[0]).toContain("options");
    expect(errors[1]).toBe("Unknown wasm-opt level -invalid");
    expect(exitCode).toBe(0);
  });

  test.concurrent("exports build, optimize and plugin", async () => {
    const { stdout, exitCode } = await run([
      "-e",
      `const wasm = require("bun:wasm"); console.log(Object.keys(wasm).sort().join(), typeof wasm.plugin().setup);`,
    ]);
    expect(stdout.trim()).toBe("build,optimize,plugin function");
    expect(exitCode).toBe(0);
  });

  // Stands in for cargo: answers `metadata` for the --manifest-path crate, writes an empty module on
  // `build`, and logs each call next to itself.
  const fakeCargo = `
const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2);
const manifest = args[args.indexOf("--manifest-path") + 1];
const logged = args.filter(a => a !== "--manifest-path" && a !== manifest);
fs.appendFileSync(path.join(__dirname, "calls.txt"), logged.join(" ") + "\\n");
const targetDirectory = path.join(__dirname, "target");
if (args[0] === "metadata") {
  console.log(JSON.stringify({
    workspace_root: path.dirname(manifest),
    target_directory: targetDirectory,
    packages: [{ name: "add", version: "0.1.0", manifest_path: manifest, dependencies: [],
      targets: [{ name: "add", kind: ["cdylib"] }] }],
  }));
} else if (args[0] === "build") {
  const out = path.join(targetDirectory, args[args.indexOf("--target") + 1], "release");
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, "add.wasm"), Uint8Array.of(0, 0x61, 0x73, 0x6d, 1, 0, 0, 0));
} else process.exit(2);
`;

  // CLI and API each start Cargo shims as debug/ASAN subprocesses (measured 5.8s on the VPS).
  test("bun wasm build --cargo and the cargo option replace cargo", async () => {
    using dir = tempDir("toolchain-wasm-cargo", {
      "add/Cargo.toml": `[package]\nname = "add"\nversion = "0.1.0"\n`,
      "fake-cargo.js": fakeCargo,
      "api.ts": `import { build } from "bun:wasm";
const { bytes } = await build({ crate: "add", outdir: "api-pkg", optimize: false, quiet: true, cargo: [process.execPath, import.meta.dir + "/fake-cargo.js"] });
console.log(bytes);
`,
    });
    const fake = join(String(dir), "fake-cargo.js");
    const cli = await run(["wasm", "build", "add", "--no-opt", `--cargo="${bunExe()}" "${fake}"`], String(dir));
    expect(cli.stdout).toContain("built add");
    expect(cli.exitCode).toBe(0);
    const api = await run(["api.ts"], String(dir));
    expect(api.stdout.trim()).toBe("8");
    expect(api.exitCode).toBe(0);
    const calls = await Bun.file(join(String(dir), "calls.txt")).text();
    const cargoCalls = [
      "metadata --format-version 1 --no-deps",
      "build --lib --target wasm32-unknown-unknown --release",
    ];
    expect(calls.split("\n")).toEqual([...cargoCalls, ...cargoCalls, ""]);
    expect(await Bun.file(join(String(dir), "add", "pkg", "add.wasm")).bytes()).toEqual(
      Uint8Array.of(0, 0x61, 0x73, 0x6d, 1, 0, 0, 0),
    );
    expect(await Bun.file(join(String(dir), "add", "pkg", "add.js")).exists()).toBe(true);
  }, 20_000);

  // Compiles a crate: needs cargo with the wasm32-unknown-unknown target.
  test.skipIf(!Bun.which("cargo"))(
    "bun wasm build packages a crate and the plugin imports Cargo.toml",
    async () => {
      using dir = tempDir("toolchain-wasm", {
        "add/Cargo.toml": `[package]\nname = "add"\nversion = "0.1.0"\nedition = "2021"\n\n[lib]\ncrate-type = ["cdylib"]\n\n[workspace]\n`,
        "add/src/lib.rs": `#[no_mangle]\npub extern "C" fn add(a: i32, b: i32) -> i32 { a + b }\n`,
        "main.ts": `import init from "./add/pkg/add.js";\nconsole.log((await init()).add(2, 3));\n`,
        "plugin.ts": `import { plugin } from "bun:wasm";\nBun.plugin(plugin({ optimize: false }));\n`,
        "imported.ts": `import init from "./add/Cargo.toml";\nconsole.log((await init()).add(4, 5));\n`,
      });
      const build = await run(["wasm", "build", "add", "--no-opt"], String(dir));
      expect(build.stderr).not.toContain("error:");
      expect(build.exitCode).toBe(0);
      const main = await run(["main.ts"], String(dir));
      expect(main.stdout.trim()).toBe("5");
      expect(main.exitCode).toBe(0);
      const imported = await run(["--preload", "./plugin.ts", "imported.ts"], String(dir));
      expect(imported.stdout.trim()).toBe("9");
      expect(imported.exitCode).toBe(0);
    },
    240_000,
  );
});
