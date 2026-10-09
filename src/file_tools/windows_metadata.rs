// SPDX-License-Identifier: Apache-2.0

use std::{ffi::c_void, os::windows::ffi::OsStrExt, path::Path};

use bun_sys::File;
use bun_windows_sys::externs as w;

use crate::{Result, WorkspaceError};

const OWNER_GROUP_DACL: u32 = 7;
const WRITE_DAC: u32 = 0x0004_0000;
const WRITE_OWNER: u32 = 0x0008_0000;
const MAX_SECURITY_BYTES: usize = 65536;

#[link(name = "ntdll")]
unsafe extern "system" {
    fn NtQuerySecurityObject(
        handle: w::HANDLE,
        information: u32,
        descriptor: *mut c_void,
        length: u32,
        needed: *mut u32,
    ) -> w::NTSTATUS;
    fn NtSetSecurityObject(
        handle: w::HANDLE,
        information: u32,
        descriptor: *mut c_void,
    ) -> w::NTSTATUS;
}

pub(super) fn preserve(parent: &File, name: &Path, original: &File) -> Result<()> {
    let mut needed = 0;
    // SAFETY: original is a live READ_CONTROL handle; a null zero-sized output requests only the required size.
    let status = unsafe {
        NtQuerySecurityObject(
            original.fd().native(),
            OWNER_GROUP_DACL,
            core::ptr::null_mut(),
            0,
            &mut needed,
        )
    };
    if status.0 != 0xC000_0023 || needed == 0 || needed as usize > MAX_SECURITY_BYTES {
        return Err(WorkspaceError::Native(format!(
            "query security size failed: {status:?}"
        )));
    }
    let mut descriptor = vec![0_u32; (needed as usize).div_ceil(4)];
    let length = needed;
    // SAFETY: the u32 storage is aligned for SECURITY_DESCRIPTOR_RELATIVE and contains at least length writable bytes.
    let status = unsafe {
        NtQuerySecurityObject(
            original.fd().native(),
            OWNER_GROUP_DACL,
            descriptor.as_mut_ptr().cast(),
            length,
            &mut needed,
        )
    };
    if status != w::NTSTATUS::SUCCESS || needed > length {
        return Err(WorkspaceError::Native(format!(
            "query security failed: {status:?}"
        )));
    }
    let wide: Vec<u16> = name.as_os_str().encode_wide().collect();
    let replacement = File::from_fd(bun_sys::open_file_at_windows(
        parent.fd(),
        &wide,
        bun_sys::NtCreateFileOptions {
            access_mask: w::READ_CONTROL | WRITE_DAC | WRITE_OWNER | w::SYNCHRONIZE,
            disposition: w::FILE_OPEN,
            options: w::FILE_OPEN_REPARSE_POINT | w::FILE_SYNCHRONOUS_IO_NONALERT,
            ..Default::default()
        },
    )?);
    // SAFETY: the descriptor was fully populated by NT; the replacement handle requests only metadata access.
    let status = unsafe {
        NtSetSecurityObject(
            replacement.fd().native(),
            OWNER_GROUP_DACL,
            descriptor.as_mut_ptr().cast(),
        )
    };
    if status != w::NTSTATUS::SUCCESS {
        return Err(WorkspaceError::Native(format!(
            "preserve security failed: {status:?}"
        )));
    }
    Ok(())
}

pub(super) fn flush(file: &File) -> Result<()> {
    // SAFETY: the owned writable file handle remains live through the synchronous flush.
    if unsafe { w::kernel32::FlushFileBuffers(file.fd().native()) } == 0 {
        return Err(bun_sys::Error::from_win32(w::Win32Error::get(), bun_sys::Tag::fsync).into());
    }
    Ok(())
}
