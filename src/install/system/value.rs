//! Owned JSON/YAML values for the system sources, detached from AST arenas.

use bun_ast::{Expr, ExprData};

use super::{Error, Result};

pub use aphrody_pkg_system::value::{Value, json_string, write_json_string};

fn convert(expr: &Expr, source: &[u8], bump: &bun_alloc::Arena, depth: u32) -> Value {
    if depth > 64 {
        return Value::Null;
    }
    match &expr.data {
        ExprData::EString(_) => match expr.as_string(bump) {
            Some(s) => Value::String(super::lossy(s)),
            None => Value::Null,
        },
        ExprData::ENumber(n) => Value::Number(
            raw_scalar(source, expr.loc.start).unwrap_or_else(|| format_number(n.value())),
        ),
        ExprData::EBoolean(b) => Value::Bool(b.value),
        ExprData::EArray(_) | ExprData::EArrayJSON(_) => {
            let mut items = Vec::new();
            if let Some(mut it) = expr.as_array() {
                while let Some(item) = it.next() {
                    items.push(convert(&item, source, bump, depth + 1));
                }
            }
            Value::Array(items)
        }
        ExprData::EObject(_) | ExprData::EObjectJSON(_) => {
            let mut rows = Vec::new();
            expr.for_each_property(|key, _, value| {
                rows.push((
                    super::lossy(key),
                    convert(&value, source, bump, depth + 1),
                ));
            });
            Value::Object(rows)
        }
        _ => Value::Null,
    }
}

/// The plain scalar starting at `start` (up to end of line, a `#` comment, `,`, `]` or `}`).
fn raw_scalar(source: &[u8], start: i32) -> Option<String> {
    let start = usize::try_from(start).ok()?;
    let rest = source.get(start..)?;
    let mut end = 0;
    while end < rest.len() {
        match rest[end] {
            b'\n' | b'\r' | b',' | b']' | b'}' => break,
            b'#' if end > 0 && rest[end - 1] == b' ' => break,
            _ => end += 1,
        }
    }
    let text = core::str::from_utf8(&rest[..end]).ok()?.trim();
    let first = *text.as_bytes().first()?;
    if !(first.is_ascii_digit() || matches!(first, b'-' | b'+' | b'.')) {
        return None;
    }
    Some(text.to_owned())
}

fn format_number(v: f64) -> String {
    if v.fract() == 0.0 && v.abs() < 1e15 {
        format!("{}", v as i64)
    } else {
        format!("{v}")
    }
}

/// Converts an already-parsed JSON/YAML expression; `source` is the text it was parsed from.
pub fn from_expr(expr: &Expr, source: &[u8]) -> Value {
    let bump = bun_alloc::Arena::new();
    convert(expr, source, &bump, 0)
}

pub fn parse_json(bytes: &[u8], name: &str) -> Result<Value> {
    let mut log = bun_ast::Log::init();
    let source = bun_ast::Source::init_path_string(name.as_bytes(), bytes);
    let parsed = bun_parsers::json::ParsedJson::parse_package_json(&source, &mut log)
        .map_err(|_| Error::Parse(format!("failed to parse {name} as JSON")))?;
    let bump = bun_alloc::Arena::new();
    Ok(convert(&parsed.root, bytes, &bump, 0))
}

pub fn parse_yaml(bytes: &[u8], name: &str) -> Result<Value> {
    let bytes = bytes.strip_prefix(b"\xEF\xBB\xBF").unwrap_or(bytes);
    let mut log = bun_ast::Log::init();
    let source = bun_ast::Source::init_path_string(name.as_bytes(), bytes);
    let bump = bun_alloc::Arena::new();
    bun_ast::initialize_store();
    let root = bun_parsers::yaml::YAML::parse(
        &source,
        &mut log,
        &bump,
        bun_parsers::yaml::CyclicAliases::Reject,
    )
    .map_err(|_| Error::Parse(format!("failed to parse {name} as YAML")))?;
    Ok(convert(&root, bytes, &bump, 0))
}
