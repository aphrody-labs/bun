/** What the build knows about the site, shared by every page. */
export interface Site {
  /** Public origin, no trailing slash. */
  origin: string;
  /** Name in the header: `Aphrody Bun` shows `Bun` as a tag after `Aphrody`. */
  brand: string;
  /** Link of the GitHub icon. */
  github: string;
  /** GitHub repository, `owner/name`. */
  repo: string;
  commit: string;
  /** Bun version this runtime is built from. */
  upstream: { name: string; version: string; url: string };
}

/** URLs of the built assets, which carry content hashes. */
export interface Assets {
  css: string;
  /** Bundled script of a page, by page name; the shared script is `site`. */
  scripts: Record<string, string>;
  /** Chunks the page scripts import, preloaded. */
  chunks: string[];
  fonts: { family: string; url: string; weight: string; stretch: string }[];
}

export interface PageMeta {
  path: string;
  title: string;
  description?: string;
  /** Page name of the script to load besides the shared one. */
  script?: string;
  /** Markdown twin of the page, advertised to agents. */
  alternateMarkdown?: string;
  /** Pages that are not content (404) stay out of search indexes. */
  noindex?: boolean;
}

export interface NavLink {
  label: string;
  href: string;
}

/** A page whose body is HTML produced by the content pipeline (downloads, release notes, benchmarks, generated pages). */
export interface PlainPage {
  path: string;
  title: string;
  description?: string;
  body: string;
  /** Headings of the page, listed beside it when there are several. */
  toc?: TocEntry[];
  alternateMarkdown?: string;
  noindex?: boolean;
}

export interface TocEntry {
  level: number;
  id: string;
  /** HTML: headings may hold inline code. */
  text: string;
}

export type SidebarItem = { title: string; href: string; current: boolean } | { group: string; items: SidebarItem[] };

/** A page of the runtime documentation. */
export interface DocPageData {
  path: string;
  title: string;
  description: string;
  tab: string;
  group: string;
  /** Rendered Markdown of the page. */
  html: string;
  toc: TocEntry[];
  markdownUrl: string;
  editUrl: string;
  previous?: { title: string; href: string };
  next?: { title: string; href: string };
  tabs: { label: string; href: string; current: boolean }[];
  groups: { title: string; items: SidebarItem[] }[];
}

/** What the home page of the runtime site is made of; the renderer decides how it looks. */
export interface HomeInput {
  upstream: { name: string; version: string; url: string };
  /** `bun:python`, `bun:windows`...: the modules this Bun adds. */
  modules: { name: string; href: string; description: string }[];
  release?: { tag: string; name: string; date: string; platforms: string[]; highlights: string[]; commits?: number };
  /** Measured executables: one row per target. */
  measured: { target: string; version: string; source: string; sourceUrl: string; passed: number; failed: number }[];
  docsPages: number;
  /** Docs URL of a documentation slug, falling back to the docs index. */
  doc: (slug: string) => string;
}

/** The look of the site: build.ts hands it the content and writes what it returns. */
export interface Renderer {
  /** Builds the stylesheet, scripts and fonts into `out`; called once before any page is rendered. */
  prepare(out: string): Promise<void>;
  home(input: HomeInput): string;
  doc(page: DocPageData): string;
  page(page: PlainPage): string;
}
