//! Bun does not use io_uring on Linux (libuv is Windows-only here), so only a capability probe is exposed.

use bun_jsc::{CallFrame, JSGlobalObject, JSValue, JsResult};

#[cfg(target_os = "linux")]
const IORING_REGISTER_PROBE: libc::c_long = 8;
#[cfg(target_os = "linux")]
const IO_URING_OP_SUPPORTED: u16 = 1;

/// `struct io_uring_probe_op`
#[cfg(target_os = "linux")]
#[repr(C)]
#[derive(Clone, Copy)]
struct ProbeOp {
    op: u8,
    _resv: u8,
    flags: u16,
    _resv2: u32,
}

/// `struct io_uring_probe` with room for all 256 opcodes.
#[cfg(target_os = "linux")]
#[repr(C)]
struct Probe {
    _last_op: u8,
    ops_len: u8,
    _resv: u16,
    _resv2: [u32; 3],
    ops: [ProbeOp; 256],
}

/// `ioUringProbe()` returns the supported opcodes, or `null` when io_uring is unavailable.
#[bun_jsc::host_fn]
pub(crate) fn js_io_uring_probe(global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
    #[cfg(target_os = "linux")]
    {
        let _ = frame;

        // 2 = disabled for everyone; 1 = restricted to a group, which setup reports as EPERM.
        if let Ok(setting) = super::read_file(c"/proc/sys/kernel/io_uring_disabled", 16)
            && super::trim_end(&setting) == b"2"
        {
            return Ok(JSValue::NULL);
        }

        // `struct io_uring_params` is 120 bytes.
        let mut params = [0u64; 15];
        // SAFETY: `params` is at least as large as `struct io_uring_params` and zeroed.
        let rc = unsafe {
            libc::syscall(
                super::nr::IO_URING_SETUP,
                1 as libc::c_long,
                params.as_mut_ptr(),
            )
        };
        if rc < 0 {
            return Ok(JSValue::NULL);
        }
        let ring = rc as libc::c_int;

        // SAFETY: all-zero is a valid `Probe`.
        let mut probe: Probe = unsafe { core::mem::zeroed() };
        // SAFETY: `probe` has room for the 256 opcodes passed as the count; `ring` is open.
        let rc = unsafe {
            libc::syscall(
                super::nr::IO_URING_REGISTER,
                ring as libc::c_long,
                IORING_REGISTER_PROBE,
                core::ptr::addr_of_mut!(probe),
                256 as libc::c_long,
            )
        };
        // SAFETY: `ring` was opened above and is closed once.
        unsafe { libc::close(ring) };

        let ops: Vec<u8> = if rc < 0 {
            Vec::new()
        } else {
            probe
                .ops
                .iter()
                .take(usize::from(probe.ops_len))
                .filter(|op| op.flags & IO_URING_OP_SUPPORTED != 0)
                .map(|op| op.op)
                .collect()
        };
        JSValue::create_array_from_iter(global, ops.iter(), |op| {
            Ok(JSValue::js_number_from_int32(i32::from(*op)))
        })
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = frame;
        Err(super::unsupported(global))
    }
}
