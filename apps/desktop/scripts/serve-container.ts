#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
import type { WebOSServer, WebOSOptions } from "../server";

const port = Number(process.env.WEBOS_PORT ?? "3000");
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("Invalid WEBOS_PORT");
const { startWebOS } = (await import(new URL("../dist/server.js", import.meta.url).href)) as {
  startWebOS(options: WebOSOptions): Promise<WebOSServer>;
};
const server = await startWebOS({
  hostname: "0.0.0.0",
  port,
  development: false,
  hostAccess: false,
  root: "/tmp/webos/home",
  dataDir: "/tmp/webos/state",
});
console.log(JSON.stringify({ service: "bun-webos", url: server.url, hostAccess: false, bun: Bun.version }));
let stopping = false;
const stop = async () => {
  if (stopping) return;
  stopping = true;
  await server.stop(true);
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
