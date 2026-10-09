# `@aphrody/bun-icons`

Bun plugin for Material Symbols and ICO imports, at runtime (`Bun.plugin`) and in `Bun.build`.

```ts
import home from "symbol:home?style=rounded&fill=1&size=32"; // SVG markup
import logo, { best, entries } from "./favicon.ico"; // PNG data URLs
```

- `symbol:<name>` takes `style` (`outlined`, `rounded`, `sharp`), `fill` (0, 1), `wght` (100 to 700 by 100), `grad` (-25, 0, 200), `opsz` (20, 24, 40, 48) and `size` (pixels of the returned SVG). The SVG comes from `APHRODY_ICONS_ORIGIN` (default `https://cdn.aphrody.com/`, gstatic layout) and is cached on disk under `APHRODY_ICONS_CACHE` (default `~/.cache/aphrody/material-symbols`). An unknown name fails the import.
- `.ico` and `.cur`: `default` is the largest entry as a PNG, `best(px)` the smallest entry covering `px` (the deepest on ties), `entries` lists `{ width, height, bits, png }`. PNG entries are kept as stored; 1, 4, 8, 24 and 32-bit BMP entries are decoded with their AND mask and re-encoded as PNG.

## Usage

```ts
import iconsPlugin from "@aphrody/bun-icons";

await Bun.build({ entrypoints: ["./index.ts"], plugins: [iconsPlugin()] });
```

At runtime, preload the registration in `bunfig.toml`:

```toml
preload = ["@aphrody/bun-icons/register"]
```

For TypeScript, add `"@aphrody/bun-icons/modules"` to `compilerOptions.types`.

The helpers are exported too: `parseIco`, `bestEntry`, `decodeBmp`, `entryToPng`, `encodePng`, `parseSymbol`, `symbolUrl`, `fetchSymbol`. The same rules back the Rust loader (`aphrody_identity::loader`) and `loadIcon()` in `@aphrody/identity`.

## Tests

```sh
bun test
```
