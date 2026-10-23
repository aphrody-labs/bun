#!/usr/bin/env bun
// Copies the site's fonts to fonts/ from their Fontsource packages (SIL Open Font License 1.1): Archivo for display
// type, with its weight and width axes (the headlines are set condensed and heavy), and Martian Mono for labels and code.
//
//   bun scripts/fonts.ts
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const out = join(root, "fonts");
mkdirSync(out, { recursive: true });
const files: [from: string, to: string][] = [
  ["@fontsource-variable/archivo/files/archivo-latin-wdth-normal.woff2", "Archivo.var.woff2"],
  ["@fontsource-variable/archivo/LICENSE", "Archivo-OFL.txt"],
  ["@fontsource-variable/martian-mono/files/martian-mono-latin-wdth-normal.woff2", "MartianMono.var.woff2"],
  ["@fontsource-variable/martian-mono/LICENSE", "MartianMono-OFL.txt"],
];
for (const [from, to] of files) {
  const [scope, name, ...rest] = from.split("/");
  const directory = dirname(Bun.resolveSync(`${scope}/${name}/package.json`, root));
  copyFileSync(join(directory, ...rest), join(out, to));
  console.log(`${to}: ${Bun.file(join(out, to)).size} bytes`);
}
