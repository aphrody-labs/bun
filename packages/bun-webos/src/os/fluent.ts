// SPDX-License-Identifier: Apache-2.0
/**
 * Windows 11 theme next to M3: Fluent UI web components v3 (@fluentui/web-components, FAST 3) with
 * the Fluent 2 tokens of @fluentui/tokens, bundled by Bun like the rest of the page.
 */
import "@fluentui/web-components/button.js";
import "@fluentui/web-components/badge.js";
import "@fluentui/web-components/checkbox.js";
import "@fluentui/web-components/divider.js";
import "@fluentui/web-components/field.js";
import "@fluentui/web-components/label.js";
import "@fluentui/web-components/progress-bar.js";
import "@fluentui/web-components/slider.js";
import "@fluentui/web-components/spinner.js";
import "@fluentui/web-components/switch.js";
import "@fluentui/web-components/tab.js";
import "@fluentui/web-components/tablist.js";
import "@fluentui/web-components/text.js";
import "@fluentui/web-components/text-input.js";
import { setTheme } from "@fluentui/web-components/theme/set-theme.js";
import { webDarkTheme, webLightTheme } from "@fluentui/tokens";
import type { FLUENT_ELEMENTS } from "./fluent-elements";

export { FLUENT_ELEMENTS } from "./fluent-elements";

/** Fluent 2 web tokens on `node` (CSS custom properties), or on the whole document. */
export function applyFluentTheme(dark: boolean, node?: HTMLElement): void {
  setTheme(dark ? webDarkTheme : webLightTheme, node);
}

type FluentProps = React.HTMLAttributes<HTMLElement> & {
  ref?: React.Ref<HTMLElement>;
  [attribute: string]: unknown;
};

declare module "react" {
  namespace JSX {
    interface IntrinsicElements extends Record<(typeof FLUENT_ELEMENTS)[number], FluentProps> {}
  }
}
