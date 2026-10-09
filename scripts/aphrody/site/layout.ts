// Gabarit HTML, feuille de style et script du site aphrody.com (rôles Material 3 de la graine Aphrody #8c6c88,
// les mêmes que la page de downloads.aphrody.com).
import { escapeHtml } from "./mdx.ts";

export type NavLink = { label: string; href: string; active?: boolean };

export type Shell = {
  origin: string;
  path: string;
  title: string;
  description?: string;
  body: string;
  tabs: NavLink[];
  sidebar?: string;
  toc?: { level: number; id: string; text: string }[];
  alternateMarkdown?: string;
  bodyClass?: string;
};

export function shell(s: Shell): string {
  const canonical = s.origin + s.path;
  const toc =
    s.toc && s.toc.length > 1
      ? `<nav class="toc" aria-label="On this page"><p>On this page</p><ul>${s.toc
          .map(h => `<li class="l${h.level}"><a href="#${escapeHtml(h.id)}">${h.text}</a></li>`)
          .join("")}</ul></nav>`
      : "";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(s.title)}</title>
${s.description ? `<meta name="description" content="${escapeHtml(s.description)}">` : ""}
<link rel="canonical" href="${escapeHtml(canonical)}">
${s.alternateMarkdown ? `<link rel="alternate" type="text/markdown" href="${escapeHtml(s.alternateMarkdown)}">` : ""}
<meta property="og:title" content="${escapeHtml(s.title)}">
<meta property="og:url" content="${escapeHtml(canonical)}">
${s.description ? `<meta property="og:description" content="${escapeHtml(s.description)}">` : ""}
<link rel="icon" type="image/svg+xml" href="/icon.svg">
<link rel="stylesheet" href="/assets/site.css">
<script src="/assets/site.js" defer></script>
</head><body class="${s.bodyClass ?? ""}">
<header class="top"><div class="bar">
<a class="brand" href="/"><img src="/icon.svg" alt="" width="28" height="28"><span>Bun <small>Aphrody fork</small></span></a>
<nav class="tabs-nav" aria-label="Sections">${s.tabs
    .map(t => `<a href="${escapeHtml(t.href)}"${t.active ? ' aria-current="page"' : ""}>${escapeHtml(t.label)}</a>`)
    .join("")}</nav>
<div class="search"><input type="search" id="q" placeholder="Search docs" aria-label="Search docs" autocomplete="off"><div id="results" role="listbox" hidden></div></div>
<a class="gh" href="https://github.com/aphrody-labs/bun" aria-label="GitHub">GitHub</a>
</div></header>
<div class="layout${s.sidebar ? " with-sidebar" : ""}${toc ? " with-toc" : ""}">
${s.sidebar ? `<aside class="sidebar" aria-label="Documentation">${s.sidebar}</aside>` : ""}
<main id="content">${s.body}</main>
${toc}
</div>
<footer class="foot"><div>
<p>Bun, Aphrody fork, built from <a href="https://github.com/aphrody-labs/bun">aphrody-labs/bun</a>. Bun is MIT licensed by Oven; upstream at <a href="https://bun.com">bun.com</a>.</p>
<p><a href="/docs">Docs</a> · <a href="/guides">Guides</a> · <a href="/benchmarks">Benchmarks</a> · <a href="/downloads">Downloads</a> · <a href="/blog">Releases</a> · <a href="/llms.txt">llms.txt</a> · <a href="https://downloads.aphrody.com">Aphrody</a></p>
</div></footer>
</body></html>
`;
}

export const CSS = `:root{color-scheme:light dark;--bg:#fff7fa;--on-bg:#201a1e;--primary:#7e4d7c;--on-primary:#fff;--primary-container:#ffd6f8;--on-primary-container:#310a32;--surface:#fff7fa;--sc-low:#fbf1f5;--sc:#f7ebf1;--sc-high:#f1e5eb;--on-sv:#4e444b;--outline:#7f747c;--outline-v:#d1c3cc;--tertiary:#805341;--error:#ba1a1a;--ok:#2e6b30;--code-bg:#f7ebf1;--radius:12px;--font:Roboto,"Segoe UI",system-ui,-apple-system,sans-serif;--mono:"Roboto Mono",ui-monospace,SFMono-Regular,Consolas,monospace}
@media (prefers-color-scheme:dark){:root{--bg:#171216;--on-bg:#ebdfe6;--primary:#efb4e9;--on-primary:#4b1f4b;--primary-container:#643563;--on-primary-container:#ffd6f8;--surface:#171216;--sc-low:#201a1e;--sc:#241e22;--sc-high:#2f282d;--on-sv:#d1c3cc;--outline:#9a8d96;--outline-v:#4e444b;--tertiary:#f4b8a0;--error:#ffb4ab;--ok:#8fd88a;--code-bg:#201a1e}}
*{box-sizing:border-box}html{scroll-padding-top:80px}
body{margin:0;background:var(--bg);color:var(--on-bg);font:16px/1.65 var(--font);-webkit-font-smoothing:antialiased}
a{color:var(--primary)}a:hover{text-decoration-thickness:2px}
:focus-visible{outline:3px solid var(--primary);outline-offset:2px}
.top{position:sticky;top:0;z-index:10;background:color-mix(in srgb,var(--bg) 88%,transparent);backdrop-filter:blur(12px);border-bottom:1px solid var(--outline-v)}
.bar{display:flex;align-items:center;gap:1rem;max-width:1440px;margin:0 auto;padding:.5rem 1rem;min-height:60px}
.brand{display:flex;align-items:center;gap:.5rem;color:inherit;text-decoration:none;font-weight:600;white-space:nowrap}
.brand small{font-weight:400;color:var(--on-sv);font-size:.75rem}
.tabs-nav{display:flex;gap:.25rem;overflow-x:auto;flex:1;scrollbar-width:none}
.tabs-nav a{padding:.375rem .75rem;border-radius:999px;color:var(--on-sv);text-decoration:none;font-size:.875rem;white-space:nowrap}
.tabs-nav a:hover{background:var(--sc-high)}
.tabs-nav a[aria-current]{background:var(--primary-container);color:var(--on-primary-container);font-weight:500}
.gh{font-size:.875rem;color:var(--on-sv);text-decoration:none}
.search{position:relative}
.search input{width:min(40vw,240px);height:40px;border-radius:999px;border:1px solid var(--outline-v);background:var(--sc);color:inherit;padding:0 1rem;font:inherit;font-size:.875rem}
#results{position:absolute;right:0;top:46px;width:min(92vw,440px);max-height:70vh;overflow:auto;background:var(--sc-low);border:1px solid var(--outline-v);border-radius:var(--radius);box-shadow:0 8px 24px rgb(0 0 0/.18);padding:.25rem}
#results a{display:block;padding:.5rem .75rem;border-radius:8px;color:inherit;text-decoration:none}
#results a:hover,#results a.sel{background:var(--sc-high)}
#results small{display:block;color:var(--on-sv);font-size:.75rem}
.layout{max-width:1440px;margin:0 auto;padding:0 1rem;display:grid;grid-template-columns:minmax(0,1fr);gap:2rem}
.layout.with-sidebar{grid-template-columns:260px minmax(0,1fr)}
.layout.with-sidebar.with-toc{grid-template-columns:260px minmax(0,1fr) 220px}
main{min-width:0;padding:2rem 0 4rem;max-width:820px}
.layout:not(.with-sidebar) main{max-width:1100px;margin:0 auto;width:100%}
.sidebar{position:sticky;top:61px;align-self:start;max-height:calc(100vh - 61px);overflow:auto;padding:1.5rem .5rem 2rem 0;font-size:.875rem}
.sidebar p{margin:1.25rem 0 .25rem;font-weight:600;font-size:.8125rem;color:var(--on-bg)}
.sidebar ul{list-style:none;margin:0;padding:0}.sidebar ul ul{padding-left:.75rem;border-left:1px solid var(--outline-v);margin-left:.5rem}
.sidebar a{display:block;padding:.3rem .75rem;border-radius:999px;color:var(--on-sv);text-decoration:none}
.sidebar a:hover{background:var(--sc-high)}
.sidebar a[aria-current]{background:var(--primary-container);color:var(--on-primary-container);font-weight:500}
.toc{position:sticky;top:61px;align-self:start;padding:2rem 0;font-size:.8125rem;max-height:calc(100vh - 61px);overflow:auto}
.toc p{font-weight:600;margin:0 0 .5rem}.toc ul{list-style:none;margin:0;padding:0}.toc li{margin:.25rem 0}.toc li.l3{padding-left:.75rem}
.toc a{color:var(--on-sv);text-decoration:none}.toc a:hover{color:var(--primary)}
@media (max-width:1200px){.layout.with-sidebar.with-toc{grid-template-columns:240px minmax(0,1fr)}.toc{display:none}}
@media (max-width:860px){.layout.with-sidebar,.layout.with-sidebar.with-toc{grid-template-columns:minmax(0,1fr)}.sidebar{position:static;max-height:none;border-bottom:1px solid var(--outline-v)}.sidebar:not(.open) ul{display:none}.gh{display:none}}
h1{font-size:2.25rem;line-height:2.75rem;font-weight:400;margin:.25rem 0 .5rem}
h2{font-size:1.5rem;line-height:2rem;font-weight:500;margin:2.5rem 0 .75rem}
h3{font-size:1.25rem;font-weight:500;margin:2rem 0 .5rem}h4{font-size:1rem;margin:1.5rem 0 .5rem}
.lead{font-size:1.125rem;color:var(--on-sv);margin:0 0 1.5rem}
.page-actions{display:flex;gap:.5rem;flex-wrap:wrap;margin:0 0 1.5rem;font-size:.8125rem}
.page-actions a,.page-actions button{display:inline-flex;align-items:center;height:32px;padding:0 .75rem;border:1px solid var(--outline-v);border-radius:8px;background:none;color:var(--on-sv);text-decoration:none;font:inherit;cursor:pointer}
.page-actions a:hover,.page-actions button:hover{background:var(--sc-high)}
code{font-family:var(--mono);font-size:.875em;background:var(--code-bg);padding:.1em .35em;border-radius:6px}
pre{position:relative;background:var(--code-bg);border:1px solid var(--outline-v);border-radius:var(--radius);padding:1rem;overflow:auto;line-height:1.5;font-size:.8125rem}
pre code{background:none;padding:0;font-size:inherit}
.code-title{font:500 .75rem var(--mono);color:var(--on-sv);background:var(--sc-high);border:1px solid var(--outline-v);border-bottom:0;border-radius:var(--radius) var(--radius) 0 0;padding:.4rem 1rem;margin-top:1rem}
.code-title+pre{margin-top:0;border-top-left-radius:0;border-top-right-radius:0}
.copy{position:absolute;top:.5rem;right:.5rem;height:28px;padding:0 .6rem;border-radius:8px;border:1px solid var(--outline-v);background:var(--sc-low);color:var(--on-sv);font:500 .75rem var(--font);cursor:pointer;opacity:0;transition:opacity .15s}
pre:hover .copy,.copy:focus-visible{opacity:1}
table{border-collapse:collapse;width:100%;display:block;overflow-x:auto;font-size:.875rem;margin:1rem 0}
th,td{border-bottom:1px solid var(--outline-v);padding:.5rem .75rem;text-align:left;vertical-align:top}
th{font-weight:600;background:var(--sc-low)}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
img,video{max-width:100%;height:auto;border-radius:8px}
blockquote{margin:1rem 0;padding:.25rem 1rem;border-left:4px solid var(--outline-v);color:var(--on-sv)}
.callout{border-radius:var(--radius);padding:.25rem 1rem;margin:1rem 0;background:var(--sc);border-left:4px solid var(--primary)}
.callout.warning,.callout.danger{border-left-color:var(--error)}.callout.tip,.callout.check{border-left-color:var(--ok)}.callout.info{border-left-color:var(--tertiary)}
.tabs{margin:1rem 0}.tab-buttons{display:flex;gap:.25rem;flex-wrap:wrap;border-bottom:1px solid var(--outline-v);margin-bottom:.75rem}
.tab-buttons button{border:0;background:none;color:var(--on-sv);font:500 .875rem var(--font);padding:.5rem .75rem;border-bottom:2px solid transparent;cursor:pointer}
.tab-buttons button[aria-selected=true]{color:var(--primary);border-bottom-color:var(--primary)}
.tabs.js>.tab:not(.on){display:none}
.tabs:not(.js)>.tab::before{content:attr(data-title);display:block;font-weight:600;margin-top:1rem}
.steps{counter-reset:step;margin:1rem 0}.step{counter-increment:step;position:relative;padding-left:2.75rem;margin-bottom:1rem}
.step-title{font-weight:600;margin:0 0 .25rem}.step::before{content:counter(step);position:absolute;left:0;top:0;width:1.75rem;height:1.75rem;border-radius:50%;background:var(--primary-container);color:var(--on-primary-container);display:grid;place-items:center;font-size:.8125rem;font-weight:600}
details.accordion{border:1px solid var(--outline-v);border-radius:var(--radius);padding:.5rem 1rem;margin:.75rem 0}
details.accordion summary{cursor:pointer;font-weight:500}
.card-group,.columns{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:1rem;margin:1rem 0}
.card{position:relative;border:1px solid var(--outline-v);border-radius:var(--radius);padding:.25rem 1rem;background:var(--sc-low)}
.card:hover{background:var(--sc)}.card-title{font-weight:600}.card-title a{color:inherit;text-decoration:none}.card-title a::after{content:"";position:absolute;inset:0}
figure.frame{margin:1rem 0;padding:.5rem;border:1px solid var(--outline-v);border-radius:var(--radius)}figcaption{font-size:.8125rem;color:var(--on-sv);text-align:center}
.param{border-bottom:1px solid var(--outline-v);padding:.5rem 0}.param-head{margin:.25rem 0}
.param-name{font-weight:600;color:var(--primary)}.param-type,.param-default{font-size:.75rem;color:var(--on-sv);margin-left:.5rem}.param-req{font-size:.75rem;color:var(--error);margin-left:.5rem}
.badge{display:inline-block;font-size:.75rem;padding:0 .5rem;border-radius:999px;background:var(--sc-high)}
.pager{display:flex;justify-content:space-between;gap:1rem;margin-top:3rem;border-top:1px solid var(--outline-v);padding-top:1.5rem}
.pager a{display:block;padding:.75rem 1rem;border:1px solid var(--outline-v);border-radius:var(--radius);text-decoration:none;color:inherit;max-width:48%}
.pager a small{display:block;color:var(--on-sv)}.pager .next{margin-left:auto;text-align:right}
.foot{border-top:1px solid var(--outline-v);background:var(--sc-low);font-size:.8125rem;color:var(--on-sv)}
.foot>div{max-width:1440px;margin:0 auto;padding:1.5rem 1rem}
.hero{text-align:center;padding:4rem 0 2rem}
.hero h1{font-size:3.5rem;line-height:4rem;margin:0 0 1rem}
.hero .lead{max-width:44rem;margin:0 auto 2rem}
.pet{width:96px;height:104px;margin:0 auto 1rem;background:url(/pet.webp) 0 0/768px 1144px no-repeat}
.cmds{display:grid;gap:.75rem;max-width:40rem;margin:0 auto}
.cmd{display:grid;grid-template-columns:auto 1fr;gap:.25rem 1rem;align-items:center;text-align:left;border:1px solid var(--outline-v);border-radius:var(--radius);background:var(--sc);padding:.75rem 1rem;color:inherit;font:inherit;cursor:pointer}
.cmd:hover{background:var(--sc-high)}.cmd span{font-size:.75rem;color:var(--on-sv)}.cmd code{background:none;padding:0;word-break:break-all}
.cmd.ok span::after{content:" · copied";color:var(--primary)}
.btns{display:flex;gap:.75rem;justify-content:center;flex-wrap:wrap;margin:2rem 0}
.btn{display:inline-flex;align-items:center;height:40px;padding:0 24px;border-radius:20px;text-decoration:none;font-weight:500;font-size:.875rem;background:var(--primary);color:var(--on-primary)}
.btn.tonal{background:var(--primary-container);color:var(--on-primary-container)}.btn.outlined{background:none;border:1px solid var(--outline);color:var(--primary)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:1rem;margin:2rem 0}
.tile{border:1px solid var(--outline-v);border-radius:16px;padding:1.25rem;background:var(--sc-low);text-decoration:none;color:inherit;display:block}
.tile:hover{background:var(--sc)}.tile h3{margin:0 0 .5rem;font-size:1.125rem}.tile p{margin:0;color:var(--on-sv);font-size:.875rem}
.tile .tag{font-size:.6875rem;letter-spacing:.5px;text-transform:uppercase;color:var(--primary);font-weight:600}
.muted{color:var(--on-sv)}.ok{color:var(--ok)}.bad{color:var(--error)}
.sha{font-family:var(--mono);font-size:.6875rem;word-break:break-all;color:var(--on-sv)}
.banner{border-radius:var(--radius);background:var(--primary-container);color:var(--on-primary-container);padding:.75rem 1rem;margin:1rem 0}
`;

export const JS = `(()=>{
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const copy=(text,el)=>navigator.clipboard.writeText(text).then(()=>{el.classList.add("ok");const t=el.textContent;if(el.classList.contains("copy"))el.textContent="Copied";setTimeout(()=>{el.classList.remove("ok");if(el.classList.contains("copy"))el.textContent=t},1500)});
for(const pre of $$("main pre")){const b=document.createElement("button");b.className="copy";b.type="button";b.textContent="Copy";b.onclick=()=>copy(pre.querySelector("code")?.innerText??pre.innerText,b);pre.append(b)}
for(const b of $$(".cmd[data-copy]"))b.onclick=()=>copy(b.dataset.copy,b);
for(const b of $$("[data-copy-url]"))b.onclick=()=>fetch(b.dataset.copyUrl).then(r=>r.text()).then(t=>copy(t,b));
for(const tabs of $$(".tabs")){const panes=$$(":scope>.tab",tabs);if(!panes.length)continue;const bar=document.createElement("div");bar.className="tab-buttons";bar.setAttribute("role","tablist");
panes.forEach((p,i)=>{const b=document.createElement("button");b.type="button";b.setAttribute("role","tab");b.textContent=p.dataset.title||"Tab "+(i+1);b.onclick=()=>{panes.forEach((q,j)=>q.classList.toggle("on",i===j));$$("button",bar).forEach((c,j)=>c.setAttribute("aria-selected",String(i===j)))};bar.append(b)});
tabs.prepend(bar);tabs.classList.add("js");bar.firstChild.click()}
const side=$(".sidebar");if(side){const cur=$("a[aria-current]",side);cur?.scrollIntoView({block:"center"});side.addEventListener("click",e=>{if(e.target===side)side.classList.toggle("open")})}
const q=$("#q"),box=$("#results");if(!q)return;let index=null,sel=-1;
const load=()=>index??=fetch("/docs/search.json").then(r=>r.json());
const norm=s=>s.toLowerCase().normalize("NFKD");
async function run(){const v=norm(q.value.trim());if(!v){box.hidden=true;return}const docs=await load();const terms=v.split(/\\s+/);
const scored=[];for(const d of docs){const t=norm(d.t),h=norm(d.h.join(" ")),x=norm(d.d+" "+d.x);let s=0;for(const w of terms){if(t.includes(w))s+=t.startsWith(w)?12:8;else if(h.includes(w))s+=4;else if(x.includes(w))s+=1;else{s=0;break}}if(s)scored.push([s,d])}
scored.sort((a,b)=>b[0]-a[0]);sel=-1;box.innerHTML=scored.slice(0,12).map(([,d])=>'<a href="'+d.u+'">'+d.t.replace(/</g,"&lt;")+'<small>'+(d.g+" · "+d.d).replace(/</g,"&lt;")+'</small></a>').join("")||'<p class="muted" style="padding:.5rem .75rem;margin:0">No results</p>';box.hidden=false}
q.addEventListener("input",run);q.addEventListener("focus",load);
q.addEventListener("keydown",e=>{const items=$$("a",box);if(e.key==="ArrowDown"||e.key==="ArrowUp"){e.preventDefault();sel=(sel+(e.key==="ArrowDown"?1:-1)+items.length)%items.length;items.forEach((a,i)=>a.classList.toggle("sel",i===sel))}else if(e.key==="Enter"&&items.length){location.href=(items[sel]??items[0]).href}else if(e.key==="Escape"){box.hidden=true;q.blur()}});
document.addEventListener("click",e=>{if(!e.target.closest(".search"))box.hidden=true});
document.addEventListener("keydown",e=>{if((e.key==="k"&&(e.metaKey||e.ctrlKey))||(e.key==="/"&&document.activeElement===document.body)){e.preventDefault();q.focus()}});
const latest=$("[data-latest-tag]");if(latest)fetch("https://api.github.com/repos/"+latest.dataset.repo+"/releases?per_page=10").then(r=>r.ok?r.json():[]).then(rs=>{const r=rs.find(x=>!x.draft&&x.tag_name.startsWith("aphrody-v"));if(r&&r.tag_name!==latest.dataset.latestTag){latest.hidden=false;latest.innerHTML='A newer release is available: <a href="'+r.html_url+'">'+r.tag_name.replace(/</g,"")+'</a>.'}}).catch(()=>{});
})();
`;
