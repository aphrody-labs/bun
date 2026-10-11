// SPDX-License-Identifier: Apache-2.0
import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserAccessApp } from "../../src/os/apps/BrowserAccessApp";

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
createRoot(document.body).render(<BrowserAccessApp />);
