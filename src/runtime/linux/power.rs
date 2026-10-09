//! `reboot(2)` and `kexec_file_load(2)`.

use bun_jsc::{CallFrame, JSGlobalObject, JSValue, JsResult};

#[cfg(target_os = "linux")]
const LINUX_REBOOT_MAGIC1: libc::c_long = 0xfee1_dead_u32 as libc::c_long;
#[cfg(target_os = "linux")]
const LINUX_REBOOT_MAGIC2: libc::c_long = 672_274_793;
#[cfg(target_os = "linux")]
const KEXEC_FILE_NO_INITRAMFS: libc::c_long = 4;

/// `reboot(cmd)` with the `LINUX_REBOOT_CMD_*` value as an unsigned 32-bit number.
#[bun_jsc::host_fn]
pub(crate) fn js_reboot(global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
    #[cfg(target_os = "linux")]
    {
        let cmd = super::int_arg(frame, 0) as u32;
        // SAFETY: `reboot` takes integers; the command set is validated by the JS layer.
        let rc = unsafe {
            libc::syscall(
                super::nr::REBOOT,
                LINUX_REBOOT_MAGIC1,
                LINUX_REBOOT_MAGIC2,
                cmd as libc::c_long,
                core::ptr::null::<libc::c_void>(),
            )
        };
        super::check(global, rc, "reboot", None)?;
        Ok(JSValue::UNDEFINED)
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = frame;
        Err(super::unsupported(global))
    }
}

/// `kexecFileLoad(kernelFd, initrdFd, cmdline, flags)`; `initrdFd` is `-1` for none.
#[bun_jsc::host_fn]
pub(crate) fn js_kexec_file_load(global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
    #[cfg(target_os = "linux")]
    {
        let kernel_fd = super::int_arg(frame, 0) as libc::c_long;
        let initrd_fd = super::int_arg(frame, 1) as libc::c_long;
        let cmdline = super::cstr_arg(global, frame, 2)?;
        let mut flags = super::int_arg(frame, 3) as libc::c_long;
        if initrd_fd < 0 {
            flags |= KEXEC_FILE_NO_INITRAMFS;
        }
        // The kernel wants the length including the terminating NUL.
        let cmdline_len = cmdline.as_bytes_with_nul().len() as libc::c_ulong;
        // SAFETY: `cmdline` is NUL-terminated, `cmdline_len` counts the NUL, and it outlives the call.
        let rc = unsafe {
            libc::syscall(
                super::nr::KEXEC_FILE_LOAD,
                kernel_fd,
                initrd_fd,
                cmdline_len,
                cmdline.as_ptr(),
                flags,
            )
        };
        super::check(global, rc, "kexec_file_load", None)?;
        Ok(JSValue::UNDEFINED)
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = frame;
        Err(super::unsupported(global))
    }
}
