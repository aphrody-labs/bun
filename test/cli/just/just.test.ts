import { describe, expect, test } from "bun:test";
import { bunEnv, bunExe, isWindows, tempDir } from "harness";
import { delimiter, dirname, join } from "node:path";

const env: Record<string, string | undefined> = { ...bunEnv, npm_lifecycle_event: undefined, NO_COLOR: "1", FORCE_COLOR: undefined };

async function run(
  cwd: string,
  args: string[],
  extraEnv: Record<string, string | undefined> = {},
  bunShell = true,
) {
  const command = args.indexOf("just");
  if (bunShell && command !== -1) args = [...args.slice(0, command + 1), "--bun-shell", ...args.slice(command + 1)];
  await using child = Bun.spawn([bunExe(), ...args], {
    cwd,
    env: { ...env, ...extraEnv },
    stdout: "pipe",
    stderr: "pipe",
    timeout: 10000,
    windowsHide: true,
  });
  const [stdout, stderr, exitCode] = await Promise.all([child.stdout.text(), child.stderr.text(), child.exited]);
  return { stdout, stderr, exitCode };
}

describe("embedded just", () => {
  test("preserves the upstream sh default for POSIX recipes", async () => {
    using dir = tempDir("bun-just-default-sh", {
      justfile:
        'check:\n  @value=prefix-safe; for word in one two; do printf "%s:%s\\n" "$word" "${value#prefix-}"; done\n',
    });
    const result = await run(
      String(dir),
      ["just", "check"],
      isWindows ? { PATH: `C:/Program Files/Git/usr/bin${delimiter}${env.PATH ?? process.env.PATH ?? ""}` } : {},
      false,
    );
    expect(result.stdout.replaceAll("\r\n", "\n")).toBe("one:safe\ntwo:safe\n");
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
  });

  test("lists and runs imported recipes and arguments through Bun Shell", async () => {
    using dir = tempDir("bun-just-recipes", {
      justfile: "import 'shared.just'\n\ngreet name='world': prepare\n  @echo hello {{name}}\n",
      "shared.just": "prepare:\n  @echo prepared\n",
    });
    const listing = await run(String(dir), ["just", "--list"]);
    expect(listing.stdout).toContain("greet");
    expect(listing.stdout).toContain("prepare");
    expect(listing.exitCode).toBe(0);
    const result = await run(String(dir), ["just", "greet", "Bun"]);
    expect(result.stdout.replaceAll("\r\n", "\n")).toBe("prepared\nhello Bun\n");
    expect(result.exitCode).toBe(0);
  });

  test("dry-run prints recipes without executing them and dump preserves the parsed model", async () => {
    using dir = tempDir("bun-just-dry-run", { justfile: "build:\n  echo changed > output.txt\n" });
    const result = await run(String(dir), ["just", "--dry-run", "build"]);
    expect(result.stderr + result.stdout).toContain("echo changed > output.txt");
    expect(result.exitCode).toBe(0);
    expect(await Bun.file(join(String(dir), "output.txt")).exists()).toBe(false);
    const dump = await run(String(dir), ["just", "--dump", "--dump-format", "json"]);
    expect(JSON.parse(dump.stdout).recipes.build).toBeDefined();
    expect(dump.exitCode).toBe(0);
  });

  for (const setting of ["set positional-arguments", "[positional-arguments]"]) {
    test(`preserves recipe name and literal arguments with ${setting}`, async () => {
      using dir = tempDir("bun-just-positionals", {
        justfile: `${setting}\ninspect first second:\n  @printf '%s|%s|%s\\n' "$0" "$1" "$2"\n`,
      });
      const result = await run(String(dir), ["just", "--", "inspect", "hello world", "--flag"]);
      expect(result.stdout.replaceAll("\r\n", "\n")).toBe("inspect|hello world|--flag\n");
      expect(result.stderr).toBe("");
      expect(result.exitCode).toBe(0);
    });
  }

  test("shell() receives its command as argv0 and keeps each argument intact", async () => {
    using dir = tempDir("bun-just-shell-function", {
      justfile: `args := shell('printf "%s|%s" "$1" "$2"', 'hello world', '--flag')
zero := shell('printf %s "$0"')
inspect:
  @printf '%s\\n' '{{args}}' '{{zero}}'
`,
    });
    const result = await run(String(dir), ["just", "inspect"]);
    expect(result.stdout.replaceAll("\r\n", "\n")).toBe('hello world|--flag\nprintf %s "$0"\n');
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
  });

  test("recursive recipes preserve arguments and a justfile path containing spaces", async () => {
    using dir = tempDir("bun just recursive recipes", {
      "recipes with spaces": {
        "tasks.just":
          "outer:\n  @{{just_command()}} --justfile tasks.just inner 'nested argument'\n\ninner value:\n  @printf '%s\\n' '{{value}}'\n",
      },
    });
    const result = await run(String(dir), ["just", "--justfile", "recipes with spaces/tasks.just", "outer"]);
    expect(result.stdout.replaceAll("\r\n", "\n")).toBe("nested argument\n");
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
  });

  test("honors global cwd, explicit shells, and recipe exit status", async () => {
    using dir = tempDir("bun-just-shell", {
      justfile:
        'set shell := ["' + bunExe().replaceAll("\\", "/") + '", "exec"]\n\nfail:\n  @echo recipe-failed\n  @exit 23\n',
    });
    const result = await run(import.meta.dir, ["--cwd", String(dir), "just", "fail"]);
    expect(result.stdout).toContain("recipe-failed");
    expect(result.exitCode).toBe(23);
  });

  test("a project script takes precedence and recursive recipes stay in the built-in runner", async () => {
    using dir = tempDir("bun-just-script", {
      "package.json": JSON.stringify({
        scripts: { just: `echo project-script && "${bunExe().replaceAll("\\", "/")}" just --bun-shell outer` },
      }),
      justfile:
        "outer:\n  @{{just_command()}} inner 'nested argument'\n\ninner value:\n  @printf '%s\\n' '{{value}}'\n",
    });
    const result = await run(String(dir), ["just"], {}, false);
    expect(result.stdout.replaceAll("\r\n", "\n")).toBe("project-script\nnested argument\n");
    expect(result.exitCode).toBe(0);
  });

  test("recursive shell and script recipes bypass package scripts in their working directory", async () => {
    using dir = tempDir("bun-just-recursive-package", {
      justfile: `set working-directory := 'sub'

outer: script
  @{{just_command()}} inner 'nested argument'

inner value:
  @printf '%s\\n' '{{value}}'

[script(${JSON.stringify(bunExe().replaceAll("\\", "/"))}, '--no-env-file')]
[extension('.js')]
script:
  const child = Bun.spawnSync([process.execPath, '--no-env-file', 'just', '--bun-shell', 'inner', 'script argument'], { stdout: 'inherit', stderr: 'inherit' });
  process.exit(child.exitCode);
`,
      sub: { "package.json": JSON.stringify({ scripts: { just: "echo unwanted-package-script && exit 49" } }) },
    });
    const result = await run(String(dir), ["just", "outer"]);
    expect(result.stdout.replaceAll("\r\n", "\n")).toBe("script argument\nnested argument\n");
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
  });

  test("command-line shell options override configured interpreters", async () => {
    using dir = tempDir("bun-just-shell-override", {
      justfile:
        'set shell := ["missing-just-test-shell"]\nset windows-shell := ["missing-just-test-shell"]\n\ncheck:\n  @printf override\n',
    });
    const result = await run(String(dir), [
      "just",
      "--shell",
      bunExe(),
      "--clear-shell-args",
      "--shell-arg=--no-env-file",
      "--shell-arg=exec",
      "check",
    ]);
    expect(result.stdout).toBe("override");
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
  });

  test.skipIf(!isWindows)("windows-shell takes precedence over shell", async () => {
    using dir = tempDir("bun-just-windows-shell", {
      justfile: `set shell := ["missing-just-test-shell"]
set windows-shell := [${JSON.stringify(bunExe().replaceAll("\\", "/"))}, "--no-env-file", "exec"]
check:
  @printf windows-override
`,
    });
    const result = await run(String(dir), ["just", "check"]);
    expect(result.stdout).toBe("windows-override");
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
  });

  test("explicit Bun script interpreters execute JavaScript and preserve arguments", async () => {
    using dir = tempDir("bun-just-script-interpreter", {
      justfile: `[script(${JSON.stringify(bunExe().replaceAll("\\", "/"))}, '--no-env-file')]
[extension('.js')]
[positional-arguments]
script value:
  console.log(JSON.stringify(process.argv.slice(2)));
`,
    });
    const result = await run(String(dir), ["just", "script", "script argument"]);
    expect(result.stdout.replaceAll("\r\n", "\n")).toBe('["script argument"]\n');
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
  });

  test.skipIf(!isWindows)("Bun shebang recipes execute without a Unix interpreter", async () => {
    using dir = tempDir("bun-just-shebang", {
      justfile:
        "[extension('.js')]\n[positional-arguments]\nscript value:\n  #!bun\n  console.log(JSON.stringify(process.argv.slice(2)));\n",
    });
    const result = await run(String(dir), ["just", "script", "shebang argument"], {
      PATH: `${dirname(bunExe())}${delimiter}${bunEnv.PATH ?? process.env.PATH ?? ""}`,
    });
    expect(result.stdout.replaceAll("\r\n", "\n")).toBe('["shebang argument"]\n');
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
  });

  test("reports invalid recipes without executing their bodies", async () => {
    using dir = tempDir("bun-just-invalid", { justfile: "task: missing\n  echo wrong > output.txt\n" });
    const result = await run(String(dir), ["just", "task"]);
    expect(result.stderr).toContain("missing");
    expect(result.exitCode).not.toBe(0);
    expect(await Bun.file(join(String(dir), "output.txt")).exists()).toBe(false);
  });
});
