//! In-process [Oxc](https://oxc.rs) bridge for JavaScript and TypeScript tooling.
//!
//! Safe API: [`transform`] (TypeScript/JSX to JavaScript, decorators, React Refresh, styled-components,
//! ES target lowering, optional source map), [`isolated_declaration`] (`.d.ts`), [`minify`] and
//! [`minify_with`], [`check`] (syntax and semantic diagnostics), [`resolve`] (`oxc_resolver`),
//! [`analyze`] (module requests and exports), [`parse`] (ESTree JSON), [`format`] and [`lint`].
//! Everything except format and lint runs in-process on the crates.io Oxc crates. Format and lint
//! delegate to the `oxfmt` and `oxlint` binaries (overridable through `APHRODY_OXFMT` /
//! `APHRODY_OXLINT`), because Oxc does not publish its formatter and linter crates; the in-process
//! versions live in the unpublished `aphrody-oxc-tools` crate of the same workspace.
//!
//! The C ABI (`aphrody_oxc_*`, ABI 2) wraps this API and returns JSON strings that the caller
//! releases with `aphrody_oxc_free`.

mod analysis;
mod check;
mod error;
mod ffi;
mod resolve;
mod tools;
mod transform;

pub use check::check;
pub use error::{Error, ErrorKind};
pub use ffi::*;
pub use resolve::{resolve, resolve_options};
pub use tools::{format, lint};
pub use transform::{
    Jsx, MinifyOptions, TransformOptions, Transformed, isolated_declaration, minify, minify_with,
    transform,
};

/// Static ESM imports and exports of `source` in source order, with UTF-16 spans:
/// `{imports, exports, hasModuleSyntax, spanEncoding, requests, exportEntries}`.
pub fn analyze(source: &str, filename: &str) -> Result<serde_json::Value, Error> {
    analysis::module_info(source, filename, false)
}

/// The official Oxc ESTree program of `source` as JSON, with UTF-16 spans.
pub fn parse(source: &str, filename: &str) -> Result<serde_json::Value, Error> {
    analysis::module_info(source, filename, true)
}

/// Converts the diagnostics of another Oxc crate (same AST revision) to the JSON shape of [`check`].
pub fn diagnostic_json(source: &str, diagnostic: &oxc_diagnostics::OxcDiagnostic) -> serde_json::Value {
    check::diagnostic_json(source, diagnostic)
}

/// UTF-16 offset of a UTF-8 byte offset of `source`, rounded down to a character boundary.
pub fn utf16_offset(source: &str, byte: usize) -> usize {
    check::utf16_offset(source, byte)
}
