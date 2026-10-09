// Fluent 2 design tokens for Bun: the token sources of microsoft/fluentui (packages/tokens, MIT, absorbed in
// ./tokens) exposed as JS objects, CSS custom properties and a Tailwind v4 theme, with the WinUI 3 -> Fluent 2 ->
// Material 3 correspondence used by bun:winui.
import type { BunPlugin } from "bun";
import { typographyStyles, webDarkTheme, webLightTheme } from "./tokens/index.ts";
import type { Theme } from "./tokens/types.ts";

export * from "./tokens/index.ts";
export type * from "./tokens/types.ts";
export { brandWeb } from "./tokens/global/brandColors.ts";

/** `colorNeutralBackground1` -> `neutral-background-1` (the part after the group prefix, kebab-cased). */
function kebab(name: string) {
  return name
    .replace(/([a-z])([A-Z0-9])/g, "$1-$2")
    .replace(/([0-9])([A-Za-z])/g, "$1-$2")
    .toLowerCase();
}

function declarations(values: Record<string, string | number>, indent: string) {
  return Object.entries(values)
    .map(([name, value]) => `${indent}--${name}: ${value};`)
    .join("\n");
}

function colorsOf(theme: Theme) {
  return Object.fromEntries(Object.entries(theme).filter(([name]) => name.startsWith("color"))) as Record<
    string,
    string
  >;
}

function constantsOf(theme: Theme) {
  return Object.fromEntries(
    Object.entries(theme).filter(([name]) => !name.startsWith("color") && !/^shadow/.test(name)),
  );
}

function shadowsOf(theme: Theme) {
  return Object.fromEntries(Object.entries(theme).filter(([name]) => name.startsWith("shadow")));
}

export interface FluentCssOptions {
  /** Light theme. Default: `webLightTheme`. */
  light?: Theme;
  /** Dark theme. Default: `webDarkTheme`; `false` writes the light theme only. */
  dark?: Theme | false;
}

/**
 * The Fluent 2 tokens as CSS custom properties named like `@fluentui/react-components` reads them
 * (`--colorNeutralBackground1`, `--borderRadiusMedium`...): light on `:root`, dark on `.dark` and,
 * unless `.light` is set, when the OS prefers dark (the selectors of the M3 preset).
 */
export function fluentTokensCss(options: FluentCssOptions = {}): string {
  const light = options.light ?? webLightTheme;
  const dark = options.dark === undefined ? webDarkTheme : options.dark;
  const lightVars = { ...colorsOf(light), ...shadowsOf(light) };
  const blocks = [
    `:root {\n  color-scheme: ${dark ? "light dark" : "light"};\n${declarations(constantsOf(light), "  ")}\n${declarations(lightVars, "  ")}\n}`,
  ];
  if (dark) {
    const darkVars = { ...colorsOf(dark), ...shadowsOf(dark) };
    blocks.push(
      `@media (prefers-color-scheme: dark) {\n  :root:not(.light) {\n${declarations(darkVars, "    ")}\n  }\n}`,
      `.light {\n  color-scheme: light;\n${declarations(lightVars, "  ")}\n}`,
      `.dark {\n  color-scheme: dark;\n${declarations(darkVars, "  ")}\n}`,
    );
  }
  return blocks.join("\n\n") + "\n";
}

const TAILWIND_NAMESPACES: [RegExp, string][] = [
  [/^color(.+)$/, "color-fluent"],
  [/^borderRadius(.+)$/, "radius-fluent"],
  [/^fontFamily(.+)$/, "font-fluent"],
  [/^fontWeight(.+)$/, "font-weight-fluent"],
  [/^shadow(.+)$/, "shadow-fluent"],
  [/^curve(.+)$/, "ease-fluent"],
  [/^spacingHorizontal(.+)$/, "spacing-fluent"],
];

/**
 * A Tailwind v4 `@theme inline` block whose utilities read the Fluent custom properties:
 * `bg-fluent-neutral-background-1`, `text-fluent-brand-foreground-1`, `rounded-fluent-medium`,
 * `shadow-fluent-8`, `font-fluent-base`, `font-fluent-semibold`, `text-fluent-base-300` (with its line
 * height), `ease-fluent-decelerate-mid`, `p-fluent-m`, plus one `fluent-<style>` utility per Fluent
 * typography style (`fluent-body-1`, `fluent-title-3`...).
 */
export function fluentTailwindTheme(theme: Theme = webLightTheme): string {
  const lines: string[] = [];
  for (const name of Object.keys(theme)) {
    for (const [pattern, namespace] of TAILWIND_NAMESPACES) {
      const match = pattern.exec(name);
      if (match) {
        lines.push(`  --${namespace}-${kebab(match[1])}: var(--${name});`);
        break;
      }
    }
    const size = /^fontSize(Base|Hero)(\d+)$/.exec(name);
    if (size) {
      const key = `${size[1].toLowerCase()}-${size[2]}`;
      lines.push(`  --text-fluent-${key}: var(--${name});`);
      lines.push(`  --text-fluent-${key}--line-height: var(--lineHeight${size[1]}${size[2]});`);
    }
  }
  const utilities = Object.entries(typographyStyles).map(
    ([name, style]) =>
      `@utility fluent-${kebab(name)} {\n${Object.entries(style)
        .map(([property, value]) => `  ${kebab(property)}: ${value};`)
        .join("\n")}\n}`,
  );
  return `@theme inline {\n${lines.join("\n")}\n}\n\n${utilities.join("\n\n")}\n`;
}

/** `fluent:tokens.css` (custom properties) and `fluent:theme.css` (custom properties + Tailwind theme). */
export function fluentSheets(options: FluentCssOptions = {}): Record<string, string> {
  const tokens = fluentTokensCss(options);
  return {
    "fluent:tokens.css": tokens,
    "fluent:theme.css": `${tokens}\n${fluentTailwindTheme(options.light ?? webLightTheme)}`,
  };
}

/**
 * For `tailwind({ schemeImport })` of `bun-plugin-tailwind`: `@import "fluent:theme.css";` is compiled with
 * the Tailwind root, so its `@theme` and `@utility` reach Tailwind. Other ids are left to the bundler.
 */
export function fluentSchemeImport(options: FluentCssOptions = {}) {
  const sheets = fluentSheets(options);
  return (id: string): string | undefined => sheets[id];
}

/** Serves `fluent:tokens.css` and `fluent:theme.css` to `Bun.build` and the dev server. */
export function fluentPlugin(options: FluentCssOptions = {}): BunPlugin {
  const sheets = fluentSheets(options);
  return {
    name: "fluent",
    setup(build) {
      build.onResolve({ filter: /^fluent:/ }, ({ path }) =>
        path in sheets ? { path, namespace: "fluent" } : undefined,
      );
      build.onLoad({ filter: /.*/, namespace: "fluent" }, ({ path }) => ({ contents: sheets[path], loader: "css" }));
    },
  };
}

/**
 * WinUI 3 theme resources (keys of the microsoft-ui-xaml theme dictionaries) -> Fluent 2 token ->
 * Material 3 system token (`null` where M3 has no role). Shared by bun:winui and the WinUI -> M3 notes in
 * docs/aphrody/merge/M-winui-m3.md.
 */
export const winuiResources = {
  AccentFillColorDefaultBrush: ["colorBrandBackground", "--md-sys-color-primary"],
  AccentFillColorSecondaryBrush: ["colorBrandBackgroundHover", "--md-sys-color-primary"],
  AccentFillColorTertiaryBrush: ["colorBrandBackgroundPressed", "--md-sys-color-primary"],
  AccentFillColorDisabledBrush: ["colorNeutralBackgroundDisabled", "--md-sys-color-on-surface"],
  AccentTextFillColorPrimaryBrush: ["colorBrandForeground1", "--md-sys-color-primary"],
  TextOnAccentFillColorPrimaryBrush: ["colorNeutralForegroundOnBrand", "--md-sys-color-on-primary"],
  TextFillColorPrimaryBrush: ["colorNeutralForeground1", "--md-sys-color-on-surface"],
  TextFillColorSecondaryBrush: ["colorNeutralForeground2", "--md-sys-color-on-surface-variant"],
  TextFillColorTertiaryBrush: ["colorNeutralForeground3", "--md-sys-color-on-surface-variant"],
  TextFillColorDisabledBrush: ["colorNeutralForegroundDisabled", "--md-sys-color-on-surface"],
  ApplicationPageBackgroundThemeBrush: ["colorNeutralBackground2", "--md-sys-color-surface"],
  SolidBackgroundFillColorBaseBrush: ["colorNeutralBackground2", "--md-sys-color-surface"],
  LayerFillColorDefaultBrush: ["colorNeutralBackground3", "--md-sys-color-surface-container"],
  CardBackgroundFillColorDefaultBrush: ["colorNeutralCardBackground", "--md-sys-color-surface-container-low"],
  ControlFillColorDefaultBrush: ["colorNeutralBackground1", "--md-sys-color-surface-container-highest"],
  ControlFillColorSecondaryBrush: ["colorNeutralBackground1Hover", "--md-sys-color-surface-container-high"],
  ControlFillColorTertiaryBrush: ["colorNeutralBackground1Pressed", "--md-sys-color-surface-container"],
  ControlFillColorDisabledBrush: ["colorNeutralBackgroundDisabled", "--md-sys-color-surface-container-low"],
  SubtleFillColorSecondaryBrush: ["colorSubtleBackgroundHover", "--md-sys-color-surface-container-high"],
  SubtleFillColorTertiaryBrush: ["colorSubtleBackgroundPressed", "--md-sys-color-surface-container"],
  SmokeFillColorDefaultBrush: ["colorBackgroundOverlay", "--md-sys-color-scrim"],
  ControlStrokeColorDefaultBrush: ["colorNeutralStroke1", "--md-sys-color-outline-variant"],
  ControlStrongStrokeColorDefaultBrush: ["colorNeutralStrokeAccessible", "--md-sys-color-outline"],
  CardStrokeColorDefaultBrush: ["colorNeutralStroke2", "--md-sys-color-outline-variant"],
  DividerStrokeColorDefaultBrush: ["colorNeutralStroke2", "--md-sys-color-outline-variant"],
  FocusStrokeColorOuterBrush: ["colorStrokeFocus2", "--md-sys-color-secondary"],
  FocusStrokeColorInnerBrush: ["colorStrokeFocus1", null],
  SystemFillColorCriticalBrush: ["colorStatusDangerForeground1", "--md-sys-color-error"],
  SystemFillColorCriticalBackgroundBrush: ["colorStatusDangerBackground1", "--md-sys-color-error-container"],
  SystemFillColorSuccessBrush: ["colorStatusSuccessForeground1", null],
  SystemFillColorSuccessBackgroundBrush: ["colorStatusSuccessBackground1", null],
  SystemFillColorCautionBrush: ["colorStatusWarningForeground1", null],
  SystemFillColorCautionBackgroundBrush: ["colorStatusWarningBackground1", null],
  ControlCornerRadius: ["borderRadiusMedium", "--md-sys-shape-corner-extra-small"],
  OverlayCornerRadius: ["borderRadiusXLarge", "--md-sys-shape-corner-small"],
  ContentControlThemeFontFamily: ["fontFamilyBase", "--md-ref-typeface-plain"],
  CaptionTextBlockFontSize: ["fontSizeBase200", "--md-sys-typescale-body-small-size"],
  BodyTextBlockFontSize: ["fontSizeBase300", "--md-sys-typescale-body-medium-size"],
  BodyLargeTextBlockFontSize: ["fontSizeBase400", "--md-sys-typescale-body-large-size"],
  SubtitleTextBlockFontSize: ["fontSizeBase500", "--md-sys-typescale-title-large-size"],
  TitleTextBlockFontSize: ["fontSizeHero700", "--md-sys-typescale-headline-medium-size"],
  TitleLargeTextBlockFontSize: ["fontSizeHero900", "--md-sys-typescale-display-small-size"],
  DisplayTextBlockFontSize: ["fontSizeHero1000", "--md-sys-typescale-display-large-size"],
  ControlFasterAnimationDuration: ["durationFaster", "--md-sys-motion-duration-short2"],
  ControlFastAnimationDuration: ["durationFast", "--md-sys-motion-duration-short3"],
  ControlNormalAnimationDuration: ["durationGentle", "--md-sys-motion-duration-medium1"],
  ControlFastOutSlowInKeySpline: ["curveDecelerateMid", "--md-sys-motion-easing-emphasized-decelerate"],
} as const satisfies Record<string, readonly [keyof Theme, string | null]>;

const XAML_ESCAPE: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };

/** `#rrggbb` / `rgba(r,g,b,a)` -> XAML `#aarrggbb`, or undefined. */
function xamlColor(value: string) {
  let m = /^#([0-9a-f]{6})$/i.exec(value);
  if (m) return `#FF${m[1].toUpperCase()}`;
  m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(value);
  if (!m) return undefined;
  const hex = (n: number) => Math.round(n).toString(16).padStart(2, "0").toUpperCase();
  return `#${hex(255 * Number(m[4] ?? 1))}${hex(+m[1])}${hex(+m[2])}${hex(+m[3])}`;
}

/**
 * A XAML `ResourceDictionary` that sets the WinUI brushes of {@link winuiResources} to a Fluent 2 theme
 * (light and dark theme dictionaries), for `MergedDictionaries` of a bun:winui application.
 */
export function fluentWinuiResources(options: FluentCssOptions = {}): string {
  const light = options.light ?? webLightTheme;
  const dark = options.dark === undefined ? webDarkTheme : options.dark || light;
  const brushes = (theme: Theme) =>
    Object.entries(winuiResources)
      .filter(([key]) => key.endsWith("Brush"))
      .flatMap(([key, [token]]) => {
        const color = xamlColor(String(theme[token]));
        return color ? [`      <SolidColorBrush x:Key="${key}" Color="${color}"/>`] : [];
      })
      .join("\n");
  const font = String(light.fontFamilyBase).replace(/[&<>"]/g, c => XAML_ESCAPE[c]);
  return [
    `<ResourceDictionary xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml">`,
    `  <ResourceDictionary.ThemeDictionaries>`,
    `    <ResourceDictionary x:Key="Light">\n${brushes(light)}\n    </ResourceDictionary>`,
    `    <ResourceDictionary x:Key="Dark">\n${brushes(dark)}\n    </ResourceDictionary>`,
    `  </ResourceDictionary.ThemeDictionaries>`,
    `  <CornerRadius x:Key="ControlCornerRadius">${parseFloat(String(light.borderRadiusMedium))}</CornerRadius>`,
    `  <CornerRadius x:Key="OverlayCornerRadius">${parseFloat(String(light.borderRadiusXLarge))}</CornerRadius>`,
    `  <FontFamily x:Key="ContentControlThemeFontFamily">${font.split(",")[0].replace(/'/g, "").trim()}</FontFamily>`,
    `</ResourceDictionary>`,
  ].join("\n");
}
