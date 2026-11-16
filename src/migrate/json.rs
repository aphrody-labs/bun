//! A reader for JSON and JSONC (comments and trailing commas) that keeps the byte span of every value, so that a
//! manifest is edited in place and keeps its formatting.

pub(crate) struct Node {
    pub(crate) start: usize,
    pub(crate) end: usize,
    pub(crate) value: Value,
}

pub(crate) enum Value {
    Null,
    Bool(bool),
    Number,
    String(Vec<u8>),
    Array(Vec<Node>),
    Object(Vec<Member>),
}

pub(crate) struct Member {
    pub(crate) key: Vec<u8>,
    pub(crate) key_start: usize,
    pub(crate) value: Node,
}

/// Where the text stopped being JSON.
pub(crate) struct SyntaxError(pub(crate) usize);

const MAX_DEPTH: usize = 256;

pub(crate) fn parse(source: &[u8]) -> Result<Node, SyntaxError> {
    let mut parser = Parser { source, at: 0 };
    parser.skip_trivia();
    let node = parser.value(0)?;
    parser.skip_trivia();
    if parser.at != source.len() {
        return Err(SyntaxError(parser.at));
    }
    Ok(node)
}

struct Parser<'a> {
    source: &'a [u8],
    at: usize,
}

impl Parser<'_> {
    fn peek(&self) -> Option<u8> {
        self.source.get(self.at).copied()
    }

    fn skip_trivia(&mut self) {
        loop {
            match (self.peek(), self.source.get(self.at + 1)) {
                (Some(b' ' | b'\t' | b'\r' | b'\n'), _) => self.at += 1,
                (Some(b'/'), Some(b'/')) => {
                    self.at = crate::bytes::line_end(self.source, self.at);
                }
                (Some(b'/'), Some(b'*')) => {
                    self.at = crate::bytes::find_from(self.source, b"*/", self.at + 2).map_or(self.source.len(), |end| end + 2);
                }
                _ => return,
            }
        }
    }

    fn value(&mut self, depth: usize) -> Result<Node, SyntaxError> {
        if depth > MAX_DEPTH {
            return Err(SyntaxError(self.at));
        }
        let start = self.at;
        let value = match self.peek().ok_or(SyntaxError(self.at))? {
            b'{' => self.object(depth)?,
            b'[' => self.array(depth)?,
            b'"' => Value::String(self.string()?),
            b't' => self.keyword(b"true", Value::Bool(true))?,
            b'f' => self.keyword(b"false", Value::Bool(false))?,
            b'n' => self.keyword(b"null", Value::Null)?,
            b'-' | b'0'..=b'9' => self.number(),
            _ => return Err(SyntaxError(self.at)),
        };
        Ok(Node { start, end: self.at, value })
    }

    fn keyword(&mut self, word: &[u8], value: Value) -> Result<Value, SyntaxError> {
        if self.source[self.at..].starts_with(word) {
            self.at += word.len();
            Ok(value)
        } else {
            Err(SyntaxError(self.at))
        }
    }

    fn number(&mut self) -> Value {
        while matches!(self.peek(), Some(b'-' | b'+' | b'.' | b'e' | b'E' | b'0'..=b'9')) {
            self.at += 1;
        }
        Value::Number
    }

    fn string(&mut self) -> Result<Vec<u8>, SyntaxError> {
        let mut out = Vec::new();
        self.at += 1;
        loop {
            let byte = self.peek().ok_or(SyntaxError(self.at))?;
            self.at += 1;
            match byte {
                b'"' => return Ok(out),
                b'\\' => {
                    let escape = self.peek().ok_or(SyntaxError(self.at))?;
                    self.at += 1;
                    match escape {
                        b'"' | b'\\' | b'/' => out.push(escape),
                        b'b' => out.push(8),
                        b'f' => out.push(12),
                        b'n' => out.push(b'\n'),
                        b'r' => out.push(b'\r'),
                        b't' => out.push(b'\t'),
                        b'u' => self.unicode_escape(&mut out)?,
                        _ => return Err(SyntaxError(self.at)),
                    }
                }
                _ => out.push(byte),
            }
        }
    }

    fn hex4(&mut self) -> Result<u32, SyntaxError> {
        let digits = self.source.get(self.at..self.at + 4).ok_or(SyntaxError(self.at))?;
        let mut code = 0;
        for &digit in digits {
            code = code * 16 + char::from(digit).to_digit(16).ok_or(SyntaxError(self.at))?;
        }
        self.at += 4;
        Ok(code)
    }

    fn unicode_escape(&mut self, out: &mut Vec<u8>) -> Result<(), SyntaxError> {
        let mut code = self.hex4()?;
        if (0xD800..0xDC00).contains(&code) && self.source[self.at..].starts_with(b"\\u") {
            let before = self.at;
            self.at += 2;
            let low = self.hex4()?;
            if (0xDC00..0xE000).contains(&low) {
                code = 0x10000 + ((code - 0xD800) << 10) + (low - 0xDC00);
            } else {
                self.at = before;
            }
        }
        let ch = char::from_u32(code).unwrap_or('\u{FFFD}');
        out.extend_from_slice(ch.encode_utf8(&mut [0; 4]).as_bytes());
        Ok(())
    }

    fn array(&mut self, depth: usize) -> Result<Value, SyntaxError> {
        self.at += 1;
        let mut items = Vec::new();
        loop {
            self.skip_trivia();
            match self.peek().ok_or(SyntaxError(self.at))? {
                b']' => {
                    self.at += 1;
                    return Ok(Value::Array(items));
                }
                b',' => self.at += 1,
                _ => items.push(self.value(depth + 1)?),
            }
        }
    }

    fn object(&mut self, depth: usize) -> Result<Value, SyntaxError> {
        self.at += 1;
        let mut members = Vec::new();
        loop {
            self.skip_trivia();
            match self.peek().ok_or(SyntaxError(self.at))? {
                b'}' => {
                    self.at += 1;
                    return Ok(Value::Object(members));
                }
                b',' => self.at += 1,
                b'"' => {
                    let key_start = self.at;
                    let key = self.string()?;
                    self.skip_trivia();
                    if self.peek() != Some(b':') {
                        return Err(SyntaxError(self.at));
                    }
                    self.at += 1;
                    self.skip_trivia();
                    members.push(Member { key, key_start, value: self.value(depth + 1)? });
                }
                _ => return Err(SyntaxError(self.at)),
            }
        }
    }
}

impl Node {
    pub(crate) fn get(&self, key: &[u8]) -> Option<&Node> {
        self.members().iter().find(|member| member.key == key).map(|member| &member.value)
    }

    /// The value at a dotted path such as `compilerOptions.module`.
    pub(crate) fn at_path(&self, path: &[Vec<u8>]) -> Option<&Node> {
        path.iter().try_fold(self, |node, key| node.get(key))
    }

    pub(crate) fn as_str(&self) -> Option<&[u8]> {
        match &self.value {
            Value::String(text) => Some(text),
            _ => None,
        }
    }

    pub(crate) fn members(&self) -> &[Member] {
        match &self.value {
            Value::Object(members) => members,
            _ => &[],
        }
    }

    pub(crate) fn items(&self) -> &[Node] {
        match &self.value {
            Value::Array(items) => items,
            _ => &[],
        }
    }

    /// The strings of an array, ignoring other items.
    pub(crate) fn strings(&self) -> Vec<&[u8]> {
        self.items().iter().filter_map(Node::as_str).collect()
    }
}

/// `text` as a JSON string, with its quotes.
pub(crate) fn quote(text: &[u8]) -> Vec<u8> {
    let mut out = vec![b'"'];
    for &byte in text {
        match byte {
            b'"' => out.extend_from_slice(b"\\\""),
            b'\\' => out.extend_from_slice(b"\\\\"),
            b'\n' => out.extend_from_slice(b"\\n"),
            b'\r' => out.extend_from_slice(b"\\r"),
            b'\t' => out.extend_from_slice(b"\\t"),
            0..=31 => out.extend_from_slice(format!("\\u{byte:04x}").as_bytes()),
            _ => out.push(byte),
        }
    }
    out.push(b'"');
    out
}

/// The span to cut from `source` to remove member `index` of `object` together with its comma.
pub(crate) fn member_span(object: &Node, index: usize) -> (usize, usize) {
    let members = object.members();
    let member = &members[index];
    if let Some(next) = members.get(index + 1) {
        (member.key_start, next.key_start)
    } else if index > 0 {
        (members[index - 1].value.end, member.value.end)
    } else {
        (object.start + 1, object.end - 1)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_spans_and_reads_jsonc() {
        let source = br#"{ // note
  "a": "xA", "b": [1, 2,],
}"#;
        let node = parse(source).ok().unwrap();
        let a = node.get(b"a").unwrap();
        assert_eq!(a.as_str(), Some(&b"xA"[..]));
        assert_eq!(&source[a.start..a.end], br#""xA""#);
        assert_eq!(node.get(b"b").unwrap().items().len(), 2);
    }

    #[test]
    fn cuts_the_last_member_with_its_comma() {
        let source = b"{\"a\": 1,\n  \"b\": 2}";
        let node = parse(source).ok().unwrap();
        let (start, end) = member_span(&node, 1);
        assert_eq!(&source[..start], b"{\"a\": 1");
        assert_eq!(&source[end..], b"}");
    }
}
