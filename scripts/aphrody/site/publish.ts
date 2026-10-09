// Publie le site aphrody.com depuis origin/main d'aphrody-labs/bun (lancé sur le VPS, depuis un checkout du fork) :
// git fetch du fork et du monorepo de la distribution, `git archive` de docs/ bench/ scripts/aphrody/ dans un
// dossier temporaire, collect.ts (site-data.json : runtime, distribution, organisation GitHub, downloads), rapports
// perf du dernier run réussi d'aphrody-perf.yml (gh), releases GitHub, build.ts de l'arbre extrait, puis envoi par
// tar sur `ssh <host>` dans <base>/releases/<UTC>-<sha12> et bascule atomique de <base>/current (5 releases gardées).
//
//   bun scripts/aphrody/site/publish.ts [--git <checkout du fork>] [--ref origin/main] [--to ssh:dbfr | local:<base>] [--keep 5]
//       [--distribution <checkout aphrody-labs/aphrody> | --no-distribution] [--distribution-ref origin/main]
//       [--perf <dossier> | --no-perf] [--offline] [--dry-run] [--if-changed]
// Le checkout de la distribution est par défaut le voisin `aphrody` du checkout du fork.
// --if-changed ne fait rien si <base>/current/publish.json porte déjà le même commit, la même release, le même run
// perf et la même empreinte de données ; une collecte en erreur (réseau, jeton GitHub absent) n'y publie rien.
//   bun scripts/aphrody/site/publish.ts rollback [--to ...] [--release <id>]   # défaut : la release précédente
//   bun scripts/aphrody/site/publish.ts status [--to ...]
//
// Côté serveur, aphrody-downloads (C:\aphrody packages/infra/workspace/src/downloads/server.ts) sert
// <base>/current pour les hôtes aphrody.com et www.aphrody.com. Chaque action est journalisée dans
// ~/.coord-dbfr.log de l'hôte cible.
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export const DEFAULT_BASE = "/home/ubuntu/apps/downloads/site";
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
  const r = Bun.spawnSync(cmd, {
    cwd: opts.cwd,
    stdin: opts.stdin ?? "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
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
  return {
    current: (out[0] ?? "").replace(/^releases\//, ""),
    releases: out.slice(1).filter(Boolean),
  };
}

/**
 * Ce qui détermine le contenu publié : rien n'est republié tant que ces valeurs ne changent pas. `data` est
 * l'empreinte de site-data.json (collect.ts) hors date de collecte.
 */
export type Stamp = { commit: string; release: string | null; perfRun: number | null; data?: string | null };
export const sameStamp = (a: Stamp | null, b: Stamp) =>
  !!a &&
  a.commit === b.commit &&
  a.release === b.release &&
  a.perfRun === b.perfRun &&
  (a.data ?? null) === (b.data ?? null);

/** Empreinte des données collectées, sans leur date de collecte. */
export function dataDigest(json: string): string {
  const { generatedAt: _, ...rest } = JSON.parse(json);
  return new Bun.CryptoHasher("sha256").update(JSON.stringify(rest)).digest("hex").slice(0, 16);
}

function latestPerfRun(): { id: number; url: string } | null {
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
  return list[0] ? { id: list[0].databaseId, url: list[0].url } : null;
}

/** Dernière release publiée du fork (`aphrody-v*`, hors brouillon) et son nombre d'assets, ou null. */
function latestRelease(): string | null {
  const out = run([
    "gh",
    "api",
    `repos/${REPO}/releases?per_page=20`,
    "--jq",
    '[.[] | select((.draft | not) and (.tag_name | startswith("aphrody-v")))][0] | "\\(.tag_name)#\\(.assets | length)"',
  ]);
  return out && out !== "null" ? out : null;
}

function remoteStamp(target: Target): Stamp | null {
  try {
    return JSON.parse(remote(target, `cat ${shq(`${target.base}/current/publish.json`)} 2>/dev/null || echo null`));
  } catch {
    return null;
  }
}

async function publish(args: string[], target: Target) {
  const option = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const repoDir = resolve(option("--git") ?? join(import.meta.dir, "..", "..", ".."));
  const ref = option("--ref") ?? "origin/main";
  const keep = Number(option("--keep") ?? 5);
  const ifChanged = args.includes("--if-changed");
  if (ref.startsWith("origin/")) run(["git", "-C", repoDir, "fetch", "-q", "origin", ref.slice(7)]);
  const sha = run(["git", "-C", repoDir, "rev-parse", `${ref}^{commit}`]);

  // En mode --if-changed, une requête GitHub en échec arrête tout plutôt que de publier un site dégradé.
  const query = <T>(what: string, fn: () => T): T | null => {
    try {
      return fn();
    } catch (error) {
      if (ifChanged) throw error;
      console.warn(`${what} : ${(error as Error).message}`);
      return null;
    }
  };
  const perfRun = option("--perf") || args.includes("--no-perf") ? null : query("perf", latestPerfRun);

  // Monorepo de la distribution : checkout voisin du fork (…/src/aphrody à côté de …/src/bun) par défaut.
  const sibling = join(repoDir, "..", "aphrody");
  const distOption = option("--distribution");
  const distDir = args.includes("--no-distribution")
    ? null
    : distOption
      ? resolve(distOption)
      : existsSync(join(sibling, ".git"))
        ? sibling
        : null;
  const distRef = option("--distribution-ref") ?? "origin/main";
  if (!distDir && !args.includes("--no-distribution") && ifChanged)
    throw new Error(`checkout de la distribution introuvable (${sibling}) : --distribution <dir> ou --no-distribution`);
  let distSha: string | null = null;
  if (distDir) {
    if (distRef.startsWith("origin/")) run(["git", "-C", distDir, "fetch", "-q", "origin", distRef.slice(7)]);
    distSha = run(["git", "-C", distDir, "rev-parse", `${distRef}^{commit}`]);
  }

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

    // Données du site (collect.ts de l'arbre extrait) : runtime au commit publié, distribution, organisation.
    const dataFile = join(work, "site-data.json");
    const collect = [
      "bun",
      join(src, "scripts/aphrody/site/collect.ts"),
      "--out",
      dataFile,
      "--runtime",
      repoDir,
      "--runtime-ref",
      sha,
    ];
    if (distDir && distSha) collect.push("--distribution", distDir, "--distribution-ref", distSha);
    if (args.includes("--offline")) collect.push("--offline");
    console.log(run(collect, { cwd: src }));
    const dataJson = readFileSync(dataFile, "utf8");
    const errors = (JSON.parse(dataJson).errors ?? []) as string[];
    if (errors.length) {
      if (ifChanged) throw new Error(`collecte incomplète, rien n'est publié : ${errors.join(" ; ")}`);
      for (const e of errors) console.warn(`collecte : ${e}`);
    }

    const stamp: Stamp = {
      commit: sha,
      release: args.includes("--offline") ? null : query("releases", latestRelease),
      perfRun: perfRun?.id ?? null,
      data: dataDigest(dataJson),
    };
    if (ifChanged && sameStamp(remoteStamp(target), stamp)) {
      console.log(
        `à jour : ${sha.slice(0, 12)}, distribution ${distSha?.slice(0, 12) ?? "aucune"}, release ${stamp.release ?? "aucune"}, perf ${stamp.perfRun ?? "aucun"}, données ${stamp.data}`,
      );
      return;
    }

    const build = [
      "bun",
      join(src, "scripts/aphrody/site/build.ts"),
      "--src",
      src,
      "--out",
      out,
      "--commit",
      sha,
      "--data",
      dataFile,
    ];
    let perf = option("--perf");
    if (perfRun) {
      perf = join(work, "perf");
      run(["gh", "run", "download", String(perfRun.id), "-R", REPO, "-D", perf]);
      build.push("--perf-run", perfRun.url);
    }
    if (perf) build.push("--perf", perf);
    if (args.includes("--offline")) build.push("--offline");
    console.log(run(build, { cwd: src }));
    writeFileSync(join(out, "publish.json"), JSON.stringify(stamp) + "\n");

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
