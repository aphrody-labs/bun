import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

// `[workspace.lints]` in the root Cargo.toml denies every warning, and much that rustc and clippy allow by default. It
// applies to a crate only if the crate says so. A crate that does not gets the defaults, under which the same findings
// are warnings, and `cargo clippy` passes.
// Members imported without the workspace lints, pending conversion: a ratchet, never add to it.
const PENDING = new Set([
  "packages/bun-build-mdx-rs/swc_common",
  "packages/bun-runtime-sdk/crates/yolo-runtime",
  "packages/bun-winsvc",
  "src/google",
  "src/zlib_rs",
  "src/browser/crates/api",
  "src/browser/crates/browser",
  "src/browser/crates/cdp",
  "src/browser/crates/dom",
  "src/browser/crates/js",
  "src/browser/crates/mcp",
  "src/browser/crates/net",
  "src/browser/crates/render",
  "src/browser/crates/ssrf",
  "src/browser/crates/extract",
  "src/browser/crates/layout",
  "src/browser/crates/service",
  "src/browser/crates/crawl",
  "src/browser/crates/detect",
  "src/browser/crates/index",
  "src/quality/format_cli",
  "src/quality/lint_cli",
  "src/transpiler/ecma_engine",
  "src/collections/arena",
  "src/ast/ecma",
  "src/ast/macros",
  "src/ast/visit",
  "src/sema/cfg",
  "src/js_printer/ecma",
  "src/transpiler/compat",
  "src/quality/config",
  "src/collections/ecma",
  "src/quality/diagnostics",
  "src/sema/ecmascript",
  "src/ast/estree",
  "src/ast/estree_tokens",
  "src/quality/format_js",
  "src/quality/format_core",
  "src/quality/format_css",
  "src/quality/format_graphql",
  "src/quality/format_json",
  "src/quality/format_markdown",
  "src/quality/format_tests",
  "src/quality/format_yaml",
  "src/transpiler/declarations",
  "src/js_parser/jsdoc",
  "src/lsp/quality",
  "src/js_parser/lexer",
  "src/quality/linter",
  "src/quality/macros",
  "src/transpiler/mangler",
  "src/transpiler/minifier",
  "src/quality/adapters/common",
  "src/js_parser/ecma",
  "src/react_compiler/ecma",
  "src/js_parser/regexp",
  "src/transpiler/relay",
  "src/sema/ecma",
  "src/ast/span",
  "src/bun_core/ecma_strings",
  "src/ast/syntax",
  "src/transpiler/ecma",
  "src/transpiler/plugins",
  "src/ast/traverse",
  "src/quality/adapters/minify",
  "src/quality/adapters/parser",
  "src/quality/adapters/playground",
  "src/quality/adapters/transform",
  "src/quality/adapters/react",
  "src/quality/adapters/relay",
  "src/codegen/ecma_ast_tools",
  "src/codegen/ecma_benchmark",
  "src/codegen/ecma_codegen_conformance",
  "src/codegen/ecma_common",
  "src/codegen/ecma_compat_data",
  "src/codegen/ecma_coverage",
  "src/codegen/ecma_linter_codegen",
  "src/codegen/ecma_minsize",
  "src/codegen/ecma_rulegen",
  "src/codegen/ecma_track_linter_timings",
  "src/codegen/ecma_track_memory_allocations",
  "src/codegen/ecma_transform_checker",
  "src/codegen/ecma_transform_conformance",
  "src/codegen/ecma_website_common",
  "src/codegen/ecma_website_formatter",
  "src/codegen/ecma_website_linter",
  "src/transpiler/browserslist",
  "src/css/parser",
  "src/parsers/graphql",
  "src/md/parser",
  "src/parsers/json_schema",
  "src/parsers/toml_formatter",
  "src/parsers/yaml",
  "src/collections/typed_index",
  "src/resolver/ecma",
  "src/parsers/json_schema_macros",
  "src/sourcemap/ecma",
]);

test("every crate of the workspace has the lints of the workspace", () => {
  const repoRoot = path.resolve(import.meta.dir, "..", "..", "..");
  const root = readFileSync(path.join(repoRoot, "Cargo.toml"), "utf8");
  const members = [...(/^members = \[([^\]]*)\]/m.exec(root)?.[1] ?? "").matchAll(/"([^"]+)"/g)].map(it => it[1]);
  expect(members.length).toBeGreaterThan(100);

  const without = members.filter(member => {
    const manifest = readFileSync(path.join(repoRoot, member, "Cargo.toml"), "utf8");
    // A table of its own, like `[lints.rust]`, would replace them. Cargo refuses to have both.
    return !/^\[lints\]\r?\nworkspace = true$/m.test(manifest);
  });
  expect(without.filter(member => !PENDING.has(member))).toEqual([]);
  // Remove a member from PENDING once it adopts the lints.
  expect([...PENDING].filter(member => !without.includes(member))).toEqual([]);
});
