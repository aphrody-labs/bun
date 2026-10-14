import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chmodSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { bunEnv, bunExe, tempDir } from "harness";

// Every test talks to the embedded russh server of `bun ssh server --embedded` on 127.0.0.1 with
// the in-process client, so it neither needs nor touches the user's OpenSSH, agent or ~/.ssh.
const dir = tempDir("bun-ssh", { ssh_config: "", "upload.txt": "uploaded through sftp\n" });
const root = String(dir);
const key = join(root, "id_ed25519");
const knownHosts = join(root, "known_hosts");
const env = {
  ...bunEnv,
  BUN_SSH_NATIVE_CONFIG: "1",
  BUN_SSH_KNOWN_HOSTS: knownHosts,
  BUN_SSH_STATE_DIR: join(root, "state"),
  SSH_AUTH_SOCK: undefined,
  SSH_ASKPASS: undefined,
};

let server: Bun.Subprocess<"ignore", "pipe", "inherit"> | undefined;
let port = 0;
let hostKey = "";

async function bunSsh(args: string[], options: { stdin?: string } = {}) {
  await using proc = Bun.spawn({
    cmd: [bunExe(), "ssh", ...args],
    env,
    cwd: root,
    stdin: options.stdin === undefined ? "ignore" : new Blob([options.stdin]),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
  return { stdout: stdout.replaceAll("\r\n", "\n"), stderr, exitCode };
}

const conn = () => [
  "--native",
  "-F",
  join(root, "ssh_config"),
  "-i",
  key,
  "-p",
  String(port),
  "-o",
  "IdentityAgent=none",
  "-o",
  "StrictHostKeyChecking=accept-new",
];

beforeAll(async () => {
  const made = await bunSsh(["keygen", "-f", key, "-C", "bun-ssh-test"]);
  expect(made.stderr).toBe("");
  expect(JSON.parse(made.stdout).algorithm).toBe("ssh-ed25519");

  server = Bun.spawn({
    cmd: [bunExe(), "ssh", "server", "--embedded", "--port", "0", "--authorized-keys", `${key}.pub`],
    env,
    cwd: root,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "inherit",
  });
  const reader = server.stdout.getReader();
  let text = "";
  while (!text.includes("\n")) {
    const { value, done } = await reader.read();
    if (done) break;
    text += new TextDecoder().decode(value);
  }
  reader.releaseLock();
  const info = JSON.parse(text.split("\n")[0]);
  port = info.port;
  hostKey = info.hostKey;
  expect(port).toBeGreaterThan(0);
});

afterAll(() => {
  server?.kill();
});

describe("bun ssh (in-process client, embedded server)", () => {
  test("exec streams output and records the host key on first use", async () => {
    const { stdout, stderr, exitCode } = await bunSsh(["exec", ...conn(), "127.0.0.1", "echo hello-from-ssh"]);
    expect(stderr).toBe("");
    expect(stdout.trim()).toBe("hello-from-ssh");
    expect(exitCode).toBe(0);
    expect(readFileSync(knownHosts, "utf8")).toContain(hostKey.split(" ")[1]);
  });

  test("exec propagates the remote exit code and --json collects output", async () => {
    const failed = await bunSsh(["exec", ...conn(), "127.0.0.1", "exit 3"]);
    expect(failed.exitCode).toBe(3);

    const { stdout, exitCode } = await bunSsh(["exec", "--json", ...conn(), "127.0.0.1", "echo json-out"]);
    const result = JSON.parse(stdout);
    expect(result.stdout.replaceAll("\r\n", "\n").trim()).toBe("json-out");
    expect(result.code).toBe(0);
    expect(exitCode).toBe(0);
  });

  test("exec forwards stdin", async () => {
    const command = process.platform === "win32" ? "findstr x" : "cat";
    const { stdout, exitCode } = await bunSsh(["exec", ...conn(), "127.0.0.1", command], {
      stdin: "x-from-stdin\n",
    });
    expect(stdout.trim()).toBe("x-from-stdin");
    expect(exitCode).toBe(0);
  });

  test("an unknown host key is refused with StrictHostKeyChecking=yes", async () => {
    const args = conn().map(a => (a === "StrictHostKeyChecking=accept-new" ? "StrictHostKeyChecking=yes" : a));
    await using proc = Bun.spawn({
      cmd: [bunExe(), "ssh", "exec", ...args, "127.0.0.1", "echo never"],
      env: { ...env, BUN_SSH_KNOWN_HOSTS: join(root, "empty_known_hosts") },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
    expect(stdout).toBe("");
    expect(stderr).toContain("host key verification failed");
    expect(exitCode).toBe(255);
  });

  test("known-hosts check reports the recorded key", async () => {
    const { stdout, exitCode } = await bunSsh(["known-hosts", ...conn(), "check", "127.0.0.1"]);
    const result = JSON.parse(stdout);
    expect(result.state).toBe("known");
    expect(result.fingerprint).toStartWith("SHA256:");
    expect(exitCode).toBe(0);
  });

  test("sftp put, ls, cat and cp in both directions", async () => {
    const remoteDir = join(root, "remote").replaceAll("\\", "/");
    expect((await bunSsh(["sftp", ...conn(), "mkdir", "127.0.0.1", remoteDir])).exitCode).toBe(0);
    const put = await bunSsh(["sftp", ...conn(), "put", "127.0.0.1", `${remoteDir}/a.txt`, join(root, "upload.txt")]);
    expect(put.stderr).toBe("");

    const ls = await bunSsh(["sftp", ...conn(), "ls", "127.0.0.1", remoteDir]);
    expect(JSON.parse(ls.stdout).map((e: { name: string }) => e.name)).toEqual(["a.txt"]);

    const cat = await bunSsh(["sftp", ...conn(), "cat", "127.0.0.1", `${remoteDir}/a.txt`]);
    expect(cat.stdout).toBe("uploaded through sftp\n");

    const down = await bunSsh(["cp", ...conn(), `127.0.0.1:${remoteDir}/a.txt`, join(root, "downloaded.txt")]);
    expect(down.stderr).toBe("");
    expect(readFileSync(join(root, "downloaded.txt"), "utf8")).toBe("uploaded through sftp\n");

    const up = await bunSsh(["cp", ...conn(), join(root, "upload.txt"), `127.0.0.1:${remoteDir}/b.txt`]);
    expect(up.stderr).toBe("");
    expect(readFileSync(join(remoteDir, "b.txt"), "utf8")).toBe("uploaded through sftp\n");
  });

  test("forward -L carries a local port to a server-side target", async () => {
    using target = Bun.serve({ port: 0, fetch: () => new Response("through-the-tunnel") });
    await using proc = Bun.spawn({
      cmd: [bunExe(), "ssh", "forward", ...conn(), "-L", `0:127.0.0.1:${target.port}`, "127.0.0.1"],
      env,
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
    });
    const reader = proc.stdout.getReader();
    let text = "";
    while (!text.includes("\n")) {
      const { value, done } = await reader.read();
      if (done) break;
      text += new TextDecoder().decode(value);
    }
    const local = JSON.parse(text.split("\n")[0]).local;
    const body = await (await fetch(`http://127.0.0.1:${local}/`)).text();
    proc.kill();
    expect(body).toBe("through-the-tunnel");
  });

  test("config resolves overrides as JSON", async () => {
    const { stdout, exitCode } = await bunSsh(["config", ...conn(), "-l", "alice", "127.0.0.1"]);
    const config = JSON.parse(stdout);
    expect(config.user).toBe("alice");
    expect(config.port).toBe(port);
    expect(config.hostname).toBe("127.0.0.1");
    expect(exitCode).toBe(0);
  });

  test.skipIf(process.platform === "win32")(
    "native Bun delta sends signatures and differences across chunk boundaries",
    async () => {
      using files = tempDir("bun-native-delta", {});
      const base = new Uint8Array(2 * 1024 * 1024 + 8192).fill(87);
      const modified = base.slice();
      modified.set(new TextEncoder().encode("changed across native delta"), 4096);
      const source = join(String(files), "source.bin");
      const target = join(String(files), "target.bin");
      await Bun.write(source, modified);
      await Bun.write(target, base);
      const result = await bunSsh([
        "cp",
        "--delta",
        "--remote-bun",
        bunExe(),
        ...conn(),
        source,
        `127.0.0.1:${target}`,
      ]);
      expect(result.stderr).toBe("");
      const report = JSON.parse(result.stdout);
      expect(report.protocol).toBe(1);
      expect(report.chunks).toBe(2);
      expect(report.modified_size).toBe(modified.length);
      expect(report.delta_bytes).toBeLessThan(modified.length / 32);
      expect(report.signature_bytes).toBeLessThan(modified.length / 32);
      expect(new Uint8Array(await Bun.file(target).arrayBuffer())).toEqual(modified);
      expect(readdirSync(String(files)).filter(name => name.startsWith(".bun-delta-"))).toEqual([]);
      expect(result.exitCode).toBe(0);
    },
  );

  test("delta receiver rejects a false final digest without changing its target", async () => {
    using files = tempDir("bun-native-delta-hash", { "target.bin": "preserved target" });
    const target = join(String(files), "target.bin");
    const invalid = new Uint8Array(41); // finish operation, zero length, false empty-file SHA-256
    await using child = Bun.spawn({
      cmd: [bunExe(), "ssh", "delta-receive", "--", target],
      env,
      stdin: new Blob([invalid]),
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).arrayBuffer(), child.stderr.text(), child.exited]);
    expect(stdout.byteLength).toBeGreaterThan(0);
    expect(stderr).toContain("SHA-256 or size mismatch");
    expect(await Bun.file(target).text()).toBe("preserved target");
    expect(readdirSync(String(files))).toEqual(["target.bin"]);
    expect(code).not.toBe(0);
  });

  test("native delta without a selected remote Bun fails before any connection", async () => {
    const result = await bunSsh([
      "cp",
      "--native",
      "--delta",
      "-F",
      join(root, "ssh_config"),
      join(root, "upload.txt"),
      "127.0.0.1:/explicit-target",
    ]);
    expect(result.stderr).toContain("requires an explicit --remote-bun");
    expect(result.exitCode).not.toBe(0);
  });

  test("system copy passes the selected SSH executable as one scp -S argument", async () => {
    const script = "console.log(JSON.stringify(process.argv.slice(2)));";
    const quote = (text: string) => "'" + text.replaceAll("'", "'\\''") + "'";
    using files = tempDir("bun-scp-transport", {
      "selected ssh.exe": "fixture, never executed",
      "capture.ts": script,
      "mock scp": "",
    });
    const ssh = join(String(files), "selected ssh.exe");
    const scp = join(String(files), process.platform === "win32" ? "mock scp.cmd" : "mock scp");
    if (process.platform === "win32") {
      await Bun.write(scp, `@"${bunExe()}" "%~dp0capture.ts" %*\r\n`);
    } else {
      await Bun.write(scp, `#!/bin/sh\nexec ${quote(bunExe())} ${quote(join(String(files), "capture.ts"))} "$@"\n`);
      chmodSync(scp, 0o755);
    }
    await using child = Bun.spawn({
      cmd: [
        bunExe(),
        "ssh",
        "cp",
        "--system",
        "-F",
        join(root, "ssh_config"),
        join(root, "upload.txt"),
        "fixture.invalid:/target",
      ],
      env: { ...env, BUN_SSH_SSH: ssh, BUN_SSH_SCP: scp },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, code] = await Promise.all([child.stdout.text(), child.stderr.text(), child.exited]);
    const args = JSON.parse(stdout);
    expect(args[args.indexOf("-S") + 1]).toBe(ssh);
    expect(args.at(-1)).toBe("fixture.invalid:/target");
    expect(stderr).toBe("");
    expect(code).toBe(0);
  });
});
