# @aphrody/bun-plugin-tailwind

Tailwind CSS v4 for Bun, on `@tailwindcss/node` and the Oxide scanner, with no Node.js involved:

- `Bun.build` plugin, `Bun.serve` HTML imports and the `bun ./index.html` dev server (with hot reload),
- a PostCSS plugin on the same engine (`@aphrody/bun-plugin-tailwind/postcss`) for Turbopack, webpack and Vite,
- a Material 3 preset (`theme: "m3"`) built from `@aphrody/m3-tokens` and `@aphrody/m3-tailwind`.

```sh
bun add -d @aphrody/bun-plugin-tailwind
```

`tailwindcss` itself does not need to be installed: `@import "tailwindcss"` resolves from the project first, then
from the plugin's own dependency.

## Bun.build

```ts
import tailwind from "@aphrody/bun-plugin-tailwind";

await Bun.build({
  entrypoints: ["./index.html"],
  outdir: "./dist",
  plugins: [tailwind],
});
```

```css
/* style.css */
@import "tailwindcss";
```

Any stylesheet that uses a Tailwind feature is compiled: `@import "tailwindcss"`, `@source` (including `not` and
`inline(…)`), `@plugin`, `@config` (Tailwind v3 JavaScript configs), `@theme`, `@utility`, `@variant`,
`@custom-variant`, `@apply`, `@reference` and `theme()`. Other stylesheets are left to Bun.

Class candidates come from two places:

1. Tailwind's automatic source detection from the build `root` (or the working directory), which honours
   `.gitignore`, plus every `@source`.
2. Every file the build loads (JavaScript, TypeScript, HTML, Vue, Svelte, Astro, MDX, …), so classes in a
   gitignored or `node_modules` component imported by the app are found too.

## Dev server

```toml
# bunfig.toml
[serve.static]
plugins = ["@aphrody/bun-plugin-tailwind"]
```

```sh
bun ./index.html
```

The same setting applies to HTML imports served by `Bun.serve({ routes: { "/": html } })`. In development, editing a
source file rebuilds the stylesheet and hot-reloads it; editing a stylesheet, a `@plugin` or a `@config` file
recompiles that root.

## Options

```ts
import { tailwind } from "@aphrody/bun-plugin-tailwind";

tailwind({
  base: import.meta.dir, // automatic source detection root (default: build root, else cwd)
  sources: ["../ui/src/**/*.tsx", "!**/*.test.tsx"], // extra sources, `!` excludes
  optimize: true, // Lightning CSS pass (`optimize` of @tailwindcss/node); `{ minify: false }` to keep it readable
  minify: true, // shorthand for `optimize: { minify: true }`
  sourcemap: true, // inline source map to the original stylesheets
  moduleGraph: { exclude: /node_modules/ }, // or `false` to scan only the sources
  theme: "m3", // Material 3 preset, see below
});
```

`Bun.build({ minify: true })` already minifies the CSS Bun outputs; `optimize` is for the plugin's own output (for
example with the PostCSS plugin). Bun's CSS bundler does not write CSS source maps, so `sourcemap` maps are available
through the PostCSS plugin and the `TailwindRoot` API.

## PostCSS (Next.js with Turbopack or webpack, Vite)

```js
// postcss.config.mjs
export default {
  plugins: {
    "@aphrody/bun-plugin-tailwind/postcss": {},
  },
};
```

It takes the same options as the Bun plugin (except `moduleGraph`), reports the files and directories it read as
PostCSS `dependency` / `dir-dependency` messages so the host rebuilds on change, and chains its source map. It works
under Node.js too (`dist/`, ES modules and CommonJS).

In a Next.js app, `@aphrody/next-bun` uses the Bun plugin when it builds with `Bun.build` (`withBun`) and Turbopack
uses this PostCSS plugin.

## Material 3

```ts
tailwind({ theme: "m3" });
tailwind({
  theme: { seed: "#0b57d0", variant: "vibrant", contrastLevel: 0.5 },
});
tailwind({ theme: { seed: false } }); // colours set at runtime (applyDynamicColor, <m3-theme>, M3Html)
```

`theme` adds, right after `@import "tailwindcss"`, the sheets published by Aphrody M3:

| Option       | Sheet                               | Gives                                                                     |
| ------------ | ----------------------------------- | ------------------------------------------------------------------------- |
| `tokens`     | `@aphrody/m3-tokens/m3-tokens.css`  | `--md-sys-*` motion, elevation, state, shape tokens                       |
| `expressive` | `@aphrody/m3-tokens/expressive.css` | M3 Expressive shapes and springs                                          |
| `preset`     | `@aphrody/m3-tailwind/preset.css`   | `bg-primary`, `text-body-large`, `rounded-large`, `shadow-elevation-2`, … |
| `seed`       | generated                           | the 49 `--md-sys-color-*` roles, light and dark (`.dark`, OS, `.light`)   |

Each defaults to on; the seed defaults to the M3 baseline `#6750A4`. `@aphrody/bun-plugin-tailwind/m3` exports
`m3SchemeCss(seed, options)` and `m3Prelude(theme)` for other tools.

## API

`@aphrody/bun-plugin-tailwind/core` exports `TailwindRoot`, the engine both plugins use:

```ts
import { TailwindRoot } from "@aphrody/bun-plugin-tailwind/core";

const root = new TailwindRoot("src/style.css", process.cwd(), {
  sourcemap: true,
});
const { css, map, dependencies, globs, scannedFiles } = await root.generate(
  await Bun.file("src/style.css").text(),
);
```

A root keeps its compiler and candidates between calls and recompiles when the stylesheet, an imported stylesheet, a
plugin or a config changed.

## Compared with `bun-plugin-tailwind`

Everything the `bun-plugin-tailwind` package published by Tailwind Labs does (CSS roots, Oxide scanning, module graph
candidates, rebuilds on change, dev server), plus: named factory with options, `sources`, `moduleGraph` control,
Lightning CSS `optimize`/`minify`, source maps, roots that only use `@theme`/`@variant`, `tailwindcss` resolved
without installing it, a PostCSS plugin and a CommonJS/Node.js build, and the Material 3 preset. It uses the public
`@tailwindcss/oxide` package instead of a bundled native addon, so it runs wherever Oxide has a prebuilt binary.

## Tests

```sh
bun test test/integration/bun-plugin-tailwind/
```
