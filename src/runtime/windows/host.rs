//! Host functions of `bun:windows`. Arguments are validated by `windows.ts`; structured
//! results cross as JSON text that `windows.ts` parses.

use bun_jsc::{CallFrame, JSGlobalObject, JSValue, JsResult};

#[cfg(windows)]
use super::sys::{self, WinResult};

macro_rules! win_host_fn {
    ($(#[doc = $doc:literal])* $name:ident($global:ident, $frame:ident) $body:block) => {
        $(#[doc = $doc])*
        #[bun_jsc::host_fn]
        pub(crate) fn $name($global: &JSGlobalObject, $frame: &CallFrame) -> JsResult<JSValue> {
            #[cfg(windows)]
            {
                let _ = (&$global, &$frame);
                $body
            }
            #[cfg(not(windows))]
            {
                let _ = $frame;
                Err(super::unsupported($global))
            }
        }
    };
}

#[cfg(windows)]
fn check<T>(global: &JSGlobalObject, result: WinResult<T>) -> JsResult<T> {
    result.map_err(|err| super::win_error(global, err))
}

#[cfg(windows)]
fn str_arg(global: &JSGlobalObject, frame: &CallFrame, i: usize) -> JsResult<String> {
    let utf8 = frame.argument(i).to_utf8(global)?;
    Ok(String::from_utf8_lossy(&utf8).into_owned())
}

#[cfg(windows)]
fn opt_str_arg(global: &JSGlobalObject, frame: &CallFrame, i: usize) -> JsResult<Option<String>> {
    if frame.argument(i).is_undefined_or_null() {
        return Ok(None);
    }
    str_arg(global, frame, i).map(Some)
}

#[cfg(windows)]
fn u32_arg(frame: &CallFrame, i: usize) -> u32 {
    frame.argument(i).to_int64() as u32
}

/// A non-negative number argument; negative means "not set".
#[cfg(windows)]
fn opt_u64_arg(frame: &CallFrame, i: usize) -> Option<u64> {
    let n = frame.argument(i).to_int64();
    (n >= 0).then_some(n as u64)
}

#[cfg(windows)]
fn string(global: &JSGlobalObject, s: &str) -> JsResult<JSValue> {
    bun_jsc::bun_string_jsc::create_utf8_for_js(global, s.as_bytes())
}

#[cfg(windows)]
fn opt_string(global: &JSGlobalObject, s: Option<String>) -> JsResult<JSValue> {
    match s {
        Some(s) => string(global, &s),
        None => Ok(JSValue::NULL),
    }
}

#[cfg(windows)]
fn reg_root(global: &JSGlobalObject, frame: &CallFrame) -> JsResult<sys::registry::HKEY> {
    match sys::registry::root(u32_arg(frame, 0)) {
        Some(root) => Ok(root),
        None => Err(global.throw_invalid_arguments(format_args!("unknown registry root"))),
    }
}

#[cfg(windows)]
fn hex_decode(s: &str) -> Option<Vec<u8>> {
    let bytes = s.as_bytes();
    if bytes.len() % 2 != 0 {
        return None;
    }
    let digit = |c: u8| (c as char).to_digit(16).map(|d| d as u8);
    bytes
        .chunks_exact(2)
        .map(|pair| Some(digit(pair[0])? << 4 | digit(pair[1])?))
        .collect()
}

win_host_fn! {
    /// `regGet(root, subKey, name, view)` → JSON `{ type, value }` or `null`.
    js_reg_get(global, frame) {
        let root = reg_root(global, frame)?;
        let value = check(global, sys::registry::get(root, &str_arg(global, frame, 1)?, &str_arg(global, frame, 2)?, u32_arg(frame, 3)))?;
        opt_string(global, value)
    }
}

win_host_fn! {
    /// `regSet(root, subKey, name, type, data, view)`. `data` is text for the string types
    /// (`\0`-separated for `REG_MULTI_SZ`), decimal for `REG_DWORD`/`REG_QWORD` and hex for
    /// `REG_BINARY`.
    js_reg_set(global, frame) {
        use sys::registry::*;
        let root = reg_root(global, frame)?;
        let ty = u32_arg(frame, 3);
        let text = str_arg(global, frame, 4)?;
        let data = match ty {
            REG_SZ | REG_EXPAND_SZ => encode_string(&text, false),
            REG_MULTI_SZ => encode_string(&text, true),
            REG_DWORD => match text.parse::<u32>() {
                Ok(n) => n.to_le_bytes().to_vec(),
                Err(_) => return Err(global.throw_invalid_arguments(format_args!("REG_DWORD value must be a uint32"))),
            },
            REG_QWORD => match text.parse::<u64>() {
                Ok(n) => n.to_le_bytes().to_vec(),
                Err(_) => return Err(global.throw_invalid_arguments(format_args!("REG_QWORD value must be a uint64"))),
            },
            REG_BINARY | REG_NONE => match hex_decode(&text) {
                Some(bytes) => bytes,
                None => return Err(global.throw_invalid_arguments(format_args!("binary value must be hex"))),
            },
            _ => return Err(global.throw_invalid_arguments(format_args!("unsupported registry value type {ty}"))),
        };
        check(global, set(root, &str_arg(global, frame, 1)?, &str_arg(global, frame, 2)?, ty, &data, u32_arg(frame, 5)))?;
        Ok(JSValue::UNDEFINED)
    }
}

win_host_fn! {
    /// `regCreateKey(root, subKey, view)`.
    js_reg_create_key(global, frame) {
        let root = reg_root(global, frame)?;
        check(global, sys::registry::create_key(root, &str_arg(global, frame, 1)?, u32_arg(frame, 2)))?;
        Ok(JSValue::UNDEFINED)
    }
}

win_host_fn! {
    /// `regDeleteValue(root, subKey, name, view)` → whether it existed.
    js_reg_delete_value(global, frame) {
        let root = reg_root(global, frame)?;
        let existed = check(global, sys::registry::delete_value(root, &str_arg(global, frame, 1)?, &str_arg(global, frame, 2)?, u32_arg(frame, 3)))?;
        Ok(JSValue::js_boolean(existed))
    }
}

win_host_fn! {
    /// `regDeleteKey(root, subKey, view, recursive)` → whether it existed.
    js_reg_delete_key(global, frame) {
        let root = reg_root(global, frame)?;
        let existed = check(
            global,
            sys::registry::delete_key(root, &str_arg(global, frame, 1)?, u32_arg(frame, 2), frame.argument(3).to_boolean()),
        )?;
        Ok(JSValue::js_boolean(existed))
    }
}

win_host_fn! {
    /// `regList(root, subKey, view)` → JSON `{ keys, values }` or `null`.
    js_reg_list(global, frame) {
        let root = reg_root(global, frame)?;
        let listing = check(global, sys::registry::list(root, &str_arg(global, frame, 1)?, u32_arg(frame, 2)))?;
        opt_string(global, listing)
    }
}

win_host_fn! {
    /// `serviceList(drivers)` → JSON array.
    js_service_list(global, frame) {
        let kind = if frame.argument(0).to_boolean() { sys::services::SERVICE_DRIVER } else { sys::services::SERVICE_WIN32 };
        let json = check(global, sys::services::list(kind))?;
        string(global, &json)
    }
}

win_host_fn! {
    /// `serviceQuery(name)` → JSON object or `null`.
    js_service_query(global, frame) {
        let json = check(global, sys::services::query(&str_arg(global, frame, 0)?))?;
        opt_string(global, json)
    }
}

win_host_fn! {
    /// `serviceStart(name)`; already running is not an error.
    js_service_start(global, frame) {
        check(global, sys::services::start(&str_arg(global, frame, 0)?))?;
        Ok(JSValue::UNDEFINED)
    }
}

win_host_fn! {
    /// `serviceStop(name)`; already stopped is not an error.
    js_service_stop(global, frame) {
        check(global, sys::services::stop(&str_arg(global, frame, 0)?))?;
        Ok(JSValue::UNDEFINED)
    }
}

win_host_fn! {
    /// `eventLogQuery(channel, xpath, max, newestFirst)` → JSON array of event XML strings.
    js_event_log_query(global, frame) {
        let json = check(
            global,
            sys::eventlog::query(&str_arg(global, frame, 0)?, &str_arg(global, frame, 1)?, u32_arg(frame, 2), frame.argument(3).to_boolean()),
        )?;
        string(global, &json)
    }
}

win_host_fn! {
    /// `eventLogWrite(source, type, eventId, message)`.
    js_event_log_write(global, frame) {
        check(
            global,
            sys::eventlog::write(&str_arg(global, frame, 0)?, u32_arg(frame, 1) as u16, u32_arg(frame, 2), &str_arg(global, frame, 3)?),
        )?;
        Ok(JSValue::UNDEFINED)
    }
}

win_host_fn! {
    /// `clipboardRead()` → text or `null`.
    js_clipboard_read(global, frame) {
        let text = check(global, sys::clipboard::read_text())?;
        opt_string(global, text)
    }
}

win_host_fn! {
    /// `clipboardWrite(text)`.
    js_clipboard_write(global, frame) {
        check(global, sys::clipboard::write_text(&str_arg(global, frame, 0)?))?;
        Ok(JSValue::UNDEFINED)
    }
}

win_host_fn! {
    /// `clipboardClear()`.
    js_clipboard_clear(global, frame) {
        check(global, sys::clipboard::clear())?;
        Ok(JSValue::UNDEFINED)
    }
}

win_host_fn! {
    /// `knownFolder(guid)` → path.
    js_known_folder(global, frame) {
        let path = check(global, sys::folders::known_folder(&str_arg(global, frame, 0)?))?;
        string(global, &path)
    }
}

win_host_fn! {
    /// `version()` → JSON object.
    js_version(global, frame) {
        string(global, &sys::system::version_json())
    }
}

win_host_fn! {
    /// `conptyInfo()` → JSON object.
    js_conpty_info(global, frame) {
        string(global, &sys::conpty::info_json())
    }
}

win_host_fn! {
    /// `gpuD3d12Info()` → JSON object.
    js_gpu_d3d12_info(global, frame) {
        let json = check(global, sys::gpu::info_json())?;
        string(global, &json)
    }
}

win_host_fn! {
    /// `gpuD3d12ClearRenderTarget(width, height, r, g, b, a)` → hex of the RGBA8 pixels.
    js_gpu_d3d12_clear_render_target(global, frame) {
        let width = u32_arg(frame, 0);
        let height = u32_arg(frame, 1);
        let rgba = [2, 3, 4, 5].map(|i| frame.argument(i).as_number() as f32);
        let pixels = check(global, sys::gpu::clear_render_target(width, height, rgba))?;
        string(global, &sys::registry::hex(&pixels))
    }
}

win_host_fn! {
    /// `gpuD3d12CopyBuffer(hex)` → hex of the bytes read back from the GPU.
    js_gpu_d3d12_copy_buffer(global, frame) {
        let input = str_arg(global, frame, 0)?;
        let Some(data) = hex_decode(&input) else {
            return Err(global.throw_invalid_arguments(format_args!("data must be hex-encoded")));
        };
        let pixels = check(global, sys::gpu::copy_buffer(&data))?;
        string(global, &sys::registry::hex(&pixels))
    }
}

win_host_fn! {
    /// `systemInfo()` → JSON object.
    js_system_info(global, frame) {
        let json = check(global, sys::system::info_json())?;
        string(global, &json)
    }
}

win_host_fn! {
    /// `isElevated()`.
    js_is_elevated(global, frame) {
        Ok(JSValue::js_boolean(crate::elevate::is_elevated()))
    }
}

win_host_fn! {
    /// `processList()` → JSON array.
    js_process_list(global, frame) {
        let json = check(global, sys::process::list_json())?;
        string(global, &json)
    }
}

win_host_fn! {
    /// `processPath(pid)` → executable path.
    js_process_path(global, frame) {
        let path = check(global, sys::process::image_path(u32_arg(frame, 0)))?;
        string(global, &path)
    }
}

win_host_fn! {
    /// `processTerminate(pid, exitCode)`.
    js_process_terminate(global, frame) {
        check(global, sys::process::terminate(u32_arg(frame, 0), u32_arg(frame, 1)))?;
        Ok(JSValue::UNDEFINED)
    }
}

win_host_fn! {
    /// `processSetAffinity(pid, mask)`.
    js_process_set_affinity(global, frame) {
        let mask = str_arg(global, frame, 1)?
            .parse::<usize>()
            .map_err(|_| global.throw_invalid_arguments(format_args!("affinity mask is out of range")))?;
        check(global, sys::process::set_affinity(u32_arg(frame, 0), mask))?;
        Ok(JSValue::UNDEFINED)
    }
}

win_host_fn! {
    /// `processSetPriority(pid, priorityClass)`.
    js_process_set_priority(global, frame) {
        check(global, sys::process::set_priority(u32_arg(frame, 0), u32_arg(frame, 1)))?;
        Ok(JSValue::UNDEFINED)
    }
}

win_host_fn! {
    /// `processSetEcoMode(pid, enabled)`.
    js_process_set_eco_mode(global, frame) {
        check(global, sys::process::set_eco_mode(u32_arg(frame, 0), frame.argument(1).to_boolean()))?;
        Ok(JSValue::UNDEFINED)
    }
}

win_host_fn! {
    /// `processTrimWorkingSet(pid)`.
    js_process_trim_working_set(global, frame) {
        check(global, sys::process::trim_working_set(u32_arg(frame, 0)))?;
        Ok(JSValue::UNDEFINED)
    }
}

win_host_fn! {
    /// `jobCreate(name?)` → job id.
    js_job_create(global, frame) {
        let name = opt_str_arg(global, frame, 0)?;
        let id = check(global, sys::jobs::create(name.as_deref()))?;
        Ok(JSValue::js_number(id as f64))
    }
}

win_host_fn! {
    /// `jobSetLimits(id, killOnClose, processMemory, jobMemory, activeProcesses, cpuRate)`;
    /// a negative number leaves that limit unset.
    js_job_set_limits(global, frame) {
        let cpu = frame.argument(5).as_number();
        let limits = sys::jobs::Limits {
            kill_on_close: frame.argument(1).to_boolean(),
            process_memory: opt_u64_arg(frame, 2),
            job_memory: opt_u64_arg(frame, 3),
            active_processes: opt_u64_arg(frame, 4).map(|n| n as u32),
            cpu_rate: (cpu > 0.0).then_some(cpu),
        };
        check(global, sys::jobs::set_limits(u32_arg(frame, 0), &limits))?;
        Ok(JSValue::UNDEFINED)
    }
}

win_host_fn! {
    /// `jobAssign(id, pid)`.
    js_job_assign(global, frame) {
        check(global, sys::jobs::assign(u32_arg(frame, 0), u32_arg(frame, 1)))?;
        Ok(JSValue::UNDEFINED)
    }
}

win_host_fn! {
    /// `jobTerminate(id, exitCode)`.
    js_job_terminate(global, frame) {
        check(global, sys::jobs::terminate(u32_arg(frame, 0), u32_arg(frame, 1)))?;
        Ok(JSValue::UNDEFINED)
    }
}

win_host_fn! {
    /// `jobInfo(id)` → JSON object.
    js_job_info(global, frame) {
        let json = check(global, sys::jobs::info_json(u32_arg(frame, 0)))?;
        string(global, &json)
    }
}

win_host_fn! {
    /// `jobClose(id)` → whether the id was open.
    js_job_close(global, frame) {
        Ok(JSValue::js_boolean(sys::jobs::close(u32_arg(frame, 0))))
    }
}

win_host_fn! {
    /// `toast(appId, xml)`.
    js_toast(global, frame) {
        check(global, sys::toast::show(&str_arg(global, frame, 0)?, &str_arg(global, frame, 1)?))?;
        Ok(JSValue::UNDEFINED)
    }
}

win_host_fn! {
    /// `wslDistributions()` → JSON array.
    js_wsl_distributions(global, frame) {
        string(global, &sys::wsl::distributions_json())
    }
}

win_host_fn! {
    /// `storageDrives()` → JSON array of logical drive capacity records.
    js_storage_drives(global, frame) {
        string(global, &check(global, sys::storage::drives_json())?)
    }
}

win_host_fn! {
    /// `toolchain(arch, toolset, sdk, instance)` → `bun msvc info` for those selections (empty
    /// strings pick the defaults). Resolution never throws: what is missing is `null` and the
    /// reason is in `error`.
    js_toolchain(global, frame) {
        let arch = str_arg(global, frame, 0)?;
        if !arch.is_empty() && sys::toolchain::normalize_arch(&arch).is_none() {
            return Err(global.throw_invalid_arguments(format_args!("unknown architecture: {arch}")));
        }
        let toolset = str_arg(global, frame, 1)?;
        let sdk = str_arg(global, frame, 2)?;
        let instance = str_arg(global, frame, 3)?;
        string(global, &sys::toolchain::to_json(&arch, &toolset, &sdk, &instance))
    }
}

win_host_fn! {
    /// `memoryStatus()` → physical, page-file and virtual memory counters.
    js_memory_status(global, frame) {
        string(global, &check(global, sys::system::memory_json())?)
    }
}

#[cfg(windows)]
fn i64_str_arg(global: &JSGlobalObject, frame: &CallFrame, i: usize, name: &str) -> JsResult<i64> {
    let text = str_arg(global, frame, i)?;
    text.parse::<i64>()
        .map_err(|_| global.throw_invalid_arguments(format_args!("{name} must be a decimal integer string")))
}

#[cfg(windows)]
fn u64_str_arg(global: &JSGlobalObject, frame: &CallFrame, i: usize, name: &str) -> JsResult<u64> {
    let text = str_arg(global, frame, i)?;
    text.parse::<u64>()
        .map_err(|_| global.throw_invalid_arguments(format_args!("{name} must be a decimal integer string")))
}

win_host_fn! {
    /// `ntfsVolumeOpen(drive)` → volume id. Requires an administrator token.
    js_ntfs_volume_open(global, frame) {
        let id = check(global, sys::ntfs::open(&str_arg(global, frame, 0)?))?;
        Ok(JSValue::js_number(id as f64))
    }
}

win_host_fn! {
    /// `ntfsVolumeClose(id)` → whether the id was open.
    js_ntfs_volume_close(global, frame) {
        Ok(JSValue::js_boolean(sys::ntfs::close(u32_arg(frame, 0))))
    }
}

win_host_fn! {
    /// `ntfsJournalQuery(id)` → JSON `USN_JOURNAL_DATA_V0` (64-bit fields as decimal strings).
    js_ntfs_journal_query(global, frame) {
        string(global, &check(global, sys::ntfs::journal_query(u32_arg(frame, 0)))?)
    }
}

win_host_fn! {
    /// `ntfsJournalCreate(id, maximumSize, allocationDelta)`.
    js_ntfs_journal_create(global, frame) {
        check(global, sys::ntfs::journal_create(u32_arg(frame, 0), u64_str_arg(global, frame, 1, "maximumSize")?, u64_str_arg(global, frame, 2, "allocationDelta")?))?;
        Ok(JSValue::UNDEFINED)
    }
}

win_host_fn! {
    /// `ntfsMftEnumerate(id, bufferBytes)` → JSON array of `[record, parentRecord, attributes,
    /// name]` tuples for every MFT record (V2 references), from the start of the volume.
    js_ntfs_mft_enumerate(global, frame) {
        let bytes = u32_arg(frame, 1) as usize;
        string(global, &check(global, sys::ntfs::mft_enumerate(u32_arg(frame, 0), bytes))?)
    }
}

win_host_fn! {
    /// `ntfsJournalRead(id, startUsn, journalId, bufferBytes)` → JSON `{ records, next }`.
    js_ntfs_journal_read(global, frame) {
        let start_usn = i64_str_arg(global, frame, 1, "startUsn")?;
        let journal_id = u64_str_arg(global, frame, 2, "journalId")?;
        let bytes = u32_arg(frame, 3) as usize;
        string(global, &check(global, sys::ntfs::journal_read(u32_arg(frame, 0), start_usn, journal_id, bytes))?)
    }
}

win_host_fn! {
    /// `wintrustCatalogFile(path)` → the system catalog's full path listing `path`, or `null`
    /// when no catalog lists it (never thrown: a missing catalog is not an error).
    js_wintrust_catalog_file(global, frame) {
        match check(global, sys::wintrust::catalog_file(&str_arg(global, frame, 0)?))? {
            Some(path) => string(global, &path),
            None => Ok(JSValue::NULL),
        }
    }
}

win_host_fn! {
    /// `wintrustReleaseCatalogContexts()`: releases the cached SHA-256/SHA-1 admin contexts.
    /// Mainly useful for tests; a process exit without calling this leaks no resource the OS
    /// does not already reclaim.
    js_wintrust_release_catalog_contexts(global, frame) {
        sys::wintrust::release_contexts();
        Ok(JSValue::UNDEFINED)
    }
}
