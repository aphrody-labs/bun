// SPDX-License-Identifier: Apache-2.0
import type { ChromeAPI } from "./browser-api";
declare const chrome: ChromeAPI;
chrome.runtime.onInstalled.addListener(() => {
  void (async () => {
    try {
      await chrome.storage.local.set({ installedVersion: chrome.runtime.getManifest().version });
    } catch {
      console.error("Aphrody extension could not persist installation metadata");
    }
  })();
});
