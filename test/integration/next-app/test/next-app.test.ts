import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { isDebug } from "harness";
import { join } from "path";
import { installFixture, nextBuild, nextStart, withoutNode } from "./next-helpers";

// App Router baseline (J0 of the Next.js-on-Bun plan): `next build` + `next start`
// under `bun --bun`, once with Turbopack (the default bundler) and once with webpack,
// plus a Turbopack build through the `next-bun` runner with no `node` on PATH. The fixture's
// PostCSS plugin stamps the runtime it ran in into the CSS, so each variant asserts PostCSS ran on Bun.

const fixture = join(import.meta.dir, "..");
let dir: Awaited<ReturnType<typeof installFixture>>;

beforeAll(async () => {
  dir = await installFixture(fixture, [
    "app",
    "bun.lock",
    "bunfig.toml",
    "next.config.js",
    "package.json",
    "postcss.config.js",
    "postcss-mark.js",
  ]);
}, 300_000);

afterAll(() => dir?.[Symbol.dispose](), 120_000);

describe.concurrent.each([
  ["turbopack", [], ".next-turbopack", "bun", false],
  ["webpack", ["--webpack"], ".next-webpack", "bun", false],
  ["turbopack via next-bun, no node on PATH", [], ".next-runner", "next-bun", true],
] as const)("next-app (%s)", (_name, args, distDir, runner, noNode) => {
  test(
    "builds and serves the App Router page and route handler",
    async () => {
      const env = { NEXT_DIST_DIR: distDir };
      const buildOutput = await nextBuild(String(dir), [...args], noNode ? { ...env, ...withoutNode() } : env, runner);
      expect(buildOutput).toContain("○ /");
      expect(buildOutput).toContain("ƒ /api/hello");

      let css = "";
      for await (const file of new Bun.Glob("static/**/*.css").scan(join(String(dir), distDir)))
        css += await Bun.file(join(String(dir), distDir, file)).text();
      expect(css).toMatch(/#010203|rgb\(1,\s*2,\s*3\)/);
      expect(css).toMatch(/--postcss-runtime:\s*bun/);

      await using server = await nextStart(String(dir), env);

      const page = await fetch(server.url + "/");
      const html = await page.text();
      expect(html).toContain("<title>Bun App Router</title>");
      expect(html).toContain("<h1>Hello from the App Router</h1>");
      // Prerendered at build time inside `bun --bun`, so `Bun` is defined.
      expect(html).toContain('<p id="runtime">bun</p>');
      expect(html).toContain("<button>count: <!-- -->0</button>");
      expect(html).toContain("self.__next_f");
      expect(page.status).toBe(200);

      const api = await fetch(server.url + "/api/hello?name=next");
      expect(await api.json()).toEqual({ hello: "next", runtime: "bun" });
      expect(api.status).toBe(200);

      const missing = await fetch(server.url + "/does-not-exist");
      expect(missing.status).toBe(404);
    },
    isDebug ? Infinity : 300_000,
  );
});
