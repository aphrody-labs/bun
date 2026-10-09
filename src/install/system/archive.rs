//! In-memory archive reading (zip, tar, tar.gz) over libarchive.

use bun_libarchive::lib::{Archive, Entry, Result as ArResult};

use super::{Error, Result};

pub struct Item<'a> {
    /// `/`-separated path as stored in the archive.
    pub path: &'a [u8],
    pub is_dir: bool,
    pub data: Vec<u8>,
}

/// Calls `f` for every entry of `bytes`; `f` returning `false` stops early.
pub fn for_each(bytes: &[u8], what: &str, f: &mut dyn FnMut(Item<'_>) -> Result<bool>) -> Result<()> {
    let ar = Archive::read_new();
    let a = Archive::opaque_ref(ar);
    let _free = scopeguard::guard((), |()| {
        let _ = a.read_close();
        let _ = a.read_free();
    });
    let _ = a.read_support_format_zip();
    let _ = a.read_support_format_tar();
    let _ = a.read_support_filter_gzip();
    if a.read_open_memory(bytes) != ArResult::Ok {
        return Err(Error::Parse(format!("{what} is not a readable archive")));
    }
    loop {
        let mut entry: *mut Entry = core::ptr::null_mut();
        match a.read_next_header(&mut entry) {
            ArResult::Eof => return Ok(()),
            ArResult::Ok | ArResult::Warn => {}
            _ => return Err(Error::Parse(format!("{what}: corrupt archive entry"))),
        }
        let e = Entry::opaque_ref(entry);
        let path = e.pathname().as_bytes().to_vec();
        let is_dir = bun_sys::kind_from_mode(e.filetype() as bun_sys::Mode) == bun_sys::FileKind::Directory
            || path.ends_with(b"/");
        let mut data = Vec::new();
        if !is_dir {
            let size = usize::try_from(e.size()).unwrap_or(0);
            data.reserve(size);
            let mut chunk = vec![0u8; 64 * 1024];
            loop {
                let n = a.read_data(&mut chunk);
                if n < 0 {
                    return Err(Error::Parse(format!("{what}: failed to read entry data")));
                }
                if n == 0 {
                    break;
                }
                data.extend_from_slice(&chunk[..n as usize]);
            }
        }
        if !f(Item { path: &path, is_dir, data })? {
            return Ok(());
        }
    }
}

/// Contents of the first entry whose path equals `name` (ASCII case-insensitive).
pub fn read_entry(bytes: &[u8], what: &str, name: &[u8]) -> Result<Option<Vec<u8>>> {
    let mut found = None;
    for_each(bytes, what, &mut |item| {
        if !item.is_dir && item.path.eq_ignore_ascii_case(name) {
            found = Some(item.data);
            return Ok(false);
        }
        Ok(true)
    })?;
    Ok(found)
}

/// Rejects absolute paths and `..` components; returns the path with `\` normalized to `/`.
pub fn safe_relative(path: &[u8]) -> Option<Vec<u8>> {
    let mut out: Vec<u8> = Vec::with_capacity(path.len());
    for part in bun_core::strings::split_any(path, b"/\\") {
        match part {
            b"" | b"." => continue,
            b".." => return None,
            p if bun_core::strings::contains_char(p, b':') => return None,
            p => {
                if !out.is_empty() {
                    out.push(b'/');
                }
                out.extend_from_slice(p);
            }
        }
    }
    if out.is_empty() { None } else { Some(out) }
}
