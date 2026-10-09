//! `bun agent-plugin`: the plugin for Claude Code, Codex and Antigravity/Gemini CLI that this executable carries
//! (`packages/bun-agent-plugin`, packed by `scripts/build/codegen.ts` into `<codegen>/agent-plugin.bin`, see
//! `packages/bun-agent-plugin/src/archive.ts` for the format). Extracted once per archive into the temp directory,
//! then its installer runs with this bun: `<bun> <dir>/package/bin/bun-agent-plugin.ts <args> --from <dir>/plugin`.
//! Dispatched before the runtime starts, like `bun mcp`.

use std::ffi::OsString;
use std::hash::Hasher;
use std::path::PathBuf;

use bun_core::Global;

const MAGIC: &[u8; 8] = b"BUNAGPL1";

pub(crate) enum Invocation {
    Bun,
}

impl Invocation {
    #[inline]
    pub(crate) fn from_argv(argv0: &[u8], first_arg: Option<&[u8]>) -> Option<Self> {
        let name = bun_paths::resolve_path::basename(argv0);
        let name = name.strip_suffix(b".exe").unwrap_or(name);
        (first_arg == Some(b"agent-plugin") && super::msvc_command::is_bun_argv0(name)).then_some(Self::Bun)
    }
}

fn archive() -> &'static [u8] {
    bun_zstd::embed_compressed!(("codegen/", "agent-plugin.bin"), {
        static COPY: std::sync::OnceLock<Vec<u8>> = std::sync::OnceLock::new();
        COPY.get_or_init(|| {
            let codegen = std::str::from_utf8(bun_core::build_options::CODEGEN_PATH).unwrap_or_default();
            let path = std::path::Path::new(codegen).join("agent-plugin.bin");
            std::fs::read(&path).unwrap_or_else(|e| {
                super::msvc_command::fail(format_args!("{}: {e} (run the codegen step of the build)", path.display()))
            })
        })
    })
}

fn entries(bytes: &[u8]) -> Option<Vec<(&str, &[u8])>> {
    let u32_at = |o: usize| bytes.get(o..o + 4).map(|b| u32::from_le_bytes([b[0], b[1], b[2], b[3]]) as usize);
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
        if path.is_empty() || path.starts_with('/') || path.split('/').any(|c| c.is_empty() || c == "." || c == "..") {
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
    if dir.join("package").join("bin").join("bun-agent-plugin.ts").is_file() {
        return Ok(dir);
    }
    let files = entries(bytes).ok_or("the embedded agent plugin archive is corrupt")?;
    let staging = base.join(format!(".{:016x}-{}", hasher.finish(), std::process::id()));
    let _ = std::fs::remove_dir_all(&staging);
    for (path, data) in files {
        let target = staging.join(path);
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent).map_err(|e| format!("{}: {e}", parent.display()))?;
        }
        std::fs::write(&target, data).map_err(|e| format!("{}: {e}", target.display()))?;
    }
    if std::fs::rename(&staging, &dir).is_err() {
        // Another bun extracted the same archive first.
        let _ = std::fs::remove_dir_all(&staging);
        if !dir.is_dir() {
            return Err(format!("could not create {}", dir.display()));
        }
    }
    Ok(dir)
}

#[cold]
pub(crate) fn exec(Invocation::Bun: Invocation) -> ! {
    let dir = extract(archive()).unwrap_or_else(|e| super::msvc_command::fail(format_args!("{e}")));
    let args: Vec<OsString> = std::env::args_os().skip(2).collect();
    let mut command = std::process::Command::new(
        bun_core::self_exe_path()
            .map(|p| PathBuf::from(String::from_utf8_lossy(p.as_bytes()).into_owned()))
            .unwrap_or_else(|_| PathBuf::from("bun")),
    );
    command.arg(dir.join("package").join("bin").join("bun-agent-plugin.ts")).args(&args);
    let explicit = args.iter().any(|a| {
        let a = a.to_string_lossy();
        ["--from", "--root"].iter().any(|f| a == *f || a.starts_with(&format!("{f}=")))
    });
    if !explicit {
        command.arg("--from").arg(dir.join("plugin"));
    }
    command.env("BUN_BE_BUN", "1");
    let code = match command.status() {
        Ok(status) => status.code().unwrap_or(1),
        Err(e) => super::msvc_command::fail(format_args!("could not run the agent plugin installer: {e}")),
    };
    Global::exit(code as u32);
}
