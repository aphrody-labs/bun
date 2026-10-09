//! Bun addition: `bun msvc sync` writes the resolved toolchain environment to a cache directory
//! (`env.json`, `env.cmd`, `env.ps1`, `env.sh`) and reuses it until an instance, toolset, SDK or
//! .NET Framework SDK changes: `env.json` records the modification time of the directories and
//! installer records whose content decides the resolution.
//!
//! The cache directory is `%LOCALAPPDATA%\bun\msvc\<key>`, with `key` from [`cache_key`], so a
//! script can find and validate it without running anything (`scripts/build.ts` does).

use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use crate::json::{Value, Writer};
use crate::toolchain::{self, instances_dir, var, Options, Toolchain};

/// Bumped when the `env.json` shape changes.
pub const FORMAT: u64 = 1;

fn sanitize(value: &str) -> String {
    value
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '.' { c.to_ascii_lowercase() } else { '_' })
        .collect()
}

/// `x64`, `x64-toolset-14.44`, `arm64-host-x64-sdk-10.0.26100`: the cache directory name of
/// `options` (only the options that were given appear).
pub fn cache_key(options: &Options) -> String {
    let arch = options
        .arch
        .as_deref()
        .and_then(toolchain::normalize_arch)
        .or_else(toolchain::host)
        .unwrap_or("x64");
    let mut key = arch.to_owned();
    if let Some(host) = options.host.as_deref().and_then(toolchain::normalize_arch) {
        key.push_str(&format!("-host-{host}"));
    }
    for (name, value) in [("instance", &options.instance), ("toolset", &options.toolset), ("sdk", &options.sdk)] {
        if let Some(value) = value {
            key.push_str(&format!("-{name}-{}", sanitize(value)));
        }
    }
    if options.spectre {
        key.push_str("-spectre");
    }
    key
}

/// `%LOCALAPPDATA%\bun\msvc`.
pub fn default_cache_root() -> PathBuf {
    var("LOCALAPPDATA")
        .map(PathBuf::from)
        .or_else(|| var("USERPROFILE").map(|home| PathBuf::from(home).join(r"AppData\Local")))
        .unwrap_or_else(std::env::temp_dir)
        .join(r"bun\msvc")
}

fn mtime_ms(path: &Path) -> Option<u64> {
    let modified = std::fs::metadata(path).ok()?.modified().ok()?;
    Some(modified.duration_since(UNIX_EPOCH).ok()?.as_millis() as u64)
}

/// The paths whose modification time decides whether the cache is still valid.
pub fn watched_paths(toolchain: &Toolchain) -> Vec<PathBuf> {
    let mut paths = vec![instances_dir()];
    if let Ok(entries) = instances_dir().read_dir() {
        let mut states: Vec<PathBuf> = entries
            .filter_map(Result::ok)
            .map(|entry| entry.path().join("state.json"))
            .filter(|path| path.is_file())
            .collect();
        states.sort();
        paths.extend(states);
    }
    let vs = &toolchain.instance.path;
    paths.push(vs.join(r"VC\Tools\MSVC"));
    paths.push(vs.join(r"VC\Auxiliary\Build"));
    paths.push(vs.join(r"VC\Tools"));
    if let Some(sdk) = &toolchain.sdk {
        paths.push(sdk.dir.join("Include"));
        paths.push(sdk.dir.join("Lib"));
    }
    if let Some(netfx) = &toolchain.netfx {
        paths.push(netfx.dir.clone());
    }
    paths
}

/// Result of [`sync`].
#[derive(Debug, Clone)]
pub struct Synced {
    pub dir: PathBuf,
    /// The cache was valid and nothing was written.
    pub hit: bool,
}

/// Whether `dir\env.json` exists, has the current format and matches the watched paths.
pub fn is_fresh(dir: &Path) -> bool {
    let Ok(text) = std::fs::read_to_string(dir.join("env.json")) else {
        return false;
    };
    let Some(json) = Value::parse(&text) else {
        return false;
    };
    if json.get("format").and_then(Value::as_u64) != Some(FORMAT) {
        return false;
    }
    let Some(fingerprint) = json.get("fingerprint") else {
        return false;
    };
    fingerprint.as_array().iter().all(|entry| {
        let Some(path) = entry.get("path").and_then(Value::as_str) else {
            return false;
        };
        let recorded = entry.get("mtimeMs").and_then(Value::as_u64);
        mtime_ms(Path::new(path)) == recorded
    }) && ["env.cmd", "env.ps1", "env.sh"].iter().all(|file| dir.join(file).is_file())
}

/// Resolves the toolchain for `options` and writes its environment under `cache_root`, unless
/// the cache is fresh (and `force` is not set).
pub fn sync(options: &Options, cache_root: &Path, force: bool) -> Result<Synced, String> {
    let dir = cache_root.join(cache_key(options));
    if !force && is_fresh(&dir) {
        return Ok(Synced { dir, hit: true });
    }
    let toolchain = toolchain::resolve(options)?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("{}: {e}", dir.display()))?;
    let files = [
        ("env.cmd", render_cmd(&toolchain)),
        ("env.ps1", render_ps1(&toolchain)),
        ("env.sh", render_sh(&toolchain)),
        // Last: a crash before this leaves a stale cache, not a fresh-looking partial one.
        ("env.json", render_json(&toolchain)),
    ];
    for (name, content) in files {
        let path = dir.join(name);
        let tmp = dir.join(format!("{name}.tmp"));
        std::fs::write(&tmp, content).map_err(|e| format!("{}: {e}", tmp.display()))?;
        std::fs::rename(&tmp, &path).map_err(|e| format!("{}: {e}", path.display()))?;
    }
    Ok(Synced { dir, hit: false })
}

fn path_strings(paths: &[PathBuf]) -> Vec<String> {
    paths.iter().map(|p| p.display().to_string()).collect()
}

/// `env.json`: what the toolchain sets, prepends and appends, plus the fingerprint.
pub fn render_json(toolchain: &Toolchain) -> String {
    let mut w = Writer::new();
    w.begin_object()
        .key("format")
        .num(FORMAT)
        .field("arch", toolchain.arch)
        .field("host", toolchain.host)
        .field("instance", &toolchain.instance.path.display().to_string())
        .field("instanceVersion", &toolchain.instance.version)
        .field("toolset", &toolchain.toolset.version)
        .key("sdk")
        .opt_str(toolchain.sdk.as_ref().map(|s| s.version.as_str()));
    w.key("set").begin_object();
    for (name, value) in toolchain.vars() {
        w.field(name, &value);
    }
    w.end_object();
    w.key("prepend").begin_object();
    for (name, prepend, _) in toolchain.lists() {
        w.key(name).begin_array();
        for path in path_strings(prepend) {
            w.str(&path);
        }
        w.end_array();
    }
    w.end_object();
    w.key("append").begin_object();
    for (name, _, append) in toolchain.lists() {
        if append.is_empty() {
            continue;
        }
        w.key(name).begin_array();
        for path in path_strings(append) {
            w.str(&path);
        }
        w.end_array();
    }
    w.end_object();
    w.key("fingerprint").begin_array();
    for path in watched_paths(toolchain) {
        w.begin_object().field("path", &path.display().to_string()).key("mtimeMs");
        match mtime_ms(&path) {
            Some(ms) => w.num(ms),
            None => w.null(),
        };
        w.end_object();
    }
    w.end_array();
    w.end_object();
    let mut text = w.finish();
    text.push('\n');
    text
}

/// `env.cmd`: `call env.cmd` in cmd.exe.
pub fn render_cmd(toolchain: &Toolchain) -> String {
    let mut out = String::from("@rem Generated by `bun msvc sync`.\r\n");
    for (name, prepend, append) in toolchain.lists() {
        let mut value = path_strings(prepend).join(";");
        value.push_str(&format!(";%{name}%"));
        for path in path_strings(append) {
            value.push(';');
            value.push_str(&path);
        }
        out.push_str(&format!("@set \"{name}={value}\"\r\n"));
    }
    for (name, value) in toolchain.vars() {
        out.push_str(&format!("@set \"{name}={value}\"\r\n"));
    }
    out
}

fn ps_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

/// `env.ps1`: `. env.ps1` in PowerShell.
pub fn render_ps1(toolchain: &Toolchain) -> String {
    let mut out = String::from("# Generated by `bun msvc sync`.\n");
    for (name, prepend, append) in toolchain.lists() {
        let list = |paths: &[PathBuf]| path_strings(paths).iter().map(|p| ps_quote(p)).collect::<Vec<_>>().join(", ");
        out.push_str(&format!(
            "$env:{name} = (@({}) + @(\"$env:{name}\" -split ';' | Where-Object {{ $_ }}) + @({})) -join ';'\n",
            list(prepend),
            list(append)
        ));
    }
    for (name, value) in toolchain.vars() {
        out.push_str(&format!("${{env:{name}}} = {}\n", ps_quote(&value)));
    }
    out
}

fn sh_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

/// `C:\a\b` → `/c/a/b` (MSYS2 / Git Bash / Cygwin-style mounts).
pub fn msys_path(path: &str) -> String {
    let bytes = path.as_bytes();
    let mut s = String::with_capacity(path.len() + 1);
    let rest = if bytes.len() >= 2 && bytes[1] == b':' && bytes[0].is_ascii_alphabetic() {
        s.push('/');
        s.push(bytes[0].to_ascii_lowercase() as char);
        &path[2..]
    } else {
        path
    };
    s.extend(rest.chars().map(|c| if c == '\\' { '/' } else { c }));
    s
}

/// `env.sh`: `. env.sh` in Git Bash / MSYS2 (`PATH` in POSIX form, the other lists as Windows
/// lists since only the MSVC tools read them).
pub fn render_sh(toolchain: &Toolchain) -> String {
    let mut out = String::from("# Generated by `bun msvc sync`.\n");
    for (name, prepend, append) in toolchain.lists() {
        if name == "PATH" {
            let join = |paths: &[PathBuf]| path_strings(paths).iter().map(|p| msys_path(p)).collect::<Vec<_>>().join(":");
            let mut line = format!("export PATH={}:\"$PATH\"", sh_quote(&join(prepend)));
            if !append.is_empty() {
                line.push_str(&format!(":{}", sh_quote(&join(append))));
            }
            out.push_str(&line);
            out.push('\n');
        } else {
            out.push_str(&format!(
                "export {name}={}\"${{{name}:+;${name}}}\"\n",
                sh_quote(&path_strings(prepend).join(";"))
            ));
        }
    }
    for (name, value) in toolchain.vars() {
        // `CommandPromptType`, `__DOTNET_ADD_64BIT`, ... are valid shell names; `(` is not.
        if name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
            out.push_str(&format!("export {name}={}\n", sh_quote(&value)));
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cache_keys() {
        let options = Options {
            arch: Some("amd64".into()),
            toolset: Some("14.44".into()),
            ..Options::default()
        };
        assert_eq!(cache_key(&options), "x64-toolset-14.44");
        let options = Options {
            arch: Some("aarch64".into()),
            host: Some("x64".into()),
            sdk: Some("10.0.26100".into()),
            instance: Some(r"C:\VS\18\BuildTools".into()),
            spectre: true,
            ..Options::default()
        };
        assert_eq!(cache_key(&options), "arm64-host-x64-instance-c__vs_18_buildtools-sdk-10.0.26100-spectre");
        assert_eq!(msys_path(r"C:\Program Files\x"), "/c/Program Files/x");
    }

    #[test]
    fn writes_then_reuses_the_cache() {
        if toolchain::resolve(&Options::default()).is_err() {
            return;
        }
        let root = std::env::temp_dir().join(format!("bun-msvc-sync-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        let options = Options::default();
        let first = sync(&options, &root, false).unwrap();
        assert!(!first.hit);
        let json = Value::parse(&std::fs::read_to_string(first.dir.join("env.json")).unwrap()).unwrap();
        assert!(json.at(&["set", "VCToolsInstallDir"]).is_some());
        assert!(!json.at(&["prepend", "INCLUDE"]).unwrap().as_array().is_empty());
        let second = sync(&options, &root, false).unwrap();
        assert!(second.hit);
        assert!(!sync(&options, &root, true).unwrap().hit);
        // A changed fingerprint invalidates it.
        let path = first.dir.join("env.json");
        let text = std::fs::read_to_string(&path).unwrap().replace("\"mtimeMs\":", "\"mtimeMs\":1");
        std::fs::write(&path, text).unwrap();
        assert!(!is_fresh(&first.dir));
        let _ = std::fs::remove_dir_all(&root);
    }
}
