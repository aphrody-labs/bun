// Maintenance page of rosegriffon.fr: the two images as assets, everything else 503 with the page.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/bg.webp" || url.pathname === "/logo.webp") {
      const asset = await env.ASSETS.fetch(request);
      const res = new Response(asset.body, asset);
      res.headers.set("Cache-Control", "public, max-age=86400");
      return res;
    }
    const page = await env.ASSETS.fetch(new URL("/index.html", url));
    return new Response(page.body, {
      status: 503,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Retry-After": "3600",
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex",
      },
    });
  },
} satisfies ExportedHandler<{ ASSETS: Fetcher }>;
