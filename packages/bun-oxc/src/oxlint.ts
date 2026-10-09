// oxlint JS plugins. The in-process `lint()` runs every built-in rule but not `jsPlugins`: those run in
// the oxlint CLI (npm `oxlint`, which hosts the plugin JS). These helpers mirror `oxlint`'s exports so a
// plugin written against this package also loads in oxlint, and `runOxlint` spawns the CLI.

/** oxlint JS plugin: `{ meta: { name }, rules: { [name]: Rule } }`. See https://oxc.rs/docs/guide/usage/linter/js-plugins. */
export interface OxlintPlugin {
  meta?: { name?: string; [key: string]: unknown };
  rules: Record<string, OxlintRule>;
  [key: string]: unknown;
}

/** ESLint-style rule: `create(context)` (or oxlint's `createOnce`) returning AST visitors. */
export interface OxlintRule {
  meta?: Record<string, unknown>;
  create?: (context: any) => Record<string, (...args: any[]) => void>;
  createOnce?: (context: any) => Record<string, (...args: any[]) => void>;
  [key: string]: unknown;
}

/** `.oxlintrc.json` content (`plugins`, `jsPlugins`, `rules`, `categories`, `overrides`...). */
export type OxlintConfig = Record<string, unknown>;

/** Identity helper, as `definePlugin` from `oxlint/plugins`. */
export const definePlugin = <T extends OxlintPlugin>(plugin: T): T => plugin;

/** Identity helper, as `defineRule` from `oxlint/plugins`. */
export const defineRule = <T extends OxlintRule>(rule: T): T => rule;

/** Identity helper, as `defineConfig` from `oxlint`. */
export const defineConfig = <T extends OxlintConfig>(config: T): T => config;

export interface RunOxlintOptions {
  cwd?: string;
  /** oxlint executable. Default: `APHRODY_OXLINT`, else `oxlint` on PATH. */
  bin?: string;
  env?: Record<string, string | undefined>;
}

/**
 * Runs the oxlint CLI (needed for `jsPlugins`, type-aware rules and multi-file runs) and returns its
 * output. Pass `--format json` to get machine-readable diagnostics in `stdout`.
 */
export async function runOxlint(
  args: string[],
  options: RunOxlintOptions = {},
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const bin = options.bin ?? process.env.APHRODY_OXLINT ?? "oxlint";
  await using proc = Bun.spawn({
    cmd: [bin, ...args],
    cwd: options.cwd,
    env: options.env ?? process.env,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
  return { exitCode, stdout, stderr };
}
