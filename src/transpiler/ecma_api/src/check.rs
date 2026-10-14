//! Parser and semantic diagnostics as data, instead of the first error as a failure.

use oxc_allocator::Allocator;
use oxc_diagnostics::Severity;
use oxc_parser::Parser;
use oxc_semantic::SemanticBuilder;
use oxc_span::SourceType;

use crate::{Error, diagnostic_json};

/// Syntax and semantic diagnostics of `source` (redeclarations, invalid `await`, early errors...),
/// with UTF-16 label spans: `{ ok, diagnostics: [{ message, severity, code, help, url, labels }] }`.
/// Only an unknown extension is an `Err`.
pub fn check(source: &str, filename: &str) -> Result<serde_json::Value, Error> {
    let source_type =
        SourceType::from_path(filename).map_err(|error| Error::input(error.to_string()))?;
    let allocator = Allocator::default();
    let parsed = Parser::new(&allocator, source, source_type).parse();
    let mut diagnostics = parsed.diagnostics;
    if !parsed.fatal_error {
        diagnostics.extend(
            SemanticBuilder::new()
                .with_check_syntax_error(true)
                .build(&parsed.program)
                .diagnostics,
        );
    }
    let list = diagnostics
        .iter()
        .map(|d| diagnostic_json(source, d))
        .collect::<Vec<_>>();
    let ok = !diagnostics.iter().any(|d| d.severity == Severity::Error);
    Ok(serde_json::json!({ "ok": ok, "diagnostics": list }))
}
