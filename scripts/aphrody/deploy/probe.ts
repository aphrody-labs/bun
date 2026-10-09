// Sonde HTTP loopback du fork Bun : charge utile du service Windows AphrodyBun et du rôle prod de l'image par défaut.
//   GET /healthz -> 200 "ok"      GET /version -> { version, revision, pid, uptimeSec, host }
import { hostname } from "node:os";

const port = Number(process.env.APHRODY_BUN_SERVICE_PORT ?? 47660);
const started = Date.now();

Bun.serve({
  hostname: "127.0.0.1",
  port,
  fetch(req) {
    const path = new URL(req.url).pathname;
    if (path === "/healthz") return new Response("ok");
    if (path === "/version")
      return Response.json({
        version: Bun.version,
        revision: Bun.revision,
        pid: process.pid,
        uptimeSec: Math.round((Date.now() - started) / 1000),
        host: hostname(),
      });
    return new Response("not found", { status: 404 });
  },
});
