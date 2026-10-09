//! cgroup v2 file operations under `/sys/fs/cgroup`.
//!
//! Paths are relative to the cgroup2 mount root. `src/js/bun/linux.ts` turns
//! limits into the strings the kernel expects and calls these primitives.

use bun_jsc::{CallFrame, JSGlobalObject, JSValue, JsResult};

#[cfg(target_os = "linux")]
const CGROUP_ROOT: &str = "/sys/fs/cgroup";
#[cfg(target_os = "linux")]
const CGROUP2_SUPER_MAGIC: i64 = 0x6367_7270;
/// Controllers `cgroup.create` delegates to children.
#[cfg(target_os = "linux")]
const CONTROLLERS: [&[u8]; 4] = [b"cpu", b"memory", b"pids", b"io"];

/// Split a relative cgroup path into segments; `None` if any segment is `.` or `..`.
#[cfg(target_os = "linux")]
fn segments(path: &[u8]) -> Option<Vec<&[u8]>> {
    let mut out = Vec::new();
    for seg in bun_core::strings::split(path, b"/") {
        if seg.is_empty() {
            continue;
        }
        if seg == b"." || seg == b".." {
            return None;
        }
        out.push(seg);
    }
    Some(out)
}

#[cfg(target_os = "linux")]
fn join(base: &str, segs: &[&[u8]]) -> Vec<u8> {
    let mut out = base.as_bytes().to_vec();
    for seg in segs {
        out.push(b'/');
        out.extend_from_slice(seg);
    }
    out
}

#[cfg(target_os = "linux")]
fn to_cstring(global: &JSGlobalObject, bytes: Vec<u8>) -> JsResult<std::ffi::CString> {
    std::ffi::CString::new(bytes).map_err(|_| {
        global.throw_type_error(format_args!("cgroup path must not contain null bytes"))
    })
}

#[cfg(target_os = "linux")]
fn path_arg(global: &JSGlobalObject, frame: &CallFrame, allow_root: bool) -> JsResult<Vec<u8>> {
    let raw = super::cstr_arg(global, frame, 0)?;
    match segments(raw.to_bytes()) {
        Some(segs) if allow_root || !segs.is_empty() => Ok(join(CGROUP_ROOT, &segs)),
        _ => Err(global.throw_invalid_arguments(format_args!("invalid cgroup path"))),
    }
}

#[cfg(target_os = "linux")]
fn file_arg(global: &JSGlobalObject, frame: &CallFrame, i: usize) -> JsResult<Vec<u8>> {
    let raw = super::cstr_arg(global, frame, i)?;
    let name = raw.to_bytes();
    if name.is_empty()
        || bun_core::strings::contains_char(name, b'/')
        || name == b"."
        || name == b".."
    {
        return Err(global.throw_invalid_arguments(format_args!("invalid cgroup file name")));
    }
    Ok(name.to_vec())
}

/// Enable the controllers in `CONTROLLERS` that `dir` offers for its children. Best effort:
/// the kernel refuses when the cgroup has its own processes or lacks the controller.
#[cfg(target_os = "linux")]
fn enable_controllers(dir: &[u8]) {
    let mut available = dir.to_vec();
    available.extend_from_slice(b"/cgroup.controllers");
    let Ok(available) = std::ffi::CString::new(available) else {
        return;
    };
    let Ok(listed) = super::read_file(&available, 4096) else {
        return;
    };
    let mut subtree = dir.to_vec();
    subtree.extend_from_slice(b"/cgroup.subtree_control");
    let Ok(subtree) = std::ffi::CString::new(subtree) else {
        return;
    };
    for name in CONTROLLERS {
        if bun_core::strings::split_any(&listed, b" \t\r\n").any(|token| token == name) {
            let mut request = b"+".to_vec();
            request.extend_from_slice(name);
            let _ = super::write_file(&subtree, &request);
        }
    }
}

/// `cgroupMkdir(path)` creates `path` and its missing parents and enables
/// controllers on every parent.
#[bun_jsc::host_fn]
pub(crate) fn js_cgroup_mkdir(global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
    #[cfg(target_os = "linux")]
    {
        let raw = super::cstr_arg(global, frame, 0)?;
        let Some(segs) = segments(raw.to_bytes()).filter(|s| !s.is_empty()) else {
            return Err(global.throw_invalid_arguments(format_args!("invalid cgroup path")));
        };

        let root = to_cstring(global, CGROUP_ROOT.as_bytes().to_vec())?;
        // SAFETY: all-zero is a valid `statfs`.
        let mut st: libc::statfs = unsafe { core::mem::zeroed() };
        // SAFETY: `root` is NUL-terminated and `st` is a valid out-pointer.
        if unsafe { libc::statfs(root.as_ptr(), &mut st) } != 0 {
            return Err(super::errno_error(
                global,
                bun_sys::last_errno(),
                "statfs",
                Some(CGROUP_ROOT.as_bytes()),
            ));
        }
        if st.f_type as i64 != CGROUP2_SUPER_MAGIC {
            return Err(super::errno_error(
                global,
                libc::ENOTSUP,
                "cgroup",
                Some(CGROUP_ROOT.as_bytes()),
            ));
        }

        let mut parent = CGROUP_ROOT.as_bytes().to_vec();
        for seg in segs {
            enable_controllers(&parent);
            parent.push(b'/');
            parent.extend_from_slice(seg);
            let dir = to_cstring(global, parent.clone())?;
            // SAFETY: `dir` is NUL-terminated.
            if unsafe { libc::mkdir(dir.as_ptr(), 0o755) } != 0 {
                let errno = bun_sys::last_errno();
                if errno != libc::EEXIST {
                    return Err(super::errno_error(global, errno, "mkdir", Some(&parent)));
                }
            }
        }
        Ok(JSValue::UNDEFINED)
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = frame;
        Err(super::unsupported(global))
    }
}

/// `cgroupWrite(path, file, value)`
#[bun_jsc::host_fn]
pub(crate) fn js_cgroup_write(global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
    #[cfg(target_os = "linux")]
    {
        let mut full = path_arg(global, frame, true)?;
        full.push(b'/');
        full.extend_from_slice(&file_arg(global, frame, 1)?);
        let value = frame.argument(2).to_utf8(global)?;
        let path = to_cstring(global, full.clone())?;
        if let Err(errno) = super::write_file(&path, &value) {
            return Err(super::errno_error(global, errno, "write", Some(&full)));
        }
        Ok(JSValue::UNDEFINED)
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = frame;
        Err(super::unsupported(global))
    }
}

/// `cgroupRead(path, file)` returns the file contents.
#[bun_jsc::host_fn]
pub(crate) fn js_cgroup_read(global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
    #[cfg(target_os = "linux")]
    {
        let mut full = path_arg(global, frame, true)?;
        full.push(b'/');
        full.extend_from_slice(&file_arg(global, frame, 1)?);
        let path = to_cstring(global, full.clone())?;
        match super::read_file(&path, 1 << 20) {
            Ok(bytes) => bun_jsc::bun_string_jsc::create_utf8_for_js(global, &bytes),
            Err(errno) => Err(super::errno_error(global, errno, "read", Some(&full))),
        }
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = frame;
        Err(super::unsupported(global))
    }
}

/// `cgroupRmdir(path)` removes an empty cgroup.
#[bun_jsc::host_fn]
pub(crate) fn js_cgroup_rmdir(global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
    #[cfg(target_os = "linux")]
    {
        let full = path_arg(global, frame, false)?;
        let path = to_cstring(global, full.clone())?;
        // SAFETY: `path` is NUL-terminated.
        if unsafe { libc::rmdir(path.as_ptr()) } != 0 {
            return Err(super::errno_error(
                global,
                bun_sys::last_errno(),
                "rmdir",
                Some(&full),
            ));
        }
        Ok(JSValue::UNDEFINED)
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = frame;
        Err(super::unsupported(global))
    }
}
