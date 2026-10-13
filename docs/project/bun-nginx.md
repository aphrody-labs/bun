# Native NGINX controller

`bun:nginx` and the literal spelling `bun:Nginixx` resolve to the same Rust
process controller. NGINX's selected native executable owns its configuration,
HTTP engine and compiled modules. The optional `@aphrody/bun-nginx` package
re-exports the builtin and its types.

```ts
import Nginx from "bun:nginx";

const provider = await Nginx.probe({ binary: "/usr/sbin/nginx" });
if (!provider.available) throw new Error(provider.message);

await using nginx = await Nginx.create({
  binary: "/usr/sbin/nginx",
  prefix: "/home/ubuntu/apps/my-nginx",
  configFile: "nginx.conf",
  timeoutMs: 10_000,
});
await nginx.validate();
const started = await nginx.start();
console.log(started.pid);
await nginx.reload();
```

The prefix must already exist and the configuration must resolve inside it.
Omit `daemon` and `pid` directives: Bun supplies foreground mode and
`<prefix>/bun-nginx.pid`. Prepare NGINX's log and temporary directories in that
private prefix, or set the corresponding paths in the configuration. Existing
release-site configuration policy stays in
`scripts/aphrody/deploy/release-nginx.ts`.

An exclusive `.bun-nginx-owner` prevents two controllers from claiming one
prefix. Start refuses an existing PID file. Reload and quit verify both prefix
ownership and the PID of the spawned master. Unix masters have an owned process
group; Windows masters have a job object with kill-on-close. Operations cannot
adopt, reload or terminate an unrelated NGINX service.

`validate()`, `start()`, `reload()`, `quit()`, `status()` and `close()` return
promises. Each operation accepts `timeoutMs` and `signal`. Deadlines are integer
milliseconds between 1 and 30000. Diagnostic output has a separate bound for
each stream, default 262144 bytes, maximum 1048576. Concurrent operations reject
with `ERR_NGINX_BUSY`.

The running master keeps Bun's event loop alive through a cancellable native
job. Master exit ends that job and stops remaining owned workers. A collected
controller synchronously terminates its owned group; reaping happens outside
the JS thread. VM cancellation also terminates the group. A failed or aborted
start terminates its child. `quit()` waits for graceful exit and permits a later
start; `close()` also releases ownership and forces termination when graceful
quit exceeds its deadline. Repeated close succeeds. Use `await using` or an
explicit `finally` block for deterministic closure.

`probe()` reports `available: false` only when the executable is unavailable.
Configuration failures, redirected ownership, deadlines, aborts and output
limits reject with their native error codes. Bun does not download a provider
implicitly. Capabilities measured by `nginx -V` describe compile flags; protocol
tests and dynamic module configuration are separate evidence. `platform` and
`arch` describe Bun's host. Upstream Windows NGINX is beta, has one effective
worker and does not provide UDP/QUIC.

## Provider and engine gates

The explicit Windows helper downloads the pinned official ZIP and detached
signature, verifies it with official public keys in an isolated public keyring,
verifies extracted bytes against the signed archive, and records the actual PE
architecture. It does not modify a user's keyring or install a global service.

```powershell
bun packages/bun-nginx/scripts/prepare-provider.ts C:/bun/factory/artifacts/nginx-sdk/windows "C:/Program Files/Git/usr/bin/gpg.exe"
bun packages/bun-nginx/scripts/qualify-engine.ts C:/bun/factory/artifacts/nginx-sdk/windows/prefix/nginx-1.31.6/nginx.exe C:/bun/factory/artifacts/nginx-sdk/windows/engine-qualification.json
```

`qualify-engine.ts` also accepts an existing Linux ELF executable. Its private
localhost fixture measures configuration validation, HTTP bytes, Range,
reload with the same master PID, rejection of invalid configuration while the
old master still serves, and graceful quit. The receipt records binary SHA256,
format, architecture and the executing Bun revision. It always records
`nativeBunController: false`: this engine gate does not exercise the builtin.

On 2026-10-13 these engine gates passed for the signed upstream Windows 1.31.6
provider (PE x86, executed on Windows x64) and the existing VPS Ubuntu 1.28.3
provider (ELF x64). They do not attest a portable provider for all Bun release
targets, TLS/HTTP3 behavior or Rust controller execution.

The changed-binary controller gate is separate:

```powershell
$env:BUN_NGINX_TEST_BINARY = "C:/bun/factory/artifacts/nginx-sdk/windows/prefix/nginx-1.31.6/nginx.exe"
bun bd test ./test/js/bun/nginx/test.ts
```

Core tests use an explicit process-protocol fixture to cover isolation,
deadlines, abort, crash, GC, keepalive, VM exit and worker cleanup. The optional
real engine case skips only when no selected executable exists. A missing
builtin or failed core test remains a failed gate.

References: [NGINX switches](https://nginx.org/en/docs/switches.html),
[Windows limitations](https://nginx.org/en/docs/windows.html),
[official signing keys](https://nginx.org/en/pgp_keys.html).
