import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

export type GatewaySample = { elapsedMs: number; bytes: number; status: number; source: string };
export type GatewayMeasurement = { path: string; runs: GatewaySample[]; p50Ms: number; p95Ms: number };

export async function measureReleaseGateway(origin: string, source: string, samples = 10) {
  if (!Number.isInteger(samples) || samples < 2 || samples > 20) throw new Error("Samples must be 2 to 20");
  const measurements: GatewayMeasurement[] = [];
  for (const path of [
    "/",
    "/llms.txt",
    "/knowledge/source/docs/guides/index.mdx",
    "/knowledge/plugin/README.md",
    "/graph/graph.json",
  ]) {
    const runs: GatewaySample[] = [];
    for (let index = 0; index < samples; index++) {
      const start = performance.now();
      const response = await fetch(new URL(path, origin), { signal: AbortSignal.timeout(30_000) });
      const bytes = (await response.arrayBuffer()).byteLength;
      const elapsedMs = performance.now() - start;
      if (response.status !== 200) throw new Error(`${path}: HTTP ${response.status}`);
      const responseSource = response.headers.get("x-bun-source");
      if (responseSource !== source) throw new Error(`${path}: source pin mismatch`);
      runs.push({ elapsedMs, bytes, status: response.status, source: responseSource });
    }
    const sorted = runs.map(run => run.elapsedMs).sort((a, b) => a - b);
    measurements.push({
      path,
      runs,
      p50Ms: sorted[Math.ceil(samples * 0.5) - 1]!,
      p95Ms: sorted[Math.ceil(samples * 0.95) - 1]!,
    });
  }
  return {
    source,
    origin,
    measuredAt: new Date().toISOString(),
    clientRuntime: `Bun ${Bun.version} (${Bun.revision})`,
    methodology:
      "Sequential GET requests, complete response bodies, no warmup exclusion, end-to-end client latency including network and gateway. This measures the deployed release knowledge gateway, not native runtime performance or comparisons.",
    measurements,
  };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const option = (key: string) => (args.includes(key) ? args[args.indexOf(key) + 1] : undefined);
  if (!args.includes("--origin") || !args.includes("--source") || !args.includes("--out"))
    throw new Error("Required --origin URL --source SHA --out artifact directory");
  const report = await measureReleaseGateway(
    option("--origin")!,
    option("--source")!,
    Number(option("--samples") ?? 10),
  );
  const directory = join(resolve(option("--out")!), "site", "benchmarks");
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "site-gateway.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(
    join(directory, "site-gateway.html"),
    `<!doctype html><html lang="en"><meta charset="utf-8"><title>Measured release gateway</title><h1>Measured release gateway</h1><p>${Bun.escapeHTML(report.methodology)}</p><p>Measured ${report.measuredAt}; source ${report.source}; client ${Bun.escapeHTML(report.clientRuntime)}.</p><table><tr><th>Endpoint</th><th>Samples</th><th>p50 ms</th><th>p95 ms</th></tr>${report.measurements.map(row => `<tr><td>${row.path}</td><td>${row.runs.length}</td><td>${row.p50Ms!.toFixed(3)}</td><td>${row.p95Ms!.toFixed(3)}</td></tr>`).join("")}</table><a href="site-gateway.json">Raw samples and provenance</a></html>`,
  );
  console.log(JSON.stringify(report));
}
