import { homedir } from "node:os";
import { join } from "node:path";

export const SYMBOL_STYLES = ["outlined", "rounded", "sharp"] as const;
export type SymbolStyle = (typeof SYMBOL_STYLES)[number];

export class SymbolError extends Error {
  override name = "SymbolError";
}

/** `symbol:<name>?style=…&fill=…&wght=…&grad=…&opsz=…&size=…`: the Rust loader's keys, limited to the CDN variants. */
export interface SymbolSpec {
  name: string;
  style: SymbolStyle;
  fill: 0 | 1;
  wght: number;
  grad: -25 | 0 | 200;
  opsz: 20 | 24 | 40 | 48;
  /** `width`/`height` of the returned SVG, `opsz` when absent. */
  size?: number;
}

const AXES = {
  fill: [0, 1],
  wght: [100, 200, 300, 400, 500, 600, 700],
  grad: [-25, 0, 200],
  opsz: [20, 24, 40, 48],
} as const;

export const DEFAULT_ORIGIN = "https://cdn.aphrody.com/";

/**
 * Parse a symbol specifier. Only the variants the CDN publishes are accepted (FILL 0|1, wght by
 * 100, GRAD -25|0|200, opsz 20|24|40|48); unknown keys and out-of-range values throw.
 */
export function parseSymbol(specifier: string): SymbolSpec {
  const body = specifier.startsWith("symbol:") ? specifier.slice(7) : specifier;
  const q = body.indexOf("?");
  const name = q < 0 ? body : body.slice(0, q);
  if (!/^[a-z0-9_]+$/.test(name)) throw new SymbolError(`symbol: name "${name}" (expected [a-z0-9_]+)`);
  const spec: SymbolSpec = { name, style: "outlined", fill: 0, wght: 400, grad: 0, opsz: 24 };
  for (const [key, value] of new URLSearchParams(q < 0 ? "" : body.slice(q + 1))) {
    if (key === "style") {
      if (!(SYMBOL_STYLES as readonly string[]).includes(value)) {
        throw new SymbolError(`symbol: style=${value} (expected outlined, rounded or sharp)`);
      }
      spec.style = value as SymbolStyle;
      continue;
    }
    const n = Number(value);
    if (key === "size") {
      if (!Number.isInteger(n) || n <= 0 || n > 4096) throw new SymbolError(`symbol: size=${value} (expected 1..4096)`);
      spec.size = n;
      continue;
    }
    if (!(key in AXES))
      throw new SymbolError(`symbol: unknown parameter "${key}" (style, fill, wght, grad, opsz, size)`);
    const allowed = AXES[key as keyof typeof AXES] as readonly number[];
    if (value === "" || !allowed.includes(n)) {
      throw new SymbolError(`symbol: ${key}=${value} (expected one of ${allowed.join(", ")})`);
    }
    (spec as unknown as Record<string, number>)[key] = n;
  }
  return spec;
}

/** gstatic layout: `s/i/short-term/release/materialsymbols<style>/<name>/<variant>/<opsz>px.svg`. */
export function symbolPath(spec: SymbolSpec): string {
  let variant = "";
  if (spec.wght !== 400) variant += `wght${spec.wght}`;
  if (spec.grad < 0) variant += "gradN25";
  else if (spec.grad > 0) variant += "grad200";
  if (spec.fill) variant += "fill1";
  return `s/i/short-term/release/materialsymbols${spec.style}/${spec.name}/${variant || "default"}/${spec.opsz}px.svg`;
}

export const symbolsOrigin = (): string => Bun.env.APHRODY_ICONS_ORIGIN || DEFAULT_ORIGIN;

export const symbolsCacheDir = (): string =>
  Bun.env.APHRODY_ICONS_CACHE ||
  join(Bun.env.XDG_CACHE_HOME || join(homedir(), ".cache"), "aphrody", "material-symbols");

export function symbolUrl(spec: SymbolSpec, origin: string = symbolsOrigin()): string {
  return new URL(symbolPath(spec), origin.endsWith("/") ? origin : `${origin}/`).href;
}

export interface FetchSymbolOptions {
  origin?: string;
  /** Disk cache directory; `false` disables it. */
  cacheDir?: string | false;
  fetch?: typeof fetch;
}

function sized(svg: string, size: number | undefined): string {
  if (size === undefined) return svg;
  return svg.replace(/<svg\b[^>]*>/, tag =>
    tag.replace(/\s(width|height)="[^"]*"/g, "").replace(/^<svg\b/, `<svg width="${size}" height="${size}"`),
  );
}

/** SVG markup of a symbol from the CDN, through the disk cache (keyed by origin and path). */
export async function fetchSymbol(spec: SymbolSpec, options: FetchSymbolOptions = {}): Promise<string> {
  const origin = options.origin ?? symbolsOrigin();
  const url = symbolUrl(spec, origin);
  const dir = options.cacheDir ?? symbolsCacheDir();
  const file = dir ? Bun.file(join(dir, Bun.hash(origin).toString(36), symbolPath(spec))) : undefined;
  if (file && (await file.exists())) return sized(await file.text(), spec.size);

  let response: Response;
  try {
    response = await (options.fetch ?? fetch)(url);
  } catch (error) {
    throw new SymbolError(`symbol: ${url}: ${(error as Error).message}`);
  }
  if (response.status === 404) throw new SymbolError(`symbol: unknown symbol "${spec.name}" (${spec.style}) at ${url}`);
  if (!response.ok) throw new SymbolError(`symbol: ${url}: HTTP ${response.status}`);
  const svg = (await response.text()).trim();
  if (!/^<svg\b/.test(svg) || /<script\b|\son\w+\s*=/i.test(svg)) {
    throw new SymbolError(`symbol: ${url} is not a plain SVG`);
  }
  if (file) await Bun.write(file, svg);
  return sized(svg, spec.size);
}
