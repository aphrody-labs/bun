import { expect, test } from "bun:test";
import { join } from "node:path";
import {
  fluentSheets,
  fluentTailwindTheme,
  fluentTokensCss,
  fluentWinuiResources,
  typographyStyles,
  webDarkTheme,
  webLightTheme,
  winuiResources,
} from "../src/index.ts";
import { m3SchemeCss } from "../../bun-plugin-tailwind/src/m3.ts";

const repo = join(import.meta.dir, "..", "..", "..");

test("Fluent 2 web themes: colors, typography, radii, shadows, motion", () => {
  expect(webLightTheme.colorBrandBackground).toBe("#0f6cbd");
  expect(webDarkTheme.colorBrandBackground).toBe("#115ea3");
  expect(webLightTheme.borderRadiusMedium).toBe("4px");
  expect(webLightTheme.fontSizeBase300).toBe("14px");
  expect(webLightTheme.durationFast).toBe("150ms");
  expect(webLightTheme.shadow8).toContain("rgba(");
  expect(Object.keys(typographyStyles)).toContain("body1");
});

test("CSS: light on :root, dark on .dark and prefers-color-scheme", () => {
  const css = fluentTokensCss();
  expect(css).toContain(":root {\n  color-scheme: light dark;");
  expect(css).toContain("--colorBrandBackground: #0f6cbd;");
  expect(css).toContain("@media (prefers-color-scheme: dark) {\n  :root:not(.light) {");
  expect(css).toContain(".dark {\n  color-scheme: dark;");
  expect(css).toContain("--colorBrandBackground: #115ea3;");
  expect(fluentTokensCss({ dark: false })).not.toContain(".dark");

  const theme = fluentTailwindTheme();
  expect(theme).toContain("--color-fluent-brand-background: var(--colorBrandBackground);");
  expect(theme).toContain("--text-fluent-base-300--line-height: var(--lineHeightBase300);");
  expect(theme).toContain("--radius-fluent-medium: var(--borderRadiusMedium);");
  expect(theme).toContain("--shadow-fluent-8: var(--shadow8);");
  expect(theme).toContain("--ease-fluent-decelerate-mid: var(--curveDecelerateMid);");
  expect(theme).toContain("@utility fluent-body-1 {");
  expect(Object.keys(fluentSheets())).toEqual(["fluent:tokens.css", "fluent:theme.css"]);
});

test("WinUI -> Fluent -> M3: every key is a WinUI resource, a Fluent token and an M3 token", async () => {
  const inventory = await Bun.file(join(repo, "docs/aphrody/merge/winui-inventory.json")).text();
  // The M3 sheets bun-plugin-tailwind writes for theme: "m3": scheme colours, tokens and the Tailwind preset.
  const m3 = join(repo, "packages/bun-plugin-tailwind/node_modules/@aphrody");
  const m3Css = (await Bun.file(join(m3, "m3-tokens/package.json")).exists())
    ? (await m3SchemeCss()) +
      (await Bun.file(join(m3, "m3-tokens/src/m3-tokens.css")).text()) +
      (await Bun.file(join(m3, "m3-tailwind/preset.css")).text())
    : "";
  const missing: string[] = [];
  for (const [key, [token, md]] of Object.entries(winuiResources)) {
    if (!inventory.includes(`"${key}"`)) missing.push(`WinUI ${key}`);
    if (!(token in webLightTheme)) missing.push(`Fluent ${token}`);
    if (md && m3Css && !m3Css.includes(`${md}:`)) missing.push(`M3 ${md}`);
  }
  expect(missing).toEqual([]);
});

test("XAML resources: theme dictionaries of WinUI brushes", () => {
  const xaml = fluentWinuiResources();
  expect(xaml).toContain('<ResourceDictionary x:Key="Light">');
  expect(xaml).toContain('<SolidColorBrush x:Key="AccentFillColorDefaultBrush" Color="#FF0F6CBD"/>');
  expect(xaml).toContain('<SolidColorBrush x:Key="AccentFillColorDefaultBrush" Color="#FF115EA3"/>');
  expect(xaml).toContain('<CornerRadius x:Key="ControlCornerRadius">4</CornerRadius>');
  expect(xaml).toMatch(/<SolidColorBrush x:Key="SmokeFillColorDefaultBrush" Color="#[0-9A-F]{8}"\/>/);
});
