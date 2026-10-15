import { expect, test } from "bun:test";
import { bunEnv, bunExe } from "harness";

async function runVpn(args: string[], input?: string) {
  await using process = Bun.spawn({
    cmd: [bunExe(), "vpn", ...args],
    env: bunEnv,
    stdin: input === undefined ? "ignore" : new TextEncoder().encode(input),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([process.stdout.text(), process.stderr.text(), process.exited]);
  return { stdout, stderr, exitCode };
}

test("bun vpn rejects missing commands before opening daemon IPC", async () => {
  const result = await runVpn([]);
  expect(result.stdout).toBe("");
  expect(result.stderr).toBe("usage: bun vpn <daemon|status|connect|disconnect|login --stdin>\n");
  expect(result.exitCode).toBe(2);
});

test("bun vpn requires explicit stdin for account login before opening daemon IPC", async () => {
  const result = await runVpn(["login"]);
  expect(result.stdout).toBe("");
  expect(result.stderr).toBe("usage: bun vpn <daemon|status|connect|disconnect|login --stdin>\n");
  expect(result.exitCode).toBe(2);
});

test.each(["", "fixture-account", "oversized-private-fixture".repeat(8)])(
  "bun vpn rejects malformed stdin without exposing it or opening daemon IPC (%#)",
  async input => {
    const result = await runVpn(["login", "--stdin"], input);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("bun vpn: VPN account stdin must contain exactly sixteen ASCII digits\n");
    expect(result.exitCode).toBe(2);
  },
);

test("bun vpn rejects accounts in argv without exposing them", async () => {
  const result = await runVpn(["login", "private-account-fixture"]);
  expect(result.stdout).toBe("");
  expect(result.stderr).toBe("usage: bun vpn <daemon|status|connect|disconnect|login --stdin>\n");
  expect(result.exitCode).toBe(2);
});
