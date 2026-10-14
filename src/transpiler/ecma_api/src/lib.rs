//! In-process [Oxc](https://oxc.rs) bridge for JavaScript and TypeScript tooling.
//!
//! Safe API: [`transform`] (TypeScript/JSX to JavaScript, decorators, React Refresh, styled-components,
//! ES target lowering, optional source map), [`isolated_declaration`] (`.d.ts`), [`minify`] and
//! [`minify_with`], [`check`] (syntax and semantic diagnostics), [`resolve`] (`oxc_resolver`),
//! [`analyze`] (module requests and exports), [`parse`] (ESTree JSON), [`format`] and [`lint`].
//! Every operation runs in process against the pinned Oxc sources. Format and lint delegate to
//! Bun's internal quality owner, which also owns the shared errors and diagnostic encoding.
//!
//! The C ABI (`aphrody_oxc_*`, ABI 2) wraps this API and returns JSON strings that the caller
//! releases with `aphrody_oxc_free`.

mod analysis;
mod check;
mod ffi;
mod resolve;
mod tools;
mod transform;

pub use bun_quality::{Error, ErrorKind, diagnostic_json, utf16_offset};
pub use check::check;
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

/// ESTree program and parser-recognized comments, with UTF-16 spans.
pub fn parse_with_comments(source: &str, filename: &str) -> Result<serde_json::Value, Error> {
    analysis::program_with_comments(source, filename)
}
