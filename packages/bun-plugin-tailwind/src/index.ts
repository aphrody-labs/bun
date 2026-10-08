// Tailwind CSS v4 for Bun's bundler, its HTML dev server and `Bun.serve`
// HTML imports. Stylesheets using Tailwind are compiled with
// `@tailwindcss/node`; class candidates come from the Oxide scanner (automatic
// source detection plus `@source`) and from every module of the build.
import type { BunPlugin, PluginBuilder } from "bun";
import { dirname, extname } from "node:path";
import { mayUseTailwind, resolveCss, TailwindRoot, type TailwindOptions } from "./core.ts";

export { mayUseTailwind, resolveCss, TailwindRoot, withPrelude } from "./core.ts";
export type { GenerateResult, SourceOption, TailwindOptions } from "./core.ts";
export { M3_BASELINE_SEED, m3Prelude, m3SchemeCss } from "./m3.ts";
export type { M3Options } from "./m3.ts";

export interface BunTailwindOptions extends TailwindOptions {
  /**
   * Read class candidates from every file the build loads, including those the
   * scanner skips (gitignored, `node_modules`), like `bun-plugin-tailwind`
   * does. `{ exclude }` drops matching paths. Default: true.
   */
  moduleGraph?: boolean | { exclude?: RegExp };
}

/** Files whose candidates are collected from the module graph. */
const SOURCE_FILE =
  /\.(?:[cm]?[jt]sx?|html?|vue|svelte|astro|mdx?|php|twig|liquid|hbs|handlebars|njk|pug|erb|rb|py|rs|go|elm|templ|cshtml|razor)$/;
const CSS_ROOT = /\.css$/;
/** Asset queries and package caches that never are stylesheet roots. */
const NOT_ROOT = /[?&](?:worker|sharedworker|raw|url)\b|[\\/]\.bun[\\/]/;

/** Builds the plugin. */
export function tailwind(options: BunTailwindOptions = {}): BunPlugin {
  return {
    name: "@aphrody/bun-plugin-tailwind",
    setup(build: PluginBuilder) {
      const base = options.base ?? build.config?.root ?? process.cwd();
      const roots = new Map<string, TailwindRoot>();

      // Module graph: path -> number of times it was loaded. A root rescans a
      // file whenever the count moved since it last read it (dev server edits).
      const graph = new Map<string, number>();
      const graphOption = options.moduleGraph ?? true;
      if (graphOption) {
        const exclude = typeof graphOption === "object" ? graphOption.exclude : undefined;
        build.onLoad({ filter: SOURCE_FILE }, ({ path, namespace }) => {
          if (namespace !== "file" || (exclude && exclude.test(path))) return;
          graph.set(path, (graph.get(path) ?? 0) + 1);
          return undefined;
        });
      }
      const seen = new WeakMap<TailwindRoot, Map<string, number>>();
      const graphCandidates = (root: TailwindRoot) => {
        let read = seen.get(root);
        if (!read) seen.set(root, (read = new Map()));
        const files: string[] = [];
        for (const [file, count] of graph) {
          if (read.get(file) === count || !root.accepts(file) || !extname(file)) continue;
          read.set(file, count);
          files.push(file);
        }
        return root.scanFiles(files);
      };

      // `<link href="tailwindcss">`, `@import "tailwindcss"` and `import "tailwindcss"` in a project
      // that did not install it: Tailwind's stylesheet from this package's dependency.
      build.onResolve({ filter: /^tailwindcss$/ }, async ({ path, importer, resolveDir }) => {
        const from = resolveDir || (importer ? dirname(importer) : base);
        // Bun.resolveSync would succeed through auto-install: ask the CSS resolver.
        if (await resolveCss(path, from, false)) return undefined;
        const css = await resolveCss(path, from);
        return css ? { path: css } : undefined;
      });

      build.onLoad({ filter: CSS_ROOT }, async ({ path, defer }) => {
        if (NOT_ROOT.test(path)) return undefined;
        const input = await Bun.file(path).text();
        if (!mayUseTailwind(input)) return undefined;
        let root = roots.get(path);
        if (!root) roots.set(path, (root = new TailwindRoot(path, base, options)));
        // Every other module is loaded once `defer` resolves, so the module
        // graph holds all of them.
        await defer?.();
        const result = await root.generate(input, graphCandidates);
        if (!result) {
          roots.delete(path);
          return undefined;
        }
        return { contents: result.css, loader: "css" };
      });
    },
  };
}

/**
 * The plugin with its defaults, for `bunfig.toml`:
 * `[serve.static] plugins = ["@aphrody/bun-plugin-tailwind"]`.
 */
const plugin: BunPlugin = tailwind();
export default plugin;
