// Collecte les données du site bun.aphrody.com (runtime seul) ou de la distribution depuis les dépôts réels : rien de ce qui décrit un produit, un composant,
// une version ou un chiffre n'est écrit à la main dans les gabarits (pages.ts, build.ts), tout vient d'ici.
//
//   bun scripts/aphrody/site/collect.ts --out site-data.json
//       [--runtime <checkout aphrody-labs/bun>] [--runtime-ref HEAD]
//       [--distribution <checkout aphrody-labs/aphrody>] [--distribution-ref HEAD]
//       [--org aphrody-labs] [--fork-author contact@aphrody.com] [--downloads <url de latest.json> | none] [--offline]
//
// Sources :
//   runtime       objets Git du fork (git log, ls-tree, cat-file ; jamais le worktree) : commits du fork, pages de
//                 docs, modules bun:*, implémentations de commandes et paquets ajoutés, image Docker, paquet npm
//   distribution  objets Git du monorepo : tools/config/docs/root.json (texte produit), workspace Cargo, paquets
//                 Bun, m3/, provenance (tools/config/upstream-sources.json), catalogue des téléchargements
//                 (tools/config/downloads.json), IDENTITY.md, SECURITY.md, CONTRIBUTING.md
//   réseau        GitHub GraphQL (dépôts de l'organisation, releases), registre npm (@aphrody/*),
//                 downloads.aphrody.com/latest.json (artefacts publiés), ghcr.io (image tirable ou non)
// Les dépôts privés de l'organisation ne sont que comptés ; seuls la visibilité du monorepo et du runtime est notée.

const SEP = "\x1f";

export type Commit = { sha: string; date: string; subject: string };
export type DocPage = { slug: string; title: string; description: string };
export type Upstream = { name: string; url: string };
export type Component = {
  name: string;
  path: string;
  version: string;
  description: string;
  license: string;
  upstream?: Upstream;
  private?: boolean;
  npm?: string;
};
export type OrgRepo = {
  name: string;
  url: string;
  description: string;
  fork: boolean;
  archived: boolean;
  upstream?: Upstream;
  license: string;
  language: string;
  release?: { tag: string; date: string; url: string };
  branch: string;
  /** Composants (ou fichiers) du runtime et de la distribution qui citent `aphrody-labs/<nom>`. */
  usedBy: { repo: string; path: string; name?: string }[];
};
export type DistributionRelease = { tag: string; name: string; date: string };
export type Artifact = {
  name: string;
  version: string;
  platform: string;
  kind: string;
  url: string;
  sha256: string;
  size: number;
};
export type Installer = { file: string; source: string; usage: string[] };
export type CatalogueEntry = {
  id: string;
  kind: string;
  description: string;
  platforms: { platform: string; enabled: boolean }[];
};
export type Visibility = "public" | "private" | "unknown";

export type SiteData = {
  schemaVersion: 1;
  generatedAt: string;
  runtime: {
    repo: string;
    visibility: Visibility;
    commit: string;
    date: string;
    /** Fichier de licence du dépôt et licences qu'il déclare (le runtime, puis JavaScriptCore/WebKit). */
    license: string;
    licenses: string[];
    upstream: Upstream & { version: string };
    commits: {
      count: number;
      first: string;
      types: [string, number][];
      scopes: [string, number][];
      recent: Commit[];
    };
    lastUpstreamMerge: Commit | null;
    docs: { added: DocPage[]; modified: DocPage[] };
    modules: string[];
    commands: string[];
    packages: Component[];
    /** Paquets `bun:windows` générés (une famille par DLL) : regroupés, la liste complète est dans `names`. */
    windowsBindings: {
      count: number;
      versions: string[];
      licenses: string[];
      source: string;
      names: string[];
    } | null;
    npm: { name: string; version?: string } | null;
    image: { name: string; dockerfile: string; release: string; pull: string } | null;
    /** APHRODY.md du fork (rôle, patches, amont, releases) : sections de l'accueil de bun.aphrody.com. */
    guide: string;
  } | null;
  distribution: {
    repo: string;
    visibility: Visibility;
    commit: string;
    date: string;
    summary: string;
    sections: { id: string; title: string; markdown: string }[];
    documents: Record<string, string>;
    workspace: { version: string; license: string; rust: string };
    crates: Component[];
    packages: Component[];
    m3: {
      packages: Component[];
      elements: string[];
      primitives: string[];
      tokens: [string, number][];
      templates: string[];
      uiCrates: string[];
    };
    installers: Installer[];
    catalogue: CatalogueEntry[];
    releases: DistributionRelease[];
  } | null;
  downloads: {
    release: string;
    commit: string;
    generatedAt: string;
    baseUrl: string;
    artifacts: Artifact[];
    notes: string[];
  } | null;
  org: { login: string; public: OrgRepo[]; privateCount: number } | null;
  /** Défauts des sources (description absente, licence non déclarée, vocabulaire publicitaire, texte retenu). */
  warnings: string[];
  /** Sources réseau en échec : la publication --if-changed refuse un site construit sans elles. */
  errors: string[];
};

// ---------------------------------------------------------------------------------------------------------------
// Git : lecture des objets d'un ref, sans toucher au worktree (les checkouts du VPS sont partiels, blob:none)

export function git(repo: string, args: string[], input?: string, env?: Record<string, string>): string {
  const r = Bun.spawnSync(["git", "-C", repo, ...args], {
    stdin: input === undefined ? "ignore" : new Blob([input]),
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, ...env },
  });
  if (!r.success) throw new Error(`git ${args.slice(0, 2).join(" ")} (${repo}) : ${r.stderr.toString().trim()}`);
  return r.stdout.toString();
}

export class GitTree {
  readonly sha: string;
  readonly date: string;
  readonly files = new Map<string, string>();
  constructor(
    readonly repo: string,
    ref: string,
  ) {
    [this.sha, this.date] = git(repo, ["log", "-1", `--format=%H${SEP}%cI`, ref])
      .trim()
      .split(SEP) as [string, string];
    for (const entry of git(repo, ["ls-tree", "-r", "-z", "--full-tree", this.sha]).split("\0")) {
      const m = /^\d+ blob ([0-9a-f]+)\t(.+)$/s.exec(entry);
      if (m) this.files.set(m[2]!, m[1]!);
    }
  }
  has(path: string) {
    return this.files.has(path);
  }
  list(pattern: string): string[] {
    const glob = new Bun.Glob(pattern);
    return [...this.files.keys()].filter(p => glob.match(p)).sort();
  }
  /** Contenu texte de plusieurs fichiers en un seul `git cat-file --batch` (après un fetch groupé des blobs absents). */
  read(paths: string[]): Map<string, string> {
    const wanted = [...new Set(paths)].filter(p => this.files.has(p));
    const out = new Map<string, string>();
    if (!wanted.length) return out;
    const oids = wanted.map(p => this.files.get(p)!);
    this.prefetch(oids);
    const r = Bun.spawnSync(["git", "-C", this.repo, "cat-file", "--batch"], {
      stdin: new Blob([oids.join("\n") + "\n"]),
      stdout: "pipe",
      stderr: "pipe",
    });
    if (!r.success) throw new Error(`git cat-file (${this.repo}) : ${r.stderr.toString().trim()}`);
    const buf = r.stdout;
    const decoder = new TextDecoder();
    let at = 0;
    for (const path of wanted) {
      const nl = buf.indexOf(10, at);
      const header = decoder.decode(buf.subarray(at, nl));
      const size = Number(header.split(" ")[2]);
      if (!Number.isFinite(size)) throw new Error(`git cat-file : ${header}`);
      out.set(path, decoder.decode(buf.subarray(nl + 1, nl + 1 + size)));
      at = nl + 1 + size + 1;
    }
    return out;
  }
  text(path: string): string | undefined {
    return this.read([path]).get(path);
  }
  private prefetch(oids: string[]) {
    let promisor = "";
    try {
      promisor = git(this.repo, ["config", "--get", "remote.origin.promisor"]).trim();
    } catch {}
    if (promisor !== "true") return;
    const check = git(this.repo, ["cat-file", "--batch-check"], oids.join("\n") + "\n", {
      GIT_NO_LAZY_FETCH: "1",
    });
    const missing = check
      .split("\n")
      .filter(l => l.endsWith(" missing"))
      .map(l => l.split(" ")[0]!);
    if (missing.length)
      git(
        this.repo,
        [
          "fetch",
          "-q",
          "origin",
          "--no-tags",
          "--no-write-fetch-head",
          "--recurse-submodules=no",
          "--filter=blob:none",
          "--stdin",
        ],
        missing.join("\n") + "\n",
      );
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Petits analyseurs

export function frontmatter(source: string): Record<string, unknown> {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source);
  if (!m) return {};
  try {
    return (Bun.YAML.parse(m[1]!) as Record<string, unknown>) ?? {};
  } catch {
    return {};
  }
}

/** `feat(site): ...` -> { type: "feat", scope: "site" }. */
export function conventional(subject: string): { type: string; scope: string } | null {
  const m = /^(\w+)(?:\(([^)]+)\))?!?:\s/.exec(subject);
  return m ? { type: m[1]!.toLowerCase(), scope: (m[2] ?? "").toLowerCase() } : null;
}

const count = (values: string[]): [string, number][] => {
  const map = new Map<string, number>();
  for (const v of values) map.set(v, (map.get(v) ?? 0) + 1);
  return [...map].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
};

/** Vocabulaire publicitaire : un composant dont la description en contient est signalé dans `warnings`. */
export const SLOP =
  /\b(blazing(ly)?|lightning[- ]fast|seamless(ly)?|powerful|revolutionar\w*|cutting[- ]edge|world[- ]class|effortless(ly)?|best[- ]in[- ]class|unparalleled|incredibl[ey]|supercharg\w*|game[- ]chang\w*|state[- ]of[- ]the[- ]art|ultimate|divine|sovereign|souverain\w*|next[- ]generation|high[- ]performance|industrial|unleash\w*|magical)\b/i;

/**
 * Profils et personnes privés (AGENTS.md : profils aphrody, dbfr et ie isolés) : une description du dépôt privé de la
 * distribution qui en nomme un n'est pas publiée, un avertissement demande de la corriger à la source.
 */
export const PRIVATE_TERMS = /\b(shenron|dragon ?ball|dbfr|iecode|niers?|omar)\b/i;

/** Licences déclarées en tête d'un LICENSE.md (`Bun itself is MIT-licensed`, `… which is LGPL-2 licensed`). */
export function declaredLicenses(text: string): string[] {
  const found = [...text.slice(0, 1500).matchAll(/\b([A-Z][\w.]*(?:-[\w.]+)*?)[- ]licensed\b/g)].map(m => m[1]!);
  return [...new Set(found)];
}

const spdxHeader = (text: string) =>
  /SPDX-License-Identifier:\s*([^\s*]+(?:\s+(?:OR|AND|WITH)\s+[^\s*]+)*)/.exec(
    text.split("\n").slice(0, 5).join("\n"),
  )?.[1] ?? "";

const oneLine = (s: unknown) =>
  String(s ?? "")
    .replace(/\s+/g, " ")
    .trim();

const githubName = (url: string) =>
  url
    .replace(/^git\+/, "")
    .replace(/^https:\/\/github\.com\//, "")
    .replace(/\.git$/, "")
    .replace(/\/$/, "");

/** `[package]` d'un Cargo.toml (champs `.workspace = true` résolus contre `[workspace.package]`). */
export function cargoPackage(toml: string, workspace: Record<string, any> = {}): Omit<Component, "path"> | null {
  let doc: any;
  try {
    doc = Bun.TOML.parse(toml);
  } catch {
    return null;
  }
  const p = doc.package;
  if (!p?.name) return null;
  const inherit = (v: any, key: string) => (v && typeof v === "object" && v.workspace ? workspace[key] : v);
  const repository = inherit(p.repository, "repository");
  return {
    name: String(p.name),
    version: String(inherit(p.version, "version") ?? ""),
    description: oneLine(inherit(p.description, "description")),
    license: String(inherit(p.license, "license") ?? "") || spdxHeader(toml),
    ...(p.publish === false ? { private: true } : {}),
    ...(repository && workspace.repository && repository !== workspace.repository
      ? { upstream: { name: githubName(String(repository)), url: String(repository) } }
      : {}),
  };
}

export function npmPackage(json: string): Omit<Component, "path"> | null {
  let j: any;
  try {
    j = JSON.parse(json);
  } catch {
    return null;
  }
  if (!j.name) return null;
  return {
    name: String(j.name),
    version: String(j.version ?? ""),
    description: oneLine(j.description),
    license: typeof j.license === "string" ? j.license : String(j.license?.type ?? ""),
    ...(j.private === true ? { private: true } : {}),
  };
}

/** Membres d'un workspace Cargo (`crates/ui/*`, chemins exacts, exclusions), relatifs à `base`, résolus contre l'arbre. */
export function cargoMembers(
  tree: GitTree,
  workspace: { members?: string[]; exclude?: string[] },
  base = "",
): string[] {
  const prefix = base ? `${base}/` : "";
  const exclude = new Set((workspace.exclude ?? []).map(e => prefix + e));
  const dirs = new Set<string>();
  for (const member of workspace.members ?? [])
    for (const file of tree.list(`${prefix}${member}/Cargo.toml`)) {
      const dir = file.slice(0, -"/Cargo.toml".length);
      if (!exclude.has(dir)) dirs.add(dir);
    }
  return [...dirs].sort();
}

/** Composants d'un dossier `packages/<nom>` : package.json, sinon Cargo.toml (`[package]` ou membres de `[workspace]`). */
function packageComponents(tree: GitTree, dir: string, texts: Map<string, string>): Component[] {
  const json = texts.get(`${dir}/package.json`);
  if (json !== undefined) {
    const c = npmPackage(json);
    return c ? [{ ...c, path: dir }] : [];
  }
  const toml = texts.get(`${dir}/Cargo.toml`);
  if (toml === undefined) return [];
  const own = cargoPackage(toml);
  if (own) return [{ ...own, path: dir }];
  let ws: any;
  try {
    ws = (Bun.TOML.parse(toml) as any).workspace;
  } catch {
    return [];
  }
  if (!ws) return [];
  const wsPackage = { ...ws.package, license: ws.package?.license ?? spdxHeader(toml) };
  const members = cargoMembers(tree, ws, dir);
  const memberTexts = tree.read(members.map(m => `${m}/Cargo.toml`));
  return members.flatMap(m => {
    const c = cargoPackage(memberTexts.get(`${m}/Cargo.toml`) ?? "", wsPackage);
    return c ? [{ ...c, path: m }] : [];
  });
}

/** Lignes d'usage en tête d'un script d'installation (`#   curl -fsSL ... | sh`, `#   irm ... | iex`). */
export function installerUsage(script: string): string[] {
  const usage: string[] = [];
  for (const line of script.split("\n").slice(0, 40)) {
    const m = /^#\s+((?:curl|irm|iwr|wget)\s.+)$/.exec(line.trim());
    if (m) usage.push(m[1]!.trim());
  }
  return usage;
}

// ---------------------------------------------------------------------------------------------------------------
// Runtime : aphrody-labs/bun

const WINDOWS_BINDINGS = /^@aphrody\/bun-windows-/;

export function collectRuntime(
  tree: GitTree,
  repo: string,
  author: string,
  warnings: string[],
): NonNullable<SiteData["runtime"]> {
  const noFetch = { GIT_NO_LAZY_FETCH: "1" };
  const log = (args: string[]) =>
    git(tree.repo, ["log", "--no-renames", ...args, tree.sha], undefined, noFetch)
      .split("\n")
      .filter(Boolean);
  const commits = log(["--no-merges", `--author=${author}`, `--format=%h${SEP}%cI${SEP}%s`]).map(line => {
    const [sha, date, subject] = line.split(SEP) as [string, string, string];
    return { sha, date, subject };
  });
  const merge = log(["--merges", "--grep=upstream/", "-1", `--format=%h${SEP}%cI${SEP}%s`])[0]?.split(SEP);
  const changed = (filter: string, ...paths: string[]) =>
    new Set(
      git(
        tree.repo,
        [
          "log",
          "--no-renames",
          "--no-merges",
          `--author=${author}`,
          `--diff-filter=${filter}`,
          "--name-only",
          "--format=",
          tree.sha,
          "--",
          ...paths,
        ],
        undefined,
        noFetch,
      )
        .split("\n")
        .filter(p => p && tree.has(p)),
    );
  const added = changed("A", "docs", "packages", "src/js/bun", "src/runtime/cli");
  const modified = changed("M", "docs");

  const pkg = JSON.parse(tree.text("package.json") ?? "{}");
  const nav = JSON.parse(tree.text("docs/docs.json") ?? "{}");
  const navSlugs: string[] = [];
  const walk = (pages: any[]) => {
    for (const p of pages ?? [])
      if (typeof p === "string") navSlugs.push(p.replace(/^\//, ""));
      else walk(p.pages);
  };
  for (const tab of nav.navigation?.tabs ?? []) {
    walk(tab.pages);
    for (const g of tab.groups ?? []) walk(g.pages);
  }
  const docFile = (slug: string) => [`docs/${slug}.mdx`, `docs/${slug}.md`].find(f => tree.has(f));
  const pageFiles = new Map(navSlugs.map(s => [s, docFile(s)] as const).filter((e): e is [string, string] => !!e[1]));
  const contents = tree.read([...pageFiles.values()].filter(f => added.has(f) || modified.has(f)));
  const pages = (set: Set<string>) =>
    [...pageFiles]
      .filter(([, file]) => set.has(file))
      .map(([slug, file]) => {
        const fm = frontmatter(contents.get(file) ?? "");
        return { slug, title: oneLine(fm.title ?? slug), description: oneLine(fm.description) };
      });
  const addedDocs = pages(added);
  const addedSlugs = new Set(addedDocs.map(d => d.slug));

  const dirs = [
    ...new Set(
      [...added]
        .filter(p => /^packages\/[^/]+\/(package\.json|Cargo\.toml)$/.test(p))
        .map(p => p.slice(0, p.lastIndexOf("/"))),
    ),
  ].sort();
  const texts = tree.read(dirs.flatMap(d => [`${d}/package.json`, `${d}/Cargo.toml`]));
  const all = dirs.flatMap(d => packageComponents(tree, d, texts));
  const bindings = all.filter(c => WINDOWS_BINDINGS.test(c.name));
  const packages = all.filter(c => !WINDOWS_BINDINGS.test(c.name));

  const compose = tree.text("scripts/aphrody/deploy/docker/compose.yaml") ?? "";
  const dockerfile = "scripts/aphrody/deploy/docker/Dockerfile";
  const imageName = /image:\s*\$\{IMAGE:-([^}\s]+)\}/.exec(compose)?.[1];
  const release = /ARG BUN_RELEASE=(\S+)/.exec(tree.text(dockerfile) ?? "")?.[1] ?? "";
  const npmName = /export const RUNTIME_PACKAGE = "([^"]+)"/.exec(
    tree.text("scripts/aphrody/publish-runtime.ts") ?? "",
  )?.[1];

  const licenseFile = ["LICENSE.md", "LICENSE"].find(f => tree.has(f)) ?? "";
  for (const c of packages) {
    if (SLOP.test(c.description)) warnings.push(`${repo} ${c.path}: ${c.description}`);
    if (!c.description) warnings.push(`${repo} ${c.path}: no description`);
    if (!c.license) warnings.push(`${repo} ${c.path}: no license declared`);
  }
  return {
    repo,
    visibility: "unknown",
    commit: tree.sha,
    date: tree.date,
    license: licenseFile,
    licenses: declaredLicenses(tree.text(licenseFile) ?? ""),
    upstream: {
      name: "oven-sh/bun",
      url: "https://github.com/oven-sh/bun",
      version: String(pkg.version ?? ""),
    },
    commits: {
      count: commits.length,
      first: commits.at(-1)?.date ?? "",
      types: count(commits.map(c => conventional(c.subject)?.type ?? "other")),
      scopes: count(commits.flatMap(c => (conventional(c.subject)?.scope ?? "").split(/,\s*/).filter(Boolean))).slice(
        0,
        30,
      ),
      recent: commits.slice(0, 40),
    },
    lastUpstreamMerge: merge ? { sha: merge[0]!, date: merge[1]!, subject: merge[2]! } : null,
    docs: { added: addedDocs, modified: pages(modified).filter(d => !addedSlugs.has(d.slug)) },
    modules: [...added]
      .filter(p => /^src\/js\/bun\/[^/]+\.ts$/.test(p))
      .map(p => `bun:${p.slice("src/js/bun/".length, -3)}`)
      .sort(),
    commands: [...added].filter(p => /^src\/runtime\/cli\/[^/]+_command\.rs$/.test(p)).sort(),
    packages: packages.sort((a, b) => a.name.localeCompare(b.name)),
    windowsBindings: bindings.length
      ? {
          count: bindings.length,
          versions: [...new Set(bindings.map(b => b.version))].sort(),
          licenses: [...new Set(bindings.map(b => b.license))].sort(),
          source: bindings[0]!.description.replace(/^.*?generated from /, ""),
          names: bindings.map(b => b.name).sort(),
        }
      : null,
    npm: npmName ? { name: npmName } : null,
    image: imageName ? { name: imageName, dockerfile, release, pull: "not checked" } : null,
    guide: tree.text("APHRODY.md") ?? "",
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Distribution : aphrody-labs/aphrody

const DOCUMENTS: Record<string, string> = {
  identity: "docs/reference/ai/IDENTITY.md",
  security: "SECURITY.md",
  contributing: "CONTRIBUTING.md",
};

export function collectDistribution(
  tree: GitTree,
  repo: string,
  warnings: string[],
): NonNullable<SiteData["distribution"]> {
  const root = JSON.parse(tree.text("tools/config/docs/root.json") ?? "{}");
  const cargo = Bun.TOML.parse(tree.text("Cargo.toml") ?? "") as any;
  const ws = cargo.workspace ?? {};
  const wsPackage = ws.package ?? {};
  const provenance = JSON.parse(tree.text("tools/config/upstream-sources.json") ?? "{}");
  const integrated = new Map<string, Upstream>();
  for (const i of provenance.integrated ?? [])
    if (i.integratedPath && i.upstreamUrl)
      integrated.set(i.integratedPath, { name: githubName(i.upstreamUrl), url: i.upstreamUrl });

  const crateDirs = cargoMembers(tree, ws);
  const crateTexts = tree.read(crateDirs.map(d => `${d}/Cargo.toml`));
  const crates: Component[] = [];
  for (const dir of crateDirs) {
    const c = cargoPackage(crateTexts.get(`${dir}/Cargo.toml`) ?? "", wsPackage);
    if (!c) continue;
    const up = integrated.get(dir) ?? c.upstream;
    crates.push({ ...c, path: dir, ...(up ? { upstream: up } : {}) });
  }

  const pkgFiles = tree.list("packages/*/*/package.json");
  const m3Files = tree.list("m3/packages/*/package.json");
  const pkgTexts = tree.read([...pkgFiles, ...m3Files]);
  const fromNpm = (files: string[]) =>
    files.flatMap(file => {
      const c = npmPackage(pkgTexts.get(file) ?? "");
      return c ? [{ ...c, path: file.slice(0, -"/package.json".length) }] : [];
    });
  const packages = fromNpm(pkgFiles).sort((a, b) => a.path.localeCompare(b.path));
  const m3Packages = fromNpm(m3Files).sort((a, b) => a.name.localeCompare(b.name));

  const downloadsConfig = JSON.parse(tree.text("tools/config/downloads.json") ?? "{}");
  const installerFiles = Object.entries((downloadsConfig.assets ?? {}) as Record<string, string>).filter(([file]) =>
    /^install\.(sh|ps1)$/.test(file),
  );
  const docs = tree.read([
    ...Object.values(DOCUMENTS),
    ...installerFiles.map(([, source]) => source),
    "m3/packages/m3-react/md-elements.txt",
    "m3/packages/m3-tokens/src/m3-tokens.css",
  ]);
  const documents: Record<string, string> = {};
  for (const [key, path] of Object.entries(DOCUMENTS)) {
    const text = docs.get(path);
    if (text !== undefined) documents[key] = text.replace(/^(\s*<!--[\s\S]*?-->\s*)+/, "");
    else warnings.push(`${repo}: ${path} absent`);
  }
  const css = docs.get("m3/packages/m3-tokens/src/m3-tokens.css") ?? "";
  const tokenNames = new Set([...css.matchAll(/--md-sys-([a-z]+)-[\w-]+(?=\s*:)/g)].map(m => m[0]));

  const sections = ((root.readme?.sections ?? []) as any[])
    .filter(s => s.public)
    .map(s => ({
      id: String(s.id),
      title: String(s.title),
      markdown: (s.body as string[]).join("\n"),
    }));

  for (const c of [...crates, ...packages, ...m3Packages]) {
    if (PRIVATE_TERMS.test(c.description)) {
      warnings.push(`${repo} ${c.path}: description withheld (names a private profile)`);
      c.description = "";
    }
    if (SLOP.test(c.description)) warnings.push(`${repo} ${c.path}: ${c.description}`);
  }
  for (const [key, text] of Object.entries(documents))
    if (PRIVATE_TERMS.test(text)) warnings.push(`${repo} ${DOCUMENTS[key]}: names a private profile`);
  return {
    repo,
    visibility: "unknown",
    commit: tree.sha,
    date: tree.date,
    summary: String(root.readme?.summary ?? ""),
    sections,
    documents,
    workspace: {
      version: String(wsPackage.version ?? ""),
      license: String(wsPackage.license ?? ""),
      rust: String(wsPackage["rust-version"] ?? ""),
    },
    crates: crates.sort((a, b) => a.path.localeCompare(b.path)),
    packages,
    m3: {
      packages: m3Packages,
      elements: (docs.get("m3/packages/m3-react/md-elements.txt") ?? "")
        .split(/\r?\n/)
        .map(s => s.trim())
        .filter(s => s.startsWith("md-")),
      primitives: tree
        .list("m3/packages/m3-baseui/src/*.tsx")
        .map(p => p.slice(p.lastIndexOf("/") + 1, -4))
        .filter(n => n !== "index" && n !== "part"),
      tokens: count([...tokenNames].map(t => t.split("-")[4]!)),
      templates: [...new Set(tree.list("m3/templates/*/**").map(p => p.split("/")[2]!))].sort(),
      uiCrates: crates.filter(c => c.path.startsWith("crates/ui/")).map(c => c.name),
    },
    installers: installerFiles.map(([file, source]) => ({
      file,
      source,
      usage: installerUsage(docs.get(source) ?? ""),
    })),
    catalogue: ((downloadsConfig.artifacts ?? []) as any[]).map(a => ({
      id: String(a.id),
      kind: String(a.kind ?? ""),
      description: oneLine(a.description),
      platforms: ((a.platforms ?? []) as any[]).map(p => ({
        platform: String(p.platform),
        enabled: p.enabled !== false,
      })),
    })),
    releases: [],
  };
}

/** Pour chaque dépôt de l'organisation, les composants (ou fichiers) qui citent `aphrody-labs/<nom>`. */
export function usedBy(
  sources: { repo: string; tree: GitTree; patterns: string[]; components: Component[] }[],
  org: string,
  names: string[],
): Map<string, OrgRepo["usedBy"]> {
  const found = new Map<string, Map<string, OrgRepo["usedBy"][number]>>(names.map(n => [n.toLowerCase(), new Map()]));
  const escaped = names.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).sort((a, b) => b.length - a.length);
  const pattern = new RegExp(`${org}/(${escaped.join("|")})(?![\\w.-]*[\\w-])`, "gi");
  for (const { repo, tree, patterns, components } of sources) {
    const byDepth = [...components].sort((a, b) => b.path.length - a.path.length);
    const files = [...new Set(patterns.flatMap(p => tree.list(p)))];
    for (const [file, text] of tree.read(files))
      for (const m of text.matchAll(pattern)) {
        const target = found.get(m[1]!.toLowerCase());
        if (!target || `${org}/${m[1]}`.toLowerCase() === repo.toLowerCase()) continue;
        const owner = byDepth.find(c => file === c.path || file.startsWith(`${c.path}/`));
        const entry = owner ? { repo, path: owner.path, name: owner.name } : { repo, path: file };
        target.set(`${repo}:${entry.path}`, entry);
      }
  }
  return new Map(
    names.map(n => [
      n,
      [...found.get(n.toLowerCase())!.values()].sort((a, b) =>
        `${a.repo}${a.path}`.localeCompare(`${b.repo}${b.path}`),
      ),
    ]),
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Réseau

async function github(query: string, variables: Record<string, unknown>, token: string): Promise<any> {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "user-agent": "aphrody-site",
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`GitHub GraphQL : HTTP ${res.status}`);
  const body = (await res.json()) as any;
  if (body.errors?.length) throw new Error(`GitHub GraphQL : ${body.errors[0].message}`);
  return body.data;
}

const ORG_QUERY = `query($login: String!, $after: String) {
  organization(login: $login) {
    repositories(first: 40, after: $after, orderBy: {field: NAME, direction: ASC}) {
      pageInfo { hasNextPage endCursor }
      nodes {
        name url description isFork isArchived isPrivate
        licenseInfo { spdxId }
        primaryLanguage { name }
        parent { nameWithOwner url }
        defaultBranchRef { name }
        latestRelease { tagName publishedAt url }
      }
    }
  }
}`;

export async function collectOrg(login: string, token: string): Promise<any[]> {
  const nodes: any[] = [];
  let after: string | null = null;
  do {
    const data = await github(ORG_QUERY, { login, after }, token);
    const page = data.organization.repositories;
    nodes.push(...page.nodes);
    after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (after);
  return nodes;
}

export async function distributionReleases(repo: string, token: string): Promise<DistributionRelease[]> {
  const [owner, name] = repo.split("/");
  const data = await github(
    `query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { releases(first: 20, orderBy: {field: CREATED_AT, direction: DESC}) { nodes { tagName name publishedAt isDraft } } } }`,
    { owner, name },
    token,
  );
  return (data.repository?.releases.nodes ?? [])
    .filter((r: any) => !r.isDraft && r.publishedAt)
    .map((r: any) => ({ tag: r.tagName, name: r.name || r.tagName, date: r.publishedAt }));
}

export async function npmVersions(scope: string): Promise<Map<string, string>> {
  const versions = new Map<string, string>();
  for (let from = 0; ; from += 250) {
    const res = await fetch(
      `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(scope)}&size=250&from=${from}`,
    );
    if (!res.ok) throw new Error(`npm search : HTTP ${res.status}`);
    const body = (await res.json()) as any;
    for (const o of body.objects ?? [])
      if (o.package.name.startsWith(`${scope}/`)) versions.set(o.package.name, o.package.version);
    if (!body.objects?.length || from + 250 >= body.total) break;
  }
  return versions;
}

export async function imagePull(image: string): Promise<string> {
  const m = /^ghcr\.io\/([^:]+):(.+)$/.exec(image);
  if (!m) return "not checked";
  const token = await fetch(`https://ghcr.io/token?scope=repository:${m[1]}:pull`);
  if (!token.ok) return `anonymous pull denied by ghcr.io (HTTP ${token.status})`;
  const { token: t } = (await token.json()) as any;
  const manifest = await fetch(`https://ghcr.io/v2/${m[1]}/manifests/${m[2]}`, {
    method: "HEAD",
    headers: {
      authorization: `Bearer ${t}`,
      accept: "application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.v2+json",
    },
  });
  return manifest.ok
    ? "anonymous pull allowed by ghcr.io"
    : `tag not readable anonymously on ghcr.io (HTTP ${manifest.status})`;
}

export async function downloadsManifest(url: string): Promise<SiteData["downloads"]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} : HTTP ${res.status}`);
  const j = (await res.json()) as any;
  return {
    release: String(j.release?.id ?? ""),
    commit: String(j.release?.commit ?? ""),
    generatedAt: String(j.generatedAt ?? ""),
    baseUrl: String(j.baseUrl ?? new URL(url).origin),
    artifacts: ((j.artifacts ?? []) as any[]).map(a => ({
      name: String(a.name),
      version: String(a.version),
      platform: String(a.platform),
      kind: String(a.kind),
      url: String(a.url),
      sha256: String(a.sha256),
      size: Number(a.size),
    })),
    notes: ((j.notes ?? []) as unknown[]).map(String),
  };
}

// ---------------------------------------------------------------------------------------------------------------

export type CollectOptions = {
  runtime?: { repo: string; ref: string };
  distribution?: { repo: string; ref: string };
  org: string;
  author: string;
  offline: boolean;
  token?: string;
  downloadsUrl: string;
  now?: Date;
};

const REFERENCE_PATTERNS = {
  runtime: [
    "docs/**/*.{md,mdx}",
    "scripts/aphrody/**",
    "packages/*/{package.json,Cargo.toml,README.md}",
    "packages/*/*/{package.json,Cargo.toml,README.md}",
    "packages/*/crates/*/Cargo.toml",
    ".gitmodules",
  ],
  distribution: [
    "tools/config/**/*.{json,toml}",
    "**/Cargo.toml",
    "packages/*/*/{package.json,README.md}",
    "m3/packages/*/{package.json,README.md}",
    "m3/README.md",
    "m3/docs/**/*.md",
    "**/.gitmodules",
  ],
};

export async function collect(o: CollectOptions): Promise<SiteData> {
  const warnings: string[] = [];
  const errors: string[] = [];
  const soft = async <T>(what: string, fn: () => Promise<T>): Promise<T | null> => {
    if (o.offline) return null;
    try {
      return await fn();
    } catch (error) {
      errors.push(`${what}: ${(error as Error).message}`);
      return null;
    }
  };
  const runtimeTree = o.runtime ? new GitTree(o.runtime.repo, o.runtime.ref) : null;
  const distTree = o.distribution ? new GitTree(o.distribution.repo, o.distribution.ref) : null;
  const runtime = runtimeTree ? collectRuntime(runtimeTree, `${o.org}/bun`, o.author, warnings) : null;
  const distribution = distTree ? collectDistribution(distTree, `${o.org}/aphrody`, warnings) : null;

  const npm = await soft("npm", () => npmVersions("@aphrody"));
  if (npm) {
    for (const c of [
      ...(runtime?.packages ?? []),
      ...(distribution?.packages ?? []),
      ...(distribution?.m3.packages ?? []),
    ])
      if (!c.private && npm.has(c.name)) c.npm = npm.get(c.name);
    if (runtime?.npm) runtime.npm.version = npm.get(runtime.npm.name);
  }
  if (runtime?.image) runtime.image.pull = (await soft("ghcr", () => imagePull(runtime.image!.name))) ?? "not checked";

  let org: SiteData["org"] = null;
  if (o.token) {
    const nodes = await soft("GitHub", () => collectOrg(o.org, o.token!));
    if (nodes) {
      const visibility = (repo: string): Visibility => {
        const node = nodes.find(n => `${o.org}/${n.name}`.toLowerCase() === repo.toLowerCase());
        return node ? (node.isPrivate ? "private" : "public") : "unknown";
      };
      if (runtime) runtime.visibility = visibility(runtime.repo);
      if (distribution) distribution.visibility = visibility(distribution.repo);
      const visible = nodes.filter(n => !n.isPrivate);
      const refs = usedBy(
        [
          ...(runtimeTree && runtime
            ? [
                {
                  repo: runtime.repo,
                  tree: runtimeTree,
                  patterns: REFERENCE_PATTERNS.runtime,
                  components: runtime.packages,
                },
              ]
            : []),
          ...(distTree && distribution
            ? [
                {
                  repo: distribution.repo,
                  tree: distTree,
                  patterns: REFERENCE_PATTERNS.distribution,
                  components: [...distribution.crates, ...distribution.packages, ...distribution.m3.packages],
                },
              ]
            : []),
        ],
        o.org,
        visible.map(n => n.name),
      );
      org = {
        login: o.org,
        privateCount: nodes.length - visible.length,
        public: visible.map(n => ({
          name: n.name,
          url: n.url,
          description: oneLine(n.description),
          fork: n.isFork,
          archived: n.isArchived,
          ...(n.parent ? { upstream: { name: n.parent.nameWithOwner, url: n.parent.url } } : {}),
          license: n.licenseInfo?.spdxId ?? "",
          language: n.primaryLanguage?.name ?? "",
          ...(n.latestRelease
            ? {
                release: {
                  tag: n.latestRelease.tagName,
                  date: n.latestRelease.publishedAt,
                  url: n.latestRelease.url,
                },
              }
            : {}),
          branch: n.defaultBranchRef?.name ?? "",
          usedBy: refs.get(n.name) ?? [],
        })),
      };
    }
    if (distribution)
      distribution.releases = (await soft("releases", () => distributionReleases(distribution.repo, o.token!))) ?? [];
  } else if (!o.offline) errors.push("GitHub: no token (GH_TOKEN or GITHUB_TOKEN), organization not collected");

  // Artefacts d'un profil privé : servis par downloads.aphrody.com à qui les connaît, pas listés par le site.
  // Le manifeste est celui de la distribution : le site du runtime seul (`--downloads none`) ne le lit pas.
  const downloads = o.downloadsUrl ? await soft("downloads", () => downloadsManifest(o.downloadsUrl)) : null;
  if (downloads) {
    const described = new Map((distribution?.catalogue ?? []).map(c => [c.id, c.description]));
    const withheld = new Set(
      downloads.artifacts
        .map(a => a.name)
        .filter(name => PRIVATE_TERMS.test(name) || PRIVATE_TERMS.test(described.get(name) ?? "")),
    );
    for (const name of withheld) warnings.push(`downloads ${name}: not listed (names a private profile)`);
    downloads.artifacts = downloads.artifacts.filter(a => !withheld.has(a.name));
    if (distribution) distribution.catalogue = distribution.catalogue.filter(c => !withheld.has(c.id));
  }

  return {
    schemaVersion: 1,
    generatedAt: (o.now ?? new Date()).toISOString(),
    runtime,
    distribution,
    downloads,
    org,
    warnings,
    errors,
  };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const option = (name: string, fallback?: string) => {
    const i = args.indexOf(name);
    return i >= 0 && args[i + 1] && !args[i + 1]!.startsWith("--") ? args[i + 1]! : fallback;
  };
  const out = option("--out");
  if (!out) throw new Error("--out <site-data.json> requis");
  const runtime = option("--runtime");
  const distribution = option("--distribution");
  const data = await collect({
    runtime: runtime ? { repo: runtime, ref: option("--runtime-ref", "HEAD")! } : undefined,
    distribution: distribution ? { repo: distribution, ref: option("--distribution-ref", "HEAD")! } : undefined,
    org: option("--org", "aphrody-labs")!,
    author: option("--fork-author", "contact@aphrody.com")!,
    offline: args.includes("--offline"),
    token: process.env.GH_TOKEN || process.env.GITHUB_TOKEN || undefined,
    downloadsUrl: ((url: string) => (url === "none" ? "" : url))(
      option("--downloads", "https://downloads.aphrody.com/latest.json")!,
    ),
  });
  await Bun.write(out, JSON.stringify(data, null, 2) + "\n");
  for (const w of data.warnings) console.warn(`warning: ${w}`);
  for (const e of data.errors) console.warn(`error: ${e}`);
  const d = data.distribution;
  console.log(
    `site-data: runtime ${data.runtime?.commit.slice(0, 12) ?? "-"} (${data.runtime?.commits.count ?? 0} commits), distribution ${d?.commit.slice(0, 12) ?? "-"} (${d?.crates.length ?? 0} crates, ${d?.packages.length ?? 0} packages, ${d?.m3.packages.length ?? 0} m3), org ${data.org?.public.length ?? 0} public + ${data.org?.privateCount ?? 0} private, downloads ${data.downloads?.release || "-"}, ${data.warnings.length} warning(s), ${data.errors.length} error(s)`,
  );
}
