#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
import { resolve } from "node:path";
import { getDashBrowserAssetPath, inspectDashManifest } from "../../packages/bun-video/src/dash";
import { loadHarCapture } from "../../packages/bun-video/src/har";

export function prepareCapturedDash(xml: string, baseURL: string, localRoot: string) {
  const summary = inspectDashManifest(xml);
  if (
    summary.segmentTemplateCount ||
    /<(?:\w+:)?(?:SegmentList|Location|PatchLocation|UTCTiming|ContentSteering|Laurl|License)\b/i.test(
      xml,
    )
  )
    throw new Error("This offline dashboard supports captured BaseURL/SegmentBase MPDs only.");
  const resources: string[] = [];
  const decode = (text: string) =>
    text.replace(/&(?:amp|quot|apos|lt|gt|#\d+|#x[\da-f]+);/gi, (value) => {
      const named: Record<string, string> = {
        "&amp;": "&",
        "&quot;": '"',
        "&apos;": "'",
        "&lt;": "<",
        "&gt;": ">",
      };
      if (named[value]) return named[value]!;
      const hex = /^&#x/i.test(value);
      return String.fromCodePoint(Number.parseInt(value.slice(hex ? 3 : 2, -1), hex ? 16 : 10));
    });
  const rewritten = xml.replace(
    /<((?:\w+:)?BaseURL)\b[^>]*>([^<]*)<\/\1\s*>/g,
    (_all, name: string, body: string) => {
      const decoded = decode(body.trim());
      if (!/^https?:\/\//i.test(decoded))
        throw new Error("Offline replay requires absolute captured BaseURLs.");
      const url = new URL(decoded, baseURL);
      if (
        !/^https?:$/.test(url.protocol) ||
        url.username ||
        url.password ||
        url.pathname.endsWith("/")
      )
        throw new Error("Unsupported captured media BaseURL.");
      const index = resources.push(url.href) - 1;
      return `<${name}>${localRoot}media/${index}</${name}>`;
    },
  );
  if (!resources.length) throw new Error("Captured DASH manifest has no replayable BaseURL.");
  const withoutNamespaces = rewritten.replace(/\sxmlns(?::[\w-]+)?\s*=\s*(["']).*?\1/g, "");
  if (
    /https?:\/\//i.test(decode(withoutNamespaces.replaceAll(localRoot, ""))) ||
    /\b(?:href|sourceURL|media|initialization)\s*=/i.test(withoutNamespaces)
  )
    throw new Error("Offline manifest contains unsupported external resource references.");
  return { manifest: rewritten, resources, summary };
}

export async function startDashLab(harPath: string) {
  const capture = await loadHarCapture(resolve(harPath));
  const descriptor = capture.selectManifest({ kind: "dash" });
  if (!descriptor) throw new Error("No captured DASH manifest is available.");
  const capability = crypto.randomUUID();
  const route = `/lab/${capability}/`;
  const browser = await Bun.build({
    entrypoints: [resolve(import.meta.dir, "../../packages/bun-video/src/dash.ts")],
    target: "browser",
    format: "esm",
    external: ["dashjs"],
  });
  if (!browser.success) throw new Error("DASH browser adapter build failed.");
  const html = await Bun.file(resolve(import.meta.dir, "dash-lab.html")).text();
  let prepared: ReturnType<typeof prepareCapturedDash>;
  let serverOrigin = "";
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      if (url.origin !== serverOrigin || !url.pathname.startsWith(route))
        return new Response(null, { status: 404 });
      const relative = url.pathname.slice(route.length);
      const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
      if (!relative)
        return new Response(html, {
          headers: {
            ...headers,
            "Content-Type": "text/html",
            "Content-Security-Policy":
              "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; media-src 'self' blob:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; frame-ancestors 'none'",
          },
        });
      if (relative === "dash.all.min.js")
        return new Response(Bun.file(getDashBrowserAssetPath()), {
          headers: { ...headers, "Content-Type": "text/javascript" },
        });
      if (relative === "adapter.js")
        return new Response(browser.outputs[0], {
          headers: { ...headers, "Content-Type": "text/javascript" },
        });
      if (relative === "dashboard.js")
        return new Response(dashboardCode, {
          headers: { ...headers, "Content-Type": "text/javascript" },
        });
      if (relative === "summary")
        return Response.json({
          ...prepared.summary,
          capturedOnly: true,
          playbackValidated: false,
          drmLicenseValidated: false,
        });
      if (relative === "manifest.mpd")
        return new Response(prepared.manifest, {
          headers: { ...headers, "Content-Type": "application/dash+xml" },
        });
      const match = /^media\/(\d+)$/.exec(relative);
      if (match) {
        const remoteURL = prepared.resources[Number(match[1])];
        if (!remoteURL) return new Response(null, { status: 404 });
        const resource = capture.resourceForUrl(remoteURL);
        const response = resource
          ? capture.replayResource(resource.entryIndex, request.headers.get("Range") ?? undefined)
          : null;
        return (
          response ??
          new Response("Requested range is absent from this offline capture.", {
            status: 404,
            headers,
          })
        );
      }
      return new Response(null, { status: 404 });
    },
  });
  serverOrigin = server.url.origin;
  try {
    // Only the server sees captured URLs; the browser receives capability routes.
    prepared = prepareCapturedDash(
      capture.readManifest(descriptor.entryIndex),
      "https://offline.invalid/",
      `${server.url.origin}${route}`,
    );
  } catch (error) {
    server.stop(true);
    throw error;
  }
  return { server, url: `${server.url.origin}${route}`, summary: prepared.summary };
}

const dashboardCode = `import { attachDashPlayback } from './adapter.js';
const video = document.querySelector('video');
const status = document.querySelector('#status');
const result = document.querySelector('#result');
const summary = await (await fetch('./summary')).json();
result.textContent = JSON.stringify(summary, null, 2);
status.textContent = summary.encrypted ? 'Capture chiffrée : aucune licence DRM fournie. La lecture reste non validée.' : 'Capture DASH claire. Lance la lecture pour tester les octets capturés.';
document.querySelector('button').onclick = async () => {
  try {
    await attachDashPlayback(video, { src: new URL('./manifest.mpd', location.href).href, autoplay: true,
      createPlayer: () => dashjs.MediaPlayer().create(),
      beforeStart(player) { player.on(dashjs.MediaPlayer.events.ERROR, event => { status.textContent = 'Erreur DASH locale (code ' + (Number(event.error?.code) || 0) + '). Plage absente ou licence requise ; lecture non validée.'; }); }
    });
  } catch { status.textContent = 'Initialisation DASH impossible ; lecture non validée.'; }
};
video.addEventListener('playing', () => { status.textContent = 'Le navigateur a commencé la lecture. Le test complet reste à qualifier.'; });
`;

if (import.meta.main) {
  const args = Bun.argv.slice(2);
  const index = args.indexOf("--har");
  const input =
    index < 0
      ? resolve(import.meta.dir, "../../tmp/test/www.crunchyroll.com.har")
      : args[index + 1];
  if (!input) throw new Error("--har requires a file path.");
  if (args.includes("--check")) {
    const capture = await loadHarCapture(resolve(input));
    const descriptor = capture.selectManifest({ kind: "dash" });
    if (!descriptor) throw new Error("No captured DASH manifest is available.");
    const prepared = prepareCapturedDash(
      capture.readManifest(descriptor.entryIndex),
      "https://offline.invalid/",
      "http://127.0.0.1/lab/check/",
    );
    console.log(
      JSON.stringify({
        capture: capture.summary,
        manifest: prepared.summary,
        localMediaResourceCount: prepared.resources.length,
        playbackValidated: false,
        drmLicenseValidated: false,
      }),
    );
  } else {
    const lab = await startDashLab(input);
    console.log(JSON.stringify({ url: lab.url, summary: lab.summary, playbackValidated: false }));
    if (args.includes("--open")) {
      const chrome = resolve(
        process.env.PROGRAMFILES ?? "C:/Program Files",
        "Google/Chrome/Application/chrome.exe",
      );
      if (await Bun.file(chrome).exists())
        Bun.spawn([chrome, lab.url], { stdout: "ignore", stderr: "ignore" }).unref();
    }
    process.on("SIGINT", () => lab.server.stop(true));
    process.on("SIGTERM", () => lab.server.stop(true));
  }
}
