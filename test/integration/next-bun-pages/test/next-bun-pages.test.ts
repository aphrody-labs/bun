import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { bunExe, isDebug, tempDir } from "harness";
import { join } from "path";
import { installFixture, nextBuild, nextEnv, nextStart } from "../../next-app/test/next-helpers";

// J1 of the Next.js-on-Bun plan: `next build` with Bun's bundler (@aphrody/next-bun)
// must serve the same Pages Router HTML and API responses as `next build --webpack`.

const fixture = join(import.meta.dir, "..");
const nextBunPackage = join(import.meta.dir, "..", "..", "..", "..", "packages", "bun-next");
const { MARKER, VERIFIED_VERSIONS, applyPatch, checkPatch, isSupported } = require(
  join(nextBunPackage, "lib", "patch.js"),
);

const timeout = isDebug ? Infinity : 300_000;

// The fixture's bun.lock pins the oldest supported Next; next-16.4/ the latest release, next-16.5/ the latest canary.
const versions = [
  { next: "16.1.6", overlay: undefined },
  { next: "16.4.0", overlay: join(fixture, "next-16.4") },
  { next: "16.5.0-canary.4", overlay: join(fixture, "next-16.5") },
];

/** Removes what legitimately differs between the two bundlers: the client script tags. */
function normalizeHtml(html: string) {
  return html
    .replace(/<script\b[^>]*\bsrc="[^"]*"[^>]*><\/script>/g, "")
    .replace(/<link\b[^>]*\bas="script"[^>]*\/?>/g, "");
}

const paths = ["/", "/ssr?name=x", "/posts/first", "/posts/second", "/api/hello", "/api/hello?name=bun", "/nope"];

describe.each(versions)("next@$next", ({ next, overlay }) => {
  let dir: Awaited<ReturnType<typeof installFixture>>;

  beforeAll(async () => {
    dir = await installFixture(
      fixture,
      ["lib", "pages", "bun.lock", "bunfig.toml", "next.config.js", "package.json"],
      overlay,
    );
    const nextManifest = join(String(dir), "node_modules", "next", "package.json");
    expect(JSON.parse(readFileSync(nextManifest, "utf8")).version).toBe(next);
    const installed = join(String(dir), "node_modules", "@aphrody", "next-bun");
    cpSync(nextBunPackage, installed, { recursive: true });
    await using patch = Bun.spawn({
      cmd: [bunExe(), join(installed, "bin", "next-bun.js"), "patch"],
      cwd: String(dir),
      env: nextEnv,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([patch.stdout.text(), patch.stderr.text(), patch.exited]);
    if (exitCode !== 0) throw new Error(`next-bun patch failed (${exitCode}):\n${stdout}\n${stderr}`);
  }, 300_000);

  afterAll(() => dir?.[Symbol.dispose](), 120_000);

  test(
    "next build with Bun's bundler serves the same pages and API routes as webpack",
    async () => {
      const webpackEnv = { NEXT_DIST_DIR: ".next-webpack" };
      const bunEnvVars = { NEXT_DIST_DIR: ".next-bun", NEXT_BUN_BUNDLER: "1" };
      const [webpackOutput, bunOutput] = await Promise.all([
        nextBuild(String(dir), ["--webpack"], webpackEnv),
        nextBuild(String(dir), [], bunEnvVars),
      ]);
      expect(bunOutput).toContain("Compiled successfully with Bun");
      expect(webpackOutput).not.toContain("Compiled successfully with Bun");
      for (const route of ["● /", "ƒ /api/hello", "ƒ /ssr"]) {
        expect(bunOutput).toContain(route);
      }
      // 16.1 marks the dynamic route SSG, 16.5 its prerendered paths.
      expect(bunOutput).toMatch(/● \/posts\/(\[slug\]|first)/);

      // getServerSideProps (and its `fs` import) must be stripped from the browser bundle.
      const clientDir = join(String(dir), ".next-bun", "static", "chunks", "_bun");
      const clientFiles = [...new Bun.Glob("**/*.js").scanSync(clientDir)];
      expect(clientFiles.length).toBeGreaterThan(0);
      for (const file of clientFiles) {
        expect(readFileSync(join(clientDir, file), "utf8")).not.toContain("readFileSync");
      }

      await using webpackServer = await nextStart(String(dir), webpackEnv);
      await using bunServer = await nextStart(String(dir), bunEnvVars);

      const results = await Promise.all(
        paths.map(async path => {
          const [webpack, bun] = await Promise.all([fetch(webpackServer.url + path), fetch(bunServer.url + path)]);
          const [webpackBody, bunBody] = await Promise.all([webpack.text(), bun.text()]);
          return {
            path,
            webpack: [webpack.status, normalizeHtml(webpackBody)],
            bun: [bun.status, normalizeHtml(bunBody)],
          };
        }),
      );
      for (const { path, webpack, bun } of results) {
        expect({ path, ...bun }).toEqual({ path, ...webpack });
      }
      const statuses = Object.fromEntries(results.map(r => [r.path, r.bun[0]]));
      expect(statuses).toEqual({
        "/": 200,
        "/ssr?name=x": 200,
        "/posts/first": 200,
        "/posts/second": 200,
        "/api/hello": 200,
        "/api/hello?name=bun": 200,
        "/nope": 404,
      });
      const home = results[0].bun[1] as string;
      expect(home).toContain('<div id="app-shell">');
      expect(home).toContain("Hello, static!");
      expect(JSON.parse(results[5].bun[1] as string)).toEqual({ message: "Hello, bun!", method: "GET" });

      // Every client script referenced by the pages, and every module they import, is served.
      const transpiler = new Bun.Transpiler({ loader: "js" });
      const seen = new Set<string>();
      const queue: string[] = [];
      for (const path of ["/", "/ssr", "/posts/first"]) {
        const html = await (await fetch(bunServer.url + path)).text();
        for (const [, src] of html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)) {
          queue.push(new URL(src, bunServer.url).href);
        }
      }
      expect(queue.length).toBeGreaterThan(0);
      const missing: string[] = [];
      while (queue.length) {
        const url = queue.pop()!;
        if (seen.has(url)) continue;
        seen.add(url);
        const response = await fetch(url);
        if (response.status !== 200) {
          missing.push(`${response.status} ${url}`);
          continue;
        }
        for (const { path } of transpiler.scanImports(await response.text())) {
          if (path.startsWith(".")) queue.push(new URL(path, url).href);
        }
      }
      expect(missing).toEqual([]);
      expect([...seen].filter(url => url.includes("/_next/static/chunks/_bun/chunks/")).length).toBeGreaterThan(0);
    },
    timeout,
  );
});

describe("next-bun patch", () => {
  function fakeNext(version: string, anchors = true) {
    const dir = tempDir("next-bun-patch", {
      "package.json": JSON.stringify({ name: "next", version }),
    });
    const files = {
      "dist/lib/bundler.js": "function finalizeBundlerFromConfig(fromOptions) {\n    return fromOptions;\n}\n",
      "dist/build/webpack-build/index.js":
        "async function webpackBuild(withWorker, compilerNames) {\n    return compile();\n}\n",
    };
    for (const [file, source] of Object.entries(files)) {
      mkdirSync(join(String(dir), file, ".."), { recursive: true });
      writeFileSync(join(String(dir), file), anchors ? source : source.replace("{\n", "{ "));
    }
    return dir;
  }

  test("applies once and is idempotent", () => {
    using dir = fakeNext("16.1.6");
    expect(checkPatch(String(dir)).patched).toBe(false);
    expect(applyPatch(String(dir)).changed).toHaveLength(2);
    expect(checkPatch(String(dir)).patched).toBe(true);
    expect(applyPatch(String(dir)).changed).toEqual([]);
    const source = readFileSync(join(String(dir), "dist/lib/bundler.js"), "utf8");
    expect(source.split(MARKER)).toHaveLength(2);
  });

  test("accepts every 16.x from 16.1.6 on, canaries included, and refuses the rest", () => {
    const supported = ["16.1.6", "16.1.7", "16.2.0", "16.4.0", "16.5.0-canary.4", "16.12.3"];
    const refused = ["16.1.5", "16.0.10", "15.5.4", "17.0.0", "17.0.0-canary.0"];
    expect(supported.filter(isSupported)).toEqual(supported);
    expect(refused.filter(isSupported)).toEqual([]);
    for (const version of VERIFIED_VERSIONS) expect(isSupported(version)).toBe(true);
  });

  test("patches a supported later release", () => {
    using dir = fakeNext("16.5.0-canary.4");
    expect(applyPatch(String(dir))).toEqual({ version: "16.5.0-canary.4", changed: expect.any(Array) });
    expect(checkPatch(String(dir))).toMatchObject({ supported: true, patched: true });
  });

  test("refuses an unsupported Next.js version", () => {
    using dir = fakeNext("17.0.0");
    expect(() => applyPatch(String(dir))).toThrow("next@17.0.0 is not supported");
    expect(checkPatch(String(dir)).patched).toBe(false);
  });

  test("refuses when an anchor is missing", () => {
    using dir = fakeNext("16.1.6", false);
    expect(() => applyPatch(String(dir))).toThrow("expected exactly one anchor");
  });
});
