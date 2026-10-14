import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { rolldown } from "rolldown";

// Rollup-compatible bundlers reserve `\0`-prefixed IDs for plugin virtual modules,
// so Rolldown will not try to resolve these generated `?url` asset modules as files.
const NEW_URL_ASSET_PREFIX = "\0new-url-asset:";
const PACKAGE_DIR = path.resolve(import.meta.dirname, "..");
const PARSER_CORE_DIR = path.resolve(PACKAGE_DIR, "../../../../packages/bun-oxc/src/parser-core");
const OUTPUT_DIR = path.resolve(PACKAGE_DIR, "../../../../build/quality/parser");
const BROWSER_BUNDLE = path.join(OUTPUT_DIR, "browser-bundle.js");
const WASIP1_BROWSER_BINDING = path.join(OUTPUT_DIR, "parser.wasip1-browser.js");

async function main() {
  const args = parseArgs({
    strict: true,
    options: {
      npmDir: {
        type: "string",
      },
    },
  });

  // bundle wasm.js -> browser-bundle.js
  const bundle = await rolldown({
    input: path.join(PARSER_CORE_DIR, "wasm.js"),
    platform: "browser",
    resolve: {
      alias: {
        "@oxc-parser/binding-wasm32-wasip1": WASIP1_BROWSER_BINDING,
      },
    },
    plugins: [
      {
        name: "patch-new-url",
        resolveId(source) {
          if (source.endsWith("?url")) {
            return `${NEW_URL_ASSET_PREFIX}${source.replace(/\?url$/, "")}`;
          }
        },
        load(id) {
          if (id.startsWith(NEW_URL_ASSET_PREFIX)) {
            const assetPath = id.slice(NEW_URL_ASSET_PREFIX.length);
            return `export default new URL(${JSON.stringify(assetPath)}, import.meta.url).href`;
          }
        },
      },
    ],
  });
  try {
    await bundle.write({
      file: BROWSER_BUNDLE,
      format: "esm",
    });
  } finally {
    await bundle.close();
  }

  if (args.values.npmDir) {
    const pkgDir = path.resolve(args.values.npmDir, "wasm32-wasip1");

    // add `browser-bundle.js` to `package.json:files`
    const pkgFile = path.join(pkgDir, "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgFile, "utf8"));
    pkg.files.push("browser-bundle.js");
    fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2));

    // copy `browser-bundle.js` to `<npmDir>/wasm32-wasip1`
    fs.cpSync(BROWSER_BUNDLE, path.join(pkgDir, "browser-bundle.js"));
  }
}

await main();
