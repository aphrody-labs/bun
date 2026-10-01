// Bun.spawnSync lazily creates an isolated uSockets event loop per VM
// (epoll_create1/kqueue on POSIX, uv_loop_new on Windows). When that syscall
// fails under resource exhaustion, us_create_loop used to dereference the
// NULL/invalid result and crash the whole process. The one spawnSync call must
// throw a catchable error instead, and once resources are freed a retry must
// work.
//
// The Windows variant (uv_loop_new -> CreateIoCompletionPort failing under
// handle/non-paged-pool exhaustion) routes through the same NULL propagation
// in us_create_loop / WindowsLoop::create / SpawnSyncEventLoop::init; this
// test exercises the POSIX half where the failure is reproducible with a file
// descriptor limit.
import { socketFaultInjection as fault } from "bun:internal-for-testing";
import { describe, expect, test } from "bun:test";
import { bunEnv, bunExe, isLinux, isPosix } from "harness";

// Absolute argv[0] so PATH lookup (which_for_spawn) is skipped; on musl that
// lookup fails under EMFILE before the event loop is created and turns the
// failure into ENOENT instead of exercising us_create_loop.
const fixture = /* js */ `
  import * as fs from "node:fs";
  // Warm anything lazily opened on first use so the fd fill below leaves zero
  // descriptors for us_create_loop itself (not for a module loader read).
  process.nextTick(() => {});

  const held = [];
  for (;;) { try { held.push(fs.openSync("/dev/null", "r")); } catch { break; } }

  let first;
  try {
    Bun.spawnSync({ cmd: ["/bin/sh", "-c", ":"], stdio: ["ignore", "ignore", "ignore"] });
    first = { ok: false, msg: "UNEXPECTED: spawnSync succeeded" };
  } catch (e) {
    first = { ok: true, code: e?.code, msg: String(e?.message ?? e) };
  }

  for (const fd of held) fs.closeSync(fd);

  if (!first.ok) { console.error(first.msg); process.exit(1); }
  console.error("spawnSync threw:", first.code, first.msg);

  // Descriptors are free again: the isolated loop was not cached on failure,
  // so this call creates it successfully and runs the child.
  const retry = Bun.spawnSync({ cmd: ["/bin/sh", "-c", ":"], stdio: ["ignore", "ignore", "ignore"] });
  console.error("retry exit:", retry.exitCode);
  console.error("SURVIVED");
`;

describe.skipIf(!isPosix)("Bun.spawnSync event-loop creation under EMFILE", () => {
  test("throws instead of aborting the process", async () => {
    await using proc = Bun.spawn({
      cmd: ["/bin/sh", "-c", `ulimit -n 512 && exec "$1" --no-install -e "$2"`, "sh", bunExe(), fixture],
      env: bunEnv,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
    expect(stdout).toBe("");
    expect(stderr).toContain("spawnSync threw: EMFILE");
    expect(stderr).toContain("retry exit: 0");
    expect(stderr).toContain("SURVIVED");
    expect(exitCode).toBe(0);
  });
});

// The loop also needs its wakeup eventfd in the epoll set. epoll_ctl refuses
// that with ENOSPC at fs.epoll.max_user_watches, or with ENOMEM. A loop that
// is handed out anyway can never be woken by another thread, so this failure
// has to reach the caller like the two above: one thrown error that names the
// call, nothing left open, and a later call that works. epoll only: it is the
// one backend whose wakeup registration goes through the poll_start hook.
const refusedRegistrationFixture = /* js */ `
  const { socketFaultInjection: fault } = require("bun:internal-for-testing");
  const fs = require("node:fs");
  const openFds = () => fs.readdirSync("/proc/self/fd").length;
  const run = () => Bun.spawnSync({ cmd: ["/bin/sh", "-c", ":"], stdio: ["ignore", "ignore", "ignore"] });
  const refused = () => {
    fault.set({ syscall: "poll_start", action: "errno", errno: 28 /* ENOSPC */, repeat: 1 });
    try {
      run();
      return "returned";
    } catch (e) {
      return e.code + " " + e.errno + " " + e.syscall;
    } finally {
      fault.clear();
    }
  };
  const first = refused();
  const afterFirst = openFds();
  const second = refused();
  const leaked = openFds() - afterFirst;
  console.log(JSON.stringify({ first, second, leaked, retry: run().exitCode }));
`;

test.skipIf(!fault.available() || !isLinux)(
  "Bun.spawnSync throws when the wakeup of its event loop cannot be registered",
  async () => {
    await using proc = Bun.spawn({
      cmd: [bunExe(), "-e", refusedRegistrationFixture],
      env: bunEnv,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
    const line = stdout.trim().split("\n").pop() ?? "";
    expect({ stderr, line }).toEqual({ stderr: expect.any(String), line: expect.stringContaining("{") });
    expect(JSON.parse(line)).toEqual({
      first: "ENOSPC -28 epoll_ctl",
      second: "ENOSPC -28 epoll_ctl",
      leaked: 0,
      retry: 0,
    });
    expect(exitCode).toBe(0);
  },
);
