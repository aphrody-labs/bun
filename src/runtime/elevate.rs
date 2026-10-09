//! Running a child as root (POSIX) or Administrator (Windows): `Bun.spawn({ elevate: true })`, the shell's
//! `sudo` builtin and `bunsh --root`.
//!
//! - Already elevated (euid 0, or an elevated Windows token): the command runs as is.
//! - Linux/macOS: `sudo -n [VAR=value...] /abs/command args...` (sudo-rs or sudo). `-n` never prompts. The command is
//!   the absolute path resolved from the caller's `PATH`, so sudo's `secure_path` does not change which binary runs.
//!   No `--`: sudo-rs takes `VAR=value` only before `--`, sudo only after it; an absolute path is never an option.
//! - Windows: the inbox `sudo.exe` when it is enabled, else `bun -e <ShellExecuteExW "runas" helper>`.

#[cfg(unix)]
use core::sync::atomic::{AtomicU8, Ordering};

pub(crate) enum Elevation {
    /// The process is already root/Administrator.
    Direct,
    /// Run `prefix ++ env assignments ++ [absolute command] ++ args`.
    Wrapped {
        prefix: Vec<Vec<u8>>,
        /// Whether `VAR=value` words placed after `prefix` reach the child's environment (sudo).
        env_as_args: bool,
    },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum ElevateError {
    #[cfg_attr(windows, allow(dead_code))]
    SudoNotFound,
    #[cfg_attr(windows, allow(dead_code))]
    PasswordRequired,
    #[cfg_attr(not(windows), allow(dead_code))]
    NoSelfExe,
}

impl ElevateError {
    pub(crate) fn message(self) -> &'static str {
        match self {
            ElevateError::SudoNotFound => {
                "elevate: sudo was not found in PATH. Run as root, or install sudo-rs with a NOPASSWD rule (Aphrody Alpine: group 'aphrody')"
            }
            ElevateError::PasswordRequired => {
                "elevate: 'sudo -n true' failed: sudo requires a password or denies this user. Add a NOPASSWD rule (Aphrody Alpine: /etc/sudoers.d/aphrody, group 'aphrody') or run as root"
            }
            ElevateError::NoSelfExe => "elevate: cannot locate the bun executable to run the elevation helper",
        }
    }
}

/// Root/Administrator check, cached: neither the euid nor the token elevation of a running process changes in
/// practice for Bun (no `setuid` API).
pub(crate) fn is_elevated() -> bool {
    static CACHE: std::sync::OnceLock<bool> = std::sync::OnceLock::new();
    *CACHE.get_or_init(is_elevated_uncached)
}

#[cfg(unix)]
fn is_elevated_uncached() -> bool {
    // SAFETY: geteuid has no preconditions.
    unsafe { libc::geteuid() == 0 }
}

#[cfg(windows)]
fn is_elevated_uncached() -> bool {
    bun_sys::windows::is_elevated()
}

#[cfg(unix)]
const DEFAULT_SUDO_PATH: &[u8] = b"/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin";

/// 0 = not probed, 1 = `sudo -n true` succeeded, 2 = it failed.
#[cfg(unix)]
static SUDO_PROBE: AtomicU8 = AtomicU8::new(0);

/// How to elevate a command for a caller whose `PATH` is `path_env` and working directory is `cwd`.
pub(crate) fn plan(path_env: &[u8], cwd: &[u8]) -> Result<Elevation, ElevateError> {
    if is_elevated() {
        return Ok(Elevation::Direct);
    }
    plan_unelevated(path_env, cwd)
}

#[cfg(unix)]
fn plan_unelevated(path_env: &[u8], cwd: &[u8]) -> Result<Elevation, ElevateError> {
    let sudo: Vec<u8> = {
        let mut buf = bun_paths::path_buffer_pool::get();
        match bun_which::which(&mut buf, path_env, cwd, b"sudo") {
            Some(z) => z.as_bytes().to_vec(),
            None => {
                let mut buf2 = bun_paths::path_buffer_pool::get();
                match bun_which::which(&mut buf2, DEFAULT_SUDO_PATH, cwd, b"sudo") {
                    Some(z) => z.as_bytes().to_vec(),
                    None => return Err(ElevateError::SudoNotFound),
                }
            }
        }
    };
    match SUDO_PROBE.load(Ordering::Relaxed) {
        1 => {}
        2 => return Err(ElevateError::PasswordRequired),
        _ => {
            let ok = matches!(
                bun_core::spawn_sync_inherit_no_stdin(&[&sudo[..], b"-n", b"true"]),
                Ok(status) if status.is_ok()
            );
            SUDO_PROBE.store(if ok { 1 } else { 2 }, Ordering::Relaxed);
            if !ok {
                return Err(ElevateError::PasswordRequired);
            }
        }
    }
    Ok(Elevation::Wrapped {
        prefix: vec![sudo, b"-n".to_vec()],
        env_as_args: true,
    })
}

/// ShellExecuteExW("runas") helper run by `bun -e`, for Windows without an enabled `sudo.exe`. Its argv after
/// `--` is the absolute command and its arguments; it waits for the elevated process and exits with its code. UAC
/// starts the elevated process in its own console: the caller's stdio is not connected to it.
#[cfg(windows)]
pub(crate) const WINDOWS_RUNAS_HELPER: &str = r#"const{dlopen,FFIType:T,ptr}=require("bun:ffi");
const a=process.argv.slice(1);
const q=s=>s&&!/[\s"]/.test(s)?s:'"'+s.replace(/(\\*)"/g,'$1$1\\"').replace(/(\\+)$/,'$1$1')+'"';
const w=s=>Buffer.from(s+"\0","utf16le");
const file=w(a[0]),params=w(a.slice(1).map(q).join(" ")),verb=w("runas"),dir=w(process.cwd());
const sh=dlopen("shell32.dll",{ShellExecuteExW:{args:[T.ptr],returns:T.i32}}).symbols;
const k=dlopen("kernel32.dll",{GetLastError:{args:[],returns:T.u32},WaitForSingleObject:{args:[T.u64,T.u32],returns:T.u32},GetExitCodeProcess:{args:[T.u64,T.ptr],returns:T.i32},CloseHandle:{args:[T.u64],returns:T.i32}}).symbols;
const info=new ArrayBuffer(112),v=new DataView(info);
v.setUint32(0,112,true);v.setUint32(4,0x40|0x100|0x8000,true);
v.setBigUint64(16,BigInt(ptr(verb)),true);v.setBigUint64(24,BigInt(ptr(file)),true);
v.setBigUint64(32,BigInt(ptr(params)),true);v.setBigUint64(40,BigInt(ptr(dir)),true);v.setInt32(48,1,true);
if(!sh.ShellExecuteExW(ptr(info))){const e=k.GetLastError();console.error(e===1223?"elevate: the UAC prompt was declined":"elevate: ShellExecuteExW failed with Win32 error "+e);process.exit(1)}
const h=v.getBigUint64(104,true),code=new Uint32Array(1);
k.WaitForSingleObject(h,0xFFFFFFFF);k.GetExitCodeProcess(h,ptr(code));k.CloseHandle(h);process.exit(code[0]);"#;

#[cfg(windows)]
fn plan_unelevated(path_env: &[u8], cwd: &[u8]) -> Result<Elevation, ElevateError> {
    if windows_sudo_enabled() {
        let mut buf = bun_paths::path_buffer_pool::get();
        if let Some(z) = bun_which::which(&mut buf, path_env, cwd, b"sudo.exe") {
            return Ok(Elevation::Wrapped {
                prefix: vec![z.as_bytes().to_vec()],
                env_as_args: false,
            });
        }
    }
    let exe = bun_core::self_exe_path().map_err(|_| ElevateError::NoSelfExe)?;
    Ok(Elevation::Wrapped {
        prefix: vec![
            exe.as_bytes().to_vec(),
            b"-e".to_vec(),
            WINDOWS_RUNAS_HELPER.as_bytes().to_vec(),
            b"--".to_vec(),
        ],
        env_as_args: false,
    })
}

/// Sudo for Windows (Windows 11 24H2+): `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Sudo` `Enabled` is 0 when
/// disabled, 1 (new window), 2 (input disabled) or 3 (inline).
#[cfg(windows)]
fn windows_sudo_enabled() -> bool {
    #[link(name = "advapi32")]
    unsafe extern "system" {
        fn RegGetValueW(
            hkey: *mut core::ffi::c_void,
            lp_sub_key: *const u16,
            lp_value: *const u16,
            dw_flags: u32,
            pdw_type: *mut u32,
            pv_data: *mut core::ffi::c_void,
            pcb_data: *mut u32,
        ) -> i32;
    }
    const HKEY_LOCAL_MACHINE: usize = 0x8000_0002;
    const RRF_RT_REG_DWORD: u32 = 0x0000_0010;
    let key: Vec<u16> = "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Sudo\0".encode_utf16().collect();
    let value: Vec<u16> = "Enabled\0".encode_utf16().collect();
    let mut data: u32 = 0;
    let mut len: u32 = size_of::<u32>() as u32;
    // SAFETY: predefined HKLM handle; NUL-terminated wide strings; `data`/`len` describe a DWORD buffer.
    let status = unsafe {
        RegGetValueW(
            HKEY_LOCAL_MACHINE as *mut core::ffi::c_void,
            key.as_ptr(),
            value.as_ptr(),
            RRF_RT_REG_DWORD,
            core::ptr::null_mut(),
            (&raw mut data).cast(),
            &mut len,
        )
    };
    status == 0 && data != 0
}

/// Whether `name` is a valid environment variable name for a `VAR=value` word given to sudo.
pub(crate) fn is_env_name(name: &[u8]) -> bool {
    !name.is_empty()
        && !name[0].is_ascii_digit()
        && name.iter().all(|&b| b.is_ascii_alphanumeric() || b == b'_')
}

