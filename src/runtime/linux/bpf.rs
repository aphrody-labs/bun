//! eBPF: maps, program loading and pinning (`bpf(2)`).
//!
//! Attaching programs is left to the interfaces that own each hook
//! (`perf_event` ioctls, netlink, cgroup/bpffs); this file covers the
//! `bpf(2)` commands that need pointers into Bun's memory.

use bun_jsc::{CallFrame, JSGlobalObject, JSValue, JsResult};

#[cfg(target_os = "linux")]
mod cmd {
    use libc::c_long;
    pub(super) const MAP_CREATE: c_long = 0;
    pub(super) const MAP_LOOKUP_ELEM: c_long = 1;
    pub(super) const MAP_UPDATE_ELEM: c_long = 2;
    pub(super) const MAP_DELETE_ELEM: c_long = 3;
    pub(super) const MAP_GET_NEXT_KEY: c_long = 4;
    pub(super) const PROG_LOAD: c_long = 5;
    pub(super) const OBJ_PIN: c_long = 6;
    pub(super) const OBJ_GET: c_long = 7;
    pub(super) const OBJ_GET_INFO_BY_FD: c_long = 15;
}

/// Per-CPU map types, whose lookups write one value per possible CPU.
#[cfg(target_os = "linux")]
const PER_CPU_MAP_TYPES: [u32; 4] = [5, 6, 10, 21];

/// Room for every `union bpf_attr` member this file fills; the tail stays zero,
/// which the kernel requires of bytes it does not know.
#[cfg(target_os = "linux")]
#[repr(C, align(8))]
struct Attr([u8; 128]);

#[cfg(target_os = "linux")]
impl Attr {
    fn new() -> Self {
        Attr([0; 128])
    }
    fn u32(&mut self, offset: usize, value: u32) -> &mut Self {
        self.0[offset..offset + 4].copy_from_slice(&value.to_ne_bytes());
        self
    }
    fn u64(&mut self, offset: usize, value: u64) -> &mut Self {
        self.0[offset..offset + 8].copy_from_slice(&value.to_ne_bytes());
        self
    }
    fn ptr<T>(&mut self, offset: usize, value: *const T) -> &mut Self {
        self.u64(offset, value as usize as u64)
    }
    fn name(&mut self, offset: usize, name: &[u8]) -> &mut Self {
        // BPF_OBJ_NAME_LEN is 16, NUL included.
        let len = name.len().min(15);
        self.0[offset..offset + len].copy_from_slice(&name[..len]);
        self
    }
    /// # Safety
    /// Every pointer stored in the attribute must be valid for what `command` does with it.
    unsafe fn call(&self, command: libc::c_long) -> libc::c_long {
        // SAFETY: forwarded to the caller.
        unsafe {
            libc::syscall(
                super::nr::BPF,
                command,
                self.0.as_ptr(),
                self.0.len() as libc::c_long,
            )
        }
    }
}

/// `bpfMapCreate(type, keySize, valueSize, maxEntries, flags, name)` returns the map fd.
#[bun_jsc::host_fn]
pub(crate) fn js_bpf_map_create(global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
    #[cfg(target_os = "linux")]
    {
        let name = super::opt_cstr_arg(global, frame, 5)?;
        let mut attr = Attr::new();
        attr.u32(0, super::int_arg(frame, 0) as u32)
            .u32(4, super::int_arg(frame, 1) as u32)
            .u32(8, super::int_arg(frame, 2) as u32)
            .u32(12, super::int_arg(frame, 3) as u32)
            .u32(16, super::int_arg(frame, 4) as u32);
        if let Some(name) = &name {
            attr.name(28, name.to_bytes());
        }
        // SAFETY: MAP_CREATE reads no pointers.
        let rc = unsafe { attr.call(cmd::MAP_CREATE) };
        let fd = super::check(global, rc, "bpf", None)?;
        Ok(JSValue::js_number_from_int64(fd as i64))
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = frame;
        Err(super::unsupported(global))
    }
}

/// `(type, key_size, value_size)` of a map, from `BPF_OBJ_GET_INFO_BY_FD`.
#[cfg(target_os = "linux")]
fn map_info(global: &JSGlobalObject, fd: i32) -> JsResult<(u32, usize, usize)> {
    // `struct bpf_map_info` starts with type, id, key_size, value_size (u32 each).
    let mut info = [0u32; 20];
    let mut attr = Attr::new();
    attr.u32(0, fd as u32)
        .u32(4, core::mem::size_of_val(&info) as u32)
        .ptr(8, info.as_mut_ptr().cast_const());
    // SAFETY: the kernel writes at most `info_len` bytes into `info`.
    let rc = unsafe { attr.call(cmd::OBJ_GET_INFO_BY_FD) };
    super::check(global, rc, "bpf", None)?;
    Ok((info[0], info[2] as usize, info[3] as usize))
}

/// `bpfMapElem(op, fd, key, value, flags)`: `op` is 1 lookup (into `value`),
/// 2 update, 3 delete, 4 next key (into `value`; `key` null for the first).
/// Returns `false` when the key does not exist (or there is no next key).
#[bun_jsc::host_fn]
pub(crate) fn js_bpf_map_elem(global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
    #[cfg(target_os = "linux")]
    {
        let op = super::int_arg(frame, 0) as libc::c_long;
        let fd = super::int_arg(frame, 1) as i32;
        let (map_type, key_size, value_size) = map_info(global, fd)?;
        if PER_CPU_MAP_TYPES.contains(&map_type) {
            return Err(global.throw_invalid_arguments(format_args!(
                "per-CPU maps are not supported by bpfMapElem"
            )));
        }

        let key_value = frame.argument(2);
        let key = if key_value.is_undefined_or_null() {
            None
        } else {
            key_value.as_array_buffer(global)
        };
        let key_ptr = match &key {
            Some(k) if k.slice().len() >= key_size => k.slice().as_ptr(),
            None if op == cmd::MAP_GET_NEXT_KEY && key_value.is_undefined_or_null() => {
                core::ptr::null()
            }
            _ => {
                return Err(global.throw_invalid_arguments(format_args!(
                    "key must be an ArrayBufferView of at least {key_size} bytes"
                )));
            }
        };

        let (needs_value, value_len) = match op {
            cmd::MAP_LOOKUP_ELEM | cmd::MAP_UPDATE_ELEM => (true, value_size),
            cmd::MAP_GET_NEXT_KEY => (true, key_size),
            cmd::MAP_DELETE_ELEM => (false, 0),
            _ => {
                return Err(global.throw_invalid_arguments(format_args!(
                    "op must be 1 (lookup), 2 (update), 3 (delete) or 4 (next key)"
                )));
            }
        };
        let mut value = if needs_value {
            frame.argument(3).as_array_buffer(global)
        } else {
            None
        };
        let value_ptr = match &mut value {
            Some(v) if v.slice().len() >= value_len => v.slice_mut().as_mut_ptr(),
            None if !needs_value => core::ptr::null_mut(),
            _ => {
                return Err(global.throw_invalid_arguments(format_args!(
                    "value must be an ArrayBufferView of at least {value_len} bytes"
                )));
            }
        };

        let mut attr = Attr::new();
        attr.u32(0, fd as u32)
            .ptr(8, key_ptr)
            .ptr(16, value_ptr.cast_const())
            .u64(24, super::int_arg(frame, 4) as u64);
        // SAFETY: `key` and `value` were checked against the map's key and value sizes
        // above and stay alive until the syscall returns.
        let rc = unsafe { attr.call(op) };
        if rc < 0 && bun_sys::last_errno() == libc::ENOENT && op != cmd::MAP_UPDATE_ELEM {
            return Ok(JSValue::js_boolean(false));
        }
        super::check(global, rc, "bpf", None)?;
        Ok(JSValue::js_boolean(true))
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = frame;
        Err(super::unsupported(global))
    }
}

/// `bpfProgLoad(type, insns, license, logSize, expectedAttachType, name)` returns
/// the program fd. On failure the verifier log is the error's `log` property.
#[bun_jsc::host_fn]
pub(crate) fn js_bpf_prog_load(global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
    #[cfg(target_os = "linux")]
    {
        let Some(insns) = frame.argument(1).as_array_buffer(global) else {
            return Err(global.throw_invalid_arguments(format_args!(
                "insns must be an ArrayBufferView of struct bpf_insn"
            )));
        };
        let insns = insns.slice();
        if insns.is_empty() || insns.len() % 8 != 0 {
            return Err(global.throw_invalid_arguments(format_args!(
                "insns must be a non-empty multiple of 8 bytes"
            )));
        }
        let license = super::cstr_arg(global, frame, 2)?;
        let log_size = (super::int_arg(frame, 3).max(0) as usize).min(16 << 20);
        let name = super::opt_cstr_arg(global, frame, 5)?;
        let mut log = vec![0u8; log_size];

        let mut attr = Attr::new();
        attr.u32(0, super::int_arg(frame, 0) as u32)
            .u32(4, (insns.len() / 8) as u32)
            .ptr(8, insns.as_ptr())
            .ptr(16, license.as_ptr())
            .u32(68, super::int_arg(frame, 4) as u32);
        if log_size > 0 {
            attr.u32(24, 1).u32(28, log_size as u32).ptr(32, log.as_mut_ptr().cast_const());
        }
        if let Some(name) = &name {
            attr.name(48, name.to_bytes());
        }
        // SAFETY: `insns`, `license` and `log` are valid for the lengths stored in the
        // attribute and outlive the call.
        let rc = unsafe { attr.call(cmd::PROG_LOAD) };
        if rc < 0 {
            let errno = bun_sys::last_errno();
            let err = super::errno_error(global, errno, "bpf", None);
            let end = bun_core::strings::index_of_char_usize(&log, 0).unwrap_or(log.len());
            if end > 0 {
                let exception = global.take_exception(err);
                if let Ok(text) = bun_jsc::bun_string_jsc::create_utf8_for_js(global, &log[..end]) {
                    exception.put(global, "log", text);
                }
                return Err(global.throw_value(exception));
            }
            return Err(err);
        }
        Ok(JSValue::js_number_from_int64(rc as i64))
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = frame;
        Err(super::unsupported(global))
    }
}

/// `bpfObjPin(fd, path)` pins a map or program in bpffs.
#[bun_jsc::host_fn]
pub(crate) fn js_bpf_obj_pin(global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
    #[cfg(target_os = "linux")]
    {
        let fd = super::int_arg(frame, 0) as u32;
        let path = super::cstr_arg(global, frame, 1)?;
        let mut attr = Attr::new();
        attr.ptr(0, path.as_ptr()).u32(8, fd);
        // SAFETY: `path` is NUL-terminated and outlives the call.
        let rc = unsafe { attr.call(cmd::OBJ_PIN) };
        super::check(global, rc, "bpf", Some(path.to_bytes()))?;
        Ok(JSValue::UNDEFINED)
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = frame;
        Err(super::unsupported(global))
    }
}

/// `bpfObjGet(path, flags)` opens a pinned map or program and returns its fd.
#[bun_jsc::host_fn]
pub(crate) fn js_bpf_obj_get(global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
    #[cfg(target_os = "linux")]
    {
        let path = super::cstr_arg(global, frame, 0)?;
        let mut attr = Attr::new();
        attr.ptr(0, path.as_ptr())
            .u32(12, super::int_arg(frame, 1) as u32);
        // SAFETY: `path` is NUL-terminated and outlives the call.
        let rc = unsafe { attr.call(cmd::OBJ_GET) };
        let fd = super::check(global, rc, "bpf", Some(path.to_bytes()))?;
        Ok(JSValue::js_number_from_int64(fd as i64))
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = frame;
        Err(super::unsupported(global))
    }
}
