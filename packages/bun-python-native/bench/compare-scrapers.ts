// Bun fetch + HTMLRewriter timing on one URL (pass the URL as argument).
const url = process.argv[2] ?? "https://news.ycombinator.com/";
const runs = 5;

async function bunRun() {
  const t0 = performance.now();
  const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (compatible; bench)" } });
  const html = await res.text();
  let items = 0;
  let title = "";
  await new HTMLRewriter()
    .on("span.titleline > a", { text(t) { if (t.text) items++; } })
    .on("title", { text(t) { title += t.text; } })
    .transform(new Response(html)).text();
  return { ms: performance.now() - t0, status: res.status, title: title.trim(), items };
}

const out = [];
for (let i = 0; i < runs; i++) out.push(await bunRun());
const sorted = out.map(r => r.ms).sort((a, b) => a - b);
console.log(JSON.stringify({ url, runs: out, medianMs: sorted[Math.floor(runs / 2)] }));
