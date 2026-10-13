# Bun NGINX

`bun:nginx` and `bun:Nginixx` expose the same native Rust controller. This package
re-exports that owner. The selected native NGINX executable handles HTTP, TLS,
proxying, caching and the configured modules.

```ts
import { Nginx } from "bun:nginx";

const provider = await Nginx.probe({ binary: "/usr/sbin/nginx" });
if (!provider.available) throw new Error(provider.message);

await using nginx = await Nginx.create({
  binary: "/usr/sbin/nginx",
  prefix: "/home/ubuntu/apps/my-nginx",
  configFile: "nginx.conf",
  timeoutMs: 10_000,
});
await nginx.validate();
const status = await nginx.start();
console.log(status.pid);
await nginx.reload();
```

The prefix and configuration must already exist. The configuration must resolve
inside the prefix and omit `daemon` and `pid`: Bun starts NGINX in the foreground
with its own `bun-nginx.pid`. An exclusive `.bun-nginx-owner` prevents another
controller from adopting that prefix. Reload and quit verify the live child PID
against this file before invoking NGINX. No operation adopts or signals a global
NGINX instance.

Each operation has a deadline of 1–30000 ms. AbortSignal cancels an operation.
Failed or cancelled startup terminates the owned child tree. `quit()` waits for a
graceful exit; `close()` also releases the prefix, and terminates the owned tree
if its graceful deadline expires. Use `await using` or `try/finally` to close.
Concurrent operations on the same controller reject with `ERR_NGINX_BUSY`.

A running master keeps Bun alive until its real exit. Native cancellation and
controller collection terminate its owned process group or Windows job; master
exit also stops remaining owned workers. The monitor contains OS state and a
completion ticket, without a JS reference that would pin the controller.

`probe()` returns `available: false` only for an unavailable executable. Invalid
configuration, permission failures, invalid ownership, malformed executables,
timeouts and exceeded output bounds remain errors. There is no implicit download
or fallback HTTP server.

Capabilities come from `nginx -V` and describe build flags. Dynamic modules still
need configuration and protocol tests. Upstream Windows NGINX is beta, has one
effective worker, and does not support UDP/QUIC. The host architecture in the
report does not attest the executable's architecture.

Existing release-site configuration transformations live in
`scripts/aphrody/deploy/release-nginx.ts`; this SDK accepts their prepared output
without copying that policy.

Explicit provider preparation and separate engine gates are documented in
[`docs/project/bun-nginx.md`](../../docs/project/bun-nginx.md). Their receipts
qualify the selected executable independently of the changed-binary controller
tests.
