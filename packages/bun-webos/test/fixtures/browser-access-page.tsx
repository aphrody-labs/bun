// SPDX-License-Identifier: Apache-2.0
import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserAccessApp } from "../../src/os/apps/BrowserAccessApp";
import { browserVfs } from "../../src/os/wasm/opfs-client";
import { PublicSearchApp } from "../../src/os/apps/PublicSearchApp";

let permissionCalls = 0;
Object.defineProperty(navigator, "mediaDevices", {
  value: {
    getUserMedia: async () => {
      permissionCalls++;
      throw new DOMException("Fixture denied", "NotAllowedError");
    },
  },
});
Object.defineProperty(navigator, "userActivation", { value: { isActive: false } });
Object.defineProperty(window, "fixturePermissionCalls", { get: () => permissionCalls });
Object.defineProperty(window, "fixtureBrowserVfs", { value: browserVfs });
createRoot(document.body).render(
  <>
    <BrowserAccessApp />
    <PublicSearchApp />
  </>,
);
