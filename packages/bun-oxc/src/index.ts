import type { BunPlugin } from "bun";
import { native, nativePath } from "./native";

export { nativePath, platformKeys } from "./native";

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
}

export interface TransformResult {
  code: string;
  /** Source map JSON; present when `sourcemap` is set. */
  map?: string;
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

/** Version of the native addon. */
export const version = (): string => native().version();

/** TypeScript/JSX to JavaScript. The extension of `filename` selects the syntax. Throws on errors. */
export function transform(source: string, filename: string, options?: TransformOptions): TransformResult {
  const out = native().transform(source, filename, options);
  return out.map == null ? { code: out.code } : { code: out.code, map: out.map };
}

/** Minified code. */
export const minify = (source: string, filename: string): string => native().minify(source, filename);

/** Formatted code. Runs the `oxfmt` binary (`APHRODY_OXFMT` overrides its path). */
export const format = (source: string, filename: string): string => native().format(source, filename);

/** Lint diagnostics (messages) with Oxc's default rules. Runs `oxlint` (`APHRODY_OXLINT`). */
export const lint = (source: string, filename: string): string[] => native().lint(source, filename);

/** Static imports and exports in source order. */
export const analyze = (source: string, filename: string): ModuleAnalysis =>
  native().analyze(source, filename) as ModuleAnalysis;

/** ESTree program. */
export const parse = (source: string, filename: string): EstreeProgram =>
  native().parse(source, filename) as EstreeProgram;

export interface OxcPluginOptions {
  /** Modules to handle. Default: `.ts .tsx .mts .cts .jsx`. */
  filter?: RegExp;
  /** Transform options (target, JSX). Not available with `native`. */
  transform?: Omit<TransformOptions, "sourcemap">;
  /** Append an inline source map. Ignored when `minify` is set. */
  sourcemap?: boolean;
  /** Minify each module after the transform. */
  minify?: boolean;
  /** Lint each module (outside `node_modules`): print diagnostics, or fail the load. */
  lint?: false | "warn" | "error";
  /**
   * `Bun.build` only: register the Rust `onBeforeParse` hook instead of `onLoad`. It runs on
   * Bun's bundler threads with default transform options; `transform`, `minify`, `lint` and
   * `sourcemap` are rejected.
   */
  native?: boolean;
}

const DEFAULT_FILTER = /\.(?:[cm]?ts|tsx|jsx)$/;

function inlineMap(code: string, map: string): string {
  return `${code}//# sourceMappingURL=data:application/json;base64,${Buffer.from(map).toString("base64")}\n`;
}

/**
 * Bun plugin compiling TypeScript and JSX with Oxc. Works with `Bun.plugin` at runtime and with
 * `Bun.build`.
 */
export function oxcPlugin(options: OxcPluginOptions = {}): BunPlugin {
  const filter = options.filter ?? DEFAULT_FILTER;
  const lintMode = options.lint || false;
  if (options.native) {
    for (const key of ["transform", "minify", "lint", "sourcemap"] as const) {
      if (options[key]) {
        throw new TypeError(`oxcPlugin: "${key}" is not supported with native: true`);
      }
    }
  }
  return {
    name: "bun-plugin-oxc",
    setup(build) {
      if (options.native) {
        if (typeof build.onBeforeParse !== "function") {
          throw new Error("oxcPlugin: native: true requires Bun.build (onBeforeParse)");
        }
        build.onBeforeParse({ filter }, { napiModule: native(), symbol: "oxc_transform" });
        return;
      }
      build.onLoad({ filter }, async ({ path }) => {
        const source = await Bun.file(path).text();
        if (lintMode && !/[\\/]node_modules[\\/]/.test(path)) {
          const diagnostics = lint(source, path);
          if (diagnostics.length > 0) {
            const text = diagnostics.map(message => `  ${message}`).join("\n");
            if (lintMode === "error") {
              throw new Error(`oxc lint: ${diagnostics.length} problem(s) in ${path}\n${text}`);
            }
            console.warn(`oxc lint: ${diagnostics.length} problem(s) in ${path}\n${text}`);
          }
        }
        const wantMap = !!options.sourcemap && !options.minify;
        const out = transform(source, path, { ...options.transform, sourcemap: wantMap });
        let contents = out.code;
        if (options.minify) contents = minify(contents, path.replace(/\.[^./\\]+$/, ".js"));
        else if (out.map) contents = inlineMap(contents, out.map);
        return { contents, loader: "js" };
      });
    },
  };
}

export default oxcPlugin;
