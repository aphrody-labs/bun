// SPDX-License-Identifier: Apache-2.0
import { createM3Site } from "../src/site.ts";
import { createGooglePublicSearch } from "../../../packages/bun-google/src/search";
import { createPublicCatalog, type PublicCatalogOptions } from "../../../packages/bun-m3/src/catalog";
import { createGoogleOAuthServer, createMemoryGoogleOAuthStore } from "../../../packages/bun-google/src/oauth";
import { createNativeM3Renderer } from "../../../packages/bun-m3/src/native-renderer";
import { searchPage } from "./search-page";
import { publicPwaResponse } from "./pwa";

export async function createPublicSite(options: {
  staticRoot: string;
  catalog: (request: Request) => Response | Promise<Response>;
  themeFile: string;
  googleOwner: string;
  snapshots?: Omit<PublicCatalogOptions, "uiShell">;
  oauth?: (request: Request) => Promise<Response | null>;
}) {
  const api = await createM3Site({
    staticRoot: options.staticRoot,
    search: createGooglePublicSearch({ executable: options.googleOwner }),
  });
  const theme = Bun.file(options.themeFile);
  if (!(await theme.exists())) throw new Error("Public M3 theme asset is missing");
  const shell = (request: Request) => {
    const url = new URL(request.url);
    url.pathname = "/chat";
    return options.catalog(new Request(url.href, request));
  };
  const publicCatalog = options.snapshots
    ? await createPublicCatalog({ ...options.snapshots, uiShell: shell })
    : undefined;
  return async (request: Request): Promise<Response> => {
    const path = new URL(request.url).pathname;
    const authentication = await options.oauth?.(request);
    if (authentication) return authentication;
    if (path === "/favicon.png" || path === "/_app-ui/icon-512.png") {
      if (!["GET", "HEAD"].includes(request.method))
        return new Response(null, { status: 405, headers: { allow: "GET, HEAD" } });
      const asset = Bun.file(`${options.staticRoot}/${path === "/favicon.png" ? "favicon.png" : "icon-512.png"}`);
      if (!(await asset.exists())) return new Response(null, { status: 404 });
      return new Response(request.method === "HEAD" ? null : asset, {
        headers: {
          "content-type": "image/png",
          "x-content-type-options": "nosniff",
          "cache-control": "no-cache",
        },
      });
    }
    const pwa = publicPwaResponse(request);
    if (pwa) return pwa;
    const search = await searchPage(request, api);
    if (search) return search;
    if (["/api/search", "/api/capabilities", "/health"].includes(path)) return api(request);
    if (path === "/_app-ui/google-public-theme.css") {
      if (!["GET", "HEAD"].includes(request.method))
        return new Response(null, { status: 405, headers: { allow: "GET, HEAD" } });
      return new Response(request.method === "HEAD" ? null : theme, {
        headers: {
          "content-type": "text/css; charset=utf-8",
          "cache-control": "no-cache",
          "x-content-type-options": "nosniff",
        },
      });
    }
    const response =
      (await publicCatalog?.(request)) ??
      (path === "/terminal" && ["GET", "HEAD"].includes(request.method)
        ? await shell(request)
        : await options.catalog(request));
    if (request.method === "HEAD" || !response.headers.get("content-type")?.includes("text/html")) return response;
    const headers = new Headers(response.headers);
    headers.delete("content-length");
    headers.delete("etag");
    const transformed = new HTMLRewriter()
      .on("head", {
        element(element) {
          element.append('<link rel="stylesheet" href="/_app-ui/google-public-theme.css">', {
            html: true,
          });
          element.append(
            '<link rel="manifest" href="/manifest.webmanifest"><script src="/pwa-register.js" defer></script>',
            { html: true },
          );
        },
      })
      .transform(response);
    return new Response(transformed.body, { status: response.status, headers });
  };
}

if (import.meta.main) {
  const root = process.env.APP_UI_ROOT;
  const catalogModule = process.env.SITE_CATALOG_MODULE;
  const themeFile = process.env.SITE_THEME_FILE;
  const googleOwner = process.env.GOOGLE_SEARCH_OWNER;
  if (!root || !catalogModule || !themeFile || !googleOwner)
    throw new Error("APP_UI_ROOT, SITE_CATALOG_MODULE, SITE_THEME_FILE and GOOGLE_SEARCH_OWNER required");
  const source = await import(catalogModule);
  const downloadsRoot = process.env.DOWNLOADS_ROOT || "/srv/downloads";
  const catalog = source.createHandler(downloadsRoot, source.siteOptions(downloadsRoot));
  const manifestFile = process.env.SITE_PUBLIC_CATALOG;
  const snapshots = manifestFile ? await Bun.file(manifestFile).json() : undefined;
  if (snapshots) {
    for (const key of ["docsFile", "templatesFile", "assetsFile"] as const) {
      const file = snapshots[key];
      if (!file || typeof file.path !== "string" || !/^[\w.-]+$/.test(file.path))
        throw new Error("Invalid release catalog manifest");
      file.path = `${root}/${file.path}`;
    }
    if (process.env.SITE_M3_RENDERER && process.env.SITE_M3_RENDERER !== "http://m3-renderer:3000")
      throw new Error("Invalid native M3 renderer endpoint");
    if (process.env.SITE_M3_RENDERER === "http://m3-renderer:3000")
      snapshots.m3Css = createNativeM3Renderer({ endpoint: process.env.SITE_M3_RENDERER });
  }
  const publicOrigin = process.env.SITE_PUBLIC_ORIGIN || "https://aphrody.com";
  const credentialsFile = process.env.GOOGLE_OAUTH_CLIENT_FILE;
  const credentials = credentialsFile ? await Bun.file(credentialsFile).json() : undefined;
  const oauth = createGoogleOAuthServer({
    publicOrigin,
    callbackURL: `${publicOrigin}/auth/google/callback`,
    allowedCallbackURLs: [`${publicOrigin}/auth/google/callback`],
    clientId: credentials?.clientId,
    clientSecret: credentials?.clientSecret,
    store: process.env.GOOGLE_OAUTH_SESSION_STORE === "memory" ? createMemoryGoogleOAuthStore() : undefined,
    allowedReturnPaths: ["/", "/settings"],
  });
  const port = Number(process.env.PORT ?? "3000");
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("Invalid PORT");
  const server = Bun.serve({
    hostname: process.env.SITE_HOST || "127.0.0.1",
    port,
    maxRequestBodySize: 64 * 1024,
    fetch: await createPublicSite({
      staticRoot: root,
      catalog,
      themeFile,
      googleOwner,
      snapshots,
      oauth: async request => {
        const incoming = new URL(request.url);
        const canonical = new URL(publicOrigin);
        if (incoming.host === canonical.host && incoming.protocol === "http:") {
          incoming.protocol = canonical.protocol;
          request = new Request(incoming.href, request);
        }
        return (await oauth.fetch(request)) ?? null;
      },
    }),
  });
  console.log(`Aphrody Bun M3 site listening on ${server.hostname}:${server.port}`);
}
