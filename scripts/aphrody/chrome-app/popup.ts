// SPDX-License-Identifier: Apache-2.0
import { projectExport, type ExportKind } from "./projection";
import type { ChromeAPI } from "./browser-api";
declare const chrome: ChromeAPI;
const status = document.querySelector<HTMLOutputElement>("output")!;
const permissions = { bookmarks: ["bookmarks"], history: ["history"], tabs: ["tabs"], sessions: ["sessions", "tabs"] };
for (const button of document.querySelectorAll<HTMLButtonElement>("button[data-export]")) {
  button.addEventListener("click", async () => {
    const kind = button.dataset.export as ExportKind;
    button.disabled = true;
    try {
      const granting = chrome.permissions.request({ permissions: [...permissions[kind], "nativeMessaging"] });
      if (!(await granting)) throw new Error("Permission declined; no data exported.");
      status.textContent = "Preparing private local export…";
      const source =
        kind === "bookmarks"
          ? await chrome.bookmarks.getRecent(500)
          : kind === "history"
            ? await chrome.history.search({ text: "", startTime: 0, maxResults: 200 })
            : kind === "tabs"
              ? await chrome.tabs.query({})
              : await chrome.sessions.getRecentlyClosed({ maxResults: 25 });
      const result = await chrome.runtime.sendNativeMessage("com.bun.aphrody", projectExport(kind, source));
      if (!result?.ok) throw new Error(result?.error || "Bun native host did not confirm export.");
      await chrome.storage.local.set({ lastExport: { kind, at: new Date().toISOString() } });
      status.textContent = "Private local export saved by Bun. Browser import remains a separate operation.";
    } catch (error) {
      status.textContent = "Export unavailable: " + (error instanceof Error ? error.message : String(error));
    } finally {
      button.disabled = false;
    }
  });
}
document.querySelector<HTMLFormElement>("form")!.addEventListener("submit", async event => {
  event.preventDefault();
  const query = document.querySelector<HTMLInputElement>("input[name=q]")!.value.trim();
  if (!query || new TextEncoder().encode(query).length > 1024) {
    status.textContent = "Enter a search query up to1024bytes.";
    return;
  }
  try {
    await chrome.tabs.create({ url: "https://aphrody.com/?q=" + encodeURIComponent(query) });
  } catch {
    status.textContent = "Could not open Aphrody search.";
  }
});
