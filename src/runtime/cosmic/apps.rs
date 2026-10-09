//! `bun:cosmic` applications: the freedesktop `.desktop` index.

use std::path::PathBuf;

use bun_jsc::{CallFrame, JSGlobalObject, JSValue, JsResult};

/// Non-empty fields of a NUL-separated list.
fn fields(bytes: &[u8]) -> impl Iterator<Item = &[u8]> {
    bun_core::strings::split(bytes, b"\0").filter(|s| !s.is_empty())
}

#[cfg(unix)]
fn to_path(bytes: &[u8]) -> PathBuf {
    use std::os::unix::ffi::OsStrExt;
    PathBuf::from(std::ffi::OsStr::from_bytes(bytes))
}

#[cfg(not(unix))]
fn to_path(bytes: &[u8]) -> PathBuf {
    PathBuf::from(core::str::from_utf8(bytes).unwrap_or_default())
}

/// `desktopEntries(dirs, locales)`, both NUL-separated, returns the entries as JSON.
#[bun_jsc::host_fn]
pub(crate) fn js_desktop_entries(global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
    let dirs = frame.argument(0).to_utf8(global)?;
    let locales = frame.argument(1).to_utf8(global)?;
    let dirs: Vec<PathBuf> = fields(&dirs).map(to_path).collect();
    let locales: Vec<String> = fields(&locales)
        .filter_map(|s| core::str::from_utf8(s).ok().map(str::to_owned))
        .collect();
    super::json(global, bun_cosmic::desktop_entries(dirs, &locales))
}
