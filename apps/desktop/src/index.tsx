// SPDX-License-Identifier: Apache-2.0
import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import "@aphrody/m3-tokens/m3-tokens.css";
import "@aphrody/m3-tokens/expressive.css";
import "./styles/main.css";
import "./styles/shell.css";
import "@aphrody/m3-react/video.css";

const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
