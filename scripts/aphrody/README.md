# scripts/aphrody

Fork-only tooling for `aphrody-labs/bun`. Nothing here exists upstream, so
merging `oven-sh/bun` never conflicts with it.

## upstream-sync

`upstream-sync.ts` keeps the fork current with `oven-sh/bun`: it merges upstream
main, vets and merges open upstream PRs, and records issues and discussions in
two committed files. It runs on the build host (`fr1`) in its own scratch clone,
`~/ci/bun-upstream/clone`, never in a shared tree.

```sh
bun scripts/aphrody/upstream-sync.ts --dry-run --no-build   # enumeration only, nothing pushed
bun scripts/aphrody/upstream-sync.ts --max-prs 10           # a real run
bun scripts/aphrody/upstream-sync.ts install                # systemd timer
bun test ./scripts/aphrody/upstream-sync.test.ts            # pure-logic tests
```

| Flag                 | Meaning                                                                                                                                                   |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--max-prs N`        | PRs processed per run, in priority order (default 25). Every open PR still gets a ledger entry.                                                           |
| `--dry-run`          | No clone, no merge, no push. Pages every PR, issue and discussion and writes the ledger and discussions to `--out` (default: a new temp directory).       |
| `--no-build`         | Skips the cargo and `bun bd` gates. Candidates are only probed for conflicts and nothing is merged into main; only the ledger and discussions are pushed. |
| `--full-discussions` | Re-reads every discussion instead of stopping at the first one already mirrored.                                                                          |
| `--home DIR`         | Work directory (default `~/ci/bun-upstream`, or `$UPSTREAM_SYNC_HOME`).                                                                                   |

### One run

1. Lock `~/ci/bun-upstream/lock`; reset the scratch clone to `origin/main`.
2. Enumerate open PRs through GraphQL, 50 per page (title, draft, mergeable,
   head sha, review decision, labels, status check rollup of the head commit).
   Mergeable `UNKNOWN` is re-polled for green PRs. Changed paths are fetched
   only for candidates and cached in the ledger by head sha.
3. Merge upstream main: `Merge oven-sh/bun main (<sha>) into the fork`. A
   conflict aborts that merge, writes the report and exits 2 without pushing.
4. Process up to `--max-prs` candidates (non-draft, mergeable, head CI
   `SUCCESS`), approved first, then the labels `confirmed bug`, `regression`,
   `crash`, `performance`, `windows`, then the areas we use (image, cli,
   install, serve, shell, sqlite, bundler, windows; from labels and changed
   paths), then the rest. Each candidate is fetched (`pull/<n>/head`) and
   merged on top of main, then gated: no conflict; `cargo check -p <crates>`
   for the crates owning the changed `.rs` files; `bun bd test` on the PR's own
   changed `test/**/*.test.ts`. A failing PR is reset away and recorded.
5. Smoke suite once per batch: `bun bd test test/js/bun/shell
test/js/bun/spawn test/js/bun/http test/js/bun/sqlite test/js/bun/image
test/cli/run`. Red: the last kept PR is dropped (recorded `red`, result
   `smoke`) and the suite re-runs until green. Red with no PR left means the
   upstream merge itself is red: nothing is pushed, exit 3. No smoke run when
   nothing new would be pushed.
6. Issues, discussions, ledger (below). Commit
   `upstream-sync: ledger <date> (<counts>)`, merge whatever others pushed to
   `origin/main`, push once.

A recorded `conflict` or `red` (our gates) is retried only when the PR head sha
changed. Drafts, `waiting-ci`, `not-mergeable` and upstream-`red` PRs are
re-evaluated every run, so they are picked up when their state changes. A PR
carried in main stays `carried` while its head is unchanged; a new head is
merged again once it is a candidate.

### Exit codes

| Code | Meaning                                                          |
| ---- | ---------------------------------------------------------------- |
| 0    | done                                                             |
| 1    | failure (API, git, unexpected error)                             |
| 2    | upstream main conflicts with ours; merge aborted, nothing pushed |
| 3    | upstream merge red in the smoke suite, or the push failed        |
| 4    | another run holds the lock                                       |

### systemd

| Item      | Value                                                                                                                                                                                             |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Units     | `bun-upstream-sync.service` (oneshot) and `bun-upstream-sync.timer`                                                                                                                               |
| Schedule  | every 3 hours (`00/3:20 UTC`, 5 min random delay), `Persistent=true`                                                                                                                              |
| Source    | `scripts/aphrody/systemd/`                                                                                                                                                                        |
| Install   | `bun scripts/aphrody/upstream-sync.ts install`: creates the scratch clone, copies the units to `~/.config/systemd/user`, `daemon-reload`, `systemctl --user enable --now bun-upstream-sync.timer` |
| Journal   | `journalctl --user -u bun-upstream-sync`                                                                                                                                                          |
| Log files | `~/ci/bun-upstream/log/upstream-sync-<date>.log` (includes gate output)                                                                                                                           |
| Report    | `~/ci/bun-upstream/report-<YYYYMMDDTHHMMSSZ>.md`, one per run                                                                                                                                     |

The service runs the script from the scratch clone, which each run first resets
to `origin/main`, so a pushed change to the script is live on the next run.

## aphrody/upstream-ledger.json

One JSON object, one entry per line, generated by the script and committed with
each run. Top-level keys:

- `generatedAt`, `upstreamMainSha`, `ourMainSha` (our main as the ledger
  describes it, before the ledger commit)
- `counts`: `{ pr: {state: n}, issue: {state: n}, discussion: {state: n} }`
- `pr:<n>`, `issue:<n>`, `discussion:<n>`: entries

Entry fields: `number`, `kind`, `state`, `title`, `headSha` (PR head last tried
or seen), `result` (`ok`, `conflict`, `cargo-check`, `pr-tests`, `smoke`; absent
when never attempted), `reason`, `ourCommit` (our merge commit), `updatedAt`,
`attemptedAt`, `priority`, `areas`, `labels`, `fileCount`, `linkedPrs`.

PR states: `merged` (merged into main this run), `carried` (merged earlier,
still open upstream), `conflict`, `red` (upstream CI red, or one of our gates),
`waiting-ci` (pending or no checks), `draft`, `not-mergeable` (conflicts
upstream, wrong base, or mergeability not computed yet), `skipped-this-run`
(candidate beyond `--max-prs`, or probed with `--no-build`),
`upstream-merged` (a carried PR upstream merged; `ourCommit` is a duplicate
absorbed by the main merge), `upstream-closed` (closed unmerged; ours stays).

Issue states, for open issues labelled `confirmed bug`, `regression` or `crash`:
`unfixed` (no linked PR), `covered` (an open linked PR, handled as a PR, or a
merged closing PR carried by the main merge), `closed` (closed in the last
14 days by a linked PR; covered by the main merge).

Discussion states: `untracked`, `tracked`.

## aphrody/upstream-discussions.jsonl

One discussion per line, sorted by `number`, rewritten each run (incremental by
`updatedAt`). Schema version `v: 1`; a change of meaning bumps `v`.

| Field       | Type                                                                                                                                                                                    |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `v`         | `1`                                                                                                                                                                                     |
| `number`    | discussion number                                                                                                                                                                       |
| `title`     | string                                                                                                                                                                                  |
| `url`       | string                                                                                                                                                                                  |
| `category`  | category name (General, Q&A, Ideas, ...)                                                                                                                                                |
| `author`    | login or `null`                                                                                                                                                                         |
| `createdAt` | ISO timestamp                                                                                                                                                                           |
| `updatedAt` | ISO timestamp                                                                                                                                                                           |
| `body`      | markdown, capped at 60000 characters                                                                                                                                                    |
| `answer`    | `{ author, body }` or `null`                                                                                                                                                            |
| `linked`    | `{ issues: number[], pulls: number[], bare: number[] }`: numbers from `github.com/<upstream>/issues/N` and `/pull/N` URLs, and bare `#N` outside code fences, in title, body and answer |
| `untracked` | `true` when `reason` is set and `linked` is empty                                                                                                                                       |
| `reason`    | comma list of `patch`, `workaround`, `bug-report`; `null` otherwise                                                                                                                     |

`reason` heuristics (a heuristic, not a verdict): `patch` is a diff fence or
diff headers in the body or the answer, or a code fence next to wording such as
"proposed fix"; `workaround` is the word in the body or the answer;
`bug-report` is a General or Q&A discussion with fault wording (bug, crash,
panic, regression, ...) together with reproduction wording or a code fence.
Announcements and Polls are never flagged. A discussion that cites any issue or
PR number is `tracked`, whatever it contains.
