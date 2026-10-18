// `bun <plugin command>` dispatches to `bun-<name>`, fetched from the release of this exact bun.
import { expect, test } from "bun:test";
import { bunEnv, bunExe, isArm64, isMusl, isWindows, tempDir } from "harness";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const exe = isWindows ? ".exe" : "";
const os = isWindows ? "windows" : process.platform;
const asset = `bun-uv-${os}-${isArm64 ? "aarch64" : "x64"}${isMusl ? "-musl" : ""}${exe}`;
const builtPlugin = join(dirname(bunExe()), `bun-uv${exe}`);

async function run(args: string[], env: Record<string, string>) {
  await using child = Bun.spawn({
    cmd: [bunExe(), ...args],
    env: { ...bunEnv, ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([child.stdout.text(), child.stderr.text(), child.exited]);
  return { out: out.trim(), err: err.trim(), code };
}

function release(files: Record<string, Uint8Array | string>) {
  return Bun.serve({
    port: 0,
    fetch(request) {
      const name = new URL(request.url).pathname.slice(1);
      return name in files ? new Response(files[name]) : new Response("missing", { status: 404 });
    },
  });
}

function sums(name: string, bytes: Uint8Array) {
  return `${new Bun.CryptoHasher("sha256").update(bytes).digest("hex")}  ${name}\n`;
}

test("a missing plugin fails clearly when downloads are disabled", async () => {
  using dir = tempDir("plugin-missing", {});
  const result = await run(["uv", "--version"], { BUN_PLUGINS_DIR: String(dir), BUN_PLUGIN_NO_DOWNLOAD: "1" });
  expect(result.err).toContain('plugin "uv" is not installed');
  expect(result.err).toContain("bun plugin install uv");
  expect(result.code).toBe(1);
});

test("a plugin whose bytes differ from SHA256SUMS.txt is refused", async () => {
  using dir = tempDir("plugin-mismatch", {});
  await using server = release({ "SHA256SUMS.txt": sums(asset, new Uint8Array([1])), [asset]: "tampered" });
  const result = await run(["uv", "--version"], {
    BUN_PLUGINS_DIR: String(dir),
    BUN_PLUGIN_RELEASE_URL: server.url.href,
  });
  expect(result.err).toContain("does not match its SHA256SUMS.txt entry");
  expect(result.code).toBe(1);
  expect(existsSync(join(String(dir), "uv"))).toBe(false);
});

test("a release without the plugin names it", async () => {
  using dir = tempDir("plugin-absent", {});
  await using server = release({ "SHA256SUMS.txt": "" });
  const result = await run(["plugin", "install", "uv"], {
    BUN_PLUGINS_DIR: String(dir),
    BUN_PLUGIN_RELEASE_URL: server.url.href,
  });
  expect(result.err).toContain(`provides plugin "uv" (${asset})`);
  expect(result.code).toBe(1);
});

test.skipIf(!existsSync(builtPlugin))("the plugin is fetched once, verified and then run in place of bun", async () => {
  using dir = tempDir("plugin-fetch", {});
  const bytes = new Uint8Array(readFileSync(builtPlugin));
  let downloads = 0;
  await using server = Bun.serve({
    port: 0,
    fetch(request) {
      const name = new URL(request.url).pathname.slice(1);
      if (name === "SHA256SUMS.txt") return new Response(sums(asset, bytes));
      if (name === asset) return (downloads++, new Response(bytes));
      return new Response("missing", { status: 404 });
    },
  });
  const env = { BUN_PLUGINS_DIR: String(dir), BUN_PLUGIN_RELEASE_URL: server.url.href };
  const first = await run(["uv", "--version"], env);
  expect(first.out).toMatch(/^uv \d+\.\d+\.\d+/);
  expect(first.code).toBe(0);
  const again = await run(["uv", "--version"], env);
  expect(again.out).toBe(first.out);
  const list = await run(["plugin", "list"], env);
  expect(list.out).toContain(join(String(dir), "uv"));
  expect(downloads).toBe(1);

  const removed = await run(["plugin", "remove", "uv"], env);
  expect(removed.out).toBe("uv\tremoved");
  expect(existsSync(join(String(dir), "uv"))).toBe(false);
});
