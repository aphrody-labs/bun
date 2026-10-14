import fs from "node:fs";
import { join as pathJoin, resolve } from "node:path";
import { parseArgs } from "node:util";

import { disableReusedWorkers } from "../../../../../scripts/codegen/ecma_disable_workers.mjs";

const { values } = parseArgs({ options: { "out-dir": { type: "string" } } });
const outputDir = values["out-dir"]
  ? resolve(values["out-dir"])
  : resolve(import.meta.dirname, "../../../../../build/quality/parser");
const wasiBrowserFilename = pathJoin(outputDir, "parser.wasi-browser.js");
if (fs.existsSync(wasiBrowserFilename)) disableReusedWorkers(wasiBrowserFilename);

const filename = pathJoin(outputDir, "bindings.js");
let data = fs.readFileSync(filename, "utf-8");

data = data.replace(
  "\nif (!nativeBinding) {",
  (s) =>
    `
if (!nativeBinding && globalThis.process?.versions?.["webcontainer"]) {
  try {
    nativeBinding = require('./webcontainer-fallback.cjs');
  } catch (err) {
    loadErrors.push(err)
  }
}
` + s,
);

data += `const { getBufferOffset, parseRaw, parseRawSync } = nativeBinding
export { getBufferOffset, parseRaw, parseRawSync }
`;

fs.writeFileSync(filename, data);

const wasip1BrowserFilename = pathJoin(outputDir, "parser.wasip1-browser.js");
if (fs.existsSync(wasip1BrowserFilename)) {
  const wasip1Browser = fs.readFileSync(wasip1BrowserFilename, "utf-8").replaceAll(/[ \t]+$/gmu, "");
  fs.writeFileSync(wasip1BrowserFilename, wasip1Browser);
}
