//! Bun addition: the small JSON reader and writer `bun msvc` needs (the installer's `state.json`,
//! the `bun msvc sync` cache) without a serde dependency.

use std::fmt::Write as _;

#[derive(Debug, Clone, PartialEq)]
pub enum Value {
    Null,
    Bool(bool),
    /// The number as written.
    Number(String),
    String(String),
    Array(Vec<Value>),
    Object(Vec<(String, Value)>),
}

impl Value {
    pub fn parse(text: &str) -> Option<Value> {
        let mut parser = Parser { bytes: text.as_bytes(), pos: 0 };
        let value = parser.value()?;
        parser.ws();
        (parser.pos == parser.bytes.len()).then_some(value)
    }

    pub fn get(&self, key: &str) -> Option<&Value> {
        match self {
            Value::Object(fields) => fields.iter().find(|(k, _)| k == key).map(|(_, v)| v),
            _ => None,
        }
    }

    /// `self.get(a)?.get(b)?...`
    pub fn at(&self, path: &[&str]) -> Option<&Value> {
        path.iter().try_fold(self, |value, key| value.get(key))
    }

    pub fn as_str(&self) -> Option<&str> {
        match self {
            Value::String(s) => Some(s),
            _ => None,
        }
    }

    pub fn as_array(&self) -> &[Value] {
        match self {
            Value::Array(items) => items,
            _ => &[],
        }
    }

    pub fn as_object(&self) -> &[(String, Value)] {
        match self {
            Value::Object(fields) => fields,
            _ => &[],
        }
    }

    /// `true`, or the strings `"true"`/`"True"` the installer writes.
    pub fn as_bool(&self) -> Option<bool> {
        match self {
            Value::Bool(b) => Some(*b),
            Value::String(s) if s.eq_ignore_ascii_case("true") => Some(true),
            Value::String(s) if s.eq_ignore_ascii_case("false") => Some(false),
            _ => None,
        }
    }

    pub fn as_u64(&self) -> Option<u64> {
        match self {
            Value::Number(n) => n.parse().ok(),
            Value::String(s) => s.parse().ok(),
            _ => None,
        }
    }

    pub fn write(&self, w: &mut Writer) {
        match self {
            Value::Null => {
                w.null();
            }
            Value::Bool(b) => {
                w.bool(*b);
            }
            Value::Number(n) => {
                w.sep();
                w.out.push_str(n);
            }
            Value::String(s) => {
                w.str(s);
            }
            Value::Array(items) => {
                w.begin_array();
                for item in items {
                    item.write(w);
                }
                w.end_array();
            }
            Value::Object(fields) => {
                w.begin_object();
                for (key, value) in fields {
                    w.key(key);
                    value.write(w);
                }
                w.end_object();
            }
        }
    }
}

struct Parser<'a> {
    bytes: &'a [u8],
    pos: usize,
}

impl Parser<'_> {
    fn ws(&mut self) {
        while matches!(self.bytes.get(self.pos), Some(b' ' | b'\t' | b'\r' | b'\n')) {
            self.pos += 1;
        }
        // state.json starts with a UTF-8 BOM on some installs.
        if self.bytes[self.pos..].starts_with("\u{feff}".as_bytes()) {
            self.pos += 3;
            self.ws();
        }
    }

    fn eat(&mut self, byte: u8) -> bool {
        self.ws();
        if self.bytes.get(self.pos) == Some(&byte) {
            self.pos += 1;
            true
        } else {
            false
        }
    }

    fn literal(&mut self, word: &str, value: Value) -> Option<Value> {
        if self.bytes[self.pos..].starts_with(word.as_bytes()) {
            self.pos += word.len();
            Some(value)
        } else {
            None
        }
    }

    fn value(&mut self) -> Option<Value> {
        self.ws();
        match *self.bytes.get(self.pos)? {
            b'{' => {
                self.pos += 1;
                let mut fields = Vec::new();
                if self.eat(b'}') {
                    return Some(Value::Object(fields));
                }
                loop {
                    self.ws();
                    let key = self.string()?;
                    if !self.eat(b':') {
                        return None;
                    }
                    fields.push((key, self.value()?));
                    if self.eat(b',') {
                        continue;
                    }
                    return self.eat(b'}').then_some(Value::Object(fields));
                }
            }
            b'[' => {
                self.pos += 1;
                let mut items = Vec::new();
                if self.eat(b']') {
                    return Some(Value::Array(items));
                }
                loop {
                    items.push(self.value()?);
                    if self.eat(b',') {
                        continue;
                    }
                    return self.eat(b']').then_some(Value::Array(items));
                }
            }
            b'"' => self.string().map(Value::String),
            b't' => self.literal("true", Value::Bool(true)),
            b'f' => self.literal("false", Value::Bool(false)),
            b'n' => self.literal("null", Value::Null),
            _ => {
                let start = self.pos;
                while matches!(self.bytes.get(self.pos), Some(b'-' | b'+' | b'.' | b'e' | b'E' | b'0'..=b'9')) {
                    self.pos += 1;
                }
                (self.pos > start)
                    .then(|| Value::Number(String::from_utf8_lossy(&self.bytes[start..self.pos]).into_owned()))
            }
        }
    }

    fn string(&mut self) -> Option<String> {
        if self.bytes.get(self.pos) != Some(&b'"') {
            return None;
        }
        self.pos += 1;
        let mut out = Vec::new();
        loop {
            let byte = *self.bytes.get(self.pos)?;
            self.pos += 1;
            match byte {
                b'"' => return String::from_utf8(out).ok(),
                b'\\' => {
                    let escaped = *self.bytes.get(self.pos)?;
                    self.pos += 1;
                    match escaped {
                        b'n' => out.push(b'\n'),
                        b'r' => out.push(b'\r'),
                        b't' => out.push(b'\t'),
                        b'b' => out.push(8),
                        b'f' => out.push(12),
                        b'u' => {
                            let mut code = self.hex4()?;
                            if (0xD800..0xDC00).contains(&code) && self.bytes[self.pos..].starts_with(b"\\u") {
                                self.pos += 2;
                                let low = self.hex4()?;
                                code = 0x10000 + ((code - 0xD800) << 10) + (low.wrapping_sub(0xDC00) & 0x3FF);
                            }
                            let ch = char::from_u32(code).unwrap_or('\u{FFFD}');
                            let mut buf = [0; 4];
                            out.extend_from_slice(ch.encode_utf8(&mut buf).as_bytes());
                        }
                        other => out.push(other),
                    }
                }
                other => out.push(other),
            }
        }
    }

    fn hex4(&mut self) -> Option<u32> {
        let hex = std::str::from_utf8(self.bytes.get(self.pos..self.pos + 4)?).ok()?;
        self.pos += 4;
        u32::from_str_radix(hex, 16).ok()
    }
}

/// A streaming JSON writer: `begin_object().key("a").str("b").end_object()`.
#[derive(Default)]
pub struct Writer {
    out: String,
    /// Whether the current container already holds a value (a `,` is needed before the next one).
    stack: Vec<bool>,
    after_key: bool,
}

impl Writer {
    pub fn new() -> Writer {
        Writer::default()
    }

    fn sep(&mut self) {
        if self.after_key {
            self.after_key = false;
            return;
        }
        if let Some(has_value) = self.stack.last_mut() {
            if *has_value {
                self.out.push(',');
            }
            *has_value = true;
        }
    }

    pub fn begin_object(&mut self) -> &mut Self {
        self.sep();
        self.out.push('{');
        self.stack.push(false);
        self
    }

    pub fn end_object(&mut self) -> &mut Self {
        self.stack.pop();
        self.out.push('}');
        self
    }

    pub fn begin_array(&mut self) -> &mut Self {
        self.sep();
        self.out.push('[');
        self.stack.push(false);
        self
    }

    pub fn end_array(&mut self) -> &mut Self {
        self.stack.pop();
        self.out.push(']');
        self
    }

    pub fn key(&mut self, key: &str) -> &mut Self {
        self.sep();
        quote(&mut self.out, key);
        self.out.push(':');
        self.after_key = true;
        self
    }

    pub fn str(&mut self, value: &str) -> &mut Self {
        self.sep();
        quote(&mut self.out, value);
        self
    }

    pub fn opt_str(&mut self, value: Option<&str>) -> &mut Self {
        match value {
            Some(value) => self.str(value),
            None => self.null(),
        }
    }

    pub fn bool(&mut self, value: bool) -> &mut Self {
        self.sep();
        self.out.push_str(if value { "true" } else { "false" });
        self
    }

    pub fn opt_bool(&mut self, value: Option<bool>) -> &mut Self {
        match value {
            Some(value) => self.bool(value),
            None => self.null(),
        }
    }

    pub fn num(&mut self, value: u64) -> &mut Self {
        self.sep();
        let _ = write!(self.out, "{value}");
        self
    }

    pub fn null(&mut self) -> &mut Self {
        self.sep();
        self.out.push_str("null");
        self
    }

    pub fn field(&mut self, key: &str, value: &str) -> &mut Self {
        self.key(key).str(value)
    }

    pub fn finish(self) -> String {
        self.out
    }
}

fn quote(out: &mut String, s: &str) {
    out.push('"');
    for ch in s.chars() {
        match ch {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => {
                let _ = write!(out, "\\u{:04x}", c as u32);
            }
            c => out.push(c),
        }
    }
    out.push('"');
}

#[cfg(test)]
mod tests {
    use super::{Value, Writer};

    #[test]
    fn round_trips() {
        let mut w = Writer::new();
        w.begin_object().field("a", "C:\\x \"y\"").key("b").begin_array().num(1).bool(true).null().end_array();
        w.key("c").begin_object().end_object().end_object();
        let text = w.finish();
        assert_eq!(text, r#"{"a":"C:\\x \"y\"","b":[1,true,null],"c":{}}"#);
        let value = Value::parse(&text).unwrap();
        assert_eq!(value.get("a").and_then(Value::as_str), Some("C:\\x \"y\""));
        assert_eq!(value.get("b").map(|b| b.as_array().len()), Some(3));
    }

    #[test]
    fn parses_installer_state() {
        let text = "\u{feff}{\"product\":{\"id\":\"Microsoft.VisualStudio.Product.BuildTools\"},\"catalogInfo\":{\"productMilestoneIsPreRelease\":\"False\"},\"t\":\"\\u00e9\"}";
        let value = Value::parse(text).unwrap();
        assert_eq!(
            value.at(&["product", "id"]).and_then(Value::as_str),
            Some("Microsoft.VisualStudio.Product.BuildTools")
        );
        assert_eq!(value.at(&["catalogInfo", "productMilestoneIsPreRelease"]).and_then(Value::as_bool), Some(false));
        assert_eq!(value.get("t").and_then(Value::as_str), Some("é"));
        assert!(Value::parse("{").is_none());
    }
}
