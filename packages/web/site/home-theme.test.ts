import { expect, test } from "bun:test";
import { HOME_THEME_BOOTSTRAP, HOME_THEME_SCRIPT, homeThemeCss, parseBunHomeTheme } from "./home-theme";

const light =
  "canvas:255 255 255;subtle:246 246 246;surface:255 255 255;raised:255 255 255;line:226 226 226;line-strong:10 10 10;fg:10 10 10;fg-muted:82 82 82;fg-faint:112 112 112;accent:255 31 143;accent-strong:214 0 102;accent-soft:255 235 245;signal:255 214 10;rule:24 24 24;slab:12 12 12;on-slab:255 255 255;bar:24 24 24;cream:251 240 223;code-bg:246 246 246;code-fg:10 10 10;success:0 145 80;warning:194 120 3;danger:214 31 45;info:20 80 220;";
const dark =
  "canvas:13 10 12;subtle:23 19 22;surface:13 10 12;raised:26 26 28;line:40 40 43;line-strong:72 72 76;fg:234 234 232;fg-muted:168 168 165;fg-faint:128 128 126;accent:255 46 151;accent-strong:255 92 176;accent-soft:40 0 22;signal:255 214 10;rule:62 62 66;slab:30 30 33;on-slab:240 240 238;bar:150 150 148;cream:251 240 223;code-bg:14 14 14;code-fg:240 240 240;success:40 220 130;warning:245 180 60;danger:255 90 90;info:120 170 255;";
const fixture = `:root{${light.replaceAll(/(^|;)([a-z-]+):/g, "$1--c-$2:")}}.dark{${dark.replaceAll(/(^|;)([a-z-]+):/g, "$1--c-$2:")}}`;

test("Bun palettes retain the two captured pinks and supply readable M3 color pairs", () => {
  const theme = parseBunHomeTheme(fixture);
  expect(theme.light.accent).toBe("255 31 143");
  expect(theme.dark.accent).toBe("255 46 151");
  expect(theme.dark.canvas).toBe("13 10 12");
  const luminance = (color: string) =>
    color
      .split(" ")
      .map(Number)
      .map(channel => {
        const c = channel / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      })
      .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index]!, 0);
  const contrast = (a: string, b: string) => {
    const x = luminance(a),
      y = luminance(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };
  for (const palette of [theme.light, theme.dark]) {
    expect(contrast(palette.fg!, palette.canvas!)).toBeGreaterThan(4.5);
    expect(contrast(palette["fg-muted"]!, palette.subtle!)).toBeGreaterThan(4.5);
    expect(contrast(palette.accent!, theme.light.fg!)).toBeGreaterThan(4.5);
  }
  const css = homeThemeCss(theme);
  expect(css).toContain("color-scheme:light dark");
  expect(css).toContain('@media(prefers-color-scheme:dark){:root:not([data-home-theme="light"])');
  expect(css).toContain(':root[data-home-theme="dark"]');
  expect(css).toContain("--md-sys-color-primary:rgb(var(--c-accent))");
  expect(css).toContain("@media(forced-colors:active)");
  expect(() => parseBunHomeTheme(fixture.replace("--c-accent:255 31 143;", ""))).toThrow("token is missing: accent");
  expect(() => parseBunHomeTheme(fixture.replace("255 31 143", "999 31 143"))).toThrow("channel is invalid");
});

test("theme controls work when storage is denied and synchronize an explicit override across tabs", () => {
  const root = { dataset: {} as Record<string, string> },
    meta = { content: "light dark" };
  const events = new Map<string, (event: { key: string | null; newValue: string | null }) => void>();
  let change: () => void = () => {};
  const control = {
    value: "system",
    addEventListener(_type: string, callback: () => void) {
      change = callback;
    },
  };
  const document = {
    documentElement: root,
    querySelector() {
      return meta;
    },
    getElementById() {
      return control;
    },
  };
  const window = {
    addEventListener(type: string, callback: (event: { key: string | null; newValue: string | null }) => void) {
      events.set(type, callback);
    },
  };
  const storage = {
    getItem() {
      throw Error("storage denied");
    },
    setItem() {
      throw Error("storage denied");
    },
    removeItem() {
      throw Error("storage denied");
    },
  };
  new Function("document", "localStorage", HOME_THEME_BOOTSTRAP)(document, storage);
  expect(meta.content).toBe("light dark");
  new Function("window", "document", "localStorage", HOME_THEME_SCRIPT)(window, document, storage);
  control.value = "dark";
  change();
  expect(root.dataset.homeTheme).toBe("dark");
  expect(meta.content).toBe("dark");
  events.get("storage")!({ key: "bun-home-theme", newValue: "light" });
  expect(control.value).toBe("light");
  expect(meta.content).toBe("light");
  events.get("storage")!({ key: null, newValue: null });
  expect(meta.content).toBe("light dark");
  expect(root.dataset.homeTheme).toBeUndefined();
  control.value = "arbitrary";
  change();
  expect(control.value).toBe("system");
});
