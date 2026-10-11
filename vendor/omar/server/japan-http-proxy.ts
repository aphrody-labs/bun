#!/usr/bin/env bun
/** Loopback HTTP CONNECT adapter for the Japan SOCKS5 tunnel. */
import { connect, createServer, type Socket } from "node:net";

const upstreamHost = "127.0.0.1";
const upstreamPort = 11080;
const listenHost = "127.0.0.1";
const listenPort = 11081;
const allowedHosts = new Set(
  (process.env.JAPAN_PROXY_ALLOWED_HOSTS ?? "aphrody.com")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean),
);

class Reader {
  private chunks: Buffer[] = [];
  private length = 0;
  private pending?: () => void;
  private readonly onData = (chunk: Buffer) => {
    this.chunks.push(chunk);
    this.length += chunk.length;
    this.pending?.();
  };
  constructor(private readonly socket: Socket) {
    socket.on("data", this.onData);
  }
  async read(size: number): Promise<Buffer> {
    while (this.length < size) {
      if (this.socket.destroyed) throw new Error("socket closed while reading");
      await new Promise<void>((resolve, reject) => {
        const cleanup = () => {
          this.socket.off("close", onClose);
          this.socket.off("error", onError);
          this.pending = undefined;
        };
        const onClose = () => { cleanup(); reject(new Error("socket closed while reading")); };
        const onError = (error: Error) => { cleanup(); reject(error); };
        this.pending = () => { cleanup(); resolve(); };
        this.socket.once("close", onClose);
        this.socket.once("error", onError);
      });
    }
    const result = Buffer.allocUnsafe(size);
    let offset = 0;
    while (offset < size) {
      const first = this.chunks[0]!;
      const take = Math.min(first.length, size - offset);
      first.copy(result, offset, 0, take);
      offset += take;
      this.length -= take;
      if (take === first.length) this.chunks.shift();
      else this.chunks[0] = first.subarray(take);
    }
    return result;
  }
  dispose() {
    this.pending = undefined;
    this.socket.off("data", this.onData);
  }
}

async function write(socket: Socket, data: Buffer) {
  if (!socket.write(data)) await new Promise<void>((resolve) => socket.once("drain", resolve));
}

async function socksConnect(host: string, port: number): Promise<Socket> {
  const remote = await new Promise<Socket>((resolve, reject) => {
    const socket = connect({ host: upstreamHost, port: upstreamPort });
    socket.once("connect", () => resolve(socket));
    socket.once("error", reject);
    socket.setTimeout(10_000, () => socket.destroy(new Error("SOCKS upstream timeout")));
  });
  try {
    const reader = new Reader(remote);
    await write(remote, Buffer.from([5, 1, 0]));
    const greeting = await reader.read(2);
    if (greeting[0] !== 5 || greeting[1] !== 0) throw new Error("SOCKS upstream refused no-auth");
    const name = Buffer.from(host, "utf8");
    if (name.length > 255) throw new Error("proxy hostname too long");
    const target = Buffer.allocUnsafe(7 + name.length);
    target[0] = 5;
    target[1] = 1;
    target[2] = 0;
    target[3] = 3;
    target[4] = name.length;
    name.copy(target, 5);
    target.writeUInt16BE(port, 5 + name.length);
    await write(remote, target);
    const reply = await reader.read(4);
    if (reply[0] !== 5 || reply[1] !== 0) throw new Error(`SOCKS upstream connect failed (${reply[1]})`);
    if (reply[3] === 1) await reader.read(4);
    else if (reply[3] === 4) await reader.read(16);
    else if (reply[3] === 3) await reader.read((await reader.read(1))[0]!);
    else throw new Error("SOCKS upstream returned an unknown address type");
    await reader.read(2);
    reader.dispose();
    remote.setTimeout(0);
    return remote;
  } catch (error) {
    remote.destroy();
    throw error;
  }
}

const server = createServer((client) => {
  client.setTimeout(15_000, () => client.destroy());
  let headers = Buffer.alloc(0);
  const onData = async (chunk: Buffer) => {
    headers = Buffer.concat([headers, chunk]);
    if (headers.length > 16 * 1024) {
      client.write("HTTP/1.1 431 Request Header Fields Too Large\r\nConnection: close\r\n\r\n");
      client.destroy();
      return;
    }
    const end = headers.indexOf("\r\n\r\n");
    if (end < 0) return;
    client.off("data", onData);
    const firstLine = headers.subarray(0, end).toString("latin1").split("\r\n", 1)[0] ?? "";
    const match = /^CONNECT\s+([^\s]+)\s+HTTP\/1\.[01]$/i.exec(firstLine);
    if (!match || end + 4 !== headers.length) {
      client.end("HTTP/1.1 405 CONNECT Required\r\nConnection: close\r\n\r\n");
      return;
    }
    let target: URL;
    try {
      target = new URL(`https://${match[1]}`);
    } catch {
      client.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
      return;
    }
    const host = target.hostname.toLowerCase();
    const allowed = [...allowedHosts].some((entry) => host === entry || host.endsWith(`.${entry}`));
    if (!allowed || (target.port && target.port !== "443") || target.username || target.password) {
      client.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      return;
    }
    try {
      const remote = await socksConnect(host, 443);
      client.setTimeout(0);
      client.write("HTTP/1.1 200 Connection Established\r\nProxy-Agent: Aphrody-Japan-Bridge\r\n\r\n");
      client.pipe(remote);
      remote.pipe(client);
      client.once("error", () => remote.destroy());
      remote.once("error", () => client.destroy());
      client.once("close", () => remote.destroy());
    } catch {
      client.end("HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n");
    }
  };
  client.on("data", onData);
});

server.listen(listenPort, listenHost);
server.on("error", (error) => {
  console.error(JSON.stringify({ event: "http-proxy-listen-error", error: String(error) }));
  process.exitCode = 1;
});
process.on("SIGINT", () => server.close());
process.on("SIGTERM", () => server.close());
