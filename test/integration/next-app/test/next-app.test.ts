import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { isDebug } from "harness";
import { join } from "path";
import { installFixture, nextBuild, nextStart } from "./next-helpers";

// App Router baseline (J0 of the Next.js-on-Bun plan): `next build` + `next start`
// under `bun --bun`, once with Turbopack (the default bundler) and once with webpack.

const fixture = join(import.meta.dir, "..");
let dir: Awaited<ReturnType<typeof installFixture>>;

beforeAll(async () => {
  dir = await installFixture(fixture, ["app", "bun.lock", "bunfig.toml", "next.config.js", "package.json"]);
}, 300_000);

afterAll(() => dir?.[Symbol.dispose]());

describe.concurrent.each([
  ["turbopack", [], ".next-turbopack"],
  ["webpack", ["--webpack"], ".next-webpack"],
] as const)("next-app (%s)", (_name, args, distDir) => {
  test(
    "builds and serves the App Router page and route handler",
    async () => {
      const env = { NEXT_DIST_DIR: distDir };
      const buildOutput = await nextBuild(String(dir), [...args], env);
      expect(buildOutput).toContain("○ /");
      expect(buildOutput).toContain("ƒ /api/hello");

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
