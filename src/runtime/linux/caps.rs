//! `capget(2)`, `capset(2)` and `prctl(2)`.
//!
//! 64-bit values cross the JS boundary as two `u32` numbers (low, then high);
//! `src/js/bun/linux.ts` converts to and from `bigint`.

use bun_jsc::{CallFrame, JSGlobalObject, JSValue, JsResult};

#[cfg(target_os = "linux")]
const LINUX_CAPABILITY_VERSION_3: u32 = 0x2008_0522;

#[cfg(target_os = "linux")]
#[repr(C)]
struct CapHeader {
    version: u32,
    pid: i32,
}

#[cfg(target_os = "linux")]
#[repr(C)]
#[derive(Clone, Copy, Default)]
struct CapData {
    effective: u32,
    permitted: u32,
    inheritable: u32,
}

#[cfg(target_os = "linux")]
const PR_GET_PDEATHSIG: i64 = 2;
#[cfg(target_os = "linux")]
const PR_GET_CHILD_SUBREAPER: i64 = 37;

/// `capget(pid)` returns `[effLo, effHi, permLo, permHi, inhLo, inhHi]`.
#[bun_jsc::host_fn]
pub(crate) fn js_capget(global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
    #[cfg(target_os = "linux")]
    {
        let mut header = CapHeader {
            version: LINUX_CAPABILITY_VERSION_3,
            pid: super::int_arg(frame, 0) as i32,
        };
        let mut data = [CapData::default(); 2];
        // SAFETY: `header` and `data` are valid for the sizes the v3 ABI reads and writes
        // (a header and two `CapData` entries).
        let rc = unsafe {
            libc::syscall(
                super::nr::CAPGET,
                &mut header as *mut CapHeader,
                data.as_mut_ptr(),
            )
        };
        super::check(global, rc, "capget", None)?;
        let words = [
            data[0].effective,
            data[1].effective,
            data[0].permitted,
            data[1].permitted,
            data[0].inheritable,
            data[1].inheritable,
        ];
        JSValue::create_array_from_iter(global, words.iter(), |w| {
            Ok(JSValue::js_number_from_uint64(u64::from(*w)))
        })
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = frame;
        Err(super::unsupported(global))
    }
}

/// `capset(effLo, effHi, permLo, permHi, inhLo, inhHi)` on the calling thread.
#[bun_jsc::host_fn]
pub(crate) fn js_capset(global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
    #[cfg(target_os = "linux")]
    {
        let effective = super::u64_arg(frame, 0);
        let permitted = super::u64_arg(frame, 2);
        let inheritable = super::u64_arg(frame, 4);
        let header = CapHeader {
            version: LINUX_CAPABILITY_VERSION_3,
            pid: 0,
        };
        let data = [
            CapData {
                effective: effective as u32,
                permitted: permitted as u32,
                inheritable: inheritable as u32,
            },
            CapData {
                effective: (effective >> 32) as u32,
                permitted: (permitted >> 32) as u32,
                inheritable: (inheritable >> 32) as u32,
            },
        ];
        // SAFETY: `header` and `data` are valid for the sizes the v3 ABI reads.
        let rc = unsafe {
            libc::syscall(
                super::nr::CAPSET,
                &header as *const CapHeader,
                data.as_ptr(),
            )
        };
        super::check(global, rc, "capset", None)?;
        Ok(JSValue::UNDEFINED)
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = frame;
        Err(super::unsupported(global))
    }
}

/// `prctl(option, a2Lo, a2Hi, a3Lo, a3Hi, a4Lo, a4Hi, a5Lo, a5Hi)` returns the call's result.
///
/// `PR_GET_PDEATHSIG` and `PR_GET_CHILD_SUBREAPER` write through a pointer in
/// `arg2`; those two return the written value instead.
#[bun_jsc::host_fn]
pub(crate) fn js_prctl(global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
    #[cfg(target_os = "linux")]
    {
        let option = super::int_arg(frame, 0);
        let mut a2 = super::u64_arg(frame, 1) as libc::c_ulong;
        let a3 = super::u64_arg(frame, 3) as libc::c_ulong;
        let a4 = super::u64_arg(frame, 5) as libc::c_ulong;
        let a5 = super::u64_arg(frame, 7) as libc::c_ulong;

        let mut out: libc::c_int = 0;
        let writes_out = option == PR_GET_PDEATHSIG || option == PR_GET_CHILD_SUBREAPER;
        if writes_out {
            a2 = core::ptr::addr_of_mut!(out) as libc::c_ulong;
        }
        // SAFETY: for the two pointer-writing options `a2` points at `out`, which outlives the
        // call; every other option takes plain integers.
        let rc = unsafe {
            libc::syscall(
                super::nr::PRCTL,
                option as libc::c_long,
                a2,
                a3,
                a4,
                a5,
            )
        };
        let rc = super::check(global, rc, "prctl", None)?;
        let value = if writes_out { i64::from(out) } else { rc as i64 };
        Ok(JSValue::js_number_from_int64(value))
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = frame;
        Err(super::unsupported(global))
    }
}
