// Configuration identities for existing plugin definitions. Quality execution uses the native
// `lint()` API or `bun lint`; unsupported JS plugins return an error without an external fallback.

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

