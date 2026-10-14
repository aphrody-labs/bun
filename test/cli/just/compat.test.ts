import { describe, expect, test } from "bun:test";
import { bunEnv, bunExe, tempDir } from "harness";
import { join } from "node:path";

const env = {
  ...bunEnv,
  npm_lifecycle_event: undefined,
  BUN_JUST_TEST_UNSET: undefined,
  BUN_JUST_DOTENV_MARKER: undefined,
  NO_COLOR: "1",
  FORCE_COLOR: undefined,
};

async function run(cwd: string, args: string[]) {
  await using child = Bun.spawn([bunExe(), "--no-env-file", "just", "--bun-shell", ...args], {
    cwd,
    env,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 10000,
    windowsHide: true,
  });
  const [stdout, stderr, exitCode] = await Promise.all([child.stdout.text(), child.stderr.text(), child.exited]);
  return { stdout, stderr, exitCode };
}

describe("Just recipes with the opt-in Bun Shell", () => {
  test("combines backtick values and exported variables", async () => {
    using dir = tempDir("bun-just-backtick-export", {
      justfile: `export WHO := 'Bun'
captured := \`printf captured\`
check:
  @printf '%s|%s\\n' "$WHO" '{{captured}}'
`,
    });
    const result = await run(String(dir), ["check"]);
    expect(result.stdout).toBe("Bun|captured\n");
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
  });

  test("preserves redirections, append operations, and pipelines", async () => {
    using dir = tempDir("bun-just-pipelines", {
      justfile: `write:
  @printf 'first\\n' > 'result & (with spaces); [1].txt'

append:
  @printf 'second\\n' >> 'result & (with spaces); [1].txt'

read:
  @cat 'result & (with spaces); [1].txt'

check:
  @cat 'result & (with spaces); [1].txt' | cat
`,
    });
    const written = await run(String(dir), ["write"]);
    expect(written.stderr).toBe("");
    expect(written.exitCode).toBe(0);
    expect(written.stdout).toBe("");
    expect(await Bun.file(join(String(dir), "result & (with spaces); [1].txt")).text()).toBe("first\n");
    const appended = await run(String(dir), ["append"]);
    expect(appended.stderr).toBe("");
    expect(appended.exitCode).toBe(0);
    expect(appended.stdout).toBe("");
    expect(await Bun.file(join(String(dir), "result & (with spaces); [1].txt")).text()).toBe("first\nsecond\n");
    const read = await run(String(dir), ["read"]);
    expect(read.stderr).toBe("");
    expect(read.exitCode).toBe(0);
    expect(read.stdout).toBe("first\nsecond\n");
    const result = await run(String(dir), ["check"]);
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("first\nsecond\n");
  });

  test("runs directory, copy, move, and removal operations inside the recipe directory", async () => {
    using dir = tempDir("bun-just-file-operations", {
      justfile: `check:
  @mkdir -p 'data with spaces'
  @printf 'file contents\\n' > 'data with spaces/input.txt'
  @cp 'data with spaces/input.txt' 'data with spaces/copy.txt'
  @mv 'data with spaces/copy.txt' 'data with spaces/result.txt'
  @rm 'data with spaces/input.txt'
  @cat 'data with spaces/result.txt'
`,
    });
    const result = await run(String(dir), ["check"]);
    expect(result.stdout).toBe("file contents\n");
    expect(result.stderr).toBe("");
    expect(await Bun.file(join(String(dir), "data with spaces/result.txt")).text()).toBe("file contents\n");
    expect(await Bun.file(join(String(dir), "data with spaces/input.txt")).exists()).toBe(false);
    expect(await Bun.file(join(String(dir), "data with spaces/copy.txt")).exists()).toBe(false);
    expect(result.exitCode).toBe(0);
  });

  test("runs dependencies before an alias with default and supplied arguments", async () => {
    using dir = tempDir("bun-just-alias-arguments", {
      justfile: `alias check := greet

prepare:
  @printf 'prepared\\n'

greet name suffix='two words': prepare
  @printf '%s|%s\\n' '{{name}}' '{{suffix}}'
`,
    });
    const result = await run(String(dir), ["check", "Bun Shell"]);
    expect(result.stdout).toBe("prepared\nBun Shell|two words\n");
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
  });

  test("short circuits commands and stops subsequent lines after a failing recipe", async () => {
    using dir = tempDir("bun-just-command-status", {
      justfile: `check:
  @false && printf wrong || printf 'fallback\\n'
  @true || printf wrong
  @printf 'before failure\\n'; exit 19
  @printf wrong
`,
    });
    const result = await run(String(dir), ["check"]);
    expect(result.stdout).toBe("fallback\nbefore failure\n");
    expect(result.stderr).toContain("exit code 19");
    expect(result.exitCode).toBe(19);
  });

  test("rejects an unset variable as the default Just shell's -u mode requires", async () => {
    using dir = tempDir("bun-just-unset-variable", {
      justfile: `check:
  @printf '%s' "$BUN_JUST_TEST_UNSET"
  @printf wrong
`,
    });
    const result = await run(String(dir), ["check"]);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("BUN_JUST_TEST_UNSET");
    expect(result.exitCode).not.toBe(0);
  });

  test("--no-dotenv overrides Just loading and neither Bun process loads the file implicitly", async () => {
    using dir = tempDir("bun-just-no-dotenv", {
      ".env": "BUN_JUST_DOTENV_MARKER=dotenv-only\n",
      justfile: `set dotenv-load
check:
  @printf '%s\\n' '{{env("BUN_JUST_DOTENV_MARKER", "absent")}}'
`,
    });
    const disabled = await run(String(dir), ["--no-dotenv", "check"]);
    expect(disabled.stdout).toBe("absent\n");
    expect(disabled.stderr).toBe("");
    expect(disabled.exitCode).toBe(0);
    const enabled = await run(String(dir), ["check"]);
    expect(enabled.stdout).toBe("dotenv-only\n");
    expect(enabled.stderr).toBe("");
    expect(enabled.exitCode).toBe(0);
  });

  test("propagates the failing last command of a pipeline", async () => {
    using dir = tempDir("bun-just-pipeline-status", {
      justfile: "check:\n  @printf data | false\n  @printf wrong\n",
    });
    const result = await run(String(dir), ["check"]);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("exit code 1");
    expect(result.exitCode).toBe(1);
  });

  test("preserves Unicode, empty arguments, and quoted shell metacharacters", async () => {
    using dir = tempDir("bun-just-literal-arguments", {
      justfile: `check first second third:
  @printf '<%s>|<%s>|<%s>\\n' '{{first}}' '{{second}}' '{{third}}'
`,
    });
    const result = await run(String(dir), ["check", "héllo 世界 🐉", "", "a&b|c<d>e"]);
    expect(result.stdout).toBe("<héllo 世界 🐉>|<>|<a&b|c<d>e>\n");
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
  });
});
