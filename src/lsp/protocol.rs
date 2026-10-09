//! LSP base protocol: `Content-Length` framing, `file://` URIs, and UTF-16 positions.

use std::io::{self, BufRead, Write};
use std::path::{Path, PathBuf};

use serde_json::Value;

/// Larger messages are refused: a server that sends one is broken or hostile.
pub const MAX_MESSAGE_BYTES: usize = 64 * 1024 * 1024;

/// Reads one framed message. `Ok(None)` at the end of the stream.
pub fn read_message(reader: &mut impl BufRead) -> io::Result<Option<Value>> {
    let mut length: Option<usize> = None;
    let mut line = String::new();
    loop {
        line.clear();
        if reader.read_line(&mut line)? == 0 {
            return match length {
                None => Ok(None),
                Some(_) => Err(io::Error::new(io::ErrorKind::UnexpectedEof, "LSP header cut short")),
            };
        }
        let header = line.trim_end_matches(['\r', '\n']);
        if header.is_empty() {
            if length.is_some() {
                break;
            }
            continue;
        }
        if let Some((name, value)) = header.split_once(':')
            && name.trim().eq_ignore_ascii_case("content-length")
        {
            let parsed = value.trim().parse::<usize>().map_err(|_| {
                io::Error::new(io::ErrorKind::InvalidData, format!("invalid Content-Length {:?}", value.trim()))
            })?;
            if parsed > MAX_MESSAGE_BYTES {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidData,
                    format!("LSP message of {parsed} bytes exceeds the {MAX_MESSAGE_BYTES} byte limit"),
                ));
            }
            length = Some(parsed);
        }
    }
    let mut body = vec![0u8; length.unwrap_or(0)];
    reader.read_exact(&mut body)?;
    serde_json::from_slice(&body)
        .map(Some)
        .map_err(|err| io::Error::new(io::ErrorKind::InvalidData, format!("invalid LSP JSON: {err}")))
}

/// Writes one framed message and flushes.
pub fn write_message(writer: &mut impl Write, message: &Value) -> io::Result<()> {
    let body = serde_json::to_vec(message).map_err(io::Error::other)?;
    write!(writer, "Content-Length: {}\r\n\r\n", body.len())?;
    writer.write_all(&body)?;
    writer.flush()
}

/// `file://` URI of an absolute path.
pub fn path_to_uri(path: &Path) -> String {
    let text = path.to_string_lossy();
    let mut slashed = text.replace('\\', "/");
    if let Some(unc) = slashed.strip_prefix("//?/UNC/") {
        slashed = format!("//{unc}");
    } else if let Some(local) = slashed.strip_prefix("//?/") {
        slashed = local.to_owned();
    }
    let mut uri = String::from("file://");
    if !slashed.starts_with('/') {
        uri.push('/');
    } else if let Some(unc) = slashed.strip_prefix("//") {
        // `file://server/share/…`
        slashed = unc.to_owned();
    }
    for byte in slashed.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' | b'/' | b':' => uri.push(byte as char),
            _ => uri.push_str(&format!("%{byte:02X}")),
        }
    }
    uri
}

/// The path of a `file://` URI. `None` for another scheme.
pub fn uri_to_path(uri: &str) -> Option<PathBuf> {
    let rest = uri.strip_prefix("file://")?;
    let (host, path) = match rest.find('/') {
        Some(0) => ("", rest),
        Some(at) => rest.split_at(at),
        None => return None,
    };
    let mut decoded = Vec::with_capacity(path.len());
    let bytes = path.as_bytes();
    let mut at = 0;
    while at < bytes.len() {
        if bytes[at] == b'%'
            && let [high, low, ..] = bytes[at + 1..]
            && let (Some(high), Some(low)) = ((high as char).to_digit(16), (low as char).to_digit(16))
        {
            decoded.push((high * 16 + low) as u8);
            at += 3;
            continue;
        }
        decoded.push(bytes[at]);
        at += 1;
    }
    let path = String::from_utf8(decoded).ok()?;
    if cfg!(windows) {
        let local = match path.as_bytes() {
            [b'/', drive, b':', ..] if drive.is_ascii_alphabetic() => path[1..].to_owned(),
            _ => path,
        };
        let local = local.replace('/', "\\");
        Some(PathBuf::from(if host.is_empty() { local } else { format!("\\\\{host}{local}") }))
    } else {
        Some(PathBuf::from(path))
    }
}

/// A path as a cache key: on Windows, case and separators do not matter.
pub fn path_key(path: &Path) -> String {
    let text = path.to_string_lossy();
    if cfg!(windows) {
        text.replace('/', "\\").to_lowercase()
    } else {
        text.into_owned()
    }
}

/// The key of a URI, comparable with `path_key`.
pub fn uri_key(uri: &str) -> String {
    uri_to_path(uri).map_or_else(|| uri.to_owned(), |path| path_key(&path))
}

/// The text of the 0-based line `line`, without its terminator.
pub fn line_of(text: &str, line: u32) -> &str {
    let line = text.split('\n').nth(line as usize).unwrap_or("");
    line.strip_suffix('\r').unwrap_or(line)
}

/// UTF-16 offset of the 0-based character column `column` of `line`.
pub fn utf16_column(line: &str, column: u32) -> u32 {
    line.chars().take(column as usize).map(|c| c.len_utf16() as u32).sum()
}

/// 0-based character column of the UTF-16 offset `utf16` of `line`.
pub fn char_column(line: &str, utf16: u32) -> u32 {
    let mut units = 0u32;
    let mut column = 0u32;
    for c in line.chars() {
        if units >= utf16 {
            break;
        }
        units += c.len_utf16() as u32;
        column += 1;
    }
    column
}

fn object<const N: usize>(fields: [(&str, Value); N]) -> Value {
    Value::Object(fields.into_iter().map(|(name, value)| (name.to_owned(), value)).collect())
}

pub fn request(id: i64, method: &str, params: Value) -> Value {
    object([("jsonrpc", "2.0".into()), ("id", id.into()), ("method", method.into()), ("params", params)])
}

pub fn notification(method: &str, params: Value) -> Value {
    object([("jsonrpc", "2.0".into()), ("method", method.into()), ("params", params)])
}

pub fn response(id: Value, result: Value) -> Value {
    object([("jsonrpc", "2.0".into()), ("id", id), ("result", result)])
}

pub fn error_response(id: Value, code: i64, message: &str) -> Value {
    let error = object([("code", code.into()), ("message", message.into())]);
    object([("jsonrpc", "2.0".into()), ("id", id), ("error", error)])
}

/// JSON-RPC error codes that this crate sends.
pub mod code {
    pub const METHOD_NOT_FOUND: i64 = -32601;
    pub const INTERNAL_ERROR: i64 = -32603;
    pub const REQUEST_CANCELLED: i64 = -32800;
    pub const SERVER_NOT_INITIALIZED: i64 = -32002;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn frames_round_trip() {
        let mut buffer = Vec::new();
        write_message(&mut buffer, &serde_json::json!({ "a": "é" })).unwrap();
        let mut reader = io::BufReader::new(&buffer[..]);
        assert_eq!(read_message(&mut reader).unwrap(), Some(serde_json::json!({ "a": "é" })));
        assert_eq!(read_message(&mut reader).unwrap(), None);
    }

    #[test]
    fn uris_round_trip() {
        let path = if cfg!(windows) { PathBuf::from(r"C:\a b\c#.ts") } else { PathBuf::from("/a b/c#.ts") };
        let uri = path_to_uri(&path);
        assert!(uri.starts_with("file:///"), "{uri}");
        assert!(uri.contains("a%20b/c%23.ts"), "{uri}");
        assert_eq!(uri_to_path(&uri).unwrap(), path);
        if cfg!(windows) {
            assert_eq!(uri_key("file:///c%3A/a%20b/c%23.ts"), path_key(&path));
        }
    }

    #[test]
    fn utf16_columns() {
        let line = "a😀b";
        assert_eq!(utf16_column(line, 2), 3);
        assert_eq!(char_column(line, 3), 2);
        assert_eq!(line_of("x\r\ny", 0), "x");
        assert_eq!(line_of("x\r\ny", 1), "y");
    }
}
