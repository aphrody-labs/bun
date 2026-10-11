// SPDX-License-Identifier: Apache-2.0
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { build } from "./runtime.ts";

const dataDir = join(
  process.env.LOCALAPPDATA ?? process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"),
  "bun-m3-native-app",
);
const notePath = join(dataDir, "note.txt");
await mkdir(dataDir, { recursive: true });
await build();

const dist = new URL("./dist/", import.meta.url);
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      const origin = request.headers.get("origin");
      const referer = request.headers.get("referer");
      const refererOrigin = URL.canParse(referer ?? "")
        ? new URL(referer!).origin
        : "";
      const sameOrigin = origin === server.url.origin || refererOrigin === server.url.origin;
      if (!sameOrigin) return new Response("Origine refusée", { status: 403 });
    }
    if (url.pathname === "/api/note" && request.method === "GET") {
      const file = Bun.file(notePath);
      return Response.json({ text: (await file.exists()) ? await file.text() : "Bonjour depuis Bun." });
    }
    if (url.pathname === "/api/note" && request.method === "PUT") {
      const text = await request.text();
      if (text.length > 4096) return new Response("Note trop longue (4096 caractères maximum).", { status: 413 });
      await Bun.write(notePath, text);
      return new Response(null, { status: 204 });
    }
    if (url.pathname === "/api/windows" && request.method === "GET") {
      if (process.platform !== "win32") return Response.json({ available: false, platform: process.platform });
      try {
        const windows = await import("bun:windows");
        return Response.json({ available: true, exports: Object.keys(windows).slice(0, 12) });
      } catch {
        return Response.json({ available: false, platform: process.platform });
      }
    }
    const path = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1));
    if (path.includes("..") || path.includes("\\")) return new Response("Introuvable", { status: 404 });
    const file = Bun.file(new URL(path, dist));
    return (await file.exists()) ? new Response(file) : new Response("Introuvable", { status: 404 });
  },
});

const view = new Bun.WebView({ backend: "chrome", headless: false, width: 1120, height: 760 });
const { promise: detached, resolve } = Promise.withResolvers<void>();
view.addEventListener("Target.detachedFromTarget", () => resolve());
process.once("SIGINT", () => view.close());
process.once("SIGTERM", () => view.close());

try {
  await view.navigate(server.url.href);
  await detached;
} finally {
  view.close();
  await server.stop(true);
}
