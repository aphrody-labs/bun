//! Node-API addon behind `@aphrody/bun-plugin-oxc`.
//!
//! Exports, under these JS names:
//! - the bridge API: `version`, `bridgeTransform`, `bridgeMinify`, `bridgeParse`, `analyze`, `check`,
//!   `isolatedDeclarationText`, `resolve`, `format`, `lint`, `lintRules`, `createTransformOptions`;
//! - the official `oxc-parser`, `oxc-transform` and `oxc-minify` bindings (`parseSync`, `parse`,
//!   `transformSync`, `transform`, `isolatedDeclarationSync`, `minifySync`, `minify`...), which register
//!   themselves because their crates are linked below;
//! - the native `onBeforeParse` symbols `oxc_transform` (default options) and
//!   `oxc_transform_with` (options from the `external` made by `createTransformOptions`).

// Linked for their #[napi] registrations only.
extern crate oxc_minify_napi as _;
extern crate oxc_parser_napi as _;
extern crate oxc_transform_napi as _;

use std::path::PathBuf;

use aphrody_oxc_bridge as oxc;
use aphrody_oxc_tools as tools;
use bun_native_plugin::{BunLoader, OnBeforeParse, Result, bun, define_bun_plugin};
use napi::{Status, bindgen_prelude::External};
use napi_derive::napi;
use serde_json::Value;

define_bun_plugin!("bun-plugin-oxc");

fn fail(error: oxc::Error) -> napi::Error {
    napi::Error::new(Status::GenericFailure, format!("[{}] {}", error.kind.as_str(), error.message))
}

fn invalid(message: impl Into<String>) -> napi::Error {
    napi::Error::new(Status::InvalidArg, message.into())
}

fn object(options: Option<Value>) -> Value {
    options.unwrap_or(Value::Null)
}

fn string_field(options: &Value, key: &str) -> Option<String> {
    options.get(key).and_then(Value::as_str).map(str::to_owned)
}

fn path_field(options: &Value, key: &str) -> Option<PathBuf> {
    string_field(options, key).map(PathBuf::from)
}

fn bool_field(options: &Value, key: &str) -> bool {
    options.get(key).and_then(Value::as_bool).unwrap_or(false)
}

#[napi(object)]
pub struct CodeOutput {
    pub code: String,
    /// Source map JSON when `sourcemap` was requested.
    pub map: Option<String>,
}

impl From<oxc::Transformed> for CodeOutput {
    fn from(out: oxc::Transformed) -> Self {
        Self { code: out.code, map: out.map }
    }
}

/// Version of the addon.
#[napi]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_owned()
}

/// TypeScript/JSX to JavaScript with the bridge options (`target`, `jsx`, `decorators`,
/// `reactRefresh`, `styledComponents`, `helpersModule`, `sourcemap`...).
#[napi(js_name = "bridgeTransform")]
pub fn bridge_transform(
    source: String,
    filename: String,
    options: Option<Value>,
) -> napi::Result<CodeOutput> {
    let options = oxc::TransformOptions::from_json(&object(options)).map_err(fail)?;
    oxc::transform(&source, &filename, &options).map(CodeOutput::from).map_err(fail)
}

/// Minified code with the bridge options (`compress`, `mangle`, `topLevel`, `dropConsole`...).
#[napi(js_name = "bridgeMinify")]
pub fn bridge_minify(
    source: String,
    filename: String,
    options: Option<Value>,
) -> napi::Result<CodeOutput> {
    let options = oxc::MinifyOptions::from_json(&object(options)).map_err(fail)?;
    oxc::minify_with(&source, &filename, &options).map(CodeOutput::from).map_err(fail)
}

/// ESTree program as plain JSON.
#[napi(js_name = "bridgeParse")]
pub fn bridge_parse(source: String, filename: String) -> napi::Result<Value> {
    oxc::parse(&source, &filename).map_err(fail)
}

/// Static imports and exports with UTF-16 spans.
#[napi]
pub fn analyze(source: String, filename: String) -> napi::Result<Value> {
    oxc::analyze(&source, &filename).map_err(fail)
}

/// Syntax and semantic diagnostics: `{ ok, diagnostics }`.
#[napi]
pub fn check(source: String, filename: String) -> napi::Result<Value> {
    oxc::check(&source, &filename).map_err(fail)
}

/// `.d.ts` text under `--isolatedDeclarations` (`stripInternal`, `sourcemap`).
#[napi(js_name = "isolatedDeclarationText")]
pub fn isolated_declaration_text(
    source: String,
    filename: String,
    options: Option<Value>,
) -> napi::Result<CodeOutput> {
    let options = object(options);
    oxc::isolated_declaration(
        &source,
        &filename,
        bool_field(&options, "stripInternal"),
        bool_field(&options, "sourcemap"),
    )
    .map(CodeOutput::from)
    .map_err(fail)
}

/// Resolves `specifier` from `from` (a file or directory) with `oxc_resolver`:
/// `{ path, query, fragment, moduleType }`.
#[napi]
pub fn resolve(from: String, specifier: String, options: Option<Value>) -> napi::Result<Value> {
    oxc::resolve(&from, &specifier, &object(options)).map_err(fail)
}

/// Formatted code from oxfmt (`cwd`, `config`, `configPath`, `discoverConfig`).
#[napi]
pub fn format(source: String, filename: String, options: Option<Value>) -> napi::Result<String> {
    let options = object(options);
    let options = tools::FormatOptions {
        cwd: path_field(&options, "cwd"),
        config: options.get("config").filter(|config| !config.is_null()).cloned(),
        config_path: path_field(&options, "configPath"),
        discover_config: bool_field(&options, "discoverConfig"),
    };
    tools::format(&source, &filename, &options).map_err(fail)
}

fn fix_mode(options: &Value) -> napi::Result<tools::FixMode> {
    Ok(match options.get("fix") {
        None | Some(Value::Null | Value::Bool(false)) => tools::FixMode::None,
        Some(Value::Bool(true)) => tools::FixMode::Safe,
        Some(Value::String(mode)) => match mode.as_str() {
            "safe" => tools::FixMode::Safe,
            "suggestions" => tools::FixMode::Suggestions,
            "dangerous" => tools::FixMode::Dangerous,
            other => {
                return Err(invalid(format!(
                    "fix must be a boolean, \"safe\", \"suggestions\" or \"dangerous\", got \"{other}\""
                )));
            },
        },
        Some(other) => return Err(invalid(format!("fix must be a boolean or a string, got {other}"))),
    })
}

#[napi(object)]
pub struct LintOutput {
    /// `{ message, severity, code, help, url, labels, fixable }` with UTF-16 offsets.
    pub diagnostics: Vec<Value>,
    /// Fixed source when `fix` was requested and a fix applied.
    pub fixed: Option<String>,
    pub error_count: u32,
    pub warning_count: u32,
}

/// oxlint with every built-in rule and plugin (`cwd`, `config`, `configPath`, `discoverConfig`,
/// `fix`).
#[napi]
pub fn lint(source: String, filename: String, options: Option<Value>) -> napi::Result<LintOutput> {
    let options = object(options);
    let options = tools::LintOptions {
        cwd: path_field(&options, "cwd"),
        config: options.get("config").filter(|config| !config.is_null()).cloned(),
        config_path: path_field(&options, "configPath"),
        discover_config: bool_field(&options, "discoverConfig"),
        fix: fix_mode(&options)?,
    };
    let report = tools::lint(&source, &filename, &options).map_err(fail)?;
    Ok(LintOutput {
        diagnostics: report.diagnostics,
        fixed: report.fixed,
        error_count: u32::try_from(report.error_count).unwrap_or(u32::MAX),
        warning_count: u32::try_from(report.warning_count).unwrap_or(u32::MAX),
    })
}

/// Every oxlint rule: `[{ name, plugin, category, default, fix, fixable, docs, version, typeAware }]`.
#[napi(js_name = "lintRules")]
pub fn lint_rules() -> Value {
    tools::rules()
}

/// Options for the `oxc_transform_with` native hook, passed as `external` to `onBeforeParse`.
#[napi(js_name = "createTransformOptions")]
pub fn create_transform_options(
    options: Option<Value>,
) -> napi::Result<External<oxc::TransformOptions>> {
    oxc::TransformOptions::from_json(&object(options)).map(External::new).map_err(fail)
}

const TRANSFORMED_EXTENSIONS: [&str; 5] = [".ts", ".tsx", ".jsx", ".mts", ".cts"];

fn run_hook(handle: &mut OnBeforeParse, options: &oxc::TransformOptions) -> Result<()> {
    let path = handle.path()?.into_owned();
    let lower = path.to_ascii_lowercase();
    if !TRANSFORMED_EXTENSIONS.iter().any(|ext| lower.ends_with(ext)) {
        return Ok(());
    }
    let source = handle.input_source_code()?;
    let out = oxc::transform(&source, &path, options)
        .map_err(|error| bun_native_plugin::anyhow::anyhow!("{path}: {}", error.message))?;
    handle.set_output_source_code(out.code, BunLoader::BUN_LOADER_JS);
    Ok(())
}

/// `build.onBeforeParse` hook: TS/TSX/JSX in, JavaScript out, default options. Other extensions
/// are left alone.
#[bun]
pub fn oxc_transform(handle: &mut OnBeforeParse) -> Result<()> {
    run_hook(handle, &oxc::TransformOptions::default())
}

/// Same as `oxc_transform` with the options of the `external` from `createTransformOptions`.
#[bun]
pub fn oxc_transform_with(handle: &mut OnBeforeParse) -> Result<()> {
    // SAFETY: the JS side always registers this symbol with an External<TransformOptions>.
    let options = unsafe { handle.external(External::<oxc::TransformOptions>::inner_from_raw) }?
        .ok_or_else(|| bun_native_plugin::anyhow::anyhow!("oxc_transform_with needs createTransformOptions()"))?;
    run_hook(handle, options)
}
