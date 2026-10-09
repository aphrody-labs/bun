//! Kernel parameters through `/proc/sys`.

use bun_jsc::{CallFrame, JSGlobalObject, JSValue, JsResult};

/// `net.ipv4.ip_forward` to `/proc/sys/net/ipv4/ip_forward`. `None` for names that are
/// empty, have an empty segment, or contain anything but `[A-Za-z0-9_-]` and `.`.
#[cfg(target_os = "linux")]
fn proc_path(name: &[u8]) -> Option<Vec<u8>> {
    if name.is_empty() {
        return None;
    }
    let mut out = b"/proc/sys/".to_vec();
    let mut segment_len = 0usize;
    for &b in name {
        if b == b'.' {
            if segment_len == 0 {
                return None;
            }
            segment_len = 0;
            out.push(b'/');
        } else if b.is_ascii_alphanumeric() || b == b'_' || b == b'-' {
            segment_len += 1;
            out.push(b);
        } else {
            return None;
        }
    }
    if segment_len == 0 {
        return None;
    }
    Some(out)
}

#[cfg(target_os = "linux")]
fn resolve(global: &JSGlobalObject, name: &[u8]) -> JsResult<(std::ffi::CString, Vec<u8>)> {
    let Some(path) = proc_path(name) else {
        return Err(global.throw_invalid_arguments(format_args!("invalid sysctl name")));
    };
    match std::ffi::CString::new(path.clone()) {
        Ok(c) => Ok((c, path)),
        Err(_) => Err(global.throw_invalid_arguments(format_args!("invalid sysctl name"))),
    }
}

/// `sysctlGet(name)` returns the value without the trailing newline.
#[bun_jsc::host_fn]
pub(crate) fn js_sysctl_get(global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
    #[cfg(target_os = "linux")]
    {
        let name = super::cstr_arg(global, frame, 0)?;
        let (path, display) = resolve(global, name.to_bytes())?;
        match super::read_file(&path, 1 << 20) {
            Ok(bytes) => {
                bun_jsc::bun_string_jsc::create_utf8_for_js(global, super::trim_end(&bytes))
            }
            Err(errno) => Err(super::errno_error(global, errno, "read", Some(&display))),
        }
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = frame;
        Err(super::unsupported(global))
    }
}

/// `sysctlSet(name, value)`
#[bun_jsc::host_fn]
pub(crate) fn js_sysctl_set(global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
    #[cfg(target_os = "linux")]
    {
        let name = super::cstr_arg(global, frame, 0)?;
        let (path, display) = resolve(global, name.to_bytes())?;
        let value = frame.argument(1).to_utf8(global)?;
        if let Err(errno) = super::write_file(&path, &value) {
            return Err(super::errno_error(global, errno, "write", Some(&display)));
        }
        Ok(JSValue::UNDEFINED)
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = frame;
        Err(super::unsupported(global))
    }
}
