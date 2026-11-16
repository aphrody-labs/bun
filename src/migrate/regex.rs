//! Patterns of the rule registry. They are JavaScript regular expressions, run by Yarr on the bytes of a file (every byte
//! is one character, which is enough for the ASCII patterns of the registry).

use bun_yarr::{Compiled, NO_MATCH, Text, flags};

pub(crate) struct Regex {
    compiled: Compiled,
}

/// The byte ranges of a match and its groups.
pub(crate) struct Match {
    groups: Vec<Option<(usize, usize)>>,
}

impl Regex {
    /// `flags` holds any of `i`, `m` and `s`.
    pub(crate) fn new(pattern: &[u8], flag_letters: &[u8]) -> Result<Regex, &'static str> {
        let mut bits = 0;
        for letter in flag_letters {
            bits |= match letter {
                b'i' => flags::IGNORE_CASE,
                b'm' => flags::MULTILINE,
                b's' => flags::DOT_ALL,
                _ => return Err("unknown regular expression flag"),
            };
        }
        match Compiled::new(Text::Latin1(pattern), bits) {
            Ok(compiled) => Ok(Regex { compiled }),
            Err(_) => Err("invalid regular expression"),
        }
    }

    /// The first match that starts at `start` or after it.
    pub(crate) fn find_at(&self, text: &[u8], start: usize) -> Option<Match> {
        let mut offsets = vec![0u32; self.compiled.offsets_len()];
        if start > text.len() || !self.compiled.exec(Text::Latin1(text), start as u32, &mut offsets) {
            return None;
        }
        let groups = offsets
            .chunks_exact(2)
            .map(|pair| (pair[0] != NO_MATCH).then_some((pair[0] as usize, pair[1] as usize)))
            .collect();
        Some(Match { groups })
    }

    pub(crate) fn is_match(&self, text: &[u8]) -> bool {
        self.find_at(text, 0).is_some()
    }

    /// Every non-overlapping match, in order.
    pub(crate) fn find_all(&self, text: &[u8]) -> Vec<Match> {
        let mut found = Vec::new();
        let mut at = 0;
        while let Some(m) = self.find_at(text, at) {
            let (start, end) = m.range();
            at = if end > start { end } else { end + 1 };
            found.push(m);
        }
        found
    }
}

impl Match {
    pub(crate) fn range(&self) -> (usize, usize) {
        self.groups[0].unwrap_or((0, 0))
    }

    pub(crate) fn group_range(&self, index: usize) -> Option<(usize, usize)> {
        *self.groups.get(index)?
    }

    pub(crate) fn group<'a>(&self, text: &'a [u8], index: usize) -> Option<&'a [u8]> {
        let (start, end) = (*self.groups.get(index)?)?;
        text.get(start..end)
    }

    /// Writes `template` to `out`, where `$n` and `${n}` stand for the text of group `n`.
    pub(crate) fn expand(&self, template: &[u8], text: &[u8], out: &mut Vec<u8>) {
        let mut at = 0;
        while at < template.len() {
            let byte = template[at];
            if byte != b'$' {
                out.push(byte);
                at += 1;
                continue;
            }
            let braced = template.get(at + 1) == Some(&b'{');
            let digits_at = at + 1 + usize::from(braced);
            let digits = template[digits_at..].iter().take_while(|digit| digit.is_ascii_digit()).count();
            let closed = !braced || template.get(digits_at + digits) == Some(&b'}');
            if digits == 0 || !closed {
                out.push(byte);
                at += 1;
                continue;
            }
            let number = template[digits_at..digits_at + digits].iter().fold(0usize, |n, d| n * 10 + usize::from(d - b'0'));
            out.extend_from_slice(self.group(text, number).unwrap_or(b""));
            at = digits_at + digits + usize::from(braced);
        }
    }
}
