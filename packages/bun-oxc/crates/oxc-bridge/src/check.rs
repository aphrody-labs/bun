//! Parser and semantic diagnostics as data, instead of the first error as a failure.

use oxc_allocator::Allocator;
use oxc_diagnostics::{OxcDiagnostic, Severity};
use oxc_parser::Parser;
use oxc_semantic::SemanticBuilder;
use oxc_span::SourceType;

use crate::Error;

/// UTF-16 offset of the UTF-8 byte offset `byte` in `source`.
pub(crate) fn utf16_offset(source: &str, byte: usize) -> usize {
    let byte = byte.min(source.len());
    let mut end = byte;
    while !source.is_char_boundary(end) {
        end -= 1;
    }
    source[..end].encode_utf16().count()
}

pub(crate) fn diagnostic_json(source: &str, diagnostic: &OxcDiagnostic) -> serde_json::Value {
    let severity = match diagnostic.severity {
        Severity::Error => "error",
        Severity::Warning => "warning",
        Severity::Advice => "advice",
    };
    let labels = diagnostic
        .labels
        .iter()
        .map(|label| {
            let start = label.offset() as usize;
            serde_json::json!({
                "start": utf16_offset(source, start),
                "end": utf16_offset(source, start + label.len() as usize),
                "message": label.label(),
                "primary": label.primary(),
            })
        })
        .collect::<Vec<_>>();
    let code = diagnostic.code.to_string();
    serde_json::json!({
        "message": diagnostic.message.as_ref(),
        "severity": severity,
        "code": (!code.is_empty()).then_some(code),
        "help": diagnostic.help.as_deref(),
        "url": diagnostic.url.as_deref(),
        "labels": labels,
    })
}

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
    let list = diagnostics.iter().map(|d| diagnostic_json(source, d)).collect::<Vec<_>>();
    let ok = !diagnostics.iter().any(|d| d.severity == Severity::Error);
    Ok(serde_json::json!({ "ok": ok, "diagnostics": list }))
}
