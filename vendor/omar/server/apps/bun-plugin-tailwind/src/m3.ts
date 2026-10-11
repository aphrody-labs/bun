// Material 3 for Tailwind v4, from the published @aphrody/m3-tokens and
// @aphrody/m3-tailwind: the token sheets, the CSS-first preset (colour roles,
// shape, type scale, elevation, motion, state layers, window size classes)
// and a colour scheme generated from a seed colour.
import type { SchemeOptions } from "@aphrody/m3-tokens/dynamic-color";

/** Material 3 baseline seed. */
export const M3_BASELINE_SEED = "#6750A4";

export interface M3Options extends Pick<SchemeOptions, "variant" | "contrastLevel"> {
  /**
   * Seed of the colour scheme written as `--md-sys-color-*` (light on `:root`,
   * dark on `.dark` and, unless `.light` is set, when the OS prefers dark).
   * Default: the M3 baseline `#6750A4`. `false` leaves the colours to the
   * runtime (`applyDynamicColor`, `<m3-theme>`, `M3Html`).
   */
  seed?: string | false;
  /** `@aphrody/m3-tokens/m3-tokens.css`: motion, elevation, state layers, shape (default true). */
  tokens?: boolean;
  /** `@aphrody/m3-tokens/expressive.css`: M3 Expressive shapes and springs (default true). */
  expressive?: boolean;
  /** `@aphrody/m3-tailwind/preset.css`: the Tailwind theme and utilities (default true). */
  preset?: boolean;
}

export const M3_IMPORTS = {
  tokens: "@aphrody/m3-tokens/m3-tokens.css",
  expressive: "@aphrody/m3-tokens/expressive.css",
  preset: "@aphrody/m3-tailwind/preset.css",
} as const;

function declarations(vars: Record<string, string>, indent: string) {
  return Object.entries(vars)
    .map(([k, v]) => `${indent}${k}: ${v};`)
    .join("\n");
}

/**
 * The colour scheme of a seed, with the selectors the preset's `dark:` variant
 * follows: `.dark`, or the OS preference unless `.light` forces light.
 */
export async function m3SchemeCss(seed: string = M3_BASELINE_SEED, options: SchemeOptions = {}): Promise<string> {
  const { schemeFromSeed } = await import("@aphrody/m3-tokens/dynamic-color");
  const light = schemeFromSeed(seed, { ...options, dark: false });
  const dark = schemeFromSeed(seed, { ...options, dark: true });
  return [
    `:root {\n  color-scheme: light dark;\n${declarations(light, "  ")}\n}`,
    `@media (prefers-color-scheme: dark) {\n  :root:not(.light) {\n${declarations(dark, "    ")}\n  }\n}`,
    `.light {\n  color-scheme: light;\n${declarations(light, "  ")}\n}`,
    `.dark {\n  color-scheme: dark;\n${declarations(dark, "  ")}\n}`,
  ].join("\n\n");
}

export interface Prelude {
  /** `@import`s inserted after `@import "tailwindcss"`. */
  imports: string;
  /** Rules appended in `@layer base`, so the app's own rules win. */
  base: string;
}

const preludes = new Map<string, Promise<Prelude>>();

/** What `theme: "m3"` (or `theme: M3Options`) adds to a Tailwind root. */
export function m3Prelude(theme: "m3" | M3Options): Promise<Prelude> {
  const options = theme === "m3" ? {} : theme;
  const key = JSON.stringify(options);
  let prelude = preludes.get(key);
  if (!prelude) {
    prelude = (async () => {
      const { seed = M3_BASELINE_SEED, tokens = true, expressive = true, preset = true, ...scheme } = options;
      const imports: string[] = [];
      if (tokens) imports.push(`@import "${M3_IMPORTS.tokens}";`);
      if (expressive) imports.push(`@import "${M3_IMPORTS.expressive}";`);
      if (preset) imports.push(`@import "${M3_IMPORTS.preset}";`);
      return { imports: imports.join("\n"), base: seed === false ? "" : await m3SchemeCss(seed, scheme) };
    })();
    preludes.set(key, prelude);
  }
  return prelude;
}
