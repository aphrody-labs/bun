import type { BunPlugin } from "bun";
import { mkdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import type * as Parser from "../vendor/oxc-parser/index";
import { native } from "./native";

export { nativePath, platformKeys } from "./native";
export { definePlugin, defineRule, defineConfig, runOxlint } from "./oxlint";
export type { OxlintPlugin, OxlintRule, OxlintConfig, RunOxlintOptions } from "./oxlint";
// The official oxc-parser / oxc-transform / oxc-minify APIs (async ones under the subpaths
// `@aphrody/bun-plugin-oxc/parser`, `/transform`, `/minify`).
export { transformSync, isolatedDeclarationSync, moduleRunnerTransformSync } from "./transform";
export { minifySync } from "./minify";

export interface TransformOptions {
  /** `es2015` ... `es2024`, `esnext`, or engine targets such as `chrome58`, comma separated. */
  target?: string;
  /** JSX runtime. Default `"automatic"`. */
  jsx?: "automatic" | "classic";
  /** Package the automatic runtime imports from. Default `react`. */
  jsxImportSource?: string;
  /** Classic runtime factory. Default `React.createElement`. */
  jsxPragma?: string;
  /** Classic runtime fragment. Default `React.Fragment`. */
  jsxPragmaFrag?: string;
  /** Development JSX (`jsxDEV`, `__self`, `__source`). */
  development?: boolean;
  /** Also return a source map (JSON string). */
  sourcemap?: boolean;
  /**
   * `"legacy"`: TypeScript `experimentalDecorators` lowering. `"standard"` (default): 2023-11
   * decorators kept as written.
   */
  decorators?: "legacy" | "standard";
  /** `design:*` metadata for legacy decorators (`emitDecoratorMetadata`). */
  emitDecoratorMetadata?: boolean;
  /** React Fast Refresh registrations (`$RefreshReg$`, `$RefreshSig$`). */
  reactRefresh?: boolean;
  /** styled-components plugin (display names, file names, SSR ids). */
  styledComponents?: boolean;
  /** Import lowering helpers from this module (for example `@oxc-project/runtime`). */
  helpersModule?: string;
}

export interface TransformResult {
  code: string;
  /** Source map JSON; present when `sourcemap` is set. */
  map?: string;
}

export interface MinifyOptions {
  /** Dead-code elimination and constant folding. Default `true`. */
  compress?: boolean;
  /** Rename local bindings. Default `true`. */
  mangle?: boolean;
  /** Also mangle and drop unused top-level bindings. Default `false`. */
  topLevel?: boolean;
  /** Print without whitespace. Default `true`. */
  whitespace?: boolean;
  dropConsole?: boolean;
  /** Default `true`. */
  dropDebugger?: boolean;
  /** Syntax the output may use (`es2015`, `esnext`, `chrome58`...). */
  target?: string;
  sourcemap?: boolean;
}

export interface ModuleRequest {
  specifier: string;
  /** UTF-16 offsets of the quoted specifier. */
  start: number;
  end: number;
  typeOnly: boolean;
  isImport: boolean;
}

export interface ExportEntry {
  name: string;
  start: number;
  end: number;
  typeOnly: boolean;
}

export interface ModuleAnalysis {
  imports: string[];
  exports: string[];
  hasModuleSyntax: boolean;
  spanEncoding: "utf16";
  requests: ModuleRequest[];
  exportEntries: ExportEntry[];
}

/** ESTree `Program` (Oxc serializer, UTF-16 spans). */
export interface EstreeProgram {
  type: "Program";
  body: unknown[];
  [key: string]: unknown;
}

export interface DiagnosticLabel {
  /** UTF-16 offsets. */
  start: number;
  end: number;
  message?: string | null;
  primary: boolean;
}

export interface Diagnostic {
  message: string;
  severity: "error" | "warning" | "advice";
  code?: string | null;
  help?: string | null;
  url?: string | null;
  labels: DiagnosticLabel[];
}

export interface LintDiagnostic extends Diagnostic {
  /** Whether oxlint can fix it: `"fix"`, `"suggestions"` or `"none"`. */
  fixable: "none" | "fix" | "suggestions";
}

export interface CheckResult {
  ok: boolean;
  diagnostics: Diagnostic[];
}

export interface LintOptions {
  /** Base for relative file names and config discovery. */
  cwd?: string;
  /** Inline `.oxlintrc.json` content (`plugins`, `rules`, `categories`, `overrides`...). */
  config?: Record<string, unknown>;
  /** Explicit `.oxlintrc.json(c)`. */
  configPath?: string;
  /** Use the nearest `.oxlintrc.json(c)` above the file when no config is given. */
  discoverConfig?: boolean;
  /** `true`/`"safe"` (`--fix`), `"suggestions"` (`--fix-suggestions`), `"dangerous"` (`--fix-dangerously`). */
  fix?: boolean | "safe" | "suggestions" | "dangerous";
}

export interface LintResult {
  diagnostics: LintDiagnostic[];
  /** Fixed source when `fix` was requested and a fix applied. */
  fixed?: string;
  errorCount: number;
  warningCount: number;
}

export interface LintRule {
  name: string;
  plugin: string;
  category: string;
  default: boolean;
  fix: string;
  fixable: boolean;
  docs: string;
  version: string;
  typeAware: boolean;
}

export interface FormatOptions {
  cwd?: string;
  /** Inline `.oxfmtrc.json` options (`printWidth`, `singleQuote`, `semi`, `sortImports`...). */
  config?: Record<string, unknown>;
  /** Explicit `.oxfmtrc.json(c)`. */
  configPath?: string;
  /** Use `.oxfmtrc.json(c)` and `.editorconfig` found from `cwd` when no config is given. */
  discoverConfig?: boolean;
}

export interface ResolveOptions {
  cwd?: string;
  /** `"auto"`, a tsconfig path, or `{ configFile, references }`. */
  tsconfig?: "auto" | string | { configFile: string; references?: "auto" | "disabled" | string[] };
  alias?: Record<string, string | string[] | false>;
  fallback?: Record<string, string | string[] | false>;
  aliasFields?: string[][];
  conditionNames?: string[];
  exportsFields?: string[][];
  importsFields?: string[][];
  extensionAlias?: Record<string, string[]>;
  extensions?: string[];
  mainFields?: string[];
  mainFiles?: string[];
  modules?: string[];
  roots?: string[];
  enforceExtension?: boolean;
  fullySpecified?: boolean;
  preferRelative?: boolean;
  preferAbsolute?: boolean;
  resolveToContext?: boolean;
  symlinks?: boolean;
  nodePath?: boolean;
  builtinModules?: boolean;
  moduleType?: boolean;
}

export interface Resolution {
  path: string;
  query?: string | null;
  fragment?: string | null;
  moduleType?: string | null;
}

export interface IsolatedDeclarationOptions {
  /** Drop declarations with an `@internal` JSDoc tag. */
  stripInternal?: boolean;
  sourcemap?: boolean;
}

function codeResult(out: { code: string; map?: string | null }): TransformResult {
  return out.map == null ? { code: out.code } : { code: out.code, map: out.map };
}

/** Version of the native addon. */
export const version = (): string => native().version();

/** TypeScript/JSX to JavaScript. The extension of `filename` selects the syntax. Throws on errors. */
export const transform = (source: string, filename: string, options?: TransformOptions): TransformResult =>
  codeResult(native().bridgeTransform(source, filename, options));

/** Minified code. */
export const minify = (source: string, filename: string, options?: MinifyOptions): string =>
  native().bridgeMinify(source, filename, options).code;

/** Minified code with its source map when `options.sourcemap` is set. */
export const minifyWithMap = (source: string, filename: string, options?: MinifyOptions): TransformResult =>
  codeResult(native().bridgeMinify(source, filename, options));

/** `.d.ts` text under `--isolatedDeclarations`. Exports that need inference throw `[transform]`. */
export const isolatedDeclaration = (
  source: string,
  filename: string,
  options?: IsolatedDeclarationOptions,
): TransformResult => codeResult(native().isolatedDeclarationText(source, filename, options));

/** Formatted code from oxfmt's native formatters (JS/TS, JSON, CSS, GraphQL, Markdown, YAML, TOML). */
export const format = (source: string, filename: string, options?: FormatOptions): string =>
  native().format(source, filename, options);

/** oxlint diagnostics with every built-in rule and plugin; `fix` applies fixes. */
export function lint(source: string, filename: string, options?: LintOptions): LintResult {
  const out = native().lint(source, filename, options);
  const result: LintResult = {
    diagnostics: out.diagnostics as LintDiagnostic[],
    errorCount: out.errorCount,
    warningCount: out.warningCount,
  };
  if (out.fixed != null) result.fixed = out.fixed;
  return result;
}

/** Source with safe oxlint fixes applied (unchanged when nothing applies). */
export const lintFix = (
  source: string,
  filename: string,
  options?: Omit<LintOptions, "fix"> & { fix?: LintOptions["fix"] },
): string => lint(source, filename, { fix: true, ...options }).fixed ?? source;

/** Every oxlint rule. */
export const lintRules = (): LintRule[] => native().lintRules() as LintRule[];

/** Syntax and semantic errors (redeclarations, invalid assignments...). */
export const check = (source: string, filename: string): CheckResult => native().check(source, filename) as CheckResult;

/** Resolves `specifier` from `from` (a file or a directory) with `oxc_resolver`. Throws `[resolve]`. */
export const resolve = (from: string, specifier: string, options?: ResolveOptions): Resolution =>
  native().resolve(from, specifier, options) as Resolution;

/** Static imports and exports in source order. */
export const analyze = (source: string, filename: string): ModuleAnalysis =>
  native().analyze(source, filename) as ModuleAnalysis;

/** ESTree program as plain JSON. For the full oxc-parser result use `parseSync`. */
export const parse = (source: string, filename: string): EstreeProgram =>
  native().bridgeParse(source, filename) as EstreeProgram;

/**
 * oxc-parser's `parseSync` (program, comments, module record, errors). Loaded on first use: the
 * oxc-parser JS layer binds the addon when it is imported.
 */
export const parseSync: typeof Parser.parseSync = (filename, sourceText, options) =>
  (require("./parser") as typeof import("./parser")).parseSync(filename, sourceText, options);

/** 1-based line and column of a UTF-16 offset. */
export function lineColumn(source: string, offset: number): { line: number; column: number } {
  let line = 1;
  let lineStart = 0;
  for (let i = source.indexOf("\n"); i !== -1 && i < offset; i = source.indexOf("\n", i + 1)) {
    line++;
    lineStart = i + 1;
  }
  return { line, column: offset - lineStart + 1 };
}

/** `path:line:col severity code: message` lines. */
export function formatDiagnostics(path: string, source: string, diagnostics: Diagnostic[]): string {
  return diagnostics
    .map(d => {
      const label = d.labels.find(l => l.primary) ?? d.labels[0];
      const at = label ? lineColumn(source, label.start) : { line: 1, column: 1 };
      return `${path}:${at.line}:${at.column} ${d.severity}${d.code ? ` ${d.code}` : ""}: ${d.message}`;
    })
    .join("\n");
}

export interface PluginLintOptions extends Omit<LintOptions, "fix" | "cwd"> {
  /** `"warn"` prints diagnostics; `"error"` fails the load on any error-severity diagnostic. */
  level: "warn" | "error";
  /** Lint the fixed source and compile it (`fix` of {@link LintOptions}). */
  fix?: LintOptions["fix"];
}

export interface PluginDtsOptions {
  /** Directory the `.d.ts` files go to, mirroring the sources under `root`. */
  outdir: string;
  /** Default `process.cwd()`. */
  root?: string;
  stripInternal?: boolean;
}

export interface OxcPluginOptions {
  /** Modules to handle. Default: `.ts .tsx .mts .cts .jsx`. */
  filter?: RegExp;
  /** Transform options (target, JSX, decorators, React Refresh, styled-components, helpers). */
  transform?: Omit<TransformOptions, "sourcemap">;
  /** Append an inline source map. Ignored when `minify` is set. */
  sourcemap?: boolean;
  /** Minify each module after the transform (`true` or minify options). */
  minify?: boolean | Omit<MinifyOptions, "sourcemap">;
  /**
   * Lint each module outside `node_modules`. `"warn"` prints diagnostics, `"error"` fails the load;
   * the object form adds an oxlint config and fixes. Configs are discovered by default.
   */
  lint?: false | "warn" | "error" | PluginLintOptions;
  /** Write isolated declarations for each TypeScript module. */
  dts?: PluginDtsOptions;
  /**
   * `Bun.build` only: register the Rust `onBeforeParse` hook instead of `onLoad`. It runs on
   * Bun's bundler threads with `transform`; `minify`, `lint`, `dts` and `sourcemap` are rejected.
   */
  native?: boolean;
}

const DEFAULT_FILTER = /\.(?:[cm]?ts|tsx|jsx)$/;
const TS_SOURCE = /\.([cm]?)tsx?$/;
const DECLARATION = /\.d\.[cm]?ts$/;

function inlineMap(code: string, map: string): string {
  return `${code}//# sourceMappingURL=data:application/json;base64,${Buffer.from(map).toString("base64")}\n`;
}

function pluginLint(option: OxcPluginOptions["lint"]): PluginLintOptions | undefined {
  if (!option) return undefined;
  if (typeof option === "string") return { level: option, discoverConfig: true };
  return { discoverConfig: option.config === undefined && option.configPath === undefined, ...option };
}

/**
 * Bun plugin compiling TypeScript and JSX with Oxc. Works with `Bun.plugin` at runtime and with
 * `Bun.build`.
 */
export function oxcPlugin(options: OxcPluginOptions = {}): BunPlugin {
  const filter = options.filter ?? DEFAULT_FILTER;
  const lintOptions = pluginLint(options.lint);
  if (options.native) {
    for (const key of ["minify", "lint", "dts", "sourcemap"] as const) {
      if (options[key]) {
        throw new TypeError(`oxcPlugin: "${key}" is not supported with native: true`);
      }
    }
  }
  const minifyOptions = options.minify === true ? {} : options.minify || undefined;
  return {
    name: "bun-plugin-oxc",
    setup(build) {
      if (options.native) {
        if (typeof build.onBeforeParse !== "function") {
          throw new Error("oxcPlugin: native: true requires Bun.build (onBeforeParse)");
        }
        const napiModule = native();
        if (options.transform) {
          const external = napiModule.createTransformOptions(options.transform);
          build.onBeforeParse({ filter }, { napiModule, symbol: "oxc_transform_with", external });
        } else {
          build.onBeforeParse({ filter }, { napiModule, symbol: "oxc_transform" });
        }
        return;
      }
      build.onLoad({ filter }, async ({ path }) => {
        let source = await Bun.file(path).text();
        if (lintOptions && !/[\\/]node_modules[\\/]/.test(path)) {
          const { level, ...rest } = lintOptions;
          const report = lint(source, path, rest);
          if (report.diagnostics.length > 0) {
            // Offsets point into the source before fixes.
            const text = formatDiagnostics(path, source, report.diagnostics);
            const summary = `oxc lint: ${report.errorCount} error(s), ${report.warningCount} warning(s) in ${path}`;
            if (level === "error" && report.errorCount > 0) throw new Error(`${summary}\n${text}`);
            console.warn(`${summary}\n${text}`);
          }
          if (report.fixed !== undefined) source = report.fixed;
        }
        if (options.dts && TS_SOURCE.test(path) && !DECLARATION.test(path)) {
          const root = options.dts.root ?? process.cwd();
          const out = join(options.dts.outdir, relative(root, path)).replace(TS_SOURCE, ".d.$1ts");
          const dts = isolatedDeclaration(source, path, { stripInternal: options.dts.stripInternal });
          mkdirSync(dirname(out), { recursive: true });
          await Bun.write(out, dts.code);
        }
        const wantMap = !!options.sourcemap && !minifyOptions;
        const out = transform(source, path, { ...options.transform, sourcemap: wantMap });
        let contents = out.code;
        if (minifyOptions) contents = minify(contents, path.replace(/\.[^./\\]+$/, ".js"), minifyOptions);
        else if (out.map) contents = inlineMap(contents, out.map);
        return { contents, loader: "js" };
      });
    },
  };
}

export default oxcPlugin;
