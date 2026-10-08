export interface WithBunOptions {
  /**
   * `"bun"` (default): `next build` compiles with Bun.build (Pages Router, experimental; needs
   * `next-bun patch`) unless the command passes `--turbopack` or `--webpack`. `"turbopack"`: Next's bundler.
   */
  bundler?: "bun" | "turbopack";
  /** Module aliases for Turbopack and webpack: module names, `./`-relative paths (from the project) or absolute paths. */
  alias?: Record<string, string>;
  /** Packages resolved once from the project and aliased (subpaths included), so every importer gets one copy. */
  dedupe?: string[];
  /** `turbopack.root` and `outputFileTracingRoot` when unset; defaults to the workspace root. `false` leaves both alone. */
  root?: string | false;
  /** Adds every dependency that ships TypeScript sources to `transpilePackages` (default `true`). */
  transpileSources?: boolean;
  /** `next start` reuses the asset prefix and deployment id baked in by its build (default `true`). */
  freezeBuildConfig?: boolean;
  /** The app directory (default `process.cwd()`); pass `__dirname` from next.config. */
  projectDir?: string;
}

type ConfigOrFunction<T> = T | ((phase: string, ctx: any) => T | Promise<T>);

/** Wraps a Next.js config for Bun; see {@link WithBunOptions}. */
export function withBun<T extends object>(
  nextConfig: ConfigOrFunction<T>,
  options?: WithBunOptions,
): (phase: string, ctx: any) => Promise<T>;
