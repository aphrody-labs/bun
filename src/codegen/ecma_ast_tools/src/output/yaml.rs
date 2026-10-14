use std::{fmt::Write, fs, path::Path};

use itertools::{Itertools, chain};

use crate::{AST_CHANGES_WATCH_LIST_PATH, RawOutput};

use super::{Output, add_header};

/// Add header to YAML.
pub fn print_yaml(code: &str, generator_path: &str) -> String {
    add_header(code, generator_path, "#")
}

impl Output {
    /// Generate CI watch list YAML file.
    ///
    /// This is used in `ast_changes` CI job to skip running `oxc_ast_tools`
    /// unless relevant files have changed.
    ///
    /// The watch list includes:
    /// * Glob patterns for watched crates (`{crate}/src/**/*.rs`)
    /// * Generated output file paths (excluding those already covered by crate globs)
    /// * `ast_tools` crate itself
    /// * CI workflow file
    /// * Config files (`Cargo.toml`, `Cargo.lock`, `package.json`, `oxfmtrc.jsonc`)
    ///
    /// `crate_paths` are crates containing AST types (discovered via `cargo metadata`).
    /// `oxc_*` dependency crates of `ast_tools` are also added, since changes to them
    /// may affect generated code.
    pub fn yaml_watch_list(
        outputs: &[RawOutput],
        mut crate_paths: Vec<String>,
        root_path: &Path,
    ) -> RawOutput {
        // Add trailing slashes to crate paths, so can use them for prefix matching below
        for path in &mut crate_paths {
            path.push('/');
        }

        // Add `oxc_*` dependency crates of `ast_tools` to the list.
        let cargo_toml = parse_toml("src/codegen/ecma_ast_tools/Cargo.toml", root_path);
        crate_paths.extend(
            cargo_toml
                .get("dependencies")
                .and_then(|v| v.as_table())
                .unwrap()
                .keys()
                .filter_map(|name| match name.as_str() {
                    "oxfmt" => Some("src/quality/format_cli/"),
                    "oxlint" => Some("src/quality/lint_cli/"),
                    "oxc" => Some("src/transpiler/ecma_engine/"),
                    "oxc_allocator" => Some("src/collections/arena/"),
                    "oxc_ast" => Some("src/ast/ecma/"),
                    "oxc_ast_macros" => Some("src/ast/macros/"),
                    "oxc_ast_visit" => Some("src/ast/visit/"),
                    "oxc_cfg" => Some("src/sema/cfg/"),
                    "oxc_codegen" => Some("src/js_printer/ecma/"),
                    "oxc_compat" => Some("src/transpiler/compat/"),
                    "oxc_config" => Some("src/quality/config/"),
                    "oxc_data_structures" => Some("src/collections/ecma/"),
                    "oxc_diagnostics" => Some("src/quality/diagnostics/"),
                    "oxc_ecmascript" => Some("src/sema/ecmascript/"),
                    "oxc_estree" => Some("src/ast/estree/"),
                    "oxc_estree_tokens" => Some("src/ast/estree_tokens/"),
                    "oxc_formatter" => Some("src/quality/format_js/"),
                    "oxc_formatter_core" => Some("src/quality/format_core/"),
                    "oxc_formatter_css" => Some("src/quality/format_css/"),
                    "oxc_formatter_graphql" => Some("src/quality/format_graphql/"),
                    "oxc_formatter_json" => Some("src/quality/format_json/"),
                    "oxc_formatter_markdown" => Some("src/quality/format_markdown/"),
                    "oxc_formatter_tests" => Some("src/quality/format_tests/"),
                    "oxc_formatter_yaml" => Some("src/quality/format_yaml/"),
                    "oxc_isolated_declarations" => Some("src/transpiler/declarations/"),
                    "oxc_jsdoc" => Some("src/js_parser/jsdoc/"),
                    "oxc_language_server" => Some("src/lsp/quality/"),
                    "oxc_lexer" => Some("src/js_parser/lexer/"),
                    "oxc_linter" => Some("src/quality/linter/"),
                    "oxc_macros" => Some("src/quality/macros/"),
                    "oxc_mangler" => Some("src/transpiler/mangler/"),
                    "oxc_minifier" => Some("src/transpiler/minifier/"),
                    "oxc_napi" => Some("src/quality/adapters/common/"),
                    "oxc_parser" => Some("src/js_parser/ecma/"),
                    "oxc_react_compiler" => Some("src/react_compiler/ecma/"),
                    "oxc_regular_expression" => Some("src/js_parser/regexp/"),
                    "oxc_relay" => Some("src/transpiler/relay/"),
                    "oxc_semantic" => Some("src/sema/ecma/"),
                    "oxc_span" => Some("src/ast/span/"),
                    "oxc_str" => Some("src/bun_core/ecma_strings/"),
                    "oxc_syntax" => Some("src/ast/syntax/"),
                    "oxc_transformer" => Some("src/transpiler/ecma/"),
                    "oxc_transformer_plugins" => Some("src/transpiler/plugins/"),
                    "oxc_traverse" => Some("src/ast/traverse/"),
                    "oxc_minify_napi" => Some("src/quality/adapters/minify/"),
                    "oxc_parser_napi" => Some("src/quality/adapters/parser/"),
                    "oxc_playground_napi" => Some("src/quality/adapters/playground/"),
                    "oxc_transform_napi" => Some("src/quality/adapters/transform/"),
                    "oxc_transform_react_napi" => Some("src/quality/adapters/react/"),
                    "oxc_transform_relay_napi" => Some("src/quality/adapters/relay/"),
                    "oxc_ast_tools" => Some("src/codegen/ecma_ast_tools/"),
                    "oxc_benchmark" => Some("src/codegen/ecma_benchmark/"),
                    "oxc_codegen_conformance" => Some("src/codegen/ecma_codegen_conformance/"),
                    "oxc_tasks_common" => Some("src/codegen/ecma_common/"),
                    "oxc_compat_data" => Some("src/codegen/ecma_compat_data/"),
                    "oxc_coverage" => Some("src/codegen/ecma_coverage/"),
                    "oxc_linter_codegen" => Some("src/codegen/ecma_linter_codegen/"),
                    "oxc_minsize" => Some("src/codegen/ecma_minsize/"),
                    "rulegen" => Some("src/codegen/ecma_rulegen/"),
                    "oxc_track_linter_timings" => Some("src/codegen/ecma_track_linter_timings/"),
                    "oxc_track_memory_allocations" => Some("src/codegen/ecma_track_memory_allocations/"),
                    "oxc_tasks_transform_checker" => Some("src/codegen/ecma_transform_checker/"),
                    "oxc_transform_conformance" => Some("src/codegen/ecma_transform_conformance/"),
                    "website_common" => Some("src/codegen/ecma_website_common/"),
                    "website_formatter" => Some("src/codegen/ecma_website_formatter/"),
                    "website_linter" => Some("src/codegen/ecma_website_linter/"),
                    "oxc-browserslist" => Some("src/transpiler/browserslist/"),
                    "oxc-css-parser" => Some("src/css/parser/"),
                    "oxc-graphql-parser" => Some("src/parsers/graphql/"),
                    "oxc-markdown-parser" => Some("src/md/parser/"),
                    "oxc-schemars" => Some("src/parsers/json_schema/"),
                    "oxc-toml" => Some("src/parsers/toml_formatter/"),
                    "oxc-yaml-parser" => Some("src/parsers/yaml/"),
                    "oxc_index" => Some("src/collections/typed_index/"),
                    "oxc_resolver" => Some("src/resolver/ecma/"),
                    "oxc_schemars_derive" => Some("src/parsers/json_schema_macros/"),
                    "oxc_sourcemap" => Some("src/sourcemap/ecma/"),
                    _ => None,
                }).map(str::to_owned),
        );
        crate_paths.sort_unstable();
        crate_paths.dedup();

        // Convert crate paths to glob patterns
        let crate_globs = crate_paths.iter().map(|p| format!("{p}src/**/*.rs")).collect_vec();

        // Collect output paths, excluding `.rs` files already covered by crate globs
        #[expect(clippy::case_sensitive_file_extension_comparisons)]
        let output_paths = outputs.iter().map(|output| output.path.as_str()).filter(|path| {
            !path.ends_with(".rs")
                || !crate_paths
                    .iter()
                    .find_map(|crate_path| path.strip_prefix(crate_path.as_str()))
                    .is_some_and(|rest| rest.starts_with("src/"))
        });

        // Combine all paths
        let mut paths = chain!(
            [
                AST_CHANGES_WATCH_LIST_PATH,
                "src/codegen/ecma_ast_tools/src/**",
                ".github/workflows/ci.yml",
                "package.json",
                "src/codegen/ecma_ast_tools/format.jsonc",
                "Cargo.toml",
                "Cargo.lock",
            ],
            crate_globs.iter().map(String::as_str),
            output_paths,
        )
        .collect_vec();

        paths.sort_unstable();

        // Generate YAML
        let mut code = "src:\n".to_string();
        for path in paths {
            writeln!(code, "  - '{path}'").unwrap();
        }

        let output = Self::Yaml { path: AST_CHANGES_WATCH_LIST_PATH.to_string(), code };
        output.into_raw(file!())
    }
}

/// Parse TOML file.
fn parse_toml(path: &str, root_path: &Path) -> toml::Table {
    let toml_content = fs::read_to_string(root_path.join(path)).unwrap();
    toml::from_str(&toml_content).unwrap()
}
