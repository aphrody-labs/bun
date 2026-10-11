#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { loadBunWasm } from "../src/os/wasm/bun-wasm";

const file = Bun.file(resolve(import.meta.dir, "../dist/wasm/bun/bun_wasm.wasm"));
if (!(await file.exists())) throw new Error("Stage a Bun WASM artifact before qualification");
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch: () => new Response(file, { headers: { "Content-Type": "application/wasm" } }),
});
try {
  const bun = await loadBunWasm(new URL("/bun_wasm.wasm", server.url).href);
  assert.equal(bun.semverOrder("1.4.4", "1.10.0"), -1);
  assert.equal(bun.semverSatisfies("1.4.4", "^1.4.0"), true);
  assert.match(JSON.stringify(bun.shellParse("echo bun | wc -c")), /echo/);
  assert.match(bun.markdownHtml("# Bun WASM"), /<h1>Bun WASM<\/h1>/);
  console.log(
    JSON.stringify({
      qualified: true,
      version: bun.version,
      capabilities: ["semver-order", "semver-satisfies", "shell-parse", "markdown-html"],
    }),
  );
} finally {
  server.stop(true);
}
