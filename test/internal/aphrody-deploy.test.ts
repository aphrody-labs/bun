// scripts/aphrody/deploy: the auto-deploy pipeline (queue on the build host, activate/clean on the prod host).
// Hermetic: temp dirs, local bare git repositories and a fake systemctl. Run with the installed bun (`bun test`):
// no native code is involved.
import { describe, expect, test } from "bun:test";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { bunEnv, isWindows, tempDir } from "harness";
import { activateRelease } from "../../scripts/aphrody/deploy/activate.ts";
import { protectedReason, runClean } from "../../scripts/aphrody/deploy/clean.ts";
import { applyPlan, planInstall } from "../../scripts/aphrody/deploy/install-host.ts";
import {
  EXIT,
  QueueState,
  computeReleaseId,
  decide,
  resolveAll,
  runQueue,
  selectReleasesToKeep,
  sha256File,
  validateApp,
  verifySums,
  writeSums,
  type App,
  type QueueDeps,
  type Resolved,
} from "../../scripts/aphrody/deploy/lib.ts";
import { sshArgs, substitute } from "../../scripts/aphrody/deploy/queue.ts";

async function git(cwd: string, ...args: string[]) {
  await using p = Bun.spawn({
    cmd: ["git", "-c", "user.name=t", "-c", "user.email=t@t", ...args],
    cwd,
    env: bunEnv,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([p.stdout.text(), p.stderr.text(), p.exited]);
  if (code !== 0) throw new Error(`git ${args.join(" ")}: ${err}`);
  return out.trim();
}

async function bareRepo(dir: string, name: string) {
  const bare = join(dir, `${name}.git`);
  const work = join(dir, `${name}-work`);
  mkdirSync(work, { recursive: true });
  await git(work, "init", "-q", "-b", "main");
  await git(dir, "init", "-q", "--bare", "-b", "main", bare);
  await git(work, "remote", "add", "origin", bare);
  const push = async (text: string) => {
    writeFileSync(join(work, "f.txt"), text);
    await git(work, "add", "f.txt");
    await git(work, "commit", "-q", "-m", text);
    await git(work, "push", "-q", "origin", "main");
    return git(work, "rev-parse", "HEAD");
  };
  return { url: bare, push };
}

describe("release id and queue decisions", () => {
  test("computeReleaseId joins sha7 and release tags in source order", () => {
    expect(
      computeReleaseId([
        { name: "shenron", sha: "a".repeat(40) },
        { name: "aphrody", sha: "b1c2d3e4f5" + "0".repeat(30) },
        { name: "bun", tag: "aphrody-v1.4.3+x" },
      ]),
    ).toBe("aaaaaaa-b1c2d3e-aphrody-v1.4.3_x");
  });

  test("resolveAll reads heads with git ls-remote on local bare repos, releases through the injected API", async () => {
    using dir = tempDir("deploy-resolve", {});
    const a = await bareRepo(String(dir), "a");
    const b = await bareRepo(String(dir), "b");
    const shaA = await a.push("one");
    const shaB = await b.push("one");
    const app = validateApp({
      name: "x",
      sources: [
        { name: "a", repo: "o/a", url: a.url },
        { name: "b", repo: "o/b", url: b.url },
        { name: "bun", repo: "o/bun", kind: "release" },
      ],
      build: { cwd: ".", cmd: ["true"], artifact: "x" },
      host: "h",
      remote: { root: "/home/ubuntu/apps/x", unit: "x", health: "http://127.0.0.1/h" },
    });
    const releases = async () => [
      { tag_name: "draft-1", draft: true },
      { tag_name: "other-v1" },
      { tag_name: "aphrody-v9" },
      { tag_name: "aphrody-v8" },
    ];
    const r = await resolveAll(app, { releases });
    expect(r.id).toBe(`${shaA.slice(0, 7)}-${shaB.slice(0, 7)}-aphrody-v9`);
    const shaA2 = await a.push("two");
    expect((await resolveAll(app, { releases })).id).toBe(`${shaA2.slice(0, 7)}-${shaB.slice(0, 7)}-aphrody-v9`);
  });

  test("decide skips the deployed id and known-bad ids", () => {
    using dir = tempDir("deploy-decide", {});
    const state = new QueueState(String(dir));
    expect(decide("a", "a", state)).toEqual({ action: "noop", reason: "deployed", id: "a" });
    expect(decide("b", "a", state)).toEqual({ action: "build", id: "b" });
    state.markBad("b", "boom");
    expect(decide("b", "a", state)).toEqual({ action: "noop", reason: "known-bad", id: "b" });
    expect(state.badIds()).toEqual(["b"]);
  });

  function fakeDeps(heads: string[], deployed: { id: string | null }, calls: string[]): QueueDeps {
    let n = 0;
    const next = (): Resolved => ({ id: heads[Math.min(n++, heads.length - 1)], sources: [] });
    return {
      resolve: async () => next(),
      deployedId: async () => deployed.id,
      build: async r => (calls.push(`build ${r.id}`), "/dir"),
      transfer: async r => void calls.push(`transfer ${r.id}`),
      activate: async r => ((deployed.id = r.id), calls.push(`activate ${r.id}`), { ok: true }),
      log: () => {},
    };
  }

  test("coalescence: a head that moved during the build replaces the stale one, intermediates are never deployed", async () => {
    using dir = tempDir("deploy-coalesce", {});
    const state = new QueueState(String(dir));
    const calls: string[] = [];
    // resolve #1 = v1, #2 (after the first build) = v2, then v2 keeps being the head
    const code = await runQueue(state, fakeDeps(["v1", "v2", "v2", "v2"], { id: "v0" }, calls));
    expect(code).toBe(EXIT.ok);
    expect(calls).toEqual(["build v1", "build v2", "transfer v2", "activate v2"]);
    expect(state.readPending()?.id).toBe("v2");
  });

  test("idempotent: nothing new means no build, a failed build is remembered as bad", async () => {
    using dir = tempDir("deploy-idem", {});
    const state = new QueueState(String(dir));
    const calls: string[] = [];
    expect(await runQueue(state, fakeDeps(["v1"], { id: "v1" }, calls))).toBe(EXIT.ok);
    expect(calls).toEqual([]);
    const failing = fakeDeps(["v2"], { id: "v1" }, calls);
    failing.build = async () => {
      throw new Error("compile error");
    };
    expect(await runQueue(state, failing)).toBe(EXIT.build);
    expect(state.isBad("v2")).toBe(true);
    expect(await runQueue(state, fakeDeps(["v2"], { id: "v1" }, calls))).toBe(EXIT.ok);
    expect(calls).toEqual([]);
  });

  test("failed activation marks the id bad and returns the activation exit code; dry run builds nothing", async () => {
    using dir = tempDir("deploy-act", {});
    const state = new QueueState(String(dir));
    const calls: string[] = [];
    const deps = fakeDeps(["v3"], { id: "v1" }, calls);
    deps.activate = async () => ({ ok: false, detail: "unhealthy, rolled back" });
    expect(await runQueue(state, deps)).toBe(EXIT.activate);
    expect(state.isBad("v3")).toBe(true);
    const dry = fakeDeps(["v4"], { id: "v1" }, ((calls.length = 0), calls));
    expect(await runQueue(state, dry, { dryRun: true })).toBe(EXIT.ok);
    expect(calls).toEqual([]);
  });

  test("ssh arguments carry no secret and the build variables are substituted", () => {
    const app = { host: "dbfr", ssh: { target: "dbfr-wg", identity: "/k/id", port: 2222 } } as App;
    expect(sshArgs(app)).toEqual([
      "ssh",
      "-o",
      "BatchMode=yes",
      "-o",
      "ConnectTimeout=15",
      "-i",
      "/k/id",
      "-o",
      "IdentitiesOnly=yes",
      "-p",
      "2222",
      "dbfr-wg",
    ]);
    expect(substitute("{src.shenron}/dist/{id}/{unknown}", { "src.shenron": "/w/s", id: "a-b" })).toBe(
      "/w/s/dist/a-b/{unknown}",
    );
  });
});

describe("artifacts", () => {
  test("SHA256SUMS round-trips and detects corruption, missing files and path escapes", () => {
    using dir = tempDir("deploy-sums", { "bin": "binary", "release.json": "{}" });
    const d = String(dir);
    expect(writeSums(d)).toEqual(["bin", "release.json"]);
    expect(readFileSync(join(d, "SHA256SUMS"), "utf8")).toContain(`${sha256File(join(d, "bin"))}  bin`);
    expect(verifySums(d)).toEqual([]);
    writeFileSync(join(d, "bin"), "tampered");
    expect(verifySums(d)).toEqual(["bin"]);
    writeFileSync(join(d, "SHA256SUMS"), `${"0".repeat(64)}  ../etc/passwd\n`);
    expect(verifySums(d)).toHaveLength(1);
    expect(verifySums(join(d, "nope"))).toEqual(["SHA256SUMS"]);
  });

  test("selectReleasesToKeep always keeps the pinned releases", () => {
    const rel = [
      { name: "a", mtimeMs: 1 },
      { name: "b", mtimeMs: 2 },
      { name: "c", mtimeMs: 3 },
    ];
    expect(selectReleasesToKeep(rel, ["a", "c"], 0)).toEqual({ keep: ["a", "c"], remove: ["b"] });
    expect(selectReleasesToKeep(rel, [], 2)).toEqual({ keep: ["b", "c"], remove: ["a"] });
    expect(selectReleasesToKeep(rel, ["a"], 2)).toEqual({ keep: ["a", "c"], remove: ["b"] });
    expect(selectReleasesToKeep(rel, [null, undefined], 0).remove).toEqual(["a", "b", "c"]);
  });
});

describe.skipIf(isWindows)("activate with a fake systemctl", () => {
  async function setup(dir: string) {
    const root = join(dir, "app");
    for (const id of ["old", "new"]) {
      const rd = join(root, "releases", id);
      mkdirSync(rd, { recursive: true });
      writeFileSync(join(rd, "server"), `bin-${id}`);
      writeFileSync(join(rd, "release.json"), JSON.stringify({ id }));
      writeSums(rd);
    }
    symlinkSync(join(root, "releases/old"), join(root, "current"), "dir");
    const log = join(dir, "systemctl.log");
    const fake = join(dir, "fake-systemctl.ts");
    writeFileSync(
      fake,
      `import { appendFileSync } from "node:fs";\nappendFileSync(${JSON.stringify(log)}, process.argv.slice(2).join(" ") + "\\n");\nif (process.argv[2] === "is-active") console.log("active");\n`,
    );
    return { root, log, systemctl: [process.execPath, fake] };
  }
  const healthy = (root: string) => async () =>
    existsSync(join(readlinkSync(join(root, "current")), "broken")) ? 503 : 200;

  test("success swaps current without a previous link, restarts once and runs clean", async () => {
    using dir = tempDir("deploy-activate-ok", {});
    const s = await setup(String(dir));
    let cleaned = 0;
    const events: string[] = [];
    const r = await activateRelease({
      releaseDir: join(s.root, "releases/new"),
      root: s.root,
      unit: "shenron",
      health: "http://x/healthz",
      systemctl: s.systemctl,
      fetchHealth: healthy(s.root),
      free: () => 100 * 1024 ** 3,
      coordLog: join(String(dir), "coord.log"),
      clean: async () => void cleaned++,
      pollMs: 5,
      log: e => events.push(e),
    });
    expect(r.ok).toBe(true);
    expect(readlinkSync(join(s.root, "current"))).toEndWith("new");
    expect(existsSync(join(s.root, "previous"))).toBe(false);
    expect(
      readFileSync(s.log, "utf8")
        .split("\n")
        .filter(l => l.startsWith("restart")),
    ).toEqual(["restart shenron"]);
    expect(JSON.parse(readFileSync(join(s.root, "current/release.json"), "utf8")).id).toBe("new");
    expect(readFileSync(join(String(dir), "coord.log"), "utf8")).toContain("activation shenron new");
    expect(cleaned).toBe(1);
  });

  test("unhealthy release is rolled back and marked bad", async () => {
    using dir = tempDir("deploy-activate-bad", {});
    const s = await setup(String(dir));
    writeFileSync(join(s.root, "releases/new/broken"), "");
    writeSums(join(s.root, "releases/new"));
    const events: string[] = [];
    const r = await activateRelease({
      releaseDir: join(s.root, "releases/new"),
      root: s.root,
      unit: "shenron",
      health: "http://x/healthz",
      systemctl: s.systemctl,
      fetchHealth: healthy(s.root),
      free: () => 100 * 1024 ** 3,
      timeoutMs: 200,
      pollMs: 5,
      log: e => events.push(e),
    });
    expect(r).toMatchObject({ ok: false, rolledBack: true, code: EXIT.activate });
    expect(readlinkSync(join(s.root, "current"))).toEndWith("old");
    expect(existsSync(join(s.root, "releases/new/bad"))).toBe(true);
    expect(
      readFileSync(s.log, "utf8")
        .split("\n")
        .filter(l => l.startsWith("restart")),
    ).toHaveLength(2);
    expect(events).toContain("rolled-back");
  });

  test("a docker:<container> unit restarts the container of the host compose project", async () => {
    using dir = tempDir("deploy-activate-docker", {});
    const s = await setup(String(dir));
    const fake = join(String(dir), "fake-docker.ts");
    writeFileSync(
      fake,
      `import { appendFileSync } from "node:fs";\nappendFileSync(${JSON.stringify(s.log)}, "docker " + process.argv.slice(2).join(" ") + "\\n");\nif (process.argv[2] === "inspect") console.log("true");\n`,
    );
    const r = await activateRelease({
      releaseDir: join(s.root, "releases/new"),
      root: s.root,
      unit: "docker:aphrody-bun-prod-1",
      health: "http://x/healthz",
      systemctl: s.systemctl,
      docker: [process.execPath, fake],
      fetchHealth: healthy(s.root),
      free: () => 100 * 1024 ** 3,
      coordLog: null,
      pollMs: 5,
      log: () => {},
    });
    expect(r.ok).toBe(true);
    expect(readlinkSync(join(s.root, "current"))).toEndWith("new");
    expect(readFileSync(s.log, "utf8").trim().split("\n")).toEqual([
      "docker restart aphrody-bun-prod-1",
      "docker inspect -f {{.State.Running}} aphrody-bun-prod-1",
    ]);
  });

  test("refuses a corrupted release and a nearly full disk without touching current", async () => {
    using dir = tempDir("deploy-activate-refuse", {});
    const s = await setup(String(dir));
    const base = {
      root: s.root,
      unit: "shenron",
      health: "h",
      systemctl: s.systemctl,
      log: () => {},
      free: () => 100 * 1024 ** 3,
    };
    writeFileSync(join(s.root, "releases/new/server"), "corrupt");
    expect((await activateRelease({ ...base, releaseDir: join(s.root, "releases/new") })).ok).toBe(false);
    writeSums(join(s.root, "releases/new"));
    const full = await activateRelease({ ...base, releaseDir: join(s.root, "releases/new"), free: () => 1024 ** 3 });
    expect(full.ok).toBe(false);
    expect(full.detail).toContain("free space");
    expect(readlinkSync(join(s.root, "current"))).toEndWith("old");
    expect(existsSync(s.log)).toBe(false);
    expect(lstatSync(join(s.root, "current")).isSymbolicLink()).toBe(true);
  });
});

describe("clean", () => {
  test("protectedReason blocks volumes, postgres, checkouts, archives, app data and tmux", () => {
    const home = "/home/ubuntu";
    for (const p of [
      "/var/lib/docker/volumes/x/_data",
      "/var/lib/postgresql/16",
      "/home/ubuntu/apps/shenron/data/pg_postgres_data/x",
      "/home/ubuntu/src/aphrody",
      "/home/ubuntu/src/shenron",
      "/home/ubuntu/src/bun/target",
      "/home/ubuntu/archive/dbfr",
      "/home/ubuntu/apps",
      "/home/ubuntu/apps/aphrody-bun",
      "/home/ubuntu/apps/shenron/data/redis",
      "/home/ubuntu/apps/shenron/shared/uploads",
      "/tmp/tmux-1000/default",
      "/",
      "/home/ubuntu",
    ]) {
      expect(protectedReason(p, home)).not.toBeNull();
    }
    expect(protectedReason("/home/ubuntu/apps/aphrody-bun/releases/old", home)).toBeNull();
    expect(protectedReason("/home/ubuntu/.bun/install/cache", home)).toBeNull();
  });

  function layout(dir: string) {
    const root = join(dir, "apps/app");
    for (const id of ["a", "b", "c"]) {
      mkdirSync(join(root, "releases", id), { recursive: true });
      writeFileSync(join(root, "releases", id, "server"), id.repeat(100));
    }
    mkdirSync(join(root, "releases", "d.partial"), { recursive: true });
    const old = new Date(Date.now() - 3 * 86_400_000);
    utimesSync(join(root, "releases", "d.partial"), old, old);
    if (!isWindows) {
      symlinkSync(join(root, "releases/c"), join(root, "current"), "dir");
      symlinkSync(join(root, "releases/b"), join(root, "previous"), "dir");
    }
    const home = join(dir, "home");
    mkdirSync(join(home, ".bun/install/cache"), { recursive: true });
    writeFileSync(join(home, ".bun/install/cache/pkg"), "x".repeat(1000));
    mkdirSync(join(home, "src/aphrody"), { recursive: true });
    writeFileSync(join(home, "src/aphrody/keep"), "k");
    const tmp = join(dir, "tmp");
    mkdirSync(join(tmp, "tmux-1000"), { recursive: true });
    mkdirSync(join(tmp, "old-build"), { recursive: true });
    mkdirSync(join(tmp, "fresh"), { recursive: true });
    utimesSync(join(tmp, "old-build"), old, old);
    utimesSync(join(tmp, "tmux-1000"), old, old);
    return { root, home, tmp };
  }
  const exec = (calls: string[][]) => async (cmd: string[]) => (calls.push(cmd), { code: 0, stdout: "", stderr: "" });

  test.skipIf(isWindows)(
    "prod keeps only current, drops previous, prunes caches, never touches protected paths",
    async () => {
      using dir = tempDir("deploy-clean", {});
      const { root, home, tmp } = layout(String(dir));
      const calls: string[][] = [];
      const report = await runClean({
        role: "prod",
        home,
        root,
        tmpDir: tmp,
        dryRun: false,
        exec: exec(calls),
        free: () => 50 * 1024 ** 3,
      });
      expect(report.ok).toBe(true);
      expect(existsSync(join(root, "releases/a"))).toBe(false);
      expect(existsSync(join(root, "releases/b"))).toBe(false);
      expect(existsSync(join(root, "previous"))).toBe(false);
      expect(existsSync(join(root, "releases/c"))).toBe(true);
      expect(existsSync(join(root, "releases/d.partial"))).toBe(false);
      expect(existsSync(join(home, ".bun/install/cache"))).toBe(false);
      expect(existsSync(join(home, "src/aphrody/keep"))).toBe(true);
      expect(existsSync(join(tmp, "tmux-1000"))).toBe(true);
      expect(existsSync(join(tmp, "old-build"))).toBe(false);
      expect(existsSync(join(tmp, "fresh"))).toBe(true);
      const cmds = calls.map(c => c.join(" "));
      expect(cmds).toContain("docker image prune -f");
      expect(cmds).toContain("docker builder prune -f");
      expect(cmds).toContain("journalctl --vacuum-size=200M");
      expect(cmds.some(c => c.includes("volume"))).toBe(false);
      expect(report.removed.map(r => r.path.replaceAll("\\", "/")).some(p => p.includes("/src/"))).toBe(false);
    },
  );

  test.skipIf(isWindows)(
    "dry run lists without removing; low disk goes aggressive and exits non-ok when still short",
    async () => {
      using dir = tempDir("deploy-clean-dry", {});
      const { root, home, tmp } = layout(String(dir));
      const dry = await runClean({
        role: "prod",
        home,
        root,
        tmpDir: tmp,
        dryRun: true,
        exec: exec([]),
        free: () => 50 * 1024 ** 3,
      });
      expect(dry.removed.map(r => r.path)).toContain(join(root, "releases/a"));
      expect(existsSync(join(root, "releases/a"))).toBe(true);
      expect(dry.freedBytes).toBeGreaterThan(0);
      const calls: string[][] = [];
      const low = await runClean({
        role: "prod",
        home,
        root,
        tmpDir: tmp,
        dryRun: false,
        exec: exec(calls),
        free: () => 1024 ** 3,
      });
      expect(low.aggressive).toBe(true);
      expect(low.ok).toBe(false);
      expect(calls.map(c => c.join(" "))).toContain("docker builder prune -af");
    },
  );

  test("planInstall stages scripts and units idempotently", () => {
    using dir = tempDir("deploy-install", {});
    const prefix = String(dir);
    const plan = planInstall({ role: "prod", home: "/home/ubuntu", root: "/home/ubuntu/apps/shenron-app", prefix });
    expect(applyPlan(plan)).toHaveLength(plan.length);
    expect(applyPlan(plan)).toEqual([]);
    const unit = readFileSync(join(prefix, "/etc/systemd/system/aphrody-deploy-clean.service"), "utf8");
    expect(unit).toContain(
      "ExecStart=/home/ubuntu/.local/bin/bun /usr/local/lib/aphrody-deploy/clean.ts --host-role prod --root /home/ubuntu/apps/shenron-app",
    );
    expect(() => planInstall({ role: "prod", home: "/h" })).toThrow("--root");
    const build = planInstall({ role: "build", home: "/home/ubuntu", prefix });
    expect(build.map(i => i.dest.replaceAll("\\", "/").replace(prefix.replaceAll("\\", "/"), ""))).toContain(
      "/home/ubuntu/.local/bin/aphrody-deploy",
    );
    expect(build.find(i => i.dest.endsWith("aphrody-deploy"))!.content).not.toMatch(/ghp_|token=/);
  });
});
