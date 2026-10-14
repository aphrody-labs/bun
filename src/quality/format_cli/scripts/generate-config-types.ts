// oxlint-disable no-console

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "json-schema-to-typescript";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const oxfmtDir = resolve(scriptDir, "..");
const repoRoot = resolve(oxfmtDir, "..", "..", "..");

const schemaPath = resolve(repoRoot, "packages/bun-oxc/adapters/format/configuration_schema.json");
const outputPath = resolve(oxfmtDir, "src-js/config.generated.ts");

if (!existsSync(schemaPath)) {
  throw new Error(`Missing schema at ${schemaPath}. From the repository root, run \`cargo run -p bun_ecma_website_formatter -- schema-json > packages/bun-oxc/adapters/format/configuration_schema.json\` first.`);
}

const schema = JSON.parse(readFileSync(schemaPath, "utf8"));

const bannerComment =
  "/*\n"
  + " * This file is generated from packages/bun-oxc/adapters/format/configuration_schema.json.\n"
  + " * Run `bun src/quality/format_cli/scripts/generate-config-types.ts` from the repository root to regenerate.\n"
  + " */";

const ts = await compile(schema, "OxfmtConfig", { bannerComment });

writeFileSync(outputPath, ts);
console.log(`Wrote ${outputPath}`);
