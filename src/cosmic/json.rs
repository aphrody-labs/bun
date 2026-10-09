//! Minimal JSON writer for the trees this crate hands to `cosmic.ts` (`JSON.parse` on the JS side).
// Outside Linux only the unit tests use it.
#![cfg_attr(not(target_os = "linux"), allow(dead_code))]

use std::io::Write as _;

#[derive(Default)]
pub(crate) struct Json {
    out: Vec<u8>,
    need_comma: bool,
}

impl Json {
    pub(crate) fn finish(self) -> Vec<u8> {
        self.out
    }

    fn separate(&mut self) {
        if self.need_comma {
            self.out.push(b',');
        }
    }

    pub(crate) fn begin_object(&mut self) {
        self.separate();
        self.out.push(b'{');
        self.need_comma = false;
    }

    pub(crate) fn end_object(&mut self) {
        self.out.push(b'}');
        self.need_comma = true;
    }

    pub(crate) fn begin_array(&mut self) {
        self.separate();
        self.out.push(b'[');
        self.need_comma = false;
    }

    pub(crate) fn end_array(&mut self) {
        self.out.push(b']');
        self.need_comma = true;
    }

    pub(crate) fn key(&mut self, key: &str) {
        self.separate();
        self.escaped(key);
        self.out.push(b':');
        self.need_comma = false;
    }

    pub(crate) fn string(&mut self, value: &str) {
        self.separate();
        self.escaped(value);
        self.need_comma = true;
    }

    pub(crate) fn opt_string(&mut self, value: Option<&str>) {
        match value {
            Some(v) => self.string(v),
            None => self.null(),
        }
    }

    pub(crate) fn null(&mut self) {
        self.separate();
        self.out.extend_from_slice(b"null");
        self.need_comma = true;
    }

    pub(crate) fn bool(&mut self, value: bool) {
        self.separate();
        self.out
            .extend_from_slice(if value { b"true" } else { b"false" });
        self.need_comma = true;
    }

    /// Non-finite numbers are written as `0`.
    pub(crate) fn number(&mut self, value: f64) {
        self.separate();
        if !value.is_finite() {
            self.out.push(b'0');
        } else if value.fract() == 0.0 && value.abs() < 1e15 {
            let _ = write!(self.out, "{}", value as i64);
        } else {
            let _ = write!(self.out, "{value}");
        }
        self.need_comma = true;
    }

    /// Shortest `f32` spelling, so `1.1f32` is `1.1` rather than its `f64` widening.
    pub(crate) fn float(&mut self, value: f32) {
        if !value.is_finite() || (value.fract() == 0.0 && value.abs() < 1e7) {
            self.number(f64::from(value));
            return;
        }
        self.separate();
        let _ = write!(self.out, "{value}");
        self.need_comma = true;
    }

    pub(crate) fn strings<'s>(&mut self, values: impl IntoIterator<Item = &'s str>) {
        self.begin_array();
        for v in values {
            self.string(v);
        }
        self.end_array();
    }

    fn escaped(&mut self, value: &str) {
        self.out.push(b'"');
        for &b in value.as_bytes() {
            match b {
                b'"' => self.out.extend_from_slice(b"\\\""),
                b'\\' => self.out.extend_from_slice(b"\\\\"),
                b'\n' => self.out.extend_from_slice(b"\\n"),
                b'\r' => self.out.extend_from_slice(b"\\r"),
                b'\t' => self.out.extend_from_slice(b"\\t"),
                0..=0x1f => {
                    let _ = write!(self.out, "\\u{b:04x}");
                }
                _ => self.out.push(b),
            }
        }
        self.out.push(b'"');
    }
}
