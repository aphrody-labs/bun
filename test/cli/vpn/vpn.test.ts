import { expect, test } from "bun:test";
import { bunEnv, bunExe } from "harness";

async function runVpn(args: string[], input?: string, env: Record<string, string | undefined> = {}) {
  await using process = Bun.spawn({
    cmd: [bunExe(), "vpn", ...args],
    env: { ...bunEnv, ...env },
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
  expect(result.stderr).toBe("usage: bun vpn <daemon|status|connect|disconnect|login --stdin|login --from-env NAME>\n");
  expect(result.exitCode).toBe(2);
});

test("bun vpn requires explicit stdin for account login before opening daemon IPC", async () => {
  const result = await runVpn(["login"]);
  expect(result.stdout).toBe("");
  expect(result.stderr).toBe("usage: bun vpn <daemon|status|connect|disconnect|login --stdin|login --from-env NAME>\n");
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
  expect(result.stderr).toBe("usage: bun vpn <daemon|status|connect|disconnect|login --stdin|login --from-env NAME>\n");
  expect(result.exitCode).toBe(2);
});

test.concurrent("bun vpn login --from-env rejects a malformed value without echoing it", async () => {
  const result = await runVpn(["login", "--from-env", "VPN_TEST_ACCOUNT"], undefined, {
    VPN_TEST_ACCOUNT: "12345678901234x6",
  });
  expect(result.stdout).toBe("");
  expect(result.stderr).toBe("bun vpn: VPN account stdin must contain exactly sixteen ASCII digits
");
  expect(result.exitCode).toBe(2);
});

test.concurrent("bun vpn login --from-env reports an unset variable", async () => {
  const result = await runVpn(["login", "--from-env", "VPN_TEST_ACCOUNT_UNSET"]);
  expect(result.stderr).toBe("bun vpn: VPN account environment variable is not set
");
  expect(result.exitCode).toBe(2);
});
