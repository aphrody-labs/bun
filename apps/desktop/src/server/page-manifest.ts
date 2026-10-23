// SPDX-License-Identifier: Apache-2.0
import type { HTMLBundle } from "bun";
import { resolve } from "node:path";

/** Client-routed pages of the unified app: every one of these answers with the same HTML shell. */
export const SHELL_PATHS = [
  "/os",
  "/os/*",
  "/video",
  "/video/*",
  "/tools",
  "/tools/*",
  "/m3",
  "/m3/*",
] as const;

export function pageRoutes(
  page: HTMLBundle,
  directory: string,
  shellPaths: readonly string[] = [],
): Record<string, HTMLBundle | Response> {
  if (!page.files) return { "/": page, ...Object.fromEntries(shellPaths.map(path => [path, page])) };
  const routes: Record<string, Response> = {};
  for (const file of page.files) {
    const path = file.path === page.index ? "/" : new URL(file.path, "http://localhost/").pathname;
    routes[path] = new Response(Bun.file(resolve(directory, file.path)), { headers: file.headers });
    // Each shell path gets its own Response: a body can only be read once.
    if (file.path === page.index)
      for (const shell of shellPaths)
        routes[shell] = new Response(Bun.file(resolve(directory, file.path)), { headers: file.headers });
  }
  return routes;
}
