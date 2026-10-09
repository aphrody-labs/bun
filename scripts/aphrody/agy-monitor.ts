// Live view of agy (Antigravity CLI) and its sub-agents: which conversations are active, what each one
// is doing (tool calls, files written, commands run) and the `bun*` branches on the aphrody-labs forks.
//
//   bun scripts/aphrody/agy-monitor.ts status [--since 30]   active conversations (minutes), agy processes, last step
//   bun scripts/aphrody/agy-monitor.ts watch [--since 30]    streams every new step of every active conversation
//   bun scripts/aphrody/agy-monitor.ts files [--since 120] [--full]   files agy wrote/edited, per repository
//   bun scripts/aphrody/agy-monitor.ts branches              bun* branches on aphrody-labs repositories

import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const BRAIN = join(homedir(), ".gemini", "antigravity-cli", "brain");
const ORG = "aphrody-labs";
const argv = process.argv.slice(2);
const cmd = argv[0] ?? "status";
const since = Number(argv[argv.indexOf("--since") + 1]) || (cmd === "files" ? 120 : 30);

type Step = {
  step_index: number;
  source: string;
  type: string;
  status: string;
  created_at: string;
  content?: string;
  tool_calls?: { name: string; args: Record<string, string> }[];
};

function transcript(id: string) {
  return join(BRAIN, id, ".system_generated", "logs", "transcript.jsonl");
}

function active(minutes: number): { id: string; mtime: number }[] {
  if (!existsSync(BRAIN)) return [];
  const cutoff = Date.now() - minutes * 60_000;
  return readdirSync(BRAIN)
    .map(id => ({ id, path: transcript(id) }))
    .filter(c => existsSync(c.path))
    .map(c => ({ id: c.id, mtime: statSync(c.path).mtimeMs }))
    .filter(c => c.mtime >= cutoff)
    .sort((a, b) => b.mtime - a.mtime);
}

async function steps(id: string): Promise<Step[]> {
  const text = await Bun.file(transcript(id)).text();
  const out: Step[] = [];
  for (const line of text.split("\n")) {
    if (!line) continue;
    try {
      out.push(JSON.parse(line));
    } catch {}
  }
  return out;
}

const unquote = (v: string | undefined) => {
  if (v === undefined) return "";
  try {
    const p = JSON.parse(v);
    return typeof p === "string" ? p : v;
  } catch {
    return v;
  }
};

function describe(s: Step): string {
  const t = s.created_at.slice(11, 19);
  if (s.tool_calls?.length) {
    return s.tool_calls
      .map(c => {
        const a = c.args;
        const target =
          unquote(a.CommandLine) ||
          unquote(a.TargetFile) ||
          unquote(a.AbsolutePath) ||
          unquote(a.DirectoryPath) ||
          unquote(a.SearchPath) ||
          unquote(a.Query) ||
          unquote(a.Url) ||
          "";
        return `${t} ${c.name} ${target.replace(/\s+/g, " ").slice(0, 160)}`;
      })
      .join("\n");
  }
  const text = (s.content ?? "").replace(/^(Created|Completed) At:.*\n/gm, "").replace(/\s+/g, " ");
  return `${t} ${s.source === "USER" ? "USER" : s.type} ${text.slice(0, 160)}`;
}

const WRITE_TOOLS = new Set(["write_to_file", "replace_file_content", "multi_replace_file_content", "create_file"]);

async function processes() {
  const r = Bun.spawnSync(["aphrody", "winclean", "call", "list_processes", "--json", "-a", "name=agy"]);
  try {
    const procs = JSON.parse(r.stdout.toString()).structuredContent.Processes as {
      Pid: number;
      ParentPid: number;
      WorkingSetBytes: number;
    }[];
    return procs.map(p => `pid ${p.Pid} (parent ${p.ParentPid}) ${(p.WorkingSetBytes / 2 ** 20).toFixed(0)} MiB`);
  } catch {
    return [`(process list unavailable: ${r.stderr.toString().trim().slice(0, 120)})`];
  }
}

async function title(id: string, all: Step[]) {
  const first = all.find(s => s.source === "USER" || s.type === "USER_INPUT");
  return (first?.content ?? "").replace(/\s+/g, " ").slice(0, 100) || id;
}

switch (cmd) {
  case "status": {
    console.log(`agy: ${(await processes()).join(" | ") || "not running"}`);
    for (const c of active(since)) {
      const all = await steps(c.id);
      const last = all.at(-1);
      console.log(`\n# ${c.id.slice(0, 8)}  ${all.length} steps  ${await title(c.id, all)}`);
      if (last) console.log(describe(last));
    }
    break;
  }
  case "watch": {
    const seen = new Map<string, number>();
    for (const c of active(since)) seen.set(c.id, (await steps(c.id)).length);
    console.log(`watching ${seen.size} agy conversation(s) under ${BRAIN}`);
    for (;;) {
      for (const c of active(since)) {
        const all = await steps(c.id);
        const from = seen.get(c.id) ?? Math.max(0, all.length - 3);
        for (const s of all.slice(from)) console.log(`[${c.id.slice(0, 8)}] ${describe(s)}`);
        seen.set(c.id, all.length);
      }
      await Bun.sleep(3000);
    }
  }
  case "files": {
    const byRepo = new Map<string, Set<string>>();
    for (const c of active(since)) {
      for (const s of await steps(c.id)) {
        for (const call of s.tool_calls ?? []) {
          if (!WRITE_TOOLS.has(call.name)) continue;
          const file = unquote(call.args.TargetFile) || unquote(call.args.AbsolutePath);
          if (!file) continue;
          const repo = /^[A-Za-z]:[\\/][^\\/]+/.exec(file)?.[0] ?? "?";
          (byRepo.get(repo) ?? byRepo.set(repo, new Set()).get(repo)!).add(file);
        }
      }
    }
    for (const [repo, files] of byRepo) console.log(`${repo} (${files.size})\n  ${[...files].join("\n  ")}`);
    break;
  }
  case "branches": {
    const repos = (await Bun.$`gh api orgs/${ORG}/repos --paginate -q .[].name`.text()).trim().split("\n");
    await Promise.all(
      repos.map(async repo => {
        const names = (await Bun.$`gh api repos/${ORG}/${repo}/branches --paginate -q .[].name`.nothrow().text())
          .trim()
          .split("\n")
          .filter(b => /(^|[-_/])bun($|[-_/])/i.test(b));
        if (names.length) console.log(`${repo}: ${names.join(", ")}`);
      }),
    );
    break;
  }
  default:
    console.log("usage: bun scripts/aphrody/agy-monitor.ts status|watch|files|branches [--since <minutes>]");
}
