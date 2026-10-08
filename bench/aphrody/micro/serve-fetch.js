const N = Number(process.env.PERF_REQUESTS ?? 300);
const t0 = performance.now();
const server = Bun.serve({ port: 0, fetch: () => new Response("hello") });
const url = `http://127.0.0.1:${server.port}/`;
const first = await fetch(url);
await first.text();
const serveMs = performance.now() - t0;
const lat = [];
const t1 = performance.now();
for (let i = 0; i < N; i++) {
  const s = performance.now();
  await (await fetch(url)).text();
  lat.push(performance.now() - s);
}
const total = performance.now() - t1;
lat.sort((a, b) => a - b);
server.stop(true);
console.log(JSON.stringify({ serveMs, fetchP50Ms: lat[Math.floor(N * 0.5)], fetchP99Ms: lat[Math.floor(N * 0.99)], rps: N / (total / 1000) }));
