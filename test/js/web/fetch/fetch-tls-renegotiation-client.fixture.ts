// Bun client for the "fetch reuses a pooled socket mid-renegotiation" test.
// No timers: it waits for "go" and "go2" lines from the test on stdin.
// argv: <relayPort> <controlPort> <keysDir>
const [relayPort, controlPort, keys] = process.argv.slice(2);
const ca = await Bun.file(`${keys}/ca1-cert.pem`).text();
const url = `https://127.0.0.1:${relayPort}/`;
// rejectUnauthorized must stay on: the session cache skips a client without it.
const options = { tls: { ca, serverName: "agent1" }, keepalive: true } as const;

const lines = console[Symbol.asyncIterator]();
async function waitFor(word: string) {
  for (;;) {
    const { value, done } = await lines.next();
    if (done) throw new Error(`stdin closed before "${word}"`);
    if (value.trim() === word) return;
  }
}

const first = await fetch(url, options);
console.log("first " + first.status + " " + (await first.text()));

// The test sends "go" once the relay holds the renegotiation ClientHello, so
// the pooled socket's SSL is mid-handshake from here on.
await waitFor("go");

// Queued first on the HTTP thread: it picks the pooled socket back up, which
// is where fetch offered the cached session to an SSL whose handshake had begun.
const second = fetch(url, options).then(
  r => r.text(),
  e => "err " + (e.code || e.message),
);
// Queued second on the same thread, so once this plain-HTTP response is back
// the pooled pickup above has already run.
const pong = await fetch(`http://127.0.0.1:${controlPort}/`).then(r => r.text());
console.log("survived-reuse " + pong);
// The renegotiation is stuck until the test releases it, so the second request
// has no outcome of its own to assert.
void second;

// The test releases the renegotiation, then sends "go2".
await waitFor("go2");

// keepalive: false opens a connection of its own instead of taking the pooled
// socket, so the origin reports whether the cached session is still there to
// offer. The pooled pickup above must not have consumed it.
const third = await fetch(url, { ...options, keepalive: false });
console.log("third " + third.status + " " + (await third.text()));
process.exit(0);
