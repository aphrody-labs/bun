// SPDX-License-Identifier: Apache-2.0
const worker = `const offline = '<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Aphrody hors connexion</title><main><h1>Aphrody</h1><p>Reconnectez-vous pour accéder à la recherche et aux services en ligne.</p><a href="/">Réessayer</a></main></html>';
self.addEventListener('install', event => { event.waitUntil(self.skipWaiting()); });
self.addEventListener('activate', event => { event.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || event.request.mode !== 'navigate' || url.origin !== self.location.origin || url.pathname.startsWith('/auth/') || url.pathname.startsWith('/api/') || url.search) return;
  event.respondWith(fetch(event.request).catch(() => new Response(offline, {headers: {'content-type':'text/html; charset=utf-8','cache-control':'no-store'}})));
});`;
const registration = `if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('/service-worker.js', {scope:'/'}).catch(() => {});`;

export function publicPwaResponse(request: Request) {
  const path = new URL(request.url).pathname;
  if (!["/manifest.webmanifest", "/service-worker.js", "/pwa-register.js"].includes(path)) return null;
  if (!["GET", "HEAD"].includes(request.method))
    return new Response(null, { status: 405, headers: { allow: "GET, HEAD" } });
  const manifest = {
    id: "/",
    name: "Aphrody",
    short_name: "Aphrody",
    lang: "fr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#7e4d7c",
    icons: [
      { src: "/_app-ui/fonts/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/_app-ui/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
  return new Response(
    request.method === "HEAD"
      ? null
      : path === "/manifest.webmanifest"
        ? JSON.stringify(manifest)
        : path === "/service-worker.js"
          ? worker
          : registration,
    {
      headers: {
        "content-type":
          path === "/manifest.webmanifest" ? "application/manifest+json" : "text/javascript; charset=utf-8",
        "cache-control": "no-cache",
        "x-content-type-options": "nosniff",
        ...(path === "/service-worker.js" ? { "service-worker-allowed": "/" } : {}),
      },
    },
  );
}
