// SPDX-License-Identifier: Apache-2.0
export type HomeThemePreference = "system" | "light" | "dark";
export type BunHomeTheme = { light: Record<string, string>; dark: Record<string, string> };
const colors = [
  "canvas",
  "subtle",
  "surface",
  "raised",
  "line",
  "line-strong",
  "fg",
  "fg-muted",
  "fg-faint",
  "accent",
  "accent-strong",
  "accent-soft",
  "signal",
  "rule",
  "slab",
  "on-slab",
  "bar",
  "cream",
  "code-bg",
  "code-fg",
  "success",
  "warning",
  "danger",
  "info",
];

/** Read both palettes from the captured Bun stylesheet; missing tokens never become invented defaults. */
export function parseBunHomeTheme(css: string): BunHomeTheme {
  const light = /:root\s*\{([^{}]*--c-canvas[^{}]*)\}/.exec(css)?.[1];
  const dark = /\.dark\s*\{([^{}]*--c-canvas[^{}]*)\}/.exec(css)?.[1];
  const palette = (body: string | undefined) => {
    if (!body) throw new Error("Captured Bun color palette is missing");
    const entries = Object.fromEntries(
      [...body.matchAll(/--c-([a-z-]+)\s*:\s*(\d+)\s+(\d+)\s+(\d+)\s*;/g)].map(match => {
        const channels = match.slice(2).map(Number);
        if (channels.some(value => value < 0 || value > 255)) throw new Error("Captured Bun color channel is invalid");
        return [match[1]!, channels.join(" ")];
      }),
    );
    for (const name of colors) if (!entries[name]) throw new Error(`Captured Bun color token is missing: ${name}`);
    return entries;
  };
  return { light: palette(light), dark: palette(dark) };
}

export function homeThemeCss(theme: BunHomeTheme): string {
  const tokens = (palette: Record<string, string>) => colors.map(name => `--c-${name}:${palette[name]};`).join("");
  return `:root{${tokens(theme.light)}color-scheme:light dark;--md-sys-color-primary:rgb(var(--c-accent));--md-sys-color-on-primary:rgb(${theme.light.fg});--md-sys-color-primary-container:rgb(var(--c-accent-soft));--md-sys-color-on-primary-container:rgb(var(--c-fg));--md-sys-color-secondary:rgb(var(--c-fg-muted));--md-sys-color-secondary-container:rgb(var(--c-subtle));--md-sys-color-on-secondary-container:rgb(var(--c-fg));--md-sys-color-tertiary:rgb(var(--c-signal));--md-sys-color-surface:rgb(var(--c-canvas));--md-sys-color-surface-container-low:rgb(var(--c-subtle));--md-sys-color-surface-container:rgb(var(--c-raised));--md-sys-color-on-surface:rgb(var(--c-fg));--md-sys-color-on-surface-variant:rgb(var(--c-fg-muted));--md-sys-color-outline:rgb(var(--c-line-strong));--md-sys-color-outline-variant:rgb(var(--c-line));--md-sys-color-error:rgb(var(--c-danger));--md-ref-typeface-brand:var(--font-display);--md-ref-typeface-plain:var(--font-sans);--md-sys-shape-corner-large:16px;--md-sys-shape-corner-full:999px}
@media(prefers-color-scheme:dark){:root:not([data-home-theme="light"]){${tokens(theme.dark)}}}
:root[data-home-theme="dark"]{${tokens(theme.dark)}color-scheme:dark}
:root[data-home-theme="light"]{${tokens(theme.light)}color-scheme:light}
html{accent-color:var(--md-sys-color-primary)}
@media(forced-colors:active){:focus-visible{outline:2px solid Highlight!important}}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}*,*::before,*::after{animation:none!important;transition:none!important}}
`;
}

export function homeThemePreference(value: unknown): HomeThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}

/** This runs immediately after the scheme meta, before styles; storage denial leaves system colors usable. */
export const HOME_THEME_BOOTSTRAP = `(()=>{try{const v=localStorage.getItem('bun-home-theme');if(v==='light'||v==='dark'){document.documentElement.dataset.homeTheme=v;document.querySelector('meta[name="color-scheme"]').content=v}}catch{}})();`;

export const HOME_THEME_SCRIPT = `(()=>{const root=document.documentElement,meta=document.querySelector('meta[name="color-scheme"]'),control=document.getElementById('home-theme');if(!meta||!control)return;const normalize=v=>v==='light'||v==='dark'?v:'system';const apply=value=>{const v=normalize(value);if(v==='system')delete root.dataset.homeTheme;else root.dataset.homeTheme=v;meta.content=v==='system'?'light dark':v;control.value=v};apply(root.dataset.homeTheme);control.addEventListener('change',()=>{const v=normalize(control.value);apply(v);try{if(v==='system')localStorage.removeItem('bun-home-theme');else localStorage.setItem('bun-home-theme',v)}catch{}});window.addEventListener('storage',event=>{if(event.key==='bun-home-theme'||event.key===null)apply(event.newValue)})})();`;
