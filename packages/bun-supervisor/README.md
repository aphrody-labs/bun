# @aphrody/supervisor

Reusable Bun supervision for arbitrary commands on Windows, Linux and macOS.
Existing `Supervisor`, budget, pressure and systemd APIs remain available from
the main entry point. `ServiceSupervisor` is also available through the
`@aphrody/supervisor/services` subpath without loading the systemd helpers.

```ts
import { ServiceSupervisor } from "@aphrody/supervisor/services";

const supervisor = new ServiceSupervisor({
  services: [
    { id: "worker", command: [process.execPath, "run", "worker.ts"],
      cwd: process.cwd(), restart: "on-failure" },
  ],
  healthPort: 0,
  signals: true,
  log: event => console.error(JSON.stringify(event)),
});
await supervisor.start();
console.log(supervisor.healthUrl);
// On application shutdown:
await supervisor.stop();
```

Configure common `cwd`/`env`, per-service overrides, an optional `logDirectory`
(append-only `<id>.log` files), and `statusFile` (atomic JSON snapshots). Create
the status file's parent directory before starting. IDs allow letters, digits,
underscores and hyphens, exclude Windows device names, and must be unique ignoring case. Commands are argv
arrays passed directly to `Bun.spawn`; they are never evaluated by a shell.

Services without a `health` URL are healthy while running. HTTP health probes
require a successful response, cancel response bodies, and have configurable
timeouts and intervals. `/health` returns 200 for all healthy services and 503
otherwise; binding is always loopback. Probes target URLs explicitly supplied
by the caller. No credentials, environment flags or private paths are injected.

Restart policies are `always` (default), `on-failure`, and `never`. Exponential
backoff uses configurable `baseMs`, `maxMs` and `stableMs`. `stop()` cancels
backoff/probes, removes signal handlers, drains children up to `drainMs`, then
kills remaining children and awaits their exit. Windows lazily loads
`bun:windows` and assigns every child to a kill-on-close Job, including its
descendants. On other platforms shutdown owns direct children; applications
must arrange descendant cleanup themselves. Signal handling does not exit the
parent application; disable it with `signals: false` to use your own lifecycle.
Instances cannot be restarted after stopping. Log callbacks are observers;
their exceptions do not interrupt cleanup.

`planWindowsService` from `@aphrody/supervisor/windows-service-plan` returns
NSSM command argv arrays for a supplied service name, executable, arguments,
working directory and optional log paths. It performs no process, file,
registry or service operations and never starts the service. The caller owns
NSSM availability, administrator authorization, service inventory, backups,
review and application of the plan. Use `existing: true` only after observing
that service in an inventory. All paths and service metadata are caller-owned;
runtime installation and boot-catalog changes are separate deployment concerns.

The command-supervision, Windows Job and atomic-status design was migrated
from [aphrody-labs/omar](https://github.com/aphrody-labs/omar/blob/d565a5a67d570e3648c091c351698781fb24bf54/server/supervisor.ts),
pinned at `d565a5a67d570e3648c091c351698781fb24bf54`. Host provisioning and private
service manifests remain outside this public API. See the preserved upstream
source and notices in `vendor/omar` and the repository license.
