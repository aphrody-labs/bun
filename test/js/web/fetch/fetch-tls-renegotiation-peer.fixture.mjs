// Node peer for the "fetch reuses a pooled socket mid-renegotiation" test.
// Node is required: only it can send a HelloRequest to a Bun client.
//
//   origin: a TLS 1.2 keep-alive HTTP server
//   relay:  a plain TCP proxy in front of it that can hold client->origin bytes
//
// Control is line-based over stdin, and every transition is reported on stdout,
// so the test never waits on a timer.
//   stdin  "hold"    from now on client->origin bytes are held, not forwarded
//   stdin  "reneg"   renegotiate() on the most recent TLS server socket
//   stdin  "release" forward what was held and stop holding
//   stdin  "report"  list, per TLS connection, whether the client resumed a session
//   stdout "PORT <relayPort>" / "armed" / "reneg <bool>" / "held <bytes> type <n>"
//   stdout "release" / "resumed <json array of bool>"
import fs from "node:fs";
import https from "node:https";
import net from "node:net";
import path from "node:path";
import readline from "node:readline";

const keys = process.argv[2];
const key = fs.readFileSync(path.join(keys, "agent1-key.pem"));
const cert = fs.readFileSync(path.join(keys, "agent1-cert.pem"));

const say = line => process.stdout.write(line + "\n");

let lastSecure = null;
const origin = https.createServer({ key, cert, minVersion: "TLSv1.2", maxVersion: "TLSv1.2" }, (req, res) => {
  res.writeHead(200, { "content-length": "2", connection: "keep-alive" });
  res.end("ok");
});
// One entry per TLS connection: did the client resume a cached session?
// A renegotiation does not add an entry, it reuses the socket it runs on.
const resumed = [];
origin.on("secureConnection", socket => {
  lastSecure = socket;
  resumed.push(socket.isSessionReused());
  socket.on("error", () => {});
});
origin.on("tlsClientError", () => {});
origin.on("error", e => say("origin-error " + (e.code || e.message)));
await new Promise(r => origin.listen(0, "127.0.0.1", r));
const originPort = origin.address().port;

let hold = false;
let held = [];
let announced = false;
let upstream = null;

const relay = net.createServer(clientSide => {
  clientSide.setNoDelay(true);
  const serverSide = net.connect(originPort, "127.0.0.1");
  serverSide.setNoDelay(true);
  // Only the first connection is ever held, and "release" writes to it.
  upstream ??= serverSide;
  clientSide.on("data", chunk => {
    if (!hold) return void serverSide.write(chunk);
    held.push(chunk);
    if (announced) return;
    announced = true;
    // The client is idle here, so the first held chunk is its renegotiation
    // ClientHello. Record type 22 is a handshake record.
    say("held " + chunk.length + " type " + chunk[0]);
  });
  serverSide.on("data", chunk => clientSide.write(chunk));
  const kill = () => {
    clientSide.destroy();
    serverSide.destroy();
  };
  for (const s of [clientSide, serverSide]) {
    s.on("error", kill);
    s.on("close", kill);
  }
});
await new Promise(r => relay.listen(0, "127.0.0.1", r));
say("PORT " + relay.address().port);

readline.createInterface({ input: process.stdin }).on("line", line => {
  switch (line.trim()) {
    case "hold":
      hold = true;
      say("armed");
      break;
    case "reneg":
      try {
        say("reneg " + lastSecure.renegotiate({}, () => {}));
      } catch (e) {
        say("reneg-threw " + e.message);
      }
      break;
    case "release":
      hold = false;
      for (const chunk of held) upstream.write(chunk);
      held = [];
      say("release");
      break;
    case "report":
      say("resumed " + JSON.stringify(resumed));
      break;
    case "exit":
      process.exit(0);
  }
});
