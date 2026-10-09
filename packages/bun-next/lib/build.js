"use strict";
// Replaces the compile step of `next build` (webpack's three compilers) with
// two `Bun.build` passes. Everything before and after it (page data collection,
// prerendering, routes/prerender manifests, traces) still runs in Next.js, which
// only needs the files that webpack would have written:
//
//   server/pages/**.js              CommonJS route modules required by next-server
//   static/chunks/**                browser scripts listed in build-manifest.json
//   build-manifest.json, server/pages-manifest.json, static/<buildId>/_buildManifest.js
//   and the empty manifests of features this adapter does not implement yet.
//
// Scope: Pages Router on the Node.js runtime, global CSS and CSS modules (Bun's
// CSS bundler, plus the Bun plugins given to `withBun`, e.g. Tailwind CSS).
// The App Router (Server and Client Components, route handlers) is compiled by
// build-app.js. Server Actions, middleware/proxy, instrumentation, the edge
// runtime, next/font, next/image static imports and next/dynamic are rejected
// or produce empty manifests.

const { mkdirSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { parse: parseQuery } = require("node:querystring");
const path = require("node:path");

const PAGES_DIR_ALIAS = "private-next-pages";
const ROOT_DIR_ALIAS = "private-next-root-dir";
const APP_DIR_ALIAS = "private-next-app-dir";
const SOURCE_FILE = /\.(?:[cm]?[jt]sx?)$/;

class UnsupportedError extends Error {
  constructor(feature) {
    super(`@aphrody/next-bun: ${feature} is not supported by the Bun bundler yet.`);
  }
}

/** Bun plugins added to both builds, set by `withBun({ plugins, tailwind })`. */
let extraPlugins = [];

/** @param {{ plugins?: import("bun").BunPlugin[] }} options */
function configure(options) {
  extraPlugins = options.plugins ?? [];
}

function posix(p) {
  return p.replaceAll("\\", "/");
}

function write(file, contents) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, contents);
}

function contentHash(contents) {
  return Bun.hash(contents).toString(16).padStart(16, "0");
}

/**
 * @param {string[] | null} compilerNames `null` for a full build; Next.js only
 *   passes names with `experimental.parallelServerCompiles`.
 * @param {string} webpackBuildDir `__dirname` of next/dist/build/webpack-build
 */
async function bunBuild(compilerNames, webpackBuildDir) {
  if (compilerNames) throw new UnsupportedError("experimental.parallelServerCompiles");
  const start = performance.now();
  const nextDist = path.join(webpackBuildDir, "..", "..");
  const next = id => require(path.join(nextDist, id));

  const { NextBuildContext: ctx } = next("build/build-context.js");
  const { createEntrypoints } = next("build/entries.js");
  const { loadEntrypoint } = next("build/load-entrypoint.js");
  const { getDefineEnv } = next("build/define-env.js");
  const { loadProjectInfo } = next("build/webpack-config.js");
  const { normalizePagePath } = next("shared/lib/page-path/normalize-page-path.js");
  const { default: getRouteFromEntrypoint } = next("server/get-route-from-entrypoint.js");
  const { generateClientManifest } = next("build/webpack/plugins/build-manifest-plugin.js");
  const { createEdgeRuntimeManifest, srcEmptySsgManifest } = next(
    "build/webpack/plugins/build-manifest-plugin-utils.js",
  );
  const { event } = next("build/output/log.js");

  const { dir, config, pagesDir, appDir, buildId } = ctx;
  const distDir = path.join(dir, config.distDir);

  const hasAppRouter = !!ctx.mappedAppPages && Object.keys(ctx.mappedAppPages).length > 0;
  if (ctx.hasInstrumentationHook) throw new UnsupportedError("instrumentation");

  const entrypoints = await createEntrypoints({
    buildId,
    config,
    envFiles: ctx.loadedEnvFiles,
    isDev: false,
    rootDir: dir,
    pageExtensions: config.pageExtensions,
    pagesDir,
    appDir,
    pages: ctx.mappedPages,
    appPaths: ctx.mappedAppPages,
    previewMode: ctx.previewProps,
    rootPaths: ctx.mappedRootPaths,
    hasInstrumentationHook: ctx.hasInstrumentationHook,
  });
  if (Object.keys(entrypoints.edgeServer).length > 0) throw new UnsupportedError("The edge runtime");

  const resolveAlias = request => {
    for (const [alias, target] of [
      [PAGES_DIR_ALIAS, pagesDir],
      [ROOT_DIR_ALIAS, dir],
      [APP_DIR_ALIAS, appDir],
    ]) {
      if (target && (request === alias || request.startsWith(alias + "/"))) {
        return path.join(target, request.slice(alias.length));
      }
    }
    return request;
  };
  const loaderOptions = request => {
    const match = /^([^?!]+)\?(.*)!$/.exec(request);
    return match ? { loader: match[1], options: parseQuery(match[2]) } : null;
  };

  const projectInfo = await loadProjectInfo({ dir, config, dev: false });
  const defines = side => {
    const env = getDefineEnv({
      isTurbopack: false,
      clientRouterFilters: ctx.clientRouterFilters,
      config,
      dev: false,
      distDir,
      projectPath: dir,
      fetchCacheKeyPrefix: ctx.fetchCacheKeyPrefix,
      hasRewrites: ctx.hasRewrites,
      isClient: side === "client",
      isEdgeServer: false,
      isNodeServer: side === "server",
      middlewareMatchers: entrypoints.middlewareMatchers,
      omitNonDeterministic: ctx.isCompileMode,
      rewrites: ctx.rewrites,
    });
    // DefinePlugin accepts `undefined` values; Bun.build wants an expression string.
    for (const key in env) env[key] ??= "undefined";
    return env;
  };
  const swcState = { next, ctx, dir, distDir, pagesDir, appDir, projectInfo };
  const swc = side => nextSwcPlugin({ ...swcState, side });

  const entriesDir = path.join(distDir, "cache", "bun-entries");
  rmSync(entriesDir, { recursive: true, force: true });

  // Server: one self-contained CommonJS file per page, like webpack's
  // `server/pages/*.js`. Packages stay external and are required at runtime.
  const serverEntriesDir = path.join(entriesDir, "server");
  const serverEntries = [];
  const pagesManifest = {};
  for (const [name, imports] of Object.entries(entrypoints.server)) {
    if (hasAppRouter && name.startsWith("app/")) continue;
    const [request] = [imports].flat();
    if (!name.startsWith("pages/")) throw new UnsupportedError(`The server entry "${name}"`);
    const route = loaderOptions(request);
    let source;
    if (!route) {
      source = `module.exports = require(${JSON.stringify(resolveAlias(request))});\n`;
    } else if (route.loader === "next-route-loader" && route.options.kind === "PAGES") {
      const { page, absolutePagePath, absoluteAppPath, absoluteDocumentPath } = route.options;
      source = await loadEntrypoint("pages", {
        VAR_USERLAND: resolveAlias(absolutePagePath),
        VAR_MODULE_DOCUMENT: resolveAlias(absoluteDocumentPath),
        VAR_MODULE_APP: resolveAlias(absoluteAppPath),
        VAR_DEFINITION_PAGE: normalizePagePath(page),
        VAR_DEFINITION_PATHNAME: page,
      });
    } else if (route.loader === "next-route-loader" && route.options.kind === "PAGES_API") {
      const { page, absolutePagePath } = route.options;
      source = await loadEntrypoint("pages-api", {
        VAR_USERLAND: resolveAlias(absolutePagePath),
        VAR_DEFINITION_PAGE: normalizePagePath(page),
        VAR_DEFINITION_PATHNAME: page,
      });
    } else {
      throw new UnsupportedError(`The server entry "${name}" (${request})`);
    }
    const file = path.join(serverEntriesDir, name + ".js");
    write(file, source);
    serverEntries.push(file);
    pagesManifest[getRouteFromEntrypoint(name)] = name + ".js";
  }

  if (serverEntries.length > 0) {
    const server = await Bun.build({
      entrypoints: serverEntries,
      root: serverEntriesDir,
      outdir: path.join(distDir, "server"),
      naming: "[dir]/[name].[ext]",
      target: "node",
      format: "cjs",
      packages: "external",
      define: defines("server"),
      plugins: [swc("server"), ...extraPlugins],
      throw: false,
    });
    if (!server.success) throw new AggregateError(server.logs, "@aphrody/next-bun: server build failed");
  }

  // Client: ES modules with code splitting so React and Next's client runtime
  // are shared between pages. Next.js loads page scripts as classic scripts, so
  // every entry gets a tiny classic loader that imports the module.
  const clientEntriesDir = path.join(entriesDir, "client");
  const clientEntries = [];
  const mainEntry = path.join(clientEntriesDir, "main.js");
  write(
    mainEntry,
    `const client = require("next/dist/client/index.js");
self.__next_set_public_path__ = () => {};
window.next = {
  version: client.version,
  get router() {
    return client.router;
  },
  emitter: client.emitter,
};
client.initialize({}).then(() => client.hydrate()).catch(console.error);
`,
  );
  clientEntries.push(mainEntry);
  for (const [name, imports] of Object.entries(entrypoints.client)) {
    // Pages-style fallbacks of the App Router (`app/_not-found/page`, …): webpack
    // builds them but no manifest references them.
    if (hasAppRouter && name.startsWith("app/")) continue;
    const [request, ...extra] = [imports].flat();
    const route = loaderOptions(request);
    if (route?.loader !== "next-client-pages-loader") throw new UnsupportedError(`The client entry "${name}"`);
    const file = path.join(clientEntriesDir, name + ".js");
    write(
      file,
      [
        ...extra.map(e => `import ${JSON.stringify(e)};`),
        `import * as page from ${JSON.stringify(resolveAlias(route.options.absolutePagePath))};`,
        `(window.__NEXT_P = window.__NEXT_P || []).push([${JSON.stringify(route.options.page)}, () => page]);`,
        "",
      ].join("\n"),
    );
    clientEntries.push(file);
  }

  const chunksDir = path.join(distDir, "static", "chunks");
  const client = await Bun.build({
    entrypoints: clientEntries,
    root: clientEntriesDir,
    outdir: chunksDir,
    naming: {
      entry: "_bun/[dir]/[name]-[hash].[ext]",
      chunk: "_bun/chunks/chunk-[hash].[ext]",
      asset: "../media/[name]-[hash].[ext]",
    },
    target: "browser",
    format: "esm",
    splitting: true,
    minify: !ctx.noMangling,
    define: defines("client"),
    plugins: [swc("client"), ...extraPlugins],
    metafile: true,
    throw: false,
  });
  if (!client.success) throw new AggregateError(client.logs, "@aphrody/next-bun: client build failed");

  // The stylesheet Bun bundled for each entry, keyed by output path relative to chunksDir.
  const cssBundles = new Map();
  for (const [output, meta] of Object.entries(client.metafile.outputs)) {
    if (meta.cssBundle) cssBundles.set(posix(path.normalize(output)), posix(path.normalize(meta.cssBundle)));
  }
  const clientFiles = new Map();
  const clientCss = new Map();
  for (const output of client.outputs) {
    if (output.kind !== "entry-point") continue;
    const relative = posix(path.relative(chunksDir, output.path));
    const name = /^_bun\/(.+)-[^-/]+\.js$/.exec(relative)?.[1];
    if (!name) throw new Error(`@aphrody/next-bun: unexpected client output ${relative}`);
    // `process` is provided to browser code the way webpack's ProvidePlugin does.
    const loader = `self.process||(self.process={env:{}});import(${JSON.stringify(
      "./" + path.posix.relative(path.posix.dirname(name), relative),
    )});\n`;
    const file = `static/chunks/${name}-${contentHash(loader)}.js`;
    write(path.join(distDir, file), loader);
    clientFiles.set(name, file);
    const css = cssBundles.get(relative);
    if (css) clientCss.set(name, `static/chunks/${css}`);
  }

  const polyfills = readFileSync(path.join(nextDist, "build", "polyfills", "polyfill-nomodule.js"));
  const polyfillFile = `static/chunks/polyfills-${contentHash(polyfills)}.js`;
  write(path.join(distDir, polyfillFile), polyfills);

  const app = hasAppRouter
    ? await require("./build-app.js").buildApp({
        ...swcState,
        nextDist,
        buildId,
        entrypoints,
        defines,
        entriesDir,
        chunksDir,
        loaderOptions,
        plugins: extraPlugins,
        minify: !ctx.noMangling,
        helpers: { UnsupportedError, write, posix, contentHash, swcCode },
      })
    : null;

  // Same shape and helpers as webpack's BuildManifestPlugin.
  const mainFile = clientFiles.get("main");
  const assetMap = {
    polyfillFiles: [polyfillFile],
    devFiles: [],
    lowPriorityFiles: [],
    rootMainFiles: app ? app.rootMainFiles : [],
    rootMainFilesTree: {},
    pages: { "/_app": [] },
  };
  for (const [name, file] of clientFiles) {
    if (name === "main") continue;
    const css = clientCss.get(name);
    assetMap.pages[getRouteFromEntrypoint(name)] = css ? [mainFile, file, css] : [mainFile, file];
  }
  const buildManifestPath = `static/${buildId}/_buildManifest.js`;
  const ssgManifestPath = `static/${buildId}/_ssgManifest.js`;
  assetMap.lowPriorityFiles.push(buildManifestPath, ssgManifestPath);
  assetMap.pages = Object.fromEntries(Object.entries(assetMap.pages).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));

  const fontManifest = JSON.stringify({
    pages: {},
    app: {},
    appUsingSizeAdjust: false,
    pagesUsingSizeAdjust: false,
  });
  const files = {
    "build-manifest.json": JSON.stringify(assetMap, null, 2),
    "server/middleware-build-manifest.js": createEdgeRuntimeManifest(assetMap),
    [buildManifestPath]: `self.__BUILD_MANIFEST = ${generateClientManifest(
      assetMap,
      ctx.rewrites,
      ctx.clientRouterFilters,
    )};self.__BUILD_MANIFEST_CB && self.__BUILD_MANIFEST_CB()`,
    [ssgManifestPath]: srcEmptySsgManifest,
    "server/pages-manifest.json": JSON.stringify(pagesManifest, null, 2),
    "react-loadable-manifest.json": "{}",
    "server/middleware-react-loadable-manifest.js": `self.__REACT_LOADABLE_MANIFEST='{}';`,
    "dynamic-css-manifest.json": "[]",
    "server/dynamic-css-manifest.js": `self.__DYNAMIC_CSS_MANIFEST="[]";`,
    "server/next-font-manifest.json": fontManifest,
    "server/next-font-manifest.js": `self.__NEXT_FONT_MANIFEST=${JSON.stringify(fontManifest)};`,
    "server/middleware-manifest.json": JSON.stringify(
      { version: 3, middleware: {}, functions: {}, sortedMiddleware: [] },
      null,
      2,
    ),
    "server/interception-route-rewrite-manifest.js": `self.__INTERCEPTION_ROUTE_REWRITE_MANIFEST="[]";`,
    ...app?.files,
  };
  for (const [file, contents] of Object.entries(files)) write(path.join(distDir, file), contents);

  const duration = (performance.now() - start) / 1000;
  event(`Compiled successfully with Bun in ${duration.toFixed(1)}s`);
  return { duration, buildTraceContext: {} };
}

/**
 * Next.js' SWC transform of one module, with the options next-swc-loader gives
 * it in the webpack layer `bundleLayer`.
 * @param {{ next: (id: string) => any, ctx: any, dir: string, distDir: string, pagesDir?: string,
 *   appDir?: string, projectInfo: any }} state
 * @param {{ isServer: boolean, bundleLayer: string, serverComponents: boolean, isPageFile?: boolean }} layer
 */
async function swcCode(state, filename, source, layer) {
  const { next, ctx, dir, distDir, pagesDir, appDir, projectInfo } = state;
  const { transform } = next("build/swc/index.js");
  const { getLoaderSWCOptions } = next("build/swc/options.js");
  const { config } = ctx;
  const options = getLoaderSWCOptions({
    filename,
    development: !!config.experimental.allowDevelopmentBuild,
    isServer: layer.isServer,
    pagesDir,
    appDir,
    isPageFile: !!layer.isPageFile,
    isCacheComponents: config.cacheComponents,
    hasReactRefresh: false,
    modularizeImports: config.modularizeImports,
    optimizePackageImports: config.experimental.optimizePackageImports,
    swcPlugins: config.experimental.swcPlugins,
    compilerOptions: config.compiler,
    optimizeServerReact: config.experimental.optimizeServerReact,
    jsConfig: projectInfo.jsConfig,
    supportedBrowsers: projectInfo.supportedBrowsers,
    swcCacheDir: path.join(distDir, "cache", "swc"),
    relativeFilePathFromRoot: path.relative(dir, filename),
    serverComponents: layer.serverComponents,
    serverReferenceHashSalt: ctx.encryptionKey,
    bundleLayer: layer.bundleLayer,
    esm: true,
    cacheHandlers: config.cacheHandlers,
    useCacheEnabled: config.experimental.useCache,
  });
  const output = await transform(source, { ...options, filename, sourceMaps: false });
  return output.code;
}

/** Runs Next.js' SWC transforms (SSG stripping, styled-jsx, next/dynamic, …) on project sources. */
function nextSwcPlugin({ side, ...state }) {
  const { distDir, pagesDir } = state;
  const isServer = side === "server";
  const generated = path.join(distDir, "cache", "bun-entries") + path.sep;

  return {
    name: "next-swc",
    setup(build) {
      // The server only needs the class names of CSS modules; global stylesheets
      // are bundled by the client build alone.
      if (isServer) {
        build.onLoad({ filter: /\.css$/ }, args => {
          if (!args.path.endsWith(".module.css")) return { contents: "", loader: "js" };
        });
      }
      build.onLoad({ filter: SOURCE_FILE }, async args => {
        if (args.path.includes(`${path.sep}node_modules${path.sep}`) || args.path.startsWith(generated)) return;
        if (args.path.endsWith(".d.ts")) return;
        const isPageFile = !!pagesDir && args.path.startsWith(pagesDir + path.sep);
        const isApiRoute = isPageFile && args.path.startsWith(path.join(pagesDir, "api") + path.sep);
        const source = readFileSync(args.path, "utf8");
        const code = await swcCode(state, args.path, source, {
          isServer,
          isPageFile,
          serverComponents: false,
          bundleLayer: isServer ? (isApiRoute ? "api-node" : "pages-dir-node") : "pages-dir-browser",
        });
        return { contents: code, loader: "js" };
      });
    },
  };
}

module.exports = { bunBuild, configure };
