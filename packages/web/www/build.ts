/**
 * The build of the Bun site, on the stack of bun.com: Bun.build bundles one stylesheet (Tailwind v4, through
 * @aphrody/bun-plugin-tailwind) and one script per page into hashed files, the pages are TSX components rendered to static
 * HTML, and the fonts are served by the site. Nothing is rendered in the browser; the scripts only add behaviour.
 */
import tailwind from "@aphrody/bun-plugin-tailwind";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { WEBMCP_SCRIPT } from "../site/webmcp.ts";
import type { Assets } from "./src/lib.ts";

const here = import.meta.dir;

/** Variable fonts of the site: Archivo for headlines and text, Martian Mono for labels and code. */
const FONTS = [
  { family: "Archivo", file: "Archivo.var.woff2", weight: "100 900", stretch: "62% 125%" },
  { family: "Martian Mono", file: "MartianMono.var.woff2", weight: "100 800", stretch: "75% 112.5%" },
];

export async function buildAssets(out: string): Promise<Assets> {
  const entry = (name: string) => join(here, "src", name);
  const result = await Bun.build({
    entrypoints: [entry("styles/site.css"), entry("client/site.ts"), entry("client/page-home.ts")],
    outdir: join(out, "_assets"),
    root: join(here, "src"),
    naming: { entry: "[name]-[hash].[ext]", chunk: "chunk-[hash].[ext]", asset: "[name]-[hash].[ext]" },
    splitting: true,
    target: "browser",
    format: "esm",
    minify: true,
    plugins: [tailwind],
  });
  if (!result.success) throw new AggregateError(result.logs, "Asset build failed");
  const assets: Assets = { css: "", scripts: {}, chunks: [], fonts: [] };
  for (const output of result.outputs) {
    const file = basename(output.path);
    const url = `/_assets/${file}`;
    const entryName = /^(.+)-[a-z0-9]{6,}\.(js|css)$/.exec(file);
    if (entryName?.[2] === "css") assets.css = url;
    else if (output.kind === "entry-point" && entryName) assets.scripts[entryName[1]!] = url;
    else if (output.kind === "chunk" && output.size > 0) assets.chunks.push(url);
  }
  if (!assets.css || !assets.scripts.site) throw new Error("The asset build produced no stylesheet or shared script");
  for (const font of FONTS) {
    const bytes = readFileSync(join(here, "fonts", font.file));
    const name = `${font.file.replace(/\.var\.woff2$/, "")}-${Bun.hash(bytes).toString(36).slice(0, 8)}.woff2`;
    mkdirSync(join(out, "_assets"), { recursive: true });
    writeFileSync(join(out, "_assets", name), bytes);
    assets.fonts.push({ family: font.family, url: `/_assets/${name}`, weight: font.weight, stretch: font.stretch });
  }
  // The public tools of the site, registered with WebMCP: a classic script with its own hashed name.
  const webmcp = `webmcp-${Bun.hash(WEBMCP_SCRIPT).toString(36).slice(0, 8)}.js`;
  writeFileSync(join(out, "_assets", webmcp), WEBMCP_SCRIPT);
  assets.scripts.webmcp = `/_assets/${webmcp}`;
  return assets;
}

export const root = resolve(here, "../../..");
