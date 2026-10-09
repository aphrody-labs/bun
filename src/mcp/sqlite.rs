//! The SQLite C API linked into bun (the bundled amalgamation on Linux and Windows, the system
//! `libsqlite3.dylib` loaded at runtime on macOS, as `bun:sqlite` does).

use std::ffi::{CStr, CString, c_char, c_int, c_void};
use std::path::Path;
use std::ptr;

#[repr(C)]
struct RawDb {
    _p: [u8; 0],
}
#[repr(C)]
struct RawStmt {
    _p: [u8; 0],
}

const SQLITE_OK: c_int = 0;
const SQLITE_ROW: c_int = 100;
const SQLITE_DONE: c_int = 101;
const SQLITE_OPEN_READWRITE: c_int = 0x2;
const SQLITE_OPEN_CREATE: c_int = 0x4;
const SQLITE_OPEN_FULLMUTEX: c_int = 0x10000;
/// `SQLITE_TRANSIENT`: SQLite copies bound text before the call returns.
const SQLITE_TRANSIENT: isize = -1;

struct Api {
    open_v2: unsafe extern "C" fn(*const c_char, *mut *mut RawDb, c_int, *const c_char) -> c_int,
    close_v2: unsafe extern "C" fn(*mut RawDb) -> c_int,
    prepare_v2: unsafe extern "C" fn(
        *mut RawDb,
        *const c_char,
        c_int,
        *mut *mut RawStmt,
        *mut *const c_char,
    ) -> c_int,
    step: unsafe extern "C" fn(*mut RawStmt) -> c_int,
    finalize: unsafe extern "C" fn(*mut RawStmt) -> c_int,
    bind_text: unsafe extern "C" fn(*mut RawStmt, c_int, *const c_char, c_int, isize) -> c_int,
    bind_int64: unsafe extern "C" fn(*mut RawStmt, c_int, i64) -> c_int,
    bind_blob: unsafe extern "C" fn(*mut RawStmt, c_int, *const c_void, c_int, isize) -> c_int,
    column_text: unsafe extern "C" fn(*mut RawStmt, c_int) -> *const u8,
    column_blob: unsafe extern "C" fn(*mut RawStmt, c_int) -> *const c_void,
    column_bytes: unsafe extern "C" fn(*mut RawStmt, c_int) -> c_int,
    column_int64: unsafe extern "C" fn(*mut RawStmt, c_int) -> i64,
    errmsg: unsafe extern "C" fn(*mut RawDb) -> *const c_char,
    busy_timeout: unsafe extern "C" fn(*mut RawDb, c_int) -> c_int,
}

#[cfg(not(target_os = "macos"))]
fn api() -> Option<&'static Api> {
    unsafe extern "C" {
        fn sqlite3_open_v2(
            f: *const c_char,
            db: *mut *mut RawDb,
            flags: c_int,
            vfs: *const c_char,
        ) -> c_int;
        fn sqlite3_close_v2(db: *mut RawDb) -> c_int;
        fn sqlite3_prepare_v2(
            db: *mut RawDb,
            sql: *const c_char,
            n: c_int,
            stmt: *mut *mut RawStmt,
            tail: *mut *const c_char,
        ) -> c_int;
        fn sqlite3_step(s: *mut RawStmt) -> c_int;
        fn sqlite3_finalize(s: *mut RawStmt) -> c_int;
        fn sqlite3_bind_text(
            s: *mut RawStmt,
            i: c_int,
            t: *const c_char,
            n: c_int,
            d: isize,
        ) -> c_int;
        fn sqlite3_bind_int64(s: *mut RawStmt, i: c_int, v: i64) -> c_int;
        fn sqlite3_bind_blob(
            s: *mut RawStmt,
            i: c_int,
            b: *const c_void,
            n: c_int,
            d: isize,
        ) -> c_int;
        fn sqlite3_column_text(s: *mut RawStmt, i: c_int) -> *const u8;
        fn sqlite3_column_blob(s: *mut RawStmt, i: c_int) -> *const c_void;
        fn sqlite3_column_bytes(s: *mut RawStmt, i: c_int) -> c_int;
        fn sqlite3_column_int64(s: *mut RawStmt, i: c_int) -> i64;
        fn sqlite3_errmsg(db: *mut RawDb) -> *const c_char;
        fn sqlite3_busy_timeout(db: *mut RawDb, ms: c_int) -> c_int;
    }
    static API: Api = Api {
        open_v2: sqlite3_open_v2,
        close_v2: sqlite3_close_v2,
        prepare_v2: sqlite3_prepare_v2,
        step: sqlite3_step,
        finalize: sqlite3_finalize,
        bind_text: sqlite3_bind_text,
        bind_int64: sqlite3_bind_int64,
        bind_blob: sqlite3_bind_blob,
        column_text: sqlite3_column_text,
        column_blob: sqlite3_column_blob,
        column_bytes: sqlite3_column_bytes,
        column_int64: sqlite3_column_int64,
        errmsg: sqlite3_errmsg,
        busy_timeout: sqlite3_busy_timeout,
    };
    Some(&API)
}

#[cfg(target_os = "macos")]
fn api() -> Option<&'static Api> {
    use std::sync::OnceLock;
    static API: OnceLock<Option<Api>> = OnceLock::new();
    API.get_or_init(|| {
        // SAFETY: dlopen/dlsym with NUL-terminated names; each symbol is the documented SQLite
        // function whose signature matches the corresponding `Api` field.
        unsafe {
            let handle = libc::dlopen(c"libsqlite3.dylib".as_ptr(), libc::RTLD_LAZY);
            if handle.is_null() {
                return None;
            }
            macro_rules! sym {
                ($name:literal) => {{
                    let p = libc::dlsym(handle, $name.as_ptr());
                    if p.is_null() {
                        return None;
                    }
                    core::mem::transmute::<*mut c_void, _>(p)
                }};
            }
            Some(Api {
                open_v2: sym!(c"sqlite3_open_v2"),
                close_v2: sym!(c"sqlite3_close_v2"),
                prepare_v2: sym!(c"sqlite3_prepare_v2"),
                step: sym!(c"sqlite3_step"),
                finalize: sym!(c"sqlite3_finalize"),
                bind_text: sym!(c"sqlite3_bind_text"),
                bind_int64: sym!(c"sqlite3_bind_int64"),
                bind_blob: sym!(c"sqlite3_bind_blob"),
                column_text: sym!(c"sqlite3_column_text"),
                column_blob: sym!(c"sqlite3_column_blob"),
                column_bytes: sym!(c"sqlite3_column_bytes"),
                column_int64: sym!(c"sqlite3_column_int64"),
                errmsg: sym!(c"sqlite3_errmsg"),
                busy_timeout: sym!(c"sqlite3_busy_timeout"),
            })
        }
    })
    .as_ref()
}

/// A bound statement parameter.
pub(crate) enum Param<'a> {
    Text(&'a str),
    Int(i64),
    Blob(&'a [u8]),
}

/// An open database connection, closed on drop.
pub(crate) struct Db {
    api: &'static Api,
    raw: *mut RawDb,
}

// SAFETY: connections are opened with SQLITE_OPEN_FULLMUTEX (serialized threading mode).
unsafe impl Send for Db {}
// SAFETY: as above; SQLite serializes every call on the connection.
unsafe impl Sync for Db {}

impl Drop for Db {
    fn drop(&mut self) {
        // SAFETY: `raw` came from a successful open and every statement was finalized.
        unsafe { (self.api.close_v2)(self.raw) };
    }
}

/// One result row: column values read as text, integers or blobs.
pub(crate) struct Row<'s> {
    api: &'static Api,
    stmt: &'s Stmt,
}

impl Row<'_> {
    pub(crate) fn text(&self, col: usize) -> String {
        let col = col as c_int;
        // SAFETY: the statement is positioned on a row; the pointer and length come from SQLite
        // for that row and stay valid until the next step.
        unsafe {
            let p = (self.api.column_text)(self.stmt.raw, col);
            if p.is_null() {
                return String::new();
            }
            let n = (self.api.column_bytes)(self.stmt.raw, col).max(0) as usize;
            String::from_utf8_lossy(std::slice::from_raw_parts(p, n)).into_owned()
        }
    }
    pub(crate) fn int(&self, col: usize) -> i64 {
        // SAFETY: the statement is positioned on a row.
        unsafe { (self.api.column_int64)(self.stmt.raw, col as c_int) }
    }
    pub(crate) fn blob(&self, col: usize) -> Vec<u8> {
        let col = col as c_int;
        // SAFETY: as in `text`.
        unsafe {
            let p = (self.api.column_blob)(self.stmt.raw, col);
            if p.is_null() {
                return Vec::new();
            }
            let n = (self.api.column_bytes)(self.stmt.raw, col).max(0) as usize;
            std::slice::from_raw_parts(p.cast::<u8>(), n).to_vec()
        }
    }
}

struct Stmt {
    api: &'static Api,
    raw: *mut RawStmt,
}

impl Drop for Stmt {
    fn drop(&mut self) {
        // SAFETY: `raw` is a prepared statement owned by this value.
        unsafe { (self.api.finalize)(self.raw) };
    }
}

impl Db {
    pub(crate) fn open(path: &Path) -> Result<Db, String> {
        let api = api().ok_or("SQLite is not available in this build")?;
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir).map_err(|e| format!("{}: {e}", dir.display()))?;
        }
        let c_path =
            CString::new(path.to_string_lossy().into_owned()).map_err(|e| e.to_string())?;
        let mut raw = ptr::null_mut();
        // SAFETY: valid NUL-terminated path and out-pointer.
        let rc = unsafe {
            (api.open_v2)(
                c_path.as_ptr(),
                &raw mut raw,
                SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_FULLMUTEX,
                ptr::null(),
            )
        };
        let db = Db { api, raw };
        if rc != SQLITE_OK || raw.is_null() {
            return Err(format!("open {}: {}", path.display(), db.error()));
        }
        // SAFETY: open connection.
        unsafe { (api.busy_timeout)(raw, 3000) };
        Ok(db)
    }

    fn error(&self) -> String {
        if self.raw.is_null() {
            return "out of memory".into();
        }
        // SAFETY: errmsg returns a NUL-terminated string owned by the connection.
        unsafe { CStr::from_ptr((self.api.errmsg)(self.raw)) }
            .to_string_lossy()
            .into_owned()
    }

    fn prepare(&self, sql: &str, params: &[Param<'_>]) -> Result<Stmt, String> {
        let c_sql = CString::new(sql).map_err(|e| e.to_string())?;
        let mut raw = ptr::null_mut();
        // SAFETY: valid connection, NUL-terminated SQL and out-pointer.
        let rc = unsafe {
            (self.api.prepare_v2)(self.raw, c_sql.as_ptr(), -1, &raw mut raw, ptr::null_mut())
        };
        if rc != SQLITE_OK || raw.is_null() {
            return Err(self.error());
        }
        let stmt = Stmt { api: self.api, raw };
        for (i, p) in params.iter().enumerate() {
            let i = (i + 1) as c_int;
            // SAFETY: SQLITE_TRANSIENT makes SQLite copy the bytes before returning.
            let rc = unsafe {
                match p {
                    Param::Text(s) => (self.api.bind_text)(
                        raw,
                        i,
                        s.as_ptr().cast(),
                        c_int::try_from(s.len()).map_err(|e| e.to_string())?,
                        SQLITE_TRANSIENT,
                    ),
                    Param::Int(v) => (self.api.bind_int64)(raw, i, *v),
                    Param::Blob(b) => (self.api.bind_blob)(
                        raw,
                        i,
                        b.as_ptr().cast(),
                        c_int::try_from(b.len()).map_err(|e| e.to_string())?,
                        SQLITE_TRANSIENT,
                    ),
                }
            };
            if rc != SQLITE_OK {
                return Err(self.error());
            }
        }
        Ok(stmt)
    }

    /// Runs every statement of `sql` (no parameters, no rows).
    pub(crate) fn exec_batch(&self, sql: &str) -> Result<(), String> {
        for statement in sql.split(";\n").map(str::trim).filter(|s| !s.is_empty()) {
            self.execute(statement, &[])?;
        }
        Ok(())
    }

    /// Runs one statement, ignoring rows.
    pub(crate) fn execute(&self, sql: &str, params: &[Param<'_>]) -> Result<(), String> {
        self.query(sql, params, |_| {})
    }

    /// Runs one statement and calls `each` per row.
    pub(crate) fn query(
        &self,
        sql: &str,
        params: &[Param<'_>],
        mut each: impl FnMut(&Row<'_>),
    ) -> Result<(), String> {
        let stmt = self.prepare(sql, params)?;
        loop {
            // SAFETY: prepared statement.
            match unsafe { (self.api.step)(stmt.raw) } {
                SQLITE_ROW => each(&Row {
                    api: self.api,
                    stmt: &stmt,
                }),
                SQLITE_DONE => return Ok(()),
                _ => return Err(self.error()),
            }
        }
    }
}
