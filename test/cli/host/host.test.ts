import { describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { bunEnv, bunExe, tempDir } from "harness";

const SECRET = "0123456789abcdef-test-secret";

async function host(args: string[], env: Record<string, string> = {}) {
  await using proc = Bun.spawn({
    cmd: [bunExe(), "host", ...args],
    env: { ...bunEnv, ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
  return { stdout, stderr, exitCode };
}

describe("bun host", () => {
  test("collect prints a card of schema 1", async () => {
    const { stdout, exitCode } = await host(["collect", "--id", "test-host"]);
    const card = JSON.parse(stdout);
    expect(card).toMatchObject({ schema: 1, id: "test-host" });
    expect(card.memory.total_mib).toBeGreaterThan(0);
    expect(card.cpu.logical_cores).toBeGreaterThan(0);
    expect(Array.isArray(card.gpus)).toBe(true);
    expect(Array.isArray(card.disks)).toBe(true);
    expect(exitCode).toBe(0);
  });

  test("schema lists the required sections", async () => {
    const { stdout, exitCode } = await host(["schema"]);
    expect(JSON.parse(stdout).required).toContain("gpus");
    expect(exitCode).toBe(0);
  });

  test("push, sync and find through a signed registry", async () => {
    using dir = tempDir("host-registry", {});
    const store = String(dir);
    const env = { BUN_HOST_DIR: store, HOST_TEST_SECRET: SECRET };
    const inbox = join(store, "inbox");

    const pushed = await host(["push", "--to", inbox, "--id", "omar-pc", "-s", "HOST_TEST_SECRET"], env);
    expect(pushed.stdout).toContain("(signed)");
    expect(pushed.exitCode).toBe(0);

    const synced = await host(["sync", "--id", "master", "-s", "HOST_TEST_SECRET"], env);
    expect(synced.stdout).toContain("2 hosts");
    expect(synced.exitCode).toBe(0);

    const found = await host(["find", "--ram", "0.001", "--json", "-s", "HOST_TEST_SECRET"], env);
    expect(JSON.parse(found.stdout).map((h: { id: string }) => h.id).sort()).toEqual(["master", "omar-pc"]);
    expect(found.exitCode).toBe(0);

    const none = await host(["find", "--vram-free", "100000", "-s", "HOST_TEST_SECRET"], env);
    expect(none.exitCode).toBe(1);
  });

  test("a tampered or unsigned card is rejected", async () => {
    using dir = tempDir("host-registry-bad", {});
    const store = String(dir);
    const env = { BUN_HOST_DIR: store, HOST_TEST_SECRET: SECRET };
    const inbox = join(store, "inbox");
    expect((await host(["push", "--to", inbox, "--id", "tampered", "-s", "HOST_TEST_SECRET"], env)).exitCode).toBe(0);
    expect((await host(["push", "--to", inbox, "--id", "unsigned"], env)).exitCode).toBe(0);

    const file = join(inbox, "tampered.json");
    const card = JSON.parse(readFileSync(file, "utf8"));
    card.info.memory.total_mib += 1;
    writeFileSync(file, JSON.stringify(card));

    const listed = await host(["list", "--json", "-s", "HOST_TEST_SECRET"], env);
    expect(listed.stderr).toContain("tampered: bad signature");
    expect(listed.stderr).toContain("unsigned: unsigned");
    expect(Object.keys(JSON.parse(listed.stdout).hosts)).toEqual([]);
    expect(listed.exitCode).toBe(0);
  });

  test("a secret file that others can read is refused", async () => {
    if (process.platform === "win32") return;
    using dir = tempDir("host-secret", { "secret": SECRET });
    const file = join(String(dir), "secret");
    require("node:fs").chmodSync(file, 0o644);
    const { stderr, exitCode } = await host(["push", "--to", join(String(dir), "out"), "--secret-file", file]);
    expect(stderr).toContain("too open");
    expect(exitCode).toBe(1);
  });
});
