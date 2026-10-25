# Recurring source-pinned site publication

`packages/bun-ui/packages/web/site/install-auto-publish-task.ps1` manages the single native Windows
task `Aphrody Site Publish`. It uses the current owner's interactive login, checks
every five minutes while that login is available, ignores overlapping starts, and
bounds each execution to thirty minutes.

The installer resolves the selected checkout and `APHRODY_HOME`, then checks the
protected configuration references without printing their values. Preview is the
default. `-Apply -ProductionReceipt <last-sync.json>` additionally requires a real
production receipt and fresh matching public static and database responses. The
publisher must already be committed and pushed; its Git blob is pinned in the
task arguments. Activation before those checks is refused.

The task invokes `packages/bun-ui/packages/web/site/auto-publish.ts` with the installed Aphrody Bun.
That entrypoint verifies its bootstrap bytes, fetches `origin/main`, and exports
the immutable commit using the existing `auto-publish.sh` archive contract. The
source-owned `jit-source.ts` supplies workspace metadata. Cloudflare dependencies
are reused through their owner directory only after their captured lock, pins,
and installed Wrangler version agree. No checkout files or provider stores are
synchronized.

Each run calls the source-pinned `sync.ts` pipeline, which owns the documentation,
plugin, graph, database snapshot and production Worker/routes. The configured
editorial and measured-runtime policies remain that pipeline's decision. A
publication lock also prevents a manually started job from overlapping the task.
Temporary source exports are removed when the job ends. The only automatic-job
summary is `auto-publish-last.json` under the configured build root; it records
status, phase and public source identity, never credentials or raw child output.

The VPS timer is a separate execution context. Its old installed publisher must
not be promoted to five-minute publication until its own configuration, protected
references and dependency owner are qualified on that host. Local Windows
credentials are not copied to satisfy those prerequisites.
