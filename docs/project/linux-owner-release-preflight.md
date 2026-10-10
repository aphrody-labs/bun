# Isolated Linux release qualification — 2026-10-10

The native Infra SSH endpoint selects the VPS development/build target. Its
installed sync plan succeeds, but the current sync implementation emits policy
without transferring sources for vps; no sync apply or deployment is claimed.

After an explicit plan and capacity check, a new detached worktree was created
from the existing authorized origin at published commit
4e3ddd04da10d7db3e8a903ec8d352898094fd58. Existing worktrees were preserved.
Serialized Cargo metadata --locked --no-deps and bun install --frozen-lockfile
pass. Toolchain: Rust nightly-2026-09-15 (1.100.0), clang 21.1.8.

The measured existing debug build is 18.72 GB, larger than available space;
qualification uses the owner's release build-and-exec workflow. The runner
holds the heavy factory lock, uses four jobs and tmux with PID, phase, log and
terminal-exit receipts. The first attempt failed on a WebKit cache owned by
another profile with mode 700. The retry uses cacheDir/BUN_BUILD_CACHE_DIR under
the isolated checkout, retaining the same WebKit pin and shared Rust sccache.
Existing cache permissions and failed receipts are preserved.

The release build completed. Its first six-suite run had 200 passes and two
failures: child scripts incorrectly used require("bun:linux").default even
though CommonJS returns the module directly. Only those two projections were
corrected. No native source, assertion or skip was changed for the rerun.

## Changed-engine qualification

```
bun run build:release --cacheDir=<isolated-cache> -j4 test test/js/bun/linux/linux.test.ts test/js/bun/util/zstd.test.ts test/js/node/process/process-args.test.js test/js/node/watch/fs.watch.rewrite.test.ts test/js/node/cluster.test.ts test/cli/agent-plugin/agent-plugin.test.ts
```

Result: 202 pass, 13 existing skips, 0 fail, 2 snapshots, 1517 assertions.
Seccomp denial and subreaper orphan collection execute successfully. Root
namespace/cgroup/sysctl and BPF capability-dependent skips do not qualify those
privileged paths. Scoped TypeScript, oxlint, oxfmt and diff checks pass locally
for the corrected test. The initial run proves the corrected scripts failed
before the change; the same built release passes after the change.

The factory build-and-exec provenance probe returns Bun.version 1.4.4 and
Bun.revision 4e3ddd04da10d7db3e8a903ec8d352898094fd58. The executable is
build/release/bun-profile (314397832 bytes), SHA-256
21024f109079656591908dce0140d1870de3f967b61fc05c53e0dba8ccccfb96.
It is a qualified candidate at that pin; this is not proof of complete fork
plans, all release gates, distribution, installed runtime or DBFR activation.

Local plans: tmp/vps-owner-release-plan.json and tmp/linux-test-retry-plan.json.
Remote receipts:
/home/ubuntu/builds/bun-owner-linux-4e3ddd04da1/tmp/owner-linux-qualification.
runner-test-retry.exit and native-test-retry.exit are 0; provenance-test-retry
records version/revision/executable and exits 0. native-owned-cache.log retains
the initial two-test failure; native.log retains the earlier cache failure.

## DBFR isolated candidate delivery

After an explicit plan, the native Infra in-process SFTP command downloaded the
qualified candidate to the owner workstation and uploaded it into a new,
private directory on DBFR:

/home/ubuntu/.local/share/aphrody/runtime-candidates/bun-1.4.4-4e3ddd04d/bun

Source, local download and remote upload agree on the 314397832-byte artifact's
SHA-256 recorded above. Executable mode was applied only after remote checksum
verification. DBFR x64 (kernel 7.0.0-38-generic) successfully executes the
candidate, returns Bun.version 1.4.4 and the exact source revision, imports
bun:linux, round-trips Zstd, and writes/reads/closes a memfd. The manifest beside
the candidate records pin, checksum, test patch commit, suite evidence and
remaining qualification. No Cargo or native build ran on DBFR.

The factory's plain release output is bun-profile; this isolated candidate is
not the stripped distribution artifact. No claim is made about all DBFR
consumers, GPU hardware, production services or complete release publication.
The current PATH runtime remains /home/ubuntu/.local/bin/bun at
1.4.3-aphrody.3+d46f0ed6c. Services were not restarted.

Plan: tmp/runtime-candidate-dbfr-plan.json. Receipts:
tmp/runtime-candidate-download.log/.exit,
tmp/runtime-candidate-upload.log/.exit,
tmp/runtime-candidate-dbfr-smoke.log/.exit,
tmp/runtime-candidate-manifest-upload.log/.exit; all exit 0.
The latest published GitHub runtime release observed in this audit remains
aphrody-v1.4.3-aphrody.4. Its older release workflow 37859117880 had successful
build/smoke/release jobs but a failed npm job; this does not qualify the new pin.
Full release gates, stripped artifacts/images and production consumer activation
remain required before the owner's global release/deploy objective is complete.

## Stripped distribution candidate

The same owner release factory also emitted build/release/bun, its stripped
artifact: 138871072 bytes, SHA-256
85c8f00b5d4a2f6519850df72aec6f893358894d20663e667a46487bf273ee87.
An exact installed copy under the isolated VPS receipts directory ran all six
suites again: 202 pass, 13 existing skips, 0 fail, 2 snapshots, 1517 assertions.
Its provenance probe confirms version 1.4.4 and revision
4e3ddd04da10d7db3e8a903ec8d352898094fd58. This independently verifies the stripped
candidate rather than relying solely on the earlier unstripped run.

Native Infra SFTP delivered the checksum-verified artifact and manifest into:
/home/ubuntu/.local/share/aphrody/runtime-candidates/bun-1.4.4-4e3ddd04d-stripped/bun

DBFR verified the same checksum before executable mode was applied, then
successfully executed the candidate, imported bun:linux, round-tripped Zstd,
and wrote/read/closed a memfd. The active PATH runtime remains
1.4.3-aphrody.3+d46f0ed6c; no production service restart or activation is claimed.
The stripped candidate is 175526760 bytes smaller than the unstripped candidate;
that file-size difference does not establish runtime performance or memory gains.

Plan: tmp/stripped-candidate-plan.json. Remote runner-stripped/native-stripped/
provenance-stripped exit receipts are 0. Local stripped-candidate download,
upload, dbfr-smoke and manifest-upload log/exit receipts are all 0. Full release
publication, matching platform artifacts/images and consumer activation still
require their own gates. The newer Windows-only source batches have not changed
the recorded Linux candidate revision; this proof remains pinned to that exact
artifact and its two-line qualification test correction.

## Refreshed candidate delivery (2026-10-10)

The owner VPS release at 988d73b430a3c47cd61d6f8d440777407f77555c produces a
138871072-byte stripped executable, SHA256
8bb9105153ce3742d14f9c04247782c5013d050813b00eae880d041ae9ceb8e3.
Independent execution of that stripped artifact passes the established six
suites: 202 pass, 13 existing skips, zero failures, two snapshots and 1517
assertions. The full profile-artifact gate additionally passes 1122 tests;
these scopes are recorded separately rather than inferred from each other.

After the explicit transfer plan, native Infra SFTP downloads the executable
from VPS, verifies its local checksum, and uploads it to the isolated DBFR
candidate directory:
/home/ubuntu/.local/share/aphrody/runtime-candidates/bun-1.4.4-988d73b430a-stripped

DBFR checks the exact checksum before executable permissions are applied.
The candidate then reports version 1.4.4 and the expected full revision,
round-trips Zstd bytes, and writes, reads and closes a memfd. The probe exits
zero. Its plan, manifest, probe and smoke receipts remain with the candidate;
local receipts are tmp/dbfr-988-runtime-candidate-plan.json and
tmp/dbfr-988-runtime-smoke.log/.exit. No sources or native builds are sent
to DBFR. PATH remains Bun 1.4.3-aphrody.3 and no services are restarted.

This is verified candidate delivery, not production activation or complete
multi-platform publication. The current installed Infra deploy CLI offers
application-stack adapters, not a standalone Bun promotion adapter; its
catalog contract must cover runtime promotion before that activation.
