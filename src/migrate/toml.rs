//! The subset of TOML that rule registries use: `[[section]]` headers each followed by `key = value` lines, or one
//! inline table `{ key = value, ... }` per line under a `[section]` header. Values are strings (basic or literal),
//! booleans, integers and one-line arrays of strings.

use crate::bytes::find_byte_from;

#[derive(Clone)]
pub(crate) enum Value {
    Str(Vec<u8>),
    Bool(bool),
    Int(i64),
    List(Vec<Vec<u8>>),
}

/// One row of a registry file.
pub(crate) struct Row {
    pub(crate) section: Vec<u8>,
    pub(crate) fields: Vec<(Vec<u8>, Value)>,
}

pub(crate) struct ParseError {
    pub(crate) line: usize,
    pub(crate) message: &'static str,
}

impl Row {
    fn field(&self, key: &str) -> Option<&Value> {
        self.fields.iter().find(|(name, _)| name == key.as_bytes()).map(|(_, value)| value)
    }

    pub(crate) fn str(&self, key: &str) -> Option<&[u8]> {
        match self.field(key)? {
            Value::Str(text) => Some(text),
            _ => None,
        }
    }

    pub(crate) fn bool(&self, key: &str) -> bool {
        matches!(self.field(key), Some(Value::Bool(true)))
    }

    pub(crate) fn list(&self, key: &str) -> Vec<&[u8]> {
        match self.field(key) {
            Some(Value::List(items)) => items.iter().map(Vec::as_slice).collect(),
            Some(Value::Str(item)) => vec![item.as_slice()],
            _ => Vec::new(),
        }
    }
}

pub(crate) fn parse(source: &[u8]) -> Result<Vec<Row>, ParseError> {
    let mut rows: Vec<Row> = Vec::new();
    let mut section: Vec<u8> = Vec::new();
    let mut open = false;
    let mut at = 0;
    let mut number = 0;
    while at < source.len() {
        let end = crate::bytes::line_end(source, at);
        let line = source[at..end].trim_ascii();
        number += 1;
        at = end + 1;
        let error = |message| ParseError { line: number, message };
        if line.is_empty() || line[0] == b'#' {
            continue;
        }
        if let Some(name) = line.strip_prefix(b"[[").and_then(|rest| rest.strip_suffix(b"]]")) {
            section = name.trim_ascii().to_vec();
            rows.push(Row { section: section.clone(), fields: Vec::new() });
            open = true;
        } else if let Some(name) = line.strip_prefix(b"[").and_then(|rest| rest.strip_suffix(b"]")) {
            section = name.trim_ascii().to_vec();
            open = false;
        } else if line[0] == b'{' {
            let mut cursor = Cursor { text: line, at: 1 };
            let fields = cursor.table().map_err(error)?;
            rows.push(Row { section: section.clone(), fields });
        } else if open {
            let mut cursor = Cursor { text: line, at: 0 };
            let (key, value) = cursor.pair().map_err(error)?;
            rows.last_mut().ok_or_else(|| error("a value outside a table"))?.fields.push((key, value));
        } else {
            return Err(error("a value outside a table"));
        }
    }
    Ok(rows)
}

struct Cursor<'a> {
    text: &'a [u8],
    at: usize,
}

impl Cursor<'_> {
    fn skip_space(&mut self) {
        while matches!(self.text.get(self.at), Some(b' ' | b'\t')) {
            self.at += 1;
        }
    }

    fn table(&mut self) -> Result<Vec<(Vec<u8>, Value)>, &'static str> {
        let mut fields = Vec::new();
        loop {
            self.skip_space();
            match self.text.get(self.at) {
                Some(b'}') => return Ok(fields),
                Some(b',') => self.at += 1,
                Some(_) => fields.push(self.pair()?),
                None => return Err("an inline table is not closed"),
            }
        }
    }

    fn pair(&mut self) -> Result<(Vec<u8>, Value), &'static str> {
        self.skip_space();
        let start = self.at;
        while self.text.get(self.at).is_some_and(|b| b.is_ascii_alphanumeric() || matches!(b, b'_' | b'-')) {
            self.at += 1;
        }
        let key = self.text[start..self.at].to_vec();
        self.skip_space();
        if key.is_empty() || self.text.get(self.at) != Some(&b'=') {
            return Err("expected `key = value`");
        }
        self.at += 1;
        self.skip_space();
        Ok((key, self.value()?))
    }

    fn value(&mut self) -> Result<Value, &'static str> {
        match self.text.get(self.at).copied() {
            Some(b'"') => Ok(Value::Str(self.basic_string()?)),
            Some(b'\'') => {
                let end = find_byte_from(self.text, b'\'', self.at + 1).ok_or("a string is not closed")?;
                let text = self.text[self.at + 1..end].to_vec();
                self.at = end + 1;
                Ok(Value::Str(text))
            }
            Some(b'[') => {
                self.at += 1;
                let mut items = Vec::new();
                loop {
                    self.skip_space();
                    match self.text.get(self.at) {
                        Some(b']') => {
                            self.at += 1;
                            return Ok(Value::List(items));
                        }
                        Some(b',') => self.at += 1,
                        Some(_) => match self.value()? {
                            Value::Str(item) => items.push(item),
                            _ => return Err("arrays hold strings"),
                        },
                        None => return Err("an array is not closed"),
                    }
                }
            }
            Some(_) => {
                let start = self.at;
                while self.text.get(self.at).is_some_and(|b| b.is_ascii_alphanumeric() || *b == b'-') {
                    self.at += 1;
                }
                match &self.text[start..self.at] {
                    b"true" => Ok(Value::Bool(true)),
                    b"false" => Ok(Value::Bool(false)),
                    digits => core::str::from_utf8(digits).ok().and_then(|n| n.parse().ok()).map(Value::Int).ok_or("unknown value"),
                }
            }
            None => Err("a value is missing"),
        }
    }

    fn basic_string(&mut self) -> Result<Vec<u8>, &'static str> {
        let mut out = Vec::new();
        self.at += 1;
        loop {
            let byte = *self.text.get(self.at).ok_or("a string is not closed")?;
            self.at += 1;
            match byte {
                b'"' => return Ok(out),
                b'\\' => {
                    let escape = *self.text.get(self.at).ok_or("a string is not closed")?;
                    self.at += 1;
                    out.push(match escape {
                        b'n' => b'\n',
                        b't' => b'\t',
                        b'r' => b'\r',
                        b'"' | b'\\' => escape,
                        _ => return Err("unknown escape"),
                    });
                }
                _ => out.push(byte),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_inline_tables_and_headers() {
        let rows = parse(b"[text]\n{ id = \"a\", kinds = [\"x\", \"y\"], pattern = '\\bz', ok = true }\n[[cli]]\nid = \"b\"\n")
            .ok()
            .unwrap();
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].str("pattern"), Some(&b"\\bz"[..]));
        assert_eq!(rows[0].list("kinds").len(), 2);
        assert!(rows[0].bool("ok"));
        assert_eq!(rows[1].section, b"cli");
    }
}
