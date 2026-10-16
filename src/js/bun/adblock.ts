// Brave adblock-rust engine (MPL-2.0), absorbed as the `bun_adblock` crate.
type Engine = import("bun:adblock").Engine;

const Engine = $newRustFunction("adblock.rs", "jsAdblockEngineConstructor", 0)();

const resourceTypes = {
  Document: "document",
  Stylesheet: "stylesheet",
  Image: "image",
  Media: "media",
  Font: "font",
  Script: "script",
  XHR: "xmlhttprequest",
  Fetch: "xmlhttprequest",
  WebSocket: "websocket",
  Ping: "ping",
};

// Chrome-protocol backends only: pauses every request through the Fetch domain and fails blocked ones.
async function attachWebView(view: Bun.WebView, engine: Engine): Promise<() => Promise<void>> {
  if (!(engine instanceof Engine)) throw $ERR_INVALID_ARG_TYPE("engine", "Engine", engine);
  if (!(view instanceof Bun.WebView)) throw $ERR_INVALID_ARG_TYPE("view", "Bun.WebView", view);
  const onPaused = (event: MessageEvent) => {
    const { requestId, request, resourceType } = event.data;
    let blocked = false;
    try {
      blocked = engine.check(request.url, view.url || request.url, resourceTypes[resourceType] ?? "other", request.method)
        .blocked;
    } catch {}
    const reply = blocked
      ? view.cdp("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" })
      : view.cdp("Fetch.continueRequest", { requestId });
    reply.catch(() => {});
  };
  view.addEventListener("Fetch.requestPaused", onPaused);
  try {
    await view.cdp("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
  } catch (error) {
    view.removeEventListener("Fetch.requestPaused", onPaused);
    throw error;
  }
  return async () => {
    view.removeEventListener("Fetch.requestPaused", onPaused);
    await view.cdp("Fetch.disable");
  };
}

export default { Engine, attachWebView };
