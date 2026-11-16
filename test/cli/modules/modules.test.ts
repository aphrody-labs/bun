import { expect, test } from "bun:test";
import { bunEnv, bunExe, isWindows, tempDir } from "harness";

async function run(cmd: string[], cwd?: string) {
  await using proc = Bun.spawn({ cmd, env: bunEnv, cwd, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
  return { stdout, stderr, exitCode };
}

test("applet --list names the compiled-in applets", async () => {
  const { stdout, exitCode } = await run([bunExe(), "applet", "--list"]);
  const names = stdout.split("\n");
  expect(names).toContain("ls");
  expect(names).toContain("grep");
  expect(names).toContain("bash");
  expect(exitCode).toBe(0);
});

test("applet runs a coreutils applet and passes its status through", async () => {
  expect(await run([bunExe(), "applet", "echo", "hello", "applet"])).toMatchObject({ stdout: "hello applet\n", exitCode: 0 });
  expect((await run([bunExe(), "applet", "false"])).exitCode).toBe(1);
});

test.skipIf(isWindows)("a link named after an applet runs that applet", async () => {
  using dir = tempDir("modules-argv0", { "in.txt": "alpha\nbeta\n" });
  const link = `${dir}/grep`;
  await Bun.$`ln -s ${bunExe()} ${link}`;
  expect(await run([link, "beta", `${dir}/in.txt`])).toMatchObject({ stdout: "beta\n", exitCode: 0 });
});

test("bash runs a script with a bash shebang through the embedded engine", async () => {
  using dir = tempDir("modules-bash", {
    "script": `#!/usr/bin/env bash\narr=(a b c)\necho "\${#arr[@]} $1"\n`,
  });
  expect(await run([bunExe(), "run", `${dir}/script`, "x"])).toMatchObject({ stdout: "3 x\n", exitCode: 0 });
});

test.skipIf(isWindows)("a Rust single-file script runs through cargo -Zscript", async () => {
  using dir = tempDir("modules-rs", {
    "hello.rs": `---\n[dependencies]\n---\nfn main() { println!("rust {}", std::env::args().nth(1).unwrap_or_default()); }\n`,
  });
  expect(await run([bunExe(), "run", `${dir}/hello.rs`, "ok"])).toMatchObject({ stdout: "rust ok\n", exitCode: 0 });
});
