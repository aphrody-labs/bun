//! Maintainer scripts run inside the root filesystem: fork, enter a private
//! mount namespace when `/proc` or `/dev` are missing (or a user namespace
//! when not root), `chroot(root)`, `execve`. Ported from apk-tools
//! `apk_db_run_script` / `unshare_mount_namespace` (GPL-2.0-only,
//! aphrody-labs/apk-tools@44dcdfc, apk-tools 3.0.8).

use super::super::{Error, Result};
use super::fsops::Root;

pub struct Runner {
    root: Root,
    usermode: bool,
    need_unshare: bool,
    proc_ok: bool,
    dev_ok: bool,
    prepared: bool,
}

/// `true` when this host can run scripts in a root (Linux only).
pub const SUPPORTED: bool = cfg!(target_os = "linux");

impl Runner {
    pub fn new(root: &Root) -> Runner {
        let usermode = !super::is_superuser();
        let proc_ok = root.exists(b"proc/self");
        let dev_ok = root.exists(b"dev/null");
        let mut need_unshare = usermode || !proc_ok || !dev_ok;
        if need_unshare && !usermode && !imp::unshare_check() {
            need_unshare = false;
        }
        Runner { root: root.clone(), usermode, need_unshare, proc_ok, dev_ok, prepared: false }
    }

    /// Writes `script` to `exec_rel` inside the root and runs it with `args`.
    /// Returns the exit code.
    pub fn run(&mut self, exec_rel: &[u8], script: &[u8], args: &[&[u8]], env: &[(&[u8], &[u8])]) -> Result<i32> {
        if !SUPPORTED {
            return Err(Error::Unsupported("maintainer scripts only run on Linux".to_owned()));
        }
        if !self.prepared {
            if !self.dev_ok && !self.need_unshare {
                self.root.make_device_tree();
            }
            self.prepared = true;
        }
        self.root.write_atomic(exec_rel, script, 0o755)?;
        let mut argv0 = b"/".to_vec();
        argv0.extend_from_slice(exec_rel);
        let mut argv: Vec<&[u8]> = vec![&argv0];
        argv.extend_from_slice(args);
        let mut envp: Vec<Vec<u8>> = vec![b"PATH=/usr/sbin:/usr/bin:/sbin:/bin".to_vec()];
        for (k, v) in env {
            let mut kv = k.to_vec();
            kv.push(b'=');
            kv.extend_from_slice(v);
            envp.push(kv);
        }
        let res = imp::spawn_chrooted(
            &self.root.dir,
            &argv,
            &envp,
            imp::Namespaces {
                unshare: self.need_unshare,
                usermode: self.usermode,
                proc_ok: self.proc_ok,
                dev_ok: self.dev_ok,
            },
        );
        self.root.remove(exec_rel);
        res
    }

    /// Runs an already-present program of the root (`/sbin/ldconfig`, hooks).
    pub fn run_program(&mut self, argv: &[&[u8]], env: &[(&[u8], &[u8])]) -> Result<i32> {
        if !SUPPORTED {
            return Err(Error::Unsupported("programs inside the root only run on Linux".to_owned()));
        }
        let mut envp: Vec<Vec<u8>> = vec![b"PATH=/usr/sbin:/usr/bin:/sbin:/bin".to_vec()];
        for (k, v) in env {
            let mut kv = k.to_vec();
            kv.push(b'=');
            kv.extend_from_slice(v);
            envp.push(kv);
        }
        imp::spawn_chrooted(
            &self.root.dir,
            argv,
            &envp,
            imp::Namespaces {
                unshare: self.need_unshare,
                usermode: self.usermode,
                proc_ok: self.proc_ok,
                dev_ok: self.dev_ok,
            },
        )
    }
}

#[cfg(target_os = "linux")]
mod imp {
    use super::super::super::{Error, Result, fs};
    use core::ffi::c_char;

    pub(super) struct Namespaces {
        pub(super) unshare: bool,
        pub(super) usermode: bool,
        pub(super) proc_ok: bool,
        pub(super) dev_ok: bool,
    }

    pub(super) fn unshare_check() -> bool {
        // SAFETY: unshare(0) is a no-op probe; the forked child only calls
        // async-signal-safe functions before `_exit`.
        unsafe {
            if libc::unshare(0) < 0 {
                return false;
            }
            let pid = libc::fork();
            if pid == -1 {
                return false;
            }
            if pid == 0 {
                libc::_exit(if libc::unshare(libc::CLONE_NEWNS) < 0 { 1 } else { 0 });
            }
            wait(pid) == 0
        }
    }

    fn wait(pid: libc::pid_t) -> i32 {
        let mut status = 0;
        loop {
            // SAFETY: `pid` is our child; `status` is a valid out pointer.
            let r = unsafe { libc::waitpid(pid, &raw mut status, 0) };
            if r >= 0 {
                break;
            }
            if std::io::Error::last_os_error().raw_os_error() != Some(libc::EINTR) {
                return -1;
            }
        }
        if libc::WIFEXITED(status) {
            libc::WEXITSTATUS(status)
        } else {
            128 + libc::WTERMSIG(status)
        }
    }

    /// Async-signal-safe write of `data` to the file at `path` (NUL-terminated).
    ///
    /// # Safety
    /// `path` must be NUL-terminated.
    unsafe fn write_file(path: &[u8], data: &[u8]) -> bool {
        // SAFETY: caller guarantees `path` is NUL-terminated.
        let fd = unsafe { libc::open(path.as_ptr().cast::<c_char>(), libc::O_WRONLY) };
        if fd < 0 {
            return false;
        }
        // SAFETY: `fd` is open; `data` is valid for its length.
        let n = unsafe { libc::write(fd, data.as_ptr().cast(), data.len()) };
        // SAFETY: `fd` is open and closed once.
        unsafe { libc::close(fd) };
        n == data.len() as isize
    }

    unsafe fn panic_exit(msg: &[u8]) -> ! {
        // SAFETY: write(2) and _exit are async-signal-safe.
        unsafe {
            libc::write(2, msg.as_ptr().cast(), msg.len());
            libc::_exit(127)
        }
    }

    pub(super) fn spawn_chrooted(root: &[u8], argv: &[&[u8]], envp: &[Vec<u8>], ns: Namespaces) -> Result<i32> {
        // Everything the child needs is built before fork(): it must not allocate.
        let root_c = fs::zpath(root);
        let argv_c: Vec<Vec<u8>> = argv.iter().map(|a| fs::zpath(a)).collect();
        let mut argv_p: Vec<*const c_char> = argv_c.iter().map(|a| a.as_ptr().cast::<c_char>()).collect();
        argv_p.push(core::ptr::null());
        let envp_c: Vec<Vec<u8>> = envp.iter().map(|e| fs::zpath(e)).collect();
        let mut envp_p: Vec<*const c_char> = envp_c.iter().map(|e| e.as_ptr().cast::<c_char>()).collect();
        envp_p.push(core::ptr::null());
        // SAFETY: getuid/getgid have no preconditions.
        let (uid, gid) = unsafe { (libc::getuid(), libc::getgid()) };
        let uid_map = format!("0 {uid} 1");
        let gid_map = format!("0 {gid} 1");

        // SAFETY: the child branch only calls async-signal-safe libc functions
        // on buffers prepared above, then execve or _exit.
        let pid = unsafe { libc::fork() };
        if pid == -1 {
            return Err(Error::Io(format!("fork: {}", std::io::Error::last_os_error())));
        }
        if pid == 0 {
            // SAFETY: see above; every pointer refers to NUL-terminated data owned by the parent frame.
            unsafe {
                libc::umask(0o022);
                if libc::chdir(root_c.as_ptr().cast::<c_char>()) != 0 {
                    panic_exit(b"bun: chdir into root failed\n");
                }
                if ns.unshare {
                    if ns.usermode {
                        if libc::unshare(libc::CLONE_NEWNS | libc::CLONE_NEWUSER) != 0
                            || !write_file(b"/proc/self/uid_map\0", uid_map.as_bytes())
                            || !write_file(b"/proc/self/setgroups\0", b"deny")
                            || !write_file(b"/proc/self/gid_map\0", gid_map.as_bytes())
                        {
                            panic_exit(b"bun: unshare(CLONE_NEWUSER) failed; run as root or enable user namespaces\n");
                        }
                    } else if libc::unshare(libc::CLONE_NEWNS) != 0 {
                        // As root, continue with a plain chroot.
                    }
                    libc::mount(
                        c"none".as_ptr(),
                        c"/".as_ptr(),
                        core::ptr::null(),
                        libc::MS_REC | libc::MS_PRIVATE,
                        core::ptr::null(),
                    );
                    if !ns.proc_ok {
                        libc::mkdir(c"proc".as_ptr(), 0o755);
                        if libc::mount(
                            c"/proc".as_ptr(),
                            c"proc".as_ptr(),
                            core::ptr::null(),
                            libc::MS_BIND | libc::MS_REC,
                            core::ptr::null(),
                        ) < 0
                        {
                            libc::mount(c"proc".as_ptr(), c"proc".as_ptr(), c"proc".as_ptr(), 0, core::ptr::null());
                        }
                    }
                    if !ns.dev_ok {
                        libc::mkdir(c"dev".as_ptr(), 0o755);
                        libc::mount(
                            c"/dev".as_ptr(),
                            c"dev".as_ptr(),
                            core::ptr::null(),
                            libc::MS_BIND | libc::MS_REC | libc::MS_RDONLY,
                            core::ptr::null(),
                        );
                    }
                }
                if libc::chroot(c".".as_ptr()) != 0 {
                    panic_exit(b"bun: chroot failed (needs root or user namespaces)\n");
                }
                libc::chdir(c"/".as_ptr());
                libc::execve(argv_p[0], argv_p.as_ptr(), envp_p.as_ptr());
                panic_exit(b"bun: execve of script failed\n");
            }
        }
        Ok(wait(pid))
    }
}

#[cfg(not(target_os = "linux"))]
mod imp {
    use super::super::super::{Error, Result};

    pub(super) struct Namespaces {
        pub(super) unshare: bool,
        pub(super) usermode: bool,
        pub(super) proc_ok: bool,
        pub(super) dev_ok: bool,
    }

    pub(super) fn unshare_check() -> bool {
        false
    }

    pub(super) fn spawn_chrooted(_root: &[u8], _argv: &[&[u8]], _envp: &[Vec<u8>], ns: Namespaces) -> Result<i32> {
        let _ = (ns.unshare, ns.usermode, ns.proc_ok, ns.dev_ok);
        Err(Error::Unsupported("chroot is only available on Linux".to_owned()))
    }
}
