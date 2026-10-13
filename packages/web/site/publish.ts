// Publie le site du runtime, https://aphrody.app, depuis origin/main d'aphrody-labs/bun (timer systemd du VPS ou
// poste local) : git fetch, `git archive` de docs/ bench/ packages/web/ packages/bun-cloudflare/ dans un dossier
// temporaire, collect.ts (site-data.json : runtime et APHRODY.md, organisation GitHub), rapports perf du dernier run
// réussi d'aphrody-perf.yml (gh), releases GitHub, build.ts de l'arbre extrait, puis déploiement Cloudflare : assets
// statiques du Worker aphrody-app (packages/web/cloudflare, API sous /api) via scripts/deploy.ts.
// Identifiants : ~/.aphrody/config/cloudflare.env de l'hôte (CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, APP_SECRET).
//
//   bun packages/web/site/publish.ts [--git <checkout du fork>] [--ref origin/main]
//       [--distribution <checkout aphrody-labs/aphrody>] [--distribution-ref origin/main]
//       [--perf <dossier> | --no-perf] [--offline] [--dry-run] [--if-changed]
// Sans --distribution, c'est le site du runtime seul ; --distribution ajoute les pages de la distribution.
// --if-changed ne fait rien si ${ORIGIN}/publish.json porte déjà le même commit, la même release, le même run perf et
// la même empreinte de données ; une collecte en erreur (réseau, jeton GitHub absent) n'y publie rien.
//   bun packages/web/site/publish.ts rollback [--version <id>]   # wrangler rollback, défaut : version précédente
//   bun packages/web/site/publish.ts status                      # wrangler deployments list
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export const ORIGIN = "https://aphrody.app";
const REPO = "aphrody-labs/bun";
const APP = "packages/web/cloudflare";

let windowsToolchainReady = false;

async function nativeBun(): Promise<string> {
  if (process.platform === "win32" && !windowsToolchainReady) {
    const windows = (await import("bun:windows")).default;
    const toolchain = windows.toolchain();
    if (toolchain.error) throw new Error(`bun:windows toolchain : ${toolchain.error}`);
    windowsToolchainReady = true;
  }
  return process.execPath;
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

/** Lance une commande en héritant de la sortie (wrangler, bun install) ; échoue sur code non nul. */
async function live(cmd: string[], cwd: string) {
  const proc = Bun.spawn({ cmd, cwd, stdio: ["ignore", "inherit", "inherit"] });
  if ((await proc.exited) !== 0) throw new Error(`${cmd.slice(0, 3).join(" ")} : code ${proc.exitCode}`);
}

/**
 * Ce qui détermine le contenu publié : rien n'est republié tant que ces valeurs ne changent pas. `data` est
 * l'empreinte de site-data.json (collect.ts) hors date de collecte.
 */
export type Stamp = {
  commit: string;
  release: string | null;
  perfRun: number | null;
  data?: string | null;
};
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
    '[.[] | select((.draft | not) and (.tag_name | test("^(bun-v|aphrody-v)")))][0] | "\\(.tag_name)#\\(.assets | length)"',
  ]);
  return out && out !== "null" ? out : null;
}

async function remoteStamp(): Promise<Stamp | null> {
  try {
    const res = await fetch(`${ORIGIN}/publish.json`, { headers: { "Cache-Control": "no-cache" } });
    return res.ok ? ((await res.json()) as Stamp) : null;
  } catch {
    return null;
  }
}

async function publish(args: string[]) {
  const bun = await nativeBun();
  const option = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const repoDir = resolve(option("--git") ?? join(import.meta.dir, "..", "..", ".."));
  const ref = option("--ref") ?? "origin/main";
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

  // Monorepo de la distribution : seulement sur demande (--distribution), le site publié est celui du runtime.
  const distOption = option("--distribution");
  const distDir = distOption ? resolve(distOption) : null;
  const distRef = option("--distribution-ref") ?? "origin/main";
  let distSha: string | null = null;
  if (distDir) {
    if (distRef.startsWith("origin/")) run(["git", "-C", distDir, "fetch", "-q", "origin", distRef.slice(7)]);
    distSha = run(["git", "-C", distDir, "rev-parse", `${distRef}^{commit}`]);
  }

  const work = mkdtempSync(join(tmpdir(), "aphrody-site-"));
  try {
    const src = join(work, "src");
    const out = join(work, "out");
    mkdirSync(src, { recursive: true });
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
      APP,
    ]);
    if (!archive.success) throw new Error(`git archive : ${archive.stderr.toString()}`);
    run(["tar", "-x", "-C", src], { stdin: new Blob([archive.stdout]) });

    // Données du site (collect.ts de l'arbre extrait) : runtime au commit publié, distribution, organisation.
    const dataFile = join(work, "site-data.json");
    const collect = [
      bun,
      join(src, "packages/web/site/collect.ts"),
      "--out",
      dataFile,
      "--runtime",
      repoDir,
      "--runtime-ref",
      sha,
    ];
    if (distDir && distSha) collect.push("--distribution", distDir, "--distribution-ref", distSha);
    else collect.push("--downloads", "none");
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
    if (ifChanged && sameStamp(await remoteStamp(), stamp)) {
      console.log(
        `à jour : ${sha.slice(0, 12)}, distribution ${distSha?.slice(0, 12) ?? "aucune"}, release ${stamp.release ?? "aucune"}, perf ${stamp.perfRun ?? "aucun"}, données ${stamp.data}`,
      );
      return;
    }

    const build = [
      bun,
      join(src, "packages/web/site/build.ts"),
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

    const app = join(src, APP);
    await live([bun, "install", "--frozen-lockfile"], app);
    const deploy = [bun, join(app, "scripts/deploy.ts"), "--assets", out, "--tag", sha.slice(0, 12)];
    deploy.push("--message", `${REPO}@${sha.slice(0, 12)}`);
    if (args.includes("--dry-run")) deploy.push("--dry-run");
    await live(deploy, app);
    console.log(`publié : ${ORIGIN} (${REPO}@${sha.slice(0, 12)})`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

/** wrangler (rollback, deployments) dans le paquet du checkout, identifiants du deploy.ts. */
async function wranglerCommand(args: string[]) {
  const pkg = join(import.meta.dir, "..", "..", "..", APP);
  const { envFile, parseEnv } = await import(join(pkg, "scripts/deploy.ts"));
  const { wrangler } = await import(join(pkg, "..", "..", "bun-cloudflare", "src", "wrangler.ts"));
  const env = parseEnv(readFileSync(envFile(), "utf8"));
  const code = await wrangler(args, { cwd: pkg, env }).exited;
  if (code !== 0) process.exit(code);
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const command = args[0] && !args[0].startsWith("--") ? args.shift()! : "publish";
  const option = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
  if (command === "publish") await publish(args);
  else if (command === "rollback") {
    const version = option("--version");
    await wranglerCommand(["rollback", ...(version ? [version] : []), "--yes", "--message", "publish.ts rollback"]);
  } else if (command === "status") await wranglerCommand(["deployments", "list"]);
  else throw new Error(`commande inconnue : ${command} (publish, rollback, status)`);
}
