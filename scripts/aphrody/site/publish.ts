// Publie le site aphrody.com depuis origin/main d'aphrody-labs/bun (lancé sur le VPS, depuis un checkout du fork) :
// git fetch, `git archive` de docs/ bench/ scripts/aphrody/ dans un dossier temporaire, rapports perf du dernier
// run réussi d'aphrody-perf.yml (gh), releases GitHub, build.ts de l'arbre extrait, puis envoi par tar sur
// `ssh <host>` dans <base>/releases/<UTC>-<sha12> et bascule atomique de <base>/current (5 releases gardées).
//
//   bun scripts/aphrody/site/publish.ts [--ref origin/main] [--to ssh:dbfr | local:<base>] [--keep 5]
//       [--perf <dossier> | --no-perf] [--offline] [--dry-run]
//   bun scripts/aphrody/site/publish.ts rollback [--to ...] [--release <id>]   # défaut : la release précédente
//   bun scripts/aphrody/site/publish.ts status [--to ...]
//
// Côté serveur, aphrody-downloads (C:\aphrody packages/infra/workspace/src/downloads/server.ts) sert
// <base>/current pour les hôtes aphrody.com et www.aphrody.com. Chaque action est journalisée dans
// ~/.coord-dbfr.log de l'hôte cible.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export const DEFAULT_BASE = "/srv/aphrody-downloads/site";
const REPO = "aphrody-labs/bun";

export type Target = { kind: "ssh"; host: string; base: string } | { kind: "local"; base: string };

export function parseTarget(spec: string, base = DEFAULT_BASE): Target {
  if (spec.startsWith("local:")) return { kind: "local", base: resolve(spec.slice(6)) };
  const host = spec.replace(/^ssh:/, "");
  if (!/^[\w.@-]+$/.test(host)) throw new Error(`hôte invalide : ${spec}`);
  return { kind: "ssh", host, base };
}

export const releaseId = (sha: string, now = new Date()) =>
  `${now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+Z$/, "Z")}-${sha.slice(0, 12)}`;

const shq = (s: string) => `'${s.replaceAll("'", `'\\''`)}'`;

/** Script shell de bascule : vérifie site.json, flip atomique de current, purge au-delà de `keep`, journal. */
export function flipScript(base: string, id: string, keep: number, note: string, log = true): string {
  return `set -eu
base=${shq(base)}; id=${shq(id)}
test -f "$base/releases/$id/site.json" || { echo "release incomplète : $id" >&2; exit 1; }
ln -sfn "releases/$id" "$base/.current.tmp"
mv -Tf "$base/.current.tmp" "$base/current"
cur=$id
ls -1 "$base/releases" | grep -v '^\\.' | sort -r | tail -n +${keep + 1} | while read -r old; do
  [ "$old" = "$cur" ] || rm -rf -- "$base/releases/$old"
done
${log ? `echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) site aphrody.com : ${note.replaceAll('"', "'")} -> $id" >> "$HOME/.coord-dbfr.log"` : ":"}
readlink "$base/current"`;
}

function run(cmd: string[], opts: { cwd?: string; stdin?: Blob | "inherit" } = {}): string {
  const r = Bun.spawnSync(cmd, { cwd: opts.cwd, stdin: opts.stdin ?? "ignore", stdout: "pipe", stderr: "pipe" });
  if (!r.success) throw new Error(`${cmd.slice(0, 3).join(" ")} : ${r.stderr.toString().trim() || r.exitCode}`);
  return r.stdout.toString().trim();
}

function remote(target: Target, script: string, stdin?: Blob): string {
  if (target.kind === "local") return run(["sh", "-c", script], { stdin });
  return run(["ssh", "-o", "BatchMode=yes", target.host, `sh -c ${shq(script)}`], { stdin });
}

function listReleases(target: Target): { current: string; releases: string[] } {
  const out = remote(
    target,
    `base=${shq(target.base)}; readlink "$base/current" 2>/dev/null || echo; ls -1 "$base/releases" 2>/dev/null | grep -v '^\\.' | sort || true`,
  ).split("\n");
  return { current: (out[0] ?? "").replace(/^releases\//, ""), releases: out.slice(1).filter(Boolean) };
}

async function latestPerf(dir: string): Promise<string | undefined> {
  const list = JSON.parse(
    run([
      "gh",
      "run",
      "list",
      "-R",
      REPO,
      "-w",
      "aphrody-perf.yml",
      "--status",
      "success",
      "-L",
      "1",
      "--json",
      "databaseId,url",
    ]),
  ) as { databaseId: number; url: string }[];
  if (!list[0]) return;
  run(["gh", "run", "download", String(list[0].databaseId), "-R", REPO, "-D", dir]);
  return list[0].url;
}

async function publish(args: string[], target: Target) {
  const option = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const repoDir = resolve(import.meta.dir, "..", "..", "..");
  const ref = option("--ref") ?? "origin/main";
  const keep = Number(option("--keep") ?? 5);
  if (ref.startsWith("origin/")) run(["git", "-C", repoDir, "fetch", "-q", "origin", ref.slice(7)]);
  const sha = run(["git", "-C", repoDir, "rev-parse", `${ref}^{commit}`]);
  const work = mkdtempSync(join(tmpdir(), "aphrody-site-"));
  try {
    const src = join(work, "src");
    const out = join(work, "out");
    run(["mkdir", "-p", src]);
    const archive = Bun.spawnSync([
      "git",
      "-C",
      repoDir,
      "archive",
      sha,
      "docs",
      "bench",
      "scripts/aphrody",
      "package.json",
    ]);
    if (!archive.success) throw new Error(`git archive : ${archive.stderr.toString()}`);
    run(["tar", "-x", "-C", src], { stdin: new Blob([archive.stdout]) });

    const build = ["bun", join(src, "scripts/aphrody/site/build.ts"), "--src", src, "--out", out, "--commit", sha];
    let perf = option("--perf");
    let perfRun: string | undefined;
    if (!perf && !args.includes("--no-perf")) {
      perf = join(work, "perf");
      try {
        perfRun = await latestPerf(perf);
      } catch (error) {
        console.warn(`perf : ${(error as Error).message} (page benchmarks sans mesures)`);
        perf = undefined;
      }
    }
    if (perf) build.push("--perf", perf);
    if (perfRun) build.push("--perf-run", perfRun);
    if (args.includes("--offline")) build.push("--offline");
    console.log(run(build, { cwd: src }));

    const id = releaseId(sha);
    if (args.includes("--dry-run")) return console.log(`dry-run : ${out} prêt pour ${id}`);
    const tar = Bun.spawnSync(["tar", "-cz", "-C", out, "."]);
    if (!tar.success) throw new Error(`tar : ${tar.stderr.toString()}`);
    const incoming = `${target.base}/releases/.incoming-${id}`;
    remote(
      target,
      `set -eu; mkdir -p ${shq(incoming)}; tar -xz -C ${shq(incoming)}; chmod -R a+rX ${shq(incoming)}; mv ${shq(incoming)} ${shq(`${target.base}/releases/${id}`)}`,
      new Blob([tar.stdout]),
    );
    const current = remote(
      target,
      flipScript(target.base, id, keep, `publication ${REPO}@${sha.slice(0, 12)}`, target.kind === "ssh"),
    );
    console.log(`publié : ${current} (${(tar.stdout.length / 1048576).toFixed(1)} Mio compressés)`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

function rollback(args: string[], target: Target) {
  const i = args.indexOf("--release");
  const { current, releases } = listReleases(target);
  const to = i >= 0 ? args[i + 1]! : releases.filter(r => r < current).at(-1);
  if (!to || !releases.includes(to)) throw new Error(`aucune release cible (courante ${current || "aucune"})`);
  console.log(
    remote(
      target,
      flipScript(target.base, to, Number.MAX_SAFE_INTEGER, `rollback depuis ${current}`, target.kind === "ssh"),
    ),
  );
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const command = args[0] && !args[0].startsWith("--") ? args.shift()! : "publish";
  const toIndex = args.indexOf("--to");
  const target = parseTarget(toIndex >= 0 ? args[toIndex + 1]! : "ssh:dbfr");
  if (command === "publish") await publish(args, target);
  else if (command === "rollback") rollback(args, target);
  else if (command === "status") console.log(JSON.stringify(listReleases(target), null, 2));
  else throw new Error(`commande inconnue : ${command} (publish, rollback, status)`);
}
