# Isolated Linux release preflight — 2026-10-10

The native Infra SSH endpoint selects the VPS development/build target. Its
installed sync plan succeeds, but the current sync implementation emits policy
without transferring sources for vps; no sync apply or deployment is claimed.

After an explicit plan and capacity check, a new detached worktree was created
from the existing authorized origin at published commit
4e3ddd04da10d7db3e8a903ec8d352898094fd58. Existing worktrees were preserved.
The selected checkout passes serialized Cargo metadata --locked --no-deps and
bun install --frozen-lockfile. Its Rust toolchain is nightly-2026-09-15 (1.100.0)
and the installed compiler is clang 21.1.8.

The measured existing debug build is 18.72 GB, larger than available space;
qualification therefore uses the owner's release build-and-exec workflow.
The build/test runner holds the existing heavy factory lock and limits jobs to
four. It runs from tmux with PID, phase, log and terminal-exit receipts.

The first attempt terminated because the global pinned WebKit cache directory
is owned by another host profile with mode 700. The retry uses the supported
cacheDir/BUN_BUILD_CACHE_DIR setting under the isolated checkout, retaining the
same WebKit pin and shared Rust sccache configuration. Existing cache permissions
were preserved. The first failure receipts are retained alongside the retry.

The retry was verified live as process 1005949 in tmux session
bun-owner-linux-4e3ddd04da1. Build completion, native Linux tests, artifact
provenance, distribution and DBFR activation remain unproven at this preflight.

Local plan: tmp/vps-owner-release-plan.json. Remote checkout and receipts:
/home/ubuntu/builds/bun-owner-linux-4e3ddd04da1/tmp/owner-linux-qualification.
The native-owned-cache log and exit files identify the current attempt;
runner.exit/native.exit refer to the terminated first attempt.
