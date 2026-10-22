// SPDX-License-Identifier: Apache-2.0
// Aphrody Material Symbols release 12b46e640adf; source aphrody-labs/material-design-icons 24931a5a98.
export const MATERIAL_SYMBOLS_CSS = "https://cdn.aphrody.com/h/c2672d57d2ec4ff8.css";
export const MATERIAL_SYMBOLS_SHA256 = "c2672d57d2ec4ff88b562fde7a46fe6417d743f9c2a0c55cd49ae80fdee1193f";
export const FUSION_SYMBOLS = [
  "terminal",
  "inventory_2",
  "science",
  "deployed_code",
  "menu_book",
  "explore",
  "data_object",
  "account_tree",
  "download",
  "article",
  "home",
  "construction",
  "search",
  "menu",
  "close",
  "code",
  "palette",
  "auto_awesome",
];

export function symbol(name: string): string {
  if (!/^[a-z][a-z0-9_]*$/.test(name)) throw new Error("Invalid Material Symbol name");
  return `<img class="fusion-symbol" src="/mirror-assets/symbols/${name}.svg" alt="" aria-hidden="true" width="24" height="24">`;
}

export function navigationSymbol(href: string): string {
  const path = new URL(href, "https://bun.aphrody.app").pathname;
  if (path.startsWith("/docs")) return "menu_book";
  if (path.startsWith("/guides")) return "explore";
  if (path.startsWith("/reference") || path.startsWith("/knowledge")) return "data_object";
  if (path.startsWith("/graph")) return "account_tree";
  if (path.startsWith("/downloads") || path.startsWith("/get")) return "download";
  if (path.startsWith("/blog") || path.startsWith("/release-notes")) return "article";
  return "home";
}
