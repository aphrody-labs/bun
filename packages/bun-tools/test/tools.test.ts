import { expect, test } from "bun:test";
import { bunEnv, bunExe, tempDir } from "harness";
import { assetName, platformTag } from "../src/assets.ts";
import { rsync, toWslPath } from "../src/rsync.ts";
import { connect, createServer, type Socket } from "node:net";
import { startConnectProxy } from "../src/connect-proxy.ts";
import { eventRecordId, startSystemStream } from "../src/system-stream.ts";
import { startTaskService } from "../src/task-service.ts";

test("periodic metadata service serializes tasks and awaits cancellation on stop", async () => {
  let calls = 0;
  let entered!: () => void;
  const ready = new Promise<void>(resolve => {
    entered = resolve;
  });
  const service = await startTaskService({
    intervalMs: 60_000,
    task: async signal => {
      calls++;
      entered();
      await new Promise<void>(resolve => {
        signal.addEventListener("abort", () => resolve(), { once: true });
      });
    },
  });
  try {
    await ready;
    const sameRun = service.run();
    expect(service.status().running).toBe(true);
    expect(calls).toBe(1);
    expect((await fetch(new URL("/health", service.server.url))).status).toBe(503);
    await service.stop();
    await sameRun;
    expect(service.status().running).toBe(false);
    expect(service.status().stopping).toBe(true);
    await service.run();
    expect(calls).toBe(1);
  } finally {
    await service.stop();
  }
});

test("CONNECT proxy denies unlisted hosts and tunnels through an explicit SOCKS endpoint", async () => {
  const sockets = new Set<Socket>();
  let destination: string | undefined;
  const socks = createServer(socket => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
    let stage = 0;
    let bytes = Buffer.alloc(0);
    socket.on("data", chunk => {
      if (stage === 2) {
        socket.write(chunk);
        return;
      }
      bytes = Buffer.concat([bytes, typeof chunk === "string" ? Buffer.from(chunk) : chunk]);
      if (stage === 0 && bytes.length >= 3) {
        expect([...bytes.subarray(0, 3)]).toEqual([5, 1, 0]);
        bytes = bytes.subarray(3);
        socket.write(Buffer.from([5, 0]));
        stage = 1;
      }
      if (stage === 1 && bytes.length >= 5 && bytes.length >= 7 + bytes[4]!) {
        destination = bytes.subarray(5, 5 + bytes[4]!).toString();
        expect(bytes.readUInt16BE(5 + bytes[4]!)).toBe(443);
        bytes = bytes.subarray(7 + bytes[4]!);
        socket.write(Buffer.from([5, 0, 0, 1, 127, 0, 0, 1, 0, 0]));
        stage = 2;
        if (bytes.length) socket.write(bytes);
      }
    });
  });
  await new Promise<void>(resolve => socks.listen(0, "127.0.0.1", resolve));
  const upstream = socks.address();
  if (!upstream || typeof upstream === "string") throw new Error("Missing SOCKS port");
  const proxy = await startConnectProxy({
    upstream: { hostname: "127.0.0.1", port: upstream.port },
    allowedHosts: ["example.test"],
  });
  const request = async (host: string, payload = "") => {
    const client = connect(proxy.port, proxy.hostname);
    let result = "";
    try {
      client.write(`CONNECT ${host}:443 HTTP/1.1\r\nHost: ${host}\r\n\r\n${payload}`);
      for await (const chunk of client) {
        result += chunk.toString();
        if (payload && result.endsWith(payload)) break;
      }
      return result;
    } finally {
      client.destroy();
    }
  };
  try {
    expect(await request("evil-example.test")).toContain("403 Forbidden");
    expect(destination).toBeUndefined();
    expect(await request("sub.example.test", "early-payload")).toBe(
      "HTTP/1.1 200 Connection Established\r\n\r\nearly-payload",
    );
    expect(destination).toBe("sub.example.test");
    await proxy.stop();
    expect(sockets.size).toBeLessThanOrEqual(1);
  } finally {
    await proxy.stop();
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve, reject) => socks.close(error => (error ? reject(error) : resolve())));
  }
});

test("CONNECT proxy requires explicit allowed destinations", async () => {
  await expect(
    startConnectProxy({ upstream: { hostname: "localhost", port: 1080 }, allowedHosts: [] }),
  ).rejects.toThrow("allowlist");
});

test("system stream uses explicit channels and refuses cross-site requests", async () => {
  const id = "9007199254740993";
  expect(eventRecordId(`<EventRecordID>${id}</EventRecordID>`)).toBe(9007199254740993n);
  const stream = await startSystemStream({
    source: { snapshot: () => ({ memory: 42 }), events: () => [] },
  });
  try {
    expect(await (await fetch(new URL("/snapshot", stream.server.url))).json()).toEqual({
      memory: 42,
    });
    expect(
      (
        await fetch(new URL("/snapshot", stream.server.url), {
          headers: { origin: "https://evil.test" },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await fetch(new URL("/snapshot", stream.server.url), {
          headers: {
            host: `evil.test:${stream.server.port}`,
            origin: `http://evil.test:${stream.server.port}`,
          },
        })
      ).status,
    ).toBe(403);
    expect((await fetch(new URL("/events?channel=Security", stream.server.url))).status).toBe(400);
    const event = new Promise<Record<string, unknown>>((resolve, reject) => {
      const socket = new WebSocket(new URL("/events", stream.server.url).href.replace("http:", "ws:"));
      socket.onmessage = message => {
        resolve(JSON.parse(String(message.data)));
        socket.close();
      };
      socket.onerror = () => {
        socket.close();
        reject(new Error("WebSocket failed"));
      };
    });
    expect(await event).toEqual({ type: "snapshot", data: { memory: 42 } });
  } finally {
    await stream.stop();
  }
});

test("toWslPath convertit les chemins Windows seulement", () => {
  expect(toWslPath("C:\\Users\\a\\x")).toBe("/mnt/c/Users/a/x");
  expect(toWslPath("-avz")).toBe("-avz");
  expect(toWslPath("host:/srv")).toBe("host:/srv");
});

test("assetName suit la plateforme", () => {
  const t = platformTag();
  expect(assetName("rclone")).toBe(`rclone-${t}${t === "windows-x64" ? ".exe" : ""}`);
  expect(assetName("librclone")).toBe(`librclone-${t}${t === "windows-x64" ? ".dll" : ".so"}`);
});

test("tool cache verifies bytes and replaces corruption only after a valid download", async () => {
  using directory = tempDir("bun-tools-cache", {});
  const modulePath = new URL("../src/assets.ts", import.meta.url).href;
  const script = `
    import { ensureAsset } from ${JSON.stringify(modulePath)};
    import { readdirSync } from "node:fs";
    const name = "rclone-linux-x64";
    const path = process.env.APHRODY_TOOLS_DIR + "/" + name;
    const good = "qualified-tool-bytes";
    const digest = new Bun.CryptoHasher("sha256").update(good).digest("hex");
    let downloads = 0;
    let download = good;
    globalThis.fetch = async url => {
      if (String(url).endsWith("/SHA256SUMS.txt")) return new Response(digest + "  " + name + "\\n");
      downloads++;
      return new Response(download);
    };
    await Bun.write(path, good);
    await ensureAsset(name);
    const cachedDownloads = downloads;
    await Bun.write(path, "corrupted-cache");
    download = "invalid-download";
    let rejected = false;
    try { await ensureAsset(name); } catch { rejected = true; }
    const preserved = await Bun.file(path).text();
    download = good;
    await ensureAsset(name);
    console.log(JSON.stringify({ cachedDownloads, rejected, preserved, repaired: await Bun.file(path).text(), downloads,
      partials: readdirSync(process.env.APHRODY_TOOLS_DIR).filter(name => name.endsWith(".part")).length }));
  `;
  await using child = Bun.spawn({
    cmd: [bunExe(), "-e", script],
    env: { ...bunEnv, APHRODY_TOOLS_DIR: String(directory) },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([child.stdout.text(), child.stderr.text(), child.exited]);
  expect(stdout.trim()).toBe(
    '{"cachedDownloads":0,"rejected":true,"preserved":"corrupted-cache","repaired":"qualified-tool-bytes","downloads":2,"partials":0}',
  );
  expect(stderr).toBe("");
  expect(exitCode).toBe(0);
});

test.skipIf(process.platform !== "win32")("rsync rejects Windows before starting a compatibility process", async () => {
  await expect(rsync(["--version"])).rejects.toThrow("Native rsync is unsupported on Windows");
});
