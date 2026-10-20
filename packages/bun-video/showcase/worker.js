/** @param {Request} request @param {import('./worker-configuration').Env} env */
export async function serveShowcase(request, env) {
  if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  const url = new URL(request.url);
  let key;
  try { key = decodeURIComponent(url.pathname).slice(1) || 'index.html'; }
  catch { return new Response('Bad path', { status: 400 }); }
  if (!/^[a-zA-Z0-9/_.,-]+$/.test(key) || key.split('/').some(part => part === '..' || part === '.' || part.startsWith('.'))) return new Response('Not found', { status: 404 });
  const headers = new Headers({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self'; frame-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'",
    'Cache-Control': 'public, max-age=300',
  });
  try {
    const objectKey = `${env.SHOWCASE_PREFIX}/${key}`;
    if (request.method === 'HEAD') {
      const object = await env.SHOWCASE.head(objectKey);
      if (!object) return new Response('Not found', { status: 404, headers });
      object.writeHttpMetadata(headers); headers.set('ETag', object.httpEtag); headers.set('Content-Length', String(object.size));
      return new Response(null, { headers });
    }
    const range = request.headers.has('Range') ? request.headers : undefined;
    const object = await env.SHOWCASE.get(objectKey, { onlyIf: request.headers, ...(range ? { range } : {}) });
    if (!object) return new Response('Not found', { status: 404, headers });
    object.writeHttpMetadata(headers); headers.set('ETag', object.httpEtag); headers.set('Accept-Ranges', 'bytes');
    if (!('body' in object)) return new Response(null, { status: request.headers.has('If-Match') ? 412 : 304, headers });
    let status = 200;
    if (request.headers.has('Range') && object.range && 'offset' in object.range && 'length' in object.range) {
      status = 206;
      headers.set('Content-Range', `bytes ${object.range.offset}-${object.range.offset + object.range.length - 1}/${object.size}`);
      headers.set('Content-Length', String(object.range.length));
    } else headers.set('Content-Length', String(object.size));
    if (key.startsWith('sources/')) { headers.set('Content-Type', 'text/plain; charset=utf-8'); headers.set('Content-Disposition', 'attachment'); }
    return new Response(object.body, { status, headers });
  } catch (error) {
    console.error(JSON.stringify({ event: 'showcase-read-failed', name: error instanceof Error ? error.name : 'Error' }));
    return new Response('Temporarily unavailable', { status: 503, headers });
  }
}
export default { fetch: serveShowcase };
