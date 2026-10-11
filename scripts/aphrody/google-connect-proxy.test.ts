// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import type { Socket } from "bun";
import { createGoogleProxyFetch, startGoogleConnectProxy } from "./google-connect-proxy";

type FakeState = { phase: "hello" | "request" | "echo"; buffer: Buffer; queue: Buffer; finished: boolean };
function socksFixture(rejectMethod = false) {
  const requests: string[] = [];
  let echoedBytes = 0;
  let timeouts = 0;
  const sockets = new Set<Socket<FakeState>>();
  const initial = (): FakeState => ({
    phase: "hello",
    buffer: Buffer.alloc(0),
    queue: Buffer.alloc(0),
    finished: false,
  });
  const flush = (socket: Socket<FakeState>) => {
    if (socket.data.queue.length) {
      const written = socket.write(socket.data.queue);
      if (written < 0) {
        socket.terminate();
        return;
      }
      socket.data.queue = socket.data.queue.subarray(written);
    }
    if (socket.data.finished && !socket.data.queue.length) socket.end();
  };
  const write = (socket: Socket<FakeState>, bytes: Buffer) => {
    socket.data.queue = Buffer.concat([socket.data.queue, bytes]);
    flush(socket);
  };
  const listener = Bun.listen<FakeState>({
    hostname: "127.0.0.1",
    port: 0,
    allowHalfOpen: true,
    data: initial(),
    socket: {
      open(socket) {
        socket.data = initial();
        sockets.add(socket);
        socket.timeout(5);
      },
      data(socket, bytes) {
        socket.data.buffer = Buffer.concat([socket.data.buffer, bytes]);
        if (socket.data.phase === "hello" && socket.data.buffer.length >= 3) {
          expect([...socket.data.buffer.subarray(0, 3)]).toEqual([5, 1, 0]);
          socket.data.buffer = socket.data.buffer.subarray(3);
          socket.data.phase = "request";
          write(socket, Buffer.from([5]));
          queueMicrotask(() => {
            if (sockets.has(socket)) write(socket, Buffer.from([rejectMethod ? 255 : 0]));
          });
        }
        if (socket.data.phase === "request" && socket.data.buffer.length >= 5) {
          const length = socket.data.buffer[4]!;
          if (socket.data.buffer.length < 7 + length) return;
          expect([...socket.data.buffer.subarray(0, 4)]).toEqual([5, 1, 0, 3]);
          const domain = socket.data.buffer.subarray(5, 5 + length).toString("ascii");
          requests.push(domain + ":" + socket.data.buffer.readUInt16BE(5 + length));
          socket.data.buffer = socket.data.buffer.subarray(7 + length);
          socket.data.phase = "echo";
          write(socket, Buffer.from([5, 0, 0, 1]));
          queueMicrotask(() => {
            if (sockets.has(socket))
              write(socket, Buffer.concat([Buffer.from([127, 0, 0, 1, 1, 187]), Buffer.from("BANNER")]));
          });
        }
        if (socket.data.phase === "echo" && socket.data.buffer.length) {
          const buffered = socket.data.buffer;
          socket.data.buffer = Buffer.alloc(0);
          echoedBytes += buffered.length;
          write(socket, buffered);
        }
      },
      drain: flush,
      end(socket) {
        socket.data.finished = true;
        flush(socket);
      },
      close(socket) {
        sockets.delete(socket);
      },
      timeout(socket) {
        timeouts++;
        socket.terminate();
      },
      error(socket) {
        socket.terminate();
      },
    },
  });
  return {
    port: listener.port,
    requests,
    get echoedBytes() {
      return echoedBytes;
    },
    get timeouts() {
      return timeouts;
    },
    stop() {
      listener.stop(true);
      for (const socket of sockets) socket.terminate();
    },
  };
}

async function exchange(port: number, bytes: Buffer, afterConnect?: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const received: Buffer[] = [];
    let queue = bytes,
      fin = false,
      settled = false;
    function finish(socket: Socket<undefined>) {
      if (!settled) {
        settled = true;
        resolve(Buffer.concat(received));
      }
      socket.end();
    }
    function flush(socket: Socket<undefined>) {
      if (queue.length) {
        const written = socket.write(queue);
        if (written < 0) {
          reject(new Error("Fixture socket write failed"));
          socket.terminate();
          return;
        }
        queue = queue.subarray(written);
      }
      if (!queue.length && !afterConnect && !fin) {
        fin = true;
        socket.shutdown();
      }
    }
    void Bun.connect({
      hostname: "127.0.0.1",
      port,
      allowHalfOpen: true,
      socket: {
        open(socket) {
          socket.timeout(5);
          flush(socket);
        },
        drain: flush,
        data(socket, chunk) {
          received.push(Buffer.from(chunk));
          if (afterConnect && Buffer.concat(received).includes("\r\n\r\n")) {
            queue = Buffer.concat([queue, afterConnect]);
            afterConnect = undefined;
            flush(socket);
          }
        },
        end: finish,
        close: finish,
        timeout(socket) {
          reject(new Error("Fixture socket timed out"));
          socket.terminate();
        },
        error(socket, error) {
          reject(error);
          socket.terminate();
        },
      },
    }).catch(reject);
  });
}

test("fragmented SOCKS negotiation preserves early tunnel bytes and backpressured payload through half-close", async () => {
  const socks = socksFixture();
  const proxy = startGoogleConnectProxy({ socksPort: socks.port, allowedHosts: ["google.example"] });
  try {
    const payload = Buffer.alloc(2 * 1024 * 1024);
    for (let index = 0; index < payload.length; index++) payload[index] = index % 251;
    const request = Buffer.concat([
      Buffer.from("CONNECT google.example:443 HTTP/1.1\r\nHost: google.example:443\r\n\r\n"),
      payload.subarray(0, 16 * 1024),
    ]);
    const response = await exchange(Number(new URL(proxy.proxyURL).port), request, payload.subarray(16 * 1024));
    const prefix = Buffer.from("HTTP/1.1 200 Connection Established\r\n\r\nBANNER");
    expect(socks.timeouts).toBe(0);
    expect(socks.echoedBytes).toBe(payload.length);
    expect(response.length).toBe(prefix.length + payload.length);
    expect(response.subarray(0, prefix.length).equals(prefix)).toBe(true);
    expect(response.subarray(prefix.length).equals(payload)).toBe(true);
    expect(socks.requests).toEqual(["google.example:443"]);
  } finally {
    proxy.stop();
    socks.stop();
  }
});

test("CONNECT authority, body and ASCII denials never contact SOCKS", async () => {
  const socks = socksFixture();
  const proxy = startGoogleConnectProxy({ socksPort: socks.port, allowedHosts: ["google.example"] });
  try {
    const port = Number(new URL(proxy.proxyURL).port);
    for (const request of [
      "CONNECT outside.example:443 HTTP/1.1\r\n\r\n",
      "CONNECT google.example:80 HTTP/1.1\r\n\r\n",
      "CONNECT google.example:443 HTTP/1.1\r\nContent-Length: 0\r\n\r\n",
      "CONNECT google.example:443 HTTP/1.1\r\nHost: outside.example:443\r\n\r\n",
      "GET / HTTP/1.1\r\nHost: google.example\r\n\r\n",
    ]) {
      expect((await exchange(port, Buffer.from(request))).toString()).toContain("403 Forbidden");
    }
    expect(
      (await exchange(port, Buffer.from("CONNECT google.example:443 HTTP/1.1\r\nX-Test: \u00e9\r\n\r\n"))).length,
    ).toBe(0);
    expect((await exchange(port, Buffer.from("X".repeat(9000)))).length).toBe(0);
    expect(socks.requests).toHaveLength(0);
  } finally {
    proxy.stop();
    socks.stop();
  }
});

test("SOCKS rejection and invalid proxy origins fail closed", async () => {
  const socks = socksFixture(true);
  const proxy = startGoogleConnectProxy({ socksPort: socks.port, allowedHosts: ["google.example"] });
  try {
    expect(
      (await exchange(Number(new URL(proxy.proxyURL).port), Buffer.from("CONNECT google.example:443 HTTP/1.1\r\n\r\n")))
        .length,
    ).toBe(0);
    expect(socks.requests).toHaveLength(0);
    expect(() => startGoogleConnectProxy({ socksPort: socks.port, allowedHosts: ["127.0.0.1"] })).toThrow("DNS host");
    expect(() =>
      startGoogleConnectProxy({ socksPort: socks.port, allowedHosts: ["google.example"], maxConnections: 0 }),
    ).toThrow("allowlist");
    expect(() =>
      createGoogleProxyFetch({ proxyURL: "http://outside.example:1082", allowedOrigins: ["https://google.example"] }),
    ).toThrow("loopback");
    const transport = createGoogleProxyFetch({ proxyURL: proxy.proxyURL, allowedOrigins: ["https://google.example"] });
    await expect(transport("https://outside.example/")).rejects.toThrow("origin rejected");
    await expect(transport("https://user:password@google.example/")).rejects.toThrow("origin rejected");
  } finally {
    proxy.stop();
    socks.stop();
  }
});
