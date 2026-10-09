# @aphrody/bun-fluent

Fluent 2 design tokens for Bun. The token sources of [microsoft/fluentui](https://github.com/microsoft/fluentui) `packages/tokens` (MIT, `LICENSE-fluentui.txt`, absorbed from fluentui `8abb0781d7d8` into `src/tokens`) as:

- JS: `webLightTheme`, `webDarkTheme`, `teamsLightTheme`..., `typographyStyles`, `brandWeb`, every global token.
- CSS: `fluentTokensCss()` writes the custom properties read by `@fluentui/react-components` (`--colorBrandBackground`, `--borderRadiusMedium`, `--shadow8`, `--durationFast`...); light on `:root`, dark on `.dark` and on `prefers-color-scheme: dark` unless `.light` is set.
- Tailwind v4: `fluentTailwindTheme()` is an `@theme inline` block (`bg-fluent-brand-background`, `text-fluent-neutral-foreground-1`, `rounded-fluent-medium`, `shadow-fluent-8`, `font-fluent-base`, `text-fluent-base-300`, `ease-fluent-decelerate-mid`, `p-fluent-m`) plus one `fluent-<style>` utility per typography style (`fluent-body-1`, `fluent-title-3`...).
- WinUI 3: `winuiResources` maps WinUI theme resources to Fluent tokens and Material 3 tokens; `fluentWinuiResources()` writes a XAML `ResourceDictionary` for `bun:winui`.

```ts
import tailwind from "@aphrody/bun-plugin-tailwind";
import { fluentPlugin, fluentSchemeImport } from "@aphrody/bun-fluent";

await Bun.build({
  entrypoints: ["./index.html"],
  plugins: [fluentPlugin(), tailwind({ schemeImport: fluentSchemeImport() })],
});
```

```css
@import "tailwindcss";
@import "fluent:theme.css";
```

`fluent:tokens.css` holds the custom properties only.
