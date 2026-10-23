// The documentation search of the site, as a standalone browser script: the layouts captured by
// scripts/aphrody/site-mirror/fuse.ts load it over /docs/search.json. The site itself bundles the TypeScript twin in
// packages/web/www/src/client/site.ts.
const SEARCH =
  'const q=$("#q"),box=$("#results");if(!q)return;let index=null,sel=-1;\nconst load=()=>index??=fetch("/docs/search.json").then(r=>r.json());\nconst norm=s=>s.toLowerCase().normalize("NFKD");\nasync function run(){const v=norm(q.value.trim());if(!v){box.hidden=true;return}const docs=await load();const terms=v.split(/\\s+/);\nconst scored=[];for(const d of docs){const t=norm(d.t),h=norm(d.h.join(" ")),x=norm(d.d+" "+d.x);let s=0;for(const w of terms){if(t.includes(w))s+=t.startsWith(w)?12:8;else if(h.includes(w))s+=4;else if(x.includes(w))s+=1;else{s=0;break}}if(s)scored.push([s,d])}\nscored.sort((a,b)=>b[0]-a[0]);sel=-1;box.innerHTML=scored.slice(0,12).map(([,d])=>\'<a href="\'+d.u+\'">\'+d.t.replace(/</g,"&lt;")+\'<small>\'+(d.g+" · "+d.d).replace(/</g,"&lt;")+\'</small></a>\').join("")||\'<p class="muted" style="padding:.5rem .75rem;margin:0">No results</p>\';box.hidden=false}\nq.addEventListener("input",run);q.addEventListener("focus",load);\nq.addEventListener("keydown",e=>{const items=$$("a",box);if(e.key==="ArrowDown"||e.key==="ArrowUp"){e.preventDefault();sel=(sel+(e.key==="ArrowDown"?1:-1)+items.length)%items.length;items.forEach((a,i)=>a.classList.toggle("sel",i===sel))}else if(e.key==="Enter"&&items.length){location.href=(items[sel]??items[0]).href}else if(e.key==="Escape"){box.hidden=true;q.blur()}});\ndocument.addEventListener("click",e=>{if(!e.target.closest(".search"))box.hidden=true});\ndocument.addEventListener("keydown",e=>{if((e.key==="k"&&(e.metaKey||e.ctrlKey))||(e.key==="/"&&document.activeElement===document.body)){e.preventDefault();q.focus()}});\n';

/** Reuse the documentation search implementation in captured upstream layouts. */
export function docsSearchScript() {
  return (
    "(()=>{const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];" + SEARCH + "})();"
  );
}
