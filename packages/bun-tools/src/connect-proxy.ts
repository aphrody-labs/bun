import { connect, createServer, type Socket } from "node:net";
import { domainToASCII } from "node:url";

// Adapted from aphrody-labs/omar server/japan-http-proxy.ts at d565a5a67d570e3648c091c351698781fb24bf54.
export interface ConnectProxyOptions {
  upstream: { hostname: string; port: number };
  allowedHosts: string[];
  allowedPorts?: number[];
  hostname?: "127.0.0.1" | "::1";
  port?: number;
  timeoutMs?: number;
}

function portNumber(value: number, allowZero = false) {
  if (!Number.isInteger(value) || value < (allowZero ? 0 : 1) || value > 65535) throw new Error("Invalid port");
  return value;
}

function normalizeHost(host: string) {
  const value = domainToASCII(host.trim().toLowerCase().replace(/\.$/, ""));
  if (!value || !/^[a-z0-9.-]+$/.test(value) || value.split(".").some(part => !part || part.length > 63)) {
    throw new Error("Expected a DNS hostname");
  }
  return value;
}

async function socksConnect(
  hostname: string,
  port: number,
  options: ConnectProxyOptions,
  sockets: Set<Socket>,
  client: Socket,
) {
  const socket = connect({ host: options.upstream.hostname, port: options.upstream.port });
  sockets.add(socket);
  socket.once("close", () => sockets.delete(socket));
  const reader = socket.iterator({ destroyOnReturn: false });
  let pending = Buffer.alloc(0);
  const read = async (count: number) => {
    while (pending.length < count) {
      const next = await reader.next();
      if (next.done) throw new Error("SOCKS upstream closed during handshake");
      pending = Buffer.concat([pending, next.value]);
    }
    const value = pending.subarray(0, count);
    pending = pending.subarray(count);
    return value;
  };
  const cancel = () => socket.destroy();
  client.once("close", cancel);
  const deadline = setTimeout(() => socket.destroy(new Error("SOCKS handshake timeout")), options.timeoutMs ?? 10_000);
  // The async iterator owns socket errors throughout connect and handshake.
  try {
    socket.write(Buffer.from([5, 1, 0]));
    const greeting = await read(2);
    if (greeting[0] !== 5 || greeting[1] !== 0) throw new Error("SOCKS upstream refused no-auth");
    const name = Buffer.from(hostname);
    if (name.length > 255) throw new Error("SOCKS hostname too long");
    const request = Buffer.alloc(7 + name.length);
    request.set([5, 1, 0, 3, name.length]);
    name.copy(request, 5);
    request.writeUInt16BE(port, 5 + name.length);
    socket.write(request);
    const reply = await read(4);
    if (reply[0] !== 5 || reply[1] !== 0 || reply[2] !== 0) throw new Error("SOCKS connect refused");
    if (reply[3] === 1) await read(4);
    else if (reply[3] === 4) await read(16);
    else if (reply[3] === 3) await read((await read(1))[0]!);
    else throw new Error("Invalid SOCKS address type");
    await read(2);
    await reader.return?.();
    if (pending.length) socket.unshift(pending);
    socket.setTimeout(0);
    return socket;
  } catch (error) {
    socket.destroy();
    throw error;
  } finally {
    clearTimeout(deadline);
    client.off("close", cancel);
  }
}

export async function startConnectProxy(options: ConnectProxyOptions) {
  portNumber(options.upstream.port);
  portNumber(options.port ?? 0, true);
  if (!options.upstream.hostname) throw new Error("SOCKS upstream hostname is required");
  if (options.timeoutMs !== undefined && (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1)) {
    throw new Error("timeoutMs must be positive");
  }
  const hosts = options.allowedHosts.map(normalizeHost);
  if (!hosts.length) throw new Error("An explicit host allowlist is required");
  const ports = new Set((options.allowedPorts ?? [443]).map(port => portNumber(port)));
  const hostname = options.hostname ?? "127.0.0.1";
  if (hostname !== "127.0.0.1" && hostname !== "::1") throw new Error("CONNECT listener must use loopback");
  const sockets = new Set<Socket>();
  let stopping = false;
  let shutdown: Promise<void> | undefined;
  const server = createServer(client => {
    sockets.add(client);
    client.on("error", () => client.destroy());
    client.once("close", () => sockets.delete(client));
    client.setTimeout(options.timeoutMs ?? 10_000, () => client.destroy());
    let headers = Buffer.alloc(0);
    const reject = (status: string) => client.end(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
    const onData = async (chunk: Buffer) => {
      headers = Buffer.concat([headers, chunk]);
      const end = headers.indexOf("\r\n\r\n");
      if (end < 0 && headers.length <= 16_384) return;
      client.off("data", onData);
      client.pause();
      if (end < 0 || end > 16_384) {
        reject("431 Request Header Fields Too Large");
        return;
      }
      const match = /^CONNECT ([a-z0-9.-]+):(\d+) HTTP\/1\.[01]$/i.exec(
        headers.subarray(0, end).toString().split("\r\n")[0]!,
      );
      if (!match) {
        reject("405 CONNECT Required");
        return;
      }
      let target: string;
      try {
        target = normalizeHost(match[1]!);
      } catch {
        reject("400 Bad Request");
        return;
      }
      const port = Number(match[2]);
      if (!ports.has(port) || !hosts.some(host => target === host || target.endsWith(`.${host}`))) {
        reject("403 Forbidden");
        return;
      }
      try {
        const remote = await socksConnect(target, port, options, sockets, client);
        remote.on("error", () => client.destroy());
        remote.once("close", () => client.destroy());
        client.once("close", () => remote.destroy());
        if (stopping || client.destroyed) {
          remote.destroy();
          return;
        }
        client.setTimeout(0);
        client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        const early = headers.subarray(end + 4);
        if (early.length) remote.write(early);
        client.pipe(remote);
        remote.pipe(client);
        client.resume();
      } catch {
        if (!client.destroyed) reject("502 Bad Gateway");
      }
    };
    client.on("data", onData);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 0, hostname, () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("TCP listener has no address");
  return {
    hostname,
    port: address.port,
    stop() {
      if (shutdown) return shutdown;
      stopping = true;
      return (shutdown = new Promise<void>((resolve, reject) => {
        server.close(error => (error ? reject(error) : resolve()));
        for (const socket of sockets) socket.destroy();
      }));
    },
  };
}
