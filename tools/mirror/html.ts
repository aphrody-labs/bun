// HTML passes over a mirrored page, both with HTMLRewriter:
//   scanHtml     title, searchable text and the same-origin assets the page needs
//   rewriteHtml  the page as the mirror serves it: origin links made root-relative (or pointed at the
//                configured host), third-party tracking scripts removed
import type { Config } from "./config.ts";
import { normalizeUrl } from "./sitemap.ts";

const URL_ATTRS: [selector: string, attr: string][] = [
  ["a[href]", "href"],
  ["link[href]", "href"],
  ["script[src]", "src"],
  ["img[src]", "src"],
  ["source[src]", "src"],
  ["video[src]", "src"],
  ["video[poster]", "poster"],
  ["audio[src]", "src"],
  ["iframe[src]", "src"],
  ["form[action]", "action"],
  ["meta[property='og:image'][content]", "content"],
  ["meta[property='og:url'][content]", "content"],
  ["meta[name='twitter:image'][content]", "content"],
];
const SRCSET = ["img[srcset]", "source[srcset]", "link[imagesrcset]"];
const NO_TEXT = "script, style, noscript, svg, template";

export interface Scan {
  title: string;
  text: string;
  assets: string[];
  links: string[];
}

function isAsset(url: URL, cfg: Config): boolean {
  if (url.pathname.startsWith("/_next/")) return true;
  const ext = url.pathname.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  return ext !== undefined && cfg.origin.asset_extensions.includes(ext);
}

function resolve(value: string, pageUrl: string): URL | null {
  if (!value || /^(data|mailto|tel|javascript|blob|about):/i.test(value) || value.startsWith("#")) return null;
  try {
    return new URL(value, pageUrl);
  } catch {
    return null;
  }
}

const srcsetUrls = (value: string): string[] => value.split(",").map((part) => part.trim().split(/\s+/)[0]!).filter(Boolean);

export async function scanHtml(html: Uint8Array, pageUrl: string, cfg: Config): Promise<Scan> {
  const origin = new URL(cfg.origin.url).origin;
  const assets = new Set<string>();
  const links = new Set<string>();
  let title = "";
  let text = "";
  let skip = 0;
  const take = (value: string | null): void => {
    const url = value ? resolve(value, pageUrl) : null;
    if (!url || url.origin !== origin) return;
    if (isAsset(url, cfg)) assets.add(normalizeUrl(url.href));
    else links.add(normalizeUrl(url.href));
  };
  let rewriter = new HTMLRewriter()
    .on("title", { text: (t) => void (title += t.text) })
    .on(NO_TEXT, { element: (el) => (skip++, el.onEndTag(() => void skip--)) })
    .on("body", { text: (t) => void (skip === 0 && (text += t.text, t.lastInTextNode && (text += " "))) });
  for (const [selector, attr] of URL_ATTRS) rewriter = rewriter.on(selector, { element: (el) => take(el.getAttribute(attr)) });
  for (const selector of SRCSET) {
    rewriter = rewriter.on(selector, { element: (el) => srcsetUrls(el.getAttribute("srcset") ?? el.getAttribute("imagesrcset") ?? "").forEach(take) });
  }
  await rewriter.transform(new Response(html)).arrayBuffer();
  return { title: title.trim(), text: text.replace(/\s+/g, " ").trim(), assets: [...assets].sort(), links: [...links].sort() };
}

export async function rewriteHtml(html: Uint8Array, pageUrl: string, cfg: Config): Promise<Uint8Array> {
  const origin = new URL(cfg.origin.url).origin;
  const base = cfg.site.host ? `https://${cfg.site.host}` : "";
  const local = (value: string): string => {
    const url = resolve(value, pageUrl);
    // Only absolute links to the origin are touched; relative ones already work on the mirror.
    if (!url || url.origin !== origin || !/^(https?:)?\/\//i.test(value)) return value;
    return `${base}${url.pathname}${url.search}${url.hash}` || "/";
  };
  const tracked = (src: string): boolean => {
    const host = resolve(src, pageUrl)?.hostname ?? "";
    return cfg.origin.strip_script_hosts.some((h) => host === h || host.endsWith(`.${h}`));
  };
  let rewriter = new HTMLRewriter().on("script[src]", { element: (el) => void (tracked(el.getAttribute("src")!) && el.remove()) }).on("link[rel='canonical']", {
    // The canonical page is the mirror's own when it has a host, the origin's otherwise.
    element: (el) => void el.setAttribute("href", cfg.site.host ? local(new URL(pageUrl).href) : pageUrl),
  });
  for (const [selector, attr] of URL_ATTRS) {
    rewriter = rewriter.on(selector, {
      element: (el) => void (el.getAttribute("rel") !== "canonical" && el.setAttribute(attr, local(el.getAttribute(attr)!))),
    });
  }
  for (const selector of SRCSET) {
    rewriter = rewriter.on(selector, {
      element: (el) => {
        const attr = el.hasAttribute("srcset") ? "srcset" : "imagesrcset";
        const value = el.getAttribute(attr) ?? "";
        el.setAttribute(attr, value.split(",").map((part) => part.trim().replace(/^\S+/, (u) => local(u))).join(", "));
      },
    });
  }
  return new Uint8Array(await rewriter.transform(new Response(html)).arrayBuffer());
}

// Hashed files (chunk-12sm73yr.js, page-404-e6c0x1t2.js) a script names in a string or an import; a bundle's
// dynamic imports are invisible to the HTML scan, and a mirror without them breaks as soon as a page loads.
const SCRIPT_REF = /["'`]([^"'`\s\\]*?[\w]+-[a-z0-9]{6,}\.(?:m?js|css|wasm))["'`]/g;

/** Same-origin hashed files named in a script, resolved against the script's own URL. */
export function scanScript(bytes: Uint8Array, scriptUrl: string, cfg: Config): string[] {
  const origin = new URL(cfg.origin.url).origin;
  const found = new Set<string>();
  for (const m of new TextDecoder().decode(bytes).matchAll(SCRIPT_REF)) {
    const url = resolve(m[1]!, scriptUrl);
    if (url && url.origin === origin && isAsset(url, cfg)) found.add(normalizeUrl(url.href));
  }
  return [...found].sort();
}

/** The files a page brings along that no link names (cfg.crawl.companions, `{path}` is the page path). */
export function companionUrls(pageUrl: string, cfg: Config): string[] {
  const url = new URL(pageUrl);
  const path = url.pathname === "/" ? "/index" : url.pathname.replace(/\/$/, "");
  return cfg.crawl.companions.map((pattern) => normalizeUrl(new URL(pattern.replaceAll("{path}", path), url.origin).href));
}
