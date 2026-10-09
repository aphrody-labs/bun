// Unattended health cycle for the aphrody-labs/bun checkout. Each step reports pass, fail or skipped:
// - scope: scope.ts --check (with --repair, scope.ts --write rewrites the files; they are left uncommitted)
// - upstream: git fetch upstream, then the count of upstream/main commits not merged into HEAD (read-only)
// - internal: bun test on the scripts/aphrody tests (system bun; they cover scripts, not native code)
// - container: `bun --version` inside the Alpine and Ubuntu build images of tmux.ts (skipped without docker)
// - ci: act dry run (-n) of aphrody-publish-npm through act.ts (skipped without act)
// The report goes to tmp/autopilot/status.json and, when the aphrody CLI is on PATH, to its memory (agent bun).
//
//   bun scripts/aphrody/autopilot.ts status
//   bun scripts/aphrody/autopilot.ts cycle [--repair]
//   bun scripts/aphrody/autopilot.ts daemon [--interval <seconds>] [--repair]   (default 3600 s)
//   bun scripts/aphrody/autopilot.ts tmux                                       (daemon as the psmux job autopilot-daemon)

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { IMAGES } from "./tmux.ts";

const ROOT = resolve(import.meta.dir, "..", "..");
const LOGS_DIR = join(ROOT, "tmp", "autopilot");
const STATUS_FILE = join(LOGS_DIR, "status.json");
const INTERNAL_TESTS = ["test/internal/aphrody-tmux.test.ts", "test/internal/aphrody-upstream-sync.test.ts"];
export const DEFAULT_INTERVAL_SEC = 3600;

export type StepResult = "pass" | "fail" | "skipped";
export type Step = { name: string; result: StepResult; detail: string };
export type Report = { timestamp: string; ok: boolean; steps: Step[] };

function run(cmd: string[]): { code: number; out: string } {
  const p = Bun.spawnSync(cmd, { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
  return { code: p.exitCode ?? 1, out: `${p.stdout.toString()}${p.stderr.toString()}`.trim() };
}

const tail = (s: string, lines = 20) => s.split(/\r?\n/).slice(-lines).join("\n");

export function scope(repair: boolean): Step {
  const check = run([process.execPath, "scripts/aphrody/scope.ts", "--check"]);
  if (check.code === 0) return { name: "scope", result: "pass", detail: "no upstream package names left" };
  if (!repair) return { name: "scope", result: "fail", detail: tail(check.out) };
  const write = run([process.execPath, "scripts/aphrody/scope.ts", "--write"]);
  return write.code === 0
    ? { name: "scope", result: "pass", detail: `rewritten, uncommitted:\n${tail(write.out)}` }
    : { name: "scope", result: "fail", detail: tail(write.out) };
}

export function upstream(): Step {
  const fetch = run(["git", "fetch", "--quiet", "upstream", "main"]);
  if (fetch.code !== 0) return { name: "upstream", result: "fail", detail: tail(fetch.out) };
  const count = run(["git", "rev-list", "--count", "HEAD..upstream/main"]);
  if (count.code !== 0) return { name: "upstream", result: "fail", detail: tail(count.out) };
  const behind = Number(count.out);
  return behind === 0
    ? { name: "upstream", result: "pass", detail: "up to date with upstream/main" }
    : { name: "upstream", result: "fail", detail: `${behind} upstream commit(s) to merge (sync-upstream.ts)` };
}

export function internalTests(): Step {
  const r = run([process.execPath, "test", ...INTERNAL_TESTS]);
  return { name: "internal", result: r.code === 0 ? "pass" : "fail", detail: tail(r.out, r.code === 0 ? 3 : 40) };
}

export function containers(): Step {
  if (!Bun.which("docker") || run(["docker", "info"]).code !== 0)
    return { name: "container", result: "skipped", detail: "docker daemon unavailable" };
  const lines: string[] = [];
  let ok = true;
  for (const image of Object.values(IMAGES)) {
    const r = run(["docker", "run", "--rm", "--cpus", "2", "--memory", "2g", image, "bun", "--version"]);
    ok &&= r.code === 0;
    lines.push(`${image}: ${r.code === 0 ? r.out : `exit ${r.code} ${tail(r.out, 5)}`}`);
  }
  return { name: "container", result: ok ? "pass" : "fail", detail: lines.join("\n") };
}

export function localCI(): Step {
  if (!Bun.which("act")) return { name: "ci", result: "skipped", detail: "act not on PATH" };
  const r = run([process.execPath, "scripts/aphrody/act.ts", "run", "aphrody-publish-npm", "-n"]);
  return { name: "ci", result: r.code === 0 ? "pass" : "fail", detail: tail(r.out) };
}

export function report(steps: Step[], now = new Date()): Report {
  return { timestamp: now.toISOString(), ok: steps.every(s => s.result !== "fail"), steps };
}

function record(r: Report) {
  mkdirSync(LOGS_DIR, { recursive: true });
  writeFileSync(STATUS_FILE, JSON.stringify(r, null, 2));
  if (!Bun.which("aphrody")) return;
  const text = [
    `Autopilot report ${r.timestamp}: ${r.ok ? "ok" : "failing"}`,
    ...r.steps.map(s => `${s.name}: ${s.result}\n${s.detail}`),
  ].join("\n");
  const p = Bun.spawnSync(
    [
      "aphrody",
      "memory",
      "write",
      "--agent-id",
      "bun",
      "--id",
      "autopilot-status",
      "--tag",
      "autopilot",
      "--content",
      "-",
    ],
    { cwd: ROOT, stdin: Buffer.from(text), stdout: "ignore", stderr: "pipe" },
  );
  if (p.exitCode !== 0) console.error(`aphrody memory write: ${p.stderr.toString().trim()}`);
}

export function cycle(repair: boolean): Report {
  const steps: Step[] = [];
  for (const step of [() => scope(repair), upstream, internalTests, containers, localCI]) {
    const s = step();
    console.log(`${s.name}: ${s.result}`);
    steps.push(s);
  }
  const r = report(steps);
  record(r);
  return r;
}

export function parseInterval(args: string[]): number {
  const i = args.indexOf("--interval");
  if (i < 0) return DEFAULT_INTERVAL_SEC;
  const n = Number(args[i + 1]);
  if (!Number.isInteger(n) || n < 60) throw new Error("--interval expects a whole number of seconds, at least 60");
  return n;
}

if (import.meta.main) {
  const [action = "cycle", ...rest] = process.argv.slice(2);
  const repair = rest.includes("--repair");
  try {
    switch (action) {
      case "status":
        console.log(existsSync(STATUS_FILE) ? readFileSync(STATUS_FILE, "utf8") : "no report yet; run `cycle` first");
        break;
      case "cycle":
        process.exit(cycle(repair).ok ? 0 : 1);
      case "daemon": {
        const interval = parseInterval(rest);
        for (;;) {
          cycle(repair);
          await Bun.sleep(interval * 1000);
        }
      }
      case "tmux": {
        const args = ["daemon", ...rest].join(" ");
        const job = [process.execPath, join(import.meta.dir, "tmux.ts"), "run", "autopilot-daemon", "--"];
        process.exit(
          Bun.spawnSync([...job, process.execPath, "scripts/aphrody/autopilot.ts", args], {
            cwd: ROOT,
            stdio: ["inherit", "inherit", "inherit"],
          }).exitCode ?? 1,
        );
      }
      default:
        console.log(
          "usage: bun scripts/aphrody/autopilot.ts status | cycle [--repair] | daemon [--interval <s>] [--repair] | tmux",
        );
    }
  } catch (err) {
    console.error(`error: ${(err as Error).message}`);
    process.exit(1);
  }
}
