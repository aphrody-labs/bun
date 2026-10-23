#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Deployment gate: starts the built server (dist/server.js, after `bun run build`) from an unrelated working
 * directory and checks that the pages, the brand assets and the API answer. Exit code 1 on the first failure.
 */
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const dist = resolve(import.meta.dir, "../dist/server.js");
if (!(await Bun.file(dist).exists())) throw new Error("dist/server.js is missing: run `bun run build` first");
const cwd = await mkdtemp(join(tmpdir(), "webos-smoke-"));
const port = 20000 + Math.floor(Math.random() * 20000);
const server = Bun.spawn([process.execPath, dist], {
  cwd,
  env: { ...process.env, NODE_ENV: "production", PORT: String(port), BUN_WEBOS_DATA: join(cwd, "data") },
  stdout: "pipe",
  stderr: "pipe",
});
const base = `http://127.0.0.1:${port}`;
const html = (response: Response) => response.headers.get("content-type")?.includes("text/html") ?? false;
const type = (expected: string) => (response: Response) => response.headers.get("content-type") === expected;
const checks: [string, (response: Response) => boolean | Promise<boolean>][] = [
  ["/", html],
  ["/video", html],
  ["/video/watch?v=x", html],
  ["/tools?f=watch", html],
  ["/m3", html],
  ["/os", html],
  ["/favicon.ico", async r => (await r.arrayBuffer()).byteLength > 1000 && type("image/x-icon")(r)],
  ["/favicon.svg", type("image/svg+xml")],
  ["/apple-touch-icon.png", type("image/png")],
  ["/icons/maskable-512.png", type("image/png")],
  ["/og.png", type("image/png")],
  ["/manifest.webmanifest", async r => ((await r.json()) as { short_name?: string }).short_name === "Aphrody"],
  ["/robots.txt", async r => (await r.text()).includes("User-agent")],
  ["/api/video/works", async r => Array.isArray(((await r.json()) as { works?: unknown }).works)],
];
let failed = false;
try {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (await fetch(`${base}/robots.txt`).then(() => true, () => false)) break;
    await Bun.sleep(200);
  }
  for (const [path, accept] of checks) {
    const response = await fetch(base + path).catch(() => undefined);
    const ok = response !== undefined && response.status === 200 && (await accept(response));
    console.log(`${ok ? "ok  " : "FAIL"} ${response?.status ?? "—"} ${path}`);
    failed ||= !ok;
  }
} finally {
  server.kill();
  await server.exited;
}
if (failed) {
  console.error(await new Response(server.stderr).text());
  process.exitCode = 1;
}
