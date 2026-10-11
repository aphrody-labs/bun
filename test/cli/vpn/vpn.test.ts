import { expect, test } from "bun:test";
import { bunEnv, bunExe } from "harness";

async function runVpn(args: string[]) {
  await using process = Bun.spawn({
    cmd: [bunExe(), "vpn", ...args],
    env: bunEnv,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    process.stdout.text(),
    process.stderr.text(),
    process.exited,
  ]);
  return { stdout, stderr, exitCode };
}

test("bun vpn rejects missing commands before opening daemon IPC", async () => {
  const result = await runVpn([]);
  expect(result.stdout).toBe("");
  expect(result.stderr).toBe("usage: bun vpn <status|connect|disconnect>\n");
  expect(result.exitCode).toBe(2);
});

test("bun vpn rejects unknown commands before opening daemon IPC", async () => {
  const result = await runVpn(["login"]);
  expect(result.stdout).toBe("");
  expect(result.stderr).toBe("usage: bun vpn <status|connect|disconnect>\n");
  expect(result.exitCode).toBe(2);
});
