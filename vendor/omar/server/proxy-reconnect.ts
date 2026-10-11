#!/usr/bin/env bun
/** Keep the user-scoped Japan SOCKS forward alive for Aphrody Web and Shenron crawl clients. */
import { connect } from "node:net";
import "./japan-http-proxy.ts";

const listenHost = "127.0.0.1";
const proxyPort = 11080;
const httpProxyPort = 11081;
const healthPort = 8801;
const bunExe = "C:/Windows/System32/bun.exe";
const userHome = "C:/Users/omara";
const sshArgs = [
  "ssh",
  "forward",
  "--native",
  "--identity",
  `${userHome}/.ssh/id_ed25519`,
  "--login",
  "omar",
  "-L",
  `${listenHost}:${proxyPort}:127.0.0.1:1080`,
  "-o",
  "ExitOnForwardFailure=yes",
  "-o",
  "ServerAliveInterval=30",
  "-o",
  "ServerAliveCountMax=3",
  "-o",
  "BatchMode=yes",
  "-o",
  "StrictHostKeyChecking=yes",
  "-o",
  `UserKnownHostsFile=${userHome}/.ssh/known_hosts`,
  "10.200.77.1",
];

let child: ReturnType<typeof Bun.spawn> | undefined;
let stopping = false;
let restartCount = 0;
const proxyReady = () =>
  new Promise<boolean>((resolve) => {
    let pending = 2;
    let ready = true;
    const done = (ok: boolean) => {
      ready &&= ok;
      if (--pending === 0) resolve(ready);
    };
    for (const port of [proxyPort, httpProxyPort]) {
      const socket = connect({ host: listenHost, port });
      socket.setTimeout(800);
      socket.once("connect", () => { socket.destroy(); done(true); });
      socket.once("timeout", () => { socket.destroy(); done(false); });
      socket.once("error", () => done(false));
    }
  });

const health = Bun.serve({
  hostname: listenHost,
  port: healthPort,
  async fetch(request) {
    if (new URL(request.url).pathname !== "/health") return new Response("Not found", { status: 404 });
    const ready = await proxyReady();
    return Response.json(
      { service: "japan-crawl-proxy", ready, socks: `${listenHost}:${proxyPort}`, http: `http://${listenHost}:${httpProxyPort}`, restartCount },
      { status: ready ? 200 : 503, headers: { "Cache-Control": "no-store" } },
    );
  },
});

async function superviseSsh() {
  let delay = 1_000;
  while (!stopping) {
    try {
      child = Bun.spawn({
        cmd: [bunExe, ...sshArgs],
        env: { ...process.env, USERPROFILE: userHome, HOME: userHome },
        stdin: "ignore",
        stdout: "ignore",
        stderr: "inherit",
        windowsHide: true,
      });
      const code = await child.exited;
      child = undefined;
      if (stopping) break;
      restartCount++;
      console.error(JSON.stringify({ event: "ssh-exited", code, restartCount }));
    } catch (error) {
      child = undefined;
      if (stopping) break;
      restartCount++;
      console.error(JSON.stringify({ event: "ssh-start-failed", error: String(error), restartCount }));
    }
    await Bun.sleep(delay);
    delay = Math.min(30_000, delay * 2);
  }
}

function stop() {
  if (stopping) return;
  stopping = true;
  child?.kill();
  health.stop(true);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
await superviseSsh();
