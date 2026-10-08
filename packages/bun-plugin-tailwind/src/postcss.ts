// PostCSS plugin on the same engine as the Bun plugin, for the bundlers that
// run PostCSS (Turbopack and webpack in Next.js, Vite, …):
//
//   // postcss.config.mjs
//   export default { plugins: { "@aphrody/bun-plugin-tailwind/postcss": { theme: "m3" } } };
//
// It reports the files and globs Tailwind read as `dependency` and
// `dir-dependency` messages so the host bundler rebuilds on change.
import type { PluginCreator } from "postcss";
import { resolve } from "node:path";
import { mayUseTailwind, TailwindRoot, type TailwindOptions } from "./core.ts";

const NAME = "@aphrody/bun-plugin-tailwind/postcss";

const roots = new Map<string, TailwindRoot>();

const tailwindPostcss: PluginCreator<TailwindOptions> = (options = {}) => ({
  postcssPlugin: NAME,
  async Once(root, { result, postcss }) {
    const input = root.source?.input.css ?? root.toString();
    const from = result.opts.from;
    if (!from || !mayUseTailwind(input)) return;
    const path = resolve(from);
    const key = `${path}\0${JSON.stringify(options)}`;
    let tw = roots.get(key);
    if (!tw) roots.set(key, (tw = new TailwindRoot(path, options.base ?? process.cwd(), options)));

    const generated = await tw.generate(input);
    if (!generated) {
      roots.delete(key);
      return;
    }

    for (const file of generated.dependencies) {
      result.messages.push({ type: "dependency", plugin: NAME, file, parent: path });
    }
    for (const file of generated.scannedFiles) {
      result.messages.push({ type: "dependency", plugin: NAME, file, parent: path });
    }
    for (const { base, pattern } of generated.globs) {
      result.messages.push(
        pattern === "*" || pattern === ""
          ? { type: "dir-dependency", plugin: NAME, dir: base, parent: path }
          : { type: "dir-dependency", plugin: NAME, dir: base, glob: pattern, parent: path },
      );
    }

    const css = generated.map ? stripInlineMap(generated.css) : generated.css;
    const next = postcss.parse(css, {
      from: path,
      map: generated.map ? { prev: generated.map, inline: false } : undefined,
    });
    root.removeAll();
    root.append(next.nodes);
    // `append` keeps the generated input as each node's source, so the
    // PostCSS map chains to the original stylesheets.
    root.source = next.source;
  },
});
tailwindPostcss.postcss = true;

function stripInlineMap(css: string) {
  return css.replace(/\n\/\*# sourceMappingURL=data:[^*]*\*\/\n?$/, "\n");
}

export default tailwindPostcss;
export { tailwindPostcss };
export type { TailwindOptions };
