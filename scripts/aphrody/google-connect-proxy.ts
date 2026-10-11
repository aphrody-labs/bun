// SPDX-License-Identifier: Apache-2.0
import type { Socket } from "bun";

type State = {
  phase: "header" | "connecting" | "handshake" | "tunnel";
  buffer: Buffer;
  queue: Buffer;
  peer?: Socket<State>;
  closed: boolean;
  readEnded: boolean;
  writeEnded: boolean;
  finPending: boolean;
  client: boolean;
  reading?: { length: number; resolve(value: Buffer): void; reject(error: Error): void };
};
const empty = () => Buffer.alloc(0);
const state = (phase: State["phase"]): State => ({
  phase,
  buffer: empty(),
  queue: empty(),
  closed: false,
  readEnded: false,
  writeEnded: false,
  finPending: false,
  client: phase === "header",
});

function host(value: string) {
  if (
    !/^(?=.{1,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(value) ||
    !value.includes(".") ||
    value.includes("..") ||
    value.split(".").some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) ||
    /^\d+(?:\.\d+){3}$/.test(value) ||
    new URL("https://" + value).hostname !== value
  )
    throw new Error("Explicit DNS host required");
  return value;
}

/** TLS stays between Bun.fetch and its HTTPS origin; this relay only forwards tunnel bytes. */
export function startGoogleConnectProxy(options: {
  socksPort: number;
  allowedHosts: readonly string[];
  port?: number;
  maxConnections?: number;
}) {
  const maxConnections = options.maxConnections ?? 32;
  if (
    !Number.isInteger(options.socksPort) ||
    options.socksPort < 1024 ||
    options.socksPort > 65535 ||
    !Array.isArray(options.allowedHosts) ||
    !options.allowedHosts.length ||
    options.allowedHosts.length > 1024 ||
    !Number.isInteger(maxConnections) ||
    maxConnections < 1 ||
    maxConnections > 128 ||
    !Number.isInteger(options.port ?? 0) ||
    (options.port ?? 0) < 0 ||
    (options.port ?? 0) > 65535
  )
    throw new Error("Explicit loopback SOCKS endpoint and host allowlist required");
  const allowed = new Set(options.allowedHosts.map(host));
  const sockets = new Set<Socket<State>>();
  function close(socket: Socket<State>) {
    if (socket.data.closed) return;
    socket.data.closed = true;
    socket.data.reading?.reject(new Error("Proxy connection closed"));
    socket.data.reading = undefined;
    sockets.delete(socket);
    const peer = socket.data.peer;
    socket.terminate();
    if (peer) close(peer);
  }
  function write(socket: Socket<State>, bytes: Buffer) {
    if (socket.data.closed || socket.data.writeEnded) throw new Error("Proxy connection closed");
    socket.data.queue = Buffer.concat([socket.data.queue, bytes]);
    if (socket.data.queue.length > 1024 * 1024) throw new Error("Proxy backpressure limit");
    flush(socket);
  }
  function flush(socket: Socket<State>) {
    if (socket.data.closed) return;
    const queue = socket.data.queue;
    if (queue.length) {
      const count = socket.write(queue);
      if (count < 0) return close(socket);
      socket.data.queue = queue.subarray(count);
    }
    if (socket.data.queue.length) socket.data.peer?.pause();
    else if (socket.data.phase === "tunnel") socket.data.peer?.resume();
    if (!socket.data.queue.length && socket.data.finPending && !socket.data.writeEnded) {
      socket.data.writeEnded = true;
      socket.shutdown();
    }
    const peer = socket.data.peer;
    if (
      peer &&
      socket.data.readEnded &&
      socket.data.writeEnded &&
      (peer.data.closed || (peer.data.readEnded && peer.data.writeEnded))
    ) {
      socket.end();
      if (!peer.data.closed) peer.end();
    }
  }
  function consume(socket: Socket<State>) {
    const pending = socket.data.reading;
    if (!pending || socket.data.buffer.length < pending.length) return;
    const value = socket.data.buffer.subarray(0, pending.length);
    socket.data.buffer = socket.data.buffer.subarray(pending.length);
    socket.data.reading = undefined;
    pending.resolve(value);
  }
  function read(socket: Socket<State>, length: number): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      if (socket.data.closed || socket.data.reading) return reject(new Error("Proxy handshake unavailable"));
      socket.data.reading = { length, resolve, reject };
      consume(socket);
    });
  }
  async function tunnel(client: Socket<State>, hostname: string) {
    const upstream = await Bun.connect<State>({
      hostname: "127.0.0.1",
      port: options.socksPort,
      data: state("handshake"),
      socket: handlers,
      allowHalfOpen: true,
    });
    if (client.data.closed) {
      close(upstream);
      return;
    }
    client.data.peer = upstream;
    upstream.data.peer = client;
    write(upstream, Buffer.from([5, 1, 0]));
    const selected = await read(upstream, 2);
    if (selected[0] !== 5 || selected[1] !== 0) throw new Error("SOCKS method rejected");
    const name = Buffer.from(hostname, "ascii");
    write(upstream, Buffer.concat([Buffer.from([5, 1, 0, 3, name.length]), name, Buffer.from([1, 187])]));
    const reply = await read(upstream, 4);
    if (reply[0] !== 5 || reply[1] !== 0 || reply[2] !== 0) throw new Error("SOCKS connection rejected");
    if (reply[3] === 1) await read(upstream, 6);
    else if (reply[3] === 4) await read(upstream, 18);
    else if (reply[3] === 3) await read(upstream, (await read(upstream, 1))[0]! + 2);
    else throw new Error("SOCKS address rejected");
    client.data.phase = upstream.data.phase = "tunnel";
    client.timeout(60);
    upstream.timeout(60);
    write(client, Buffer.from("HTTP/1.1 200 Connection Established\r\n\r\n"));
    const buffered = client.data.buffer;
    client.data.buffer = empty();
    if (buffered.length) write(upstream, buffered);
    const inbound = upstream.data.buffer;
    upstream.data.buffer = empty();
    if (inbound.length) write(client, inbound);
    if (client.data.readEnded) {
      upstream.data.finPending = true;
      flush(upstream);
    }
    if (!upstream.data.queue.length) client.resume();
  }
  const handlers = {
    open(socket: Socket<State>) {
      sockets.add(socket);
      socket.timeout(10);
    },
    close(socket: Socket<State>, error?: Error) {
      // After a local write FIN, Bun can deliver a clean close without an end callback.
      // Terminating its peer would reset bytes already accepted by the peer's send buffer.
      if (!error && socket.data.phase === "tunnel" && (socket.data.readEnded || socket.data.writeEnded)) {
        socket.data.closed = true;
        socket.data.readEnded = true;
        socket.data.writeEnded = true;
        sockets.delete(socket);
        const peer = socket.data.peer;
        if (peer && !peer.data.closed) {
          peer.data.finPending = true;
          flush(peer);
        }
      } else close(socket);
    },
    end(socket: Socket<State>) {
      socket.data.readEnded = true;
      if (socket.data.phase === "tunnel" && socket.data.peer) {
        if (!socket.data.peer.data.closed) {
          socket.data.peer.data.finPending = true;
          flush(socket.data.peer);
        }
        flush(socket);
      } else if (socket.data.phase === "handshake" || socket.data.phase === "header") close(socket);
    },
    error(socket: Socket<State>) {
      close(socket);
    },
    timeout(socket: Socket<State>) {
      close(socket);
    },
    drain(socket: Socket<State>) {
      flush(socket);
    },
    data(socket: Socket<State>, incoming: Buffer) {
      try {
        if (socket.data.phase === "tunnel") {
          write(socket.data.peer!, incoming);
          return;
        }
        socket.data.buffer = Buffer.concat([socket.data.buffer, incoming]);
        if (socket.data.buffer.length > 256 * 1024) throw new Error("Proxy handshake buffer exceeded");
        if (socket.data.phase === "handshake") {
          consume(socket);
          return;
        }
        if (socket.data.phase !== "header") return;
        const end = socket.data.buffer.indexOf("\r\n\r\n");
        if (end < 0) {
          if (socket.data.buffer.length > 8192) throw new Error("Proxy header exceeded");
          return;
        }
        if (end > 8192) throw new Error("Proxy header exceeded");
        const headerBytes = socket.data.buffer.subarray(0, end);
        if (headerBytes.some(byte => byte > 126 || (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13)))
          throw new Error("Proxy header must be ASCII");
        const header = headerBytes.toString("ascii");
        const match = /^CONNECT ([a-z0-9.-]+):443 HTTP\/1\.[01]\r\n/.exec(header + "\r\n");
        const lines = header.split("\r\n").slice(1);
        const hosts = lines.filter(line => /^Host:/i.test(line));
        if (
          !match ||
          !allowed.has(match[1]!) ||
          lines.some(line => !/^[!#$%&'*+.^_`|~a-zA-Z0-9-]+:[\t\x20-\x7e]*$/.test(line)) ||
          hosts.length > 1 ||
          (hosts.length === 1 && hosts[0]!.slice(5).trim().toLowerCase() !== match[1] + ":443") ||
          /(?:^|\r\n)(?:Content-Length|Transfer-Encoding):/i.test(header)
        ) {
          socket.end("HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
          return;
        }
        socket.data.buffer = socket.data.buffer.subarray(end + 4);
        socket.data.phase = "connecting";
        socket.pause();
        void tunnel(socket, match[1]!).catch(() => close(socket));
      } catch {
        close(socket);
      }
    },
  };
  const listener = Bun.listen<State>({
    hostname: "127.0.0.1",
    port: options.port ?? 0,
    data: state("header"),
    allowHalfOpen: true,
    socket: {
      ...handlers,
      open(socket) {
        socket.data = state("header");
        if ([...sockets].filter(item => item.data.client).length >= maxConnections) {
          close(socket);
          return;
        }
        handlers.open(socket);
      },
    },
  });
  return {
    proxyURL: `http://127.0.0.1:${listener.port}`,
    stop() {
      listener.stop(true);
      for (const socket of Array.from(sockets)) close(socket);
    },
  };
}

export function createGoogleProxyFetch(options: { proxyURL: string; allowedOrigins: readonly string[] }) {
  const proxy = new URL(options.proxyURL);
  if (
    proxy.protocol !== "http:" ||
    proxy.hostname !== "127.0.0.1" ||
    !proxy.port ||
    proxy.username ||
    proxy.password ||
    proxy.pathname !== "/" ||
    proxy.search ||
    proxy.hash
  )
    throw new Error("Explicit loopback HTTP proxy required");
  const origins = new Set(
    options.allowedOrigins.map(value => {
      const url = new URL(value);
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.port ||
        url.pathname !== "/" ||
        url.search ||
        url.hash
      )
        throw new Error("Exact HTTPS origins required");
      host(url.hostname);
      return url.origin;
    }),
  );
  if (!origins.size || origins.size > 1024) throw new Error("Explicit origin allowlist required");
  return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.protocol !== "https:" || url.username || url.password || url.hash || !origins.has(url.origin))
      throw new Error("Google transport origin rejected");
    return fetch(input, { ...init, redirect: "manual", proxy: { url: proxy.href, respectNoProxy: false } });
  };
}
