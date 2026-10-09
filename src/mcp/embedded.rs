//! The documentation and skills archives packed by `build.rs`, decompressed on first use.

use std::sync::OnceLock;

static DOCS: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/docs.bin.zst"));
static SKILLS: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/skills.bin.zst"));

/// `(relative path, UTF-8 text)` pairs sorted by path.
pub(crate) type Files = Vec<(String, String)>;

struct Reader<'a> {
    raw: &'a [u8],
    at: usize,
}

impl<'a> Reader<'a> {
    fn take(&mut self, n: usize) -> Option<&'a [u8]> {
        let s = self.raw.get(self.at..self.at.checked_add(n)?)?;
        self.at += n;
        Some(s)
    }
    fn len(&mut self) -> Option<usize> {
        Some(u32::from_le_bytes(self.take(4)?.try_into().ok()?) as usize)
    }
    fn text(&mut self) -> Option<String> {
        let n = self.len()?;
        Some(String::from_utf8_lossy(self.take(n)?).into_owned())
    }
}

fn unpack(packed: &[u8]) -> Files {
    let Ok(raw) = bun_zstd::decompress_alloc(packed) else {
        return Vec::new();
    };
    let mut r = Reader { raw: &raw, at: 0 };
    let count = r.len().unwrap_or(0);
    let mut files = Vec::with_capacity(count.min(4096));
    for _ in 0..count {
        let (Some(path), Some(data)) = (r.text(), r.text()) else {
            break;
        };
        files.push((path, data));
    }
    files
}

pub(crate) fn docs() -> &'static Files {
    static CELL: OnceLock<Files> = OnceLock::new();
    CELL.get_or_init(|| unpack(DOCS))
}

pub(crate) fn skills() -> &'static Files {
    static CELL: OnceLock<Files> = OnceLock::new();
    CELL.get_or_init(|| unpack(SKILLS))
}
