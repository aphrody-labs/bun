// The Tailwind CSS v4 engine shared by the Bun plugin and the PostCSS plugin:
// compiles one CSS root with `@tailwindcss/node`, scans candidates with the
// Oxide scanner, tracks the files the compiler read so a later build only
// recompiles when one of them changed, and optionally optimizes the output
// with Lightning CSS.
import { compile, optimize, toSourceMap } from "@tailwindcss/node";
import { clearRequireCache } from "@tailwindcss/node/require-cache";
import { Scanner, type SourceEntry } from "@tailwindcss/oxide";
import enhancedResolve from "enhanced-resolve";
import fs, { readFileSync, statSync } from "node:fs";
import { dirname, extname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { m3Prelude, type M3Options, type Prelude } from "./m3.ts";

/** A file or glob to scan for class candidates, on top of the sources the CSS declares with `@source`. */
export type SourceOption = string | { base?: string; pattern: string; negated?: boolean };

export interface TailwindOptions {
  /**
   * Directory of automatic source detection when the CSS does not set
   * `source(...)`. Default: the `root` of the build, else the working directory.
   */
  base?: string;
  /**
   * Extra sources, relative to `base`. A string starting with `!` excludes
   * files, like `@source not`.
   */
  sources?: SourceOption[];
  /**
   * Run the generated CSS through Lightning CSS (`optimize` of
   * `@tailwindcss/node`): `true`, or `{ minify }`. Default: off, the bundler
   * already lowers and minifies CSS.
   */
  optimize?: boolean | { minify?: boolean };
  /** Shorthand for `optimize: { minify: true }`. */
  minify?: boolean;
  /**
   * Append an inline source map that points at the original stylesheets
   * (`/*# sourceMappingURL=data:… *\/`).
   */
  sourcemap?: boolean;
  /**
   * Material 3: `"m3"` adds the tokens, the Tailwind preset of
   * `@aphrody/m3-tailwind` and a colour scheme from the default seed after
   * `@import "tailwindcss"`; pass `M3Options` to choose the seed or drop parts.
   */
  theme?: "m3" | M3Options;
}

/** Bit set of `Features` from `tailwindcss`: any of these makes a file a Tailwind root. */
const TAILWIND_FEATURES =
  1 /* AtApply */ |
  4 /* JsPluginCompat */ |
  8 /* ThemeFunction */ |
  16 /* Utilities */ |
  32 /* Variants */ |
  64; /* AtTheme */
const UTILITIES = 16;

/** Cheap pre-check before compiling: a stylesheet without these cannot need Tailwind. */
const DIRECTIVE =
  /@(?:import|tailwind|apply|theme|source|utility|variant|custom-variant|config|plugin|reference)\b|\b(?:theme|--theme|--spacing|--alpha)\(/;

export function mayUseTailwind(css: string): boolean {
  return DIRECTIVE.test(css);
}

// `__dirname` in the CommonJS build, which has no `import.meta`.
const PACKAGE_DIR = typeof __dirname === "string" ? __dirname : dirname(fileURLToPath(import.meta.url));

const cssResolver = enhancedResolve.ResolverFactory.createResolver({
  fileSystem: new enhancedResolve.CachedInputFileSystem(fs as never, 4000),
  useSyncFileSystemCalls: true,
  extensions: [".css"],
  mainFields: ["style"],
  conditionNames: ["style"],
});

function tryResolve(id: string, base: string): string | undefined {
  try {
    const found = cssResolver.resolveSync({}, base, id);
    return typeof found === "string" ? found : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Resolves a CSS `@import` from the stylesheet's directory first, then from this
 * package, so `@import "tailwindcss"` and the M3 sheets work in a project that
 * did not install them itself.
 */
export async function resolveCss(id: string, base: string, fallback = true): Promise<string | undefined> {
  return tryResolve(id, base) ?? (fallback && isBare(id) ? tryResolve(id, PACKAGE_DIR) : undefined);
}

function isBare(id: string) {
  return !id.startsWith(".") && !isAbsolute(id) && !/^[a-z][a-z0-9+.-]*:/i.test(id);
}

export function normalizeSources(sources: SourceOption[] | undefined, base: string): SourceEntry[] {
  return (sources ?? []).map(source => {
    if (typeof source === "string") {
      const negated = source.startsWith("!");
      return { base, pattern: negated ? source.slice(1) : source, negated };
    }
    return { base: resolve(base, source.base ?? "."), pattern: source.pattern, negated: !!source.negated };
  });
}

/** Inserts the prelude imports right after `@import "tailwindcss"` (or at the top) and appends its base rules. */
export function withPrelude(css: string, prelude: Prelude | undefined): string {
  if (!prelude) return css;
  const { imports, base } = prelude;
  const m = /@import\s+(?:url\(\s*)?["']tailwindcss["'][^;]*;/.exec(css);
  const end = m ? m.index + m[0].length : 0;
  let out = imports ? `${css.slice(0, end)}\n${imports}\n${css.slice(end)}` : css;
  if (base) out += `\n@layer base {\n${base}\n}\n`;
  return out;
}

/**
 * `@import "m3:theme.css"`: a scheme another plugin of the build resolves. Tailwind only passes
 * `data:` and `http(s):` imports through and fails on the others, so they stand in as
 * `https://external.invalid/<n>` during the compile.
 */
const SCHEME_IMPORT =
  /@import\s+(?:url\(\s*)?(["'])(?!(?:data|https?):)(?![a-z]:[\\/])[a-z][a-z0-9+.-]*:[^"']*\1\s*\)?[^;]*;/gi;
const HELD_IMPORT = /@import\s+(?:url\(\s*)?["']?https:\/\/external\.invalid\/(\d+)["']?\s*\)?[^;]*;/g;

function holdSchemeImports(css: string): { css: string; held: string[] } {
  const held: string[] = [];
  const out = css.replace(SCHEME_IMPORT, (rule, quote: string) => {
    const index = held.push(rule) - 1;
    return rule.replace(/(["'])[^"']*\1/, `${quote}https://external.invalid/${index}${quote}`);
  });
  return { css: out, held };
}

/**
 * Puts the held imports back, first in the sheet: Tailwind leaves them after its own rules.
 * Each one moves to a line of its own and leaves an empty line behind, so `map` only shifts by
 * whole lines.
 */
function restoreSchemeImports(css: string, held: string[], map: string | undefined) {
  if (!held.length) return { css, map };
  const rules: string[] = [];
  const rest = css.replace(HELD_IMPORT, (_, index: string) => {
    rules.push(held[Number(index)]);
    return "";
  });
  if (!rules.length) return { css, map };
  if (map) {
    const json = JSON.parse(map);
    json.mappings = ";".repeat(rules.length) + json.mappings;
    map = JSON.stringify(json);
  }
  return { css: `${rules.join("\n")}\n${rest}`, map };
}

export interface GenerateResult {
  css: string;
  /** Raw source map JSON when `sourcemap` is on. */
  map?: string;
  /** Every file the compiler read: the root, imported stylesheets, plugins, configs. */
  dependencies: string[];
  /** Directories and globs the scanner watches. */
  globs: { base: string; pattern: string }[];
  /** Files the scanner read candidates from. */
  scannedFiles: string[];
}

type Compiler = Awaited<ReturnType<typeof compile>>;

/** One CSS entry point. Keeps the compiler, the scanner and every candidate seen across rebuilds. */
export class TailwindRoot {
  readonly path: string;
  #options: TailwindOptions;
  #base: string;
  #compiler?: Compiler;
  #scanner?: Scanner;
  #input?: string;
  #dependencies = new Map<string, number | null>();
  #candidates = new Set<string>();
  #queue: Promise<unknown> = Promise.resolve();

  constructor(path: string, base: string, options: TailwindOptions = {}) {
    this.path = resolve(path);
    this.#base = base;
    this.#options = options;
  }

  /** Whether the compiled CSS may use `source(...)` candidates from `file`. */
  accepts(file: string): boolean {
    const root = this.#compiler?.root;
    if (root === "none") return false;
    if (!root) return true;
    return isInside(resolve(root.base, root.pattern), file);
  }

  /**
   * Compiles `input` (the content of `path`) and builds the CSS for every
   * candidate found so far. Returns `undefined` when the file uses no Tailwind
   * feature. `extra` adds candidates from outside the scanner (the module graph).
   */
  generate(input: string, extra?: (root: TailwindRoot) => Iterable<string>): Promise<GenerateResult | undefined> {
    const run = this.#queue.then(() => this.#generate(input, extra));
    this.#queue = run.catch(() => {});
    return run;
  }

  async #generate(
    input: string,
    extra?: (root: TailwindRoot) => Iterable<string>,
  ): Promise<GenerateResult | undefined> {
    const { css: source, held } = holdSchemeImports(
      withPrelude(input, this.#options.theme ? await m3Prelude(this.#options.theme) : undefined),
    );
    if (!this.#compiler || !this.#scanner || source !== this.#input || this.#changed()) {
      clearRequireCache([...this.#dependencies.keys()]);
      this.#dependencies.clear();
      this.#track(this.path);
      const base = dirname(this.path);
      this.#compiler = await compile(source, {
        base,
        from: this.#options.sourcemap ? this.path : undefined,
        shouldRewriteUrls: true,
        onDependency: path => this.#track(path),
        customCssResolver: resolveCss,
      });
      this.#input = source;
      const compiler = this.#compiler;
      const sources: SourceEntry[] =
        compiler.root === "none"
          ? []
          : compiler.root === null
            ? [{ base: this.#base, pattern: "**/*", negated: false }]
            : [{ ...compiler.root, negated: false }];
      sources.push(...normalizeSources(this.#options.sources, this.#base));
      sources.push(...compiler.sources);
      this.#scanner = new Scanner({ sources });
    }
    const compiler = this.#compiler;
    const scanner = this.#scanner;
    if (!(compiler.features & TAILWIND_FEATURES)) return undefined;

    if (compiler.features & UTILITIES) {
      const root = compiler.root;
      if (root && root !== "none") {
        const dir = resolve(root.base, root.pattern);
        if (!isDirectory(dir)) {
          throw new Error(`The path given to \`source(…)\` must be a directory but got \`source(${dir})\` instead.`);
        }
      }
      for (const candidate of scanner.scan()) this.#candidates.add(candidate);
      if (extra) for (const candidate of extra(this)) this.#candidates.add(candidate);
    }

    let css = compiler.build([...this.#candidates]);
    let map = this.#options.sourcemap ? toSourceMap(compiler.buildSourceMap()).raw : undefined;
    const { optimize: opt = !!this.#options.minify } = this.#options;
    if (opt) {
      const minify = this.#options.minify ?? (typeof opt === "object" ? (opt.minify ?? true) : true);
      const out = optimize(css, { file: this.path, minify, map });
      css = out.code;
      map = map ? out.map : undefined;
    }
    ({ css, map } = restoreSchemeImports(css, held, map));
    if (map) css += `\n${toSourceMap(map).inline}\n`;

    return {
      css,
      map,
      dependencies: [...this.#dependencies.keys()],
      globs: scanner.globs.map(({ base, pattern }) => ({ base, pattern })),
      scannedFiles: scanner.files,
    };
  }

  /** Candidates of arbitrary files, through this root's scanner. */
  scanFiles(files: string[]): string[] {
    if (!this.#scanner || !files.length) return [];
    // Oxide reads `file` entries only inside its own sources: pass the content.
    const changed: { content: string; extension: string }[] = [];
    for (const file of files) {
      try {
        changed.push({ content: readFileSync(file, "utf8"), extension: extname(file).slice(1) });
      } catch {}
    }
    return this.#scanner.scanFiles(changed);
  }

  #track(path: string) {
    this.#dependencies.set(path, mtime(path));
  }

  #changed(): boolean {
    for (const [path, time] of this.#dependencies) {
      if (time === null || mtime(path) !== time) return true;
    }
    return false;
  }
}

function mtime(path: string): number | null {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return null;
  }
}

function isDirectory(path: string) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

const isWindows = process.platform === "win32";

function comparable(path: string) {
  const p = resolve(path).replaceAll("\\", "/");
  return isWindows ? p.toLowerCase() : p;
}

function isInside(dir: string, file: string) {
  const a = comparable(dir);
  const b = comparable(file);
  return b === a || b.startsWith(a.endsWith("/") ? a : a + "/");
}
