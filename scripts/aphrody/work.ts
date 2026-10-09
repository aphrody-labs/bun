// Point d'entrée unique du travail autonome sur le monorepo : `bun scripts/aphrody/work.ts <commande>`.
//   status                      état git, lots de la file, écarts de l'audit
//   next                        prochain lot à traiter (code 3 si la file est vide : voir `refill`)
//   gate [chemins...]           vérifications adaptées aux chemins (défaut : fichiers modifiés)
//   ship --lot ID -m MSG [chemins...]   gate, audit, commit par chemins, push, preuve origin/main
//   mark ID todo|active|done|blocked
//   refill                      transforme les écarts de l'audit en lots
// Aucune commande n'interagit avec un humain ; les codes de sortie portent le résultat.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { audit, auditCommits } from "./agent-audit.ts";

export type Status = "todo" | "active" | "done" | "blocked";
export type Lot = { id: string; goal: string; paths: string[]; status: Status };

const ATTRIBUTION = /co-authored-by|generated with|\bclaude\b|anthropic|\bchatgpt\b|\bcopilot\b/i;

export function repoRoot(cwd = process.cwd()): string {
  const p = Bun.spawnSync({ cmd: ["git", "-C", cwd, "rev-parse", "--show-toplevel"], stdout: "pipe" });
  return p.stdout.toString().trim() || cwd;
}

function git(root: string, ...args: string[]) {
  const p = Bun.spawnSync({ cmd: ["git", "-C", root, ...args], stdout: "pipe", stderr: "pipe" });
  return { code: p.exitCode, out: p.stdout.toString(), err: p.stderr.toString() };
}

export const queueFile = (root: string) => join(root, "scripts", "aphrody", "work-queue.json");

export function loadQueue(root: string): Lot[] {
  const f = queueFile(root);
  return existsSync(f) ? (JSON.parse(readFileSync(f, "utf8")) as Lot[]) : [];
}

export function saveQueue(root: string, lots: Lot[]) {
  writeFileSync(queueFile(root), JSON.stringify(lots, null, 2) + "\n");
}

export function nextLot(lots: Lot[]): Lot | undefined {
  return lots.find(l => l.status === "active") ?? lots.find(l => l.status === "todo");
}

export function ownerOf(path: string, lots: Lot[]): string {
  const lot = lots.find(l => l.paths.some(p => path === p || path.startsWith(p.endsWith("/") ? p : p + "/")));
  return lot?.id ?? "sans-lot";
}

export function dirtyPaths(root: string): string[] {
  return git(root, "status", "--porcelain", "-z", "--untracked-files=all")
    .out.split("\0")
    .filter(Boolean)
    .map(l => l.slice(3));
}

function cratePackage(root: string, dir: string): string | undefined {
  const f = join(root, dir, "Cargo.toml");
  if (!existsSync(f)) return undefined;
  return /^\s*name\s*=\s*"([^"]+)"/m.exec(readFileSync(f, "utf8"))?.[1];
}

/** Commandes de vérification pour un chemin ; vide si rien d'automatisable sans build natif. */
export function gateFor(root: string, path: string): string[][] {
  const p = path.replaceAll("\\", "/");
  const gates: string[][] = [];
  const crate = /^src\/([^/]+)\//.exec(p)?.[1];
  if (crate && /\.(rs|toml)$/.test(p)) {
    const pkg = cratePackage(root, `src/${crate}`);
    if (pkg) gates.push(["cargo", "check", "-p", pkg, "--all-targets"]);
  }
  const script = /^scripts\/aphrody\/([^/]+)\.ts$/.exec(p)?.[1];
  if (script) {
    const t = `test/internal/aphrody-${script}.test.ts`;
    if (existsSync(join(root, t))) gates.push(["bun", "test", t]);
  }
  if (/^test\/internal\/.+\.test\.ts$/.test(p)) gates.push(["bun", "test", p]);
  else if (/^test\/.+\.test\.tsx?$/.test(p)) gates.push(["bun", "bd", "test", p]);
  if (p.startsWith("packages/bun-agent-plugin/"))
    gates.push(["bun", "scripts/aphrody/agent-plugin.ts", "generate", "--check"]);
  if (/^(docs\/|\.claude\/skills\/)/.test(p)) gates.push(["bun", "scripts/aphrody/agent-audit.ts"]);
  return gates;
}

export function gatesFor(root: string, paths: string[]): string[][] {
  const seen = new Map<string, string[]>();
  for (const path of paths) for (const g of gateFor(root, path)) seen.set(g.join("\0"), g);
  return [...seen.values()];
}

async function runGates(root: string, gates: string[][]): Promise<{ cmd: string; code: number }[]> {
  const results: { cmd: string; code: number }[] = [];
  for (const g of gates) {
    const proc = Bun.spawn({ cmd: g, cwd: root, stdout: "inherit", stderr: "inherit", windowsHide: true });
    const code = await proc.exited;
    results.push({ cmd: g.join(" "), code });
    if (code !== 0) break;
  }
  return results;
}

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

export async function main(args: string[]): Promise<number> {
  const root = repoRoot();
  const [cmd, ...rest] = args;
  const lots = loadQueue(root);
  switch (cmd) {
    case "status": {
      const dirty = dirtyPaths(root);
      const byOwner: Record<string, number> = {};
      for (const d of dirty) byOwner[ownerOf(d, lots)] = (byOwner[ownerOf(d, lots)] ?? 0) + 1;
      const counts = git(root, "rev-list", "--left-right", "--count", "origin/main...HEAD").out.trim();
      const findings = audit(root, "origin/main");
      console.log(
        JSON.stringify(
          {
            behindAhead: counts,
            dirty: byOwner,
            lots: lots.map(l => `${l.id}:${l.status}`),
            findings: findings.length,
          },
          null,
          2,
        ),
      );
      return 0;
    }
    case "next": {
      const lot = nextLot(lots);
      if (!lot) return 3;
      console.log(JSON.stringify(lot, null, 2));
      return 0;
    }
    case "gate": {
      const paths = rest.length ? rest : dirtyPaths(root);
      const results = await runGates(root, gatesFor(root, paths));
      console.log(JSON.stringify(results, null, 2));
      return results.some(r => r.code !== 0) ? 1 : 0;
    }
    case "ship": {
      const id = flag(rest, "--lot");
      const msg = flag(rest, "-m");
      if (!msg) return (console.error("ship: -m requis"), 2);
      if (ATTRIBUTION.test(msg)) return (console.error("ship: message avec attribution refusé"), 2);
      const lot = lots.find(l => l.id === id);
      const explicit = rest.filter((a, i) => !a.startsWith("-") && rest[i - 1] !== "--lot" && rest[i - 1] !== "-m");
      const paths = explicit.length ? explicit : (lot?.paths ?? []);
      if (!paths.length) return (console.error("ship: aucun chemin (--lot connu ou chemins explicites)"), 2);
      const results = await runGates(root, gatesFor(root, paths));
      if (results.some(r => r.code !== 0)) return (console.error("ship: gate rouge, rien commité"), 1);
      const add = git(root, "add", "--", ...paths);
      if (add.code !== 0) return (console.error(add.err), 1);
      const commit = git(root, "commit", "-m", msg, "--", ...paths);
      if (commit.code !== 0) return (console.error(commit.out + commit.err), 1);
      const sha = git(root, "rev-parse", "HEAD").out.trim();
      const push = git(root, "push", "origin", "HEAD:main");
      if (push.code !== 0) return (console.error(push.err), 1);
      git(root, "fetch", "-q", "origin");
      const contains = git(root, "branch", "-r", "--contains", sha).out;
      if (!/origin\/main/.test(contains)) return (console.error(`ship: ${sha} absent de origin/main`), 1);
      const mine = auditCommits(root, "origin/main~1").filter(f => f.check === "commit-attribution");
      console.log(JSON.stringify({ sha, onOriginMain: true, attribution: mine.length }));
      return 0;
    }
    case "mark": {
      const [id, status] = rest;
      const lot = lots.find(l => l.id === id);
      if (!lot || !["todo", "active", "done", "blocked"].includes(status))
        return (console.error("mark: ID inconnu ou statut invalide"), 2);
      lot.status = status as Status;
      saveQueue(root, lots);
      return 0;
    }
    case "refill": {
      const findings = audit(root, "origin/main").filter(f => f.check !== "unpushed");
      const fresh = findings.map((f, i) => ({
        id: `audit-${f.check}-${i}`,
        goal: `${f.check}: ${f.where} ${f.detail}`,
        paths: [f.where],
        status: "todo" as Status,
      }));
      const known = new Set(lots.map(l => l.goal));
      const added = fresh.filter(l => !known.has(l.goal));
      saveQueue(root, [...lots, ...added]);
      console.log(`${added.length} lot(s) ajouté(s)`);
      return added.length ? 0 : 3;
    }
    default:
      console.error("usage: work.ts status|next|gate|ship|mark|refill");
      return 2;
  }
}

if (import.meta.main) process.exit(await main(Bun.argv.slice(2)));
