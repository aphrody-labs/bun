export { bestEntry, decodeBmp, entryToPng, IcoError, isIco, parseIco, pngDataUrl } from "./src/ico.ts";
export type { IcoEntry, Rgba } from "./src/ico.ts";
export { encodePng, isPng, pngSize } from "./src/png.ts";
export {
  DEFAULT_ORIGIN,
  fetchSymbol,
  parseSymbol,
  SymbolError,
  SYMBOL_STYLES,
  symbolPath,
  symbolsCacheDir,
  symbolsOrigin,
  symbolUrl,
} from "./src/symbols.ts";
export type { FetchSymbolOptions, SymbolSpec, SymbolStyle } from "./src/symbols.ts";
export { icoModule, iconsPlugin } from "./src/plugin.ts";
export type { IconsPluginOptions } from "./src/plugin.ts";
export { iconsPlugin as default } from "./src/plugin.ts";
