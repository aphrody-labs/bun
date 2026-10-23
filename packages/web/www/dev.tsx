#!/usr/bin/env bun
/**
 * The design loop: builds the whole site from this checkout, serves it and screenshots pages with Bun.WebView, so a
 * change is judged by looking at the result.
 *
 *   bun dev.tsx shots [--pages /,/docs/runtime/video] [--widths 1440,390] [--out dir]
 *   bun dev.tsx serve [--port 4173]
 *   bun dev.tsx build
 *
 * `--reuse` skips the build and serves what the last run wrote.
 */
import { mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { mirrorReleases } from "../../../scripts/aphrody/release-mirror.ts";
import { build } from "../site/build.ts";
import { collect } from "../site/collect.ts";
import { root } from "./build.ts";

const args = Bun.argv.slice(2);
const command = args.shift() ?? "shots";
const option = (name: string, fallback: string) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1]! : fallback;
};
const out = resolve(option("--out", join(process.env.TEMP ?? "/tmp", "www-dev")));
const origin = "https://bun.aphrody.app";
const repo = "aphrody-labs/bun";

if (!args.includes("--reuse")) {
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  const started = performance.now();
  const commit = Bun.spawnSync(["git", "-C", root, "rev-parse", "HEAD"]).stdout.toString().trim();
  const data = await collect({
    runtime: { repo: root, ref: "HEAD" },
    org: repo.split("/")[0]!,
    author: "contact@aphrody.com",
    offline: true,
    downloadsUrl: "none",
    now: new Date(),
  });
  data.runtime!.repo = repo;
  const releases = await mirrorReleases(root, repo);
  await build({ src: root, out, origin, commit, repo, releases, data });
  console.log(`built in ${Math.round(performance.now() - started)} ms: ${out}`);
}

const server = Bun.serve({
  port: Number(option("--port", "0")),
  hostname: "127.0.0.1",
  async fetch(request) {
    const path = decodeURIComponent(new URL(request.url).pathname);
    for (const candidate of [path, join(path, "index.html"), `${path}.html`]) {
      if (candidate.includes("..")) break;
      const file = Bun.file(join(out, candidate));
      if (await file.exists().catch(() => false)) {
        const stat = await file.stat().catch(() => null);
        if (stat?.isFile()) return new Response(file);
      }
    }
    return new Response("Not found", { status: 404 });
  },
});
const base = `http://127.0.0.1:${server.port}`;
if (command === "build") {
  server.stop(true);
  process.exit(0);
}
if (command === "serve") {
  console.log(`serving at ${base}`);
  await new Promise(() => {});
}

const pages = option("--pages", "/")
  .split(",")
  .map(page => (page.startsWith("/") ? page : `/${page}`));
const widths = option("--widths", "1440,390").split(",").map(Number);
const shots = join(out, "..", "www-dev-shots");
await rm(shots, { recursive: true, force: true });
await mkdir(shots, { recursive: true });
const errors: string[] = [];
const view = new Bun.WebView({
  backend: { type: "chrome" },
  console: (type: string, ...parts: unknown[]) => {
    if (type === "error")
      errors.push(
        parts
          .map(part => String(part))
          .join(" ")
          .slice(0, 200),
      );
  },
} as ConstructorParameters<typeof Bun.WebView>[0]);
try {
  await view.navigate(base + "/robots.txt");
  for (const width of widths) {
    const height = width > 800 ? 900 : 844;
    await view.resize(width, height);
    for (const page of pages) {
      await view.navigate(base + page);
      await Bun.sleep(1800);
      const total = Number(await view.evaluate("document.documentElement.scrollHeight"));
      const name = (page.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "home") + `-${width}`;
      for (let index = 0, y = 0; y < Math.min(total, height * Number(option("--screens", "6"))); index++, y += height) {
        await view.evaluate(`window.scrollTo(0, ${y})`);
        await Bun.sleep(600);
        await Bun.write(join(shots, `${name}-${index}.png`), await view.screenshot());
      }
      console.log(`${page} @${width}: ${total}px high`);
    }
  }
} finally {
  view.close();
  server.stop(true);
}
if (errors.length) console.log(`console errors:\n${errors.join("\n")}`);
console.log(`screenshots in ${resolve(shots)}`);
