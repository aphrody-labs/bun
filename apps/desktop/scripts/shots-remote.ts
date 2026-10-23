#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Looks at a deployed instance the way a visitor would: opens an SSH tunnel to its loopback port with
 * `bun ssh forward`, drives it with Bun.WebView and writes one screenshot per route.
 *
 *   bun scripts/shots-remote.ts <out-dir> [--host vps] [--port 18791] [--routes /,/tools?f=watch]
 */
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";

const args = Bun.argv.slice(2);
const flag = (name: string, fallback: string) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args.splice(index, 2)[1]! : fallback;
};
const host = flag("--host", "vps");
const remotePort = Number(flag("--port", "18791"));
const routes = flag("--routes", "/,/video,/tools?f=watch,/m3").split(",");
const out = resolve(args[0] ?? "shots-remote");
await mkdir(out, { recursive: true });

const local = 30000 + Math.floor(Math.random() * 20000);
const tunnel = Bun.spawn([process.execPath, "ssh", "forward", "-L", `127.0.0.1:${local}:127.0.0.1:${remotePort}`, host], {
  stdout: "ignore",
  stderr: "pipe",
});
const view = new Bun.WebView({ backend: { type: "chrome" } } as ConstructorParameters<typeof Bun.WebView>[0]);
try {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline && !(await fetch(`http://127.0.0.1:${local}/robots.txt`).then(r => r.ok, () => false))) await Bun.sleep(300);
  await view.navigate("data:text/html,<title>start</title>").catch(() => Bun.sleep(500).then(() => view.navigate("data:text/html,<title>start</title>")));
  await view.resize(1280, 800);
  for (const route of routes) {
    await view.navigate(`http://127.0.0.1:${local}${route}`);
    await Bun.sleep(1500);
    const page = (await view.evaluate(`({ title: document.title, heading: document.querySelector("main h1, h1")?.textContent ?? "", path: location.pathname + location.search })`)) as { title: string; heading: string; path: string };
    const file = join(out, `${route.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "home"}.png`);
    await Bun.write(file, await view.screenshot());
    console.log(`${page.path.padEnd(22)} ${page.title} | ${page.heading.trim().slice(0, 60)} -> ${file}`);
  }
} finally {
  view.close();
  tunnel.kill();
}
