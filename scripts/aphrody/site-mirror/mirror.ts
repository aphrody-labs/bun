import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { watch } from "node:fs/promises";
import { BRAND } from "../../../packages/web/site/brand.ts";

export const CAPTURE_LIMITS = {
  pages: 2500,
  assets: 12000,
  depth: 20,
  concurrency: 4,
  delayMs: 300,
};
export function mirrorCommand(destination: string): string[] {
  return [
    "aphrody",
    "web",
    "mirror",
    "https://bun.com",
    resolve(destination),
    "--recursive",
    "--max-pages",
    String(CAPTURE_LIMITS.pages),
    "--max-assets",
    String(CAPTURE_LIMITS.assets),
    "--max-depth",
    String(CAPTURE_LIMITS.depth),
    "--concurrency",
    String(CAPTURE_LIMITS.concurrency),
    "--delay-ms",
    String(CAPTURE_LIMITS.delayMs),
    "--allowed-domains",
    "bun.com,www.bun.com",
    "--resolve-cdns",
    "false",
    "--json",
  ];
}
export function files(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory()
      ? files(join(root, entry.name))
      : entry.isFile() && !/\.partial-[a-f0-9]{16}$/.test(entry.name)
        ? [join(root, entry.name)]
        : [],
  );
}
export function localReferences(html: string): string[] {
  const references: string[] = [];
  new HTMLRewriter()
    .on("*", {
      element(element) {
        for (const name of ["src", "href"]) {
          const value = element.getAttribute(name);
          if (value && !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(value)) references.push(value);
        }
      },
    })
    .transform(html);
  return references;
}
export function rewriteCapturedLinks(html: string, sourceFile: string, capturedRoot: string): string {
  const base = resolve(capturedRoot);
  return new HTMLRewriter()
    .on("*", {
      element(element) {
        for (const [name, value] of element.attributes) {
          if (
            !["src", "href", "poster", "data-src", "data-lazy-src"].includes(name.toLowerCase()) ||
            /^(?:[a-z]+:|\/\/|#)/i.test(value)
          )
            continue;
          const [path] = value.split(/[?#]/);
          const suffix = value.slice(path!.length);
          const target = path!.startsWith("/")
            ? resolve(base, "bun.com", "." + path)
            : resolve(dirname(sourceFile), path!);
          if (!target.startsWith(base + sep)) continue;
          const local = relative(base, target).replaceAll("\\", "/");
          if (!existsSync(target) && /\.q-[a-f0-9]{10,16}(?:\.|\/|$)/i.test(local)) continue;
          if (local.startsWith("bun.com/")) {
            const path = local.slice("bun.com/".length);
            const route =
              name.toLowerCase() === "href" && element.tagName === "a"
                ? path.replace(/(?:^|\/)index\.html$/, "")
                : path;
            element.setAttribute(
              name,
              existsSync(target)
                ? "/" + route + suffix
                : "https://bun.com/" + path.replace(/(?:^|\/)index\.html$/, "") + suffix,
            );
          } else if (existsSync(target) && !(name.toLowerCase() === "href" && element.tagName === "a"))
            element.setAttribute(name, "/" + local + suffix);
          else {
            const [host, ...parts] = local.split("/");
            if (host && /^(?:[a-z0-9-]+\.)+[a-z0-9-]+$/i.test(host))
              element.setAttribute(
                name,
                "https://" + host + "/" + parts.join("/").replace(/(?:^|\/)index\.html$/, "") + suffix,
              );
          }
        }
      },
    })
    .transform(html);
}
const hash = (data: string | Uint8Array) => new Bun.CryptoHasher("sha256").update(data).digest("hex");
const generatorSha256 = hash(readFileSync(import.meta.path));
const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
export function rewriteInstallers(text: string, origin: string): string {
  return text
    .replace(/https:\/\/bun\.sh\/install\.ps1/g, `${origin}/install.ps1`)
    .replace(/https:\/\/bun\.sh\/install(?![\w.])/g, `${origin}/install.sh`)
    .replace(/(?<![\w/.])bun\.sh\/install\.ps1/g, `${new URL(origin).host}/install.ps1`);
}
export function rewritePagefindLoader(text: string): string {
  if (!/["']_pagefind["']/.test(text) || !/["']pagefind\.js["']/.test(text)) return text;
  const loader = 'Function("u","return import(u)")(c)';
  const binding = 'let c=["","_pagefind","pagefind.js"].join("/");Z=' + loader;
  if (text.split(binding).length !== 2 || text.split(loader).length !== 2)
    throw new Error("Unsupported Pagefind loader; expected one proven root-relative URL binding");
  return text.replace(binding, 'let c=["","_pagefind","pagefind.js"].join("/");Z=import(c)');
}
export function externalizeInlineScripts(html: string): {
  html: string;
  assets: { file: string; content: string }[];
} {
  const assets: { file: string; content: string }[] = [];
  const output = html.replace(
    /<script\b((?:[^"'<>]|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/script\s*>/gi,
    (all, attributes: string, content: string) => {
      if (/(?:^|\s)src\s*=/i.test(attributes) || !content.trim()) return all;
      const match = attributes.match(/(?:^|\s)type\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
      const type = (match?.[1] ?? match?.[2] ?? match?.[3] ?? "").toLowerCase();
      if (
        type &&
        !["module", "text/javascript", "application/javascript", "text/ecmascript", "application/ecmascript"].includes(
          type,
        )
      )
        return all;
      const file = `aphrody-inline-${hash(content).slice(0, 24)}.js`;
      assets.push({ file, content });
      return `<script${attributes} src="${file}"></script>`;
    },
  );
  return { html: output, assets };
}
export function adaptHtml(html: string, source: string, origin = "https://bun.aphrody.app"): string {
  if (!/^[a-f0-9]{40}$/.test(source)) throw new Error("A release source SHA is required");
  const links = [
    ["Fork releases", "/downloads"],
    ["Fork docs", "/docs"],
    ["Guides", "/guides"],
    ["Plugin skills", "/knowledge/plugin/README.md"],
    ["Code graph", "/graph/"],
    ["Measured benchmarks", "/benchmarks/site-gateway.html"],
  ];
  const chrome = `<aside class="aphrody-fork" aria-label="Aphrody fork"><strong>Aphrody Bun</strong><span>Upstream interface capture; upstream benchmark results are not fork measurements.</span><nav>${links.map(([label, href]) => `<a href="${origin}${href}">${label}</a>`).join("")}</nav><details><summary>Provenance</summary><code>${source}</code> · <a href="${origin}/mirror-coverage.json">Capture coverage</a></details></aside>`;
  const withoutAnalytics = new HTMLRewriter()
    .on("script", {
      element(element) {
        const src = element.getAttribute("src");
        if (!src) return;
        try {
          const url = new URL(src, origin);
          const localHost = url.pathname.split("/")[1];
          if (
            [url.hostname, localHost].some(host => host === "plausible.io" || host === "static.cloudflareinsights.com")
          )
            element.remove();
        } catch {}
      },
    })
    .transform(html);
  return rewriteInstallers(withoutAnalytics, origin)
    .replace('aria-label="Bun — home"', 'aria-label="Aphrody Bun — home"')
    .replace(/<title>([^<]*)<\/title>/, "<title>Aphrody Bun — $1</title>")
    .replace(/<script\b[^>]*\bsrc=["'][^"']*plausible\.io[^"']*["'][^>]*>\s*<\/script>/gi, "")
    .replace(/https:\/\/bun\.sh\/install\.ps1/g, `${origin}/install.ps1`)
    .replace(/https:\/\/bun\.sh\/install(?![\w.])/g, `${origin}/install.sh`)
    .replace(/https:\/\/github\.com\/oven-sh\/bun(?=["'\s<])/g, "https://github.com/aphrody-labs/bun-os")
    .replace(/(<link\b[^>]*rel=["']canonical["'][^>]*href=["'])https:\/\/bun\.com/g, `$1${origin}`)
    .replace(
      "</head>",
      `<meta name="aphrody-source" content="${source}"><link rel="stylesheet" href="${escape(BRAND.tokensCss)}"><link rel="stylesheet" href="${escape(BRAND.fontsCss)}"><link rel="stylesheet" href="/mirror-assets/m3.css"><script src="/mirror-assets/m3.js" defer></script></head>`,
    )
    .replace("</body>", `${chrome}</body>`);
}

export const M3_CSS = `.aphrody-fork{position:relative;margin:2rem auto;padding:1rem 1.5rem;max-width:76rem;border-radius:24px;background:var(--md-sys-color-surface-container);color:var(--md-sys-color-on-surface);--md-ref-typeface-plain:"Google Sans Flex",system-ui;font-family:var(--md-ref-typeface-plain,system-ui)}.aphrody-fork strong,.aphrody-fork span{display:block}.aphrody-fork span{font-size:.875rem}.aphrody-fork nav{display:flex;gap:.5rem;flex-wrap:wrap;margin:.75rem 0}.aphrody-fork a{padding:.5rem .75rem;border-radius:999px;background:var(--md-sys-color-secondary-container);color:var(--md-sys-color-on-secondary-container)}.aphrody-fork code{overflow-wrap:anywhere}:root{--md-ref-typeface-brand:var(--font-display);--md-ref-typeface-plain:var(--font-sans);--radius-sm:8px;--radius:12px;--radius-lg:16px;--radius-xl:28px}a:focus-visible,button:focus-visible{outline:3px solid var(--md-sys-color-primary);outline-offset:3px}@media(prefers-reduced-motion:reduce){*,*:before,*:after{scroll-behavior:auto!important;animation-duration:.01ms!important;transition-duration:.01ms!important}}`;
export const M3_JS = `(()=>{const roles={canvas:'surface',subtle:'surface-container-low',surface:'surface',raised:'surface-container',line:'outline-variant','line-strong':'outline',fg:'on-surface','fg-muted':'on-surface-variant','fg-faint':'on-surface-variant',accent:'primary','accent-strong':'primary','accent-soft':'primary-container',signal:'tertiary',rule:'outline',slab:'inverse-surface','on-slab':'inverse-on-surface',bar:'primary',cream:'tertiary-container','code-bg':'surface-container','code-fg':'on-surface',danger:'error'};const probe=document.createElement('span');probe.hidden=true;document.body.append(probe);function apply(){for(const [name,role] of Object.entries(roles)){probe.style.color='var(--md-sys-color-'+role+')';const color=getComputedStyle(probe).color.match(/^rgba?\\((\\d+)[, ]+(\\d+)[, ]+(\\d+)/);if(color)document.documentElement.style.setProperty('--c-'+name,color.slice(1,4).join(' '));}}apply();matchMedia('(prefers-color-scheme:dark)').addEventListener('change',apply);new MutationObserver(apply).observe(document.documentElement,{attributes:true,attributeFilter:['class']});})();`;

export function buildMirror(capture: string, output: string, source: string, origin?: string, allowPartial = false) {
  const base = resolve(capture, "upstream"),
    root = resolve(output);
  if (root === base || root.startsWith(base + "/") || root.startsWith(base + "\\"))
    throw new Error("Output must be separate from captured source");
  if (existsSync(root)) throw new Error("Mirror output already exists");
  let report: unknown;
  try {
    report = JSON.parse(readFileSync(join(capture, "report.json"), "utf8"));
  } catch (error) {
    if (!allowPartial) throw error;
    report = { state: "in-progress", nativeReportPending: true };
  }
  const upstream = join(base, "bun.com");
  if (!existsSync(join(upstream, "index.html"))) throw new Error("The upstream homepage is missing");
  mkdirSync(root, { recursive: true });
  mkdirSync(join(root, "mirror-assets"), { recursive: true });
  writeFileSync(
    join(root, "mirror-assets/m3.css"),
    M3_CSS +
      '[aria-label="Aphrody Bun — home"]{position:relative}[aria-label="Aphrody Bun — home"]:after{content:"Aphrody fork";position:absolute;left:50px;bottom:-11px;font-size:9px;white-space:nowrap;color:var(--md-sys-color-primary)}',
  );
  writeFileSync(join(root, "mirror-assets/m3.js"), M3_JS);
  const entries = files(base)
    .filter(file => relative(base, file) !== "manifest.json")
    .map(file => {
      const capturedPath = relative(base, file).replaceAll("\\", "/");
      const path = capturedPath.startsWith("bun.com/") ? capturedPath.slice("bun.com/".length) : capturedPath;
      const bytes = readFileSync(file);
      mkdirSync(dirname(join(root, path)), { recursive: true });
      if (capturedPath.startsWith("bun.com/") && path.endsWith(".html")) {
        const adapted = externalizeInlineScripts(
          adaptHtml(rewriteCapturedLinks(bytes.toString("utf8"), file, base), source, origin),
        );
        writeFileSync(join(root, path), adapted.html);
        for (const asset of adapted.assets) writeFileSync(join(dirname(join(root, path)), asset.file), asset.content);
      } else if (path.endsWith(".js"))
        writeFileSync(
          join(root, path),
          rewritePagefindLoader(rewriteInstallers(bytes.toString("utf8"), "https://bun.aphrody.app")),
        );
      else writeFileSync(join(root, path), bytes);
      return {
        path,
        capturedPath,
        bytes: bytes.length,
        upstreamSha256: hash(bytes),
        adaptedSha256: hash(readFileSync(join(root, path))),
      };
    });
  const unresolved = entries
    .filter(entry => entry.capturedPath.startsWith("bun.com/") && entry.path.endsWith(".html"))
    .flatMap(entry =>
      localReferences(readFileSync(join(root, entry.path), "utf8")).flatMap(href => {
        const path = href.split(/[?#]/)[0]!;
        if (!path) return [];
        const target = resolve(path.startsWith("/") ? root : resolve(root, entry.path, ".."), path.replace(/^\//, ""));
        return existsSync(target) ? [] : [{ page: entry.path, href }];
      }),
    );
  const originalPaths = new Set(entries.map(entry => resolve(root, entry.path)));
  const coverage = {
    source,
    builtAt: new Date().toISOString(),
    generatorSha256,
    upstream: "https://bun.com",
    engine: "aphrody web mirror",
    limits: CAPTURE_LIMITS,
    report,
    pages: entries.filter(x => x.path.endsWith(".html")).length,
    assets: entries.filter(x => !x.path.endsWith(".html")).length,
    files: entries,
    derivedAssets: files(root)
      .filter(file => !originalPaths.has(file))
      .map(file => ({
        path: relative(root, file).replaceAll("\\", "/"),
        sha256: hash(readFileSync(file)),
      })),
    unresolved,
    qualification: {
      httpCapture: true,
      screenshotComparison: false,
      interactiveParity: false,
      completeSite: false,
    },
    modifications: [
      "M3 color roles, fonts and shapes",
      "Fork navigation",
      "Canonical and installer URLs",
      "Remove upstream analytics",
    ],
    upstreamBenchmarksAreForkMeasurements: false,
  };
  writeFileSync(join(root, "mirror-coverage.json"), JSON.stringify(coverage, null, 2) + "\n");
  return coverage;
}
if (import.meta.main) {
  const [operation, first, second, source, origin] = process.argv.slice(2);
  if (operation === "plan" && first)
    console.log(JSON.stringify({ command: mirrorCommand(first), budgets: CAPTURE_LIMITS }, null, 2));
  else if (operation === "capture" && first) {
    const root = resolve(first);
    if (existsSync(join(root, "report.json")))
      throw new Error("Use a new capture directory; previous evidence is retained");
    mkdirSync(root, { recursive: true });
    const process = Bun.spawn(mirrorCommand(join(root, "upstream")), {
      stdout: Bun.file(join(root, "report.json")),
      stderr: Bun.file(join(root, "mirror.log")),
    });
    const code = await process.exited;
    writeFileSync(join(root, "exit.json"), JSON.stringify({ code, endedAt: new Date().toISOString() }));
    if (code) throw new Error(`Native capture failed: ${code}`);
  } else if (
    (operation === "build" || operation === "wait-build" || operation === "partial-build") &&
    first &&
    second &&
    source
  ) {
    if (operation === "wait-build") {
      const complete = () => {
        try {
          return !!JSON.parse(readFileSync(join(first, "report.json"), "utf8"));
        } catch {
          return false;
        }
      };
      if (!complete()) {
        for await (const event of watch(resolve(first))) {
          if (event.filename === "report.json" && complete()) break;
        }
      }
    }
    const coverage = buildMirror(first, second, source, origin, operation === "partial-build");
    console.log(
      JSON.stringify({
        source,
        pages: coverage.pages,
        assets: coverage.assets,
        unresolved: coverage.unresolved.length,
        qualification: coverage.qualification,
      }),
    );
  } else
    throw new Error("Usage: mirror.ts plan|capture <capture-dir> | build <capture-dir> <new-output-dir> <source-sha>");
}
