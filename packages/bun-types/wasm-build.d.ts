/**
 * Build Rust crates into WebAssembly ES modules: `cargo build` for a `wasm32` target, then
 * `wasm-bindgen` (the version the crate's `Cargo.lock` pins), `wasm-opt` and a package with `.js`
 * and `.d.ts` files. This is what `bun wasm build` and `bun build --target=wasm` run.
 *
 * `wasm-bindgen` and `wasm-opt` are used from `PATH` when present; otherwise `wasm-bindgen` is
 * installed with `cargo` and `wasm-opt` (binaryen) is run through `bun x`, once, into
 * `$BUN_INSTALL/tools`.
 *
 * @example
 * ```ts
 * import wasm from "bun:wasm";
 *
 * const { js, wasm: file, bytes } = await wasm.build({ crate: "./crates/hello", outdir: "./pkg" });
 * ```
 *
 * @category Bundler
 */
declare module "bun:wasm" {
  type BindgenTarget = "web" | "bundler" | "nodejs" | "deno" | "no-modules" | "experimental-nodejs-module";

  interface BuildOptions {
    /** A crate directory, its `Cargo.toml`, or a `.rs` file in it. Defaults to the working directory. */
    crate?: string;
    /** A package of the Cargo workspace of {@link crate}, like `cargo build -p`. */
    package?: string;
    /**
     * A `.wasm` cargo already built (for example on another machine): packaged as is, without
     * running cargo.
     */
    artifact?: string;
    /** Output package directory. Defaults to `pkg` in the crate. Replaced only when the build succeeds. */
    outdir?: string;
    /** `wasm-bindgen --target`. Defaults to `"web"`: an ES module whose default export is `init()`. */
    target?: BindgenTarget;
    /**
     * Build for WASI: `"p1"` is `wasm32-wasip1` (loaded with `node:wasi`), `"p2"` is
     * `wasm32-wasip2`, a component transpiled to JavaScript by jco.
     */
    wasi?: "p1" | "p2";
    /** Any Rust target triple. Overrides {@link wasi}. Defaults to `wasm32-unknown-unknown`. */
    triple?: string;
    /** Cargo profile: `"release"` (default), `"dev"` or a custom profile name. */
    profile?: string;
    /** Base name of the generated files. Defaults to the crate's lib name. */
    name?: string;
    /** `wasm-opt` level such as `"Oz"` or `"O3"`, or `false`. Defaults to `"Oz"`, except for `profile: "dev"`. */
    optimize?: boolean | "O" | "O0" | "O1" | "O2" | "O3" | "O4" | "Os" | "Oz";
    /** Emit `.d.ts` files. Defaults to `true`. */
    typescript?: boolean;
    /** Run `wasm-bindgen` when the crate depends on it. Defaults to `true`. */
    bindgen?: boolean;
    /** Write a `package.json` in {@link outdir}. Defaults to `true`. */
    packageJson?: boolean;
    /** `name` in the generated `package.json`. Defaults to the crate name. */
    packageName?: string;
    /** Cargo features to enable. */
    features?: string[];
    noDefaultFeatures?: boolean;
    /** Pass `--locked` to cargo. */
    locked?: boolean;
    /** More `cargo build` arguments. */
    cargoArgs?: string[];
    /** Set to `false` to package the artifact cargo already built. */
    cargo?: boolean;
    /** Fail when the optimized `.wasm` is larger than this many bytes. */
    maxBytes?: number;
    /** Reuse {@link outdir} when the cargo artifact and options did not change. */
    cache?: boolean;
    /** Do not print cargo output and sizes. */
    quiet?: boolean;
  }

  interface BuildResult {
    outdir: string;
    /** The `.wasm` file. */
    wasm: string;
    /** The ES module to import. */
    js: string;
    dts: string | undefined;
    /** Size of the `.wasm` file. */
    bytes: number;
    /** Size before `wasm-opt`, when the package was built (not reused). */
    rawBytes?: number;
    /** Whether {@link BuildOptions.cache} reused the previous package. */
    cached: boolean;
  }

  interface OptimizeOptions {
    /** Defaults to the input file. */
    output?: string;
    /** Defaults to `"Oz"`. */
    level?: string;
    /** Keep debug info and the producers section. */
    debug?: boolean;
  }

  /** Builds a crate into a WebAssembly package. */
  function build(options?: BuildOptions): Promise<BuildResult>;

  /** Runs `wasm-opt` on a module. A result larger than the input is discarded. */
  function optimize(input: string, options?: OptimizeOptions): Promise<{ before: number; after: number }>;

  /**
   * A plugin for `Bun.plugin()` and `Bun.build()` that lets you import a crate:
   * `import init from "./crate/Cargo.toml"` or `import init, { greet } from "./crate/src/lib.rs"`.
   * The package is built into the crate's Cargo target directory and reused while the
   * artifact is unchanged.
   */
  function plugin(options?: Omit<BuildOptions, "crate" | "outdir" | "packageJson" | "cache">): import("bun").BunPlugin;

  const wasm: {
    build: typeof build;
    optimize: typeof optimize;
    plugin: typeof plugin;
  };
  export default wasm;
}
