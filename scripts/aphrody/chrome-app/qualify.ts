// SPDX-License-Identifier: Apache-2.0
import { connect } from "bun:chromium";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { schemeColors } from "./generate";

const root = join(import.meta.dir, "../../../build/chrome-app");
const executable = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const profile = join(root, "qualification-profile-" + crypto.randomUUID());
const receiptPath = join(root, "qualification.json");
const generated = await Bun.file(join(root, "receipt.json")).json();
const expectedBackground = `rgb(${schemeColors(await Bun.file(join(root, "extension/app.css")).text()).ntp_background.join(", ")})`;
const receipt: Record<string, unknown> = {
  schemaVersion: 1,
  createdAt: new Date().toISOString(),
  executable,
  profile,
  generatedExtensionId: generated.extensionId,
  browserQualified: false,
  themeQualified: false,
  privateExportQualified: false,
  installedInOwnerProfile: false,
};
for (const [path, expected] of Object.entries(generated.files)) {
  const hash = new Bun.CryptoHasher("sha256").update(await Bun.file(path).arrayBuffer()).digest("hex");
  if (hash !== expected) throw new Error("Generated artifact changed: " + path);
}
await mkdir(profile, { recursive: true });
const process = Bun.spawn({
  cmd: [
    executable,
    "--headless=new",
    "--no-first-run",
    "--no-default-browser-check",
    "--remote-debugging-address=127.0.0.1",
    "--remote-debugging-port=0",
    "--enable-unsafe-extension-debugging",
    "--user-data-dir=" + profile,
    "about:blank",
  ],
  stdout: "ignore",
  stderr: Bun.file(join(profile, "browser.stderr.log")),
});
let connection: Awaited<ReturnType<typeof connect>> | undefined;
try {
  const deadline = Date.now() + 30000;
  let endpoint: string | undefined;
  while (!endpoint) {
    const activePort = Bun.file(join(profile, "DevToolsActivePort"));
    if (process.exitCode !== null) throw new Error("Synthetic Chrome exited: " + process.exitCode);
    if (Date.now() > deadline) throw new Error("Synthetic Chrome debugging endpoint timed out");
    if (await activePort.exists()) {
      const [port, browserPath] = (await activePort.text()).trim().split(/\r?\n/);
      if (/^\d+$/.test(port!) && browserPath?.startsWith("/devtools/browser/"))
        endpoint = `ws://127.0.0.1:${port}${browserPath}`;
    }
    await Bun.sleep(50);
  }
  const connectDeadline = Date.now() + 10000;
  while (!connection) {
    try {
      connection = await connect(endpoint, { timeout: 3000 });
    } catch (error) {
      if (Date.now() > connectDeadline || process.exitCode !== null) throw error;
      await Bun.sleep(50);
    }
  }
  receipt.browser = await connection.send("Browser.getVersion");
  try {
    receipt.theme = await connection.send("Extensions.loadUnpacked", { path: join(root, "theme") });
    receipt.themeQualified = true;
  } catch (error) {
    receipt.themeError = error instanceof Error ? error.message : String(error);
  }
  const extension = await connection.send<{ id: string }>("Extensions.loadUnpacked", { path: join(root, "extension") });
  if (extension.id !== generated.extensionId) throw new Error("Loaded extension identity mismatch");
  receipt.extension = extension;
  receipt.extensions = await connection.send("Extensions.getExtensions");
  const { targetId } = await connection.send<{ targetId: string }>("Target.createTarget", {
    url: `chrome-extension://${extension.id}/popup.html`,
  });
  const { sessionId } = await connection.send<{ sessionId: string }>("Target.attachToTarget", {
    targetId,
    flatten: true,
  });
  await connection.send("Runtime.enable", {}, sessionId);
  const pageDeadline = Date.now() + 15000;
  let value: Record<string, unknown> | undefined;
  while (Date.now() < pageDeadline) {
    const result = await connection.send<{ result: { value?: Record<string, unknown> }; exceptionDetails?: unknown }>(
      "Runtime.evaluate",
      {
        expression: `(async () => typeof chrome?.runtime?.getManifest === 'function' && document.querySelectorAll('[data-export]').length === 4 ? ({manifest:chrome.runtime.getManifest(), id:chrome.runtime.id, buttons:[...document.querySelectorAll('[data-export]')].map(x=>x.dataset.export), permissions:await chrome.permissions.getAll(), background:getComputedStyle(document.body).backgroundColor, oauth:document.querySelector('a[href*="/auth/google/login"]').href}) : null)()`,
        awaitPromise: true,
        returnByValue: true,
      },
      sessionId,
    );
    if (result.result.value?.background === expectedBackground) {
      value = result.result.value;
      break;
    }
    await Bun.sleep(50);
  }
  if (
    !value ||
    value.id !== extension.id ||
    JSON.stringify(value.buttons) !== '["bookmarks","history","tabs","sessions"]'
  )
    throw new Error("Loaded popup capability probe failed");
  receipt.popup = value;
  const { targetId: newTabId } = await connection.send<{ targetId: string }>("Target.createTarget", {
    url: "chrome://newtab/",
  });
  const { sessionId: newTabSession } = await connection.send<{ sessionId: string }>("Target.attachToTarget", {
    targetId: newTabId,
    flatten: true,
  });
  const newTabDeadline = Date.now() + 15000;
  while (true) {
    const newTab = await connection.send<{ result: { value?: string } }>(
      "Runtime.evaluate",
      { expression: "location.href", returnByValue: true },
      newTabSession,
    );
    if (newTab.result.value === `chrome-extension://${extension.id}/newtab.html`) {
      receipt.newTab = newTab.result.value;
      break;
    }
    if (Date.now() > newTabDeadline) throw new Error("Chrome did not apply the new-tab override");
    await Bun.sleep(50);
  }
  receipt.browserQualified = true;
  receipt.privateExportLimit =
    "Optional permissions require a separate real user gesture and native host installation; no original profile data accessed.";
  try {
    const permission = await connection.send<{ result: { value?: boolean }; exceptionDetails?: unknown }>(
      "Runtime.evaluate",
      {
        expression: "chrome.permissions.request({permissions:['bookmarks','nativeMessaging']})",
        userGesture: true,
        awaitPromise: true,
        returnByValue: true,
      },
      sessionId,
    );
    receipt.optionalPermission = permission;
    if (permission.result.value === true && !permission.exceptionDetails) {
      const result = await connection.send<{ result: { value?: Record<string, unknown> }; exceptionDetails?: unknown }>(
        "Runtime.evaluate",
        {
          expression: `(async () => {
            const fixture = {title:'Bun synthetic qualification',url:'http://127.0.0.1/bun-chrome-synthetic'};
            const bookmark = await chrome.bookmarks.create(fixture);
            const result = await chrome.runtime.sendNativeMessage('com.bun.aphrody',{schemaVersion:1,type:'export',kind:'bookmarks',items:[{id:bookmark.id,...fixture}]});
            await chrome.bookmarks.remove(bookmark.id);
            return result;
          })()`,
          awaitPromise: true,
          returnByValue: true,
        },
        sessionId,
      );
      const response = result.result.value as { ok?: boolean; receipt?: Record<string, unknown> } | undefined;
      const nativeReceipt = response?.receipt;
      if (
        result.exceptionDetails ||
        response?.ok !== true ||
        nativeReceipt?.schemaVersion !== 1 ||
        nativeReceipt?.sourceExtensionId !== extension.id ||
        nativeReceipt?.kind !== "bookmarks" ||
        nativeReceipt?.count !== 1 ||
        !/^[a-f0-9-]{36}$/i.test(String(nativeReceipt?.batchId)) ||
        !Number.isFinite(Date.parse(String(nativeReceipt?.createdAt))) ||
        !/^[a-f0-9]{64}$/i.test(String(nativeReceipt?.sha256))
      )
        throw new Error("Native host receipt did not match synthetic export");
      receipt.nativeExport = nativeReceipt;
      receipt.privateExportQualified = true;
      delete receipt.privateExportLimit;
    }
  } catch (error) {
    receipt.privateExportError = error instanceof Error ? error.message : String(error);
  }
} catch (error) {
  receipt.error = error instanceof Error ? error.message : String(error);
} finally {
  if (connection) {
    await connection.send("Browser.close").catch(() => {});
    connection.close();
  }
  if (process.exitCode === null) process.kill();
  process.unref();
  await Bun.write(receiptPath, JSON.stringify(receipt, null, 2) + "\n");
}
console.log(JSON.stringify(receipt, null, 2));
if (!receipt.browserQualified) throw new Error(String(receipt.error || "Chrome app qualification failed"));
