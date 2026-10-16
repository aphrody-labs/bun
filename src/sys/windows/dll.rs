//! DLL loading shared by `bun:ffi`, `process.dlopen` and `bun:windows`: one search order,
//! the directories added at run time, and the reason a load failed (a missing dependency, a
//! missing export, another architecture), read from the PE import and export tables without
//! mapping the image.

use core::ffi::c_void;
use std::io::Write as _;

use bstr::BStr;
use bun_core::strings;
use bun_windows_sys::externs as w;
use bun_windows_sys::kernel32;

use crate::{Fd, File, O};

pub const ERROR_MOD_NOT_FOUND: u32 = 126;
pub const ERROR_PROC_NOT_FOUND: u32 = 127;
pub const ERROR_BAD_EXE_FORMAT: u32 = 193;
pub const ERROR_EXE_MACHINE_TYPE_MISMATCH: u32 = 216;

const LOAD_WITH_ALTERED_SEARCH_PATH: u32 = 0x0000_0008;
const LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR: u32 = 0x0000_0100;
const LOAD_LIBRARY_SEARCH_SYSTEM32: u32 = 0x0000_0800;
const LOAD_LIBRARY_SEARCH_DEFAULT_DIRS: u32 = 0x0000_1000;

const MAX_MODULES: usize = 64;
const MAX_PROBLEMS: usize = 32;

#[link(name = "kernel32")]
unsafe extern "system" {
    fn AddDllDirectory(path: *const u16) -> *mut c_void;
    fn RemoveDllDirectory(cookie: *mut c_void) -> i32;
    fn GetWindowsDirectoryW(buffer: *mut u16, size: u32) -> u32;
    fn FreeLibrary(module: *mut c_void) -> i32;
}

const BACKSLASH: u16 = b'\\' as u16;
const SLASH: u16 = b'/' as u16;
const COLON: u16 = b':' as u16;

/// No drive and no separator: a name the loader searches for.
fn is_bare_w(path: &[u16]) -> bool {
    for &c in path {
        if c == BACKSLASH || c == SLASH || c == COLON {
            return false;
        }
    }
    true
}

fn is_bare(path: &[u8]) -> bool {
    strings::index_of_any(path, b"\\/:").is_none()
}

/// Loads the DLL at `path` (UTF-16, without the NUL).
///
/// An absolute path resolves its dependencies from its own directory, Bun's directory, the
/// directories added with [`add_directory`] and System32. When one is not there, the load is
/// retried in the order of `LOAD_WITH_ALTERED_SEARCH_PATH`, which adds the Windows
/// directory, the working directory and `PATH`. A bare name searches Bun's directory, the
/// added directories and System32 first when directories were added, then the standard
/// order. Returns null with the thread's last error set on failure.
pub fn load(path: &[u16]) -> *mut c_void {
    let mut wide = Vec::with_capacity(path.len() + 1);
    wide.extend_from_slice(path);
    wide.push(0);
    let (first, fallback) = if bun_paths::is_absolute_windows_wtf16(path) {
        // The loader takes the directory of the DLL from its last backslash.
        for c in &mut wide {
            if *c == SLASH {
                *c = BACKSLASH;
            }
        }
        (
            Some(LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR | LOAD_LIBRARY_SEARCH_DEFAULT_DIRS),
            LOAD_WITH_ALTERED_SEARCH_PATH,
        )
    } else if is_bare_w(path) && has_directories() {
        (Some(LOAD_LIBRARY_SEARCH_DEFAULT_DIRS), 0)
    } else {
        (None, 0)
    };
    let attempt = |flags: u32| {
        // SAFETY: `wide` is NUL-terminated; `hFile` is reserved and must be null.
        unsafe { kernel32::LoadLibraryExW(wide.as_ptr(), core::ptr::null_mut(), flags) }
    };
    if let Some(flags) = first {
        let module = attempt(flags);
        if !module.is_null() {
            return module.cast();
        }
        let err = kernel32::GetLastError();
        if err != ERROR_MOD_NOT_FOUND && err != ERROR_PROC_NOT_FOUND {
            return module.cast();
        }
    }
    attempt(fallback).cast()
}

/// Loads a DLL of Windows, such as `"windowscodecs.dll"`, from System32 only, so a copy
/// planted beside Bun or in the working directory is never picked.
pub fn load_system(name: &str) -> *mut c_void {
    let wide: Vec<u16> = name.encode_utf16().chain([0]).collect();
    // SAFETY: `wide` is NUL-terminated; `hFile` is reserved and must be null.
    unsafe {
        kernel32::LoadLibraryExW(
            wide.as_ptr(),
            core::ptr::null_mut(),
            LOAD_LIBRARY_SEARCH_SYSTEM32,
        )
    }
    .cast()
}

/// Releases one reference to a module returned by [`load`]; the image is unmapped (and its
/// file can be deleted) when the last one goes.
pub fn free(module: *mut c_void) {
    // SAFETY: `module` came from `LoadLibraryExW` and its reference is released once.
    unsafe { FreeLibrary(module) };
}

// ── Directories added at run time ───────────────────────────────────────────

struct Directory {
    id: u32,
    cookie: usize,
    path: Vec<u8>,
}

struct Directories {
    next: u32,
    list: Vec<Directory>,
}

static DIRECTORIES: bun_core::Mutex<Directories> = bun_core::Mutex::new(Directories {
    next: 1,
    list: Vec::new(),
});

fn has_directories() -> bool {
    !DIRECTORIES.lock().list.is_empty()
}

/// `AddDllDirectory(path)`: later [`load`] calls search `path`. Returns the id that
/// [`remove_directory`] takes, or the Win32 error.
pub fn add_directory(path: &[u8]) -> Result<u32, u32> {
    let cookie = with_wide(path, |wide| {
        // SAFETY: `wide` is NUL-terminated.
        unsafe { AddDllDirectory(wide.as_ptr()) }
    });
    if cookie.is_null() {
        return Err(kernel32::GetLastError());
    }
    let mut dirs = DIRECTORIES.lock();
    let id = dirs.next;
    dirs.next += 1;
    dirs.list.push(Directory {
        id,
        cookie: cookie as usize,
        path: path.to_vec(),
    });
    Ok(id)
}

/// Removes a directory added by [`add_directory`]; `false` when `id` is not one.
pub fn remove_directory(id: u32) -> bool {
    let dir = {
        let mut dirs = DIRECTORIES.lock();
        let Some(i) = dirs.list.iter().position(|d| d.id == id) else {
            return false;
        };
        dirs.list.remove(i)
    };
    // SAFETY: the cookie came from `AddDllDirectory` and leaves the registry once.
    unsafe { RemoveDllDirectory(dir.cookie as *mut c_void) };
    true
}

/// The directories added by [`add_directory`], oldest first.
pub fn directories() -> Vec<(u32, Vec<u8>)> {
    DIRECTORIES
        .lock()
        .list
        .iter()
        .map(|d| (d.id, d.path.clone()))
        .collect()
}

// ── Paths ───────────────────────────────────────────────────────────────────

fn with_wide<R>(path: &[u8], f: impl FnOnce(&bun_core::WStr) -> R) -> R {
    let mut wbuf = bun_paths::w_path_buffer_pool::get();
    let wide = bun_paths::string_paths::to_w_path(&mut wbuf, path);
    f(wide)
}

fn file_exists(path: &[u8]) -> bool {
    let attrs = with_wide(path, |wide| {
        // SAFETY: `wide` is NUL-terminated.
        unsafe { w::GetFileAttributesW(wide.as_ptr()) }
    });
    attrs != u32::MAX && attrs & w::FILE_ATTRIBUTE_DIRECTORY == 0
}

fn parent(path: &[u8]) -> Option<&[u8]> {
    strings::last_index_of_any(path, b"\\/").map(|i| &path[..i])
}

fn basename(path: &[u8]) -> &[u8] {
    strings::last_index_of_any(path, b"\\/").map_or(path, |i| &path[i + 1..])
}

fn join(dir: &[u8], name: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(dir.len() + 1 + name.len());
    out.extend_from_slice(dir);
    if !matches!(dir.last(), Some(b'\\' | b'/')) {
        out.push(b'\\');
    }
    out.extend_from_slice(name);
    out
}

/// `path` lies inside `dir`, compared like the file system does (ASCII case-insensitive).
fn is_under(path: &[u8], dir: &[u8]) -> bool {
    !dir.is_empty()
        && path.len() > dir.len()
        && path[..dir.len()].eq_ignore_ascii_case(dir)
        && matches!(path[dir.len()], b'\\' | b'/')
}

/// Full path of a module loaded in this process; `module == null` is the executable.
fn module_path(module: *mut c_void) -> Option<Vec<u8>> {
    let mut buf = vec![0u16; 32768];
    // SAFETY: `buf` is valid for its length.
    let n = unsafe { w::GetModuleFileNameW(module.cast(), buf.as_mut_ptr(), buf.len() as u32) }
        as usize;
    (n != 0 && n < buf.len()).then(|| strings::to_utf8_alloc(&buf[..n]))
}

fn loaded_module(name: &[u8]) -> Option<Vec<u8>> {
    let module = with_wide(name, |wide| {
        // SAFETY: `wide` is NUL-terminated; the handle is not retained.
        unsafe { kernel32::GetModuleHandleW(wide.as_ptr()) }
    });
    if module.is_null() {
        return None;
    }
    module_path(module.cast())
}

fn wide_dir(get: unsafe extern "system" fn(*mut u16, u32) -> u32) -> Vec<u8> {
    let mut buf = [0u16; 1024];
    // SAFETY: `buf` is valid for its length.
    let n = unsafe { get(buf.as_mut_ptr(), buf.len() as u32) } as usize;
    if n == 0 || n >= buf.len() {
        return Vec::new();
    }
    strings::to_utf8_alloc(&buf[..n])
}

fn current_dir() -> Vec<u8> {
    let mut buf = vec![0u16; 32768];
    // SAFETY: `buf` is valid for its length.
    let n = unsafe { w::GetCurrentDirectoryW(buf.len() as u32, buf.as_mut_ptr()) } as usize;
    if n == 0 || n >= buf.len() {
        return Vec::new();
    }
    strings::to_utf8_alloc(&buf[..n])
}

/// The entries of `PATH`, read from the process environment the loader uses.
fn path_dirs() -> Vec<Vec<u8>> {
    let mut name: Vec<u16> = "PATH\0".encode_utf16().collect();
    let mut buf = vec![0u16; 32768];
    let Ok(n) =
        super::GetEnvironmentVariableW(name.as_mut_ptr(), buf.as_mut_ptr(), buf.len() as u32)
    else {
        return Vec::new();
    };
    let n = n as usize;
    if n >= buf.len() {
        return Vec::new();
    }
    let value = strings::to_utf8_alloc(&buf[..n]);
    let mut dirs = Vec::new();
    let mut rest = value.as_slice();
    loop {
        let (entry, next) = match strings::index_of_char_usize(rest, b';') {
            Some(i) => (&rest[..i], Some(&rest[i + 1..])),
            None => (rest, None),
        };
        let entry = entry.strip_prefix(b"\"").unwrap_or(entry);
        let entry = entry.strip_suffix(b"\"").unwrap_or(entry);
        if !entry.is_empty() {
            dirs.push(entry.to_vec());
        }
        match next {
            Some(next) => rest = next,
            None => break,
        }
    }
    dirs
}

// ── Search order ────────────────────────────────────────────────────────────

/// Where a dependency was found.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Found {
    /// An API set contract (`api-ms-…`, `ext-ms-…`), mapped by the loader to a system DLL.
    ApiSet,
    /// A module already loaded in this process or a file on disk.
    Path(Vec<u8>),
}

/// The directories the loader searches, read once per lookup.
pub struct Search {
    app: Vec<u8>,
    added: Vec<Vec<u8>>,
    system: Vec<u8>,
    windows: Vec<u8>,
    cwd: Vec<u8>,
    path: Vec<Vec<u8>>,
}

impl Search {
    pub fn new() -> Search {
        let app = module_path(core::ptr::null_mut())
            .and_then(|exe| parent(&exe).map(<[u8]>::to_vec))
            .unwrap_or_default();
        Search {
            app,
            added: directories().into_iter().map(|(_, path)| path).collect(),
            system: wide_dir(w::GetSystemDirectoryW),
            windows: wide_dir(GetWindowsDirectoryW),
            cwd: current_dir(),
            path: path_dirs(),
        }
    }

    /// Finds the DLL `name` as a dependency of a module in `from`: an API set, a module
    /// already loaded, then the directory of the requiring module, Bun's directory, the added
    /// directories, System32, the Windows directory, the working directory and `PATH`.
    pub fn resolve(&self, name: &[u8], from: Option<&[u8]>) -> Option<Found> {
        if strings::has_prefix_case_insensitive(name, b"api-")
            || strings::has_prefix_case_insensitive(name, b"ext-")
        {
            return Some(Found::ApiSet);
        }
        if !is_bare(name) {
            return file_exists(name).then(|| Found::Path(name.to_vec()));
        }
        if let Some(path) = loaded_module(name) {
            return Some(Found::Path(path));
        }
        let fixed = [
            self.app.as_slice(),
            self.system.as_slice(),
            self.windows.as_slice(),
            self.cwd.as_slice(),
        ];
        let dirs = from
            .into_iter()
            .chain(fixed[..1].iter().copied())
            .chain(self.added.iter().map(Vec::as_slice))
            .chain(fixed[1..].iter().copied())
            .chain(self.path.iter().map(Vec::as_slice));
        for dir in dirs {
            if dir.is_empty() {
                continue;
            }
            let candidate = join(dir, name);
            if file_exists(&candidate) {
                return Some(Found::Path(candidate));
            }
        }
        None
    }

    /// A file of the Windows installation (System32, SysWOW64, WinSxS…).
    fn is_system(&self, path: &[u8]) -> bool {
        is_under(path, &self.windows) || is_under(path, &self.system)
    }
}

impl Default for Search {
    fn default() -> Self {
        Search::new()
    }
}

// ── PE import and export tables ─────────────────────────────────────────────

fn u16_at(b: &[u8], at: usize) -> Option<u16> {
    Some(u16::from_le_bytes(b.get(at..at + 2)?.try_into().ok()?))
}

fn u32_at(b: &[u8], at: usize) -> Option<u32> {
    Some(u32::from_le_bytes(b.get(at..at + 4)?.try_into().ok()?))
}

fn u64_at(b: &[u8], at: usize) -> Option<u64> {
    Some(u64::from_le_bytes(b.get(at..at + 8)?.try_into().ok()?))
}

struct Section {
    va: u32,
    size: u32,
    raw: u32,
    raw_size: u32,
}

enum Symbol {
    Name(Vec<u8>),
    Ordinal(u16),
}

struct Import {
    module: Vec<u8>,
    symbols: Vec<Symbol>,
}

#[derive(Default)]
struct Exports {
    /// Sorted.
    names: Vec<Vec<u8>>,
    base: u32,
    count: u32,
}

impl Exports {
    fn has(&self, symbol: &Symbol) -> bool {
        match symbol {
            Symbol::Name(name) => self.names.binary_search(name).is_ok(),
            Symbol::Ordinal(ordinal) => {
                let ordinal = u32::from(*ordinal);
                ordinal >= self.base && ordinal - self.base < self.count
            }
        }
    }
}

/// A PE image read through its file: headers on open, then whole sections on demand.
struct Pe {
    file: File,
    machine: u16,
    pe32_plus: bool,
    exports: u32,
    imports: u32,
    sections: Vec<Section>,
    data: Vec<Option<Vec<u8>>>,
}

impl Pe {
    fn open(path: &[u8]) -> Option<Pe> {
        let file = File::openat(Fd::cwd(), path, O::RDONLY, 0).ok()?;
        let mut dos = [0u8; 64];
        if file.pread_all(&mut dos, 0).ok()? < dos.len() || &dos[..2] != b"MZ" {
            return None;
        }
        let nt = u64::from(u32_at(&dos, 0x3c)?);
        // Signature, COFF header and the largest optional header (PE32+ with 16 directories).
        let mut head = [0u8; 24 + 240];
        let n = file.pread_all(&mut head, nt).ok()?;
        let head = &head[..n];
        if head.len() < 24 || &head[..4] != b"PE\0\0" {
            return None;
        }
        let machine = u16_at(head, 4)?;
        let section_count = usize::from(u16_at(head, 6)?);
        let optional_size = u16_at(head, 20)?;
        let optional = &head[24..];
        let (pe32_plus, dirs) = match u16_at(optional, 0)? {
            0x10b => (false, 96),
            0x20b => (true, 112),
            _ => return None,
        };
        let dir_count = u32_at(optional, dirs - 4).unwrap_or(0) as usize;
        let dir = |i: usize| {
            if i < dir_count {
                u32_at(optional, dirs + i * 8).unwrap_or(0)
            } else {
                0
            }
        };
        let (exports, imports) = (dir(0), dir(1));
        if section_count == 0 || section_count > 96 {
            return None;
        }
        let mut table = vec![0u8; section_count * 40];
        let at = nt + 24 + u64::from(optional_size);
        if file.pread_all(&mut table, at).ok()? < table.len() {
            return None;
        }
        let sections = table
            .as_chunks::<40>()
            .0
            .iter()
            .map(|s| Section {
                size: u32_at(s, 8).unwrap_or(0),
                va: u32_at(s, 12).unwrap_or(0),
                raw_size: u32_at(s, 16).unwrap_or(0),
                raw: u32_at(s, 20).unwrap_or(0),
            })
            .collect::<Vec<_>>();
        let data = sections.iter().map(|_| None).collect();
        Some(Pe {
            file,
            machine,
            pe32_plus,
            exports,
            imports,
            sections,
            data,
        })
    }

    /// The bytes of the section holding `rva`, from `rva` on.
    fn at(&mut self, rva: u32) -> Option<&[u8]> {
        let i = self
            .sections
            .iter()
            .position(|s| rva >= s.va && rva - s.va < s.size.max(s.raw_size))?;
        let section = &self.sections[i];
        let offset = (rva - section.va) as usize;
        if self.data[i].is_none() {
            let mut buf = vec![0u8; section.raw_size.min(64 << 20) as usize];
            let n = self.file.pread_all(&mut buf, u64::from(section.raw)).ok()?;
            buf.truncate(n);
            self.data[i] = Some(buf);
        }
        self.data[i].as_deref()?.get(offset..)
    }

    fn u32(&mut self, rva: u32) -> Option<u32> {
        u32_at(self.at(rva)?, 0)
    }

    fn u64(&mut self, rva: u32) -> Option<u64> {
        u64_at(self.at(rva)?, 0)
    }

    fn cstr(&mut self, rva: u32) -> Option<Vec<u8>> {
        let rest = self.at(rva)?;
        let rest = &rest[..rest.len().min(1024)];
        let end = strings::index_of_char_usize(rest, 0)?;
        Some(rest[..end].to_vec())
    }

    /// The import directory: each DLL and the symbols taken from it. Delay-loaded imports
    /// are not in it; a missing one only fails when it is first called.
    fn imports(&mut self) -> Vec<Import> {
        let mut out = Vec::new();
        if self.imports == 0 {
            return out;
        }
        let (step, ordinal_flag) = if self.pe32_plus {
            (8, 1u64 << 63)
        } else {
            (4, 1u64 << 31)
        };
        for i in 0..1024u32 {
            let Some(desc) = self.imports.checked_add(i * 20) else {
                break;
            };
            let Some(desc) = self.at(desc).and_then(|d| d.get(..20)).map(<[u8]>::to_vec) else {
                break;
            };
            let lookup = u32_at(&desc, 0).unwrap_or(0);
            let name = u32_at(&desc, 12).unwrap_or(0);
            let first = u32_at(&desc, 16).unwrap_or(0);
            if name == 0 {
                break;
            }
            let Some(module) = self.cstr(name) else {
                continue;
            };
            let thunks = if lookup != 0 { lookup } else { first };
            let mut symbols = Vec::new();
            for j in 0..16384u32 {
                if thunks == 0 {
                    break;
                }
                let Some(at) = thunks.checked_add(j * step) else {
                    break;
                };
                let entry = if self.pe32_plus {
                    self.u64(at)
                } else {
                    self.u32(at).map(u64::from)
                };
                match entry {
                    None | Some(0) => break,
                    Some(entry) if entry & ordinal_flag != 0 => {
                        symbols.push(Symbol::Ordinal(entry as u16));
                    }
                    Some(entry) => {
                        // IMAGE_IMPORT_BY_NAME: a u16 hint, then the name.
                        if let Some(name) = (entry as u32).checked_add(2).and_then(|r| self.cstr(r))
                        {
                            symbols.push(Symbol::Name(name));
                        }
                    }
                }
            }
            out.push(Import { module, symbols });
        }
        out
    }

    fn exports(&mut self) -> Exports {
        let mut out = Exports::default();
        if self.exports == 0 {
            return out;
        }
        let Some(dir) = self
            .at(self.exports)
            .and_then(|d| d.get(..40))
            .map(<[u8]>::to_vec)
        else {
            return out;
        };
        out.base = u32_at(&dir, 16).unwrap_or(0);
        out.count = u32_at(&dir, 20).unwrap_or(0);
        let name_count = u32_at(&dir, 24).unwrap_or(0).min(65536);
        let names = u32_at(&dir, 32).unwrap_or(0);
        for i in 0..name_count {
            let Some(at) = names.checked_add(i * 4) else {
                break;
            };
            let Some(rva) = self.u32(at) else {
                break;
            };
            if let Some(name) = self.cstr(rva) {
                out.names.push(name);
            }
        }
        out.names.sort_unstable();
        out
    }
}

pub const NATIVE_MACHINE: u16 = if cfg!(target_arch = "aarch64") {
    0xAA64
} else {
    0x8664
};

pub fn machine_name(machine: u16) -> &'static str {
    match machine {
        0x014c => "x86",
        0x8664 => "x64",
        0xAA64 => "arm64",
        0xA641 => "arm64ec",
        0x01c4 => "arm",
        _ => "an unknown architecture",
    }
}

// ── Diagnosis ───────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProblemKind {
    /// No DLL of that name is found in the search order.
    Missing,
    /// The DLL found does not export a symbol that is imported from it.
    Export,
    /// The image is built for another architecture than this process.
    Machine,
}

impl ProblemKind {
    pub fn as_str(self) -> &'static str {
        match self {
            ProblemKind::Missing => "missing",
            ProblemKind::Export => "export",
            ProblemKind::Machine => "machine",
        }
    }
}

#[derive(Debug, Clone)]
pub struct Problem {
    pub kind: ProblemKind,
    /// The DLL as it is named in the import table (or the file name of the image).
    pub module: Vec<u8>,
    /// Where `module` was found; empty when it is missing.
    pub path: Vec<u8>,
    /// `Export`: the symbol (`#<ordinal>` for an ordinal). `Machine`: the architecture.
    pub detail: Vec<u8>,
    /// The module whose import table names `module`; empty for the image itself.
    pub required_by: Vec<u8>,
}

pub struct Diagnosis {
    pub machine: u16,
    pub problems: Vec<Problem>,
}

/// Walks the import tables from the DLL at `path` through every dependency outside the
/// Windows directory and reports what keeps it from loading. `None` when `path` is not a
/// readable PE image.
pub fn diagnose(path: &[u8]) -> Option<Diagnosis> {
    let mut pe = Pe::open(path)?;
    let machine = pe.machine;
    let mut problems = Vec::new();
    if machine != NATIVE_MACHINE {
        problems.push(Problem {
            kind: ProblemKind::Machine,
            module: basename(path).to_vec(),
            path: path.to_vec(),
            detail: machine_name(machine).as_bytes().to_vec(),
            required_by: Vec::new(),
        });
        return Some(Diagnosis { machine, problems });
    }
    let search = Search::new();
    let mut visited = vec![basename(path).to_ascii_lowercase()];
    let mut checked: Vec<(Vec<u8>, Option<(u16, Exports)>)> = Vec::new();
    let mut pending: Vec<Vec<u8>> = Vec::new();
    let mut current = Some((path.to_vec(), pe));
    'walk: while let Some((module, mut image)) = current.take() {
        for import in image.imports() {
            if problems.len() >= MAX_PROBLEMS {
                break 'walk;
            }
            let dep = match search.resolve(&import.module, parent(&module)) {
                None => {
                    problems.push(Problem {
                        kind: ProblemKind::Missing,
                        module: import.module,
                        path: Vec::new(),
                        detail: Vec::new(),
                        required_by: module.clone(),
                    });
                    continue;
                }
                Some(Found::ApiSet) => continue,
                Some(Found::Path(dep)) => dep,
            };
            let key = dep.to_ascii_lowercase();
            let index = match checked.iter().position(|(k, _)| *k == key) {
                Some(i) => i,
                None => {
                    let info = Pe::open(&dep).map(|mut p| {
                        let exports = p.exports();
                        (p.machine, exports)
                    });
                    checked.push((key, info));
                    checked.len() - 1
                }
            };
            let Some((dep_machine, exports)) = &checked[index].1 else {
                continue;
            };
            if *dep_machine != NATIVE_MACHINE {
                problems.push(Problem {
                    kind: ProblemKind::Machine,
                    module: import.module,
                    path: dep,
                    detail: machine_name(*dep_machine).as_bytes().to_vec(),
                    required_by: module.clone(),
                });
                continue;
            }
            for symbol in &import.symbols {
                if exports.has(symbol) || problems.len() >= MAX_PROBLEMS {
                    continue;
                }
                let detail = match symbol {
                    Symbol::Name(name) => name.clone(),
                    Symbol::Ordinal(ordinal) => format!("#{ordinal}").into_bytes(),
                };
                problems.push(Problem {
                    kind: ProblemKind::Export,
                    module: import.module.clone(),
                    path: dep.clone(),
                    detail,
                    required_by: module.clone(),
                });
            }
            let name = basename(&dep).to_ascii_lowercase();
            if !search.is_system(&dep) && visited.len() < MAX_MODULES && !visited.contains(&name) {
                visited.push(name);
                pending.push(dep);
            }
        }
        while let Some(next) = pending.pop() {
            if let Some(image) = Pe::open(&next) {
                current = Some((next, image));
                break;
            }
        }
    }
    Some(Diagnosis { machine, problems })
}

fn is_vc_runtime(name: &[u8]) -> bool {
    [
        b"vcruntime".as_slice(),
        b"msvcp",
        b"vcomp",
        b"concrt",
        b"vccorlib",
    ]
    .iter()
    .any(|prefix| strings::has_prefix_case_insensitive(name, prefix))
}

/// Why `path` failed to load with `code`, for the error messages of `process.dlopen` and
/// `bun:ffi`: the missing dependency, the missing export or the other architecture. `None`
/// when the import tables explain nothing more.
pub fn describe_failure(path: &[u8], code: u32) -> Option<Vec<u8>> {
    if !matches!(
        code,
        ERROR_MOD_NOT_FOUND
            | ERROR_PROC_NOT_FOUND
            | ERROR_BAD_EXE_FORMAT
            | ERROR_EXE_MACHINE_TYPE_MISMATCH
    ) {
        return None;
    }
    let path = if is_bare(path) {
        match Search::new().resolve(path, None)? {
            Found::Path(found) => found,
            Found::ApiSet => return None,
        }
    } else {
        path.to_vec()
    };
    let diagnosis = diagnose(&path)?;
    let wanted = |p: &&Problem| match code {
        ERROR_MOD_NOT_FOUND => {
            p.kind == ProblemKind::Missing
                || (p.kind == ProblemKind::Machine && !p.required_by.is_empty())
        }
        ERROR_PROC_NOT_FOUND => p.kind == ProblemKind::Export,
        _ => p.kind == ProblemKind::Machine,
    };
    let mut out = Vec::new();
    let mut vc_runtime = false;
    for p in diagnosis.problems.iter().filter(wanted).take(3) {
        if !out.is_empty() {
            out.extend_from_slice(b"; ");
        }
        let by = BStr::new(basename(&p.required_by));
        let _ = match p.kind {
            ProblemKind::Missing => {
                vc_runtime |= is_vc_runtime(&p.module);
                write!(
                    out,
                    "{} is missing (required by {by})",
                    BStr::new(&p.module)
                )
            }
            ProblemKind::Export => write!(
                out,
                "{} does not export {} (required by {by})",
                BStr::new(&p.path),
                BStr::new(&p.detail)
            ),
            ProblemKind::Machine if p.required_by.is_empty() => write!(
                out,
                "{} is built for {}, but this Bun runs as {}",
                BStr::new(&p.module),
                BStr::new(&p.detail),
                machine_name(NATIVE_MACHINE)
            ),
            ProblemKind::Machine => write!(
                out,
                "{} is built for {} (required by {by})",
                BStr::new(&p.path),
                BStr::new(&p.detail)
            ),
        };
    }
    if out.is_empty() {
        return None;
    }
    if vc_runtime {
        let _ = write!(
            out,
            ". Install the Microsoft Visual C++ Redistributable: https://aka.ms/vs/17/release/vc_redist.{}.exe",
            machine_name(NATIVE_MACHINE)
        );
    }
    Some(out)
}

/// `process.dlopen` (BunProcess.cpp): writes why the UTF-8 `path` failed to load with
/// `code` into `out` and returns the byte count, 0 when there is nothing to add.
///
/// # Safety
/// `path` is valid for `path_len` bytes and `out` for `out_cap` bytes.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn Bun__windowsDllFailure(
    path: *const u8,
    path_len: usize,
    code: u32,
    out: *mut u8,
    out_cap: usize,
) -> usize {
    if path.is_null() || out.is_null() {
        return 0;
    }
    // SAFETY: caller contract.
    let path = unsafe { core::slice::from_raw_parts(path, path_len) };
    let Some(text) = describe_failure(path, code) else {
        return 0;
    };
    let n = text.len().min(out_cap);
    // SAFETY: caller contract; `n <= out_cap`.
    unsafe { core::ptr::copy_nonoverlapping(text.as_ptr(), out, n) };
    n
}
