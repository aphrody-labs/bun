# Upstream source checkout

`scripts/aphrody/sync-upstream-source.ts` prepares a single source checkout of
`oven-sh/bun` for the existing `scripts/aphrody/sync-upstream.ts` workflow.
It does not schedule work or merge the fork itself.

Run the coordinator from the selected fork:

```sh
bun scripts/aphrody/sync-upstream.ts --upstream-checkout ../bun-upstream --dry-run
bun scripts/aphrody/sync-upstream.ts --upstream-checkout ../bun-upstream --push
```

The first command previews the current refs without changing either checkout.
The second refreshes the sibling source, imports its verified `main`, merges and
reapplies the `@aphrody` scope only to merged paths. The existing workflow runs it
every six hours. The clone path defaults to a sibling of the selected checkout.

Preview computes Git tree objects using a temporary index in the repository's
Git directory. It reports added and deleted paths, real merge conflicts and
collisions with local work. It preserves the shared index and working files.
An application with local collisions exits 3; a real merge conflict exits 2.
Unrelated uncommitted work remains uncommitted. Existing staged work prevents
application. Pushes fetch `origin` and verify ancestry before pushing normally.
Before a push, source/runtime merges run the affected test files through
`bun bd -j1`; other merges run the source script tests and affected tests through
the installed fork. Test concurrency is bounded to two. A failed gate leaves the
merge local and does not push. Native builds use the repository lock and have no
timeout; the existing workflow's job deadline still applies.

The default source is `bun-upstream` beside the selected fork checkout. Pass
`checkout` to `prepareUpstreamSource`, or set `APHRODY_BUN_UPSTREAM_CHECKOUT`,
to select another source. Relative paths resolve from the selected fork root.
Both resolved paths must be separate; existing filesystem junctions are resolved.

The source must be a clean repository root on `main`, with its `origin` pointing
to `oven-sh/bun` on GitHub. HTTPS and GitHub SSH URLs are accepted. Local changes,
local commits ahead of upstream, and divergent histories are refused. A missing
source is cloned once; subsequent calls fetch and fast-forward that checkout.

```ts
import { prepareUpstreamSource } from "../../scripts/aphrody/sync-upstream-source.ts";

const source = await prepareUpstreamSource({
  root: selectedRoot,
  checkout: upstreamCheckout,
  remote: "upstream",
  dryRun: false,
});
```

Call this before the existing merge step when fetching is enabled. The fork's
configured remote must already exist. The helper imports the verified source
`main` into `refs/remotes/upstream/main` using a local Git fetch, checks the commit,
and preserves the fork remote's configured URL. It never force-updates a ref.

With `dryRun: true`, the helper only resolves paths and verifies an existing
source; it neither clones nor fetches nor updates refs. A missing source returns
`commit: null`. The caller can inspect its current fork reference for the merge
preview. `timeoutMs` bounds each asynchronous Git child process, including clone
and fetch; its default is ten minutes. Execution uses the installed native Git
through `Bun.spawn` and does not start WSL.

The existing scheduled workflow remains `.github/workflows/aphrody-upstream-sync.yml`.
It should call the main sync entrypoint; a second scheduler is unnecessary.
