/** @param {Request} request @param {import('./worker-configuration').Env} env */
export async function serveShowcase(request, env, fetcher = fetch) {
  const url = new URL(request.url);
  if (url.pathname === "/api/youtube/search") return searchYouTube(request, env, fetcher);
  if (!["GET", "HEAD"].includes(request.method))
    return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  let key;
  try {
    key = decodeURIComponent(url.pathname).slice(1) || "index.html";
  } catch {
    return new Response("Bad path", { status: 400 });
  }
  if (
    !/^[a-zA-Z0-9/_.,-]+$/.test(key) ||
    key.split("/").some(part => part === ".." || part === "." || part.startsWith("."))
  )
    return new Response("Not found", { status: 404 });
  if (["shorts", "watch", "studio", "about", "playlist/saved"].includes(key)) key = "index.html";
  const headers = new Headers({
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Content-Security-Policy":
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://i.ytimg.com https://yt3.ggpht.com; media-src 'self'; frame-src 'self' https://www.youtube-nocookie.com; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'",
    "Cache-Control": "public, max-age=300",
  });
  try {
    const objectKey = `${env.SHOWCASE_PREFIX}/${key}`;
    if (request.method === "HEAD") {
      const object = await env.SHOWCASE.head(objectKey);
      if (!object) return new Response("Not found", { status: 404, headers });
      object.writeHttpMetadata(headers);
      headers.set("ETag", object.httpEtag);
      headers.set("Content-Length", String(object.size));
      return new Response(null, { headers });
    }
    const range = request.headers.has("Range") ? request.headers : undefined;
    const object = await env.SHOWCASE.get(objectKey, { onlyIf: request.headers, ...(range ? { range } : {}) });
    if (!object) return new Response("Not found", { status: 404, headers });
    object.writeHttpMetadata(headers);
    headers.set("ETag", object.httpEtag);
    headers.set("Accept-Ranges", "bytes");
    if (!("body" in object))
      return new Response(null, { status: request.headers.has("If-Match") ? 412 : 304, headers });
    let status = 200;
    if (request.headers.has("Range") && object.range && "offset" in object.range && "length" in object.range) {
      status = 206;
      headers.set(
        "Content-Range",
        `bytes ${object.range.offset}-${object.range.offset + object.range.length - 1}/${object.size}`,
      );
      headers.set("Content-Length", String(object.range.length));
    } else headers.set("Content-Length", String(object.size));
    if (key.startsWith("sources/")) {
      headers.set("Content-Type", "text/plain; charset=utf-8");
      headers.set("Content-Disposition", "attachment");
    }
    return new Response(object.body, { status, headers });
  } catch (error) {
    console.error(
      JSON.stringify({ event: "showcase-read-failed", name: error instanceof Error ? error.name : "Error" }),
    );
    return new Response("Temporarily unavailable", { status: 503, headers });
  }
}

/** @param {Request} request @param {import('./worker-configuration').Env} env @param {typeof fetch} fetcher */
export async function searchYouTube(request, env, fetcher = fetch) {
  const headers = {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  };
  if (request.method !== "GET")
    return Response.json({ error: "method_not_allowed" }, { status: 405, headers: { ...headers, Allow: "GET" } });
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() ?? "";
  if (query.length < 2 || query.length > 180 || /[\x00-\x1f\x7f]/.test(query))
    return Response.json({ error: "invalid_query" }, { status: 400, headers });
  if (!env.YOUTUBE_API_KEY)
    return Response.json({ error: "youtube_search_unavailable" }, { status: 503, headers });
  if (env.YOUTUBE_SEARCH_LIMITER) {
    try {
      const { success } = await env.YOUTUBE_SEARCH_LIMITER.limit({
        key: request.headers.get("CF-Connecting-IP") ?? "anonymous",
      });
      if (!success)
        return Response.json({ error: "rate_limited" }, { status: 429, headers: { ...headers, "Retry-After": "60" } });
    } catch {
      return Response.json({ error: "youtube_search_unavailable" }, { status: 503, headers });
    }
  }
  try {
    const endpoint = new URL("https://www.googleapis.com/youtube/v3/search");
    endpoint.search = new URLSearchParams({
      key: env.YOUTUBE_API_KEY,
      part: "snippet",
      type: "video",
      safeSearch: "strict",
      maxResults: "12",
      q: query,
    }).toString();
    const response = await fetcher(endpoint, { signal: AbortSignal.timeout(8000), redirect: "error" });
    if (!response.ok) return Response.json({ error: "youtube_search_failed" }, { status: 502, headers });
    const payload = await response.json();
    const items = Array.isArray(payload?.items) ? payload.items : [];
    const videos = items.flatMap(item => {
      const id = item?.id?.videoId;
      const snippet = item?.snippet;
      if (typeof id !== "string" || !/^[A-Za-z0-9_-]{11}$/.test(id) || !snippet || typeof snippet.title !== "string")
        return [];
      const thumbnail = snippet.thumbnails?.medium?.url ?? snippet.thumbnails?.default?.url;
      return [{
        id,
        title: snippet.title.slice(0, 300),
        description: typeof snippet.description === "string" ? snippet.description.slice(0, 1000) : "",
        channelTitle: typeof snippet.channelTitle === "string" ? snippet.channelTitle.slice(0, 200) : "YouTube",
        publishedAt: typeof snippet.publishedAt === "string" ? snippet.publishedAt : null,
        ...(typeof thumbnail === "string" && /^https:\/\/(i\.ytimg\.com|yt3\.ggpht\.com)\//.test(thumbnail)
          ? { thumbnail }
          : {}),
      }];
    });
    return Response.json({ source: "YouTube", attribution: "Résultats fournis par YouTube", videos }, { headers });
  } catch {
    return Response.json({ error: "youtube_search_unavailable" }, { status: 503, headers });
  }
}

export default { fetch: serveShowcase };
