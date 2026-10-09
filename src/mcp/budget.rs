//! Response budget: a tool's text is cut to the call's token budget (4 bytes per token) at a line
//! boundary, and the remainder is kept in memory behind a cursor (`<id>.<offset>`) that the same
//! tool accepts as its `cursor` argument.

use std::collections::VecDeque;

use crate::util::floor_char;

const BYTES_PER_TOKEN: usize = 4;
const MAX_ENTRIES: usize = 64;

#[derive(Default)]
pub(crate) struct OutputStore {
    entries: VecDeque<(u64, String)>,
    next: u64,
}

pub(crate) struct Page {
    pub(crate) text: String,
    pub(crate) cursor: Option<String>,
}

/// Byte length of the first page of `text` under `max_bytes`, ending on a line when one ends in
/// the last quarter of the window.
fn cut(text: &str, max_bytes: usize) -> usize {
    if text.len() <= max_bytes {
        return text.len();
    }
    let end = floor_char(text, max_bytes);
    match text[..end].rfind('\n') {
        Some(nl) if nl + 1 >= end - end / 4 => nl + 1,
        _ => end,
    }
}

pub(crate) fn budget_bytes(max_tokens: usize) -> usize {
    max_tokens.saturating_mul(BYTES_PER_TOKEN)
}

impl OutputStore {
    /// First page of `text`; the rest is stored when it does not fit.
    pub(crate) fn page(&mut self, tool: &str, text: String, max_bytes: usize) -> Page {
        let footer_room = 160;
        let window = max_bytes.saturating_sub(footer_room).max(256);
        let first = cut(&text, window);
        if first == text.len() {
            return Page { text, cursor: None };
        }
        let id = self.next;
        self.next += 1;
        let page = self.render(tool, id, &text, 0, first);
        if self.entries.len() == MAX_ENTRIES {
            self.entries.pop_front();
        }
        self.entries.push_back((id, text));
        page
    }

    /// The page at `cursor`, or `None` when the cursor is unknown or expired.
    pub(crate) fn resume(&self, tool: &str, cursor: &str, max_bytes: usize) -> Option<Page> {
        let (id, offset) = cursor.split_once('.')?;
        let id: u64 = id.parse().ok()?;
        let offset: usize = offset.parse().ok()?;
        let (_, text) = self.entries.iter().find(|(i, _)| *i == id)?;
        if offset > text.len() || !text.is_char_boundary(offset) {
            return None;
        }
        let window = max_bytes.saturating_sub(160).max(256);
        let len = cut(&text[offset..], window);
        Some(self.render(tool, id, text, offset, offset + len))
    }

    fn render(&self, tool: &str, id: u64, text: &str, start: usize, end: usize) -> Page {
        let mut out = text[start..end].to_owned();
        if end >= text.len() {
            return Page {
                text: out,
                cursor: None,
            };
        }
        let cursor = format!("{id}.{end}");
        if !out.ends_with('\n') {
            out.push('\n');
        }
        out.push_str(&format!(
            "… [truncated at byte {end} of {}; call {tool} with {{\"cursor\":\"{cursor}\"}} for the rest]",
            text.len()
        ));
        Page {
            text: out,
            cursor: Some(cursor),
        }
    }
}
