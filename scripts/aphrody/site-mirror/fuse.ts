// SPDX-License-Identifier: Apache-2.0
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { BRAND } from "../../../packages/web/site/brand.ts";
import {
  FUSION_SYMBOLS,
  MATERIAL_SYMBOLS_CSS,
  MATERIAL_SYMBOLS_SHA256,
  navigationSymbol,
  symbol,
} from "../../../packages/web/site/icons.ts";
import { docsSearchScript } from "../../../packages/web/site/layout.ts";
import { externalizeInlineScripts, localReferences } from "./mirror.ts";

const sha256 = (value: string | Uint8Array) => new Bun.CryptoHasher("sha256").update(value).digest("hex");
export type FusionOptions = {
  preview: string;
  material: string;
  google: string;
  output: string;
  source: string;
  symbols: string;
  searchIndex: string;
  origin?: string;
};

export function designReferences(html: string) {
  const entries: { href: string; title: string }[] = [];
  let label = false;
  let accepted = false;
  new HTMLRewriter()
    .on('a[href*="library/"]', {
      element(element) {
        const href = new URL(element.getAttribute("href")!, "https://design.google/");
        label = !!element.getAttribute("aria-label");
        accepted = href.hostname === "design.google";
        if (href.hostname === "design.google")
          entries.push({
            href: href.href.replace(/\/index\.html$/, "/"),
            title: element.getAttribute("aria-label") ?? "",
          });
      },
      text(chunk) {
        if (accepted && !label && entries.length) entries[entries.length - 1]!.title += chunk.text;
      },
    })
    .transform(html);
  return entries
    .map(entry => ({ ...entry, title: entry.title.replace(/\s+/g, " ").trim().slice(0, 160) }))
    .filter((entry, index, all) => entry.title && all.findIndex(other => other.href === entry.href) === index)
    .slice(0, 3);
}

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!,
  );

export function designResources(
  googleHtml: string,
  materialEntries: { title?: string; source_url?: string; slug?: string }[],
) {
  const google = designReferences(googleHtml);
  const material = materialEntries
    .filter(entry => entry.title && entry.source_url?.startsWith("https://m3.material.io/"))
    .slice(0, 3);
  const link = (href: string, title: string, icon: string) =>
    `<a href="${escapeHtml(href)}">${symbol(icon)}${escapeHtml(title)}</a>`;
  return `<section class="fusion-design" aria-label="Design sources"><details><summary>${symbol("palette")}Design sources</summary><h2>Google Design</h2>${google.map(entry => link(entry.href, entry.title, "article")).join("")}<h2>Material 3</h2>${material.map(entry => link(entry.slug === undefined ? entry.source_url! : "https://m3.material.io/" + entry.slug, entry.title!, "auto_awesome")).join("")}<p>Public captured references. Aphrody M3 tokens, typography and symbols style this interface.</p></details></section>`;
}

export function adaptProductHome(html: string, source: string, origin = "https://bun.aphrody.app"): string {
  if (!/^[a-f0-9]{40}$/.test(source)) throw new Error("A release source SHA is required");
  const notes = `<span class="fusion-status">${symbol("construction")}Stable Bun OS release qualification in progress</span><a href="/downloads">Published downloads</a>`;
  let lead = 0;
  let tool = 0;
  const tools = ["terminal", "inventory_2", "science", "deployed_code"];
  const rewriter = new HTMLRewriter()
    .on("html", {
      element(element) {
        element.setAttribute("data-aphrody-fusion", "bun-m3");
      },
    })
    .on("title", {
      element(element) {
        element.setInnerContent("Bun OS · Aphrody Labs");
      },
    })
    .on('meta[name="description"], meta[property="og:description"]', {
      element(element) {
        element.setAttribute(
          "content",
          "JavaScript and TypeScript. Run, install, test and build with Bun OS by Aphrody Labs.",
        );
      },
    })
    .on('meta[property="og:title"], meta[property="og:site_name"]', {
      element(element) {
        element.setAttribute("content", "Bun OS · Aphrody Labs");
      },
    })
    .on('link[rel="canonical"], meta[property="og:url"]', {
      element(element) {
        element.setAttribute(element.tagName === "link" ? "href" : "content", origin + "/");
      },
    })
    .on('a[aria-label="Aphrody Bun — home"], a[aria-label="Bun — home"]', {
      element(element) {
        element.setAttribute("aria-label", "Bun OS — home");
        element.setAttribute("class", (element.getAttribute("class") ?? "") + " fusion-brand");
        element.setInnerContent('<img src="/icon.svg" alt="Aphrody" width="40" height="40"><span>Bun OS</span>', {
          html: true,
        });
      },
    })
    .on('a[href*="bun-joins-anthropic"], section.register a[href*="/blog/bun-v"]', {
      element(element) {
        element.setInnerContent("Upstream Bun news");
      },
    })
    .on("section.register h1", {
      element(element) {
        element.setInnerContent("Bun OS");
      },
    })
    .on("section.register p", {
      element(element) {
        const index = lead++;
        if (index === 0) element.setInnerContent("Run. Install. Test. Build. One Bun toolkit from Aphrody Labs.");
        if (index === 1) element.setInnerContent("Install a published runtime");
      },
    })
    .on("section.register", {
      element(element) {
        element.prepend(`<div class="fusion-release" role="note">${notes}</div>`, { html: true });
      },
    })
    .on('section[aria-labelledby="toolkit-heading"] a', {
      element(element) {
        element.setAttribute("class", (element.getAttribute("class") ?? "") + " fusion-tool");
        element.prepend(symbol(tools[tool++] ?? "code"), { html: true });
      },
    })
    .on('nav[aria-label="Primary"] a, nav[aria-label="Mobile"] a', {
      element(element) {
        element.setAttribute("class", (element.getAttribute("class") ?? "") + " fusion-navigation");
        element.prepend(symbol(navigationSymbol(element.getAttribute("href") ?? "/")), { html: true });
      },
    })
    .on('button[aria-label="Search"], button[aria-label="Open menu"], button[aria-label="Close menu"]', {
      element(element) {
        const label = element.getAttribute("aria-label")!;
        element.prepend(symbol(label === "Search" ? "search" : label === "Open menu" ? "menu" : "close"), {
          html: true,
        });
        element.setAttribute("class", (element.getAttribute("class") ?? "") + " fusion-control");
      },
    })
    .on('a[href="/get"], a[href="/get/"]', {
      element(element) {
        element.setAttribute("href", "/downloads");
        element.setInnerContent(symbol("download") + "Downloads", { html: true });
      },
    })
    .on("section", {
      element(element) {
        const heading = element.getAttribute("aria-labelledby");
        if (heading === "spotlight-heading")
          element.prepend('<p class="fusion-attribution">Upstream Bun release notes</p>', { html: true });
      },
    })
    .on(".aphrody-fork", {
      element(element) {
        element.setInnerContent(
          `<nav aria-label="Aphrody Labs"><a href="/downloads">${symbol("download")}Downloads</a><a href="/docs">${symbol("menu_book")}Docs</a><a href="/graph/">${symbol("account_tree")}Graph</a><a href="https://github.com/aphrody-labs/bun">${symbol("code")}Source</a></nav><details><summary>Sources and qualification</summary><p>Upstream Bun interface, benchmark results and production endorsements are upstream references. They do not qualify Bun OS performance or releases.</p><p>Source <code>${source}</code> · <a href="/fusion-manifest.json">Fusion provenance</a> · <a href="/mirror-coverage.json">Capture coverage</a></p></details>`,
          { html: true },
        );
      },
    })
    .on("head", {
      element(element) {
        element.append(
          `<link rel="stylesheet" href="${MATERIAL_SYMBOLS_CSS}"><link rel="stylesheet" href="/mirror-assets/fusion.css"><script src="/mirror-assets/fusion.js" defer></script><meta name="aphrody-fusion-source" content="${source}">`,
          { html: true },
        );
      },
    });
  return rewriter.transform(html);
}

export const FUSION_CSS = `
html[data-aphrody-fusion]{--md-ref-typeface-brand:"Google Sans Flex",system-ui;--md-ref-typeface-plain:"Google Sans Flex",system-ui;--font-display:var(--md-ref-typeface-brand);--font-sans:var(--md-ref-typeface-plain)}
html[data-aphrody-fusion] .display{font-family:"Google Sans Flex",system-ui;font-weight:600;font-variation-settings:"wdth" 105}
html[data-aphrody-fusion] .fusion-symbol{font-family:"Material Symbols Rounded"!important;font-feature-settings:"liga"!important;font-weight:400!important;letter-spacing:normal!important;text-transform:none!important;flex:none;font-size:24px!important;line-height:1;vertical-align:middle;--material-symbols-fill:0}
.fusion-brand{display:inline-flex;align-items:center;gap:.65rem;font:600 1.125rem "Google Sans Flex",system-ui;white-space:nowrap}.fusion-brand img{object-fit:contain}
.fusion-navigation{display:inline-flex!important;align-items:center;gap:.5rem;border-radius:var(--md-sys-shape-corner-full,999px)!important;min-height:48px;padding:.5rem 1rem!important}
.fusion-navigation[aria-current]{background:var(--md-sys-color-secondary-container)!important;color:var(--md-sys-color-on-secondary-container)!important;--material-symbols-fill:1}
.fusion-control{min-width:48px;min-height:48px;gap:.5rem;border-radius:var(--md-sys-shape-corner-full,999px)!important}.fusion-control>svg{display:none}
.fusion-release{display:flex;gap:.75rem;align-items:center;justify-content:space-between;flex-wrap:wrap;padding:.75rem 1rem;background:var(--md-sys-color-secondary-container);color:var(--md-sys-color-on-secondary-container);font:500 .8125rem/1.5 "Google Sans Flex",system-ui}.fusion-release a{color:inherit;min-height:48px;display:inline-flex;align-items:center}
.fusion-status{display:inline-flex;align-items:center;gap:.5rem}.fusion-tool{border-radius:var(--md-sys-shape-corner-extra-large,28px)!important;background:var(--md-sys-color-surface-container-low)!important;margin:.5rem;min-height:240px}.fusion-tool>.fusion-symbol{color:var(--md-sys-color-primary);font-size:36px!important}.fusion-tool>svg{display:none}
.fusion-tool:hover{background:var(--md-sys-color-secondary-container)!important}.fusion-tool:focus-visible,.fusion-navigation:focus-visible,.fusion-control:focus-visible{outline:3px solid var(--md-sys-color-primary);outline-offset:4px}
.fusion-attribution{padding:.75rem 1rem;border-radius:var(--md-sys-shape-corner-large,16px);background:var(--md-sys-color-tertiary-container);color:var(--md-sys-color-on-tertiary-container);font-size:.8125rem}
.fusion-design{max-width:1100px;margin:2rem auto;padding:1rem 2rem;background:var(--md-sys-color-surface-container);border-radius:28px}.fusion-design a,.fusion-design summary{display:flex;align-items:center;gap:.75rem;min-height:48px}.fusion-design h2{font-size:1rem}.aphrody-fork nav a{display:inline-flex;align-items:center;gap:.5rem;min-height:48px;text-decoration:none}.aphrody-fork{font-family:"Google Sans Flex",system-ui!important}.aphrody-fork summary{min-height:48px;cursor:pointer}
.fusion-menu{position:absolute;right:1rem;top:80px;z-index:100;padding:1rem;background:var(--md-sys-color-surface-container);border:1px solid var(--md-sys-color-outline);border-radius:24px}.fusion-menu a,.fusion-menu button{display:flex;align-items:center;gap:.5rem;min-height:48px;padding:.5rem 1rem}.fusion-dialog{position:fixed;inset:10vh 5vw auto;max-width:800px;margin:auto;z-index:200;padding:1.5rem;border-radius:28px;background:var(--md-sys-color-surface-container-high);color:var(--md-sys-color-on-surface);box-shadow:0 8px 40px #0006}.fusion-dialog input{width:100%;min-height:48px;font:inherit;border-radius:24px;padding:.75rem;background:var(--md-sys-color-surface);color:inherit}.fusion-dialog button{min-height:48px}.fusion-dialog #results{max-height:50vh;overflow:auto}.fusion-dialog #results a{display:block;padding:.75rem;min-height:48px;border-radius:16px}.fusion-dialog #results small{display:block}.fusion-dialog #results .sel{background:var(--md-sys-color-secondary-container)}.fusion-dialog[hidden],.fusion-menu[hidden]{display:none!important}
@media(max-width:640px){.fusion-navigation{padding:.75rem 1rem!important}.fusion-release{gap:0}.fusion-tool{min-height:220px}.fusion-brand span{font-size:1rem}}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}*,*:before,*:after{animation-duration:.01ms!important;transition-duration:.01ms!important}}
`;

export const FUSION_JS = `(()=>{
const icon=name=>'<img class="fusion-symbol" src="/mirror-assets/symbols/'+name+'.svg" alt="" aria-hidden="true" width="24" height="24">';
const text=(selector,value)=>{const node=document.querySelector(selector);if(node&&node.textContent!==value)node.textContent=value};
const prependIcon=(node,name)=>{if(!node.querySelector(':scope>.fusion-symbol'))node.insertAdjacentHTML('afterbegin',icon(name))};
const routeIcon=href=>{const path=new URL(href,location.origin).pathname;return path.startsWith('/docs')?'menu_book':path.startsWith('/guides')?'explore':path.startsWith('/reference')?'data_object':path.startsWith('/blog')?'article':'home'};
let searchLoaded=false,returnFocus=null;
function controls(){
for(const button of document.querySelectorAll('button[aria-label="Close menu"]'))if(!button.closest('.fusion-menu')){button.hidden=true;button.style.display='none'}
let menu=document.getElementById('fusion-menu');if(!menu){menu=document.createElement('nav');menu.id='fusion-menu';menu.className='fusion-menu';menu.setAttribute('aria-label','Mobile navigation');menu.hidden=true;menu.innerHTML='<button type="button" aria-label="Close menu">'+icon('close')+'Close</button>'+Array.from(document.querySelectorAll('nav[aria-label="Primary"] a')).map(a=>'<a href="'+a.getAttribute('href')+'">'+a.innerHTML+'</a>').join('');document.body.append(menu);menu.querySelector('button').onclick=()=>{menu.hidden=true;document.querySelector('button[aria-label="Open menu"]')?.setAttribute('aria-expanded','false');returnFocus?.focus()}}
for(const button of document.querySelectorAll('button[aria-label="Open menu"]')){button.setAttribute('aria-controls','fusion-menu');button.onclick=event=>{event.preventDefault();event.stopPropagation();returnFocus=button;menu.hidden=!menu.hidden;button.setAttribute('aria-expanded',String(!menu.hidden));if(!menu.hidden)menu.querySelector('a')?.focus()}}
let dialog=document.getElementById('fusion-search');if(!dialog){dialog=document.createElement('section');dialog.id='fusion-search';dialog.className='fusion-dialog';dialog.hidden=true;dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-label','Search documentation');dialog.innerHTML='<button type="button" aria-label="Close search">'+icon('close')+'Close</button><div class="search"><input type="search" id="q" placeholder="Search documentation" aria-label="Search documentation" autocomplete="off"><div id="results" role="listbox" hidden></div></div>';document.body.append(dialog);dialog.querySelector('button').onclick=()=>{dialog.hidden=true;returnFocus?.focus()}}
for(const button of document.querySelectorAll('button[aria-label="Search"]')){button.setAttribute('aria-controls','fusion-search');button.onclick=event=>{event.preventDefault();event.stopPropagation();returnFocus=button;dialog.hidden=false;dialog.querySelector('input').focus()}}
if(!searchLoaded){searchLoaded=true;const script=document.createElement('script');script.src='/mirror-assets/docs-search.js';document.head.append(script);document.addEventListener('keydown',event=>{if(event.key==='Escape'){menu.hidden=true;dialog.hidden=true;document.querySelector('button[aria-label="Open menu"]')?.setAttribute('aria-expanded','false');returnFocus?.focus()}if(event.key==='Tab'&&!dialog.hidden){const nodes=Array.from(dialog.querySelectorAll('button,input,a')).filter(node=>!node.hidden),first=nodes[0],last=nodes[nodes.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}}})}
}
let queued=false;const observer=new MutationObserver(()=>{if(!queued){queued=true;requestAnimationFrame(apply)}});
function apply(){queued=false;observer.disconnect();document.documentElement.setAttribute('data-aphrody-fusion','bun-m3');document.title='Bun OS · Aphrody Labs';
for(const node of document.querySelectorAll('a[href*="bun-joins-anthropic"],section.register a[href*="/blog/bun-v"]'))if(node.textContent!=='Upstream Bun news')node.textContent='Upstream Bun news';text('section.register h1','Bun OS');const leads=document.querySelectorAll('section.register p');if(leads[0]&&leads[0].textContent!=='Run. Install. Test. Build. One Bun toolkit from Aphrody Labs.')leads[0].textContent='Run. Install. Test. Build. One Bun toolkit from Aphrody Labs.';if(leads[1]&&leads[1].textContent!=='Install a published runtime')leads[1].textContent='Install a published runtime';
const brand=document.querySelector('.site-header a[aria-label*="home"]');if(brand){brand.setAttribute('aria-label','Bun OS — home');brand.classList.add('fusion-brand');if(!brand.querySelector('img[alt="Aphrody"]'))brand.innerHTML='<img src="/icon.svg" alt="Aphrody" width="40" height="40"><span>Bun OS</span>'}
for(const node of document.querySelectorAll('nav[aria-label="Primary"] a,nav[aria-label="Mobile"] a')){node.classList.add('fusion-navigation');prependIcon(node,routeIcon(node.getAttribute('href')||'/'))}
for(const node of document.querySelectorAll('button[aria-label="Search"],button[aria-label="Open menu"],button[aria-label="Close menu"]')){node.classList.add('fusion-control');prependIcon(node,node.getAttribute('aria-label')==='Search'?'search':node.getAttribute('aria-label')==='Open menu'?'menu':'close')}
const names=['terminal','inventory_2','science','deployed_code'];document.querySelectorAll('section[aria-labelledby="toolkit-heading"] a').forEach((node,i)=>{node.classList.add('fusion-tool');prependIcon(node,names[i]||'code')});
const hero=document.querySelector('section.register');if(hero&&!hero.querySelector('.fusion-release'))hero.insertAdjacentHTML('afterbegin','<div class="fusion-release" role="note"><span class="fusion-status">'+icon('construction')+'Stable Bun OS release qualification in progress</span><a href="/downloads">Published downloads</a></div>');
for(const node of document.querySelectorAll('a[href="/get"],a[href="/get/"]')){node.href='/downloads';node.innerHTML=icon('download')+'Downloads'}
controls();observer.observe(document.body,{childList:true,subtree:true});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',apply,{once:true});else apply();
})();`;

function confined(root: string, path: string): string {
  const target = resolve(root, path);
  if (!target.startsWith(resolve(root) + sep)) throw new Error("Reference path escapes captured corpus");
  return target;
}

export function buildFusion(options: FusionOptions) {
  const preview = resolve(options.preview),
    output = resolve(options.output);
  if (existsSync(output)) throw new Error("Choose a new fusion output directory");
  if (output.startsWith(preview + sep)) throw new Error("Fusion output must be separate from captured input");
  const catalogFile = join(options.material, "material-catalog.json");
  const catalog = JSON.parse(readFileSync(catalogFile, "utf8"));
  if (catalog.truncated || catalog.failures?.length || !catalog.documents_written)
    throw new Error("Material corpus is incomplete");
  const receiptFile = join(options.material, "material-sync-receipt.json");
  const receipt = JSON.parse(readFileSync(receiptFile, "utf8"));
  const excludedSources: { path: string; expectedSha256: string; observedSha256: string }[] = [];
  const sourceReferences = (receipt.sources ?? []).filter((entry: any) => {
    const observedSha256 = sha256(readFileSync(confined(options.material, entry.path)));
    if (observedSha256 === entry.sha256) return true;
    excludedSources.push({ path: entry.path, expectedSha256: entry.sha256, observedSha256 });
    return false;
  });
  const references = [
    ...sourceReferences,
    ...(receipt.entries ?? []).flatMap((entry: any) => [
      { path: entry.raw_path, sha256: entry.sha256, url: entry.source_url },
      { path: entry.markdown_path, sha256: entry.markdown_sha256, url: entry.source_url },
    ]),
  ];
  const materialInputs = references
    .filter((entry: any) => entry.path && entry.sha256)
    .map((entry: any) => {
      const bytes = readFileSync(confined(options.material, entry.path));
      if (sha256(bytes) !== entry.sha256) throw new Error(`Material reference checksum mismatch: ${entry.path}`);
      return { path: entry.path, url: entry.url ?? entry.source_url, sha256: entry.sha256 };
    });
  if (!materialInputs.length) throw new Error("Material corpus has no checksum-qualified sources");
  const googleFile = existsSync(join(options.google, "manifest.json"))
    ? join(options.google, "manifest.json")
    : join(options.google, "report.json");
  const google = JSON.parse(readFileSync(googleFile, "utf8"));
  const googleHome = join(options.google, "upstream", "design.google", "index.html");
  const googlePages = google.summary?.pagesWritten ?? google.pagesWritten ?? 0;
  const googleHomepageSha256 = existsSync(googleHome) ? sha256(readFileSync(googleHome)) : null;
  const googleFiles = (google.files ?? []).map((path: string) => ({
    path,
    sha256: sha256(readFileSync(confined(join(options.google, "upstream"), path))),
  }));
  const logo = readFileSync(join(import.meta.dir, "../../../docs/logo/icon.svg"));
  const coverageFile = join(preview, "mirror-coverage.json");
  const inputFile = join(preview, "index.html"),
    input = readFileSync(inputFile, "utf8");
  const resources = designResources(
    existsSync(googleHome) ? readFileSync(googleHome, "utf8") : "",
    receipt.entries ?? [],
  );
  const designAdapter = new HTMLRewriter()
    .on("body", {
      element(element) {
        element.append(resources, { html: true });
      },
    })
    .on("head", {
      element(element) {
        element.append(
          `<link rel="stylesheet" href="${BRAND.tokensCss}"><link rel="stylesheet" href="${BRAND.fontsCss}">`,
          { html: true },
        );
      },
    });
  const adapted = externalizeInlineScripts(
    designAdapter.transform(adaptProductHome(input, options.source, options.origin)),
  );
  mkdirSync(join(output, "mirror-assets/symbols"), { recursive: true });
  const symbolInputs = FUSION_SYMBOLS.map(name => {
    const bytes = readFileSync(confined(options.symbols, name + ".svg"));
    writeFileSync(join(output, "mirror-assets/symbols", name + ".svg"), bytes);
    return {
      name,
      sha256: sha256(bytes),
      path: "symbols/web/" + name + "/materialsymbolsrounded/" + name + "_24px.svg",
    };
  });
  const symbolsLicense = readFileSync(confined(options.symbols, "LICENSE"));
  writeFileSync(join(output, "mirror-assets/symbols/LICENSE"), symbolsLicense);
  writeFileSync(join(output, "index.html"), adapted.html);
  writeFileSync(join(output, "icon.svg"), logo);
  writeFileSync(join(output, "mirror-assets/fusion.css"), FUSION_CSS);
  writeFileSync(join(output, "mirror-assets/fusion.js"), FUSION_JS);
  writeFileSync(join(output, "mirror-assets/docs-search.js"), docsSearchScript());
  mkdirSync(join(output, "docs"), { recursive: true });
  const searchBytes = readFileSync(options.searchIndex);
  writeFileSync(join(output, "docs/search.json"), searchBytes);
  for (const asset of adapted.assets) {
    const file = confined(output, asset.file);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, asset.content);
  }
  const inheritedReferences = new Set(localReferences(input));
  const generatedPaths = new Set([
    "fusion-manifest.json",
    "index.html",
    "mirror-assets/fusion.css",
    "mirror-assets/fusion.js",
  ]);
  const gatewayRoutes = ["/downloads", "/graph/", "/docs", "/guides", "/knowledge", "/benchmarks", "/release-notes"];
  const unresolved = localReferences(adapted.html).filter(reference => {
    const path = reference.split(/[?#]/)[0]!;
    if (!path) return false;
    const relative = path.replace(/^\//, "");
    if (generatedPaths.has(relative) || gatewayRoutes.some(route => path === route || path.startsWith(route + "/")))
      return false;
    return !existsSync(resolve(output, relative)) && !existsSync(resolve(preview, relative));
  });
  const addedUnresolved = unresolved.filter(reference => !inheritedReferences.has(reference));
  if (addedUnresolved.length) throw new Error(`Fusion introduced missing local assets: ${addedUnresolved.join(", ")}`);
  const manifest = {
    schema: 1,
    source: options.source,
    operation:
      "Overlay generated fusion files onto the checksum-qualified Bun mirror; preserve remaining routes and asset bytes",
    generatorSha256: sha256(readFileSync(import.meta.path)),
    inputs: {
      docsSearch: {
        path: options.searchIndex,
        sha256: sha256(searchBytes),
        scriptSha256: sha256(docsSearchScript()),
        owner: "packages/web/site/layout.ts and build.ts",
      },
      bunHome: { sha256: sha256(input), coverageSha256: sha256(readFileSync(coverageFile)) },
      aphrodyLogo: { path: "docs/logo/icon.svg", sha256: sha256(logo) },
      materialCatalog: {
        sha256: sha256(readFileSync(catalogFile)),
        carbonVersion: catalog.carbon_version,
        documents: catalog.documents_written,
      },
      materialReceipt: { sha256: sha256(readFileSync(receiptFile)), files: materialInputs, excludedSources },
      googleDesign: {
        sha256: sha256(readFileSync(googleFile)),
        homepageSha256: googleHomepageSha256,
        pages: googlePages,
        files: googleFiles,
        failures: google.failures ?? [],
        limits: { maxPages: 100, maxAssets: 400, maxDepth: 3 },
        assetLimitReached: google.assetsWritten === 400,
      },
    },
    owners: {
      tokens: BRAND.tokensCss,
      fonts: BRAND.fontsCss,
      symbols: {
        css: MATERIAL_SYMBOLS_CSS,
        sha256: MATERIAL_SYMBOLS_SHA256,
        license: "Apache-2.0",
        svgFiles: symbolInputs,
        licenseSha256: sha256(symbolsLicense),
        source: "aphrody-labs/material-design-icons@24931a5a982371b6316a3c62032cb345d86018f6",
      },
    },
    outputs: {
      "docs/search.json": sha256(searchBytes),
      "mirror-assets/docs-search.js": sha256(docsSearchScript()),
      "index.html": sha256(adapted.html),
      "icon.svg": sha256(logo),
      ...Object.fromEntries(symbolInputs.map(entry => ["mirror-assets/symbols/" + entry.name + ".svg", entry.sha256])),
      "mirror-assets/symbols/LICENSE": sha256(symbolsLicense),
      ...Object.fromEntries(adapted.assets.map(asset => [asset.file, sha256(asset.content)])),
      "mirror-assets/fusion.css": sha256(FUSION_CSS),
      "mirror-assets/fusion.js": sha256(FUSION_JS),
    },
    unresolved,
    gatewayRoutes,
    upstreamBenchmarksAreForkMeasurements: false,
    qualification: {
      offlineGeneration: true,
      googleDesignMirror: googlePages > 0 && !google.failures?.length,
      completeGoogleDesignMirror: false,
      screenshots: false,
      interactiveParity: false,
      stableBunOSRelease: false,
    },
  };
  writeFileSync(join(output, "fusion-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  return manifest;
}

if (import.meta.main) {
  const [preview, material, google, output, source, symbols, searchIndex] = process.argv.slice(2);
  if (!preview || !material || !google || !output || !source || !symbols || !searchIndex)
    throw new Error(
      "Usage: fuse.ts <Bun-preview> <Material-corpus> <Google-corpus> <new-output> <source-sha> <symbols-corpus> <owner-docs-search-index>",
    );
  console.log(
    JSON.stringify(buildFusion({ preview, material, google, output, source, symbols, searchIndex }), null, 2),
  );
}
