import { expect, test } from "bun:test";
import { bunEnv, bunExe, tempDir } from "harness";
import { join, resolve } from "node:path";
import { BunPython } from "../../scripts/aphrody/pyjs-store.ts";

test.concurrent("CLI preserves child flags, failing status and complete output receipts", async () => {
  using directory = tempDir("bun-python-cli-receipts", {});
  const db = join(String(directory), "bun_python.sqlite");
  const script = resolve(import.meta.dir, "../../scripts/aphrody/pyjs.ts");
  await using child = Bun.spawn({
    cmd: [
      bunExe(),
      script,
      "run",
      "--db",
      db,
      "--no-export",
      "--",
      bunExe(),
      "-e",
      "console.log(process.argv.slice(1).join('|')); console.error('child-stderr'); process.exitCode=37",
      "--",
      "--db",
      "child-only",
    ],
    env: bunEnv,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([child.stdout.text(), child.stderr.text(), child.exited]);
  expect(stdout.trim()).toBe("--db|child-only");
  expect(stderr.trim()).toBe("child-stderr");
  expect(code).toBe(37);
  using registry = new BunPython(db);
  expect(registry.db.query("SELECT status,exit_code,stdout,stderr FROM runs").get()).toEqual({
    status: "failed",
    exit_code: 37,
    stdout: "--db|child-only\n",
    stderr: "child-stderr\n",
  });
  expect(registry.counts().artifacts).toBe(2);
});
