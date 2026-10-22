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
import { bunEnv, bunExe, isWindows, tempDir } from "harness";
import { activateRelease } from "../../scripts/aphrody/deploy/activate.ts";
import {
  adaptHtml,
  buildMirror,
  externalizeInlineScripts,
  localReferences,
  mirrorCommand,
  rewriteCapturedLinks,
  rewritePagefindLoader,
} from "../../scripts/aphrody/site-mirror/mirror.ts";
import { graphView } from "../../scripts/aphrody/site-mirror/graph-view.ts";
import { aliasRequests } from "../../scripts/aphrody/site-mirror/repair-redirects.ts";
import { capturePath, retryDelay } from "../../scripts/aphrody/site-mirror/complete-reference.ts";
import { protectedReason, runClean } from "../../scripts/aphrody/deploy/clean.ts";
import { applyPlan, planInstall } from "../../scripts/aphrody/deploy/install-host.ts";
import {
  EXIT,
  QueueState,
  computeReleaseId,
  decide,
  resolveAll,
  run,
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
  test("native command runner drains both pipes and preserves stdin, environment and exit", async () => {
    const result = await run(
      [
        bunExe(),
        "-e",
        `
      console.log(await Bun.stdin.text());
      console.error(process.env.APHRODY_DEPLOY_FIXTURE);
      process.exit(7);
    `,
      ],
      { input: "payload", env: { ...bunEnv, APHRODY_DEPLOY_FIXTURE: "fixture" } },
    );
    expect(result.stdout.trim()).toBe("payload");
    expect(result.stderr.trim()).toBe("fixture");
    expect(result.code).toBe(7);
  });

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
      { tag_name: "bun-v1.4.4" },
      { tag_name: "bun-v1.4.3" },
    ];
    const r = await resolveAll(app, { releases });
    expect(r.id).toBe(`${shaA.slice(0, 7)}-${shaB.slice(0, 7)}-bun-v1.4.4`);
    const shaA2 = await a.push("two");
    expect((await resolveAll(app, { releases })).id).toBe(`${shaA2.slice(0, 7)}-${shaB.slice(0, 7)}-bun-v1.4.4`);
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
    using dir = tempDir("deploy-sums", { bin: "binary", "release.json": "{}" });
    const d = String(dir);
    expect(writeSums(d)).toEqual(["bin", "release.json"]);
    expect(readFileSync(join(d, "SHA256SUMS"), "utf8")).toContain(`${sha256File(join(d, "bin"))}  bin`);
    expect(verifySums(d)).toEqual([]);
    writeFileSync(join(d, "bin"), "tampered");
    expect(verifySums(d)).toEqual(["bin"]);
    writeFileSync(join(d, "SHA256SUMS"), `${"0".repeat(64)}  ../etc/passwd\n`);
    expect(verifySums(d)).toHaveLength(1);
    const windowsEscape = `${"0".repeat(64)}  sub\\\\file`;
    writeFileSync(join(d, "SHA256SUMS"), windowsEscape + "\n");
    expect(verifySums(d)).toEqual([windowsEscape]);
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
    const full = await activateRelease({
      ...base,
      releaseDir: join(s.root, "releases/new"),
      free: () => 1024 ** 3,
    });
    expect(full.ok).toBe(false);
    expect(full.detail).toContain("free space");
    expect(readlinkSync(join(s.root, "current"))).toEndWith("old");
    expect(existsSync(s.log)).toBe(false);
    expect(lstatSync(join(s.root, "current")).isSymbolicLink()).toBe(true);
  });
});

describe("clean", () => {
  test("malformed Docker rows never become image deletion arguments", async () => {
    using dir = tempDir("deploy-clean-image-rows", {});
    const root = String(dir);
    const calls: string[][] = [];
    await runClean({
      role: "prod",
      home: root,
      tmpDir: root,
      dryRun: false,
      free: () => 50 * 1024 ** 3,
      exec: async cmd => {
        calls.push(cmd);
        const stdout =
          cmd[1] === "images"
            ? "shenron-unused:latest aaaaaaaaaaaa\nshenron-used:latest bbbbbbbbbbbb\nshenron-postgres:latest cccccccccccc\nshenron-missing\nshenron-invalid:latest --force\nshenron-extra:latest dddddddddddd extra\n"
            : cmd[1] === "ps"
              ? "shenron-used:latest\n"
              : "";
        return { code: 0, stdout, stderr: "" };
      },
    });
    expect(calls.filter(cmd => cmd[1] === "image" && cmd[2] === "rm")).toEqual([
      ["docker", "image", "rm", "aaaaaaaaaaaa"],
    ]);
  });

  test("clean CLI rejects missing values before cleanup or locking", async () => {
    await using proc = Bun.spawn({
      cmd: [bunExe(), join(import.meta.dir, "../../scripts/aphrody/deploy/clean.ts"), "--dry-run", "--root"],
      env: bunEnv,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, code] = await Promise.all([
      Bun.readableStreamToText(proc.stdout),
      Bun.readableStreamToText(proc.stderr),
      proc.exited,
    ]);
    expect(stdout).toBe("");
    expect(stderr).toContain("Missing value for --root");
    expect(code).not.toBe(0);
  });

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
    const old = new Date(Date.now() - 3 * 86_400_000 - 3_600_000);
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
    const plan = planInstall({
      role: "prod",
      home: "/home/ubuntu",
      root: "/home/ubuntu/apps/shenron-app",
      prefix,
    });
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

describe("upstream interface mirror", () => {
  test("adapts only the proven root-relative Pagefind dynamic loader", () => {
    const loader = 'let c=["","_pagefind","pagefind.js"].join("/");Z=Function("u","return import(u)")(c)';
    expect(rewritePagefindLoader(loader)).toBe('let c=["","_pagefind","pagefind.js"].join("/");Z=import(c)');
    expect(rewritePagefindLoader('import("./ordinary.js")')).toBe('import("./ordinary.js")');
    const backend = 'function init_pagefind(){};const file="pagefind.js";';
    expect(rewritePagefindLoader(backend)).toBe(backend);
    for (const malformed of [
      loader + loader,
      loader.replaceAll('"', "'"),
      loader.replace('["","_pagefind"', '["https://example.com","_pagefind"'),
      loader.replace("let c=", "let d="),
      loader.replace("return import(u)", 'return import(u + "/other")'),
    ])
      expect(() => rewritePagefindLoader(malformed)).toThrow("Unsupported Pagefind loader");
  });
  test("preserves upstream interaction code and reports fork provenance", () => {
    const source = "a".repeat(40);
    const html =
      '<html><head><link rel="canonical" href="https://bun.com/"><script src="page.js" type="module"></script></head><body><button data-tab="windows">Windows</button><pre>https://bun.sh/install.ps1</pre></body></html>';
    const adapted = adaptHtml(html, source);
    expect(adapted).toContain('<script src="page.js" type="module"></script>');
    expect(adapted).toContain('<button data-tab="windows">Windows</button>');
    expect(adapted).toContain("https://bun.aphrody.app/install.ps1");
    expect(adapted).toContain(source);
    expect(adapted).toContain("upstream benchmark results are not fork measurements");
    expect(() => adaptHtml(html, "HEAD")).toThrow("source SHA");
    expect(
      localReferences('<a href="#x">x</a><script src="page.js"></script><img src="https://bun.com/a.png">'),
    ).toEqual(["page.js"]);
    expect(mirrorCommand("capture")).toContain("--resolve-cdns");
  });
  test("keeps capture bytes intact and uses public fallback for missing linked assets", () => {
    using capture = tempDir("site-mirror-capture", {
      "report.json": JSON.stringify({ pages: 1 }),
      "upstream/bun.com/index.html": '<html><head></head><body><img src="missing.png"></body></html>',
    });
    using destination = tempDir("site-mirror-output", {});
    const original = readFileSync(join(String(capture), "upstream/bun.com/index.html"), "utf8");
    const coverage = buildMirror(String(capture), join(String(destination), "preview"), "b".repeat(40));
    expect(readFileSync(join(String(capture), "upstream/bun.com/index.html"), "utf8")).toBe(original);
    expect(readFileSync(join(String(destination), "preview/index.html"), "utf8")).toContain(
      'src="https://bun.com/missing.png"',
    );
    expect(coverage.unresolved).toEqual([]);
    expect(coverage.qualification.completeSite).toBe(false);
    expect(coverage.qualification.screenshotComparison).toBe(false);
    expect(coverage.files[0]!.upstreamSha256).not.toBe(coverage.files[0]!.adaptedSha256);
  });
});

test("domain network embeds actual references without executable source text", () => {
  const html = graphView({
    source: "c".repeat(40),
    domains: [{ name: "</script><script>unsafe</script>", files: 1 }],
    links: [],
    documents: [],
    coverage: "Resolved relative references.",
  });
  expect(html).not.toContain("</script><script>unsafe</script>");
  expect(html).toContain("\\u003c/script>");
  expect(html).toContain('viewBox="0 0 1100 650"');
  expect(html).toContain('<script src="graph-view.js" defer></script>');
  expect(html).not.toContain("<script>\n");
  expect(html).toContain("they are not runtime call counts");
});

test("mirror externalizes only executable inline scripts in source order", () => {
  const original =
    '<script data-example="a>b">first()</script><script type="module">second()</script><script type="application/ld+json">{"name":"Bun"}</script><script src="page.js"></script>';
  const adapted = externalizeInlineScripts(original);
  expect(adapted.assets.map(asset => asset.content)).toEqual(["first()", "second()"]);
  expect(adapted.html).toContain('data-example="a>b" src="aphrody-inline-');
  expect(adapted.html).toContain('<script type="module" src="aphrody-inline-');
  expect(adapted.html).toContain('<script type="application/ld+json">{"name":"Bun"}</script>');
  expect(adapted.html).toContain('<script src="page.js"></script>');
  expect(adapted.html).not.toContain(">first()</script>");
  expect(externalizeInlineScripts(original).assets).toEqual(adapted.assets);
});

test("redirect repair plans only captured in-scope HTML aliases", () => {
  using root = tempDir("mirror-alias-plan", {});
  const requests = aliasRequests(String(root), [
    { page: "index.html", href: "docs/cli/test/index.html" },
    { page: "index.html", href: "docs/cli/test/index.html#flags" },
    { page: "index.html", href: "../outside/index.html" },
    { page: "index.html", href: "https://other.example/index.html" },
  ]);
  expect(requests).toEqual([{ path: "docs/cli/test/index.html", url: "https://bun.com/docs/cli/test/" }]);
});

test("captured relative asset hosts stay inside the preview web root", () => {
  using capture = tempDir("mirror-assets-path", {
    "upstream/avatars.githubusercontent.com/u/1.png": "avatar",
    "upstream/bun.com/docs/test/index.html": "docs",
  });
  const base = join(String(capture), "upstream");
  const html = rewriteCapturedLinks(
    '<img src="../avatars.githubusercontent.com/u/1.png"><a href="docs/test/index.html">Docs</a><script>const s="href=quoted";</script>',
    join(base, "bun.com/index.html"),
    base,
  );
  expect(html).toContain('src="/avatars.githubusercontent.com/u/1.png"');
  expect(html).toContain('href="/docs/test"');
  expect(html).toContain('const s="href=quoted";');
});

test("uncaptured foreign links retain their public destinations", () => {
  using capture = tempDir("mirror-foreign-path", {
    "upstream/shop.bun.com/index.html": "captured shop",
  });
  const base = join(String(capture), "upstream");
  const html = rewriteCapturedLinks(
    '<a href="../shop.bun.com/index.html?item=1#buy">Shop</a><img src="../github.com/avatar.png"><a href="discord/index.html">Discord</a><a href="/discord#join">Community</a><img src="//external.example/avatar.png">',
    join(base, "bun.com/index.html"),
    base,
  );
  expect(html).toContain('href="https://shop.bun.com/?item=1#buy"');
  expect(html).toContain('src="https://github.com/avatar.png"');
  expect(html).toContain('href="https://bun.com/discord"');
  expect(html).toContain('href="https://bun.com/discord#join"');
  expect(html).toContain('src="//external.example/avatar.png"');
  expect(localReferences(html)).toEqual([]);
  const unresolved = rewriteCapturedLinks(
    '<img src="../github.com/avatar.q-bc5eaf9164.png">',
    join(base, "bun.com/index.html"),
    base,
  );
  expect(unresolved).toContain('src="../github.com/avatar.q-bc5eaf9164.png"');
  expect(localReferences(unresolved)).toEqual(["../github.com/avatar.q-bc5eaf9164.png"]);
});

test("adaptation removes captured and remote analytics without removing application scripts", () => {
  const html = adaptHtml(
    '<html><head><script src="/plausible.io/js/script.js"></script><script src="https://static.cloudflareinsights.com/beacon.min.js"></script><script src="/app.js"></script></head><body></body></html>',
    "b".repeat(40),
  );
  expect(html).not.toContain("plausible.io");
  expect(html).not.toContain("static.cloudflareinsights.com");
  expect(html).toContain('src="/app.js"');
  expect(html).toContain('href="/mirror-assets/m3.css"');
  expect(html).toContain('src="/mirror-assets/m3.js"');
});

test("mirror link coverage ignores code examples and JSON payload text", () => {
  const html =
    '<script type="application/json">{"example":"<img src=\'example.png\'>"}</script><pre>&lt;img src="cat.jpg"&gt;</pre><img src="actual.png">';
  expect(localReferences(html)).toEqual(["actual.png"]);
});

test("reference supplementation rejects authenticated and noncanonical inputs", () => {
  using root = tempDir("reference-public-scope", {});
  expect(capturePath(String(root), "https://bun.com/reference/Bun/serve")).toBe(
    join(String(root), "bun.com/reference/Bun/serve/index.html"),
  );
  expect(() => capturePath(String(root), "https://user:password@bun.com/reference/Bun")).toThrow("canonical public");
  expect(() => capturePath(String(root), "https://bun.com/reference/Bun?token=secret")).toThrow("canonical public");
  expect(() => capturePath(String(root), "https://other.example/reference/Bun")).toThrow("canonical public");
});

test("reference rate limits use observed Retry-After before exponential defaults", () => {
  expect(retryDelay("2", 0, 0)).toBe(2000);
  expect(retryDelay("Thu, 01 Jan 1970 00:00:04 GMT", 0, 1000)).toBe(3000);
  expect(retryDelay(undefined, 2, 0)).toBe(4000);
});
