// SPDX-License-Identifier: Apache-2.0
import type { HTMLBundle } from "bun";
import { resolve } from "node:path";

export function pageRoutes(
  page: HTMLBundle,
  directory: string,
): Record<string, HTMLBundle | Response> {
  if (!page.files) return { "/": page };
  const routes: Record<string, Response> = {};
  for (const file of page.files) {
    const path = file.path === page.index ? "/" : new URL(file.path, "http://localhost/").pathname;
    routes[path] = new Response(Bun.file(resolve(directory, file.path)), { headers: file.headers });
  }
  return routes;
}
