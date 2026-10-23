/**
 * The renderer of the Bun site: React components rendered to static HTML around the stylesheet and scripts bundled by
 * Bun.build. site/build.ts owns the content (docs, releases, benchmarks); this owns how it looks.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { highlightHtml } from "../site/highlight.ts";
import { buildAssets } from "./build.ts";
import recorded from "./src/data/recorded.json" with { type: "json" };
import type { Recorded } from "./src/data/scenes.ts";
import { DocPage } from "./src/components/DocPage.tsx";
import { Layout, type ReleaseBanner } from "./src/components/Layout.tsx";
import { PlainPage } from "./src/components/PlainPage.tsx";
import type {
  Assets,
  DocPageData,
  HomeInput,
  NavLink,
  PageMeta,
  PlainPage as PlainPageData,
  Renderer,
  Site,
} from "./src/lib.ts";
import { Home } from "./src/pages/Home.tsx";

export interface RendererOptions {
  site: Site;
  nav: NavLink[];
  /** HTML of the line at the foot of every page. */
  note: string;
  release?: ReleaseBanner;
}

/** Colours a program with the build's highlighter. */
export function highlightCode(code: string, language = "typescript"): string {
  const escaped = code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return highlightHtml(`<pre><code class="language-${language}">${escaped}</code></pre>`);
}

export function createRenderer(options: RendererOptions): Renderer {
  const { site, nav, note, release } = options;
  const columns = [
    {
      title: "Docs",
      links: [
        { label: "Quickstart", href: "/docs/quickstart" },
        { label: "Runtime", href: "/docs/runtime" },
        { label: "Bundler", href: "/docs/bundler" },
        { label: "Test runner", href: "/docs/test" },
      ],
    },
    {
      title: "Project",
      links: [
        { label: "Downloads", href: "/downloads" },
        { label: "Release notes", href: "/release-notes" },
        { label: "Benchmarks", href: "/benchmarks" },
        { label: "llms.txt", href: "/llms.txt" },
      ],
    },
    {
      title: "Aphrody",
      links: [
        { label: "GitHub", href: site.github },
        { label: "npm", href: "https://www.npmjs.com/org/aphrody" },
        { label: "aphrody.com", href: "https://aphrody.com" },
      ],
    },
  ];
  let assets: Assets | undefined;
  const document = (meta: PageMeta, children: React.ReactNode) =>
    `<!doctype html>${renderToStaticMarkup(
      <Layout site={site} assets={assets!} nav={nav} footer={columns} note={note} release={release} meta={meta}>
        {children}
      </Layout>,
    )}`;
  return {
    async prepare(out) {
      assets = await buildAssets(out);
    },
    home(input: HomeInput) {
      const props = {
        ...input,
        origin: site.origin,
        repo: site.repo,
        scenes: recorded as Recorded[],
        highlight: highlightCode,
      };
      return document(
        {
          path: "/",
          title: site.brand,
          description:
            "Bun with native modules for Windows, Linux, Python, .NET and media. One binary runs, installs, tests and bundles your code.",
          script: "page-home",
        },
        <Home {...props} />,
      );
    },
    doc(page: DocPageData) {
      return document(
        {
          path: page.path,
          title: `${page.title} - ${site.brand}`,
          description: page.description,
          alternateMarkdown: page.markdownUrl,
        },
        <DocPage page={page} />,
      );
    },
    page(page: PlainPageData) {
      return document(
        {
          path: page.path,
          title: page.title === site.brand ? page.title : `${page.title} - ${site.brand}`,
          description: page.description,
          alternateMarkdown: page.alternateMarkdown,
          noindex: page.noindex,
        },
        <PlainPage page={page} />,
      );
    },
  };
}
