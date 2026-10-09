import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { bunEnv, bunExe, tempDir } from "harness";

// Every test talks to the embedded russh server of `bun ssh server --embedded` on 127.0.0.1 with
// the in-process client, so it neither needs nor touches the user's OpenSSH, agent or ~/.ssh.
const dir = tempDir("bun-ssh", { "ssh_config": "", "upload.txt": "uploaded through sftp\n" });
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

let server: ReturnType<typeof Bun.spawn> | undefined;
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
    const { stdout, exitCode } = await bunSsh(["exec", ...conn(), "127.0.0.1", command], { stdin: "x-from-stdin\n" });
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

    const up = await bunSsh(["cp", "--delta", ...conn(), join(root, "upload.txt"), `127.0.0.1:${remoteDir}/b.txt`]);
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
});
