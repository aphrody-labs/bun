// Compare Bun fetch + HTMLRewriter against Python requests + cloudscraper on one public page.
const url = "https://news.ycombinator.com/";
const runs = 5;

async function bunRun() {
  const t0 = performance.now();
  const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (compatible; bench)" } });
  const html = await res.text();
  let titles = 0;
  let title = "";
  const rw = new HTMLRewriter()
    .on("span.titleline > a", { text(t) { if (t.text) titles++; } })
    .on("title", { text(t) { title += t.text; } });
  await rw.transform(new Response(html)).text();
  return { ms: performance.now() - t0, status: res.status, title: title.trim(), items: titles };
}

const bun = [];
for (let i = 0; i < runs; i++) bun.push(await bunRun());
const p = Bun.spawn(["uv", "run", "--quiet", "--with", "requests", "--with", "cloudscraper", "python", import.meta.dir + "/compare-scrapers.py", url, String(runs)], { stdout: "pipe", stderr: "pipe" });
const py = { stdout: await new Response(p.stdout).text(), stderr: await new Response(p.stderr).text(), exitCode: await p.exited };
console.log(JSON.stringify({ url, bun: { runs: bun, medianMs: bun.map(r => r.ms).sort((a, b) => a - b)[Math.floor(runs / 2)] }, python: JSON.parse(py.stdout || "null"), pythonErr: py.exitCode ? py.stderr.slice(0, 400) : undefined }, null, 2));
