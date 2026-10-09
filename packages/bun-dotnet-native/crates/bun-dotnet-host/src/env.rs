// SPDX-License-Identifier: MIT
//! The resolved .NET environment (`DOTNET_ROOT`, `DOTNET_HOST_PATH`, `PATH`, chosen SDK),
//! cached per `global.json` and recomputed when its fingerprint changes: environment
//! variables, registered install locations, the layout directories of every candidate root and
//! the `global.json` itself.

use std::fmt::Write as _;
use std::path::{Path, PathBuf};

use serde_json::{Value, json};

use crate::inventory::{self, MUXER_NAME};
use crate::select;
use crate::{Error, Result, env_path, locate};

#[derive(Debug, Clone)]
pub struct Snapshot {
    pub dotnet_root: PathBuf,
    pub source: String,
    pub hostfxr: PathBuf,
    pub muxer: Option<PathBuf>,
    pub arch: Option<String>,
    pub global_json: Option<PathBuf>,
    pub sdk: Option<(String, PathBuf)>,
    pub sdk_error: Option<String>,
    pub fingerprint: String,
}

impl Snapshot {
    /// Variables to set; `PATH` gets [`Snapshot::dotnet_root`] prepended by the renderers.
    pub fn vars(&self) -> Vec<(&'static str, String)> {
        let mut vars = vec![("DOTNET_ROOT", self.dotnet_root.to_string_lossy().into_owned())];
        if let Some(muxer) = &self.muxer {
            vars.push(("DOTNET_HOST_PATH", muxer.to_string_lossy().into_owned()));
        }
        vars
    }

    pub fn to_json(&self) -> Value {
        json!({
            "dotnetRoot": self.dotnet_root,
            "source": self.source,
            "hostfxr": self.hostfxr,
            "muxer": self.muxer,
            "arch": self.arch,
            "globalJson": self.global_json,
            "sdk": self.sdk.as_ref().map(|(version, path)| json!({ "version": version, "path": path })),
            "sdkError": self.sdk_error,
            "fingerprint": self.fingerprint,
            "env": self.vars().into_iter().map(|(key, value)| (key.to_owned(), Value::from(value))).collect::<serde_json::Map<_, _>>(),
            "pathPrepend": self.dotnet_root,
        })
    }

    fn from_json(value: &Value) -> Option<Self> {
        let path = |key: &str| value.get(key).and_then(Value::as_str).map(PathBuf::from);
        let text = |key: &str| value.get(key).and_then(Value::as_str).map(str::to_owned);
        Some(Self {
            dotnet_root: path("dotnetRoot")?,
            source: text("source")?,
            hostfxr: path("hostfxr")?,
            muxer: path("muxer"),
            arch: text("arch"),
            global_json: path("globalJson"),
            sdk: value.get("sdk").and_then(|sdk| {
                Some((
                    sdk.get("version")?.as_str()?.to_owned(),
                    PathBuf::from(sdk.get("path")?.as_str()?),
                ))
            }),
            sdk_error: text("sdkError"),
            fingerprint: text("fingerprint")?,
        })
    }
}

/// Directory of the cached snapshots: `BUN_DOTNET_CACHE_DIR`, else the user cache directory.
pub fn cache_dir() -> Option<PathBuf> {
    if let Some(dir) = env_path("BUN_DOTNET_CACHE_DIR") {
        return Some(dir);
    }
    let base = if cfg!(windows) {
        env_path("LOCALAPPDATA")
    } else if cfg!(target_os = "macos") {
        env_path("HOME").map(|home| home.join("Library").join("Caches"))
    } else {
        env_path("XDG_CACHE_HOME").or_else(|| env_path("HOME").map(|home| home.join(".cache")))
    }?;
    Some(base.join("bun").join("dotnet"))
}

fn fnv(text: &str) -> String {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in text.bytes() {
        hash ^= u64::from(byte);
        hash = hash.wrapping_mul(0x0100_0000_01b3);
    }
    format!("{hash:016x}")
}

fn stamp(path: &Path, out: &mut String) {
    let modified = std::fs::metadata(path)
        .and_then(|meta| meta.modified())
        .ok()
        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
        .map_or(0, |since| since.as_nanos());
    let _ = writeln!(out, "{}={modified}", path.display());
}

const ENV_INPUTS: [&str; 12] = [
    "DOTNET_ROOT",
    "DOTNET_ROOT_X64",
    "DOTNET_ROOT_X86",
    "DOTNET_ROOT_ARM64",
    "DOTNET_ROOT(x86)",
    "DOTNET_INSTALL_DIR",
    "BUN_DOTNET_HOSTFXR",
    "BUN_DOTNET_NETHOST",
    "DOTNET_ROLL_FORWARD",
    "DOTNET_ROLL_FORWARD_TO_PRERELEASE",
    "DOTNET_CLI_HOME",
    "PATH",
];

/// What the snapshot depends on, hashed.
pub fn fingerprint(global_json: Option<&Path>) -> String {
    let mut text = String::new();
    for name in ENV_INPUTS {
        let _ = writeln!(text, "{name}={}", std::env::var_os(name).unwrap_or_default().to_string_lossy());
    }
    for (source, root) in inventory::candidate_roots() {
        let _ = writeln!(text, "{source}");
        for dir in inventory::layout_dirs(&root) {
            stamp(&dir, &mut text);
        }
    }
    if let Some(path) = global_json {
        stamp(path, &mut text);
    }
    fnv(&text)
}

/// Resolves the environment for `cwd` now.
pub fn compute(cwd: &Path) -> Result<Snapshot> {
    let location = locate(None)?;
    let global_json = select::find_global_json(cwd);
    let resolution = select::resolve_sdk(&location.dotnet_root, cwd);
    let muxer = location.dotnet_root.join(MUXER_NAME);
    Ok(Snapshot {
        arch: inventory::binary_arch(if muxer.is_file() { &muxer } else { &location.hostfxr }).map(str::to_owned),
        muxer: muxer.is_file().then_some(muxer),
        source: location.source.as_str().to_owned(),
        hostfxr: location.hostfxr,
        sdk: resolution
            .selected
            .map(|component| (component.version.to_string(), component.path)),
        sdk_error: resolution.error,
        fingerprint: fingerprint(global_json.as_deref()),
        global_json,
        dotnet_root: location.dotnet_root,
    })
}

fn cache_file(global_json: Option<&Path>) -> Option<PathBuf> {
    let key = global_json.map_or_else(String::new, |path| path.to_string_lossy().into_owned());
    Some(cache_dir()?.join(format!("env-{}.json", fnv(&key))))
}

/// Where the snapshot came from.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Origin {
    Cache,
    Computed,
}

/// The cached snapshot for `cwd` when its fingerprint still matches, else a new one (written
/// back). `refresh` skips the cache.
pub fn load(cwd: &Path, refresh: bool) -> Result<(Snapshot, Origin)> {
    let global_json = select::find_global_json(cwd);
    let file = cache_file(global_json.as_deref());
    if !refresh
        && let Some(file) = &file
        && let Ok(bytes) = std::fs::read(file)
        && let Ok(value) = serde_json::from_slice::<Value>(&bytes)
        && let Some(snapshot) = Snapshot::from_json(&value)
        && snapshot.fingerprint == fingerprint(global_json.as_deref())
    {
        return Ok((snapshot, Origin::Cache));
    }
    let snapshot = compute(cwd)?;
    if let Some(file) = file {
        let write = || -> std::io::Result<()> {
            std::fs::create_dir_all(file.parent().unwrap_or(Path::new(".")))?;
            let temporary = file.with_extension(format!("json.{}", std::process::id()));
            std::fs::write(&temporary, serde_json::to_vec_pretty(&snapshot.to_json()).unwrap_or_default())?;
            std::fs::rename(&temporary, &file)
        };
        write().map_err(|error| Error::new(format!("cannot write {}: {error}", file.display())))?;
    }
    Ok((snapshot, Origin::Computed))
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Shell {
    Cmd,
    PowerShell,
    Sh,
    Json,
}

impl Shell {
    pub fn parse(name: &str) -> Option<Self> {
        match name.to_ascii_lowercase().as_str() {
            "cmd" | "bat" => Some(Self::Cmd),
            "ps1" | "pwsh" | "powershell" => Some(Self::PowerShell),
            "sh" | "bash" | "zsh" | "posix" => Some(Self::Sh),
            "json" => Some(Self::Json),
            _ => None,
        }
    }

    pub fn default_for_platform() -> Self {
        if cfg!(windows) { Self::PowerShell } else { Self::Sh }
    }
}

fn sh_quote(text: &str) -> String {
    format!("'{}'", text.replace('\'', r"'\''"))
}

fn ps_quote(text: &str) -> String {
    format!("'{}'", text.replace('\'', "''"))
}

/// The snapshot as commands for `shell` (or JSON).
pub fn render(snapshot: &Snapshot, shell: Shell) -> String {
    let root = snapshot.dotnet_root.to_string_lossy();
    let mut out = String::new();
    match shell {
        Shell::Json => {
            out = serde_json::to_string_pretty(&snapshot.to_json()).unwrap_or_default();
            out.push('\n');
        }
        Shell::Cmd => {
            for (key, value) in snapshot.vars() {
                let _ = writeln!(out, "set \"{key}={value}\"");
            }
            let _ = writeln!(out, "set \"PATH={root};%PATH%\"");
        }
        Shell::PowerShell => {
            for (key, value) in snapshot.vars() {
                let _ = writeln!(out, "$env:{key} = {}", ps_quote(&value));
            }
            let separator = if cfg!(windows) { ";" } else { ":" };
            let _ = writeln!(
                out,
                "$env:PATH = {} + $env:PATH",
                ps_quote(&format!("{root}{separator}"))
            );
        }
        Shell::Sh => {
            for (key, value) in snapshot.vars() {
                let _ = writeln!(out, "export {key}={}", sh_quote(&value));
            }
            let _ = writeln!(out, "export PATH={}:\"$PATH\"", sh_quote(&root));
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn snapshot() -> Snapshot {
        Snapshot {
            dotnet_root: PathBuf::from("/opt/it's dotnet"),
            source: "DOTNET_ROOT".into(),
            hostfxr: PathBuf::from("/opt/it's dotnet/host/fxr/10.0.0/libhostfxr.so"),
            muxer: None,
            arch: Some("x64".into()),
            global_json: None,
            sdk: Some(("10.0.100".into(), PathBuf::from("/opt/sdk/10.0.100"))),
            sdk_error: None,
            fingerprint: "abc".into(),
        }
    }

    #[test]
    fn renders_shells() {
        let snapshot = snapshot();
        assert_eq!(
            render(&snapshot, Shell::Sh),
            "export DOTNET_ROOT='/opt/it'\\''s dotnet'\nexport PATH='/opt/it'\\''s dotnet':\"$PATH\"\n"
        );
        assert!(render(&snapshot, Shell::PowerShell).starts_with("$env:DOTNET_ROOT = '/opt/it''s dotnet'\n"));
        assert!(render(&snapshot, Shell::Cmd).starts_with("set \"DOTNET_ROOT=/opt/it's dotnet\"\n"));
        let json: Value = serde_json::from_str(&render(&snapshot, Shell::Json)).unwrap();
        assert_eq!(Snapshot::from_json(&json).unwrap().sdk.unwrap().0, "10.0.100");
    }
}
