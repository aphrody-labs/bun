// Génère le site statique aphrody.com : la distribution Aphrody (accueil produit, /components, /runtime, /m3,
// /security, /contributing, /about, pages générées par pages.ts depuis site-data.json de collect.ts), la doc du
// runtime aphrody-labs/bun (/docs depuis docs/docs.json + .mdx, pages .md brutes, recherche), /guides,
// /benchmarks, /downloads, /release-notes, /install (+ .sh, .ps1), /bun/setup.sh|ps1, /llms.txt,
// /llms-full.txt, sitemap.xml, robots.txt.
//
//   bun scripts/aphrody/site/build.ts --out <dir> [--src <arbre du dépôt>] [--origin https://aphrody.com]
//       [--commit <sha>] [--repo aphrody-labs/bun] [--perf <dossier des perf-report.json>] [--perf-run <url>]
//       [--releases <releases.json> | --offline] [--data <site-data.json>]
//
// --src pointe sur un arbre extrait (git archive) ou sur le dépôt lui-même (défaut). La publication
// (scripts/aphrody/site/publish.ts) extrait origin/main, collecte site-data.json et appelle ce script depuis
// l'arbre extrait. Sans --data, seules la doc du runtime et ses pages de téléchargement sont produites.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { SITE_ROOT_FILES } from "./brand.ts";
import type { SiteData } from "./collect.ts";
import { HIGHLIGHT_CSS, highlightHtml } from "./highlight.ts";
import { CSS, JS, shell, type NavLink, type Shell } from "./layout.ts";
import {
  absolutizeMarkdownLinks,
  escapeHtml,
  inlineSnippets,
  mapOutsideFences,
  mdxToHtmlMarkdown,
  parseFrontmatter,
  rewriteUpstreamUrls,
} from "./mdx.ts";
import {
  componentsJson,
  distributionDownloads,
  distributionInstallers,
  distributionReleaseNotes,
  formatBytes,
  generatedPages,
  latestRuntimeRelease,
  plainText,
  type GeneratedPage,
} from "./pages.ts";

export { formatBytes };

// ---------------------------------------------------------------------------------------------------------------
// Navigation (docs.json)

export type NavGroup = { group: string; items: (string | NavGroup)[] };
export type NavTab = { tab: string; href?: string; groups: NavGroup[] };
export type PageInfo = { slug: string; tab: string; group: string };

export function readNavigation(docsJson: any): { tabs: NavTab[]; pages: PageInfo[] } {
  const tabs: NavTab[] = [];
  const pages: PageInfo[] = [];
  const seen = new Set<string>();
  const toGroup = (g: any, tab: string): NavGroup => ({
    group: g.group,
    items: (g.pages ?? []).map((p: any) => {
      if (typeof p !== "string") return toGroup(p, tab);
      const slug = p.replace(/^\//, "").replace(/\.mdx?$/, "");
      if (!seen.has(slug)) {
        seen.add(slug);
        pages.push({ slug, tab, group: g.group });
      }
      return slug;
    }),
  });
  for (const t of docsJson.navigation?.tabs ?? []) {
    const groups: NavGroup[] = (t.groups ?? []).map((g: any) => toGroup(g, t.tab));
    if (t.pages) groups.push(toGroup({ group: t.tab, pages: t.pages }, t.tab));
    tabs.push({ tab: t.tab, href: t.href, groups });
  }
  return { tabs, pages };
}

/** Markdown brut d'une page : `/docs/index.md`, `/docs/runtime.md` (runtime/index), `/docs/runtime/http/server.md`. */
export const markdownUrl = (slug: string) => (slug === "index" ? "/docs/index.md" : pageUrl(slug) + ".md");

/** URL publique d'une page : `/docs`, `/docs/runtime` (runtime/index), `/docs/runtime/http/server`. */
export const pageUrl = (slug: string) => "/docs" + ("/" + slug).replace(/\/index$/, "").replace(/^\/$/, "");

// ---------------------------------------------------------------------------------------------------------------
// Petits utilitaires

const args = process.argv.slice(2);
const option = (name: string, fallback?: string) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] && !args[i + 1]!.startsWith("--") ? args[i + 1]! : fallback;
};

function write(path: string, content: string | Uint8Array) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(path));
    else out.push(path);
  }
  return out;
}

const inlineCode = (s: string) => escapeHtml(s).replace(/`([^`]+)`/g, "<code>$1</code>");

/** Liens racine Mintlify dans le HTML rendu (`/runtime/x`) vers `/docs/runtime/x`. */
export function prefixDocsLinks(html: string): string {
  return html.replace(
    /(href|src)="\/(?!\/|docs(?:\/|"|#)|install|downloads|benchmarks|blog|guides|llms|bun\/|favicon\.ico|apple-touch-icon\.png|site\.webmanifest|icon(?:-\d+)?\.(?:svg|png)|maskable-\d+\.png|pet\.webp|assets\/)([^"]*)"/g,
    (_, attr, path) => `${attr}="/docs/${path.replace(/\.mdx?(?=$|#)/, "")}"`,
  );
}

export function extractToc(html: string): { level: number; id: string; text: string }[] {
  const toc: { level: number; id: string; text: string }[] = [];
  for (const m of html.matchAll(/<h([23]) id="([^"]+)">([\s\S]*?)<\/h\1>/g))
    toc.push({ level: Number(m[1]), id: m[2]!, text: m[3]!.replace(/<[^>]+>/g, "") });
  return toc;
}

const textOf = (html: string) =>
  html
    .replace(/<pre[\s\S]*?<\/pre>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// ---------------------------------------------------------------------------------------------------------------
// Releases GitHub

export type Release = {
  tag: string;
  name: string;
  url: string;
  publishedAt: string;
  body: string;
  prerelease: boolean;
  assets: { name: string; url: string; size: number; sha256?: string }[];
};

export function parseSums(text: string): Map<string, string> {
  const sums = new Map<string, string>();
  for (const line of text.split("\n")) {
    const m = /^([0-9a-f]{64})\s+\*?(\S+)$/.exec(line.trim());
    if (m) sums.set(m[2]!, m[1]!);
  }
  return sums;
}

async function fetchReleases(repo: string): Promise<Release[]> {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "user-agent": "aphrody-site",
  };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=30`, { headers });
  if (!res.ok) throw new Error(`GitHub releases ${repo}: HTTP ${res.status}`);
  const list = (await res.json()) as any[];
  const releases: Release[] = [];
  for (const r of list) {
    if (r.draft || !String(r.tag_name).startsWith("aphrody-v")) continue;
    const release: Release = {
      tag: r.tag_name,
      name: r.name || r.tag_name,
      url: r.html_url,
      publishedAt: r.published_at,
      body: r.body ?? "",
      prerelease: !!r.prerelease,
      assets: r.assets.map((a: any) => ({
        name: a.name,
        url: a.browser_download_url,
        size: a.size,
      })),
    };
    const sums = release.assets.find(a => /^SHA256SUMS(\.txt)?$/.test(a.name));
    if (sums) {
      const text = await fetch(sums.url, { headers: { "user-agent": "aphrody-site" } }).then(x =>
        x.ok ? x.text() : "",
      );
      const map = parseSums(text);
      for (const a of release.assets) a.sha256 = map.get(a.name);
    }
    releases.push(release);
  }
  return releases;
}

/** `bun-linux-x64-musl-baseline-profile.zip` -> os, arch, variantes. */
export function describeAsset(name: string) {
  const m = /^bun-(linux|darwin|windows)-(x64|aarch64)((?:-musl|-baseline|-profile)*)\.zip$/.exec(name);
  if (!m) return null;
  const flags = m[3]!.split("-").filter(Boolean);
  return {
    os: m[1] as "linux" | "darwin" | "windows",
    arch: m[2]!,
    musl: flags.includes("musl"),
    baseline: flags.includes("baseline"),
    profile: flags.includes("profile"),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Rapports de performance (scripts/aphrody/perf-gate.ts)

const PERF_LABELS: Record<string, string> = {
  version: "`bun --version`",
  "eval-empty": "`bun -e ''`",
  "run-empty": "`bun run` (empty script)",
  "test-empty": "`bun test` (one empty test)",
  "build-small": "`bun build` (small project)",
  "install-offline": "`bun install` offline (warm cache)",
  "rss-startup": "RSS at startup",
  "rss-after-builtins": "RSS after loading node:* modules",
  "require-node": "`require` of node:* modules",
  "import-node": "`import()` of node:* modules",
  "require-bun": "`require` of bun:* modules",
  "serve-hello": "`Bun.serve` hello + first request",
  "fetch-local": "local `fetch` latency (p50)",
  "fetch-p99": "local `fetch` latency (p99)",
  "fetch-rps": "local `fetch`, sequential throughput",
  "fork-builtins": "`require` of fork-only modules (fork only)",
};

export function formatMetric(value: number | undefined, unit: string): string {
  if (value === undefined || !Number.isFinite(value)) return "n/a";
  if (unit === "ms") return `${value.toFixed(value < 10 ? 2 : 1)} ms`;
  if (unit === "bytes") return formatBytes(value);
  if (unit === "req/s") return `${Math.round(value).toLocaleString("en-US")} req/s`;
  return `${value} ${unit}`;
}

type PerfReport = { platform: string; report: any };

function loadPerfReports(dir: string | undefined): PerfReport[] {
  if (!dir || !existsSync(dir)) return [];
  return walk(dir)
    .filter(p => p.endsWith("perf-report.json"))
    .sort()
    .map(p => ({
      platform: relative(dir, dirname(p)).replace(/^perf-report-?/, "") || "report",
      report: JSON.parse(readFileSync(p, "utf8")),
    }));
}

export function renderPerfTable({ platform, report }: PerfReport): string {
  const m = report.meta ?? {};
  const rows = (report.rows ?? []) as any[];
  const body = rows
    .map(r => {
      const label = inlineCode(PERF_LABELS[r.id] ?? r.label ?? r.id);
      const ratio = typeof r.ratio === "number" ? r.ratio.toFixed(3) : "";
      const status =
        r.status === "ok"
          ? `<span class="ok">ok</span>`
          : r.status === "info"
            ? "info"
            : `<span class="bad">${escapeHtml(r.status)}</span>`;
      const cell = (s: any) =>
        s
          ? `${formatMetric(s.median, r.unit)} <small class="muted">(p95 ${formatMetric(s.p95, r.unit)})</small>`
          : "n/a";
      return `<tr><td>${label}</td><td class="num">${cell(r.upstream)}</td><td class="num">${cell(r.fork)}</td><td class="num">${ratio}</td><td>${status}</td></tr>`;
    })
    .join("");
  const size = report.binarySize
    ? `<tr><td>Binary size</td><td class="num">${formatBytes(report.binarySize.upstream)}</td><td class="num">${formatBytes(report.binarySize.fork)}</td><td class="num">${report.binarySize.ratio?.toFixed(3) ?? ""}</td><td>${escapeHtml(report.binarySize.status ?? "")}</td></tr>`
    : "";
  return `<h2 id="${escapeHtml(platform)}">${escapeHtml(platform)}</h2>
<p class="muted">Fork <code>${escapeHtml(m.fork?.version ?? "?")}</code> (${escapeHtml(String(m.fork?.revision ?? "").slice(0, 9))}) against upstream <code>${escapeHtml(m.upstream?.version ?? "?")}</code> (${escapeHtml(String(m.upstream?.revision ?? "").slice(0, 9))}) on ${escapeHtml(m.host ?? "?")}; ${escapeHtml(String(m.runs ?? "?"))} runs, ${escapeHtml(String(m.warmup ?? "?"))} warmup, engine ${escapeHtml(m.engine ?? "?")}, measured ${escapeHtml(m.date ?? "?")}. Median (p95); ratio = fork / upstream, lower is faster for times.</p>
<table><thead><tr><th>Measure</th><th class="num">Upstream</th><th class="num">Fork</th><th class="num">Ratio</th><th>Gate</th></tr></thead><tbody>${body}${size}</tbody></table>
${m.note ? `<blockquote><p>Run note: ${escapeHtml(m.note)}</p></blockquote>` : ""}`;
}

// ---------------------------------------------------------------------------------------------------------------
// Génération

export type BuildOptions = {
  src: string;
  out: string;
  origin: string;
  commit: string;
  repo: string;
  perf?: string;
  perfRun?: string;
  releases: Release[] | null;
  /** Données de la distribution, du runtime et de l'organisation (collect.ts) ; sans elles, pas de pages produit. */
  data?: SiteData | null;
  now?: Date;
};

/** Onglets du haut : les pages de la distribution, puis la doc du runtime et ses pages. */
const TOP_TABS: [label: string, href: string, needsData: boolean][] = [
  ["Components", "/components", true],
  ["Runtime", "/runtime", true],
  ["M3", "/m3", true],
  ["Docs", "/docs", false],
  ["Downloads", "/downloads", false],
  ["Release notes", "/release-notes", false],
  ["Benchmarks", "/benchmarks", false],
  ["Security", "/security", true],
];

/** Liens racine (`/components`) d'un Markdown généré vers des URL absolues, pour sa variante `.md`. */
const absolutizeRootLinks = (markdown: string, origin: string) =>
  mapOutsideFences(markdown, chunk => chunk.replace(/\]\(\/(?!\/)/g, `](${origin}/`));

export async function build(o: BuildOptions) {
  const docs = join(o.src, "docs");
  const docsJson = JSON.parse(readFileSync(join(docs, "docs.json"), "utf8"));
  const { tabs, pages } = readNavigation(docsJson);
  const now = (o.now ?? new Date()).toISOString();
  const data = o.data ?? null;
  const readSnippet = (path: string) => {
    const file = join(docs, path);
    return existsSync(file) ? readFileSync(file, "utf8") : undefined;
  };

  // Lecture des pages
  type Rendered = PageInfo & { title: string; description: string; markdown: string; file: string };
  const rendered: Rendered[] = [];
  const titles = new Map<string, string>();
  for (const p of pages) {
    const file = [".mdx", ".md"].map(e => join(docs, p.slug + e)).find(f => existsSync(f));
    if (!file) continue;
    const { data, body } = parseFrontmatter(readFileSync(file, "utf8"));
    const title = String(data.title ?? p.slug.split("/").pop());
    titles.set(p.slug, String(data.sidebarTitle ?? title));
    rendered.push({
      ...p,
      title,
      description: String(data.description ?? ""),
      markdown: rewriteUpstreamUrls(inlineSnippets(body, readSnippet), o.origin).trim(),
      file: relative(o.src, file).replaceAll("\\", "/"),
    });
  }
  const bySlug = new Map(rendered.map(r => [r.slug, r]));

  // Pages générées depuis les données (accueil produit, composants, runtime, M3, documents)
  const ctx = { origin: o.origin, releases: o.releases };
  const generated = data ? generatedPages(data, ctx) : [];
  const generatedPaths = new Set(generated.map(g => g.path));

  // Onglets du haut, et onglets de la doc dans la barre latérale (sans Feedback ni le blog : /release-notes est en haut)
  const tabHref = (t: NavTab) => {
    if (t.href) return t.href.startsWith(o.origin + "/") ? t.href.slice(o.origin.length) : t.href;
    for (const g of t.groups) {
      const first = firstSlug(g);
      if (first) return pageUrl(first);
    }
    return "/docs";
  };
  const firstSlug = (g: NavGroup): string | undefined => {
    for (const item of g.items) {
      const s = typeof item === "string" ? (bySlug.has(item) ? item : undefined) : firstSlug(item);
      if (s) return s;
    }
  };
  const topTabs = (active?: string): NavLink[] =>
    TOP_TABS.filter(([, href, needsData]) => !needsData || generatedPaths.has(href)).map(([label, href]) => ({
      label,
      href,
      active: label === active,
    }));
  const docTabs = tabs.filter(t => t.tab !== "Feedback" && !(t.href ?? "").endsWith("/blog"));

  const sidebarFor = (tabName: string, current: string) => {
    const switcher = `<nav class="doc-tabs" aria-label="Documentation sections">${docTabs
      .map(
        t =>
          `<a href="${escapeHtml(tabHref(t))}"${t.tab === tabName ? ' aria-current="true"' : ""}>${escapeHtml(t.tab)}</a>`,
      )
      .join("")}</nav>`;
    const tab = tabs.find(t => t.tab === tabName);
    if (!tab) return switcher;
    const items = (list: (string | NavGroup)[]): string =>
      list
        .map(item => {
          if (typeof item === "string") {
            if (!bySlug.has(item)) return "";
            return `<li><a href="${pageUrl(item)}"${item === current ? ' aria-current="page"' : ""}>${escapeHtml(titles.get(item) ?? item)}</a></li>`;
          }
          return `<li><span class="muted">${escapeHtml(item.group)}</span><ul>${items(item.items)}</ul></li>`;
        })
        .join("");
    return switcher + tab.groups.map(g => `<p>${escapeHtml(g.group)}</p><ul>${items(g.items)}</ul>`).join("");
  };

  // Gabarit commun : marque, lien GitHub et pied de page viennent des données quand elles existent.
  const footer = siteFooter(data, o);
  const page = (s: Omit<Shell, "origin" | "footer" | "github">) =>
    shell({
      ...s,
      origin: o.origin,
      footer,
      github: data?.org ? `https://github.com/${data.org.login}` : `https://github.com/${o.repo}`,
    });
  const titled = (title: string) => (title === "Aphrody" ? title : `${title} - Aphrody`);

  // Liste des guides (remplace <GuidesList />)
  const guidesTab = tabs.find(t => t.tab === "Guides");
  const guidesHtml = guidesTab
    ? guidesTab.groups
        .filter(g => g.items.some(i => typeof i === "string" && i !== "guides/index" && bySlug.has(i)))
        .map(
          g =>
            `<h2 id="${escapeHtml(g.group.toLowerCase().replace(/[^a-z0-9]+/g, "-"))}">${escapeHtml(g.group)}</h2><div class="card-group">${g.items
              .filter((i): i is string => typeof i === "string" && i !== "guides/index" && bySlug.has(i))
              .map(
                i =>
                  `<div class="card"><p class="card-title"><a href="${pageUrl(i)}">${escapeHtml(bySlug.get(i)!.title)}</a></p><p class="muted">${escapeHtml(bySlug.get(i)!.description)}</p></div>`,
              )
              .join("")}</div>`,
        )
        .join("\n")
    : "";

  const mdxCtx = { link: (href: string) => href, guides: guidesHtml };
  const search: { t: string; d: string; u: string; g: string; h: string[]; x: string }[] = [];
  const ordered = rendered;

  for (let i = 0; i < ordered.length; i++) {
    const p = ordered[i]!;
    const md = mdxToHtmlMarkdown(p.markdown, mdxCtx);
    let html = highlightHtml(prefixDocsLinks(Bun.markdown.html(md, { headings: { ids: true } })));
    html = html.replace(/<h1 id="[^"]*">[\s\S]*?<\/h1>\n?/, (h, offset) => (offset < 4 ? "" : h));
    const toc = extractToc(html);
    const url = pageUrl(p.slug);
    const mdUrl = markdownUrl(p.slug);
    const prev = ordered[i - 1];
    const next = ordered[i + 1];
    const pager = `<nav class="pager">${prev ? `<a href="${pageUrl(prev.slug)}"><small>Previous</small>${escapeHtml(prev.title)}</a>` : ""}${next ? `<a class="next" href="${pageUrl(next.slug)}"><small>Next</small>${escapeHtml(next.title)}</a>` : ""}</nav>`;
    const body = `<p class="muted">Runtime docs · ${escapeHtml(p.tab)} · ${escapeHtml(p.group)}</p>
<h1>${escapeHtml(p.title)}</h1>
${p.description ? `<p class="lead">${inlineCode(p.description)}</p>` : ""}
<div class="page-actions"><button type="button" data-copy-url="${mdUrl}">Copy page</button><a href="${mdUrl}">View as Markdown</a><a href="https://github.com/${o.repo}/edit/main/${p.file}">Edit on GitHub</a></div>
<article>${html}</article>
${pager}`;
    write(
      join(o.out, "docs", p.slug + ".html"),
      page({
        path: url,
        title: titled(p.title),
        description: p.description,
        body,
        tabs: topTabs("Docs"),
        sidebar: sidebarFor(p.tab, p.slug),
        toc,
        alternateMarkdown: mdUrl,
      }),
    );
    const markdown = pageMarkdown(p, o.origin);
    write(join(o.out, "docs", p.slug + ".md"), markdown);
    if (p.slug.endsWith("/index")) write(join(o.out, "docs", p.slug.slice(0, -6) + ".md"), markdown);
    search.push({
      t: p.title,
      d: p.description,
      u: url,
      g: `Runtime docs · ${p.group}`,
      h: toc.map(h => h.text),
      x: textOf(html).slice(0, 240),
    });
  }

  // Pages générées : HTML, variante .md, entrée de recherche
  const renderMarkdown = (markdown: string) =>
    highlightHtml(Bun.markdown.html(markdown, { headings: { ids: true } } as any));
  const generatedFile = (path: string, ext: string) =>
    join(o.out, path === "/" ? `index${ext}` : `${path.slice(1)}${ext}`);
  const generatedMarkdown = (g: GeneratedPage) =>
    `# ${g.title}\n\n${g.description ? `> ${g.description}\n\n` : ""}${absolutizeRootLinks(g.markdown, o.origin)}\n`;
  for (const g of generated) {
    const html = renderMarkdown(g.markdown);
    const mdUrl = g.path === "/" ? "/index.md" : `${g.path}.md`;
    const body =
      g.path === "/"
        ? `${renderHero(data!)}\n<article>${html}</article>`
        : `<h1>${escapeHtml(g.title)}</h1>
${g.description ? `<p class="lead">${escapeHtml(g.description)}</p>` : ""}
<div class="page-actions"><button type="button" data-copy-url="${mdUrl}">Copy page</button><a href="${mdUrl}">View as Markdown</a></div>
<article>${html}</article>`;
    write(
      g.path === "/" ? join(o.out, "index.html") : join(o.out, g.path.slice(1), "index.html"),
      page({
        path: g.path,
        title: titled(g.title),
        description: g.description,
        body,
        tabs: topTabs(g.tab),
        toc: g.path === "/" ? undefined : extractToc(html),
        alternateMarkdown: mdUrl,
        bodyClass: g.path === "/" ? "home" : undefined,
      }),
    );
    write(generatedFile(g.path, ".md"), generatedMarkdown(g));
    search.push({
      t: g.title,
      d: g.description,
      u: g.path,
      g: "Aphrody",
      h: extractToc(html).map(h => h.text),
      x: textOf(html).slice(0, 240),
    });
  }
  if (data) write(join(o.out, "components.json"), JSON.stringify(componentsJson(data), null, 2) + "\n");
  write(join(o.out, "docs", "search.json"), JSON.stringify(search));

  // Ressources des docs (images, icônes, logos)
  for (const dir of ["images", "icons", "logo"]) {
    const from = join(docs, dir);
    if (existsSync(from)) cpSync(from, join(o.out, "docs", dir), { recursive: true });
  }
  for (const name of SITE_ROOT_FILES) {
    const from = join(docs, "logo", name);
    if (existsSync(from)) cpSync(from, join(o.out, name));
  }

  // llms.txt / llms-full.txt (format llmstxt.org)
  const summary = data?.distribution?.summary ? plainText(data.distribution.summary) : "";
  const llms = [
    "# Aphrody",
    "",
    ...(summary ? [`> ${summary}`, ""] : []),
    `Site built from ${o.repo}@${o.commit.slice(0, 12)}${data?.distribution ? ` and ${data.distribution.repo}@${data.distribution.commit.slice(0, 12)}` : ""}.`,
    "",
    ...(generated.length
      ? [
          "## Aphrody",
          "",
          ...generated.map(
            g =>
              `- [${g.title}](${o.origin}${g.path === "/" ? "/index.md" : `${g.path}.md`})${g.description ? `: ${g.description}` : ""}`,
          ),
          "",
        ]
      : []),
    `## Runtime docs (${o.repo})`,
    "",
    ...ordered.map(
      p =>
        `- [${p.title}](${o.origin}${markdownUrl(p.slug)})${p.description ? `: ${p.description.replace(/\s+/g, " ")}` : ""}`,
    ),
    "",
    "## Optional",
    "",
    `- [Runtime install script (bash)](${o.origin}/install)`,
    `- [Runtime install script (PowerShell)](${o.origin}/install.ps1)`,
    `- [Downloads](${o.origin}/downloads)`,
    `- [Benchmarks](${o.origin}/benchmarks)`,
    `- [Release notes](${o.origin}/release-notes)`,
    ...(data ? [`- [Components (JSON)](${o.origin}/components.json)`] : []),
    `- [Runtime source](https://github.com/${o.repo})`,
    `- [Upstream Bun API reference](https://bun.com/reference)`,
    "",
  ].join("\n");
  write(join(o.out, "llms.txt"), llms);
  write(
    join(o.out, "llms-full.txt"),
    [
      ...generated.map(
        g => `# ${g.title}\nSource: ${o.origin}${g.path}\n\n${absolutizeRootLinks(g.markdown, o.origin)}\n`,
      ),
      ...ordered.map(
        p =>
          `# ${p.title}\nSource: ${o.origin}${pageUrl(p.slug)}\n\n${p.description ? p.description + "\n\n" : ""}${absolutizeMarkdownLinks(p.markdown, o.origin)}\n`,
      ),
    ].join("\n"),
  );

  // /guides -> /docs/guides, /blog -> /release-notes
  write(join(o.out, "guides", "index.html"), redirectPage(o.origin, "/docs/guides"));
  write(join(o.out, "blog", "index.html"), redirectPage(o.origin, "/release-notes"));

  // Téléchargements et notes de version : la distribution (données), puis le runtime (releases GitHub)
  const releases = o.releases;
  const latest = latestRuntimeRelease(releases);
  const distDownloads = data ? renderMarkdown(distributionDownloads(data)) : "";
  write(
    join(o.out, "downloads", "index.html"),
    page({
      path: "/downloads",
      title: titled("Downloads"),
      description: "Aphrody distribution artifacts and runtime builds, with SHA-256 checksums.",
      body: `<h1>Downloads</h1>${distDownloads}${highlightHtml(renderDownloads(releases, latest, o, data))}`,
      tabs: topTabs("Downloads"),
      toc: extractToc(distDownloads),
    }),
  );
  const distNotes = data ? renderMarkdown(distributionReleaseNotes(data)) : "";
  write(
    join(o.out, "release-notes", "index.html"),
    page({
      path: "/release-notes",
      title: titled("Release notes"),
      description: "Releases of the Aphrody distribution and of its runtime.",
      body: `<h1>Release notes</h1>${distNotes}${renderRuntimeNotes(releases, o)}`,
      tabs: topTabs("Release notes"),
    }),
  );

  // Benchmarks
  const reports = loadPerfReports(o.perf);
  write(
    join(o.out, "benchmarks", "index.html"),
    page({
      path: "/benchmarks",
      title: titled("Benchmarks"),
      description: "Measured performance of the Aphrody runtime against upstream Bun, and how to reproduce it.",
      body: highlightHtml(renderBenchmarks(reports, o, latest)),
      tabs: topTabs("Benchmarks"),
      toc: reports.map(r => ({ level: 2, id: r.platform, text: r.platform })),
    }),
  );

  // Scripts d'installation du runtime et de build depuis les sources
  const scripts: [string, string][] = [
    ["scripts/aphrody/install.sh", "install"],
    ["scripts/aphrody/install.sh", "install.sh"],
    ["scripts/aphrody/install.ps1", "install.ps1"],
    ["scripts/aphrody/install-dev.sh", "bun/setup.sh"],
    ["scripts/aphrody/install-dev.ps1", "bun/setup.ps1"],
  ];
  const served: string[] = [];
  for (const [from, to] of scripts) {
    const file = join(o.src, from);
    if (!existsSync(file)) continue;
    write(join(o.out, to), readFileSync(file));
    served.push(to);
  }

  // Accueil sans données : la doc et les téléchargements du runtime seulement
  if (!generatedPaths.has("/"))
    write(
      join(o.out, "index.html"),
      page({
        path: "/",
        title: "Aphrody",
        body: `<section class="hero"><div class="pet" role="img" aria-label="Aphrody"></div><h1>Aphrody</h1>
<p class="lead">Runtime ${link(o.repo, `https://github.com/${o.repo}`)}${latest ? `, release ${link(latest.tag, latest.url)}` : ""}.</p>
${runtimeInstallCommands(o.origin)}
<div class="btns"><a class="btn" href="/docs">Runtime docs</a><a class="btn tonal" href="/downloads">Downloads</a></div></section>`,
        tabs: topTabs(),
        bodyClass: "home",
      }),
    );

  // 404, robots, sitemap, ressources, manifeste
  write(
    join(o.out, "404.html"),
    page({
      path: "/404",
      title: titled("Not found"),
      body: `<div class="hero"><h1>404</h1><p class="lead">This page does not exist. Try the <a href="/">home page</a>, the <a href="/docs">runtime docs</a> or the search box.</p></div>`,
      tabs: topTabs(),
    }),
  );
  write(join(o.out, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${o.origin}/sitemap.xml\n`);
  const urls = [
    "/",
    ...generated.map(g => g.path),
    "/docs",
    "/benchmarks",
    "/downloads",
    "/release-notes",
    ...ordered.map(p => pageUrl(p.slug)),
  ];
  write(
    join(o.out, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[
      ...new Set(urls),
    ]
      .map(u => `<url><loc>${escapeHtml(o.origin + u)}</loc><lastmod>${now.slice(0, 10)}</lastmod></url>`)
      .join("\n")}\n</urlset>\n`,
  );
  write(join(o.out, "assets", "site.css"), CSS + HIGHLIGHT_CSS);
  write(join(o.out, "assets", "site.js"), JS);
  write(
    join(o.out, "site.json"),
    JSON.stringify(
      {
        schemaVersion: 1,
        generatedAt: now,
        repo: o.repo,
        commit: o.commit,
        distribution: data?.distribution ? { repo: data.distribution.repo, commit: data.distribution.commit } : null,
        dataGeneratedAt: data?.generatedAt ?? null,
        pages: ordered.length,
        generated: generated.map(g => g.path),
        latestRelease: latest?.tag ?? null,
        perfReports: reports.map(r => r.platform),
        scripts: served,
      },
      null,
      2,
    ) + "\n",
  );

  // Variantes gzip servies par l'origine (Accept-Encoding) pour les fichiers texte.
  for (const file of walk(o.out)) {
    if (!/\.(html|md|txt|json|xml|css|js|svg|sh|ps1)$|[\\/]install$/.test(file)) continue;
    const content = readFileSync(file);
    if (content.length < 1024) continue;
    write(file + ".gz", Bun.gzipSync(content, { level: 9 }));
  }
  return {
    pages: ordered.length,
    generated: generated.map(g => g.path),
    latest: latest?.tag ?? null,
    reports: reports.length,
    scripts: served,
  };
}

export function pageMarkdown(p: { title: string; description: string; markdown: string }, origin: string): string {
  return `# ${p.title}\n\n${p.description ? `> ${p.description.replace(/\s+/g, " ")}\n\n` : ""}${absolutizeMarkdownLinks(p.markdown, origin)}\n`;
}

const redirectPage = (origin: string, to: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Redirecting</title><link rel="canonical" href="${origin}${to}"><meta http-equiv="refresh" content="0; url=${to}"></head><body><a href="${to}">${origin}${to}</a></body></html>\n`;

const link = (text: string, href: string) => `<a href="${escapeHtml(href)}">${escapeHtml(text)}</a>`;

const cmd = (label: string, text: string) =>
  `<button class="cmd" type="button" data-copy="${escapeHtml(text)}"><span>${escapeHtml(label)}</span><code>${escapeHtml(text)}</code></button>`;

/** Commandes des scripts d'installation du runtime servis par ce site (/install, /install.ps1). */
function runtimeInstallCommands(origin: string) {
  const host = new URL(origin).host;
  return `<div class="cmds">${cmd("Runtime, Linux and macOS (bash)", `curl -fsSL ${origin}/install | bash`)}${cmd("Runtime, Windows (PowerShell)", `powershell -c "irm ${host}/install.ps1|iex"`)}</div>`;
}

/** En-tête de l'accueil : résumé de la distribution, commandes d'installation de ses scripts publiés. */
function renderHero(d: SiteData): string {
  const summary = d.distribution?.summary
    ? Bun.markdown
        .html(d.distribution.summary)
        .trim()
        .replace(/^<p>|<\/p>$/g, "")
    : "";
  const installers = distributionInstallers(d);
  const release = d.downloads?.release;
  return `<section class="hero">
<div class="pet" role="img" aria-label="Aphrody"></div>
<h1>Aphrody</h1>
${summary ? `<p class="lead">${summary}</p>` : ""}
${installers.length ? `<div class="cmds">${installers.map(i => cmd(i.label, i.command)).join("")}</div>` : ""}
<div class="btns"><a class="btn" href="/components">Components</a><a class="btn tonal" href="/downloads">Downloads${release ? ` · ${escapeHtml(release)}` : ""}</a><a class="btn outlined" href="/docs">Runtime docs</a></div>
</section>`;
}

/** Pied de page : sources du build et licences, tirées des données. */
function siteFooter(d: SiteData | null, o: BuildOptions): string {
  const sources = [
    `${link(o.repo, `https://github.com/${o.repo}`)}@${escapeHtml(o.commit.slice(0, 12))}`,
    ...(d?.distribution
      ? [`${escapeHtml(d.distribution.repo)}@${escapeHtml(d.distribution.commit.slice(0, 12))}`]
      : []),
  ];
  const rt = d?.runtime;
  const licences = [
    ...(d?.distribution?.workspace.license
      ? [
          `first-party code ${escapeHtml(d.distribution.workspace.license)} (per component on ${link("Components", "/components")})`,
        ]
      : []),
    ...(rt
      ? [
          `the runtime is a fork of ${link(rt.upstream.name, rt.upstream.url)}${rt.licenses.length ? ` (${escapeHtml(rt.licenses.join(", "))}, ${link(rt.license, `https://github.com/${rt.repo}/blob/main/${rt.license}`)})` : ""}`,
        ]
      : []),
  ];
  const links = [
    ["Docs", "/docs"],
    ["Downloads", "/downloads"],
    ["Release notes", "/release-notes"],
    ...(d
      ? [
          ["Components", "/components"],
          ["Security", "/security"],
          ["Contributing", "/contributing"],
          ["About", "/about"],
        ]
      : []),
    ["llms.txt", "/llms.txt"],
  ];
  return `<p>Generated from ${sources.join(" and ")}${d ? ` (data collected ${escapeHtml(d.generatedAt.slice(0, 10))})` : ""}.${licences.length ? ` Licences: ${licences.join("; ")}.` : ""}</p>
<p>${links.map(([label, href]) => link(label!, href!)).join(" · ")}</p>`;
}

function renderDownloads(
  releases: Release[] | null,
  latest: Release | undefined,
  o: BuildOptions,
  data: SiteData | null,
): string {
  const head = `<h2 id="runtime">Runtime (${escapeHtml(o.repo)})</h2><p>Release builds from <a href="https://github.com/${o.repo}/releases">GitHub releases</a>, each archive with its SHA-256 from the release <code>SHA256SUMS.txt</code>.</p>
${runtimeInstallCommands(o.origin)}`;
  if (!releases || !latest)
    return `${head}<p class="banner">The release list could not be read when this page was built. See <a href="https://github.com/${o.repo}/releases">GitHub releases</a>.</p>`;
  const osName = { linux: "Linux", darwin: "macOS", windows: "Windows" } as const;
  const groups = new Map<string, string[]>();
  for (const a of latest.assets) {
    const d = describeAsset(a.name);
    if (!d) continue;
    const label = [
      d.arch === "aarch64" ? "arm64" : "x64",
      d.musl ? "musl" : "",
      d.baseline ? "baseline (no AVX2)" : "",
      d.profile ? "profile (debug symbols)" : "",
    ]
      .filter(Boolean)
      .join(", ");
    const row = `<tr><td><a href="${escapeHtml(a.url)}">${escapeHtml(a.name)}</a></td><td>${escapeHtml(label)}</td><td class="num">${formatBytes(a.size)}</td><td class="sha">${a.sha256 ?? "n/a"}</td></tr>`;
    const key = osName[d.os];
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const sums = latest.assets.find(a => a.name.startsWith("SHA256SUMS"));
  const tables = ["Linux", "macOS", "Windows"]
    .filter(k => groups.has(k))
    .map(
      k =>
        `<h4 id="runtime-${k.toLowerCase()}">${k}</h4><table><thead><tr><th>Archive</th><th>Target</th><th class="num">Size</th><th>SHA-256</th></tr></thead><tbody>${groups.get(k)!.join("")}</tbody></table>`,
    )
    .join("");
  const older = releases
    .filter(r => r !== latest)
    .map(
      r =>
        `<li><a href="${escapeHtml(r.url)}">${escapeHtml(r.tag)}</a> <span class="muted">${escapeHtml(r.publishedAt.slice(0, 10))}</span></li>`,
    )
    .join("");
  const base = latest.tag.replace(/^aphrody-v/, "").replace(/-aphrody\.\d+$/, "");
  const npm = data?.runtime?.npm;
  return `${head}
<p class="banner" data-latest-tag="${escapeHtml(latest.tag)}" data-repo="${escapeHtml(o.repo)}" hidden></p>
<h3 id="runtime-latest">${escapeHtml(latest.name)}</h3>
<p class="muted">Tag <a href="${escapeHtml(latest.url)}">${escapeHtml(latest.tag)}</a>, published ${escapeHtml(latest.publishedAt.slice(0, 10))}${sums ? ` · <a href="${escapeHtml(sums.url)}">${escapeHtml(sums.name)}</a>` : ""}.</p>
${tables}
<h3 id="runtime-verify">Verify a runtime download</h3>
<pre><code class="language-bash">curl -fsSLO ${escapeHtml(sums?.url ?? `https://github.com/${o.repo}/releases/download/${latest.tag}/SHA256SUMS.txt`)}
sha256sum --ignore-missing -c ${escapeHtml(sums?.name ?? "SHA256SUMS.txt")}</code></pre>
<p>The runtime install scripts (<a href="/install">/install</a>, <a href="/install.ps1">/install.ps1</a>) pick the archive for the machine, check it against <code>SHA256SUMS.txt</code> and refuse a binary that does not run. They accept a version: <code>curl -fsSL ${escapeHtml(o.origin)}/install | bash -s ${escapeHtml(base)}</code> installs the newest <code>-aphrody.N</code> build of ${escapeHtml(base)}.</p>
${
  npm
    ? `<h3 id="runtime-npm">npm</h3><p><a href="https://www.npmjs.com/package/${escapeHtml(npm.name)}">${escapeHtml(npm.name)}</a>${npm.version ? ` <code>${escapeHtml(npm.version)}</code>` : ""}</p>
<pre><code class="language-bash">bunx ${escapeHtml(npm.name)} --version
npm install -g ${escapeHtml(npm.name)}</code></pre>`
    : ""
}
${older ? `<h3 id="runtime-older">Older runtime releases</h3><ul>${older}</ul>` : ""}`;
}

function renderRuntimeNotes(releases: Release[] | null, o: BuildOptions): string {
  const head = `<h2 id="runtime">Runtime (${escapeHtml(o.repo)})</h2>`;
  if (!releases?.length)
    return `${head}<p>See <a href="https://github.com/${o.repo}/releases">GitHub releases</a>.</p>`;
  return `${head}<p>Releases of the runtime. Upstream Bun release notes are on <a href="https://bun.com/blog">bun.com/blog</a>.</p>
${releases
  .map(
    r =>
      `<article><h3 id="${escapeHtml(r.tag)}"><a href="${escapeHtml(r.url)}">${escapeHtml(r.name)}</a></h3><p class="muted">${escapeHtml(r.publishedAt.slice(0, 10))} · ${r.assets.length} assets</p>${
        r.body.trim()
          ? Bun.markdown.html(r.body, { headings: { ids: false }, tagFilter: true } as any)
          : '<p class="muted">No notes.</p>'
      }</article>`,
  )
  .join("\n")}`;
}

function renderBenchmarks(reports: PerfReport[], o: BuildOptions, latest: Release | undefined): string {
  const base = latest?.tag.replace(/^aphrody-v/, "").replace(/-aphrody\.\d+$/, "");
  const intro = `<h1>Benchmarks</h1>
<p class="lead">The Aphrody runtime against upstream Bun of the same base version. Every number on this page comes from a measured run of <code>scripts/aphrody/perf-gate.ts</code>.</p>`;
  const results = reports.length
    ? `${o.perfRun ? `<p>Source: <a href="${escapeHtml(o.perfRun)}">CI run</a> of the <code>aphrody-perf</code> workflow (artifacts <code>perf-report-*</code>).</p>` : ""}${reports.map(renderPerfTable).join("\n")}`
    : `<p class="banner">No measured report was attached to this build of the site. Run the commands below to measure on your machine.</p>`;
  const thresholds = existsSync(join(o.src, "bench/aphrody/thresholds.json"))
    ? `<p>Thresholds live in <a href="https://github.com/${o.repo}/blob/main/bench/aphrody/thresholds.json"><code>bench/aphrody/thresholds.json</code></a>: a case fails when the runtime median exceeds upstream by more than its ratio <em>and</em> its absolute delta.</p>`
    : "";
  return `${intro}
${results}
<h2 id="what">What is measured</h2>
<ul>${Object.values(PERF_LABELS)
    .map(label => `<li>${inlineCode(label)}</li>`)
    .join("")}<li>Binary size</li></ul>
${thresholds}
<h2 id="run">Run it yourself</h2>
<pre><code class="language-bash">git clone https://github.com/${o.repo} && cd bun
# runtime binary against the upstream release of the same base version
bun scripts/aphrody/perf-gate.ts --fork ~/.bun/bin/bun${base ? ` --upstream-version ${escapeHtml(base)}` : ""} --runs 40 --out tmp/perf</code></pre>
<p>The report is written to <code>tmp/perf/perf-report.md</code> and <code>perf-report.json</code>. The upstream micro-benchmarks of <a href="https://github.com/${o.repo}/tree/main/bench"><code>bench/</code></a> run with <code>cd bench && bun install && bun run &lt;name&gt;</code>.</p>`;
}

// ---------------------------------------------------------------------------------------------------------------

if (import.meta.main) {
  const out = option("--out");
  if (!out) throw new Error("--out <dir> requis");
  const src = resolve(option("--src", join(import.meta.dir, "..", "..", ".."))!);
  const repo = option("--repo", "aphrody-labs/bun")!;
  let commit = option("--commit");
  if (!commit) {
    const r = Bun.spawnSync(["git", "-C", src, "rev-parse", "HEAD"], { stderr: "ignore" });
    commit = r.success ? r.stdout.toString().trim() : "unknown";
  }
  let releases: Release[] | null = null;
  const releasesFile = option("--releases");
  if (releasesFile) releases = JSON.parse(readFileSync(releasesFile, "utf8"));
  else if (!args.includes("--offline")) {
    try {
      releases = await fetchReleases(repo);
    } catch (error) {
      console.warn(`releases: ${(error as Error).message}`);
    }
  }
  const dataFile = option("--data");
  const result = await build({
    src,
    out: resolve(out),
    origin: option("--origin", "https://aphrody.com")!.replace(/\/$/, ""),
    commit,
    repo,
    perf: option("--perf"),
    perfRun: option("--perf-run"),
    releases,
    data: dataFile ? (JSON.parse(readFileSync(dataFile, "utf8")) as SiteData) : null,
  });
  const size = walk(resolve(out)).reduce((n, f) => n + statSync(f).size, 0);
  console.log(
    `site: ${result.pages} docs pages, ${result.generated.length} generated pages, release ${result.latest ?? "none"}, ${result.reports} perf report(s), scripts ${result.scripts.join(", ") || "none"}, ${formatBytes(size)} in ${resolve(out)}`,
  );
}
