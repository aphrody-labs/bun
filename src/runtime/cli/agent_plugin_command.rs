//! `bun agent-plugin`: the plugin for Claude Code, Codex and Antigravity/Gemini CLI that this executable carries
//! (`packages/bun-agent-plugin`, packed by `scripts/build/codegen.ts` into `<codegen>/agent-plugin.bin`, see
//! `packages/bun-agent-plugin/src/archive.ts` for the format). Extracted once per archive into the temp directory,
//! then its installer runs with this bun: `<bun> <dir>/package/bin/bun-agent-plugin.ts <args> --from <dir>/plugin`.
//! Dispatched before the runtime starts, like `bun mcp`.

use std::ffi::OsString;
use std::hash::Hasher;
use std::path::PathBuf;

use bun_core::{Global, ZBox};
use bun_spawn::process::sync as spawn_sync;
use bun_sys::{Dir, Fd, File, O};

const MAGIC: &[u8; 8] = b"BUNAGPL1";

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
            || bun_core::strings::split(path.as_bytes(), b"/")
                .any(|c| c.is_empty() || c == b"." || c == b"..")
        {
            return None;
        }
        out.push((path, data));
    }
    Some(out)
}

/// `<temp>/bun-agent-plugin/<hash of the archive>`, written whole before it is renamed into place.
fn extract(bytes: &[u8]) -> Result<PathBuf, String> {
    let mut hasher = std::hash::DefaultHasher::new();
    hasher.write(bytes);
    let base = std::env::temp_dir().join("bun-agent-plugin");
    let dir = base.join(format!("{:016x}", hasher.finish()));
    if dir
        .join("package")
        .join("bin")
        .join("bun-agent-plugin.ts")
        .is_file()
    {
        return Ok(dir);
    }
    let files = entries(bytes).ok_or("the embedded agent plugin archive is corrupt")?;
    let staging = base.join(format!(".{:016x}-{}", hasher.finish(), std::process::id()));
    let cwd = Dir::cwd();
    let _ = cwd.delete_tree(staging.as_os_str().as_encoded_bytes());
    for (path, data) in files {
        let target = staging.join(path);
        if let Some(parent) = target.parent() {
            cwd.make_path(parent.as_os_str().as_encoded_bytes())
                .map_err(|e| format!("{}: {e}", parent.display()))?;
        }
        File::openat(
            Fd::cwd(),
            target.as_os_str().as_encoded_bytes(),
            O::WRONLY | O::CREAT | O::TRUNC,
            0o644,
        )
        .and_then(|file| file.write_all(data))
        .map_err(|e| format!("{}: {e}", target.display()))?;
    }
    if bun_sys::rename(
        &ZBox::from_vec(staging.as_os_str().as_encoded_bytes().to_vec()),
        &ZBox::from_vec(dir.as_os_str().as_encoded_bytes().to_vec()),
    )
    .is_err()
    {
        // Another bun extracted the same archive first.
        let _ = cwd.delete_tree(staging.as_os_str().as_encoded_bytes());
        if !dir.is_dir() {
            return Err(format!("could not create {}", dir.display()));
        }
    }
    Ok(dir)
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
