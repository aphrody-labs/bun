// SPDX-License-Identifier: Apache-2.0
import { readFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import {
  externalizeInlineScripts,
  M3_JS,
  rewriteCapturedLinks,
  rewriteInstallers,
} from "../../../scripts/aphrody/site-mirror/mirror";
import { BRAND } from "./brand";
import { adaptHomeDocumentationLinks, homeDocumentationHref } from "./home-routes";
import { HOME_THEME_BOOTSTRAP, parseBunHomeTheme } from "./home-theme";
import { escapeHtml } from "./mdx";
import { WEBMCP_SCRIPT } from "./webmcp";

const sha = (value: Uint8Array | string) => new Bun.CryptoHasher("sha256").update(value).digest("hex");
const commit = /^[a-f0-9]{40}$/;
const digest = /^[a-f0-9]{64}$/;
const targets: Record<string, string> = {
  "win32-x64": "Windows x64",
  "windows-x64": "Windows x64",
  "win32-arm64": "Windows ARM64",
  "windows-arm64": "Windows ARM64",
  "linux-x64": "Linux x64 GNU",
  "linux-arm64": "Linux ARM64 GNU",
  "linux-x64-musl": "Linux x64 musl",
  "linux-arm64-musl": "Linux ARM64 musl",
  "darwin-x64": "macOS x64",
  "darwin-arm64": "macOS ARM64",
};
export type RuntimeHomeFact = {
  schema: 1;
  capturedAt: string;
  source: string;
  version: string;
  target: string;
  binary: { sha256: string; bytes: number };
  nativeVideo: { available: boolean; methods: string[] };
  nativeImage: { available: boolean; methods: string[] };
  gates: { sha256: string; passed: number; failed: number; assertions?: number }[];
  distribution?: { status: "passed" | "failed" | "pending"; minimumGLIBC?: string };
};
export type HomeGraphFact = {
  source: string;
  snapshotId?: string;
  nodes?: number;
  edges?: number;
  truncated?: boolean;
};
export type UpstreamHomeOptions = {
  captureRoot: string;
  sourceRoot: string;
  source: string;
  origin?: string;
  facts: readonly RuntimeHomeFact[];
  graph?: HomeGraphFact;
};
export type HomeAsset = { path: string; bytes: Uint8Array; sha256: string };

/** Project explicit public fields only; provider configuration and local evidence paths never reach the browser. */
export function publicRuntimeHomeFact(value: RuntimeHomeFact): RuntimeHomeFact {
  if (
    value.schema !== 1 ||
    !commit.test(value.source) ||
    !targets[value.target] ||
    !/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(value.version) ||
    !Number.isFinite(Date.parse(value.capturedAt)) ||
    !digest.test(value.binary?.sha256) ||
    !Number.isSafeInteger(value.binary.bytes) ||
    value.binary.bytes < 1 ||
    !Array.isArray(value.gates) ||
    value.gates.length > 32
  )
    throw new Error("Invalid public runtime capability receipt");
  const surface = (input: RuntimeHomeFact["nativeVideo"]) => {
    if (
      typeof input?.available !== "boolean" ||
      !Array.isArray(input.methods) ||
      input.methods.length > 128 ||
      input.methods.some(name => !/^[A-Za-z][A-Za-z0-9_]*$/.test(name))
    )
      throw new Error("Invalid measured native surface");
    return { available: input.available, methods: [...new Set(input.methods)].sort() };
  };
  const gates = value.gates.map(gate => {
    if (
      !digest.test(gate.sha256) ||
      ![gate.passed, gate.failed].every(count => Number.isSafeInteger(count) && count >= 0) ||
      (gate.assertions !== undefined && (!Number.isSafeInteger(gate.assertions) || gate.assertions < 0))
    )
      throw new Error("Invalid supplied capability gate");
    return {
      sha256: gate.sha256,
      passed: gate.passed,
      failed: gate.failed,
      ...(gate.assertions === undefined ? {} : { assertions: gate.assertions }),
    };
  });
  const distribution = value.distribution;
  if (
    distribution &&
    (!["passed", "failed", "pending"].includes(distribution.status) ||
      (distribution.minimumGLIBC !== undefined && !/^\d+\.\d+(?:\.\d+)?$/.test(distribution.minimumGLIBC)))
  )
    throw new Error("Invalid distribution qualification");
  return {
    schema: 1,
    capturedAt: value.capturedAt,
    source: value.source,
    version: value.version,
    target: value.target,
    binary: { sha256: value.binary.sha256, bytes: value.binary.bytes },
    nativeVideo: surface(value.nativeVideo),
    nativeImage: surface(value.nativeImage),
    gates,
    ...(distribution
      ? {
          distribution: {
            status: distribution.status,
            ...(distribution.minimumGLIBC ? { minimumGLIBC: distribution.minimumGLIBC } : {}),
          },
        }
      : {}),
  };
}

/** Normalize the Linux factory's measured receipt without exporting host paths or guessing assertion counts. */
export function normalizeRuntimeHomeFact(input: unknown): RuntimeHomeFact {
  if (!input || typeof input !== "object") throw new Error("Invalid public runtime capability receipt");
  if ((input as { kind?: string }).kind !== "bun-runtime-capabilities")
    return publicRuntimeHomeFact(input as RuntimeHomeFact);
  const value = input as {
    schema: number;
    measuredAt: string;
    runtime: {
      version: string;
      revision: string;
      platform: string;
      arch: string;
      executable: RuntimeHomeFact["binary"];
      libc: { kind: string; minimumDirectRequirement?: string };
    };
    source: { commit: string; codeMatchesCommit: boolean };
    apis: { video: RuntimeHomeFact["nativeVideo"]; image: RuntimeHomeFact["nativeImage"] };
    gates: {
      native: boolean;
      passed: boolean;
      tests: { native: boolean; passed: boolean; passCount: number; failCount: number };
      binaryRelease: { passed: boolean };
      receipts: { name: string; sha256: string }[];
    };
  };
  if (
    value.schema !== 1 ||
    !value.runtime ||
    !value.source ||
    !value.apis ||
    value.runtime?.revision !== value.source?.commit ||
    value.source.codeMatchesCommit !== true ||
    value.runtime.platform !== "linux" ||
    !["x64", "arm64"].includes(value.runtime.arch) ||
    !["glibc", "musl"].includes(value.runtime.libc?.kind) ||
    value.gates?.native !== true ||
    value.gates.tests?.native !== true ||
    typeof value.gates.binaryRelease?.passed !== "boolean"
  )
    throw new Error("Invalid measured factory capability receipt");
  const testReceipt = value.gates.receipts?.find(receipt => receipt.name === "native-tests.log");
  const tests = value.gates.tests;
  if (
    !testReceipt ||
    tests.passed !== (tests.failCount === 0 && tests.passCount > 0) ||
    value.gates.passed !== tests.passed
  )
    throw new Error("Factory native tests have no bound receipt");
  return publicRuntimeHomeFact({
    schema: 1,
    capturedAt: value.measuredAt,
    source: value.source.commit,
    version: value.runtime.version,
    target: `linux-${value.runtime.arch}${value.runtime.libc.kind === "musl" ? "-musl" : ""}`,
    binary: value.runtime.executable,
    nativeVideo: value.apis.video,
    nativeImage: value.apis.image,
    gates: [{ sha256: testReceipt.sha256, passed: tests.passCount, failed: tests.failCount }],
    distribution: {
      status: value.gates.binaryRelease.passed ? "passed" : "failed",
      ...(value.runtime.libc.kind === "glibc" && value.runtime.libc.minimumDirectRequirement
        ? { minimumGLIBC: value.runtime.libc.minimumDirectRequirement }
        : {}),
    },
  });
}
export async function loadRuntimeHomeFacts(
  paths: readonly string[],
  options?: { onReceipt?: (receipt: { index: number; fact: RuntimeHomeFact; sha256: string; bytes: number }) => void },
) {
  if (paths.length > 8) throw new Error("Runtime capability receipt count exceeds the target budget");
  return Promise.all(
    paths.map(async (path, index) => {
      const file = Bun.file(path);
      if (file.size < 1 || file.size > 1024 * 1024)
        throw new Error("Runtime capability receipt exceeds its byte budget");
      const bytes = await file.bytes();
      if (bytes.length < 1 || bytes.length > 1024 * 1024)
        throw new Error("Runtime capability receipt exceeds its byte budget");
      const fact = normalizeRuntimeHomeFact(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
      options?.onReceipt?.({ index, fact, sha256: sha(bytes), bytes: bytes.length });
      return fact;
    }),
  );
}

const featureCode = `if (!Bun.Video.available) throw new Error("Native video unavailable");
const video = new Bun.Video("clip.mp4");
const metadata = await video.metadata();
await video.frame(1)
  .resize(320, 180)
  .png()
  .write("frame.png");`;
const cliCode = `bun video info --json
bun video metadata clip.mp4 --json
bun video frame clip.mp4 preview.webp --time 1 --width 320 --height 180 --format webp`;

function runtimeCards(facts: readonly RuntimeHomeFact[]) {
  if (!facts.length)
    return '<p>Runtime measurements are pending. <a href="/docs/runtime/video">Read the API and its limits</a>.</p>';
  return `<ul class="home-runtime-facts" role="list">${facts
    .map(fact => {
      const failures = fact.gates.reduce((sum, gate) => sum + gate.failed, 0);
      const observed = fact.nativeVideo.available && fact.nativeImage.available;
      const checked = observed && fact.gates.length > 0 && !failures && fact.gates.every(gate => gate.passed > 0);
      const distribution = fact.distribution?.status ?? "pending";
      return `<li><h3>${escapeHtml(targets[fact.target]!)}</h3><p class="home-status ${checked ? "home-status-ready" : "home-status-pending"}">${checked ? "Native surfaces measured · supplied gates pass" : "Native qualification pending"}</p><p>Bun ${escapeHtml(fact.version)} · <a href="https://github.com/aphrody-labs/bun/tree/${fact.source}">source ${fact.source.slice(0, 10)}</a></p><dl><dt>Bun.Video</dt><dd>${fact.nativeVideo.available ? "Provider present" : "Unavailable"}</dd><dt>Bun.Image</dt><dd>${fact.nativeImage.available ? "API present" : "Unavailable"}</dd><dt>Supplied gates</dt><dd>${fact.gates.length}; ${failures} failures</dd><dt>Distribution ABI</dt><dd>${distribution === "failed" ? "Release gate fails" : distribution === "passed" ? "Supplied release gate passes" : "Qualification pending"}${fact.distribution?.minimumGLIBC ? ` · GLIBC ≥ ${escapeHtml(fact.distribution.minimumGLIBC)}` : ""}</dd></dl></li>`;
    })
    .join("")}</ul>`;
}
function searchSurface() {
  return `<section id="home-search" class="home-section"><div class="mx-auto max-w-container px-gutter"><h2 class="display home-section-heading">Find the source.<br>Keep the citations.</h2><form id="home-rag-form" class="home-search-form" action="/api/site/rag" method="get"><label for="home-question">Search Bun docs and source graph</label><p id="home-search-hint">A read-only answer with the documentation and source snapshot it came from.</p><div class="home-search-input"><input id="home-question" name="q" type="search" required maxlength="500" autocomplete="off" aria-describedby="home-search-hint" placeholder="How do I turn a video frame into a WebP?"><button type="submit">Search</button><button id="home-search-cancel" type="button" hidden>Cancel</button></div></form><p id="home-search-status" role="status" aria-atomic="true"></p><article id="home-answer" aria-labelledby="home-answer-heading" hidden><h3 id="home-answer-heading">Answer</h3><p id="home-answer-mode"></p><p id="home-answer-source"></p><div id="home-answer-text"></div><h4>Sources</h4><ol id="home-answer-citations"></ol><p id="home-answer-graph"></p></article><noscript><p>Open <a href="/docs/runtime/video">Bun.Video docs</a> and the <a href="/graph/">source graph</a>, or submit the form for the read-only JSON response.</p></noscript></div></section>`;
}
function detailsSurface(facts: readonly RuntimeHomeFact[], graph?: HomeGraphFact) {
  const graphNote = graph
    ? `<p>Graph source <a href="https://github.com/aphrody-labs/bun/tree/${graph.source}">${graph.source.slice(0, 10)}</a>${graph.nodes === undefined ? "" : ` · ${graph.nodes} nodes`}${graph.edges === undefined ? "" : ` · ${graph.edges} edges`}${graph.truncated ? " · sampled coverage" : ""}. <a href="/graph/">Explore the graph</a>.</p>`
    : '<p><a href="/graph/">Explore the source graph</a>. Search results report the snapshot they use.</p>';
  return `<section class="home-section home-qualification"><div class="mx-auto max-w-container px-gutter"><h2 class="display home-section-heading">Measured on a target.<br>Explicit about the limits.</h2>${runtimeCards(facts)}<p>MP4 with H.264 video and AAC audio is the qualified native input. Other containers, profiles and targets need their own evidence. Image encoders follow platform support.</p><p>Native MP4 remux has documented container-layout limits. FFmpeg/mpv adapters, browser capture, DRM and GPU playback have separate qualification.</p><p><a href="/docs/runtime/video">Native API and bounds</a> · <a href="/docs/video">Bun Video package</a> · <a href="/downloads">Published downloads</a></p>${graphNote}</div></section>`;
}

export const HOME_UI_CSS = `
.home-lead{font-size:clamp(1.1rem,2vw,1.4rem);line-height:1.5;color:rgb(var(--c-fg-muted));max-width:36ch;margin:1.5rem 0}
.home-hero-actions{display:flex;flex-wrap:wrap;gap:1rem;margin:2rem 0}.home-hero-actions a,.home-search-input button{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:.7rem 1.2rem;font-weight:600;border:1px solid rgb(var(--c-line-strong));border-radius:999px;background:rgb(var(--c-accent));color:rgb(var(--c-on-slab));text-decoration:none}
.home-hero-actions a+a{background:rgb(var(--c-canvas));color:rgb(var(--c-fg))}.home-kicker{font:500 .75rem var(--font-mono);color:rgb(var(--c-accent-strong));letter-spacing:.06em;text-transform:uppercase}
.home-code{background:rgb(var(--c-code-bg));border:1px solid rgb(var(--c-line-strong));border-radius:16px;overflow:hidden;margin:2rem 0}.home-code header{padding:1rem 1.25rem;border-bottom:1px solid rgb(var(--c-line));font:500 .75rem var(--font-mono);display:flex;gap:1rem;justify-content:space-between}.home-code pre{padding:1.25rem;font-size:.8rem;line-height:1.9;overflow:auto;color:rgb(var(--c-code-fg));margin:0}.home-code .home-copy{background:none;color:inherit;border:1px solid rgb(var(--c-line));padding:.4rem .7rem;min-height:32px}
.home-section{border-top:1px solid rgb(var(--c-line));padding:clamp(3rem,7vw,6rem) 0}.home-section-heading{font-size:clamp(2rem,4.5vw,4rem);margin:0 0 2rem;max-width:20ch}.home-section p{line-height:1.7;max-width:85ch}.home-section a{color:rgb(var(--c-accent-strong));text-underline-offset:.2em}
.home-runtime-facts{list-style:none;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,19rem),1fr));gap:1rem;margin:2rem 0}.home-runtime-facts li{border:1px solid rgb(var(--c-line));border-radius:16px;padding:1.5rem;background:rgb(var(--c-subtle))}.home-runtime-facts h3{font:700 1.2rem var(--font-display);margin:0 0 .75rem}.home-runtime-facts dl{display:grid;grid-template-columns:auto 1fr;gap:.4rem 1rem;font-size:.85rem}.home-runtime-facts dd{margin:0}.home-status{font-size:.8rem;font-weight:600}.home-status-ready{color:rgb(var(--c-fg));border-left:3px solid rgb(var(--c-success));padding-left:.6rem}.home-status-pending{color:rgb(var(--c-fg-muted))}
.home-search-form label{display:block;font-weight:600}.home-search-input{display:flex;flex-wrap:wrap;gap:.75rem;margin-top:1rem}.home-search-input input{flex:1 1 24rem;min-width:0;min-height:48px;border:1px solid rgb(var(--c-fg-faint));border-radius:999px;padding:.75rem 1rem;background:rgb(var(--c-canvas));color:rgb(var(--c-fg));font:inherit}.home-search-input [hidden],[hidden]{display:none!important}
#home-search-status{min-height:1.7em;color:rgb(var(--c-fg-muted));margin:1rem 0}#home-answer{border:1px solid rgb(var(--c-line));border-radius:16px;background:rgb(var(--c-subtle));padding:1.5rem;margin-top:2rem}#home-answer h3{font:700 1.5rem var(--font-display)}#home-answer-text{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.7}#home-answer-citations li{margin:.75rem 0}#home-answer-citations small{display:block;overflow-wrap:anywhere;color:rgb(var(--c-fg-muted))}#home-answer-mode,#home-answer-source,#home-answer-graph{font-size:.85rem;color:rgb(var(--c-fg-muted));overflow-wrap:anywhere}
.home-settings{display:flex;align-items:center;gap:.75rem;flex-wrap:wrap;padding:1.5rem 0}.home-settings select{min-height:44px;max-width:100%;padding:.5rem .75rem;border:1px solid rgb(var(--c-fg-faint));background:rgb(var(--c-canvas));color:rgb(var(--c-fg));font:inherit}.home-mobile{display:none}.home-mobile summary{min-height:44px;cursor:pointer;padding:.6rem}.home-mobile nav{position:absolute;right:1rem;background:rgb(var(--c-canvas));border:1px solid rgb(var(--c-line));padding:1rem;z-index:50}.home-mobile a{display:block;padding:.75rem;min-height:44px}
html[data-aphrody-home] :where(a,button,input,select,summary):focus-visible{outline:3px solid rgb(var(--c-accent-strong));outline-offset:4px}html[data-aphrody-home] main:focus-visible{outline:2px solid rgb(var(--c-accent-strong));outline-offset:-2px}.home-api-card{min-height:220px;background:rgb(var(--c-subtle));border:1px solid rgb(var(--c-line));border-radius:16px;padding:1.5rem;text-decoration:none}.home-api-card h3{font:700 1.4rem var(--font-display)}.home-api-card p{color:rgb(var(--c-fg-muted));line-height:1.6}.home-api-card code{font-size:.8rem;color:rgb(var(--c-accent-strong))}
@media(max-width:767px){.home-mobile{display:block}.home-search-input button{flex:1}.home-code{margin-top:1rem}}
@media(pointer:coarse){.home-code .home-copy{min-height:44px}}
`;

export const HOME_SEARCH_SCRIPT = `(()=>{
const form=document.getElementById('home-rag-form'),input=document.getElementById('home-question'),status=document.getElementById('home-search-status'),answer=document.getElementById('home-answer'),cancel=document.getElementById('home-search-cancel');if(!form||!input||!status||!answer||!cancel)return;
let active=null,sequence=0;const byId=id=>document.getElementById(id);const text=(id,value)=>{byId(id).textContent=value};
const sourceURL=(value,source,path)=>{if(typeof value!=='string'||typeof path!=='string'||path.length>1024||path.includes('\\\\')||path.split('/').some(part=>!part||part==='.'||part==='..'))throw Error('Invalid source path');const u=new URL(value);if(u.origin!=='https://github.com'||u.username||u.password||u.search||u.hash.length>512||decodeURIComponent(u.pathname)!=='/aphrody-labs/bun/blob/'+source+'/'+path)throw Error('Source URL does not match its snapshot path');return u.href};
const read=async response=>{const reader=response.body.getReader(),parts=[];let bytes=0;try{for(;;){const r=await reader.read();if(r.done)break;bytes+=r.value.length;if(bytes>1048576)throw Error('Answer size limit');parts.push(r.value)}}finally{await reader.cancel().catch(()=>{});reader.releaseLock()}const joined=new Uint8Array(bytes);let offset=0;for(const p of parts){joined.set(p,offset);offset+=p.length}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(joined))};
form.addEventListener('submit',async event=>{event.preventDefault();if(!form.reportValidity())return;const query=input.value.trim();if(!query||query.length>500)return;active?.abort();const controller=new AbortController(),current=++sequence;active=controller;const timer=setTimeout(()=>controller.abort(),30000);form.setAttribute('aria-busy','true');cancel.hidden=false;status.textContent='';answer.hidden=true;try{const url=new URL('/api/site/rag',location.origin);url.searchParams.set('q',query);url.searchParams.set('limit','4');const response=await fetch(url,{method:'GET',credentials:'omit',redirect:'error',signal:controller.signal,headers:{Accept:'application/json'}});if(!response.ok){await response.body?.cancel();throw Error(response.status===503?'The source snapshot is unavailable. Browse the docs while it is refreshed.':'Search is unavailable. Please try again.')}if(!response.headers.get('content-type')?.startsWith('application/json'))throw Error('Search returned an invalid response');const data=await read(response);if(current!==sequence)return;
if(!/^[a-f0-9]{40}$/.test(data.snapshot?.source)||!/^[a-f0-9]{64}$/.test(data.snapshot?.id)||data.snapshot.repository!=='aphrody-labs/bun'||data.snapshot.profile!=='bun'||typeof data.answer!=='string'||data.answer.length>32000||!Array.isArray(data.citations)||data.citations.length>32)throw Error('Search returned an invalid snapshot');
const list=byId('home-answer-citations');list.replaceChildren();const fragment=document.createDocumentFragment();for(const citation of data.citations){if(!/^S[1-9][0-9]*$/.test(citation.id)||typeof citation.title!=='string'||typeof citation.path!=='string'||!/^[a-f0-9]{64}$/.test(citation.sha256))throw Error('Search returned invalid citations');const li=document.createElement('li'),a=document.createElement('a'),meta=document.createElement('small');a.href=sourceURL(citation.url,data.snapshot.source,citation.path);a.textContent='['+citation.id+'] '+citation.title;meta.textContent=citation.path+' · SHA256 '+citation.sha256;li.append(a,meta);fragment.append(li)}list.append(fragment);
text('home-answer-mode',data.generation?.status==='complete'?'Answer grounded in the cited snapshot':'Source excerpts from the cited snapshot');text('home-answer-source','Snapshot '+data.snapshot.id.slice(0,12)+' · source '+data.snapshot.source);text('home-answer-text',data.answer);
const coverage=data.graph?.native?.coverage;text('home-answer-graph',coverage&&Number.isSafeInteger(coverage.nodes)&&coverage.nodes>=0&&Number.isSafeInteger(coverage.edges)&&coverage.edges>=0?'Source graph: '+coverage.nodes+' nodes, '+coverage.edges+' edges'+(coverage.truncated?' · sampled coverage':''):Array.isArray(data.graph?.links)?'Source graph sample: '+data.graph.links.length+' relationships.':'Source graph unavailable.');answer.hidden=false;status.textContent=data.citations.length?data.citations.length+' cited sources.':'No matching source in this snapshot.';
}catch(error){if(current===sequence){answer.hidden=true;status.textContent=controller.signal.aborted?'Search cancelled. Submit again to retry.':error instanceof Error&&['The source snapshot is unavailable. Browse the docs while it is refreshed.','Search is unavailable. Please try again.'].includes(error.message)?error.message:'Search unavailable. Browse the docs and retry.'}}finally{clearTimeout(timer);if(current===sequence){active=null;form.removeAttribute('aria-busy');cancel.hidden=true}}});
cancel.addEventListener('click',()=>active?.abort());document.addEventListener('keydown',event=>{if(event.key==='Escape'&&active)active.abort()});
document.addEventListener('click',event=>{const button=event.target instanceof Element&&event.target.closest('button[aria-label="Ask AI about Bun"]');if(!button)return;event.preventDefault();event.stopImmediatePropagation();document.getElementById('home-search').scrollIntoView({block:'start'});input.focus({preventScroll:true})},true);
for(const button of document.querySelectorAll('[data-home-copy]'))button.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(document.getElementById(button.dataset.homeCopy).textContent);status.textContent='Code copied.'}catch{status.textContent='Select and copy the code manually.'}});
})();`;

/** Pagefind-compatible surface over the site's existing generated documentation inventory. */
export const HOME_DOC_SEARCH_MODULE = `let index;const escape=s=>String(s).replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));const load=()=>index??=fetch('/docs/search.json').then(async r=>{if(!r.ok)throw Error('Documentation index unavailable');const rows=await r.json();if(!Array.isArray(rows))throw Error('Invalid documentation index');return rows.filter(d=>typeof d.t==='string'&&typeof d.u==='string'&&d.u.startsWith('/')&&!d.u.startsWith('//'))});export const options=async()=>{};export const init=async()=>{await load()};export const preload=()=>{};export async function debouncedSearch(query,options={}){const terms=query.toLowerCase().split(/\\s+/).filter(Boolean),rows=await load(),section=d=>d.u.startsWith('/guides')?'Guides':d.u.startsWith('/reference')?'Reference':d.u.startsWith('/blog')?'Blog':'Docs';return {results:rows.filter(d=>!options.filters?.section||section(d)===options.filters.section).map(d=>{const title=d.t.toLowerCase(),body=[d.d,...(d.h||[]),d.x].join(' ').toLowerCase();let score=0;for(const term of terms){if(title.includes(term))score+=title.startsWith(term)?12:8;else if(body.includes(term))score++;else return null}return {id:d.u,score,data:async()=>({url:d.u,meta:{title:d.t},filters:{section:[section(d)]},excerpt:escape(d.d||d.x||''),sub_results:[]})}}).filter(Boolean).sort((a,b)=>b.score-a.score).slice(0,40)}};`;

/** Retain the captured components and assets; fork capabilities are separate additions. */
export function adaptUpstreamHome(
  html: string,
  options: {
    source: string;
    origin: string;
    facts: readonly RuntimeHomeFact[];
    graph?: HomeGraphFact;
    cssPath: string;
    scriptPath: string;
    bootstrapPath: string;
  },
) {
  if (!commit.test(options.source)) throw new Error("Homepage requires its source commit");
  return (
    new HTMLRewriter()
      .on("script", {
        element(element) {
          const src = element.getAttribute("src");
          if (
            src &&
            (/analytics|plausible|cloudflareinsights/.test(src) ||
              src.startsWith("https:") ||
              src.startsWith("http:") ||
              src.startsWith("//"))
          )
            element.remove();
        },
      })
      .on("link[rel=preconnect],link[rel=dns-prefetch],meta[name=color-scheme]", {
        element(element) {
          element.remove();
        },
      })
      .on("html", {
        element(element) {
          element.setAttribute("data-aphrody-home", "bun");
        },
      })
      .on("title", {
        element(element) {
          element.setInnerContent("Bun by Aphrody Labs");
        },
      })
      .on('a[href="/blog/bun-joins-anthropic"]', {
        element(element) {
          element.setAttribute("href", "https://bun.com/blog/bun-joins-anthropic");
          element.setInnerContent("Upstream Bun news: Bun has joined Anthropic");
        },
      })
      .on('a[href="/get"]', {
        element(element) {
          element.setAttribute("href", "/downloads");
          element.setInnerContent("Install Aphrody Bun");
        },
      })
      .on('link[rel="canonical"]', {
        element(element) {
          element.setAttribute("href", options.origin + "/");
        },
      })
      .on('a[aria-label="Bun — home"]', {
        element(element) {
          element.setAttribute("aria-label", "Aphrody — home");
          element.setInnerContent(
            '<picture><source media="(prefers-color-scheme:dark)" srcset="/aphrody-logo-dark.svg"><img src="/aphrody-logo.svg" alt="Aphrody" width="88" height="32"></picture>',
            { html: true },
          );
        },
      })
      .on('a[aria-label="GitHub"]', {
        element(element) {
          element.setAttribute("href", "https://github.com/aphrody-labs/bun");
        },
      })
      .on('a[href="/docs/runtime"]', {
        text(text) {
          if (text.text === "Reference" || text.text === "API Reference") text.replace("Native APIs");
        },
      })
      .on('a[class*="group/pill"]', {
        element(element) {
          element.setAttribute("href", "/downloads");
        },
      })
      .on('a[class*="group/pill"] span:first-child', {
        element(element) {
          element.setInnerContent("FORK");
        },
      })
      .on('a[class*="group/pill"] span:nth-child(2)', {
        element(element) {
          element.setInnerContent("Published Aphrody releases");
        },
      })
      .on("head", {
        element(element) {
          element.append(
            `<link rel="stylesheet" href="${BRAND.tokensCss}"><link rel="stylesheet" href="${BRAND.fontsCss}"><link rel="stylesheet" href="${options.cssPath}"><script src="${options.scriptPath}" defer></script>`,
            { html: true },
          );
        },
      })
      // Keep the fork island outside React's captured __bun root, so hydration owns only upstream components.
      .on("body", {
        element(element) {
          element.prepend(
            '<p class="mx-auto max-w-container px-gutter py-2 text-[12px] text-fg-muted">Aphrody Bun · Components, benchmarks and customer references below are attributed to <a href="https://bun.com/">upstream Bun</a>. Fork capabilities and measured targets are listed separately.</p>',
            { html: true },
          );
          element.append(
            `<section class="home-section"><div class="mx-auto max-w-container px-gutter"><h2 class="display home-section-heading">Bun by Aphrody Labs</h2><p>The components, benchmarks and customer references above come from upstream Bun. They are not fork measurements or endorsements. <a href="/home-provenance.json">Source and asset hashes</a>.</p><h3>Bun.Video. One fluent image pipeline.</h3><p>Native video metadata, frames and transformed images directly in TypeScript.</p><div class="home-code"><header>native-video.ts</header><pre><code>${escapeHtml(featureCode)}</code></pre></div><div class="home-code"><header>Command line</header><pre><code>${escapeHtml(cliCode)}</code></pre></div><p><a href="/docs/runtime/video">Bun.Video docs</a> · <a href="/docs/runtime/image">Bun.Image</a> · <a href="/downloads">Fork downloads</a></p></div></section>` +
              searchSurface() +
              detailsSurface(options.facts, options.graph),
            { html: true },
          );
        },
      })
      .on("*", {
        element(element) {
          // Snapshot attributes before mutating the native iterator.
          // oxlint-disable-next-line unicorn/no-useless-spread
          for (const [name, value] of [...element.attributes]) {
            if (name === "href" && element.tagName === "a") element.setAttribute(name, homeDocumentationHref(value));
            if (name.toLowerCase().startsWith("on") || /^javascript:/i.test(value)) element.removeAttribute(name);
            if (name === "style")
              element.setAttribute(
                name,
                value.replace(/url\((?:&quot;|["']?)logos\/([^\)"'&]+)(?:&quot;|["']?)\)/g, "url(/logos/$1)"),
              );
            if (value.includes("https://bun.sh/install") || value.includes("https://github.com/oven-sh/bun"))
              element.setAttribute(
                name,
                value
                  .replace("https://bun.sh/install.ps1", options.origin + "/install.ps1")
                  .replace(/https:\/\/bun\.sh\/install(?![\w.])/g, options.origin + "/install.sh")
                  .replace("https://github.com/oven-sh/bun", "https://github.com/aphrody-labs/bun"),
              );
          }
        },
      })
      .transform(adaptHomeDocumentationLinks(rewriteInstallers(html, options.origin)))
  );
}

/** Adapt the captured logo component itself, rather than patching React's DOM after hydration. */
export function adaptHomeModule(code: string, origin: string): string {
  let output = adaptHomeDocumentationLinks(rewriteInstallers(code, origin));
  output = output
    .replaceAll('label:"Reference"', 'label:"Native APIs"')
    .replaceAll('label:"API Reference"', 'label:"Native APIs"');
  output = output
    .replace("function He({releaseHref:d}){", 'function He({releaseHref:d}){d="/downloads";')
    .replace('children:["Bun v",T," released"]', 'children:"Published Aphrody releases"')
    .replace('children:"NEW"', 'children:"FORK"');
  output = output
    .replace("function Wr(h){if(qr)", 'function Wr(h){if(new URL(h,location.href).pathname!=="/")return;if(qr)')
    .replace(
      "function W(h,k){if(qr)",
      'function W(h,k){if(new URL(h,location.href).pathname!=="/"){location.assign(h);return}if(qr)',
    );
  output = output
    .replaceAll('children:["Install Bun v",T]', 'children:"Install Aphrody Bun"')
    .replaceAll('href:"/get"', 'href:"/downloads"')
    .replaceAll(
      "Bun has joined Anthropic — and Anthropic is betting on Bun",
      "Upstream Bun news: Bun has joined Anthropic",
    )
    .replaceAll('href:"/blog/bun-joins-anthropic"', 'href:"https://bun.com/blog/bun-joins-anthropic"')
    .replaceAll('"Bun in production"', '"Upstream Bun in production"');
  if (output.includes("function we(){") && output.includes('"_pagefind"')) {
    const start = output.indexOf("function we(){"),
      end = output.indexOf("var Pe=", start);
    if (end < 0) throw Error("Captured search module boundary changed");
    output =
      output.slice(0, start) +
      'function we(){return J??=import("./aphrody-doc-search.js").then(async m=>(await m.init(),m))}' +
      output.slice(end);
    output = output
      .replace(/function ce\(\)\{.*?return X\}/, "function ce(){return Promise.resolve(null)}")
      .replace(/function \$e\(\)\{.*?return Y\}/, "function $e(){return Promise.resolve(null)}");
  }
  const label = '"aria-label":"Bun — home"';
  const at = output.indexOf(label);
  if (at < 0) return output;
  const start = output.lastIndexOf("function ", at);
  const end = output.indexOf("function ", at);
  if (start < 0 || end < 0) throw new Error("Captured logo component boundary changed");
  const component = output.slice(start, end);
  const children = /children:\[e\("img",\{[^}]*\}\),e\(\w+,\{[^}]*\}\)\]/;
  if (!children.test(component)) throw new Error("Captured logo component structure changed");
  const adapted = component
    .replace(label, '"aria-label":"Aphrody — home"')
    .replace(
      children,
      'children:t("picture",{children:[e("source",{media:"(prefers-color-scheme:dark)",srcSet:"/aphrody-logo-dark.svg"}),e("img",{src:"/aphrody-logo.svg",alt:"Aphrody",width:88,height:32,className:"h-[34px] w-auto"})]})',
    );
  output = output.slice(0, start) + adapted + output.slice(end);
  return output;
}

export async function buildUpstreamHome(options: UpstreamHomeOptions) {
  if (!commit.test(options.source)) throw new Error("Homepage source commit is required");
  const origin = new URL(options.origin ?? "https://aphrody.app");
  if (
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash ||
    origin.pathname !== "/" ||
    (origin.protocol !== "https:" &&
      !(origin.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)))
  )
    throw new Error("Invalid homepage origin");
  const facts = options.facts.map(publicRuntimeHomeFact);
  if (facts.length > 8 || new Set(facts.map(fact => targets[fact.target])).size !== facts.length)
    throw new Error("Duplicate or excessive runtime targets");
  if (
    options.graph &&
    (!commit.test(options.graph.source) ||
      (options.graph.snapshotId && !digest.test(options.graph.snapshotId)) ||
      [options.graph.nodes, options.graph.edges].some(
        value => value !== undefined && (!Number.isSafeInteger(value) || value < 0),
      ))
  )
    throw new Error("Invalid public graph facts");
  const graph = options.graph
    ? {
        source: options.graph.source,
        ...(options.graph.snapshotId !== undefined ? { snapshotId: options.graph.snapshotId } : {}),
        ...(options.graph.nodes !== undefined ? { nodes: options.graph.nodes } : {}),
        ...(options.graph.edges !== undefined ? { edges: options.graph.edges } : {}),
        truncated: options.graph.truncated === true,
      }
    : undefined;
  const root = resolve(options.captureRoot),
    manifestFile = Bun.file(join(root, "manifest.json"));
  if (manifestFile.size < 1 || manifestFile.size > 1024 * 1024)
    throw new Error("Captured homepage manifest exceeds its byte budget");
  const manifestBytes = await manifestFile.bytes(),
    manifest = JSON.parse(new TextDecoder().decode(manifestBytes));
  if (
    manifest.schemaVersion !== 1 ||
    manifest.seedUrl !== "https://bun.com/" ||
    manifest.failures?.length ||
    !Array.isArray(manifest.files) ||
    manifest.files.length > 512
  )
    throw new Error("Incomplete Bun homepage capture");
  const confined = (path: string) => {
    if (isAbsolute(path) || path.includes("\\") || path.split("/").some(part => ["", ".", ".."].includes(part)))
      throw new Error("Captured asset path escapes its source");
    const result = resolve(root, path),
      within = relative(root, result);
    if (isAbsolute(within) || within.startsWith("..")) throw new Error("Captured asset path escapes its source");
    return result;
  };
  const entries = manifest.files;
  const assets: HomeAsset[] = [],
    inputs: { url: string; path: string; sha256: string; captureDeclaredBlake3: string; bytes: number }[] = [];
  let html = "",
    stylesheet = "",
    htmlPath = "";
  for (const entry of entries) {
    if (
      !entry.path.startsWith(new URL(entry.url).hostname + "/") ||
      !digest.test(entry.blake3) ||
      !Number.isSafeInteger(entry.bytes) ||
      entry.bytes < 1 ||
      entry.bytes > 2 * 1024 * 1024
    )
      throw new Error("Invalid captured Bun asset");
    const bytes = new Uint8Array(await readFile(confined(entry.path)));
    if (bytes.length !== entry.bytes) throw new Error("Captured Bun asset size changed");
    const sha256 = sha(bytes);
    inputs.push({ url: entry.url, path: entry.path, sha256, captureDeclaredBlake3: entry.blake3, bytes: bytes.length });
    if (entry.url === "https://bun.com/") {
      html = new TextDecoder().decode(bytes);
      htmlPath = confined(entry.path);
    } else {
      const inert = new URL(entry.url).origin !== "https://bun.com" || /analytics/.test(entry.path);
      const moduleBytes =
        !inert && entry.path.endsWith(".js")
          ? new TextEncoder().encode(adaptHomeModule(new TextDecoder().decode(bytes), origin.origin))
          : bytes;
      assets.push({
        path: inert ? "_upstream/" + entry.path : entry.path.slice("bun.com/".length),
        bytes: moduleBytes,
        sha256: sha(moduleBytes),
      });
      if (entry.kind === "css") stylesheet += new TextDecoder().decode(bytes);
    }
  }
  if (
    !html ||
    !stylesheet ||
    !assets.some(asset => asset.path.endsWith("Archivo.var.woff2")) ||
    !assets.some(asset => asset.path.endsWith("MartianMono.var.woff2"))
  )
    throw new Error("Captured Bun HTML, stylesheet or fonts are missing");
  const documentation = await Promise.all(
    ["docs/runtime/video.mdx", "docs/runtime/image.mdx"].map(async path => ({
      path,
      sha256: sha(new Uint8Array(await readFile(join(options.sourceRoot, path)))),
    })),
  );
  const icon = new Uint8Array(await readFile(join(options.sourceRoot, "docs/logo/logo-wordmark-light.svg")));
  assets.push({ path: "aphrody-logo.svg", bytes: icon, sha256: sha(icon) });
  const darkIcon = new Uint8Array(await readFile(join(options.sourceRoot, "docs/logo/logo-wordmark-dark.svg")));
  assets.push({ path: "aphrody-logo-dark.svg", bytes: darkIcon, sha256: sha(darkIcon) });
  const searchBytes = new TextEncoder().encode(HOME_DOC_SEARCH_MODULE);
  assets.push({ path: "_assets/aphrody-doc-search.js", bytes: searchBytes, sha256: sha(searchBytes) });
  const brandedFiles: Record<string, string> = {
    "favicon.ico": "favicon.ico",
    "manifest.json": "site.webmanifest",
    "icons/favicon-32x32.png": "icon-192.png",
    "icons/icon-192x192.png": "icon-192.png",
    "icons/apple-touch-icon.png": "apple-touch-icon.png",
  };
  for (const [path, name] of Object.entries(brandedFiles)) {
    const original = assets.find(asset => asset.path === path);
    if (original) original.path = "_upstream/bun.com/" + path;
    const bytes = new Uint8Array(await readFile(join(options.sourceRoot, "docs/logo", name)));
    assets.push({ path, bytes, sha256: sha(bytes) });
  }
  for (const name of [
    "icon.svg",
    "icon-192.png",
    "icon-512.png",
    "maskable-192.png",
    "maskable-512.png",
    "apple-touch-icon.png",
  ]) {
    const bytes = new Uint8Array(await readFile(join(options.sourceRoot, "docs/logo", name)));
    assets.push({ path: name, bytes, sha256: sha(bytes) });
  }
  const theme = parseBunHomeTheme(stylesheet),
    css = HOME_UI_CSS,
    script = M3_JS + HOME_SEARCH_SCRIPT + WEBMCP_SCRIPT;
  const add = (kind: string, body: string) => {
    const sha256 = sha(body),
      path = `_assets/aphrody-home-${kind}-${sha256.slice(0, 16)}.${kind === "style" ? "css" : "js"}`;
    assets.push({ path, bytes: new TextEncoder().encode(body), sha256 });
    return "/" + path;
  };
  const cssPath = add("style", css),
    scriptPath = add("controls", script),
    bootstrapPath = add("scheme", HOME_THEME_BOOTSTRAP);
  const adaptedInline = externalizeInlineScripts(
    adaptUpstreamHome(rewriteCapturedLinks(html, htmlPath, root), {
      source: options.source,
      origin: origin.origin,
      facts,
      ...(graph ? { graph } : {}),
      cssPath,
      scriptPath,
      bootstrapPath,
    }),
  );
  const adapted = adaptedInline.html;
  for (const asset of adaptedInline.assets) {
    const bytes = new TextEncoder().encode(asset.content);
    assets.push({ path: asset.file, bytes, sha256: sha(bytes) });
  }
  const allowed = new Set([...assets.map(asset => "/" + asset.path), BRAND.tokensCss, BRAND.fontsCss]);
  const violations: string[] = [];
  new HTMLRewriter()
    .on("script[src],link[rel=stylesheet],link[rel=preload],img[src],source[src],video[src]", {
      element(element) {
        const href = element.getAttribute(element.tagName === "link" ? "href" : "src");
        if (href && !allowed.has(href) && !allowed.has(new URL(href, origin).pathname)) violations.push(href);
      },
    })
    .on("script:not([src]),iframe,object,embed", {
      element(element) {
        if (
          element.tagName === "script" &&
          ["application/json", "application/ld+json"].includes(element.getAttribute("type") ?? "")
        )
          return;
        violations.push(element.tagName);
      },
    })
    .transform(adapted);
  if (violations.length)
    throw new Error("Adapted homepage contains an unapproved executable or fetched asset: " + violations.join(", "));
  const provenance = {
    schema: 1,
    source: options.source,
    upstream: {
      url: "https://bun.com/",
      manifestSha256: sha(manifestBytes),
      inputs,
      captureBlake3Verification: "declared-only",
      observedSha256: "computed-from-captured-bytes",
    },
    documentation,
    runtime: facts,
    graph: graph ?? null,
    theme: {
      light: theme.light,
      dark: theme.dark,
      roleMapping: "Canonical Aphrody M3 roles",
      tokensCss: BRAND.tokensCss,
      fontsCss: BRAND.fontsCss,
    },
    qualification:
      "Measured surfaces and supplied gates per target; no claim that every target, codec, package, browser or GPU is qualified",
    generated: {
      htmlSha256: sha(adapted),
      assets: assets.map(asset => ({ path: asset.path, bytes: asset.bytes.length, sha256: asset.sha256 })),
    },
  };
  const provenanceBytes = new TextEncoder().encode(JSON.stringify(provenance, null, 2) + "\n");
  assets.push({ path: "home-provenance.json", bytes: provenanceBytes, sha256: sha(provenanceBytes) });
  return { html: adapted, assets, provenance };
}
