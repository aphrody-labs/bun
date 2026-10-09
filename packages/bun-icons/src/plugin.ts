import type { BunPlugin } from "bun";
import { bestEntry, entryToPng, parseIco, pngDataUrl } from "./ico.ts";
import { type FetchSymbolOptions, fetchSymbol, parseSymbol, symbolUrl, symbolsOrigin } from "./symbols.ts";

export interface IconsPluginOptions extends FetchSymbolOptions {}

const NAMESPACE = "aphrody-symbol";

/** ICO module: `default` is the largest entry as a PNG data URL, `best(px)` follows `bestEntry`. */
export function icoModule(bytes: Uint8Array): string {
  const entries = parseIco(bytes);
  const meta = entries.map(({ width, height, bits, png }) => ({ width, height, bits, png }));
  const urls = entries.map(e => pngDataUrl(entryToPng(e)));
  return [
    `export const entries = ${JSON.stringify(meta)};`,
    `const urls = ${JSON.stringify(urls)};`,
    `export function best(px) {`,
    `  let b = -1;`,
    `  const side = e => Math.max(e.width, e.height);`,
    `  entries.forEach((e, i) => { if (side(e) >= px && (b < 0 || side(e) < side(entries[b]) || (side(e) === side(entries[b]) && e.bits > entries[b].bits))) b = i; });`,
    `  if (b < 0) b = ${bestEntry(entries)};`,
    `  return urls[b];`,
    `}`,
    `export default urls[${bestEntry(entries)}];`,
  ].join("\n");
}

/**
 * `import svg from "symbol:home?style=rounded&fill=1"` (SVG markup from the CDN, cached on disk)
 * and `import src from "./favicon.ico"` (PNG data URL), at runtime (`Bun.plugin`) and in `Bun.build`.
 */
export function iconsPlugin(options: IconsPluginOptions = {}): BunPlugin {
  return {
    name: "@aphrody/bun-icons",
    setup(builder) {
      builder.onResolve({ filter: /^symbol:/ }, args => ({ path: args.path, namespace: NAMESPACE }));
      // The runtime splits `symbol:home` into namespace `symbol` and path `home`; Bun.build does not.
      builder.onResolve({ filter: /.*/, namespace: "symbol" }, args => ({
        path: `symbol:${args.path}`,
        namespace: NAMESPACE,
      }));
      builder.onLoad({ filter: /.*/, namespace: NAMESPACE }, async args => {
        const spec = parseSymbol(args.path);
        const svg = await fetchSymbol(spec, options);
        const url = symbolUrl(spec, options.origin ?? symbolsOrigin());
        return {
          contents: `export const url = ${JSON.stringify(url)};\nexport default ${JSON.stringify(svg)};`,
          loader: "js",
        };
      });
      builder.onLoad({ filter: /\.(ico|cur)$/i }, async args => ({
        contents: icoModule(await Bun.file(args.path).bytes()),
        loader: "js",
      }));
    },
  };
}
