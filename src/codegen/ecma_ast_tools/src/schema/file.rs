use itertools::Itertools;

/// A Rust source file.
#[derive(Debug)]
pub struct File {
    /// Crate file is in e.g. `oxc_ast`
    pub krate: String,
    /// Physical source owner, relative to the Bun workspace root.
    pub owner_path: &'static str,
    /// `true` if file is in a NAPI package, rather than a crate
    #[allow(dead_code, clippy::allow_attributes)]
    pub is_napi: bool,
    /// Import path excluding crate e.g. `::ast::js`
    pub import_path: String,
}

impl File {
    /// Create new [`File`] from a source path.
    pub fn new(file_path: &str) -> Self {
        // Convert file path to crate and import path.
        // `src/ast/ecma/src/ast/js.rs` -> `oxc_ast`, `::ast::js`.
        // `src/ast/span/src/source_type/mod.rs` -> `oxc_span`, `::source_type`.
        // `src/ast/syntax/src/lib.rs` -> `oxc_syntax`, ``.
        let path = file_path.trim_end_matches(".rs").trim_end_matches("/mod");

        let (owner, krate, is_napi) = [
            ("src/quality/format_cli/", "oxfmt", false),
            ("src/quality/lint_cli/", "oxlint", false),
            ("src/transpiler/ecma_engine/", "oxc", false),
            ("src/collections/arena/", "oxc_allocator", false),
            ("src/ast/ecma/", "oxc_ast", false),
            ("src/ast/macros/", "oxc_ast_macros", false),
            ("src/ast/visit/", "oxc_ast_visit", false),
            ("src/sema/cfg/", "oxc_cfg", false),
            ("src/js_printer/ecma/", "oxc_codegen", false),
            ("src/transpiler/compat/", "oxc_compat", false),
            ("src/quality/config/", "oxc_config", false),
            ("src/collections/ecma/", "oxc_data_structures", false),
            ("src/quality/diagnostics/", "oxc_diagnostics", false),
            ("src/sema/ecmascript/", "oxc_ecmascript", false),
            ("src/ast/estree/", "oxc_estree", false),
            ("src/ast/estree_tokens/", "oxc_estree_tokens", false),
            ("src/quality/format_js/", "oxc_formatter", false),
            ("src/quality/format_core/", "oxc_formatter_core", false),
            ("src/quality/format_css/", "oxc_formatter_css", false),
            ("src/quality/format_graphql/", "oxc_formatter_graphql", false),
            ("src/quality/format_json/", "oxc_formatter_json", false),
            ("src/quality/format_markdown/", "oxc_formatter_markdown", false),
            ("src/quality/format_tests/", "oxc_formatter_tests", false),
            ("src/quality/format_yaml/", "oxc_formatter_yaml", false),
            ("src/transpiler/declarations/", "oxc_isolated_declarations", false),
            ("src/js_parser/jsdoc/", "oxc_jsdoc", false),
            ("src/lsp/quality/", "oxc_language_server", false),
            ("src/js_parser/lexer/", "oxc_lexer", false),
            ("src/quality/linter/", "oxc_linter", false),
            ("src/quality/macros/", "oxc_macros", false),
            ("src/transpiler/mangler/", "oxc_mangler", false),
            ("src/transpiler/minifier/", "oxc_minifier", false),
            ("src/quality/adapters/common/", "oxc_napi", false),
            ("src/js_parser/ecma/", "oxc_parser", false),
            ("src/react_compiler/ecma/", "oxc_react_compiler", false),
            ("src/js_parser/regexp/", "oxc_regular_expression", false),
            ("src/transpiler/relay/", "oxc_relay", false),
            ("src/sema/ecma/", "oxc_semantic", false),
            ("src/ast/span/", "oxc_span", false),
            ("src/bun_core/ecma_strings/", "oxc_str", false),
            ("src/ast/syntax/", "oxc_syntax", false),
            ("src/transpiler/ecma/", "oxc_transformer", false),
            ("src/transpiler/plugins/", "oxc_transformer_plugins", false),
            ("src/ast/traverse/", "oxc_traverse", false),
            ("src/quality/adapters/minify/", "napi/minify", true),
            ("src/quality/adapters/parser/", "napi/parser", true),
            ("src/quality/adapters/playground/", "napi/playground", true),
            ("src/quality/adapters/transform/", "napi/transform", true),
            ("src/quality/adapters/react/", "napi/transform-react", true),
            ("src/quality/adapters/relay/", "napi/transform-relay", true),
            ("src/codegen/ecma_ast_tools/", "oxc_ast_tools", false),
            ("src/codegen/ecma_benchmark/", "oxc_benchmark", false),
            ("src/codegen/ecma_codegen_conformance/", "oxc_codegen_conformance", false),
            ("src/codegen/ecma_common/", "oxc_tasks_common", false),
            ("src/codegen/ecma_compat_data/", "oxc_compat_data", false),
            ("src/codegen/ecma_coverage/", "oxc_coverage", false),
            ("src/codegen/ecma_linter_codegen/", "oxc_linter_codegen", false),
            ("src/codegen/ecma_minsize/", "oxc_minsize", false),
            ("src/codegen/ecma_rulegen/", "rulegen", false),
            ("src/codegen/ecma_track_linter_timings/", "oxc_track_linter_timings", false),
            ("src/codegen/ecma_track_memory_allocations/", "oxc_track_memory_allocations", false),
            ("src/codegen/ecma_transform_checker/", "oxc_tasks_transform_checker", false),
            ("src/codegen/ecma_transform_conformance/", "oxc_transform_conformance", false),
            ("src/codegen/ecma_website_common/", "website_common", false),
            ("src/codegen/ecma_website_formatter/", "website_formatter", false),
            ("src/codegen/ecma_website_linter/", "website_linter", false),
        ].into_iter().find(|(owner, _, _)| path.starts_with(*owner))
            .unwrap_or_else(|| panic!("Unknown Bun source owner: {path}"));
        let mut parts = path.strip_prefix(owner).unwrap().split('/');
        let krate = krate.to_owned();
        assert_eq!(parts.next(), Some("src"));

        let mut import_path = format!("::{}", parts.join("::"));
        if import_path == "::lib" {
            import_path.clear();
        }

        Self { krate, owner_path: owner.trim_end_matches('/'), is_napi, import_path }
    }

    /// Get name of crate this [`File`] is in.
    pub fn krate(&self) -> &str {
        &self.krate
    }

    /// Physical crate directory, relative to the workspace root.
    pub fn krate_path(&self) -> &str {
        self.owner_path
    }

    /// Get import path for this [`File`].
    pub fn import_path(&self) -> &str {
        &self.import_path
    }
}

#[cfg(test)]
mod test {
    use super::File;

    #[test]
    fn generated_paths_use_physical_workspace_owners() {
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../..")
            .canonicalize()
            .unwrap();
        assert!(root.join("Cargo.toml").is_file());
        for (source, owner, legacy) in [
            ("src/ast/ecma/src/ast/js.rs", "src/ast/ecma", "crates/oxc_ast"),
            ("src/ast/span/src/lib.rs", "src/ast/span", "crates/oxc_span"),
            ("src/ast/syntax/src/lib.rs", "src/ast/syntax", "crates/oxc_syntax"),
            ("src/quality/adapters/parser/src/lib.rs", "src/quality/adapters/parser", "napi/parser"),
            ("src/js_parser/regexp/src/lib.rs", "src/js_parser/regexp", "crates/oxc_regular_expression"),
        ] {
            let file = File::new(source);
            assert_eq!(file.krate_path(), owner);
            assert!(root.join(source).is_file(), "missing input {source}");
            assert!(std::fs::read_dir(root.join(owner).join("src")).unwrap().next().is_some());
            assert!(!root.join(legacy).exists(), "legacy output owner {legacy}");
            for name in ["derive_clone_in.rs", "assert_layouts.rs"] {
                assert_eq!(crate::output::output_path(file.krate_path(), name), format!("{owner}/src/generated/{name}"));
            }
        }
    }

    #[test]
    fn test_file_new() {
        let cases = [
            ("src/ast/ecma/src/ast/js.rs", "oxc_ast", "::ast::js", false),
            ("src/ast/span/src/source_type/mod.rs", "oxc_span", "::source_type", false),
            ("src/ast/syntax/src/lib.rs", "oxc_syntax", "", false),
            ("src/quality/adapters/parser/src/blah.rs", "napi/parser", "::blah", true),
            ("src/quality/adapters/parser/src/lib.rs", "napi/parser", "", true),
        ];

        for (file_path, krate, import_path, is_napi) in cases {
            let file = File::new(file_path);
            assert_eq!(file.krate(), krate);
            assert_eq!(file.import_path(), import_path);
            assert_eq!(file.is_napi, is_napi);
        }
    }
}
