import { expect, test } from "bun:test";
import { join } from "node:path";
import { bunEnv, bunExe, tempDir } from "harness";

test("native workspace previews and applies an import rewrite without another checkout", async () => {
  using dir = tempDir("workspace-imports", {
    "consumer.ts": 'import { invoke } from "@aphrody/api/core";\n',
  });
  const args = [
    bunExe(), "workspace", "code-edit", "replace", "--root", String(dir),
    "--glob", "*.ts", "--find", "@aphrody/api", "--with", "@aphrody/tauri/api",
  ];
  for (const apply of [false, true]) {
    await using proc = Bun.spawn({
      cmd: apply ? [...args, "--apply"] : args,
      env: bunEnv,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
    expect(JSON.parse(stdout).files).toHaveLength(1);
    expect(await Bun.file(join(String(dir), "consumer.ts")).text()).toBe(
      apply ? 'import { invoke } from "@aphrody/tauri/api/core";\n' : 'import { invoke } from "@aphrody/api/core";\n',
    );
    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
  }
});

test("workspace path renaming uses Bun even when the project defines a rename script", async () => {
  using dir = tempDir("workspace-paths", {
    "package.json": '{"scripts":{"rename":"bun -e \'throw Error(\"project script selected\")\'"}}',
    "legacy.ts": "export const legacy = 1;\n",
  });
  await using proc = Bun.spawn({
    cmd: [bunExe(), "workspace", "code-edit", "rename", "--root", String(dir), "--glob", "*.ts",
      "--find", "legacy", "--with", "current", "--paths", "--apply"],
    cwd: String(dir),
    env: bunEnv,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
  expect(stdout).toContain("rename apply:");
  expect(await Bun.file(join(String(dir), "current.ts")).text()).toBe("export const current = 1;\n");
  expect(await Bun.file(join(String(dir), "legacy.ts")).exists()).toBe(false);
  expect(stderr).toBe("");
  expect(exitCode).toBe(0);
});
