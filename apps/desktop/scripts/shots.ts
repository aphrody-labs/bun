#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Visual dev loop of the unified app: starts the WebOS server on a free port with a seeded video library, drives
 * Bun.WebView (Chrome backend: Edge or Chrome on Windows) over the routes at several viewports, and writes one PNG
 * per route plus a JSON report of console errors, page text and the route's headline.
 *
 *   bun apps/desktop/scripts/shots.ts [out-dir] [--routes /,/video,...] [--widths 1280,390]
 */
import { copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { startWebOS } from "../server";

const args = Bun.argv.slice(2);
const flag = (name: string) => {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args.splice(index, 2)[1];
};
const routesArg = flag("--routes");
const widthsArg = flag("--widths");
const out = resolve(args[0] ?? join(tmpdir(), "aphrody-shots"));
const widths = (widthsArg ?? "1280,390").split(",").map(Number);
const fixture = resolve(import.meta.dir, "../../../packages/bun-video/hyperframes/player/tests/perf/fixtures/10-video-grid/sample.mp4");

const data = await mkdtemp(join(tmpdir(), "aphrody-shots-"));
const mediaRoot = join(data, "Videos");
await mkdir(mediaRoot, { recursive: true });
await mkdir(out, { recursive: true });
await copyFile(fixture, join(mediaRoot, "Orbital.mp4"));
await copyFile(fixture, join(mediaRoot, "Relief.mp4"));
await Bun.write(join(mediaRoot, "Orbital.vtt"), "WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nUne chorégraphie de lumière.\n\n00:00:04.000 --> 00:00:06.000\nChaque image est décodée par Bun.\n");

const server = await startWebOS({ port: 0, hostname: "127.0.0.1", dataDir: data, mediaRoot, development: false });
const base = server.url.href.replace(/\/$/, "");
const routes = (routesArg ?? "/,/video,/video/watch?v=orbital,/video/series?s=native,/video/shorts,/video/studio?v=orbital,/tools,/tools?f=watch,/m3").split(",");

interface Row {
  route: string;
  width: number;
  title: string;
  path: string;
  heading: string;
  errors: string[];
  broken: boolean;
  file: string;
}
const rows: Row[] = [];
const errors: string[] = [];
// Size is set with resize() after the first navigation: the constructor's size options need the CDP session first.
const view = new Bun.WebView({
  backend: { type: "chrome" },
  console: (type: string, ...parts: unknown[]) => {
    if (type === "error" || type === "warn") errors.push(`${type}: ${parts.map(part => (typeof part === "object" ? JSON.stringify(part).slice(0, 200) : String(part))).join(" ")}`);
  },
});
try {
  // The first navigation can race the browser start-up; retry once.
  await view.navigate("data:text/html,<title>start</title>").catch(() => Bun.sleep(500).then(() => view.navigate("data:text/html,<title>start</title>")));
  for (const width of widths) {
    await view.resize(width, 800);
    for (const route of routes) {
      errors.length = 0;
      await view.navigate(base + route);
      // Let the client router, queries and lazy chunks settle.
      await Bun.sleep(1200);
      const page = (await view.evaluate(
        `(() => ({ title: document.title, path: location.pathname + location.search, heading: document.querySelector("main h1, main h2, h1")?.textContent ?? "", broken: /Impossible d’afficher|Page introuvable/.test(document.body.innerText), rootEmpty: !document.querySelector("#root")?.children.length }))()`,
      )) as { title: string; path: string; heading: string; broken: boolean; rootEmpty: boolean };
      const name = `${route.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "home"}-${width}.png`;
      await Bun.write(join(out, name), await view.screenshot());
      rows.push({ route, width, title: page.title, path: page.path, heading: page.heading.trim().slice(0, 80), errors: [...errors], broken: page.broken || page.rootEmpty, file: join(out, name) });
    }
  }
} finally {
  view.close();
  await server.stop(true);
  await rm(data, { recursive: true, force: true });
}
await Bun.write(join(out, "report.json"), JSON.stringify(rows, null, 2));
for (const row of rows) console.log(`${row.broken ? "BROKEN" : row.errors.length ? "ERRORS" : "ok    "} ${String(row.width).padStart(4)} ${row.route.padEnd(34)} ${row.heading} | ${row.title} | ${row.path}`);
process.exitCode = rows.some(row => row.broken) ? 1 : 0;
