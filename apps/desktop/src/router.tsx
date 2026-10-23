// SPDX-License-Identifier: Apache-2.0
import React from "react";
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Link,
  type AnyRoute,
} from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { worksQuery } from "./lib/api";
import { AppShell } from "./shell/AppShell";
import { Hub } from "./pages/Hub";

export interface RouterContext {
  queryClient: QueryClient;
}

function NotFound() {
  return (
    <section className="page">
      <h1>Page introuvable</h1>
      <p>Ce chemin n’existe pas dans l’application.</p>
      <Link to="/" className="btn filled">
        Retour à l’accueil
      </Link>
    </section>
  );
}

function RouteError({ error, reset }: { error: unknown; reset: () => void }) {
  return (
    <section className="page" role="alert">
      <h1>Impossible d’afficher cette page</h1>
      <p>{error instanceof Error ? error.message : String(error)}</p>
      <button type="button" className="btn filled" onClick={reset}>
        Réessayer
      </button>
    </section>
  );
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: AppShell,
  notFoundComponent: NotFound,
  errorComponent: RouteError,
});

const text = (value: unknown) => (typeof value === "string" && value ? value : undefined);
const number = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : undefined);
const loadWorks = ({ context }: { context: RouterContext }): Promise<void> =>
  context.queryClient.ensureQueryData(worksQuery).then(() => undefined);

const hubRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: Hub });
const osRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "os",
  component: lazyRouteComponent(() => import("./pages/Os"), "OsPage"),
});
const videoRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "video",
  validateSearch: (search: Record<string, unknown>) => ({ q: text(search.q), e: text(search.e) }),
  loader: loadWorks,
  component: lazyRouteComponent(() => import("./pages/video/VideoHome"), "VideoHome"),
});
const watchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "video/watch",
  validateSearch: (search: Record<string, unknown>) => ({ v: text(search.v), t: number(search.t), theater: search.theater === true || search.theater === "true" ? true : undefined }),
  loader: loadWorks,
  component: lazyRouteComponent(() => import("./pages/video/Watch"), "WatchPage"),
});
const seriesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "video/series",
  validateSearch: (search: Record<string, unknown>) => ({ s: text(search.s) }),
  loader: loadWorks,
  component: lazyRouteComponent(() => import("./pages/video/Series"), "SeriesPage"),
});
const shortsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "video/shorts",
  validateSearch: (search: Record<string, unknown>) => ({ v: text(search.v) }),
  loader: loadWorks,
  component: lazyRouteComponent(() => import("./pages/video/Shorts"), "ShortsPage"),
});
const studioRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "video/studio",
  validateSearch: (search: Record<string, unknown>) => ({ v: text(search.v), vs: text(search.vs) }),
  loader: loadWorks,
  component: lazyRouteComponent(() => import("./pages/video/Studio"), "StudioPage"),
});
const toolsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "tools",
  validateSearch: (search: Record<string, unknown>) => ({ f: text(search.f) }),
  component: lazyRouteComponent(() => import("./pages/Tools"), "ToolsPage"),
});
const m3Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "m3",
  component: lazyRouteComponent(() => import("./pages/M3Gallery"), "M3Gallery"),
});

const routeTree = rootRoute.addChildren([
  hubRoute,
  osRoute,
  videoRoute,
  watchRoute,
  seriesRoute,
  shortsRoute,
  studioRoute,
  toolsRoute,
  m3Route,
] as AnyRoute[]);

export function createAppRouter(queryClient: QueryClient) {
  return createRouter({
    routeTree,
    context: { queryClient },
    defaultPreloadStaleTime: 0,
    scrollRestoration: true,
    defaultNotFoundComponent: NotFound,
    defaultErrorComponent: RouteError,
  });
}

export type AppRouter = ReturnType<typeof createAppRouter>;

declare module "@tanstack/react-router" {
  interface Register {
    router: AppRouter;
  }
}
