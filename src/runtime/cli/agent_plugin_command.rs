//! `bun agent-plugin`: the plugin for Claude Code, Codex and Antigravity/Gemini CLI that this executable carries
//! (`packages/bun-agent-plugin`, packed by `scripts/build/codegen.ts` into `<codegen>/agent-plugin.bin`, see
//! `packages/bun-agent-plugin/src/archive.ts` for the format). Extracted once per archive into the temp directory,
//! then its installer runs with this bun: `<bun> <dir>/package/bin/bun-agent-plugin.ts <args> --from <dir>/plugin`.
//! Dispatched before the runtime starts, like `bun mcp`.

use std::ffi::OsString;
use std::hash::Hasher;
use std::path::{Path, PathBuf};

use bun_core::{Global, ZBox};
use bun_spawn::process::sync as spawn_sync;
use bun_sys::{Dir, O};

const MAGIC: &[u8; 8] = b"BUNAGPL1";
const INSTALLER: &str = "package/bin/bun-agent-plugin.ts";

pub(crate) enum Invocation {
    Bun,
}

impl Invocation {
    #[inline]
    pub(crate) fn from_argv(argv0: &[u8], first_arg: Option<&[u8]>) -> Option<Self> {
        let name = bun_paths::resolve_path::basename(argv0);
        let name = name.strip_suffix(b".exe").unwrap_or(name);
        (first_arg == Some(b"agent-plugin") && super::msvc_command::is_bun_argv0(name))
            .then_some(Self::Bun)
    }
}

fn archive() -> &'static [u8] {
    bun_zstd::embed_compressed!(("codegen/", "agent-plugin.bin"), {
        use bun_sys::{Fd, File};
        static COPY: std::sync::OnceLock<Vec<u8>> = std::sync::OnceLock::new();
        COPY.get_or_init(|| {
            let codegen =
                std::str::from_utf8(bun_core::build_options::CODEGEN_PATH).unwrap_or_default();
            let path = std::path::Path::new(codegen).join("agent-plugin.bin");
            File::openat(Fd::cwd(), path.as_os_str().as_encoded_bytes(), O::RDONLY, 0)
                .and_then(|file| file.read_to_end())
                .unwrap_or_else(|e| {
                    super::msvc_command::fail(format_args!(
                        "{}: {e} (run the codegen step of the build)",
                        path.display()
                    ))
                })
        })
    })
}

fn entries(bytes: &[u8]) -> Option<Vec<(&str, &[u8])>> {
    let u32_at = |o: usize| {
        bytes
            .get(o..o + 4)
            .map(|b| u32::from_le_bytes([b[0], b[1], b[2], b[3]]) as usize)
    };
    if bytes.get(..8)? != MAGIC {
        return None;
    }
    let count = u32_at(8)?;
    if count > 100_000 || count > bytes.len().saturating_sub(12) / 8 {
        return None;
    }
    let mut out = Vec::with_capacity(count);
    let mut o = 12;
    for _ in 0..count {
        let len = u32_at(o)?;
        let path = std::str::from_utf8(bytes.get(o + 4..o + 4 + len)?).ok()?;
        o += 4 + len;
        let len = u32_at(o)?;
        let data = bytes.get(o + 4..o + 4 + len)?;
        o += 4 + len;
        if path.is_empty()
            || path.starts_with('/')
            || path.contains(['\\', ':', '\0'])
            || bun_core::strings::split(path.as_bytes(), b"/")
                .any(|c| c.is_empty() || c == b"." || c == b"..")
        {
            return None;
        }
        out.push((path, data));
    }
    (o == bytes.len() && out.iter().any(|(path, _)| *path == INSTALLER)).then_some(out)
}

fn child_dir(parent: &Dir, name: &str, full: &Path) -> Result<Dir, String> {
    let zname = ZBox::from_vec(name.as_bytes().to_vec());
    let inspect = || {
        bun_sys::lstat(&ZBox::from_vec(
            full.as_os_str().as_encoded_bytes().to_vec(),
        ))
    };
    match inspect() {
        Ok(stat) if (stat.st_mode as u32 & 0xf000) == 0x4000 => {}
        Ok(_) => {
            return Err(format!(
                "plugin cache refuses a symbolic link or non-directory: {}",
                full.display()
            ));
        }
        Err(error) if error.get_errno() == bun_sys::E::ENOENT => {
            match bun_sys::mkdirat(parent.fd(), &zname, 0o700) {
                Ok(()) => {}
                Err(error) if error.get_errno() == bun_sys::E::EEXIST => {}
                Err(error) => return Err(format!("{}: {error}", full.display())),
            }
            let stat = inspect().map_err(|error| format!("{}: {error}", full.display()))?;
            if (stat.st_mode as u32 & 0xf000) != 0x4000 {
                return Err(format!(
                    "plugin cache refuses a symbolic link or non-directory: {}",
                    full.display()
                ));
            }
        }
        Err(error) => return Err(format!("{}: {error}", full.display())),
    }
    #[cfg(windows)]
    {
        parent
            .open_dir(
                name.as_bytes(),
                bun_sys::OpenDirOptions {
                    no_follow: true,
                    ..Default::default()
                },
            )
            .map_err(|error| error.to_string())
    }
    #[cfg(not(windows))]
    {
        bun_sys::openat(
            parent.fd(),
            &zname,
            O::DIRECTORY | O::NOFOLLOW | O::CLOEXEC | O::RDONLY,
            0,
        )
        .map(Dir::from_fd)
        .map_err(|error| error.to_string())
    }
}

fn parent_dir(root: &Path, rooted: &Dir, path: &str) -> Result<(Dir, String), String> {
    let mut full = root.to_path_buf();
    let mut directory = Dir::from_fd(bun_sys::dup(rooted.fd()).map_err(|error| error.to_string())?);
    let mut components = path.split('/').peekable();
    while let Some(component) = components.next() {
        if components.peek().is_none() {
            return Ok((directory, component.to_owned()));
        }
        full.push(component);
        directory = child_dir(&directory, component, &full)?;
    }
    Err("invalid plugin archive path".into())
}

fn complete(root: &Path, rooted: &Dir, files: &[(&str, &[u8])]) -> bool {
    files.iter().all(|(path, bytes)| {
        let Ok((parent, name)) = parent_dir(root, rooted, path) else {
            return false;
        };
        let Ok(link_stat) = bun_sys::lstat(&ZBox::from_vec(
            root.join(path).as_os_str().as_encoded_bytes().to_vec(),
        )) else {
            return false;
        };
        if !bun_sys::is_regular_file(link_stat.st_mode as _) {
            return false;
        }
        let Ok(file) = parent.open_file(name.as_bytes(), O::RDONLY | O::NOFOLLOW | O::CLOEXEC, 0)
        else {
            return false;
        };
        let Ok(stat) = bun_sys::fstat(file.fd()) else {
            return false;
        };
        if !bun_sys::is_regular_file(stat.st_mode as _) || stat.st_size as usize != bytes.len() {
            return false;
        }
        let mut contents = vec![0; bytes.len()];
        let mut extra = [0; 1];
        file.read_all(&mut contents)
            .is_ok_and(|length| length == bytes.len())
            && contents == *bytes
            && file.read(&mut extra).is_ok_and(|length| length == 0)
    })
}

/// Only archive-owned files are atomically published; the installer is published last.
fn extract(bytes: &[u8]) -> Result<PathBuf, String> {
    let files = entries(bytes).ok_or("the embedded agent plugin archive is corrupt")?;
    let mut hasher = std::hash::DefaultHasher::new();
    hasher.write(bytes);
    let temp = std::env::temp_dir();
    let temp_handle = Dir::from_fd(
        bun_sys::open_dir_absolute(temp.as_os_str().as_encoded_bytes())
            .map_err(|error| error.to_string())?,
    );
    let base = temp.join("bun-agent-plugin");
    let base_handle = child_dir(&temp_handle, "bun-agent-plugin", &base)?;
    let dir = base.join(format!("{:016x}", hasher.finish()));
    let cache_handle = child_dir(&base_handle, &format!("{:016x}", hasher.finish()), &dir)?;
    if complete(&dir, &cache_handle, &files) {
        return Ok(dir);
    }
    static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_nanos();
    let staging = base.join(format!(
        ".{:016x}-{}-{nonce}-{}",
        hasher.finish(),
        std::process::id(),
        NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
    ));
    let cwd = Dir::cwd();
    bun_sys::mkdir(
        &ZBox::from_vec(staging.as_os_str().as_encoded_bytes().to_vec()),
        0o700,
    )
    .map_err(|error| error.to_string())?;
    let staging_handle = child_dir(
        &base_handle,
        staging
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or("invalid staging name")?,
        &staging,
    )?;
    let result = (|| {
        for (path, data) in &files {
            let (parent, name) = parent_dir(&staging, &staging_handle, path)?;
            parent
                .open_file(
                    name.as_bytes(),
                    O::WRONLY | O::CREAT | O::EXCL | O::NOFOLLOW,
                    0o644,
                )
                .and_then(|file| file.write_all(data))
                .map_err(|e| format!("{path}: {e}"))?;
        }
        if complete(&dir, &cache_handle, &files) {
            return Ok(dir.clone());
        }
        for (path, _) in files
            .iter()
            .filter(|(path, _)| *path != INSTALLER)
            .chain(files.iter().filter(|(path, _)| *path == INSTALLER))
        {
            let (source, source_name) = parent_dir(&staging, &staging_handle, path)?;
            let (target, target_name) = parent_dir(&dir, &cache_handle, path)?;
            if let Err(error) = bun_sys::renameat(
                source.fd(),
                &ZBox::from_vec(source_name.into_bytes()),
                target.fd(),
                &ZBox::from_vec(target_name.into_bytes()),
            ) {
                if complete(&dir, &cache_handle, &files) {
                    return Ok(dir.clone());
                }
                return Err(format!("could not repair plugin cache {path}: {error}"));
            }
        }
        if !complete(&dir, &cache_handle, &files) {
            return Err(format!(
                "plugin cache remains incomplete: {}",
                dir.display()
            ));
        }
        Ok(dir.clone())
    })();
    drop(staging_handle);
    let _ = cwd.delete_tree(staging.as_os_str().as_encoded_bytes());
    result
}

#[cold]
pub(crate) fn exec(Invocation::Bun: Invocation) -> ! {
    let dir = extract(archive()).unwrap_or_else(|e| super::msvc_command::fail(format_args!("{e}")));
    let args: Vec<OsString> = bun_core::os_args().into_iter().skip(2).collect();
    let executable = std::env::current_exe().unwrap_or_else(|_| PathBuf::from("bun"));
    let installer = dir.join("package").join("bin").join("bun-agent-plugin.ts");
    let mut argv: Vec<Box<[u8]>> = vec![
        executable.as_os_str().as_encoded_bytes().into(),
        installer.as_os_str().as_encoded_bytes().into(),
    ];
    argv.extend(args.iter().map(|arg| Box::from(arg.as_encoded_bytes())));
    let explicit = args.iter().any(|a| {
        let a = a.as_encoded_bytes();
        a == b"--from" || a == b"--root" || a.starts_with(b"--from=") || a.starts_with(b"--root=")
    });
    if !explicit {
        argv.push(Box::from(&b"--from"[..]));
        argv.push(dir.join("plugin").as_os_str().as_encoded_bytes().into());
    }
    let mut environment: Vec<ZBox> = std::env::vars_os()
        .filter_map(|(key, value)| {
            let key = key.as_encoded_bytes();
            let overridden = if cfg!(windows) {
                key.eq_ignore_ascii_case(b"BUN_BE_BUN")
            } else {
                key == b"BUN_BE_BUN"
            };
            if overridden {
                return None;
            }
            let mut entry = key.to_vec();
            entry.push(b'=');
            entry.extend_from_slice(value.as_encoded_bytes());
            Some(ZBox::from_vec(entry))
        })
        .collect();
    environment.push(ZBox::from_vec(b"BUN_BE_BUN=1".to_vec()));
    // Both arrays remain alive until the synchronous child has exited.
    let mut envp: Vec<*const core::ffi::c_char> =
        environment.iter().map(|entry| entry.as_ptr()).collect();
    envp.push(core::ptr::null());
    let result = spawn_sync::spawn(&spawn_sync::Options {
        argv,
        envp: Some(envp.as_ptr()),
        stdin: spawn_sync::SyncStdio::Inherit,
        stdout: spawn_sync::SyncStdio::Inherit,
        stderr: spawn_sync::SyncStdio::Inherit,
        #[cfg(windows)]
        windows: spawn_sync::WindowsOptions {
            loop_: bun_event_loop::EventLoopHandle::init_mini(
                bun_event_loop::MiniEventLoop::init_global(None, None),
            ),
            ..Default::default()
        },
        ..Default::default()
    })
    .unwrap_or_else(|e| {
        super::msvc_command::fail(format_args!(
            "could not run the agent plugin installer: {e}"
        ))
    })
    .unwrap_or_else(|e| {
        super::msvc_command::fail(format_args!(
            "could not run the agent plugin installer: {e}"
        ))
    });
    let code = match result.status {
        bun_spawn::process::Status::Exited(status) => {
            #[cfg(windows)]
            {
                status.raw
            }
            #[cfg(not(windows))]
            {
                u32::from(status.code)
            }
        }
        _ => 1,
    };
    Global::exit(code);
}
