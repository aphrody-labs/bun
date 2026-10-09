// Génère le site statique aphrody.com (miroir de l'infra de bun.sh pour le fork aphrody-labs/bun) :
// /docs (docs/docs.json + .mdx, pages .md brutes, recherche), /guides, /benchmarks, /downloads, /blog,
// /install (+ .sh, .ps1), /bun/setup.sh|ps1, /llms.txt, /llms-full.txt, sitemap.xml, robots.txt.
//
//   bun scripts/aphrody/site/build.ts --out <dir> [--src <arbre du dépôt>] [--origin https://aphrody.com]
//       [--commit <sha>] [--repo aphrody-labs/bun] [--perf <dossier des perf-report.json>] [--perf-run <url>]
//       [--releases <releases.json> | --offline]
//
// --src pointe sur un arbre extrait (git archive) ou sur le dépôt lui-même (défaut). La publication
// (scripts/aphrody/site/publish.ts) extrait origin/main et appelle ce script depuis l'arbre extrait.
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { HIGHLIGHT_CSS, highlightHtml } from "./highlight.ts";
import { CSS, JS, shell, type NavLink } from "./layout.ts";
import {
  absolutizeMarkdownLinks,
  escapeHtml,
  inlineSnippets,
  mdxToHtmlMarkdown,
  parseFrontmatter,
  rewriteUpstreamUrls,
} from "./mdx.ts";

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
export const markdownUrl = (slug: string) =>
  slug === "index" ? "/docs/index.md" : pageUrl(slug) + ".md";

/** URL publique d'une page : `/docs`, `/docs/runtime` (runtime/index), `/docs/runtime/http/server`. */
export const pageUrl = (slug: string) =>
  "/docs" + ("/" + slug).replace(/\/index$/, "").replace(/^\/$/, "");

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

export const formatBytes = (n: number) =>
  n >= 1024 ** 3
    ? `${(n / 1024 ** 3).toFixed(2)} GiB`
    : n >= 1024 ** 2
      ? `${(n / 1024 ** 2).toFixed(1)} MiB`
      : n >= 1024
        ? `${(n / 1024).toFixed(1)} KiB`
        : `${n} B`;

const inlineCode = (s: string) => escapeHtml(s).replace(/`([^`]+)`/g, "<code>$1</code>");

/** Liens racine Mintlify dans le HTML rendu (`/runtime/x`) vers `/docs/runtime/x`. */
export function prefixDocsLinks(html: string): string {
  return html.replace(
    /(href|src)="\/(?!\/|docs(?:\/|"|#)|install|downloads|benchmarks|blog|guides|llms|bun\/|icon\.svg|pet\.webp|assets\/)([^"]*)"/g,
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
    const sums = release.assets.find((a) => /^SHA256SUMS(\.txt)?$/.test(a.name));
    if (sums) {
      const text = await fetch(sums.url, { headers: { "user-agent": "aphrody-site" } }).then((x) =>
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
  const m = /^bun-(linux|darwin|windows)-(x64|aarch64)((?:-musl|-baseline|-profile)*)\.zip$/.exec(
    name,
  );
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
    .filter((p) => p.endsWith("perf-report.json"))
    .sort()
    .map((p) => ({
      platform: relative(dir, dirname(p)).replace(/^perf-report-?/, "") || "report",
      report: JSON.parse(readFileSync(p, "utf8")),
    }));
}

export function renderPerfTable({ platform, report }: PerfReport): string {
  const m = report.meta ?? {};
  const rows = (report.rows ?? []) as any[];
  const body = rows
    .map((r) => {
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
  now?: Date;
};

export async function build(o: BuildOptions) {
  const docs = join(o.src, "docs");
  const docsJson = JSON.parse(readFileSync(join(docs, "docs.json"), "utf8"));
  const { tabs, pages } = readNavigation(docsJson);
  const now = (o.now ?? new Date()).toISOString();
  const readSnippet = (path: string) => {
    const file = join(docs, path);
    return existsSync(file) ? readFileSync(file, "utf8") : undefined;
  };

  // Lecture des pages
  type Rendered = PageInfo & { title: string; description: string; markdown: string; file: string };
  const rendered: Rendered[] = [];
  const titles = new Map<string, string>();
  for (const p of pages) {
    const file = [".mdx", ".md"].map((e) => join(docs, p.slug + e)).find((f) => existsSync(f));
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
  const bySlug = new Map(rendered.map((r) => [r.slug, r]));

  // Onglets du haut
  const tabHref = (t: NavTab) => {
    if (t.href) return t.href.replace(/^https:\/\/bun\.com\/blog$/, "/blog");
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
  const topTabs = (active?: string): NavLink[] => [
    ...tabs
      .filter((t) => t.tab !== "Feedback")
      .map((t) => ({ label: t.tab, href: tabHref(t), active: t.tab === active })),
    { label: "Benchmarks", href: "/benchmarks", active: active === "Benchmarks" },
    { label: "Downloads", href: "/downloads", active: active === "Downloads" },
  ];

  const sidebarFor = (tabName: string, current: string) => {
    const tab = tabs.find((t) => t.tab === tabName);
    if (!tab) return "";
    const items = (list: (string | NavGroup)[]): string =>
      list
        .map((item) => {
          if (typeof item === "string") {
            if (!bySlug.has(item)) return "";
            return `<li><a href="${pageUrl(item)}"${item === current ? ' aria-current="page"' : ""}>${escapeHtml(titles.get(item) ?? item)}</a></li>`;
          }
          return `<li><span class="muted">${escapeHtml(item.group)}</span><ul>${items(item.items)}</ul></li>`;
        })
        .join("");
    return tab.groups
      .map((g) => `<p>${escapeHtml(g.group)}</p><ul>${items(g.items)}</ul>`)
      .join("");
  };

  // Liste des guides (remplace <GuidesList />)
  const guidesTab = tabs.find((t) => t.tab === "Guides");
  const guidesHtml = guidesTab
    ? guidesTab.groups
        .filter((g) =>
          g.items.some((i) => typeof i === "string" && i !== "guides/index" && bySlug.has(i)),
        )
        .map(
          (g) =>
            `<h2 id="${escapeHtml(g.group.toLowerCase().replace(/[^a-z0-9]+/g, "-"))}">${escapeHtml(g.group)}</h2><div class="card-group">${g.items
              .filter(
                (i): i is string => typeof i === "string" && i !== "guides/index" && bySlug.has(i),
              )
              .map(
                (i) =>
                  `<div class="card"><p class="card-title"><a href="${pageUrl(i)}">${escapeHtml(bySlug.get(i)!.title)}</a></p><p class="muted">${escapeHtml(bySlug.get(i)!.description)}</p></div>`,
              )
              .join("")}</div>`,
        )
        .join("\n")
    : "";

  const ctx = { link: (href: string) => href, guides: guidesHtml };
  const search: { t: string; d: string; u: string; g: string; h: string[]; x: string }[] = [];
  const ordered = rendered;

  for (let i = 0; i < ordered.length; i++) {
    const p = ordered[i]!;
    const md = mdxToHtmlMarkdown(p.markdown, ctx);
    let html = highlightHtml(prefixDocsLinks(Bun.markdown.html(md, { headings: { ids: true } })));
    html = html.replace(/<h1 id="[^"]*">[\s\S]*?<\/h1>\n?/, (h, offset) => (offset < 4 ? "" : h));
    const toc = extractToc(html);
    const url = pageUrl(p.slug);
    const mdUrl = markdownUrl(p.slug);
    const prev = ordered[i - 1];
    const next = ordered[i + 1];
    const pager = `<nav class="pager">${prev ? `<a href="${pageUrl(prev.slug)}"><small>Previous</small>${escapeHtml(prev.title)}</a>` : ""}${next ? `<a class="next" href="${pageUrl(next.slug)}"><small>Next</small>${escapeHtml(next.title)}</a>` : ""}</nav>`;
    const body = `<p class="muted">${escapeHtml(p.tab)} · ${escapeHtml(p.group)}</p>
<h1>${escapeHtml(p.title)}</h1>
${p.description ? `<p class="lead">${inlineCode(p.description)}</p>` : ""}
<div class="page-actions"><button type="button" data-copy-url="${mdUrl}">Copy page</button><a href="${mdUrl}">View as Markdown</a><a href="https://github.com/${o.repo}/edit/main/${p.file}">Edit on GitHub</a></div>
<article>${html}</article>
${pager}`;
    write(
      join(o.out, "docs", p.slug + ".html"),
      shell({
        origin: o.origin,
        path: url,
        title: `${p.title} - Bun (Aphrody fork)`,
        description: p.description,
        body,
        tabs: topTabs(p.tab),
        sidebar: sidebarFor(p.tab, p.slug),
        toc,
        alternateMarkdown: mdUrl,
      }),
    );
    const markdown = pageMarkdown(p, o.origin);
    write(join(o.out, "docs", p.slug + ".md"), markdown);
    if (p.slug.endsWith("/index"))
      write(join(o.out, "docs", p.slug.slice(0, -6) + ".md"), markdown);
    search.push({
      t: p.title,
      d: p.description,
      u: url,
      g: p.group,
      h: toc.map((h) => h.text),
      x: textOf(html).slice(0, 240),
    });
  }
  write(join(o.out, "docs", "search.json"), JSON.stringify(search));

  // Ressources des docs (images, icônes, logos)
  for (const dir of ["images", "icons", "logo"]) {
    const from = join(docs, dir);
    if (existsSync(from)) cpSync(from, join(o.out, "docs", dir), { recursive: true });
  }

  // llms.txt / llms-full.txt (format llmstxt.org, comme bun.com/llms.txt)
  const llms = [
    "# Bun (Aphrody fork)",
    "",
    `> Bun is a fast all-in-one JavaScript runtime, package manager, bundler and test runner. This is the documentation of the aphrody-labs/bun fork, built from ${o.repo}@${o.commit.slice(0, 12)}; it adds native Windows APIs (bun:windows, bun:winrt, bun:winui, bun:dotnet), bun msvc, bun n2b, lint and format commands and more on top of upstream Bun.`,
    "",
    "## Docs",
    "",
    ...ordered.map(
      (p) =>
        `- [${p.title}](${o.origin}${markdownUrl(p.slug)})${p.description ? `: ${p.description.replace(/\s+/g, " ")}` : ""}`,
    ),
    "",
    "## Optional",
    "",
    `- [Install script (bash)](${o.origin}/install)`,
    `- [Install script (PowerShell)](${o.origin}/install.ps1)`,
    `- [Downloads](${o.origin}/downloads)`,
    `- [Benchmarks](${o.origin}/benchmarks)`,
    `- [Release notes](${o.origin}/blog)`,
    `- [Source](https://github.com/${o.repo})`,
    `- [Upstream API reference](https://bun.com/reference)`,
    "",
  ].join("\n");
  write(join(o.out, "llms.txt"), llms);
  write(
    join(o.out, "llms-full.txt"),
    ordered
      .map(
        (p) =>
          `# ${p.title}\nSource: ${o.origin}${pageUrl(p.slug)}\n\n${p.description ? p.description + "\n\n" : ""}${absolutizeMarkdownLinks(p.markdown, o.origin)}\n`,
      )
      .join("\n"),
  );

  // /guides -> /docs/guides
  write(join(o.out, "guides", "index.html"), redirectPage(o.origin, "/docs/guides"));

  // Releases, téléchargements et notes de version
  const releases = o.releases;
  const latest = releases?.find((r) => !r.prerelease) ?? releases?.[0];
  write(
    join(o.out, "downloads", "index.html"),
    shell({
      origin: o.origin,
      path: "/downloads",
      title: "Downloads - Bun (Aphrody fork)",
      description:
        "Download Bun (Aphrody fork) for Linux, macOS and Windows, with SHA-256 checksums.",
      body: highlightHtml(renderDownloads(releases, latest, o)),
      tabs: topTabs("Downloads"),
    }),
  );
  write(
    join(o.out, "blog", "index.html"),
    shell({
      origin: o.origin,
      path: "/blog",
      title: "Release notes - Bun (Aphrody fork)",
      description: "Release notes of the aphrody-labs/bun fork.",
      body: renderBlog(releases, o),
      tabs: topTabs("Blog"),
    }),
  );

  // Benchmarks
  const reports = loadPerfReports(o.perf);
  write(
    join(o.out, "benchmarks", "index.html"),
    shell({
      origin: o.origin,
      path: "/benchmarks",
      title: "Benchmarks - Bun (Aphrody fork)",
      description:
        "Measured performance of the Aphrody fork of Bun against upstream Bun, and how to reproduce it.",
      body: highlightHtml(renderBenchmarks(reports, o)),
      tabs: topTabs("Benchmarks"),
      toc: reports.map((r) => ({ level: 2, id: r.platform, text: r.platform })),
    }),
  );

  // Scripts d'installation et de build depuis les sources
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

  // Accueil
  write(
    join(o.out, "index.html"),
    shell({
      origin: o.origin,
      path: "/",
      title: "Bun (Aphrody fork) - fast all-in-one JavaScript runtime",
      description:
        "Bun, Aphrody fork: JavaScript runtime, package manager, bundler and test runner, with native Windows, WinRT, WinUI and .NET APIs.",
      body: renderHome(o, latest, served),
      tabs: topTabs(),
      bodyClass: "home",
    }),
  );

  // 404, robots, sitemap, ressources, manifeste
  write(
    join(o.out, "404.html"),
    shell({
      origin: o.origin,
      path: "/404",
      title: "Not found - Bun (Aphrody fork)",
      body: `<div class="hero"><h1>404</h1><p class="lead">This page does not exist. Try the <a href="/docs">documentation</a> or the search box.</p></div>`,
      tabs: topTabs(),
    }),
  );
  write(join(o.out, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${o.origin}/sitemap.xml\n`);
  const urls = [
    "/",
    "/docs",
    "/benchmarks",
    "/downloads",
    "/blog",
    ...ordered.map((p) => pageUrl(p.slug)),
  ];
  write(
    join(o.out, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[
      ...new Set(urls),
    ]
      .map(
        (u) =>
          `<url><loc>${escapeHtml(o.origin + u)}</loc><lastmod>${now.slice(0, 10)}</lastmod></url>`,
      )
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
        pages: ordered.length,
        latestRelease: latest?.tag ?? null,
        perfReports: reports.map((r) => r.platform),
        scripts: served,
      },
      null,
      2,
    ) + "\n",
  );

  // Variantes gzip servies par l'origine (Accept-Encoding) pour les fichiers texte.
  for (const file of walk(o.out)) {
    if (!/\.(html|md|txt|json|xml|css|js|svg|sh|ps1)$|[\\/]install$/.test(file)) continue;
    const data = readFileSync(file);
    if (data.length < 1024) continue;
    write(file + ".gz", Bun.gzipSync(data, { level: 9 }));
  }
  return {
    pages: ordered.length,
    latest: latest?.tag ?? null,
    reports: reports.length,
    scripts: served,
  };
}

export function pageMarkdown(
  p: { title: string; description: string; markdown: string },
  origin: string,
): string {
  return `# ${p.title}\n\n${p.description ? `> ${p.description.replace(/\s+/g, " ")}\n\n` : ""}${absolutizeMarkdownLinks(p.markdown, origin)}\n`;
}

const redirectPage = (origin: string, to: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Redirecting</title><link rel="canonical" href="${origin}${to}"><meta http-equiv="refresh" content="0; url=${to}"></head><body><a href="${to}">${origin}${to}</a></body></html>\n`;

const cmd = (label: string, text: string) =>
  `<button class="cmd" type="button" data-copy="${escapeHtml(text)}"><span>${escapeHtml(label)}</span><code>${escapeHtml(text)}</code></button>`;

function installCommands(origin: string) {
  const host = new URL(origin).host;
  return `<div class="cmds">${cmd("Linux & macOS", `curl -fsSL ${origin}/install | bash`)}${cmd("Windows", `powershell -c "irm ${host}/install.ps1|iex"`)}</div>`;
}

function renderHome(o: BuildOptions, latest: Release | undefined, served: string[]): string {
  const tile = (tag: string, title: string, text: string, href: string) =>
    `<a class="tile" href="${href}"><span class="tag">${escapeHtml(tag)}</span><h3>${escapeHtml(title)}</h3><p>${inlineCode(text)}</p></a>`;
  return `<section class="hero">
<div class="pet" role="img" aria-label="Aphrody"></div>
<h1>Bun, Aphrody fork</h1>
<p class="lead">A fast all-in-one JavaScript runtime, package manager, bundler and test runner, built from <a href="https://github.com/${o.repo}">${o.repo}</a>: upstream Bun plus native Windows, WinRT, WinUI and .NET APIs, a Rust toolchain story and more.</p>
${installCommands(o.origin)}
<div class="btns"><a class="btn" href="/docs">Read the docs</a><a class="btn tonal" href="/downloads">Downloads${latest ? ` · ${escapeHtml(latest.tag.replace(/^aphrody-v/, ""))}` : ""}</a><a class="btn outlined" href="/benchmarks">Benchmarks</a></div>
</section>
<div class="grid">
${tile("Runtime", "Bun runtime", "Run TypeScript, JSX and JavaScript with `bun run`, a Node.js-compatible runtime on JavaScriptCore.", "/docs/runtime")}
${tile("Package manager", "bun install", "Fast npm-compatible installs, workspaces, lockfile and `bun x`.", "/docs/pm/cli/install")}
${tile("Bundler", "bun build", "Bundle, minify and compile single-file executables.", "/docs/bundler")}
${tile("Test runner", "bun test", "Jest-compatible test runner with snapshots, mocks and coverage.", "/docs/test")}
${tile("Fork", "Windows APIs", "`bun:windows`, `bun:winrt`, `bun:winui` and `bun:dotnet` from JavaScript.", "/docs/runtime/windows")}
${tile("Fork", "bun msvc", "Find, sync and cross-compile with the MSVC toolchain.", "/docs/runtime/msvc")}
${tile("Fork", "bun n2b, lint, fmt", "Node.js to Bun migration, linting and formatting built in.", "/docs/runtime/n2b")}
${tile("Fork", "Module graph", "Inspect the module graph of a project with `bun graph`.", "/docs/runtime/graph")}
</div>
<div class="grid">
${tile("LLMs", "llms.txt", "Index of every documentation page, and llms-full.txt with all of them.", "/llms.txt")}
${tile("Guides", "Guides", "Code samples and walkthroughs for common tasks.", "/docs/guides")}
${served.includes("bun/setup.sh") ? tile("Source", "Build from source", "One command: `curl -fsSL " + o.origin + "/bun/setup.sh | bash` or `irm " + o.origin + "/bun/setup.ps1 | iex`.", existsSync(join(o.src, "docs/project/setup.mdx")) ? "/docs/project/setup" : "/bun/setup.sh") : tile("Source", "Build from source", "Build the fork from its repository.", "/docs/project/contributing")}
${tile("Releases", "Release notes", "Every release of the fork, from GitHub.", "/blog")}
</div>`;
}

function renderDownloads(
  releases: Release[] | null,
  latest: Release | undefined,
  o: BuildOptions,
): string {
  const head = `<h1>Downloads</h1><p class="lead">Release builds of Bun (Aphrody fork) from <a href="https://github.com/${o.repo}/releases">GitHub releases</a>. Every archive is listed with its SHA-256 from the release <code>SHA256SUMS.txt</code>.</p>
${installCommands(o.origin)}`;
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
  const sums = latest.assets.find((a) => a.name.startsWith("SHA256SUMS"));
  const tables = ["Linux", "macOS", "Windows"]
    .filter((k) => groups.has(k))
    .map(
      (k) =>
        `<h3 id="${k.toLowerCase()}">${k}</h3><table><thead><tr><th>Archive</th><th>Target</th><th class="num">Size</th><th>SHA-256</th></tr></thead><tbody>${groups.get(k)!.join("")}</tbody></table>`,
    )
    .join("");
  const older = releases
    .filter((r) => r !== latest)
    .map(
      (r) =>
        `<li><a href="${escapeHtml(r.url)}">${escapeHtml(r.tag)}</a> <span class="muted">${escapeHtml(r.publishedAt.slice(0, 10))}</span></li>`,
    )
    .join("");
  return `${head}
<p class="banner" data-latest-tag="${escapeHtml(latest.tag)}" data-repo="${escapeHtml(o.repo)}" hidden></p>
<h2 id="latest">${escapeHtml(latest.name)}</h2>
<p class="muted">Tag <a href="${escapeHtml(latest.url)}">${escapeHtml(latest.tag)}</a>, published ${escapeHtml(latest.publishedAt.slice(0, 10))}${sums ? ` · <a href="${escapeHtml(sums.url)}">${escapeHtml(sums.name)}</a>` : ""}.</p>
${tables}
<h2 id="verify">Verify a download</h2>
<pre><code class="language-bash">curl -fsSLO ${escapeHtml(sums?.url ?? `https://github.com/${o.repo}/releases/download/${latest.tag}/SHA256SUMS.txt`)}
sha256sum --ignore-missing -c SHA256SUMS.txt</code></pre>
<p>The install scripts (<a href="/install">/install</a>, <a href="/install.ps1">/install.ps1</a>) pick the right archive, check it against <code>SHA256SUMS.txt</code> and refuse a binary that does not run. They accept a version: <code>curl -fsSL ${escapeHtml(o.origin)}/install | bash -s 1.4.3</code>.</p>
<h2 id="npm">npm</h2>
<pre><code class="language-bash">bunx @aphrody/bun-runtime --version
npm install -g @aphrody/bun-runtime</code></pre>
${older ? `<h2 id="older">Older releases</h2><ul>${older}</ul>` : ""}
<p class="muted">Looking for the Aphrody desktop app and CLI? They live at <a href="https://downloads.aphrody.com">downloads.aphrody.com</a>.</p>`;
}

function renderBlog(releases: Release[] | null, o: BuildOptions): string {
  if (!releases?.length)
    return `<h1>Release notes</h1><p>See <a href="https://github.com/${o.repo}/releases">GitHub releases</a>.</p>`;
  return `<h1>Release notes</h1><p class="lead">Releases of the aphrody-labs/bun fork. Upstream release notes are on <a href="https://bun.com/blog">bun.com/blog</a>.</p>
${releases
  .map(
    (r) =>
      `<article><h2 id="${escapeHtml(r.tag)}"><a href="${escapeHtml(r.url)}">${escapeHtml(r.name)}</a></h2><p class="muted">${escapeHtml(r.publishedAt.slice(0, 10))} · ${r.assets.length} assets</p>${
        r.body.trim()
          ? Bun.markdown.html(r.body, { headings: { ids: false }, tagFilter: true } as any)
          : '<p class="muted">No notes.</p>'
      }</article>`,
  )
  .join("\n")}`;
}

function renderBenchmarks(reports: PerfReport[], o: BuildOptions): string {
  const intro = `<h1>Benchmarks</h1>
<p class="lead">How the fork compares with upstream Bun of the same base version. Every number on this page comes from a measured run of <code>scripts/aphrody/perf-gate.ts</code>; nothing is estimated.</p>`;
  const results = reports.length
    ? `${o.perfRun ? `<p>Source: <a href="${escapeHtml(o.perfRun)}">CI run</a> of the <code>aphrody-perf</code> workflow (artifacts <code>perf-report-*</code>).</p>` : ""}${reports.map(renderPerfTable).join("\n")}`
    : `<p class="banner">No measured report was attached to this build of the site. Run the commands below to measure on your machine.</p>`;
  return `${intro}
${results}
<h2 id="what">What is measured</h2>
<ul>
<li>Process start: <code>bun --version</code>, <code>bun -e ''</code>, an empty <code>bun run</code> script and a single empty <code>bun test</code>.</li>
<li>Tooling: <code>bun build</code> of a small project and an offline <code>bun install</code> with a warm cache (<code>bench/aphrody/fixtures</code>).</li>
<li>Module loading: <code>require</code> and <code>import()</code> of every <code>node:*</code> module, <code>bun:*</code> modules and the modules the fork adds.</li>
<li>Server and client: <code>Bun.serve</code> hello world plus first request, local <code>fetch</code> latency (p50, p99) and sequential throughput.</li>
<li>Memory and size: RSS at startup and after loading built-ins, size of the binary.</li>
</ul>
<p>Thresholds live in <a href="https://github.com/${o.repo}/blob/main/bench/aphrody/thresholds.json"><code>bench/aphrody/thresholds.json</code></a>: a case fails when the fork median exceeds upstream by more than its ratio <em>and</em> its absolute delta. The arena (<code>bench/aphrody/arena</code>) adds workloads (compute, JSON, gzip, SQLite, FFI, fetch, serve, startup) with a per-process rank-sum test.</p>
<h2 id="run">Run it yourself</h2>
<pre><code class="language-bash">git clone https://github.com/${o.repo} && cd bun
# fork binary against the upstream release of the same version
bun scripts/aphrody/perf-gate.ts --fork ~/.bun/bin/bun --upstream-version 1.4.3 --runs 40 --out tmp/perf
# with the arena workloads, optionally against Deno
bun scripts/aphrody/perf-gate.ts --fork ~/.bun/bin/bun --arena --deno "$(which deno)"</code></pre>
<p>The report is written to <code>tmp/perf/perf-report.md</code> and <code>perf-report.json</code>. The upstream micro-benchmarks of <a href="https://github.com/${o.repo}/tree/main/bench"><code>bench/</code></a> (ffi, gzip, sqlite, http, websocket, install, bundle...) run with <code>cd bench && bun install && bun run &lt;name&gt;</code>.</p>`;
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
  const result = await build({
    src,
    out: resolve(out),
    origin: option("--origin", "https://aphrody.com")!.replace(/\/$/, ""),
    commit,
    repo,
    perf: option("--perf"),
    perfRun: option("--perf-run"),
    releases,
  });
  const size = walk(resolve(out)).reduce((n, f) => n + statSync(f).size, 0);
  console.log(
    `site: ${result.pages} pages, release ${result.latest ?? "none"}, ${result.reports} perf report(s), scripts ${result.scripts.join(", ") || "none"}, ${formatBytes(size)} in ${resolve(out)}`,
  );
}
