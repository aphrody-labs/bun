// Names and wiring shared by the generator, the installer and the tests.

export const PLUGIN = "bun";
export const MARKETPLACE = "aphrody-bun";
export const DISPLAY_NAME = "Bun (Aphrody runtime)";
export const REPOSITORY = "https://github.com/aphrody-labs/bun";
export const AUTHOR = { name: "aphrody-labs", url: "https://github.com/aphrody-labs" };

/** The MCP server every target registers: the built-in server of the Aphrody runtime, over stdio. */
export const MCP_SERVER = { name: "bun", command: "bun", args: ["mcp"] };

/** The language server: `bun lsp` serves every language it routes (src/lsp/language.rs) on stdio. */
export const LSP_SERVER = { name: "bun", command: "bun", args: ["lsp", "--stdio"] };

/**
 * Which tools of `bun mcp` an agent should reach for instead of a built-in one. Only the tools the server
 * actually has (src/mcp/tools) are kept. `bash` matches the shell commands that do the same job.
 */
export const PREFER: { instead: string; bash: string; use: string[] }[] = [
  {
    instead: "Grep",
    bash: String.raw`^\s*(?:rg|grep|ag|ack|git\s+grep)\b`,
    use: ["graph_symbols", "graph_callers", "lsp_references", "lsp_definition", "vfs_grep"],
  },
  { instead: "Glob", bash: String.raw`^\s*(?:fd|find)\b`, use: ["vfs_find", "graph_query"] },
];

/** Where repository skills come from, first match of a name wins. Each is `<dir>/<name>/SKILL.md`. */
export const SKILL_ROOTS = [".claude/skills", "skills", ".agents/skills"];
/** Slash commands become skills too (`<name>.md` with a `description` front matter). */
export const COMMAND_ROOTS = [".claude/commands"];

/**
 * The skills made from the code, the docs and the memory fiches. A fiche goes to the first skill whose pattern
 * matches its name; `bun-aphrody` takes the rest.
 */
export const DERIVED_SKILLS: { name: string; fiches: RegExp[] }[] = [
  { name: "bun-build", fiches: [/^bun-build-/] },
  { name: "bun-tests", fiches: [/^bun-tests-/, /^bun-toolchain-bundler-tests$/, /^bun-review-rules$/] },
  { name: "bun-crates", fiches: [/^bun-core-/, /^bun-toolchain-/] },
  { name: "bun-runtime", fiches: [/^bun-runtime-/, /^bun-install-/, /^bun-graph-call-paths$/] },
  { name: "bun-docs", fiches: [/^bun-docs-/, /^bun-packages$/] },
  { name: "bun-aphrody", fiches: [/./] },
];

export const HOOKS = ["common.ts", "rewrite.ts", "session-start.ts", "pre-tool-use.ts", "post-tool-use.ts"];
