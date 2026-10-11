#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Production server and assets into dist/: Bun's target=bun build turns the HTML import in
 * server.ts into a static asset manifest, so Bun.serve can serve the page without runtime HMR.
 * The page build also emits the standalone HTML/assets; workers are served from dist/workers.
 * dist/wasm/ (bun_wasm.wasm) is produced by the fork's wasm build and left untouched.
 */
import { tailwind } from "@aphrody/bun-plugin-tailwind";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { PAGE_WORKERS } from "./src/server/page-workers.ts";

const outdir = join(import.meta.dir, "dist");
mkdirSync(outdir, { recursive: true });
const start = performance.now();

const page = await Bun.build({
  entrypoints: [join(import.meta.dir, "index.html")],
  outdir,
  target: "browser",
  minify: true,
  sourcemap: "linked",
  plugins: [tailwind()],
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
});
if (!page.success) {
  console.error(page.logs.map(String).join("\n"));
  process.exit(1);
}

const server = await Bun.build({
  entrypoints: [join(import.meta.dir, "server.ts")],
  outdir,
  target: "bun",
  minify: true,
  sourcemap: "linked",
  plugins: [tailwind()],
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
});
if (!server.success) {
  console.error(server.logs.map(String).join("\n"));
  process.exit(1);
}

const workerOut = join(outdir, "workers");
for (const [name, source] of Object.entries(PAGE_WORKERS)) {
  const worker = await Bun.build({
    entrypoints: [join(import.meta.dir, source)],
    outdir: workerOut,
    naming: name,
    target: "browser",
    format: "esm",
    minify: true,
  });
  if (!worker.success) {
    console.error(worker.logs.map(String).join("\n"));
    process.exit(1);
  }
  page.outputs.push(...worker.outputs);
}

const nativeWorker = await Bun.build({
  entrypoints: [join(import.meta.dir, "src/server/bench-worker.ts")],
  outdir: workerOut,
  naming: "bench.js",
  target: "bun",
  format: "esm",
  minify: true,
});
if (!nativeWorker.success) {
  console.error(nativeWorker.logs.map(String).join("\n"));
  process.exit(1);
}
server.outputs.push(...nativeWorker.outputs);

for (const output of [...page.outputs, ...server.outputs])
  console.log(`${output.path} ${(output.size / 1024).toFixed(1)} KiB`);
console.log(`dist/ in ${(performance.now() - start).toFixed(0)} ms`);
