// Builds dist/ for runtimes other than Bun (Node.js workers of Next.js,
// PostCSS hosts): ES modules for every entry point and a CommonJS PostCSS
// plugin. Bun itself loads src/ through the "bun" export condition.
//
//   bun scripts/build.ts [outdir]

import { rmSync } from "node:fs";
import { join, resolve } from "node:path";

const root = join(import.meta.dir, "..");
const outdir = resolve(process.argv[2] ?? join(root, "dist"));
const pkg = await Bun.file(join(root, "package.json")).json();

// Runtime dependencies stay imports; the M3 colour code (TypeScript in
// @aphrody/m3-tokens) is bundled so Node.js never loads a .ts file.
const external = [
  "bun",
  "postcss",
  ...Object.keys(pkg.dependencies).filter(dep => dep !== "@aphrody/m3-tokens"),
  "@tailwindcss/node/*",
];

rmSync(outdir, { recursive: true, force: true });

async function build(entrypoints: string[], format: "esm" | "cjs", ext: string) {
  const result = await Bun.build({
    entrypoints: entrypoints.map(e => join(root, "src", e)),
    outdir,
    target: "node",
    format,
    external,
    naming: { entry: `[name].${ext}`, chunk: `chunks/[name]-[hash].${ext}` },
    splitting: format === "esm",
    throw: false,
  });
  if (!result.success) throw new AggregateError(result.logs, "bun-plugin-tailwind: build failed");
  return result.outputs.map(o => o.path);
}

const outputs = [
  ...(await build(["index.ts", "postcss.ts", "m3.ts", "core.ts"], "esm", "mjs")),
  ...(await build(["postcss.cjs"], "cjs", "cjs")),
];
for (const file of outputs) console.log(file);
