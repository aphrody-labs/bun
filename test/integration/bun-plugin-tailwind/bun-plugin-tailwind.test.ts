import { beforeAll, describe, expect, test } from "bun:test";
import { bunEnv, bunExe, tempDir } from "harness";
import { existsSync, statSync, utimesSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

// @aphrody/bun-plugin-tailwind (packages/bun-plugin-tailwind). The fixtures have
// no node_modules: `@import "tailwindcss"` and the M3 sheets resolve from the
// plugin's own dependencies.

const pluginDir = join(import.meta.dir, "..", "..", "..", "packages", "bun-plugin-tailwind");
const pluginEntry = join(pluginDir, "src", "index.ts").replaceAll("\\", "/");

type Plugin = typeof import("../../../packages/bun-plugin-tailwind/src/index.ts");
let tw: Plugin;
let postcssPlugin: typeof import("../../../packages/bun-plugin-tailwind/src/postcss.ts").default;

beforeAll(async () => {
  expect(statSync(pluginDir).isDirectory()).toBeTrue();
  if (!existsSync(join(pluginDir, "node_modules", "@tailwindcss", "oxide"))) {
    const install = Bun.spawnSync([bunExe(), "install", "--frozen-lockfile"], {
      cwd: pluginDir,
      env: bunEnv,
      stdout: "pipe",
      stderr: "pipe",
    });
    if (install.exitCode !== 0) throw new Error(`bun install failed:\n${install.stdout}\n${install.stderr}`);
  }
  // Imported once the plugin's dependencies are installed.
  tw = await import(pluginEntry);
  postcssPlugin = (await import(join(pluginDir, "src", "postcss.ts"))).default;
});

async function buildCss(dir: string, entry: string, options: Record<string, unknown> = {}, buildOptions = {}) {
  const result = await Bun.build({
    entrypoints: [join(dir, entry)],
    root: dir,
    outdir: join(dir, "out"),
    plugins: [tw.tailwind(options)],
    throw: false,
    ...buildOptions,
  });
  if (!result.success) throw new AggregateError(result.logs, "build failed");
  const css = result.outputs.filter(o => o.path.endsWith(".css"));
  expect(css).toHaveLength(1);
  return css[0].text();
}

describe("Bun.build", () => {
  test("HTML entry: candidates from HTML and from the scripts it loads", async () => {
    using dir = tempDir("tw-html", {
      "index.html": `<!doctype html><html><head><link rel="stylesheet" href="./style.css"></head>
<body><main class="p-4 text-red-500"></main><script type="module" src="./app.ts"></script></body></html>`,
      "app.ts": "document.body.className = `flex underline`;",
      "style.css": `@import "tailwindcss";`,
    });
    const css = await buildCss(String(dir), "index.html");
    expect(css).toContain("tailwindcss v4");
    for (const cls of [".p-4", ".text-red-500", ".flex", ".underline"]) expect(css).toContain(cls);
    expect(css).not.toContain(".grid");
  });

  test('<link href="tailwindcss"> and import "tailwindcss" without installing tailwindcss', async () => {
    using dir = tempDir("tw-link", {
      "index.html": `<!doctype html><html><head><link rel="stylesheet" href="tailwindcss" /></head>
<body><div class="p-4"></div><script type="module" src="./app.ts"></script></body></html>`,
      "app.ts": 'import "tailwindcss";\ndocument.body.className = `underline`;',
    });
    const css = await buildCss(String(dir), "index.html");
    expect(css).toContain(".p-4");
    expect(css).toContain(".underline");
  });

  test("@reference: @apply against the theme without emitting it", async () => {
    using dir = tempDir("tw-reference", {
      "button.css": `@reference "tailwindcss";\n.btn { @apply px-4 font-bold; }`,
    });
    const css = await buildCss(String(dir), "button.css");
    expect(css).toMatch(/\.btn\s*\{[^}]*padding-inline/);
    expect(css).not.toContain("--color-red-500");
  });

  test("@theme, @utility, @variant, @custom-variant and @apply", async () => {
    using dir = tempDir("tw-directives", {
      "index.html": `<div class="bg-brand tab-4 pointer-coarse:p-2 card"></div>`,
      "style.css": `@import "tailwindcss";
@theme { --color-brand: #123456; }
@utility tab-4 { tab-size: 4; }
@custom-variant pointer-coarse (@media (pointer: coarse));
.card {
  @apply rounded-lg;
  @variant hover { color: red; }
}`,
    });
    const css = await buildCss(String(dir), "style.css");
    expect(css).toContain("--color-brand: #123456");
    expect(css).toContain(".bg-brand");
    expect(css).toMatch(/\.tab-4\s*\{\s*tab-size: 4/);
    expect(css).toContain("@media (pointer: coarse)");
    expect(css).toMatch(/\.card\s*\{[^}]*border-radius: var\(--radius-lg\)/);
    expect(css).toContain(":hover");
    expect(css).not.toContain("@utility");
    expect(css).not.toContain("@custom-variant");
  });

  test("@source adds, excludes and inlines candidates", async () => {
    using dir = tempDir("tw-source", {
      "app/style.css": `@import "tailwindcss" source(none);
@source "../extra";
@source not "../extra/skip";
@source inline("italic");`,
      "app/page.html": `<div class="font-bold"></div>`,
      "extra/a.html": `<div class="uppercase"></div>`,
      "extra/skip/b.html": `<div class="lowercase"></div>`,
    });
    const css = await buildCss(String(dir), "app/style.css");
    expect(css).toContain(".uppercase");
    expect(css).toContain(".italic");
    expect(css).not.toContain(".lowercase");
    expect(css).not.toContain(".font-bold");
  });

  test("the sources option, with ! exclusions", async () => {
    using dir = tempDir("tw-sources-option", {
      "style.css": `@import "tailwindcss" source(none);`,
      "ui/a.html": `<div class="uppercase"></div>`,
      "ui/b.test.html": `<div class="lowercase"></div>`,
    });
    const css = await buildCss(String(dir), "style.css", { sources: ["ui/**/*.html", "!ui/**/*.test.html"] });
    expect(css).toContain(".uppercase");
    expect(css).not.toContain(".lowercase");
  });

  test("@plugin and @config (Tailwind v3 compatibility)", async () => {
    using dir = tempDir("tw-plugin-config", {
      "style.css": `@import "tailwindcss";
@plugin "./plugin.js";
@config "./tailwind.config.js";`,
      "plugin.js": `export default function ({ addUtilities }) {
  addUtilities({ ".content-auto": { "content-visibility": "auto" } });
}`,
      "tailwind.config.js": `export default { theme: { extend: { colors: { legacy: "#abcdef" } } } };`,
      "index.html": `<div class="content-auto bg-legacy"></div>`,
    });
    const css = await buildCss(String(dir), "style.css");
    expect(css).toMatch(/\.content-auto\s*\{\s*content-visibility: auto/);
    expect(css).toMatch(/\.bg-legacy\s*\{\s*background-color: (#abcdef|var\(--color-legacy)/);
  });

  test("stylesheets without Tailwind are left to Bun", async () => {
    using dir = tempDir("tw-plain", {
      "style.css": `@import "./other.css";\n.a { color: red; }`,
      "other.css": `.b { color: blue; }`,
    });
    const css = await buildCss(String(dir), "style.css");
    expect(css).not.toContain("tailwindcss");
    expect(css).toContain(".a");
    expect(css).toContain(".b");
  });

  test("module graph: candidates from imported files the scanner skips", async () => {
    const files = {
      ".gitignore": "generated/\nout/\n",
      "index.html": `<link rel="stylesheet" href="./style.css"><script type="module" src="./app.ts"></script>`,
      "app.ts": `import { cls } from "./generated/ui.ts";\ndocument.body.className = cls;`,
      "generated/ui.ts": "export const cls = `skew-x-12`;",
      "style.css": `@import "tailwindcss";`,
    };
    using a = tempDir("tw-graph", files);
    expect(await buildCss(String(a), "index.html")).toContain(".skew-x-12");
    using b = tempDir("tw-graph-off", files);
    expect(await buildCss(String(b), "index.html", { moduleGraph: false })).not.toContain(".skew-x-12");
  });

  test("minify: Bun's minifier and the Lightning CSS optimize option", async () => {
    const files = {
      "style.css": `@import "tailwindcss";`,
      "index.html": `<div class="p-4 text-red-500"></div>`,
    };
    using dir = tempDir("tw-minify", files);
    const plain = await buildCss(String(dir), "style.css");
    const minified = await buildCss(String(dir), "style.css", {}, { minify: true });
    expect(minified.length).toBeLessThan(plain.length);
    expect(minified).toContain(".p-4{");

    // Bun reprints what the plugin returns, so check Lightning CSS on the engine's own output.
    const path = join(String(dir), "style.css");
    const input = await Bun.file(path).text();
    const optimized = (await new tw.TailwindRoot(path, String(dir), { optimize: true }).generate(input))!.css;
    const pretty = (await new tw.TailwindRoot(path, String(dir), { optimize: { minify: false } }).generate(input))!.css;
    expect(optimized).toContain(".p-4{");
    expect(optimized.length).toBeLessThan(pretty.length);
    expect(pretty).toContain(".p-4 {");
  });

  test("theme: m3 adds the Material 3 tokens, preset and baseline scheme", async () => {
    using dir = tempDir("tw-m3", {
      "style.css": `@import "tailwindcss";`,
      "index.html": `<div class="bg-primary text-on-primary rounded-large shadow-elevation-2 text-body-large"></div>`,
    });
    const css = await buildCss(String(dir), "style.css", { theme: "m3" });
    expect(css).toContain(".bg-primary");
    expect(css).toContain("var(--md-sys-color-primary)");
    expect(css).toMatch(/--md-sys-color-primary: #[0-9a-f]{6}/i);
    expect(css).toContain(".rounded-large");
    expect(css).toContain(".shadow-elevation-2");
    expect(css).toContain(".text-body-large");
    expect(css).toContain(".dark");

    using custom = tempDir("tw-m3-seed", {
      "style.css": `@import "tailwindcss";`,
      "index.html": `<div class="bg-primary"></div>`,
    });
    const noScheme = await buildCss(String(custom), "style.css", { theme: { seed: false } });
    expect(noScheme).toContain(".bg-primary");
    expect(noScheme).not.toMatch(/--md-sys-color-primary: #/);
    const red = await buildCss(String(custom), "style.css", { theme: { seed: "#b3261e" } });
    expect(red).toMatch(/--md-sys-color-primary: #[0-9a-f]{6}/i);
    expect(red.match(/--md-sys-color-primary: (#[0-9a-f]{6})/i)![1]).not.toBe(
      css.match(/--md-sys-color-primary: (#[0-9a-f]{6})/i)![1],
    );
  });
});

describe("core", () => {
  test("TailwindRoot: sourcemap, dependencies and recompilation on change", async () => {
    using dir = tempDir("tw-core", {
      "style.css": `@import "tailwindcss";\n@import "./theme.css";`,
      "theme.css": `@theme { --color-brand: #111111; }`,
      "index.html": `<div class="bg-brand"></div>`,
    });
    const path = join(String(dir), "style.css");
    const root = new tw.TailwindRoot(path, String(dir), { sourcemap: true });
    const first = (await root.generate(await Bun.file(path).text()))!;
    expect(first.css).toContain("--color-brand: #111111");
    expect(first.dependencies.map(d => d.replaceAll("\\", "/"))).toContain(
      join(String(dir), "theme.css").replaceAll("\\", "/"),
    );
    expect(first.css).toContain("/*# sourceMappingURL=data:application/json;base64,");
    const map = JSON.parse(first.map!);
    expect(map.sources.some((s: string) => s.endsWith("theme.css"))).toBeTrue();

    await Bun.write(join(String(dir), "theme.css"), `@theme { --color-brand: #222222; }`);
    const time = new Date(Date.now() + 5000);
    utimesSync(join(String(dir), "theme.css"), time, time);
    const second = (await root.generate(await Bun.file(path).text()))!;
    expect(second.css).toContain("--color-brand: #222222");
  });
});

describe("postcss", () => {
  const requireFromPlugin = createRequire(join(pluginDir, "package.json"));

  test("same engine as a PostCSS plugin, with dependency messages and a chained map", async () => {
    const postcss = requireFromPlugin("postcss");
    using dir = tempDir("tw-postcss", {
      "style.css": `@import "tailwindcss";\n@source "./src";`,
      "src/a.html": `<div class="grid gap-4"></div>`,
    });
    const from = join(String(dir), "style.css");
    const result = await postcss([postcssPlugin({ base: String(dir), sourcemap: true })]).process(
      await Bun.file(from).text(),
      { from, map: { inline: false } },
    );
    expect(result.css).toContain(".grid");
    expect(result.css).toContain(".gap-4");
    const types = new Set(result.messages.map((m: { type: string }) => m.type));
    expect(types.has("dependency")).toBeTrue();
    expect(types.has("dir-dependency")).toBeTrue();
    expect(result.map.toJSON().sources.some((s: string) => s.includes("tailwindcss"))).toBeTrue();
  });

  test("the CommonJS entry is the plugin creator (require(name)(options))", async () => {
    const plugin = requireFromPlugin("./src/postcss.cjs");
    expect(typeof plugin).toBe("function");
    expect(plugin.postcss).toBeTrue();
    expect(plugin({}).postcssPlugin).toBe("@aphrody/bun-plugin-tailwind/postcss");
  });

  test("dist build for Node.js hosts", async () => {
    const out = join(pluginDir, "dist");
    const build = Bun.spawnSync([bunExe(), join(pluginDir, "scripts", "build.ts"), out], {
      env: bunEnv,
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(build.stderr.toString()).toBe("");
    expect(build.exitCode).toBe(0);
    const postcss = requireFromPlugin("postcss");
    const plugin = requireFromPlugin("./dist/postcss.cjs");
    using dir = tempDir("tw-postcss-dist", {
      "style.css": `@import "tailwindcss" source("./src");`,
      "src/a.html": `<div class="m3-check bg-primary"></div>`,
    });
    const from = join(String(dir), "style.css");
    const result = await postcss([plugin({ theme: "m3" })]).process(await Bun.file(from).text(), { from });
    expect(result.css).toContain(".bg-primary");
    expect(result.css).toMatch(/--md-sys-color-primary: #/);
  });
});

describe("dev server", () => {
  test("[serve.static] plugins: HTML route compiles Tailwind and rebuilds on source edits", async () => {
    using dir = tempDir("tw-serve", {
      "bunfig.toml": `[serve.static]\nplugins = [${JSON.stringify(pluginEntry)}]\n`,
      "index.html": `<!doctype html><html><head><link rel="stylesheet" href="./style.css"></head>
<body><div class="p-4"></div><script type="module" src="./app.ts"></script></body></html>`,
      "app.ts": "document.body.dataset.x = `underline`;",
      "style.css": `@import "tailwindcss";`,
      "server.ts": `import html from "./index.html";
const server = Bun.serve({ port: 0, routes: { "/": html }, development: true });
console.log(server.url.href);`,
    });
    await using proc = Bun.spawn({
      cmd: [bunExe(), "server.ts"],
      cwd: String(dir),
      env: bunEnv,
      stdout: "pipe",
      stderr: "pipe",
    });
    const reader = proc.stdout.getReader();
    let text = "";
    while (!text.includes("\n")) {
      const { value, done } = await reader.read();
      if (done) throw new Error(`server exited: ${await proc.stderr.text()}`);
      text += new TextDecoder().decode(value);
    }
    const url = new URL(text.trim());
    const stylesheet = async () => {
      const html = await (await fetch(url)).text();
      const href = /href="([^"]+\.css)"/.exec(html)?.[1];
      expect(href).toBeDefined();
      return (await fetch(new URL(href!, url))).text();
    };

    const css = await stylesheet();
    expect(css).toContain(".p-4");
    expect(css).toContain(".underline");
    expect(css).not.toContain(".tracking-widest");

    await Bun.write(join(String(dir), "app.ts"), "document.body.dataset.x = `underline tracking-widest`;");
    const deadline = Date.now() + 20_000;
    let updated = "";
    while (Date.now() < deadline) {
      updated = await stylesheet();
      if (updated.includes(".tracking-widest")) break;
      await Bun.sleep(100);
    }
    expect(updated).toContain(".tracking-widest");
    proc.kill();
  });
});
