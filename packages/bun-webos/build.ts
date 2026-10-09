#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Production assets into dist/: the page (index.html, Tailwind through the fork's plugin) and the
 * page workers at dist/workers/<name>.js, which server.ts serves before bundling them on demand.
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

for (const output of page.outputs) console.log(`${output.path} ${(output.size / 1024).toFixed(1)} KiB`);
console.log(`dist/ in ${(performance.now() - start).toFixed(0)} ms`);
