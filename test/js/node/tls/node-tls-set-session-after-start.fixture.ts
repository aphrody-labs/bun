// Fixture for the "setSession() after the handshake started" tests in
// node-tls-connect.test.ts and test/js/bun/net/socket.test.ts.
//
// BoringSSL's SSL_set_session may only be called before the handshake starts.
// Upstream enforces that with abort(); Bun patches it to return 0
// (patches/boringssl/set-session-return-0.patch), so setSession() ignores the
// late offer and the connection keeps working.
//
// Each door below reaches setSession() through a different JS entry point with
// the handshake already started. It prints one JSON line and exits 0. Without
// the patch the process dies with SIGABRT and prints nothing.
//
// Run one door per process: `bun node-tls-set-session-after-start.fixture.ts <door>`.
import { once } from "node:events";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { Duplex } from "node:stream";
import tls from "node:tls";

const door = process.argv[2];

// Read the cert from disk rather than importing "harness": that import costs
// about two seconds under a debug build, most of this fixture's runtime.
const keys = path.join(import.meta.dirname, "fixtures");
const key = fs.readFileSync(path.join(keys, "agent1-key.pem"));
const cert = fs.readFileSync(path.join(keys, "agent1-cert.pem"));

/** A valid serialized session. Only a session that parses reaches SSL_set_session. */
let session: Buffer;
/** Set by the door that calls setSession() on the server side. */
let onServerSocket: ((socket: tls.TLSSocket) => void) | undefined;

const server = tls.createServer({ key, cert }, socket => {
  socket.on("error", () => {});
  socket.on("data", chunk => socket.write(chunk));
  onServerSocket?.(socket);
});
await once(server.listen(0, "127.0.0.1"), "listening");
const port = (server.address() as net.AddressInfo).port;
const clientOptions = { host: "127.0.0.1", port, rejectUnauthorized: false } as const;

// A first connection produces the session blob every door feeds back in.
{
  const first = tls.connect(clientOptions);
  await once(first, "secureConnect");
  session = first.getSession()!;
  first.destroy();
  await once(first, "close");
}

/** Call setSession() and report what happened, then exit. */
function report(call: () => void, extra: Record<string, unknown> = {}) {
  let threw: string | null = null;
  try {
    call();
  } catch (e) {
    threw = (e as Error).message;
  }
  console.log(JSON.stringify({ threw, ...extra }));
  server.close();
  process.exit(0);
}

/**
 * Call setSession() on a connected client, then prove the connection still
 * carries data. A refused offer must leave the socket usable.
 */
async function lateOnClient(client: tls.TLSSocket) {
  let threw: string | null = null;
  try {
    client.setSession(session);
  } catch (e) {
    threw = (e as Error).message;
  }
  const echoed = new Promise<string>(resolve => client.once("data", d => resolve(String(d))));
  client.write("ping");
  const echo = await Promise.race([echoed, once(client, "close").then(() => "<closed>")]);
  client.destroy();
  console.log(JSON.stringify({ threw, echo }));
  server.close();
  process.exit(0);
}

switch (door) {
  // node:tls client, in its own secureConnect handler.
  case "node-client": {
    const client = tls.connect(clientOptions);
    client.on("error", () => {});
    await once(client, "secureConnect");
    await lateOnClient(client);
    break;
  }

  // node:tls server, in the connection handler. The server's handshake is
  // finished by the time that handler runs.
  case "node-server": {
    onServerSocket = socket => report(() => socket.setSession(session), { side: "server" });
    const client = tls.connect(clientOptions);
    client.on("error", () => {});
    await once(client, "secureConnect");
    break;
  }

  // TLS over a user Duplex. A separate SSL owner (the Rust SSLWrapper), not
  // the uSockets socket the other client doors use.
  case "node-duplex": {
    const raw = net.connect(port, "127.0.0.1");
    await once(raw, "connect");
    const proxy = new Duplex({
      read() {},
      write(chunk, _enc, cb) {
        raw.write(chunk, cb);
      },
    });
    raw.on("data", chunk => proxy.push(chunk));
    raw.on("end", () => proxy.push(null));
    const client = tls.connect({ ...clientOptions, socket: proxy });
    client.on("error", () => {});
    await once(client, "secureConnect");
    await lateOnClient(client);
    break;
  }

  // tls.connect({socket}) over an already connected net.Socket: the adopt-TLS
  // path, a third way to reach the same SSL.
  case "node-wrap": {
    const raw = net.connect(port, "127.0.0.1");
    await once(raw, "connect");
    const client = tls.connect({ ...clientOptions, socket: raw });
    client.on("error", () => {});
    await once(client, "secureConnect");
    await lateOnClient(client);
    break;
  }

  // new tls.TLSSocket(socket, {isServer: true}) over an accepted net.Socket:
  // the adopt-TLS path again, in its server role.
  case "node-server-wrap": {
    const plain = net.createServer(raw => {
      const secure = new tls.TLSSocket(raw, { isServer: true, secureContext: tls.createSecureContext({ key, cert }) });
      secure.on("error", () => {});
      secure.on("secure", () => report(() => secure.setSession(session), { side: "server" }));
    });
    await once(plain.listen(0, "127.0.0.1"), "listening");
    const client = tls.connect({ ...clientOptions, port: (plain.address() as net.AddressInfo).port });
    client.on("error", () => {});
    await once(client, "secureConnect");
    break;
  }

  // Bun.connect, from the handshake handler.
  case "bun-connect-handshake": {
    await Bun.connect({
      hostname: "127.0.0.1",
      port,
      tls: { rejectUnauthorized: false },
      socket: {
        handshake(socket) {
          report(() => socket.setSession(session));
        },
        data() {},
        error() {},
      },
    });
    break;
  }

  // Bun.connect with no handshake handler: open() then fires after the
  // handshake, which is the default timing for this API.
  case "bun-connect-open-late": {
    await Bun.connect({
      hostname: "127.0.0.1",
      port,
      tls: { rejectUnauthorized: false },
      socket: {
        open(socket) {
          report(() => socket.setSession(session));
        },
        data() {},
        error() {},
      },
    });
    break;
  }

  // Bun.listen, from the server's handshake handler.
  case "bun-listen-handshake": {
    const listener = Bun.listen({
      hostname: "127.0.0.1",
      port: 0,
      tls: { key: key.toString(), cert: cert.toString() },
      socket: {
        handshake(socket) {
          report(() => socket.setSession(session), { side: "server" });
        },
        data() {},
        error() {},
      },
    });
    const client = tls.connect({ ...clientOptions, port: listener.port });
    client.on("error", () => {});
    await once(client, "secureConnect");
    break;
  }

  // A handshake that failed: the peer's chain is refused, so the handshake
  // never finishes, but it did start. SSL_is_init_finished() is still 0 here,
  // so a guard built on it alone lets this call through.
  case "bun-connect-failed-handshake": {
    await Bun.connect({
      hostname: "127.0.0.1",
      port,
      // No CA for the self-signed chain, and rejectUnauthorized stays on.
      tls: true,
      socket: {
        handshake(socket, success) {
          report(() => socket.setSession(session), { success });
        },
        data() {},
        error() {},
        close() {},
      },
    });
    break;
  }

  // open() with a handshake handler is the legal window, but a write there
  // starts the handshake from inside SSL_write. The call after it is late.
  case "bun-connect-open-after-write": {
    await Bun.connect({
      hostname: "127.0.0.1",
      port,
      tls: { rejectUnauthorized: false },
      socket: {
        open(socket) {
          socket.write("x");
          report(() => socket.setSession(session));
        },
        handshake() {},
        data() {},
        error() {},
      },
    });
    break;
  }

  // socket.upgradeTLS() returns [raw, tls]. Both halves reach the one SSL.
  case "bun-upgrade-tls-half":
  case "bun-upgrade-raw-half": {
    const plain = await Bun.connect({
      hostname: "127.0.0.1",
      port,
      socket: { open() {}, data() {}, error() {} },
    });
    const [rawHalf, tlsHalf] = plain.upgradeTLS({
      tls: { rejectUnauthorized: false },
      socket: {
        handshake() {
          const half = door === "bun-upgrade-tls-half" ? tlsHalf : rawHalf;
          report(() => half.setSession(session));
        },
        data() {},
        error() {},
      },
    });
    break;
  }

  // The legal window: with both open and handshake handlers, open() runs
  // before the ClientHello. This door must keep working.
  case "bun-connect-open-legal": {
    await Bun.connect({
      hostname: "127.0.0.1",
      port,
      tls: { rejectUnauthorized: false },
      socket: {
        open(socket) {
          report(() => socket.setSession(session));
        },
        handshake() {},
        data() {},
        error() {},
      },
    });
    break;
  }

  default:
    throw new Error(`unknown door ${door}`);
}
