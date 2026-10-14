//! Shared UTF-16 diagnostic encoding for Bun's Oxc owners.

use oxc_diagnostics::{OxcDiagnostic, Severity};

/// UTF-16 offset of the UTF-8 byte offset `byte` in `source`.
pub fn utf16_offset(source: &str, byte: usize) -> usize {
    let byte = byte.min(source.len());
    let mut end = byte;
    while !source.is_char_boundary(end) {
        end -= 1;
    }
    source[..end].encode_utf16().count()
}

pub fn diagnostic_json(source: &str, diagnostic: &OxcDiagnostic) -> serde_json::Value {
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
