// Current upstream UI routes mapped to the fork's canonical documentation owners.
const routes: Record<string, string> = {
  "/reference": "/docs/runtime",
  "/docs/ask": "#home-search",
  "/docs/video": "https://github.com/aphrody-labs/bun/tree/main/packages/bun-video",
  "/docs/api/cookie": "/docs/runtime/cookies",
  "/docs/api/fetch": "/docs/runtime/networking/fetch",
  "/docs/api/http": "/docs/runtime/http/server",
  "/docs/api/websockets": "/docs/runtime/http/websockets",
  "/docs/api/spawn": "/docs/runtime/child-process",
  "/docs/cli/run": "/docs/runtime",
  "/docs/cli/test": "/docs/test",
  "/docs/cli/install": "/docs/pm/cli/install",
  "/docs/cli/pm": "/docs/pm/cli/pm",
  "/docs/cli/filter": "/docs/pm/filter",
  "/docs/cli/bun-create": "/docs/runtime/templating/create",
  "/docs/install": "/docs/installation",
  "/docs/contributing": "/docs/project/contributing",
  "/docs/project/development": "/docs/project/contributing",
  "/docs/project/licensing": "/docs/project/license",
  "/docs/runtime/configuration": "/docs/runtime/bunfig",
  "/docs/runtime/hot": "/docs/runtime/watch-mode",
  "/docs/runtime/nodejs-apis": "/docs/runtime/nodejs-compat",
  "/docs/runtime/typescript": "/docs/typescript",
  "/docs/test/coverage": "/docs/test/code-coverage",
  "/docs/test/writing": "/docs/test/writing-tests",
  "/docs/pm/patch": "/docs/pm/cli/patch",
  "/docs/pm/registries": "/docs/pm/scopes-registries",
  "/docs/bundler/html": "/docs/bundler/fullstack",
  "/docs/bundler/vs-esbuild": "/docs/bundler/esbuild",
  "/docs/package-manager": "/docs/pm/cli/install",
  "/guides/install/from-npm-install-to-bun-install": "/docs/guides/install/from-npm-install-to-bun-install",
};
for (const api of [
  "csrf",
  "ffi",
  "file-io",
  "glob",
  "hashing",
  "markdown",
  "redis",
  "s3",
  "secrets",
  "sql",
  "utils",
  "workers",
  "yaml",
])
  routes[`/docs/api/${api}`] = `/docs/runtime/${api}`;
for (const guide of ["elysia", "express", "gel", "hono", "nextjs", "react"])
  routes[`/guides/ecosystem/${guide}`] = `/docs/guides/ecosystem/${guide}`;

export const HOME_DOCUMENTATION_ROUTES: Readonly<Record<string, string>> = routes;

export function homeDocumentationHref(href: string): string {
  const url = new URL(href, "https://bun.com/");
  if (url.origin !== "https://bun.com" || url.username || url.password) return href;
  const target = routes[url.pathname];
  if (target) return target + url.search + url.hash;
  if (["/docs", "/guides", "/blog"].includes(url.pathname)) return url.pathname + url.search + url.hash;
  return href;
}

export function adaptHomeDocumentationLinks(text: string): string {
  return text.replace(/"(\/(?:docs|guides|reference)(?:\/[^"\\]*)?)"/g, value =>
    JSON.stringify(homeDocumentationHref(JSON.parse(value))),
  );
}
