import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { cpSync } from "fs";
import { bunExe, isDebug } from "harness";
import { join } from "path";
import { installFixture, nextBuild, nextEnv, nextStart, withoutNode } from "./next-helpers";

// App Router baseline (J0 of the Next.js-on-Bun plan): `next build` + `next start`
// under `bun --bun`, once with Turbopack (the default bundler) and once with webpack,
// plus a Turbopack build through the `next-bun` runner with no `node` on PATH. The fixture's
// PostCSS plugin stamps the runtime it ran in into the CSS, so each variant asserts PostCSS ran on Bun.
// A last variant (J2) bundles the App Router with Bun.build through @aphrody/next-bun.

const fixture = join(import.meta.dir, "..");
const nextBunPackage = join(import.meta.dir, "..", "..", "..", "..", "packages", "bun-next");
let dir: Awaited<ReturnType<typeof installFixture>>;

/**
 * Submits the server-rendered `<form id={id}>` of /form without JavaScript (its hidden
 * `$ACTION_*` inputs plus `name=bun`), as a browser would, and returns the cookies the action set.
 */
async function submitForm(url: string, html: string, id: string) {
  const form = new RegExp(`<form id="${id}"[^>]*>([^]*?)</form>`).exec(html);
  if (!form) throw new Error(`no form #${id} in /form`);
  const decode = (value: string) =>
    value
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&");
  const body = new FormData();
  for (const [input] of form[1].matchAll(/<input[^>]*>/g)) {
    if (!input.includes('type="hidden"')) continue;
    const name = /name="([^"]*)"/.exec(input)![1];
    body.append(decode(name), decode(/value="([^"]*)"/.exec(input)?.[1] ?? ""));
  }
  body.append("name", "bun");
  const response = await fetch(url + "/form", { method: "POST", body, redirect: "manual" });
  await response.text();
  expect(response.status).toBe(200);
  return response.headers.getSetCookie().join("; ");
}

/** The two forms of /form: a module-level action and an inline one with a bound (encrypted) closure value. */
async function checkFormActions(url: string) {
  const html = await (await fetch(url + "/form")).text();
  expect(html).toContain("$ACTION_ID_");
  expect(await submitForm(url, html, "greet")).toContain("greeted=bun");
  expect(await submitForm(url, html, "shout")).toMatch(/shouted=bun(!|%21)/);
}

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
  // @aphrody/next-bun for the Bun.build variant; the patch is inert unless withBun selects it.
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
      expect(html).toContain('<p id="lazy">loaded through next/dynamic</p>');
      expect(html).toContain("self.__next_f");
      expect(page.status).toBe(200);

      const api = await fetch(server.url + "/api/hello?name=next");
      expect(await api.json()).toEqual({ hello: "next", runtime: "bun" });
      expect(api.status).toBe(200);

      const missing = await fetch(server.url + "/does-not-exist");
      expect(missing.status).toBe(404);

      await checkFormActions(server.url);
    },
    isDebug ? Infinity : 300_000,
  );
});

// J2: the App Router compiled by Bun.build through @aphrody/next-bun (rsc, ssr and browser passes).
test(
  "next-app (Bun.build via @aphrody/next-bun) builds and serves the App Router",
  async () => {
    const env = { NEXT_DIST_DIR: ".next-bun", NEXT_BUN_BUNDLER: "1" };
    const buildOutput = await nextBuild(String(dir), [], env);
    expect(buildOutput).toContain("Compiled successfully with Bun");
    expect(buildOutput).toContain("○ /");
    expect(buildOutput).toContain("ƒ /api/hello");

    let css = "";
    for await (const file of new Bun.Glob("static/**/*.css").scan(join(String(dir), ".next-bun")))
      css += await Bun.file(join(String(dir), ".next-bun", file)).text();
    expect(css).toMatch(/#010203|rgb\(1,\s*2,\s*3\)/);
    expect(css).toMatch(/--postcss-runtime:\s*bun/);

    await using server = await nextStart(String(dir), env);

    const page = await fetch(server.url + "/");
    const html = await page.text();
    expect(html).toContain("<title>Bun App Router</title>");
    expect(html).toContain("<h1>Hello from the App Router</h1>");
    expect(html).toContain('<p id="runtime">bun</p>');
    expect(html).toContain("<button>count: <!-- -->0</button>");
    expect(html).toContain('<p id="lazy">loaded through next/dynamic</p>');
    expect(html).toContain("self.__next_f");
    expect(page.status).toBe(200);

    const api = await fetch(server.url + "/api/hello?name=next");
    expect(await api.json()).toEqual({ hello: "next", runtime: "bun" });
    expect(api.status).toBe(200);
    expect((await fetch(server.url + "/does-not-exist")).status).toBe(404);

    // Server Actions: forms without JavaScript, then the action a Client Component imports, called as the browser does.
    await checkFormActions(server.url);
    const actionsManifest = await Bun.file(
      join(String(dir), ".next-bun", "server", "server-reference-manifest.json"),
    ).json();
    const [echoId] = Object.entries(actionsManifest.node).find(([, action]: any) => action.exportedName === "echo")!;
    expect(actionsManifest.node[echoId].workers["app/form/page"]).toEqual({
      moduleId: "bun-app-actions",
      async: false,
    });
    const reply = await fetch(server.url + "/form", {
      method: "POST",
      headers: { "Next-Action": echoId, "Content-Type": "text/plain;charset=UTF-8", Accept: "text/x-component" },
      body: JSON.stringify(["bun"]),
    });
    expect(await reply.text()).toContain('"echo:bun"');
    expect(reply.status).toBe(200);
    const formHtml = await (await fetch(server.url + "/form")).text();

    // Every script in the HTML and in the flight payload (client reference chunks), and every module they import.
    const transpiler = new Bun.Transpiler({ loader: "js" });
    const queue = [
      ...html.matchAll(/\/_next\/static\/[^"'\\\s]+?\.js/g),
      ...formHtml.matchAll(/\/_next\/static\/[^"'\\\s]+?\.js/g),
    ].map(([path]) => server.url + path);
    expect(queue.length).toBeGreaterThan(0);
    const seen = new Set<string>();
    const missing: string[] = [];
    let clientComponent = false;
    let echoReference = false;
    while (queue.length) {
      const url = queue.pop()!;
      if (seen.has(url)) continue;
      seen.add(url);
      const response = await fetch(url);
      if (response.status !== 200) {
        missing.push(`${response.status} ${url}`);
        continue;
      }
      const source = await response.text();
      if (source.includes("count: ")) clientComponent = true;
      if (source.includes(echoId)) echoReference = true;
      for (const { path } of transpiler.scanImports(source)) {
        if (path.startsWith(".")) queue.push(new URL(path, url).href);
      }
    }
    expect(missing).toEqual([]);
    expect(clientComponent).toBe(true);
    expect(echoReference).toBe(true);
  },
  isDebug ? Infinity : 300_000,
);
