// SPDX-License-Identifier: Apache-2.0
export async function searchPage(request: Request, api: (request: Request) => Promise<Response>) {
  const url = new URL(request.url);
  if (url.pathname !== "/" || !url.searchParams.has("q")) return null;
  if (request.method !== "GET") return new Response(null, { status: 405, headers: { allow: "GET" } });
  if (url.searchParams.getAll("q").length !== 1) return new Response("Invalid search query", { status: 400 });
  const query = url.searchParams.get("q") ?? "";
  const endpoint = new URL("/api/search", url);
  endpoint.searchParams.set("query", query);
  const response = await api(new Request(endpoint.href, { signal: request.signal }));
  const result = (await response.json()) as {
    organic?: Array<{ title: string; url: string; snippet: string }>;
  };
  const escape = Bun.escapeHTML;
  const results =
    response.ok && Array.isArray(result.organic)
      ? result.organic
          .map(
            hit =>
              `<section class="p-4"><h2 class="text-title-large"><a href="${escape(hit.url)}" rel="noreferrer">${escape(hit.title)}</a></h2><p class="text-body-large">${escape(hit.snippet)}</p></section>`,
          )
          .join("")
      : '<p role="status">La recherche est momentanément indisponible. Réessayez plus tard.</p>';
  return new Response(
    `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(query)} — Aphrody</title><link rel="stylesheet" href="/_app-ui/app.css"><link rel="stylesheet" href="/_app-ui/google-public-theme.css"></head><body><article aria-labelledby="aphrody-home-title"><section class="p-4"><h1 id="aphrody-home-title" class="text-headline-large"><a href="/">Aphrody</a></h1><form action="/" method="get"><label for="query">Rechercher sur le Web</label><input id="query" name="q" value="${escape(query)}" maxlength="1024" required><button type="submit">Rechercher</button></form><nav><a href="/docs">Documentation</a> · <a href="/templates">Templates</a> · <a href="/auth/google/login">Connexion Google</a></nav>${results || "<p>Aucun résultat.</p>"}</section></article></body></html>`,
    {
      status: response.status,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        "referrer-policy": "no-referrer",
        "content-security-policy":
          "default-src 'none'; style-src 'self'; font-src 'self' https://assets.aphrody.app; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      },
    },
  );
}
