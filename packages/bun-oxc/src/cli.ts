#!/usr/bin/env bun
// bun-oxc: the package API from the command line.

import { resolve as resolvePath } from "node:path";
import { parseArgs } from "node:util";
import {
  analyze,
  check,
  format,
  formatDiagnostics,
  isolatedDeclaration,
  lint,
  lintRules,
  minifyWithMap,
  parse,
  resolve,
  transform,
  version,
  type LintOptions,
} from "./index";
import { runOxlint } from "./oxlint";

const USAGE = `bun-oxc <command> [options]

  transform <file>        TS/JSX to JS   --target --jsx classic --jsx-import-source --development
                                         --decorators legacy --decorator-metadata --react-refresh
                                         --styled-components --helpers <module> --sourcemap -o <out>
  minify <file>           --no-compress --no-mangle --top-level --keep-whitespace --drop-console
                          --target --sourcemap -o <out>
  dts <file>              isolated declarations   --strip-internal -o <out>
  format <files...>       oxfmt   --write --check --config <path> --no-discover
  lint <files...>         oxlint (all rules)   --fix --fix-suggestions --fix-dangerously
                          --config <path> --json
  check <files...>        syntax and semantic errors   --json
  resolve <specifier>     --from <file|dir> (default cwd) --tsconfig <path|auto> --condition <name>...
  parse <file>            ESTree JSON
  analyze <file>          imports and exports JSON
  rules                   oxlint rules   --plugin <name> --json
  oxlint [args...]        run the oxlint CLI (jsPlugins, type-aware rules)
  version`;

const [command, ...rest] = process.argv.slice(2);

const options = {
  output: { type: "string", short: "o" },
  target: { type: "string" },
  jsx: { type: "string" },
  "jsx-import-source": { type: "string" },
  development: { type: "boolean" },
  decorators: { type: "string" },
  "decorator-metadata": { type: "boolean" },
  "react-refresh": { type: "boolean" },
  "styled-components": { type: "boolean" },
  helpers: { type: "string" },
  sourcemap: { type: "boolean" },
  "no-compress": { type: "boolean" },
  "no-mangle": { type: "boolean" },
  "top-level": { type: "boolean" },
  "keep-whitespace": { type: "boolean" },
  "drop-console": { type: "boolean" },
  "strip-internal": { type: "boolean" },
  write: { type: "boolean" },
  check: { type: "boolean" },
  config: { type: "string" },
  "no-discover": { type: "boolean" },
  fix: { type: "boolean" },
  "fix-suggestions": { type: "boolean" },
  "fix-dangerously": { type: "boolean" },
  json: { type: "boolean" },
  from: { type: "string" },
  tsconfig: { type: "string" },
  condition: { type: "string", multiple: true },
  plugin: { type: "string" },
  help: { type: "boolean", short: "h" },
} as const;

async function emit(text: string, output: string | undefined) {
  if (output) await Bun.write(output, text);
  else process.stdout.write(text.endsWith("\n") ? text : `${text}\n`);
}

async function main(): Promise<number> {
  if (!command || command === "help" || command === "--help" || command === "-h") {
    console.log(USAGE);
    return command ? 0 : 1;
  }
  if (command === "version" || command === "--version") {
    console.log(version());
    return 0;
  }
  if (command === "oxlint") {
    const out = await runOxlint(rest);
    process.stdout.write(out.stdout);
    process.stderr.write(out.stderr);
    return out.exitCode;
  }

  const { values: v, positionals: files } = parseArgs({ args: rest, options, allowPositionals: true });
  const read = (file: string) => Bun.file(file).text();

  switch (command) {
    case "transform": {
      const [file] = files;
      if (!file) break;
      const out = transform(await read(file), file, {
        target: v.target,
        jsx: v.jsx as "automatic" | "classic" | undefined,
        jsxImportSource: v["jsx-import-source"],
        development: v.development,
        decorators: v.decorators as "legacy" | "standard" | undefined,
        emitDecoratorMetadata: v["decorator-metadata"],
        reactRefresh: v["react-refresh"],
        styledComponents: v["styled-components"],
        helpersModule: v.helpers,
        sourcemap: v.sourcemap,
      });
      await emit(out.code, v.output);
      if (out.map && v.output) await Bun.write(`${v.output}.map`, out.map);
      return 0;
    }
    case "minify": {
      const [file] = files;
      if (!file) break;
      const out = minifyWithMap(await read(file), file, {
        compress: !v["no-compress"],
        mangle: !v["no-mangle"],
        topLevel: v["top-level"],
        whitespace: !v["keep-whitespace"],
        dropConsole: v["drop-console"],
        target: v.target,
        sourcemap: v.sourcemap,
      });
      await emit(out.code, v.output);
      if (out.map && v.output) await Bun.write(`${v.output}.map`, out.map);
      return 0;
    }
    case "dts": {
      const [file] = files;
      if (!file) break;
      await emit(isolatedDeclaration(await read(file), file, { stripInternal: v["strip-internal"] }).code, v.output);
      return 0;
    }
    case "format": {
      if (!files.length) break;
      let unformatted = 0;
      for (const file of files) {
        const source = await read(file);
        const formatted = format(source, resolvePath(file), {
          configPath: v.config,
          discoverConfig: !v["no-discover"],
        });
        if (v.check) {
          if (formatted !== source) {
            unformatted++;
            console.log(file);
          }
        } else if (v.write) {
          if (formatted !== source) await Bun.write(file, formatted);
        } else {
          process.stdout.write(formatted);
        }
      }
      return unformatted > 0 ? 1 : 0;
    }
    case "lint": {
      if (!files.length) break;
      const fix: LintOptions["fix"] = v["fix-dangerously"]
        ? "dangerous"
        : v["fix-suggestions"]
          ? "suggestions"
          : v.fix || undefined;
      let errors = 0;
      const json: Record<string, unknown> = {};
      for (const file of files) {
        const source = await read(file);
        const report = lint(source, resolvePath(file), { configPath: v.config, discoverConfig: !v.config, fix });
        if (report.fixed !== undefined) await Bun.write(file, report.fixed);
        errors += report.errorCount;
        if (v.json) json[file] = report;
        else if (report.diagnostics.length) console.log(formatDiagnostics(file, source, report.diagnostics));
      }
      if (v.json) console.log(JSON.stringify(json, null, 2));
      return errors > 0 ? 1 : 0;
    }
    case "check": {
      if (!files.length) break;
      let failed = 0;
      const json: Record<string, unknown> = {};
      for (const file of files) {
        const source = await read(file);
        const result = check(source, file);
        if (!result.ok) failed++;
        if (v.json) json[file] = result;
        else if (result.diagnostics.length) console.log(formatDiagnostics(file, source, result.diagnostics));
      }
      if (v.json) console.log(JSON.stringify(json, null, 2));
      return failed > 0 ? 1 : 0;
    }
    case "resolve": {
      const [specifier] = files;
      if (!specifier) break;
      const from = resolvePath(v.from ?? ".");
      console.log(
        JSON.stringify(resolve(from, specifier, { tsconfig: v.tsconfig, conditionNames: v.condition }), null, 2),
      );
      return 0;
    }
    case "parse":
    case "analyze": {
      const [file] = files;
      if (!file) break;
      const source = await read(file);
      const result = command === "parse" ? parse(source, file) : analyze(source, file);
      await emit(JSON.stringify(result, null, 2), v.output);
      return 0;
    }
    case "rules": {
      const rules = lintRules().filter(rule => !v.plugin || rule.plugin === v.plugin);
      if (v.json) console.log(JSON.stringify(rules, null, 2));
      else for (const rule of rules) console.log(`${rule.plugin}/${rule.name}\t${rule.category}\t${rule.fix}`);
      return 0;
    }
    default:
      console.error(`bun-oxc: unknown command "${command}"\n\n${USAGE}`);
      return 1;
  }
  console.error(`bun-oxc ${command}: missing argument\n\n${USAGE}`);
  return 1;
}

try {
  process.exitCode = await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
