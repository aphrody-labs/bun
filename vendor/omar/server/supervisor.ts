import windows from "bun:windows";
import { closeSync, mkdirSync, openSync, renameSync } from "node:fs";

type Definition = { id: string; command: string[]; cwd: string; health: string; env?: Record<string, string> };
type State = { definition: Definition; pid: number | null; healthy: boolean; restarts: number; lastExit: number | null; startedAt: string | null };
const root = "C:/SSH/omar/server";
const featureEnv = (await Bun.file(`${root}/runtime-features.json`).json()).env;
const cacheConfig = await Bun.file("C:/Users/omara/.aphrody/private/omar-redis/client.json").json();
const config = await Bun.file(`${root}/services.json`).json() as { version: 1; services: Definition[] };
if (config.version !== 1 || !config.services.length) throw new Error("Unsupported or empty service configuration");
mkdirSync(`${root}/var/services`, { recursive: true });
const states = config.services.map(definition => ({ definition, pid: null, healthy: false, restarts: 0, lastExit: null, startedAt: null } as State));
const jobs = new Set<InstanceType<typeof windows.Job>>();
let stopping = false;
const status = () => ({ observedAt: new Date().toISOString(), runtime: Bun.version, runtimeRevision: Bun.revision, ok: states.every(s => s.healthy), services: states.map(s => ({ id: s.definition.id, pid: s.pid, healthy: s.healthy, restarts: s.restarts, lastExit: s.lastExit, startedAt: s.startedAt })) });
const gateway = Bun.serve({ hostname: "127.0.0.1", port: 8797, fetch(req) { return new URL(req.url).pathname === "/health" ? Response.json(status(), { headers: { "Cache-Control": "no-store" } }) : new Response("Not found", { status: 404 }); } });

async function supervise(state: State) {
  while (!stopping) {
    const definition = state.definition;
    let job: InstanceType<typeof windows.Job> | undefined;
    let fd: number | undefined;
    const start = Date.now();
    try {
      fd = openSync(`${root}/var/services/${definition.id}.log`, "a");
      job = new windows.Job({ killOnClose: true });
      jobs.add(job);
      const child = Bun.spawn({ cmd: definition.command, cwd: definition.cwd, env: { ...process.env, ...featureEnv, REDIS_URL: cacheConfig.url, APHRODY_HOME: "C:/Users/omara/.aphrody", ...definition.env }, stdin: "ignore", stdout: fd, stderr: fd });
      try { job.assign(child.pid); } catch (error) { child.kill(); await child.exited; throw error; }
      state.pid = child.pid;
      state.startedAt = new Date().toISOString();
      console.log(JSON.stringify({ event: "started", service: definition.id, pid: child.pid }));
      state.lastExit = await child.exited;
    } catch (error) {
      state.lastExit = -1;
      console.error(JSON.stringify({ event: "launch-failed", service: definition.id, error: String(error) }));
    } finally {
      state.pid = null;
      state.healthy = false;
      if (job) { job.close(); jobs.delete(job); }
      if (fd !== undefined) closeSync(fd);
    }
    if (stopping) return;
    state.restarts++;
    const backoff = Date.now() - start > 60000 ? 2000 : Math.min(30000, 2000 * 2 ** Math.min(state.restarts, 4));
    console.error(JSON.stringify({ event: "restart-pending", service: definition.id, exit: state.lastExit, backoff }));
    await Bun.sleep(backoff);
  }
}
let probing = false;
async function probe() {
  if (probing || stopping) return;
  probing = true;
  try {
    await Promise.all(states.map(async state => {
      if (!state.pid) { state.healthy = false; return; }
      try { const response = await fetch(state.definition.health, { signal: AbortSignal.timeout(3000) }); state.healthy = response.ok; await response.body?.cancel(); }
      catch { state.healthy = false; }
    }));
    const temporary = `${root}/var/services/status.tmp.json`;
    await Bun.write(temporary, JSON.stringify(status(), null, 2) + "\n");
    renameSync(temporary, `${root}/var/services/status.json`);
  } finally { probing = false; }
}
const timer = setInterval(() => { void probe().catch(error => console.error(String(error))); }, 10000);
function stop() { if (stopping) return; stopping = true; clearInterval(timer); gateway.stop(true); for (const job of jobs) job.close(); process.exit(0); }
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
await Promise.all(states.map(supervise));
