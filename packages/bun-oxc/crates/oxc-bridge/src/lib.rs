//! In-process [Oxc](https://oxc.rs) bridge for JavaScript and TypeScript tooling.
//!
//! Safe API: [`transform`] (TypeScript/JSX to JavaScript, optional source map), [`minify`],
//! [`analyze`] (module requests and exports), [`parse`] (ESTree JSON), [`format`] and [`lint`].
//! Transform, minify, analyze and parse run in-process on the crates.io Oxc crates. Format and lint
//! delegate to the `oxfmt` and `oxlint` binaries (overridable through `APHRODY_OXFMT` /
//! `APHRODY_OXLINT`), because Oxc does not publish its formatter and linter crates.
//!
//! The C ABI (`aphrody_oxc_*`, ABI 1) wraps this API and returns JSON strings that the caller
//! releases with `aphrody_oxc_free`.

mod analysis;
mod error;
mod ffi;
mod tools;
mod transform;

pub use error::{Error, ErrorKind};
pub use ffi::*;
pub use tools::{format, lint};
pub use transform::{Jsx, TransformOptions, Transformed, minify, transform};

/// Static ESM imports and exports of `source` in source order, with UTF-16 spans:
/// `{imports, exports, hasModuleSyntax, spanEncoding, requests, exportEntries}`.
pub fn analyze(source: &str, filename: &str) -> Result<serde_json::Value, Error> {
    analysis::module_info(source, filename, false)
}

/// The official Oxc ESTree program of `source` as JSON, with UTF-16 spans.
pub fn parse(source: &str, filename: &str) -> Result<serde_json::Value, Error> {
    analysis::module_info(source, filename, true)
}
