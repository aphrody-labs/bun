#!/usr/bin/env bun
/** Exercise WebOS's production WASI loader against the built artifact. */
import assert from "node:assert/strict";
import { join } from "node:path";
import { loadBunWasm } from "../src/os/wasm/bun-wasm.ts";

const appDir = import.meta.dir.replace(/\\scripts$/, "");
const wasmPath = join(appDir, "dist/wasm/bun/bun_wasm.wasm");
const file = Bun.file(wasmPath);
if (!(await file.exists())) throw new Error(`Missing WebOS WASM asset: ${wasmPath}`);

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch: () => new Response(file, { headers: { "Content-Type": "application/wasm" } }),
});
try {
  const bun = await loadBunWasm(`http://127.0.0.1:${server.port}/bun_wasm.wasm`);
  assert.equal(bun.version, "1.4.4");
  assert.equal(bun.semverOrder("1.4.4", "1.10.0"), -1);
  assert.equal(bun.semverSatisfies("1.4.4", "^1.4.0"), true);
  assert.match(JSON.stringify(bun.shellParse("echo aphrody | wc -c")), /echo/);
  assert.match(bun.markdownHtml("# Aphrody WASM"), /<h1>Aphrody WASM<\/h1>/);
  console.log(JSON.stringify({ qualified: true, version: bun.version, capabilities: ["semver-order", "semver-satisfies", "shell-parse", "markdown-html"] }));
} finally {
  server.stop(true);
}
