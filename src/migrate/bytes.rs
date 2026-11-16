//! Byte-string helpers. Everything in this crate works on bytes: sources are not always valid UTF-8.

use bun_core::strings;

pub(crate) fn find_from(haystack: &[u8], needle: &[u8], from: usize) -> Option<usize> {
    let rest = haystack.get(from..)?;
    strings::index_of(rest, needle).map(|at| at + from)
}

pub(crate) fn find_byte_from(haystack: &[u8], byte: u8, from: usize) -> Option<usize> {
    strings::index_of_char_pos(haystack, byte, from)
}

/// The text of the line that starts at `start`, without the line terminator.
pub(crate) fn line_end(text: &[u8], start: usize) -> usize {
    find_byte_from(text, b'\n', start).unwrap_or(text.len())
}

/// Start offsets of the lines of a file, to turn an offset into a line and a column.
pub(crate) struct LineIndex {
    starts: Vec<usize>,
}

impl LineIndex {
    pub(crate) fn new(text: &[u8]) -> LineIndex {
        let mut starts = vec![0];
        let mut at = 0;
        while let Some(newline) = find_byte_from(text, b'\n', at) {
            starts.push(newline + 1);
            at = newline + 1;
        }
        LineIndex { starts }
    }

    /// One-based line and column of `offset`.
    pub(crate) fn locate(&self, offset: usize) -> (u32, u32) {
        let line = self.starts.partition_point(|&start| start <= offset);
        let start = self.starts[line.saturating_sub(1)];
        (line as u32, (offset - start) as u32 + 1)
    }
}

/// Whether `name` matches `pattern`, where `*` stands for any run of bytes that has no `/`. Both are base names or
/// `/`-separated paths.
pub(crate) fn glob_matches(pattern: &[u8], name: &[u8]) -> bool {
    match pattern.split_first() {
        None => name.is_empty(),
        Some((b'*', rest)) => {
            let mut taken = 0;
            loop {
                if glob_matches(rest, &name[taken..]) {
                    return true;
                }
                if taken == name.len() || name[taken] == b'/' {
                    return false;
                }
                taken += 1;
            }
        }
        Some((&byte, rest)) => name.split_first().is_some_and(|(&first, tail)| first == byte && glob_matches(rest, tail)),
    }
}

/// Whether `path` is inside the directory `dir`, or is it.
pub(crate) fn is_within(path: &[u8], dir: &[u8]) -> bool {
    dir.is_empty() || path == dir || (path.starts_with(dir) && path.get(dir.len()) == Some(&b'/'))
}

pub(crate) fn dirname(path: &[u8]) -> &[u8] {
    match strings::last_index_of_char(path, b'/') {
        Some(at) => &path[..at],
        None => b"",
    }
}

pub(crate) fn basename(path: &[u8]) -> &[u8] {
    match strings::last_index_of_char(path, b'/') {
        Some(at) => &path[at + 1..],
        None => path,
    }
}

pub(crate) fn join(dir: &[u8], name: &[u8]) -> Vec<u8> {
    if dir.is_empty() {
        name.to_vec()
    } else {
        [dir, b"/", name].concat()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn globs_do_not_cross_directories() {
        assert!(glob_matches(b"packages/*", b"packages/app"));
        assert!(!glob_matches(b"packages/*", b"packages/app/lib"));
        assert!(glob_matches(b"Dockerfile*", b"Dockerfile.dev"));
        assert!(!glob_matches(b"*.yml", b"a/b.yml"));
    }

    #[test]
    fn locates_lines() {
        let index = LineIndex::new(b"ab\ncd\n");
        assert_eq!(index.locate(0), (1, 1));
        assert_eq!(index.locate(4), (2, 2));
    }
}
