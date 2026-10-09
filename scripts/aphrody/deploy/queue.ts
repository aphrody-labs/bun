// Auto-deploy queue (build host, timer systemd --user aphrody-deploy). One pass per run, one build at a time (flock).
//   bun queue.ts [--once] [--dry-run] [--status] [--config ~/.config/aphrody-deploy/apps.json] [--state DIR]
// Exit codes: 0 ok/no-op, 1 build failed, 2 transfer failed, 3 activation failed (rolled back), 4 config, 75 already running.
// Tokens are only read from the environment (GH_TOKEN) and are never logged or put in argv.
import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import {
  EXIT,
  QueueState,
  copyExecutable,
  ensureFlock,
  expandHome,
  gitEnv,
  logEvent,
  readJson,
  resolveAll,
  run,
  runQueue,
  sha256File,
  shq,
  stateDir,
  validateApp,
  verifySums,
  writeSums,
  type App,
  type QueueDeps,
  type Resolved,
  type Run,
} from "./lib.ts";

const libFiles = ["activate.ts", "clean.ts", "lib.ts"];

export function sshArgs(app: App): string[] {
  const s = app.ssh ?? {};
  return [
    "ssh",
    "-o",
    "BatchMode=yes",
    "-o",
    "ConnectTimeout=15",
    ...(s.identity ? ["-i", expandHome(s.identity), "-o", "IdentitiesOnly=yes"] : []),
    ...(s.port ? ["-p", String(s.port)] : []),
    s.target ?? app.host,
  ];
}

export const substitute = (text: string, vars: Record<string, string>) =>
  text.replace(/\{([A-Za-z0-9_.-]+)\}/g, (m, k) => vars[k] ?? m);

export function makeDeps(
  app: App,
  base: string,
  exec: Run = run,
  log = (e: string, f?: Record<string, unknown>) => logEvent(e, f),
): QueueDeps {
  const state = stateDir(app.name, base);
  const remote = app.remote;
  const bun = remote.bun ?? "/home/ubuntu/.local/bin/bun";
  const libDir = remote.libDir ?? "/usr/local/lib/aphrody-deploy";
  const ssh = (script: string) => exec([...sshArgs(app), script]);
  const must = async (what: string, p: Promise<{ code: number; stderr: string }>) => {
    const r = await p;
    if (r.code !== 0) throw new Error(`${what} failed (exit ${r.code}): ${r.stderr.trim().slice(-300)}`);
  };

  return {
    resolve: () => resolveAll(app, { run: exec }),

    async deployedId() {
      const r = await ssh(`cat ${shq(remote.root + "/current/release.json")} 2>/dev/null; true`);
      if (r.code !== 0) throw new Error(`ssh ${app.host} failed (exit ${r.code}): ${r.stderr.trim().slice(-200)}`);
      try {
        return JSON.parse(r.stdout).id ?? null;
      } catch {
        return null;
      }
    },

    async build(r: Resolved) {
      const work = join(state, "work", r.id);
      const out = join(state, "releases", r.id);
      const vars: Record<string, string> = { id: r.id, work, out };
      const env: Record<string, string> = { ...(app.build.env ?? {}) };
      const worktrees: { checkout: string; dir: string }[] = [];
      rmSync(work, { recursive: true, force: true });
      mkdirSync(work, { recursive: true });
      try {
        for (const s of app.sources) {
          const res = r.sources.find(x => x.name === s.name)!;
          const key = s.name.toUpperCase().replace(/[^A-Z0-9]/g, "_");
          if (res.sha) env[`DEPLOY_SHA_${key}`] = res.sha;
          if (res.tag) env[`DEPLOY_TAG_${key}`] = res.tag;
          if (!s.checkout || !res.sha) continue;
          const checkout = expandHome(s.checkout);
          await must(
            `fetch ${s.name}`,
            exec(["git", "-C", checkout, "fetch", "-q", "origin", s.branch ?? "main"], { env: gitEnv() }),
          );
          const dir = join(work, s.name);
          await must(`worktree ${s.name}`, exec(["git", "-C", checkout, "worktree", "add", "--detach", dir, res.sha]));
          worktrees.push({ checkout, dir });
          vars[`src.${s.name}`] = dir;
        }
        const cwd = substitute(expandHome(app.build.cwd), vars);
        const cmd = app.build.cmd.map(a => substitute(a, vars));
        for (const [k, v] of Object.entries(env)) env[k] = substitute(v, vars);
        if (!env.RUSTC_WRAPPER && Bun.which("sccache")) env.RUSTC_WRAPPER = "sccache";
        const lowPriority =
          process.platform === "linux"
            ? [
                ...(Bun.which("nice") ? ["nice", "-n", "19"] : []),
                ...(Bun.which("ionice") ? ["ionice", "-c", "3"] : []),
              ]
            : [];
        await must("build", exec([...lowPriority, ...cmd], { cwd, env }));

        const artifact = substitute(app.build.artifact, vars);
        const artifactPath = artifact.startsWith("/") ? artifact : join(cwd, artifact);
        if (!existsSync(artifactPath)) throw new Error(`artifact missing: ${artifactPath}`);
        rmSync(out, { recursive: true, force: true });
        mkdirSync(out, { recursive: true });
        copyExecutable(artifactPath, join(out, basename(artifactPath)));
        const files = writeSums(out);
        const sizes = Object.fromEntries(files.map(f => [f, statSync(join(out, f)).size]));
        writeFileSync(
          join(out, "release.json"),
          JSON.stringify(
            { id: r.id, app: app.name, sources: r.sources, builtAt: new Date().toISOString(), sizes },
            null,
            2,
          ) + "\n",
        );
        writeSums(out);
        const bad = verifySums(out);
        if (bad.length) throw new Error(`local sha256 verification failed: ${bad.join(",")}`);
        return out;
      } finally {
        for (const w of worktrees) await exec(["git", "-C", w.checkout, "worktree", "remove", "--force", w.dir]);
        for (const w of worktrees) await exec(["git", "-C", w.checkout, "worktree", "prune"]);
        rmSync(work, { recursive: true, force: true });
      }
    },

    async transfer(r: Resolved, dir: string) {
      const releases = `${remote.root}/releases`;
      const partial = `${releases}/${r.id}.partial`;
      await must("remote mkdir", ssh(`mkdir -p ${shq(releases)}`));
      const rsh = sshArgs(app).slice(0, -1).join(" ");
      const target = app.ssh?.target ?? app.host;
      await must("rsync", exec(["rsync", "-a", "--partial", "-e", rsh, `${dir}/`, `${target}:${partial}/`]));
      await must(
        "remote rename+verify",
        ssh(
          `set -e; cd ${shq(releases)}; rm -rf ${shq(r.id)}; mv ${shq(r.id + ".partial")} ${shq(r.id)}; cd ${shq(r.id)}; sha256sum -c --quiet SHA256SUMS`,
        ),
      );
      log("transferred", { id: r.id, to: `${target}:${releases}/${r.id}` });
      await installScripts();
    },

    async activate(r: Resolved) {
      const cmd = `sudo -n ${shq(bun)} ${shq(libDir + "/activate.ts")} --root ${shq(remote.root)} --unit ${shq(remote.unit)} --health ${shq(remote.health)} ${shq(`${remote.root}/releases/${r.id}`)}`;
      const res = await ssh(cmd);
      for (const line of res.stdout.split("\n").filter(Boolean)) log("remote", { line: line.slice(0, 500) });
      return {
        ok: res.code === 0,
        detail: res.code === 0 ? undefined : res.stderr.trim().slice(-300) || `exit ${res.code}`,
      };
    },

    log,
  };

  /** Installs activate.ts/clean.ts/lib.ts on the prod host when their digest differs (sha256 checked after copy). */
  async function installScripts() {
    const here = import.meta.dir;
    const stage = `/tmp/aphrody-deploy-stage-${process.pid}`;
    const target = app.ssh?.target ?? app.host;
    const rsh = sshArgs(app).slice(0, -1).join(" ");
    const wanted = libFiles.map(f => `${sha256File(join(here, f))}  ${f}`).join("\n") + "\n";
    const have = await ssh(`cd ${shq(libDir)} 2>/dev/null && sha256sum ${libFiles.join(" ")} 2>/dev/null || true`);
    if (have.stdout === wanted) return;
    await must("stage mkdir", ssh(`mkdir -p ${shq(stage)}`));
    await must(
      "stage rsync",
      exec(["rsync", "-a", "-e", rsh, ...libFiles.map(f => join(here, f)), `${target}:${stage}/`]),
    );
    await must(
      "install scripts",
      ssh(
        `set -e; cd ${shq(stage)}; printf %s ${shq(wanted)} | sha256sum -c --quiet; sudo -n install -d -m 0755 ${shq(libDir)}; sudo -n install -m 0644 ${libFiles.join(" ")} ${shq(libDir)}/; rm -rf ${shq(stage)}`,
      ),
    );
    log("scripts-installed", { dir: libDir });
  }
}

function parse(args: string[]) {
  const o = {
    once: false,
    dryRun: false,
    status: false,
    config: undefined as string | undefined,
    state: undefined as string | undefined,
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--once") o.once = true;
    else if (a === "--dry-run") o.dryRun = true;
    else if (a === "--status") o.status = true;
    else if (a === "--config") o.config = args[++i];
    else if (a === "--state") o.state = args[++i];
    else throw new Error(`unknown argument ${a}`);
  }
  return o;
}

export async function main(argv: string[]): Promise<number> {
  let o;
  let app: App;
  try {
    o = parse(argv);
    const config = expandHome(o.config ?? "~/.config/aphrody-deploy/apps.json");
    app = validateApp(
      readJson(config) ??
        (() => {
          throw new Error(`cannot read ${config}`);
        })(),
    );
  } catch (e) {
    logEvent("config-error", { error: (e as Error).message });
    return EXIT.config;
  }
  const base =
    o.state ?? process.env.APHRODY_DEPLOY_STATE ?? join(process.env.HOME ?? "", ".local/state/aphrody-deploy");
  const state = new QueueState(stateDir(app.name, base));
  const deps = makeDeps(app, base);
  if (o.status) {
    const [resolved, deployed] = await Promise.all([
      deps.resolve().catch(e => ({ error: String(e.message) })),
      deps.deployedId(),
    ]);
    logEvent("status", { app: app.name, resolved, deployed, pending: state.readPending(), bad: state.badIds() });
    return EXIT.ok;
  }
  if (!o.dryRun) await ensureFlock(join(stateDir(app.name, base), "queue.lock"), [process.argv[1], ...argv]);
  try {
    return await runQueue(state, deps, { dryRun: o.dryRun });
  } catch (e) {
    logEvent("error", { error: (e as Error).message });
    return EXIT.build;
  }
}

if (import.meta.main) process.exit(await main(process.argv.slice(2)));
