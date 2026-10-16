//! DLLs: the modules loaded in a process (Toolhelp), the directories added to the search
//! order, resolution and the diagnosis of a DLL that fails to load. The search and the PE
//! reader are `bun_sys::windows::dll`, shared with `process.dlopen` and `bun:ffi`.

use bun_sys::windows::dll::{self, Found, ProblemKind};

use super::{BOOL, HANDLE, Json, OwnedHandle, WinErr, WinResult};

const TH32CS_SNAPMODULE: u32 = 0x8;
const TH32CS_SNAPMODULE32: u32 = 0x10;
const INVALID_HANDLE_VALUE: HANDLE = -1isize as HANDLE;
const ERROR_BAD_LENGTH: u32 = 24;

#[repr(C)]
struct ModuleEntry32W {
    size: u32,
    module_id: u32,
    pid: u32,
    global_usage: u32,
    process_usage: u32,
    base: *mut u8,
    base_size: u32,
    module: HANDLE,
    name: [u16; 256],
    path: [u16; 260],
}

#[link(name = "kernel32")]
unsafe extern "system" {
    fn Module32FirstW(snapshot: HANDLE, entry: *mut ModuleEntry32W) -> BOOL;
    fn Module32NextW(snapshot: HANDLE, entry: *mut ModuleEntry32W) -> BOOL;
}

fn text(bytes: &[u8]) -> String {
    String::from_utf8_lossy(bytes).into_owned()
}

/// `[{ name, path, base, size }]` for every module loaded in `pid` (0: this process).
pub(crate) fn loaded_json(pid: u32) -> WinResult<String> {
    let mut snapshot = INVALID_HANDLE_VALUE;
    // The snapshot fails with ERROR_BAD_LENGTH while the target is loading or unloading a
    // module; the documented answer is to try again.
    for _ in 0..8 {
        // SAFETY: no preconditions.
        snapshot = unsafe {
            super::process::CreateToolhelp32Snapshot(TH32CS_SNAPMODULE | TH32CS_SNAPMODULE32, pid)
        };
        if snapshot != INVALID_HANDLE_VALUE {
            break;
        }
        let err = WinErr::last("CreateToolhelp32Snapshot");
        if err.code != ERROR_BAD_LENGTH {
            return Err(err);
        }
    }
    if snapshot == INVALID_HANDLE_VALUE {
        return Err(WinErr::last("CreateToolhelp32Snapshot"));
    }
    let snapshot = OwnedHandle(snapshot);
    let mut entry = ModuleEntry32W {
        size: core::mem::size_of::<ModuleEntry32W>() as u32,
        module_id: 0,
        pid: 0,
        global_usage: 0,
        process_usage: 0,
        base: core::ptr::null_mut(),
        base_size: 0,
        module: core::ptr::null_mut(),
        name: [0; 256],
        path: [0; 260],
    };
    let mut j = Json::new();
    j.begin_array();
    // SAFETY: `entry.size` is set; the snapshot is open.
    let mut ok = unsafe { Module32FirstW(snapshot.0, &raw mut entry) };
    while ok != 0 {
        j.begin_object()
            .field_str("name", &super::from_wide(&entry.name))
            .field_str("path", &super::from_wide(&entry.path))
            .field_num("base", entry.base as usize as f64)
            .field_num("size", f64::from(entry.base_size))
            .end_object();
        // SAFETY: as above.
        ok = unsafe { Module32NextW(snapshot.0, &raw mut entry) };
    }
    j.end_array();
    Ok(j.finish())
}

/// `AddDllDirectory(path)` → the id that [`remove_directory`] takes.
pub(crate) fn add_directory(path: &str) -> WinResult<u32> {
    dll::add_directory(path.as_bytes()).map_err(|code| WinErr {
        code,
        call: "AddDllDirectory",
    })
}

pub(crate) fn remove_directory(id: u32) -> bool {
    dll::remove_directory(id)
}

/// `[{ id, path }]`, oldest first.
pub(crate) fn directories_json() -> String {
    let mut j = Json::new();
    j.begin_array();
    for (id, path) in dll::directories() {
        j.begin_object()
            .field_num("id", f64::from(id))
            .field_str("path", &text(&path))
            .end_object();
    }
    j.end_array();
    j.finish()
}

/// The file the loader would map for the dependency `name` of a module in `from`; an API
/// set name comes back unchanged.
pub(crate) fn resolve(name: &str, from: Option<&str>) -> Option<String> {
    match dll::Search::new().resolve(name.as_bytes(), from.map(str::as_bytes))? {
        Found::ApiSet => Some(name.to_owned()),
        Found::Path(path) => Some(text(&path)),
    }
}

/// `{ machine, problems: [{ kind, module, path?, symbol?, machine?, requiredBy? }] }`, or
/// `None` when `path` is not a PE image.
pub(crate) fn diagnose_json(path: &str) -> Option<String> {
    let diagnosis = dll::diagnose(path.as_bytes())?;
    let mut j = Json::new();
    j.begin_object()
        .field_str("machine", dll::machine_name(diagnosis.machine));
    j.key("problems").begin_array();
    for p in &diagnosis.problems {
        j.begin_object()
            .field_str("kind", p.kind.as_str())
            .field_str("module", &text(&p.module));
        if !p.path.is_empty() {
            j.field_str("path", &text(&p.path));
        }
        match p.kind {
            ProblemKind::Export => {
                j.field_str("symbol", &text(&p.detail));
            }
            ProblemKind::Machine => {
                j.field_str("machine", &text(&p.detail));
            }
            ProblemKind::Missing => {}
        }
        if !p.required_by.is_empty() {
            j.field_str("requiredBy", &text(&p.required_by));
        }
        j.end_object();
    }
    j.end_array();
    j.end_object();
    Some(j.finish())
}
