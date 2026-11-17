// SPDX-License-Identifier: MIT
//! Run-time shared library loading (`LoadLibraryExW` / `dlopen`), kept for the process lifetime.

use std::ffi::{CString, c_void};
use std::path::Path;

pub(crate) struct Library(*mut c_void);

// SAFETY: a module handle is process-wide.
unsafe impl Send for Library {}
// SAFETY: as above.
unsafe impl Sync for Library {}

impl Library {
    #[cfg(windows)]
    pub(crate) fn open(path: &Path) -> Result<Self, String> {
        use windows_sys::Win32::System::LibraryLoader::{
            LOAD_LIBRARY_SEARCH_DEFAULT_DIRS, LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR, LoadLibraryExW,
        };
        let wide = crate::to_char_t(path.as_os_str()).map_err(|error| error.message)?;
        // SAFETY: NUL-terminated UTF-16 path; dependencies resolve next to the library.
        let handle = unsafe {
            LoadLibraryExW(
                wide.as_ptr(),
                std::ptr::null_mut(),
                LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR | LOAD_LIBRARY_SEARCH_DEFAULT_DIRS,
            )
        };
        if handle.is_null() {
            return Err(std::io::Error::last_os_error().to_string());
        }
        Ok(Self(handle))
    }

    #[cfg(unix)]
    pub(crate) fn open(path: &Path) -> Result<Self, String> {
        use std::os::unix::ffi::OsStrExt;
        let c_path = CString::new(path.as_os_str().as_bytes())
            .map_err(|_| "path contains NUL".to_owned())?;
        // SAFETY: NUL-terminated path.
        let handle = unsafe { libc::dlopen(c_path.as_ptr(), libc::RTLD_NOW | libc::RTLD_LOCAL) };
        if handle.is_null() {
            // SAFETY: dlerror returns a thread-local message or null.
            let message = unsafe { libc::dlerror() };
            return Err(if message.is_null() {
                "dlopen failed".to_owned()
            } else {
                // SAFETY: non-null NUL-terminated message.
                unsafe { std::ffi::CStr::from_ptr(message) }
                    .to_string_lossy()
                    .into_owned()
            });
        }
        Ok(Self(handle))
    }

    /// # Safety
    /// `T` is the exact function-pointer type of the symbol.
    pub(crate) unsafe fn symbol<T: Copy>(&self, name: &str) -> Option<T> {
        let name = CString::new(name).ok()?;
        #[cfg(windows)]
        // SAFETY: valid module handle and NUL-terminated name.
        let address = unsafe {
            windows_sys::Win32::System::LibraryLoader::GetProcAddress(self.0, name.as_ptr().cast())
        }
        .map_or(std::ptr::null_mut(), |f| f as *mut c_void);
        #[cfg(unix)]
        // SAFETY: valid dlopen handle and NUL-terminated name.
        let address = unsafe { libc::dlsym(self.0, name.as_ptr()) };
        if address.is_null() {
            return None;
        }
        // SAFETY: caller contract; function and data pointers have the same size here.
        Some(unsafe { std::mem::transmute_copy::<*mut c_void, T>(&address) })
    }
}
