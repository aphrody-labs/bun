// SPDX-License-Identifier: Apache-2.0
import { connect } from "bun:chromium";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { startQualificationProxy } from "./qualify-tls-proxy";

const origin = process.env.SITE_QUALIFY_ORIGIN;
const executable = process.env.SITE_QUALIFY_CHROME;
if (!origin || !executable) throw new Error("Explicit SITE_QUALIFY_ORIGIN and SITE_QUALIFY_CHROME required");
const url = new URL(origin);
if (!["http:", "https:"].includes(url.protocol) || url.username || url.password)
  throw new Error("Invalid qualification origin");
const output = join(import.meta.dir, "../../../build/site-qualification");
async function canonicalBrowser() {
  const pin = process.env.SITE_QUALIFY_TLS_PIN;
  if (pin && (url.origin !== "https://aphrody.com" || !/^[A-Za-z0-9+/]{43}=$/.test(pin)))
    throw new Error("Qualification requires the exact canonical origin and certificate pin");
  const profile = join(output, "tls-profile-" + crypto.randomUUID());
  await mkdir(profile, { recursive: true });
  const child = Bun.spawn({
    cmd: [
      executable!,
      "--headless=new",
      "--no-first-run",
      "--no-default-browser-check",
      "--remote-debugging-address=127.0.0.1",
      "--remote-debugging-port=0",
      "--user-data-dir=" + profile,
      ...(pin
        ? [
            "--host-resolver-rules=MAP aphrody.com 127.0.0.1",
            "--no-proxy-server",
            "--ignore-certificate-errors-spki-list=" + pin,
          ]
        : []),
      "about:blank",
    ],
    stdout: "ignore",
    stderr: Bun.file(join(profile, "browser.stderr.log")),
  });
  try {
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) throw new Error("Qualification Chrome exited");
      const portFile = Bun.file(join(profile, "DevToolsActivePort"));
      if (await portFile.exists()) {
        const [port, path] = (await portFile.text()).trim().split(/\r?\n/);
        if (/^\d+$/.test(port!) && path?.startsWith("/devtools/browser/")) {
          const connection = await connect(`ws://127.0.0.1:${port}${path}`, { timeout: 15000 });
          return {
            connection,
            async close() {
              await connection.send("Browser.close").catch(() => {});
              connection.close();
              if (child.exitCode === null) child.kill();
              child.unref();
            },
          };
        }
      }
      await Bun.sleep(50);
    }
    throw new Error("Qualification Chrome endpoint deadline exceeded");
  } catch (error) {
    if (child.exitCode === null) child.kill();
    child.unref();
    throw error;
  }
}
const proxy = process.env.SITE_QUALIFY_TLS_PIN ? startQualificationProxy() : undefined;
let browser: Awaited<ReturnType<typeof canonicalBrowser>> | undefined;
const receipts: unknown[] = [];
try {
  browser = await canonicalBrowser();
  const connection = browser.connection;
  const version = await connection.send("Browser.getVersion");
  const { targetId } = await connection.send<{ targetId: string }>("Target.createTarget", {
    url: "about:blank",
  });
  const { sessionId } = await connection.send<{ sessionId: string }>("Target.attachToTarget", {
    targetId,
    flatten: true,
  });
  await connection.send("Page.enable", {}, sessionId);
  await connection.send("Runtime.enable", {}, sessionId);
  await connection.send("Network.enable", {}, sessionId);
  await connection.send("DOM.enable", {}, sessionId);
  await connection.send("CSS.enable", {}, sessionId);
  let documentStatus = 0;
  const removeNetwork = connection.on("Network.responseReceived", (event, source) => {
    const response = event as { type?: string; response?: { status: number } };
    if (source === sessionId && response.type === "Document") documentStatus = response.response?.status ?? 0;
  });
  const exceptions: unknown[] = [];
  const remove = connection.on("Runtime.exceptionThrown", (event, source) => {
    if (source === sessionId) exceptions.push(event);
  });
  for (const [label, width, height] of [
    ["desktop", 1365, 900],
    ["mobile", 390, 844],
  ] as const) {
    await connection.send(
      "Emulation.setDeviceMetricsOverride",
      { width, height, deviceScaleFactor: 1, mobile: label === "mobile" },
      sessionId,
    );
    for (const route of [
      "/",
      "/docs",
      "/templates",
      "/material-3",
      "/studio",
      "/chat",
      "/models",
      "/creator",
      "/admin",
      "/settings",
    ]) {
      documentStatus = 0;
      const loaded = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          dispose();
          reject(new Error(`Page load deadline: ${route}`));
        }, 30000);
        const dispose = connection.on("Page.loadEventFired", (_, source) => {
          if (source !== sessionId) return;
          clearTimeout(timer);
          dispose();
          resolve();
        });
      });
      const navigation = await connection.send<{ errorText?: string }>(
        "Page.navigate",
        { url: new URL(route, url).href },
        sessionId,
      );
      if (navigation.errorText) throw new Error(navigation.errorText);
      await loaded;
      if (documentStatus < 200 || documentStatus >= 400)
        throw new Error(`HTTP ${documentStatus} for real page ${route}`);
      const result = await connection.send<{
        result: { value?: { title: string; text: string; overflow: boolean; font: boolean } };
        exceptionDetails?: unknown;
      }>(
        "Runtime.evaluate",
        {
          expression: `(async()=>{await document.fonts.ready;return {title:document.title,text:document.body.innerText.slice(0,2000),overflow:document.documentElement.scrollWidth>innerWidth+1,font:document.fonts.check('24px "Material Symbols Outlined"')}})()`,
          awaitPromise: true,
          returnByValue: true,
        },
        sessionId,
      );
      if (result.exceptionDetails || !result.result.value?.text || !result.result.value.title.trim())
        throw new Error(`Empty or failed real page: ${route}`);
      receipts.push({ label, route, status: documentStatus, ...result.result.value });
      if (route === "/") {
        if (url.protocol === "https:") {
          const pwa = await connection.send<{
            result: { value?: { secure: boolean; worker: string; icons: number[] } };
            exceptionDetails?: unknown;
          }>(
            "Runtime.evaluate",
            {
              expression: `(async()=>{const registration=await navigator.serviceWorker.ready;const response=await fetch('/manifest.webmanifest');if(!response.ok)throw Error('Manifest unavailable');const manifest=await response.json();const icons=await Promise.all(manifest.icons.map(async icon=>{const image=new Image();image.src=icon.src;await image.decode();return image.naturalWidth}));return {secure:isSecureContext,worker:registration.active?.scriptURL,icons}})()`,
              awaitPromise: true,
              returnByValue: true,
            },
            sessionId,
          );
          if (
            pwa.exceptionDetails ||
            !pwa.result.value?.secure ||
            pwa.result.value.worker !== `${url.origin}/service-worker.js` ||
            JSON.stringify(pwa.result.value.icons) !== "[192,512]"
          )
            throw new Error("Actual HTTPS PWA registration or image qualification failed");
          receipts.push({
            label,
            route,
            pwa: pwa.result.value,
            manifest: await connection.send("Page.getAppManifest", {}, sessionId),
          });
        }
        const fonts = await connection.send(
          "Runtime.evaluate",
          {
            expression: `JSON.stringify({body:getComputedStyle(document.body).fontFamily,article:getComputedStyle(document.querySelector('article')).fontFamily,input:getComputedStyle(document.querySelector('input')).fontFamily,plain:getComputedStyle(document.documentElement).getPropertyValue('--aphrody-font-plain'),brand:getComputedStyle(document.documentElement).getPropertyValue('--aphrody-font-brand'),faces:[...document.fonts].filter(x=>x.status==='loaded').map(x=>x.family)})`,
            returnByValue: true,
          },
          sessionId,
        );
        const document = await connection.send<{ root: { nodeId: number } }>("DOM.getDocument", {}, sessionId);
        const paragraph = await connection.send<{ nodeId: number }>(
          "DOM.querySelector",
          { nodeId: document.root.nodeId, selector: "article p" },
          sessionId,
        );
        const platformFonts = await connection.send(
          "CSS.getPlatformFontsForNode",
          { nodeId: paragraph.nodeId },
          sessionId,
        );
        receipts.push({ label, route, fonts, platformFonts });
        const screenshot = await connection.send<{ data: string }>(
          "Page.captureScreenshot",
          { format: "png", captureBeyondViewport: false },
          sessionId,
        );
        await Bun.write(join(output, `${label}.png`), Buffer.from(screenshot.data, "base64"));
      }
    }
  }
  remove();
  removeNetwork();
  await Bun.write(
    join(output, "receipt.json"),
    JSON.stringify(
      {
        date: new Date().toISOString(),
        origin: url.origin,
        browser: version,
        bun: Bun.revision,
        receipts,
        exceptions,
      },
      null,
      2,
    ),
  );
  if (exceptions.length)
    throw new Error(`${exceptions.length} uncaught real browser exceptions; inspect qualification receipt`);
  console.log(JSON.stringify({ pages: receipts.length, exceptions: exceptions.length, output }));
} finally {
  await browser?.close();
  proxy?.stop(true);
}
