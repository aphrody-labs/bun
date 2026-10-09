// SPDX-License-Identifier: Apache-2.0
import { applyFluentTheme } from "../../src/os/fluent";

applyFluentTheme(false);
document.body.innerHTML = `
  <fluent-button appearance="primary" id="primary">Valider</fluent-button>
  <fluent-switch id="dark" checked>Sombre</fluent-switch>
  <fluent-checkbox id="check">Option</fluent-checkbox>
  <fluent-text-input id="input" value="bun"></fluent-text-input>
  <fluent-progress-bar id="progress" value="40" max="100"></fluent-progress-bar>`;
