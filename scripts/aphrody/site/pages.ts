// Pages d'aphrody.com générées depuis site-data.json (collect.ts) : produit (accueil), composants, runtime, M3,
// téléchargements de la distribution, notes de version, sécurité, contribution, identité. Seuls les intitulés et la
// mise en forme sont écrits ici ; noms, versions, licences, rôles, chiffres et liens viennent des données.
import type { Release } from "./build.ts";
import type { Component, OrgRepo, SiteData } from "./collect.ts";

export type GeneratedPage = {
  path: string;
  title: string;
  description: string;
  /** Onglet du haut actif. */
  tab: string;
  /** Corps Markdown, sans titre de niveau 1 ; liens du site en chemins racine (`/components`). */
  markdown: string;
};

export type PageContext = { origin: string; releases: Release[] | null };

export const formatBytes = (n: number) =>
  n >= 1024 ** 3
    ? `${(n / 1024 ** 3).toFixed(2)} GiB`
    : n >= 1024 ** 2
      ? `${(n / 1024 ** 2).toFixed(1)} MiB`
      : n >= 1024
        ? `${(n / 1024).toFixed(1)} KiB`
        : `${n} B`;

const day = (iso: string) => iso.slice(0, 10);
const short = (sha: string) => sha.slice(0, 12);
const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

/** Échappe une valeur des données pour le Markdown ; les segments entre accents graves restent du code. */
export function esc(value: string): string {
  return value
    .split(/(`[^`\n]*`)/)
    .map((part, i) =>
      i % 2
        ? part.replaceAll("|", "\\|")
        : part
            .replace(/[\\*_[\]|]/g, "\\$&")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;"),
    )
    .join("");
}

const code = (s: string) => "`" + s.replace(/[`\n]/g, "").replaceAll("|", "\\|") + "`";
const link = (text: string, url: string) => `[${esc(text)}](${url})`;

export function table(head: string[], rows: string[][]): string {
  return [
    `| ${head.join(" | ")} |`,
    `| ${head.map(() => "---").join(" | ")} |`,
    ...rows.map(r => `| ${r.map(c => c.replace(/\s*\n\s*/g, " ")).join(" | ")} |`),
  ].join("\n");
}

/** Documents publiés par le site, par nom de fichier du dépôt. */
export const DOCUMENT_ROUTES: Record<string, string> = {
  "SECURITY.md": "/security",
  "CONTRIBUTING.md": "/contributing",
  "IDENTITY.md": "/about",
};

/**
 * Liens d'un texte du dépôt de la distribution (privé) : un document publié pointe vers sa page, une URL du site
 * devient un chemin racine, tout autre lien relatif garde son texte seul.
 */
export function publicLinks(markdown: string, origin: string): string {
  return markdown.replace(/(!?)\[([^\]\n]+)\]\(([^)\s]+)\)/g, (all, bang: string, text: string, href: string) => {
    if (href.startsWith(origin + "/")) return `${bang}[${text}](${href.slice(origin.length)})`;
    if (bang || /^(https?:|mailto:|#|\/)/.test(href)) return all;
    const [file = "", anchor] = href.split("#");
    const route = DOCUMENT_ROUTES[file.split("/").pop()!];
    return route ? `[${text}](${route}${anchor ? `#${anchor}` : ""})` : text;
  });
}

/** Titre de niveau 1 d'un document et son corps sans ce titre. */
export function splitTitle(markdown: string): { title: string; body: string } {
  const m = /^\s*#\s+(.+?)\s*\n/.exec(markdown);
  return m ? { title: m[1]!, body: markdown.slice(m[0].length).trim() } : { title: "", body: markdown.trim() };
}

const repoUrl = (repo: string) => `https://github.com/${repo}`;
const npmCell = (c: Component) =>
  c.npm ? link(c.npm, `https://www.npmjs.com/package/${c.name}`) : c.private ? "not published" : "";
const upstreamCell = (c: { upstream?: { name: string; url: string } }) =>
  c.upstream ? link(c.upstream.name, c.upstream.url) : "";
const licenseCell = (license: string) =>
  !license ? "not declared" : license === "NOASSERTION" ? "see repository" : esc(license);

function componentTable(list: Component[], opts: { npm?: boolean; upstream?: boolean; path?: boolean } = {}) {
  return table(
    [
      "Name",
      ...(opts.path ? ["Path"] : []),
      "Version",
      ...(opts.npm ? ["npm"] : []),
      "Licence",
      ...(opts.upstream ? ["Upstream"] : []),
      "Role",
    ],
    list.map(c => [
      code(c.name),
      ...(opts.path ? [code(c.path)] : []),
      esc(c.version),
      ...(opts.npm ? [npmCell(c)] : []),
      licenseCell(c.license),
      ...(opts.upstream ? [upstreamCell(c)] : []),
      esc(c.description),
    ]),
  );
}

const groupBy = <T>(list: T[], key: (t: T) => string) => {
  const map = new Map<string, T[]>();
  for (const t of list) map.set(key(t), [...(map.get(key(t)) ?? []), t]);
  return map;
};

/** Dernière release publiée du runtime (`aphrody-v*`). */
export const latestRuntimeRelease = (releases: Release[] | null) => releases?.find(r => !r.prerelease) ?? releases?.[0];

const runtimeVersion = (d: SiteData, ctx: PageContext) =>
  latestRuntimeRelease(ctx.releases)?.tag.replace(/^(?:bun-v|aphrody-v)/, "") ?? d.runtime?.upstream.version ?? "";

function sourceLine(d: SiteData): string {
  const parts: string[] = [];
  if (d.distribution)
    parts.push(
      `${d.distribution.visibility === "public" ? link(d.distribution.repo, repoUrl(d.distribution.repo)) : code(d.distribution.repo)} at ${code(short(d.distribution.commit))}${d.distribution.visibility === "private" ? " (private repository)" : ""}`,
    );
  if (d.runtime)
    parts.push(
      `${link(d.runtime.repo, repoUrl(d.runtime.repo))} at ${link(short(d.runtime.commit), `${repoUrl(d.runtime.repo)}/commit/${d.runtime.commit}`)}`,
    );
  if (d.org) parts.push(`the public repositories of ${link(d.org.login, repoUrl(d.org.login))}`);
  return `Generated on ${day(d.generatedAt)} from ${parts.join(", ")}.`;
}

// ---------------------------------------------------------------------------------------------------------------
// Accueil : page produit

export type Installer = { label: string; command: string };

/** Commandes d'installation de la distribution (première ligne d'usage de chaque script publié). */
export function distributionInstallers(d: SiteData): Installer[] {
  return (d.distribution?.installers ?? [])
    .filter(i => i.usage[0])
    .map(i => ({
      label: i.file.endsWith(".ps1") ? `${i.file} (PowerShell)` : `${i.file} (POSIX shell)`,
      command: i.usage[0]!,
    }));
}

export function homePage(d: SiteData, ctx: PageContext): GeneratedPage {
  const dist = d.distribution;
  const rows: string[][] = [];
  if (d.downloads?.release)
    rows.push([
      "Distribution release",
      `${code(d.downloads.release)}, ${day(d.downloads.generatedAt)}`,
      link("latest.json", `${d.downloads.baseUrl}/latest.json`),
    ]);
  if (d.runtime) {
    const latest = latestRuntimeRelease(ctx.releases);
    rows.push([
      "Runtime",
      `${code(runtimeVersion(d, ctx))}, based on Bun ${esc(d.runtime.upstream.version)}`,
      latest ? link(latest.tag, latest.url) : link(d.runtime.repo, repoUrl(d.runtime.repo)),
    ]);
  }
  if (dist?.workspace.version)
    rows.push([
      "Cargo workspace",
      `${code(dist.workspace.version)}${dist.workspace.rust ? `, Rust ${esc(dist.workspace.rust)}` : ""}`,
      code("Cargo.toml"),
    ]);
  const counts = [
    dist && plural(dist.crates.length, "crate"),
    dist && plural(dist.packages.length, "Bun package"),
    dist && plural(dist.m3.packages.length, "M3 package"),
    d.runtime && plural(d.runtime.packages.length + (d.runtime.windowsBindings?.count ?? 0), "runtime package"),
    d.org && plural(d.org.public.length, "public repository", "public repositories"),
  ].filter(Boolean);
  if (counts.length) rows.push(["Components", counts.join(", "), link("Components", "/components")]);
  const sections = (dist?.sections ?? []).map(s => `## ${s.title}\n\n${publicLinks(s.markdown, ctx.origin)}`);
  return {
    path: "/",
    title: "Aphrody",
    description: plainText(dist?.summary ?? ""),
    tab: "",
    markdown: [
      rows.length ? `## Current versions\n\n${table(["Item", "Version", "Source"], rows)}` : "",
      ...sections,
      sourceLine(d),
    ]
      .filter(Boolean)
      .join("\n\n"),
  };
}

/** Texte sans Markdown (liens réduits à leur texte, code sans accents graves), pour les métadonnées. */
export const plainText = (markdown: string) =>
  markdown
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

// ---------------------------------------------------------------------------------------------------------------
// Composants

function usedByCell(r: OrgRepo): string {
  const names = [...new Set(r.usedBy.flatMap(u => (u.name ? [u.name] : [])))];
  const files = r.usedBy.filter(u => !u.name).length;
  const shown = names.slice(0, 4).map(code);
  return [
    shown.join(", ") + (names.length > shown.length ? ` and ${names.length - shown.length} more` : ""),
    files ? plural(files, "file") : "",
  ]
    .filter(Boolean)
    .join("; ");
}

/** Description GitHub d'un dépôt : celle d'un fork est celle de l'amont, elle n'est pas reprise. */
const repoDescription = (r: OrgRepo) => (r.fork ? "" : esc(r.description));

function repoTable(list: OrgRepo[]) {
  return table(
    ["Repository", "Upstream", "Licence", "Language", "Latest release", "Used by", "Description"],
    list.map(r => [
      link(r.name, r.url) + (r.archived ? " (archived)" : ""),
      upstreamCell(r),
      licenseCell(r.license),
      esc(r.language),
      r.release ? `${link(r.release.tag, r.release.url)} (${day(r.release.date)})` : "",
      usedByCell(r),
      repoDescription(r),
    ]),
  );
}

export function componentsPage(d: SiteData, ctx: PageContext): GeneratedPage {
  const dist = d.distribution;
  const rt = d.runtime;
  const out: string[] = [sourceLine(d)];
  const summary: string[][] = [];
  if (dist) {
    summary.push(["Crates", String(dist.crates.length), `${code("crates/")} of ${code(dist.repo)}`]);
    summary.push(["Bun packages", String(dist.packages.length), code("packages/")]);
    summary.push(["M3 packages", String(dist.m3.packages.length), link("m3/", "/m3")]);
  }
  if (rt)
    summary.push([
      "Runtime packages",
      `${rt.packages.length}${rt.windowsBindings ? ` + ${rt.windowsBindings.count} Windows bindings` : ""}`,
      `${code("packages/")} of ${link(rt.repo, repoUrl(rt.repo))}`,
    ]);
  if (d.org) {
    const used = d.org.public.filter(r => r.usedBy.length).length;
    summary.push([
      "Public repositories",
      `${d.org.public.length} (${used} referenced by the distribution or the runtime)`,
      link(`github.com/${d.org.login}`, repoUrl(d.org.login)),
    ]);
  }
  if (summary.length) out.push(table(["Group", "Count", "Source"], summary));

  if (rt) {
    out.push(`## Runtime`);
    out.push(
      table(
        ["Component", "Version", "Upstream", "Licence", "Details"],
        [
          [
            link(rt.repo, repoUrl(rt.repo)),
            code(runtimeVersion(d, ctx)),
            `${link(rt.upstream.name, rt.upstream.url)} ${esc(rt.upstream.version)}`,
            `${rt.licenses.length ? esc(rt.licenses.join(", ")) + ", " : ""}${link(rt.license || "licence", `${repoUrl(rt.repo)}/blob/main/${rt.license}`)}`,
            link("Runtime", "/runtime"),
          ],
        ],
      ),
    );
  }

  if (dist) {
    out.push(`## Crates`);
    out.push(
      `Rust crates of the Cargo workspace (${code("Cargo.toml")} members), grouped by ${code("crates/<domain>")}. Upstream is the source a crate was integrated from (${code("tools/config/upstream-sources.json")}) or a ${code("repository")} field that differs from the workspace's.`,
    );
    for (const [domain, list] of groupBy(dist.crates, c => c.path.split("/").slice(0, 2).join("/")))
      out.push(`### ${domain}\n\n${componentTable(list, { upstream: true })}`);

    out.push(`## Bun packages`);
    out.push(componentTable(dist.packages, { npm: true, path: true }));
    out.push(`## M3`);
    out.push(
      `${plural(dist.m3.packages.length, "package")} under ${code("m3/packages/")}, listed with their elements, primitives and tokens on ${link("M3", "/m3")}.`,
    );

    const licences = [
      ...groupBy([...dist.crates, ...dist.packages, ...dist.m3.packages], c => c.license || "not declared"),
    ]
      .map(([license, list]) => [license, list.length] as const)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    out.push(`### Licences of the distribution components`);
    out.push(
      table(
        ["Licence", "Components"],
        licences.map(([l, n]) => [esc(l), String(n)]),
      ),
    );
  }

  if (rt) {
    out.push(`## Runtime packages`);
    out.push(`Packages added under ${code("packages/")} of ${link(rt.repo, repoUrl(rt.repo))}.`);
    out.push(componentTable(rt.packages, { npm: true }));
    if (rt.windowsBindings)
      out.push(
        `${plural(rt.windowsBindings.count, "package")} ${code("@aphrody/bun-windows-*")} (one per Windows DLL family; versions ${rt.windowsBindings.versions.map(code).join(", ")}, licence ${esc(rt.windowsBindings.licenses.join(", "))}) are generated from ${esc(rt.windowsBindings.source)}.`,
      );
  }

  if (d.org) {
    const used = d.org.public
      .filter(r => r.usedBy.length)
      .sort((a, b) => b.usedBy.length - a.usedBy.length || a.name.localeCompare(b.name));
    const others = d.org.public.filter(r => !r.usedBy.length);
    out.push(`## Organization repositories`);
    out.push(
      `Public repositories of ${link(d.org.login, repoUrl(d.org.login))}. "Used by" lists the components of the distribution and of the runtime whose sources name the repository${d.org.privateCount ? `; ${plural(d.org.privateCount, "private repository", "private repositories")} are not listed` : ""}. Forks keep the licence of their upstream.`,
    );
    if (used.length) out.push(`### Referenced by the distribution or the runtime\n\n${repoTable(used)}`);
    if (others.length) out.push(`### Other public repositories\n\n${repoTable(others)}`);
  }
  return {
    path: "/components",
    title: "Components",
    description:
      "Index of the Aphrody components: crates, packages, M3, runtime and organization repositories, with version, licence and upstream.",
    tab: "Components",
    markdown: out.join("\n\n"),
  };
}

/** /components.json : les mêmes listes, lisibles par un programme. */
export function componentsJson(d: SiteData) {
  return {
    schemaVersion: 1,
    generatedAt: d.generatedAt,
    distribution: d.distribution && {
      repo: d.distribution.repo,
      commit: d.distribution.commit,
      workspace: d.distribution.workspace,
      crates: d.distribution.crates,
      packages: d.distribution.packages,
      m3: d.distribution.m3.packages,
    },
    runtime: d.runtime && {
      repo: d.runtime.repo,
      commit: d.runtime.commit,
      upstream: d.runtime.upstream,
      packages: d.runtime.packages,
      windowsBindings: d.runtime.windowsBindings,
    },
    repositories: d.org?.public ?? [],
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Runtime

const commandName = (file: string) =>
  file
    .slice(file.lastIndexOf("/") + 1)
    .replace(/_command\.rs$/, "")
    .replaceAll("_", "-");

export function runtimePage(d: SiteData, ctx: PageContext): GeneratedPage | null {
  const rt = d.runtime;
  if (!rt) return null;
  const gh = repoUrl(rt.repo);
  const latest = latestRuntimeRelease(ctx.releases);
  const facts: string[][] = [
    ["Upstream", `${link(rt.upstream.name, rt.upstream.url)}, base version ${code(rt.upstream.version)}`],
    ["Source", `${link(rt.repo, gh)} at ${link(short(rt.commit), `${gh}/commit/${rt.commit}`)} (${day(rt.date)})`],
    [
      "Licence",
      `${rt.licenses.length ? esc(rt.licenses.join(", ")) + ", " : ""}${link(rt.license || "licence", `${gh}/blob/main/${rt.license}`)}`,
    ],
  ];
  if (latest) facts.push(["Latest release", `${link(latest.tag, latest.url)} (${day(latest.publishedAt)})`]);
  facts.push(["Fork commits", `${rt.commits.count} since ${day(rt.commits.first)} (merge commits excluded)`]);
  if (rt.lastUpstreamMerge)
    facts.push([
      "Last upstream merge",
      `${link(rt.lastUpstreamMerge.sha, `${gh}/commit/${rt.lastUpstreamMerge.sha}`)} (${day(rt.lastUpstreamMerge.date)})`,
    ]);
  if (rt.npm)
    facts.push([
      "npm",
      `${link(rt.npm.name, `https://www.npmjs.com/package/${rt.npm.name}`)}${rt.npm.version ? ` ${code(rt.npm.version)}` : ""}`,
    ]);
  if (rt.image)
    facts.push([
      "Container image",
      `${code(rt.image.name)} (${link(rt.image.dockerfile, `${gh}/blob/main/${rt.image.dockerfile}`)}, release ${code(rt.image.release)}); ${esc(rt.image.pull)}`,
    ]);

  const out: string[] = [table(["Item", "Value"], facts)];
  out.push(
    `## Commits by type\n\nConventional Commit types of the fork commits.\n\n${table(
      ["Type", "Commits"],
      rt.commits.types.map(([t, n]) => [code(t), String(n)]),
    )}`,
  );
  if (rt.commits.scopes.length)
    out.push(
      `Most frequent scopes: ${rt.commits.scopes
        .slice(0, 20)
        .map(([s, n]) => `${code(s)} (${n})`)
        .join(", ")}.`,
    );
  if (rt.modules.length)
    out.push(
      `## Built-in modules added\n\n${rt.modules.map(m => `- ${code(m)} (${link(`src/js/bun/${m.slice(4)}.ts`, `${gh}/blob/main/src/js/bun/${m.slice(4)}.ts`)})`).join("\n")}`,
    );
  if (rt.commands.length)
    out.push(
      `## CLI command implementations added\n\n${table(
        ["Name (from the file)", "Source"],
        rt.commands.map(f => [code(commandName(f)), link(f, `${gh}/blob/main/${f}`)]),
      )}`,
    );
  if (rt.docs.added.length)
    out.push(
      `## Documentation pages added\n\n${rt.docs.added
        .map(
          p =>
            `- ${link(p.title, `/docs/${p.slug}`.replace(/\/index$/, ""))}${p.description ? `: ${esc(p.description)}` : ""}`,
        )
        .join("\n")}`,
    );
  if (rt.docs.modified.length)
    out.push(
      `## Upstream documentation pages modified\n\n${rt.docs.modified
        .map(p => `- ${link(p.title, `/docs/${p.slug}`.replace(/\/index$/, ""))}`)
        .join("\n")}`,
    );
  if (rt.packages.length) {
    out.push(`## Packages added\n\n${componentTable(rt.packages, { npm: true, path: true })}`);
    if (rt.windowsBindings)
      out.push(
        `Plus ${plural(rt.windowsBindings.count, "generated package")} ${code("@aphrody/bun-windows-*")} from ${esc(rt.windowsBindings.source)}.`,
      );
  }
  if (rt.commits.recent.length)
    out.push(
      `## Recent commits\n\n${rt.commits.recent
        .map(c => `- ${link(c.sha, `${gh}/commit/${c.sha}`)} ${day(c.date)} ${esc(c.subject)}`)
        .join("\n")}`,
    );
  return {
    path: "/runtime",
    title: `Runtime: ${rt.repo}`,
    description: `The JavaScript runtime of Aphrody: a fork of ${rt.upstream.name} ${rt.upstream.version}, and what it adds.`,
    tab: "Runtime",
    markdown: out.join("\n\n"),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// M3

export function m3Page(d: SiteData): GeneratedPage | null {
  const dist = d.distribution;
  if (!dist?.m3.packages.length) return null;
  const m3 = dist.m3;
  const out: string[] = [
    `Material Design 3 of the distribution: ${plural(m3.packages.length, "Bun package")} under ${code("m3/packages/")} and ${plural(m3.uiCrates.length, "Rust crate")} under ${code("crates/ui/")}. ${sourceLine(d)}`,
    `## Packages\n\n${componentTable(m3.packages, { npm: true })}`,
  ];
  if (m3.elements.length)
    out.push(
      `## Material Web elements\n\n${plural(m3.elements.length, "element")} listed in ${code("m3/packages/m3-react/md-elements.txt")}: ${m3.elements.map(code).join(", ")}.`,
    );
  if (m3.primitives.length)
    out.push(
      `## Base UI primitives\n\n${plural(m3.primitives.length, "module")} in ${code("m3/packages/m3-baseui/src/")}: ${m3.primitives.map(code).join(", ")}.`,
    );
  if (m3.tokens.length)
    out.push(
      `## System tokens\n\n${code("--md-sys-*")} custom properties defined in ${code("m3/packages/m3-tokens/src/m3-tokens.css")}, by family.\n\n${table(
        ["Family", "Tokens"],
        m3.tokens.map(([f, n]) => [code(f), String(n)]),
      )}`,
    );
  if (m3.templates.length) out.push(`## Templates\n\n${code("m3/templates/")}: ${m3.templates.map(code).join(", ")}.`);
  const crates = dist.crates.filter(c => m3.uiCrates.includes(c.name));
  if (crates.length) out.push(`## Rust UI crates\n\n${componentTable(crates, { upstream: true })}`);
  const forks = (d.org?.public ?? []).filter(r => r.usedBy.some(u => u.path.startsWith("m3/")));
  if (forks.length)
    out.push(
      `## Upstream projects\n\nPublic repositories named by ${code("m3/")}.\n\n${table(
        ["Repository", "Upstream", "Licence"],
        forks.map(r => [link(r.name, r.url), upstreamCell(r), licenseCell(r.license)]),
      )}`,
    );
  return {
    path: "/m3",
    title: "M3",
    description: "Material Design 3 packages, elements, primitives, tokens and UI crates of Aphrody.",
    tab: "M3",
    markdown: out.join("\n\n"),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Téléchargements et notes de version de la distribution

/** Notes de publication de latest.json limitées aux artefacts publiés. */
export function publishedNotes(d: SiteData): string[] {
  const names = new Set(d.downloads?.artifacts.map(a => a.name) ?? []);
  return (d.downloads?.notes ?? []).filter(n => names.has(n.split(" ")[0]!));
}

export function distributionDownloads(d: SiteData): string {
  const dl = d.downloads;
  if (!dl?.artifacts.length)
    return `## Aphrody\n\nThe distribution manifest could not be read when this page was built.`;
  const out: string[] = [
    `## Aphrody`,
    `Release ${code(dl.release)}, built from commit ${code(short(dl.commit))} of the distribution repository and published ${day(dl.generatedAt)}. ${link("latest.json", `${dl.baseUrl}/latest.json`)} lists every artifact with its SHA-256; ${link("SHA256SUMS", `${dl.baseUrl}/releases/${dl.release}/SHA256SUMS`)} covers the same files.`,
  ];
  const installers = d.distribution?.installers ?? [];
  for (const i of installers)
    if (i.usage.length)
      out.push(
        `${code(i.file)}:\n\n\`\`\`${i.file.endsWith(".ps1") ? "powershell" : "bash"}\n${i.usage.join("\n")}\n\`\`\``,
      );
  const catalogue = new Map((d.distribution?.catalogue ?? []).map(c => [c.id, c]));
  for (const [name, list] of groupBy(dl.artifacts, a => a.name)) {
    const entry = catalogue.get(name);
    out.push(`### ${esc(name)}`);
    if (entry?.description) out.push(esc(entry.description));
    out.push(
      table(
        ["Platform", "Version", "Kind", "Size", "SHA-256"],
        list.map(a => [
          link(a.platform, a.url),
          code(a.version),
          esc(a.kind),
          formatBytes(a.size),
          `<span class="sha">${a.sha256}</span>`,
        ]),
      ),
    );
  }
  const notes = publishedNotes(d);
  if (notes.length) out.push(`### Not published\n\n${notes.map(n => `- ${esc(n)}`).join("\n")}`);
  return out.join("\n\n");
}

export function distributionReleaseNotes(d: SiteData): string {
  const out: string[] = [`## Aphrody distribution`];
  if (d.downloads?.release)
    out.push(
      `The current release is ${code(d.downloads.release)} (${day(d.downloads.generatedAt)}), with ${plural(d.downloads.artifacts.length, "artifact")} listed on ${link("Downloads", "/downloads")}. A release is named after the UTC time and the commit it was built from.`,
    );
  const releases = d.distribution?.releases ?? [];
  if (releases.length)
    out.push(
      `Releases recorded on GitHub:\n\n${table(
        ["Release", "Date"],
        releases.map(r => [code(r.tag), day(r.date)]),
      )}`,
    );
  return out.join("\n\n");
}

// ---------------------------------------------------------------------------------------------------------------
// Documents

const DOCUMENT_PAGES = [
  {
    key: "security",
    path: "/security",
    tab: "Security",
    description: "How to report a vulnerability, supported versions and download verification.",
  },
  {
    key: "contributing",
    path: "/contributing",
    tab: "",
    description: "Where code goes, gates and commit rules of the Aphrody repositories.",
  },
  { key: "identity", path: "/about", tab: "", description: "Names, accounts, licence and visual identity of Aphrody." },
] as const;

export function documentPages(d: SiteData, ctx: PageContext): GeneratedPage[] {
  const docs = d.distribution?.documents ?? {};
  return DOCUMENT_PAGES.flatMap(p => {
    const text = docs[p.key];
    if (!text) return [];
    const { title, body } = splitTitle(text);
    return [
      {
        path: p.path,
        title: title || p.key,
        description: p.description,
        tab: p.tab,
        markdown: publicLinks(body, ctx.origin),
      },
    ];
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Site du runtime seul (bun.aphrody.com) : accueil depuis APHRODY.md du fork, page /runtime

/**
 * Liens relatifs d'un document du fork : une page de `docs/` devient sa route du site (`/docs/...`), tout autre
 * chemin pointe sur GitHub au commit publié ; les liens absolus et les ancres restent tels quels.
 */
export function forkLinks(markdown: string, repo: string, commit: string): string {
  return markdown.replace(/(!?)\[([^\]\n]+)\]\(([^)\s]+)\)/g, (all, bang: string, text: string, href: string) => {
    if (/^(https?:|mailto:|#|\/)/.test(href)) return all;
    const [path = "", anchor] = href.replace(/^\.\//, "").split("#");
    const hash = anchor ? `#${anchor}` : "";
    const page = /^docs\/(.+)\.mdx?$/.exec(path);
    if (page && !bang && !page[1]!.startsWith("aphrody/"))
      return `[${text}](${`/docs/${page[1]}`.replace(/\/index$/, "")}${hash})`;
    const kind = bang ? "raw" : "blob";
    return `${bang}[${text}](${repoUrl(repo)}/${kind}/${commit}/${path.replace(/\/$/, "")}${hash})`;
  });
}

export function runtimeHomePage(d: SiteData, ctx: PageContext): GeneratedPage | null {
  const rt = d.runtime;
  if (!rt) return null;
  const gh = repoUrl(rt.repo);
  const latest = latestRuntimeRelease(ctx.releases);
  const rows: string[][] = [
    [
      "Runtime",
      `${code(runtimeVersion(d, ctx))}, based on Bun ${esc(rt.upstream.version)}`,
      latest ? link(latest.tag, latest.url) : link("Releases", `${gh}/releases`),
    ],
    ["Source", `${link(short(rt.commit), `${gh}/commit/${rt.commit}`)} (${day(rt.date)})`, link(rt.repo, gh)],
    [
      "Upstream",
      rt.lastUpstreamMerge
        ? `last merge ${link(rt.lastUpstreamMerge.sha, `${gh}/commit/${rt.lastUpstreamMerge.sha}`)} (${day(rt.lastUpstreamMerge.date)})`
        : "",
      link(rt.upstream.name, rt.upstream.url),
    ],
    [
      "Fork commits",
      `${rt.commits.count} since ${day(rt.commits.first)} (merge commits excluded)`,
      link("Runtime", "/runtime"),
    ],
  ];
  if (rt.npm)
    rows.push([
      "npm",
      `${code(rt.npm.name)}${rt.npm.version ? ` ${code(rt.npm.version)}` : ""}`,
      link("npmjs.com", `https://www.npmjs.com/package/${rt.npm.name}`),
    ]);
  const { body } = splitTitle(rt.guide);
  return {
    path: "/",
    title: "Aphrody Bun",
    description: `The Bun runtime of Aphrody: ${rt.upstream.name} ${rt.upstream.version} with the Aphrody patches, merged from upstream and released as ${rt.repo}.`,
    tab: "",
    markdown: [
      `## Current versions\n\n${table(["Item", "Version", "Source"], rows)}`,
      publicLinks(forkLinks(body, rt.repo, rt.commit), ctx.origin),
      sourceLine(d),
    ]
      .filter(Boolean)
      .join("\n\n"),
  };
}

export function generatedPages(d: SiteData, ctx: PageContext): GeneratedPage[] {
  if (!d.distribution) return [runtimeHomePage(d, ctx), runtimePage(d, ctx)].filter((p): p is GeneratedPage => !!p);
  return [homePage(d, ctx), componentsPage(d, ctx), runtimePage(d, ctx), m3Page(d), ...documentPages(d, ctx)].filter(
    (p): p is GeneratedPage => !!p,
  );
}
