//! Node-API addon behind `@aphrody/bun-plugin-oxc`: the JS API (`transform`, `minify`, `format`,
//! `lint`, `analyze`, `parse`) and the native `onBeforeParse` plugin symbol `oxc_transform`.

use aphrody_oxc_bridge as oxc;
use bun_native_plugin::{BunLoader, Result, bun, define_bun_plugin};
use napi::Status;
use napi_derive::napi;

define_bun_plugin!("bun-plugin-oxc");

fn fail(error: oxc::Error) -> napi::Error {
    napi::Error::new(Status::GenericFailure, format!("[{}] {}", error.kind.as_str(), error.message))
}

#[napi(object)]
#[derive(Default)]
pub struct TransformOptions {
    /// `es2015` ... `es2024`, `esnext`, or engine targets (`chrome58`), comma separated.
    pub target: Option<String>,
    /// `"automatic"` (default) or `"classic"`.
    pub jsx: Option<String>,
    pub jsx_import_source: Option<String>,
    pub jsx_pragma: Option<String>,
    pub jsx_pragma_frag: Option<String>,
    pub development: Option<bool>,
    /// Also return a source map JSON string.
    pub sourcemap: Option<bool>,
}

#[napi(object)]
pub struct TransformOutput {
    pub code: String,
    pub map: Option<String>,
}

fn convert(options: Option<TransformOptions>) -> napi::Result<oxc::TransformOptions> {
    let options = options.unwrap_or_default();
    let jsx = match options.jsx.as_deref() {
        None | Some("automatic") => oxc::Jsx::Automatic,
        Some("classic") => oxc::Jsx::Classic,
        Some(other) => {
            return Err(napi::Error::new(
                Status::InvalidArg,
                format!("jsx must be \"automatic\" or \"classic\", got \"{other}\""),
            ));
        },
    };
    Ok(oxc::TransformOptions {
        target: options.target,
        jsx,
        jsx_import_source: options.jsx_import_source,
        jsx_pragma: options.jsx_pragma,
        jsx_pragma_frag: options.jsx_pragma_frag,
        development: options.development.unwrap_or(false),
        sourcemap: options.sourcemap.unwrap_or(false),
    })
}

/// Version of the addon.
#[napi]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_owned()
}

/// TypeScript/JSX to JavaScript. The extension of `filename` selects the syntax.
#[napi]
pub fn transform(
    source: String,
    filename: String,
    options: Option<TransformOptions>,
) -> napi::Result<TransformOutput> {
    let out = oxc::transform(&source, &filename, &convert(options)?).map_err(fail)?;
    Ok(TransformOutput { code: out.code, map: out.map })
}

/// Minified code.
#[napi]
pub fn minify(source: String, filename: String) -> napi::Result<String> {
    oxc::minify(&source, &filename).map_err(fail)
}

/// Formatted code (runs `oxfmt`).
#[napi]
pub fn format(source: String, filename: String) -> napi::Result<String> {
    oxc::format(&source, &filename).map_err(fail)
}

/// Lint diagnostics messages (runs `oxlint`).
#[napi]
pub fn lint(source: String, filename: String) -> napi::Result<Vec<String>> {
    oxc::lint(&source, &filename).map_err(fail)
}

/// Static imports and exports with UTF-16 spans.
#[napi]
pub fn analyze(source: String, filename: String) -> napi::Result<serde_json::Value> {
    oxc::analyze(&source, &filename).map_err(fail)
}

/// ESTree program.
#[napi]
pub fn parse(source: String, filename: String) -> napi::Result<serde_json::Value> {
    oxc::parse(&source, &filename).map_err(fail)
}

/// `build.onBeforeParse` hook: TS/TSX/JSX in, JavaScript out. Other extensions are left alone.
#[bun]
pub fn oxc_transform(handle: &mut OnBeforeParse) -> Result<()> {
    let path = handle.path()?.into_owned();
    let lower = path.to_ascii_lowercase();
    if ![".ts", ".tsx", ".jsx", ".mts", ".cts"].iter().any(|ext| lower.ends_with(ext)) {
        return Ok(());
    }
    let source = handle.input_source_code()?;
    let out = oxc::transform(&source, &path, &oxc::TransformOptions::default())
        .map_err(|error| bun_native_plugin::anyhow::anyhow!("{path}: {}", error.message))?;
    handle.set_output_source_code(out.code, BunLoader::BUN_LOADER_JS);
    Ok(())
}
