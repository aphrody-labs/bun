// SPDX-License-Identifier: Apache-2.0
import { lstat, realpath } from "node:fs/promises";
import { isAbsolute } from "node:path";

export interface PublicSnapshot {
  path: string;
  sha256: string;
}
export interface M3SheetRequest {
  sheet: string;
  seed?: string;
  variant?: string;
  dark?: boolean;
  contrast?: number;
}
export interface PublicCatalogOptions {
  docsFile: PublicSnapshot;
  templatesFile: PublicSnapshot;
  assetsFile: PublicSnapshot;
  uiShell: (request: Request) => Response | Promise<Response>;
  m3Css?: (request: M3SheetRequest) => string | Promise<string>;
}

async function snapshot(source: PublicSnapshot): Promise<Record<string, unknown>[]> {
  if (!isAbsolute(source.path) || !/^[a-f0-9]{64}$/.test(source.sha256))
    throw new Error("Explicit absolute public snapshot and SHA256 required");
  const stat = await lstat(source.path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8 * 1024 * 1024)
    throw new Error("Invalid public snapshot file");
  const bytes = await Bun.file(await realpath(source.path)).bytes();
  if (new Bun.CryptoHasher("sha256").update(bytes).digest("hex") !== source.sha256)
    throw new Error("Public snapshot SHA256 mismatch");
  const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (
    !Array.isArray(value) ||
    value.length > 10_000 ||
    value.some(entry => !entry || typeof entry !== "object" || Array.isArray(entry))
  )
    throw new Error("Invalid public catalog array");
  return value as Record<string, unknown>[];
}

const sheets = new Set([
  "tokens",
  "tailwind",
  "spaceui",
  "scheme",
  "static",
  "m3-tokens",
  "brand",
  "gemini",
  "aphrody",
  "components",
  "comp",
]);
const variants = new Set([
  "monochrome",
  "neutral",
  "tonal-spot",
  "vibrant",
  "expressive",
  "fidelity",
  "content",
  "rainbow",
  "fruit-salad",
]);
function sheetRequest(query: URLSearchParams): M3SheetRequest {
  for (const key of query.keys())
    if (!["sheet", "seed", "variant", "dark", "contrast"].includes(key) || query.getAll(key).length !== 1)
      throw new Error("Invalid M3 parameter");
  const sheet = query.get("sheet");
  if (!sheet || !sheets.has(sheet)) throw new Error("Unknown M3 sheet");
  const result: M3SheetRequest = { sheet };
  const seed = query.get("seed");
  if (seed !== null) {
    if (!/^#(?:[a-fA-F0-9]{3}|[a-fA-F0-9]{6})$/.test(seed)) throw new Error("Invalid M3 seed");
    result.seed = seed;
  }
  const variant = query.get("variant");
  if (variant !== null) {
    if (!variants.has(variant.replaceAll("_", "-"))) throw new Error("Unknown M3 variant");
    result.variant = variant;
  }
  const dark = query.get("dark");
  if (dark !== null) {
    if (!["true", "false"].includes(dark)) throw new Error("Invalid M3 dark mode");
    result.dark = dark === "true";
  }
  const contrast = query.get("contrast");
  if (contrast !== null) {
    const value = Number(contrast);
    if (
      !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(contrast) ||
      !Number.isFinite(value) ||
      value < -1 ||
      value > 1
    )
      throw new Error("Invalid M3 contrast");
    result.contrast = value;
  }
  return result;
}

export async function createPublicCatalog(options: PublicCatalogOptions) {
  const [docs, templates, assets] = await Promise.all([
    snapshot(options.docsFile),
    snapshot(options.templatesFile),
    snapshot(options.assetsFile),
  ]);
  for (const catalog of [docs, templates]) {
    const ids = catalog.map(entry => entry.id);
    if (ids.some(id => typeof id !== "string" || !/^[\w-]+$/.test(id)) || new Set(ids).size !== ids.length)
      throw new Error("Invalid public catalog identifiers");
  }
  const templateIds = new Set(templates.map(entry => entry.id));
  return async (request: Request): Promise<Response | null> => {
    const url = new URL(request.url),
      path = url.pathname;
    const detail = /^\/templates\/([\w-]+)\/?$/.exec(path);
    if (
      !["/api/docs", "/api/templates", "/assets/manifest", "/api/m3/css"].includes(path) &&
      !(detail && templateIds.has(detail[1]))
    )
      return null;
    const head = request.method === "HEAD";
    const json = (value: unknown, status = 200) =>
      new Response(head ? null : JSON.stringify(value), {
        status,
        headers: {
          "content-type": "application/json",
          "cache-control": "no-cache",
          "x-content-type-options": "nosniff",
        },
      });
    if (!["GET", "HEAD"].includes(request.method))
      return new Response(null, { status: 405, headers: { allow: "GET, HEAD" } });
    if (detail) return options.uiShell(request);
    if (path === "/api/templates") return json(templates);
    if (path === "/assets/manifest") return json(assets);
    if (path === "/api/docs") {
      const query = (url.searchParams.get("q") ?? "").toLowerCase();
      const category = url.searchParams.get("category"),
        id = url.searchParams.get("id");
      if (new TextEncoder().encode(url.search).length > 4096) return json({ error: "Catalog query too long" }, 400);
      return json(
        docs.filter(
          entry =>
            (!category || category === "All" || entry.category === category) &&
            (!id || entry.id === id) &&
            (!query ||
              [entry.title, entry.summary, entry.content, ...(Array.isArray(entry.tags) ? entry.tags : [])].some(
                value => typeof value === "string" && value.toLowerCase().includes(query),
              )),
        ),
      );
    }
    let config: M3SheetRequest;
    try {
      config = sheetRequest(url.searchParams);
    } catch {
      return json({ error: "Invalid M3 sheet request" }, 400);
    }
    if (!options.m3Css) return json({ error: "Native M3 renderer unavailable" }, 503);
    try {
      const css = await options.m3Css(config);
      if (typeof css !== "string" || new TextEncoder().encode(css).length > 2 * 1024 * 1024)
        throw new Error("Invalid owner CSS");
      return new Response(head ? null : css, {
        headers: {
          "content-type": "text/css; charset=utf-8",
          "cache-control": "public, max-age=31536000, immutable",
          "x-content-type-options": "nosniff",
        },
      });
    } catch {
      return json({ error: "Native M3 renderer unavailable" }, 503);
    }
  };
}
