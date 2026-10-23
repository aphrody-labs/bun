import type { ReactNode } from "react";
import type { Assets, NavLink, PageMeta, Site } from "../lib.ts";
import { Icon } from "./Icon.tsx";

export interface ReleaseBanner {
  name: string;
  tag: string;
  date: string;
}

export interface LayoutProps {
  site: Site;
  meta: PageMeta;
  assets: Assets;
  nav: NavLink[];
  /** Footer links, in columns. */
  footer: { title: string; links: NavLink[] }[];
  /** HTML of the line at the foot of the page: the sources of the build and the licences. */
  note: string;
  /** The latest release, announced above the header. */
  release?: ReleaseBanner;
  children: ReactNode;
}

export function Layout({ site, meta, assets, nav, footer, note, release, children }: LayoutProps) {
  const canonical = `${site.origin}${meta.path === "/" ? "/" : meta.path}`;
  const script = meta.script ? assets.scripts[meta.script] : undefined;
  return (
    <html lang="en" className="dark">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{meta.title}</title>
        {meta.description ? <meta name="description" content={meta.description} /> : null}
        {meta.noindex ? <meta name="robots" content="noindex" /> : null}
        <link rel="canonical" href={canonical} />
        {meta.alternateMarkdown ? <link rel="alternate" type="text/markdown" href={meta.alternateMarkdown} /> : null}
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content={site.brand} />
        <meta property="og:title" content={meta.title} />
        <meta property="og:url" content={canonical} />
        <meta property="og:image" content={`${site.origin}/icon-512.png`} />
        {meta.description ? <meta property="og:description" content={meta.description} /> : null}
        <meta name="twitter:card" content="summary" />
        <meta name="theme-color" content="#0d0a0c" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/site.webmanifest" />
        {assets.fonts.map(font => (
          <link key={font.url} rel="preload" href={font.url} as="font" type="font/woff2" crossOrigin="anonymous" />
        ))}
        <style
          dangerouslySetInnerHTML={{
            __html: assets.fonts
              .map(
                font =>
                  `@font-face{font-family:"${font.family}";src:url(${font.url}) format("woff2");font-weight:${font.weight};font-stretch:${font.stretch};font-display:swap}`,
              )
              .join(""),
          }}
        />
        <link rel="stylesheet" href={assets.css} />
        {assets.chunks.map(chunk => (
          <link key={chunk} rel="modulepreload" href={chunk} />
        ))}
        <script type="module" src={assets.scripts.site} />
        {script ? <script type="module" src={script} /> : null}
        {assets.scripts.webmcp ? <script src={assets.scripts.webmcp} defer /> : null}
      </head>
      <body className="flex min-h-screen flex-col bg-canvas text-fg">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-fg focus:px-3 focus:py-2 focus:text-canvas"
        >
          Skip to content
        </a>
        {release ? <Announcement release={release} /> : null}
        <Header nav={nav} path={meta.path} site={site} />
        <main id="main" data-pagefind-body className="flex-1">
          {children}
        </main>
        <Footer site={site} columns={footer} note={note} />
      </body>
    </html>
  );
}

function Announcement({ release }: { release: ReleaseBanner }) {
  return (
    <a
      href={`/release-notes#${release.tag}`}
      className="border-b border-line bg-subtle no-underline hover:bg-raised"
      data-pagefind-ignore
    >
      <div className="mx-auto flex min-h-[2.375rem] max-w-site items-center justify-center gap-2 px-gutter py-2 text-center text-[0.8125rem] text-fg-muted">
        <span className="bg-accent px-1.5 font-mono text-[0.625rem] font-semibold uppercase tracking-wider text-canvas">
          New
        </span>
        <span>
          <strong className="font-semibold text-fg">{release.name}</strong> is out
          <span className="hidden sm:inline">, {release.date}</span>. Release notes
        </span>
        <Icon name="arrow_forward" className="text-fg" />
      </div>
    </a>
  );
}

function Header({ nav, path, site }: { nav: NavLink[]; path: string; site: Site }) {
  const [first = site.brand, ...rest] = site.brand.split(" ");
  const current = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas" data-pagefind-ignore>
      <div className="mx-auto flex h-16 max-w-site items-center gap-6 px-gutter">
        <a href="/" className="flex items-center gap-2.5 no-underline" aria-label={`${site.brand}, home`}>
          <img src="/icon-192.png" alt="" width="32" height="32" className="size-8 rounded-full bg-raised" />
          <span className="font-display text-[1.6rem] font-extrabold leading-none tracking-tight [font-stretch:78%]">
            {first}
          </span>
          {rest.length ? (
            <span className="border border-line-strong px-1.5 py-0.5 font-mono text-[0.625rem] font-medium uppercase tracking-wider text-fg-muted">
              {rest.join(" ")}
            </span>
          ) : null}
        </a>
        <nav aria-label="Sections" className="hidden items-center gap-1 md:flex">
          {nav.map(link => (
            <a
              key={link.href}
              href={link.href}
              aria-current={current(link.href) ? "page" : undefined}
              className="px-3 py-2 text-[0.9375rem] font-medium text-fg-muted no-underline transition-colors hover:text-fg aria-[current=page]:text-fg"
            >
              {link.label}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <div className="relative hidden sm:block">
            <label className="flex h-9 w-56 cursor-text items-center gap-2 border border-line bg-canvas px-3 text-fg-faint focus-within:border-fg-muted lg:w-72">
              <Icon name="search" className="text-base" />
              <input
                id="q"
                type="search"
                placeholder="Search docs, APIs"
                aria-label="Search the site"
                autoComplete="off"
                className="min-w-0 flex-1 bg-transparent text-[0.875rem] text-fg outline-none placeholder:text-fg-faint [&::-webkit-search-cancel-button]:hidden"
              />
              <kbd className="border border-line px-1.5 font-mono text-[0.625rem] leading-5">/</kbd>
            </label>
            <div
              id="results"
              role="listbox"
              hidden
              className="absolute right-0 top-11 z-50 max-h-[70vh] w-[min(92vw,30rem)] overflow-auto border border-line-strong bg-canvas p-1"
            />
          </div>
          <a
            href={site.github}
            aria-label="GitHub"
            className="grid size-9 place-items-center border border-line text-lg text-fg-muted hover:border-line-strong hover:text-fg"
          >
            <Icon name="github" />
          </a>
          <a href="/downloads" className="btn btn-primary hidden h-9 sm:inline-flex">
            Install
          </a>
          <details className="relative md:hidden">
            <summary
              aria-label="Menu"
              className="grid size-9 cursor-pointer list-none place-items-center border border-line text-lg [&::-webkit-details-marker]:hidden"
            >
              <Icon name="menu" />
            </summary>
            <div className="absolute right-0 top-11 z-50 w-56 border border-line-strong bg-canvas p-1">
              {nav.map(link => (
                <a
                  key={link.href}
                  href={link.href}
                  className="block px-3 py-2.5 text-fg-muted no-underline hover:bg-raised hover:text-fg"
                >
                  {link.label}
                </a>
              ))}
              <a href="/downloads" className="block px-3 py-2.5 font-semibold text-accent no-underline hover:bg-raised">
                Install
              </a>
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}

function Footer({ columns, note }: { site: Site; columns: LayoutProps["footer"]; note: string }) {
  return (
    <footer className="mt-24 border-t border-line" data-pagefind-ignore>
      <div className="mx-auto grid max-w-site gap-12 px-gutter py-14 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <a href="/" className="inline-flex items-center gap-2.5 no-underline">
            <img src="/icon-192.png" alt="" width="32" height="32" className="size-8 rounded-full bg-raised" />
            <span className="font-display text-2xl font-extrabold leading-none tracking-tight [font-stretch:78%]">
              Aphrody
            </span>
          </a>
          <p className="mt-4 max-w-xs text-sm text-fg-faint">
            Bun with Windows, Linux, Python, .NET and media built in. Maintained by Aphrody Labs.
          </p>
        </div>
        {columns.map(column => (
          <nav key={column.title} aria-label={column.title}>
            <h2 className="eyebrow mb-4">{column.title}</h2>
            <ul className="m-0 grid list-none gap-2.5 p-0 text-sm">
              {column.links.map(link => (
                <li key={link.href}>
                  <a href={link.href} className="text-fg-muted no-underline hover:text-fg">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-line">
        <div
          className="mx-auto grid max-w-site gap-2 px-gutter py-5 font-mono text-[0.6875rem] leading-relaxed text-fg-faint [&_a]:text-fg-muted [&_a]:underline [&_a]:decoration-line-strong [&_a]:underline-offset-4 [&_a:hover]:text-fg [&_p]:m-0"
          dangerouslySetInnerHTML={{ __html: note }}
        />
      </div>
    </footer>
  );
}
