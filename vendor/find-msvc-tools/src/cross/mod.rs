//! A Windows MSVC sysroot for cross compilation from Linux and macOS: the MSVC CRT and the Windows
//! SDK headers and import libraries, downloaded from the official Visual Studio manifests (sha256
//! verified), extracted from their VSIX, MSI and cabinet payloads, and laid out like a Visual Studio
//! install (`VC/Tools/MSVC/<v>`, `Windows Kits/10`) so `clang-cl /winsysroot` also accepts it. On
//! case-sensitive file systems the header and library names are aliased to the spellings sources
//! and linkers use. `env` turns it into the cargo/cc-rs environment for `*-pc-windows-msvc`.

pub mod cab;
pub mod cfb;
pub mod cli;
pub mod env;
#[cfg(test)]
mod fixture;
pub mod inflate;
pub mod manifest;
pub mod msi;
pub mod sha256;
pub mod zip;

use std::collections::{HashMap, HashSet};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use crate::json::{Value, Writer};
use manifest::{Payload, Plan, Selection};

/// Downloads a URL. bun passes its HTTP client; [`StdFetch`] serves paths, `file://` and `http://`.
pub trait Fetch {
    fn get(&self, url: &str) -> Result<Vec<u8>, String>;
}

/// Local paths, `file://` URLs and plain `http://` (a local mirror); `https://` needs bun's client.
pub struct StdFetch;

impl Fetch for StdFetch {
    fn get(&self, url: &str) -> Result<Vec<u8>, String> {
        if let Some(path) = url.strip_prefix("file://") {
            return std::fs::read(path).map_err(|e| format!("{url}: {e}"));
        }
        if url.starts_with("http://") {
            return http_get(url, 10);
        }
        if url.contains("://") {
            return Err(format!("{url}: only http:// and file:// are supported here (use `bun msvc`)"));
        }
        std::fs::read(url).map_err(|e| format!("{url}: {e}"))
    }
}

fn http_get(url: &str, redirects: u32) -> Result<Vec<u8>, String> {
    let rest = &url["http://".len()..];
    let (authority, path) = rest.find('/').map_or((rest, "/"), |i| (&rest[..i], &rest[i..]));
    let address = if authority.contains(':') { authority.to_owned() } else { format!("{authority}:80") };
    let mut stream = std::net::TcpStream::connect(&address).map_err(|e| format!("{url}: {e}"))?;
    write!(stream, "GET {path} HTTP/1.1\r\nHost: {authority}\r\nUser-Agent: bun-msvc\r\nConnection: close\r\n\r\n")
        .map_err(|e| format!("{url}: {e}"))?;
    let mut response = Vec::new();
    stream.read_to_end(&mut response).map_err(|e| format!("{url}: {e}"))?;
    let end = response.windows(4).position(|w| w == b"\r\n\r\n").ok_or_else(|| format!("{url}: malformed response"))?;
    let head = String::from_utf8_lossy(&response[..end]).into_owned();
    let body = &response[end + 4..];
    let mut lines = head.split("\r\n");
    let status: u16 = lines.next().and_then(|l| l.split(' ').nth(1)).and_then(|s| s.parse().ok()).unwrap_or(0);
    let headers: Vec<(String, String)> = lines
        .filter_map(|l| l.split_once(':'))
        .map(|(k, v)| (k.trim().to_ascii_lowercase(), v.trim().to_owned()))
        .collect();
    let header = |name: &str| headers.iter().find(|(k, _)| k == name).map(|(_, v)| v.as_str());
    if (300..400).contains(&status) {
        let location = header("location").ok_or_else(|| format!("{url}: redirect without location"))?;
        if redirects == 0 {
            return Err(format!("{url}: too many redirects"));
        }
        let next = if location.starts_with('/') { format!("http://{authority}{location}") } else { location.to_owned() };
        return if next.starts_with("http://") { http_get(&next, redirects - 1) } else { StdFetch.get(&next) };
    }
    if status != 200 {
        return Err(format!("{url}: HTTP {status}"));
    }
    if header("transfer-encoding").is_some_and(|v| v.eq_ignore_ascii_case("chunked")) {
        let mut out = Vec::new();
        let mut at = 0;
        loop {
            let line_end = body[at..].windows(2).position(|w| w == b"\r\n").ok_or("truncated chunked body")? + at;
            let size_text = String::from_utf8_lossy(&body[at..line_end]);
            let size = usize::from_str_radix(size_text.split(';').next().unwrap_or("").trim(), 16)
                .map_err(|_| format!("{url}: bad chunk size"))?;
            at = line_end + 2;
            if size == 0 {
                break;
            }
            out.extend_from_slice(body.get(at..at + size).ok_or("truncated chunked body")?);
            at += size + 2;
        }
        return Ok(out);
    }
    Ok(body.to_vec())
}

/// `$XDG_CACHE_HOME/bun/msvc` (`~/.cache/bun/msvc`), or `%LOCALAPPDATA%\bun\msvc\cross` on Windows.
pub fn default_cache_dir() -> PathBuf {
    let var = |name: &str| std::env::var_os(name).filter(|v| !v.is_empty()).map(PathBuf::from);
    if cfg!(windows) {
        return var("LOCALAPPDATA").unwrap_or_else(std::env::temp_dir).join("bun").join("msvc").join("cross");
    }
    var("XDG_CACHE_HOME")
        .or_else(|| var("HOME").map(|home| home.join(".cache")))
        .unwrap_or_else(std::env::temp_dir)
        .join("bun")
        .join("msvc")
}

/// An installed sysroot (`<cache>/sysroot/<crt>-<sdk>/sysroot.json`).
#[derive(Clone, Debug)]
pub struct Sysroot {
    pub root: PathBuf,
    /// CRT package line (`14.44.17.14`) and the `VC/Tools/MSVC` directory (`14.44.35207`).
    pub crt: String,
    pub msvc_version: String,
    /// `10.0.26100` and the `Include` directory (`10.0.26100.0`).
    pub sdk: String,
    pub sdk_version: String,
    pub archs: Vec<String>,
    pub spectre: bool,
}

impl Sysroot {
    /// The MSVC directory, through the space-free `crt` alias where there is one.
    pub fn crt_dir(&self) -> PathBuf {
        let alias = self.root.join("crt");
        if alias.exists() {
            alias
        } else {
            self.root.join("VC").join("Tools").join("MSVC").join(&self.msvc_version)
        }
    }

    /// `Windows Kits/10`, through the space-free `sdk` alias where there is one.
    pub fn sdk_dir(&self) -> PathBuf {
        let alias = self.root.join("sdk");
        if alias.exists() {
            alias
        } else {
            self.root.join("Windows Kits").join("10")
        }
    }

    pub fn to_json(&self, w: &mut Writer) {
        w.begin_object()
            .field("root", &self.root.to_string_lossy())
            .field("crt", &self.crt)
            .field("msvcVersion", &self.msvc_version)
            .field("sdk", &self.sdk)
            .field("sdkVersion", &self.sdk_version)
            .key("archs")
            .begin_array();
        for arch in &self.archs {
            w.str(arch);
        }
        w.end_array().key("spectre").bool(self.spectre).end_object();
    }

    pub fn read(root: &Path) -> Option<Sysroot> {
        let text = std::fs::read_to_string(root.join("sysroot.json")).ok()?;
        let value = Value::parse(&text)?;
        let str = |key: &str| value.get(key).and_then(Value::as_str).map(str::to_owned);
        Some(Sysroot {
            root: root.to_path_buf(),
            crt: str("crt")?,
            msvc_version: str("msvcVersion")?,
            sdk: str("sdk")?,
            sdk_version: str("sdkVersion")?,
            archs: value.get("archs")?.as_array().iter().filter_map(Value::as_str).map(str::to_owned).collect(),
            spectre: value.get("spectre").and_then(Value::as_bool).unwrap_or(false),
        })
    }
}

fn version_key(version: &str) -> Vec<u64> {
    version.split('.').map(|part| part.parse().unwrap_or(0)).collect()
}

fn matches(query: Option<&str>, versions: &[&str]) -> bool {
    query.is_none_or(|q| versions.iter().any(|v| *v == q || v.starts_with(&format!("{q}."))))
}

/// Installed sysroots, newest first.
pub fn installed(cache_dir: &Path) -> Vec<Sysroot> {
    let mut list: Vec<Sysroot> = std::fs::read_dir(cache_dir.join("sysroot"))
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|entry| Sysroot::read(&entry.path()))
        .collect();
    list.sort_by(|a, b| (version_key(&b.msvc_version), version_key(&b.sdk_version)).cmp(&(version_key(&a.msvc_version), version_key(&a.sdk_version))));
    list
}

/// The newest installed sysroot matching `--toolset`/`--sdk` and holding every `archs`.
pub fn find(cache_dir: &Path, toolset: Option<&str>, sdk: Option<&str>, archs: &[&str]) -> Option<Sysroot> {
    installed(cache_dir).into_iter().find(|s| {
        matches(toolset, &[&s.crt, &s.msvc_version])
            && matches(sdk, &[&s.sdk, &s.sdk_version])
            && archs.iter().all(|a| s.archs.iter().any(|b| b == a))
    })
}

/// Channel or installer manifest (a URL or a path) → the installer's package list.
pub fn load_packages(fetch: &dyn Fetch, manifest: &str) -> Result<Vec<manifest::Package>, String> {
    let bytes = fetch.get(manifest)?;
    let text = String::from_utf8_lossy(&bytes);
    let value = Value::parse(&text).ok_or_else(|| format!("{manifest}: not JSON"))?;
    if value.get("channelItems").is_some() {
        let url = manifest::vsman_url(&text)?;
        let url = resolve_url(manifest, &url);
        let bytes = fetch.get(&url)?;
        return manifest::packages(&String::from_utf8_lossy(&bytes));
    }
    manifest::packages(&text)
}

/// Relative payload URLs (local mirrors) resolve against the manifest's location.
fn resolve_url(base: &str, url: &str) -> String {
    if url.contains("://") || url.starts_with('/') || base.is_empty() {
        return url.to_owned();
    }
    match base.rfind('/') {
        Some(i) => format!("{}/{url}", &base[..i]),
        None => url.to_owned(),
    }
}

pub struct Installer<'a> {
    pub fetch: &'a dyn Fetch,
    pub cache_dir: PathBuf,
    pub manifest: String,
    pub log: &'a dyn Fn(&str),
}

fn base_name(name: &str) -> &str {
    name.rsplit(['\\', '/']).next().unwrap_or(name)
}

impl Installer<'_> {
    fn download(&self, payload: &Payload) -> Result<Vec<u8>, String> {
        let dir = self.cache_dir.join("downloads");
        let tag = if payload.sha256.len() >= 16 { &payload.sha256[..16] } else { "unverified" };
        let path = dir.join(format!("{tag}-{}", base_name(&payload.file_name)));
        if payload.sha256.len() >= 16 {
            if let Ok(data) = std::fs::read(&path) {
                if payload.size == 0 || data.len() as u64 == payload.size {
                    return Ok(data);
                }
            }
        }
        (self.log)(&format!("downloading {} ({:.1} MB)", base_name(&payload.file_name), payload.size as f64 / 1e6));
        let data = self.fetch.get(&resolve_url(&self.manifest, &payload.url))?;
        if !payload.sha256.is_empty() {
            let actual = sha256::hex(&data);
            if actual != payload.sha256 {
                return Err(format!("{}: sha256 {actual}, expected {}", payload.file_name, payload.sha256));
            }
        }
        if payload.sha256.len() >= 16 {
            std::fs::create_dir_all(&dir).map_err(|e| format!("{}: {e}", dir.display()))?;
            let partial = path.with_extension("partial");
            std::fs::write(&partial, &data)
                .and_then(|()| std::fs::rename(&partial, &path))
                .map_err(|e| format!("{}: {e}", path.display()))?;
        }
        Ok(data)
    }

    /// Downloads and lays out the sysroot `plan` selects; returns it (reused when already there).
    pub fn install(&self, plan: &Plan, spectre: bool, force: bool) -> Result<Sysroot, String> {
        let id = format!("{}-{}", plan.crt_version, plan.sdk);
        let sysroots = self.cache_dir.join("sysroot");
        let root = sysroots.join(&id);
        let mut archs: Vec<&str> = plan.archs.clone();
        if let Some(existing) = Sysroot::read(&root) {
            let complete = archs.iter().all(|a| existing.archs.iter().any(|b| b == a)) && (existing.spectre || !spectre);
            if complete && !force {
                return Ok(existing);
            }
        }
        let staging = sysroots.join(format!("{id}.partial"));
        let _ = std::fs::remove_dir_all(&staging);
        archs.sort_unstable();
        archs.dedup();
        let mut layout = Layout { root: staging.clone(), archs: archs.clone(), files: Vec::new(), dirs: HashSet::new() };
        for (id, payload) in &plan.vsix {
            let data = self.download(payload)?;
            (self.log)(&format!("extracting {id}"));
            zip::for_each(&data, |name, contents| match vsix_path(name, &archs) {
                Some(path) => layout.write(&path, contents),
                None => Ok(()),
            })
            .map_err(|e| format!("{id}: {e}"))?;
        }
        for installer in &plan.msis {
            let data = self.download(installer)?;
            let name = base_name(&installer.file_name);
            let package = msi::read(&data).map_err(|e| format!("{name}: {e}"))?;
            let mut destinations: HashMap<&str, Vec<String>> = HashMap::new();
            for file in &package.files {
                if let Some(path) = sdk_path(&file.path, &archs) {
                    destinations.insert(&file.key, path);
                }
            }
            if destinations.is_empty() {
                continue;
            }
            (self.log)(&format!("extracting {name}"));
            for cabinet in &package.cabinets {
                if cabinet.starts_with('#') {
                    return Err(format!("{name}: embedded cabinet {cabinet} is not supported"));
                }
                let payload = plan
                    .cabs
                    .iter()
                    .find(|p| base_name(&p.file_name).eq_ignore_ascii_case(cabinet))
                    .ok_or_else(|| format!("{name}: cabinet {cabinet} is not in the manifest"))?;
                let data = self.download(payload)?;
                cab::for_each(&data, |key, contents| match destinations.get(key) {
                    Some(path) => layout.write(path, contents),
                    None => Ok(()),
                })
                .map_err(|e| format!("{cabinet}: {e}"))?;
            }
        }
        let msvc_version = only_child(&staging.join("VC").join("Tools").join("MSVC"))?;
        let sdk_version = only_child(&staging.join("Windows Kits").join("10").join("Include"))?;
        #[cfg(unix)]
        {
            (self.log)("aliasing header and library names");
            layout.alias(&msvc_version)?;
        }
        let sysroot = Sysroot {
            root: root.clone(),
            crt: plan.crt.clone(),
            msvc_version,
            sdk: plan.sdk.clone(),
            sdk_version,
            archs: archs.iter().map(|a| a.to_string()).collect(),
            spectre,
        };
        let mut w = Writer::new();
        sysroot.to_json(&mut w);
        std::fs::write(staging.join("sysroot.json"), w.finish() + "\n").map_err(|e| e.to_string())?;
        let _ = std::fs::remove_dir_all(&root);
        std::fs::rename(&staging, &root).map_err(|e| format!("{}: {e}", root.display()))?;
        Ok(sysroot)
    }
}

fn only_child(dir: &Path) -> Result<String, String> {
    let mut names: Vec<String> = std::fs::read_dir(dir)
        .map_err(|e| format!("{}: {e}", dir.display()))?
        .flatten()
        .filter(|e| e.path().is_dir())
        .map(|e| e.file_name().to_string_lossy().into_owned())
        .collect();
    names.sort_by_key(|n| version_key(n));
    names.pop().ok_or_else(|| format!("{}: empty", dir.display()))
}

const ARCHS: [&str; 5] = ["x86", "x64", "arm64", "arm", "arm64ec"];

/// Path components after `lib`: keep the requested architectures (spelled in lower case), drop
/// the others.
fn filter_arch(components: &mut [String], archs: &[&str]) -> bool {
    for component in components.iter_mut() {
        let lower = component.to_ascii_lowercase();
        if ARCHS.contains(&lower.as_str()) {
            if !archs.contains(&lower.as_str()) {
                return false;
            }
            *component = lower;
            return true;
        }
    }
    true
}

/// `Contents/VC/Tools/MSVC/<v>/{include,lib/<arch>}/...` of a CRT VSIX.
fn vsix_path(name: &str, archs: &[&str]) -> Option<Vec<String>> {
    let rest = name.strip_prefix("Contents/")?;
    let mut parts: Vec<String> = rest.split('/').map(str::to_owned).collect();
    if parts.len() < 6 || !parts[0].eq_ignore_ascii_case("VC") || !parts[2].eq_ignore_ascii_case("MSVC") {
        return None;
    }
    parts[0] = "VC".into();
    parts[1] = "Tools".into();
    parts[2] = "MSVC".into();
    match parts[4].to_ascii_lowercase().as_str() {
        "include" => parts[4] = "include".into(),
        "lib" => {
            parts[4] = "lib".into();
            if !filter_arch(&mut parts[5..], archs) {
                return None;
            }
        }
        _ => return None,
    }
    // Debug symbols are most of the CRT payloads and no linker needs them.
    if parts.last()?.to_ascii_lowercase().ends_with(".pdb") {
        return None;
    }
    Some(parts)
}

/// `.../Include/<v>/...` and `.../Lib/<v>/{um,ucrt}/<arch>/...` of an SDK installer, under
/// `Windows Kits/10`.
fn sdk_path(path: &[String], archs: &[&str]) -> Option<Vec<String>> {
    let at = path.windows(2).position(|w| {
        (w[0].eq_ignore_ascii_case("Include") || w[0].eq_ignore_ascii_case("Lib")) && w[1].starts_with("10.")
    })?;
    let mut parts = vec!["Windows Kits".to_owned(), "10".to_owned()];
    parts.extend(path[at..].iter().cloned());
    if parts[2].eq_ignore_ascii_case("Include") {
        parts[2] = "Include".into();
        return (parts.len() > 4).then_some(parts);
    }
    parts[2] = "Lib".into();
    let kind = parts.get(4)?.to_ascii_lowercase();
    if kind != "um" && kind != "ucrt" {
        return None;
    }
    parts[4] = kind;
    if !filter_arch(&mut parts[5..], archs) || parts.len() < 7 {
        return None;
    }
    Some(parts)
}

struct Layout {
    root: PathBuf,
    #[allow(dead_code)]
    archs: Vec<&'static str>,
    files: Vec<Vec<String>>,
    dirs: HashSet<PathBuf>,
}

impl Layout {
    fn write(&mut self, parts: &[String], contents: &[u8]) -> Result<(), String> {
        if parts.iter().any(|p| p.is_empty() || p == "." || p == ".." || p.contains(['/', '\\', '\0'])) {
            return Err(format!("unsafe path {}", parts.join("/")));
        }
        let mut path = self.root.clone();
        path.extend(parts);
        let parent = path.parent().unwrap_or(&self.root).to_path_buf();
        if !self.dirs.contains(&parent) {
            std::fs::create_dir_all(&parent).map_err(|e| format!("{}: {e}", parent.display()))?;
            self.dirs.insert(parent);
        }
        std::fs::write(&path, contents).map_err(|e| format!("{}: {e}", path.display()))?;
        self.files.push(parts.to_vec());
        Ok(())
    }

    /// The `crt` and `sdk` aliases (cc-rs splits `CFLAGS` on spaces), lower-case file names,
    /// `NAME.lib`/`name.lib` for every library, and every `#include` spelling that differs from
    /// the file on disk only in case.
    #[cfg(unix)]
    fn alias(&self, msvc_version: &str) -> Result<(), String> {
        use std::os::unix::fs::symlink;
        let link = |target: &str, at: &Path| -> Result<(), String> {
            if std::fs::symlink_metadata(at).is_ok() {
                return Ok(());
            }
            symlink(target, at).map_err(|e| format!("{}: {e}", at.display()))
        };
        link(&format!("VC/Tools/MSVC/{msvc_version}"), &self.root.join("crt"))?;
        link("Windows Kits/10", &self.root.join("sdk"))?;

        let mut by_lower: HashMap<String, String> = HashMap::new();
        for parts in &self.files {
            for depth in 1..=parts.len() {
                let path = parts[..depth].join("/");
                by_lower.entry(path.to_lowercase()).or_insert(path);
            }
        }
        let mut aliases: Vec<(PathBuf, String)> = Vec::new();
        for parts in &self.files {
            let (name, dir) = parts.split_last().unwrap();
            let dir_path = self.root.join(dir.join("/"));
            let lower = name.to_lowercase();
            if lower != *name {
                aliases.push((dir_path.join(&lower), name.clone()));
            }
            if let Some(stem) = lower.strip_suffix(".lib") {
                let stem_original = &name[..stem.len()];
                aliases.push((dir_path.join(format!("{stem_original}.lib")), name.clone()));
                aliases.push((dir_path.join(format!("{}.lib", stem.to_uppercase())), name.clone()));
            }
        }
        let crt_include = format!("VC/Tools/MSVC/{msvc_version}/include");
        let include_roots: Vec<String> = std::iter::once(crt_include.clone())
            .chain(self.files.iter().filter(|p| p.len() > 5 && p[2] == "Include").map(|p| p[..5].join("/")))
            .collect::<HashSet<_>>()
            .into_iter()
            .collect();
        let mut seen: HashSet<String> = HashSet::new();
        for parts in &self.files {
            let is_header = parts.len() > 4 && (parts[2] == "Include" || parts.join("/").starts_with(&crt_include));
            if !is_header || parts.last().unwrap().to_lowercase().ends_with(".lib") {
                continue;
            }
            let path = self.root.join(parts.join("/"));
            let Ok(text) = std::fs::read(&path) else { continue };
            let dir = parts[..parts.len() - 1].join("/");
            for spelling in includes(&text) {
                if !seen.insert(format!("{dir}\0{spelling}")) {
                    continue;
                }
                for base in std::iter::once(&dir).chain(include_roots.iter()) {
                    let Some(wanted) = normalize(&format!("{base}/{spelling}")) else { continue };
                    let Some(actual) = by_lower.get(&wanted.to_lowercase()) else { continue };
                    if *actual != wanted {
                        let mut prefix = String::new();
                        for (want, have) in wanted.split('/').zip(actual.split('/')) {
                            if want != have {
                                aliases.push((self.root.join(&prefix).join(want), have.to_owned()));
                            }
                            if !prefix.is_empty() {
                                prefix.push('/');
                            }
                            prefix.push_str(have);
                        }
                    }
                    break;
                }
            }
        }
        for (at, target) in aliases {
            if at.file_name().is_some_and(|n| n.to_string_lossy() != target) {
                link(&target, &at)?;
            }
        }
        Ok(())
    }
}

/// The names in `#include <name>` / `#include "name"` lines.
#[cfg_attr(not(unix), allow(dead_code))]
fn includes(text: &[u8]) -> Vec<String> {
    let mut out = Vec::new();
    for line in text.split(|&b| b == b'\n') {
        let line = line.trim_ascii_start();
        let Some(rest) = line.strip_prefix(b"#") else { continue };
        let rest = rest.trim_ascii_start();
        let Some(rest) = rest.strip_prefix(b"include") else { continue };
        let rest = rest.trim_ascii_start();
        let close = match rest.first() {
            Some(b'<') => b'>',
            Some(b'"') => b'"',
            _ => continue,
        };
        if let Some(end) = rest[1..].iter().position(|&b| b == close) {
            let name = String::from_utf8_lossy(&rest[1..1 + end]).replace('\\', "/");
            if !name.is_empty() {
                out.push(name);
            }
        }
    }
    out
}

/// Resolves `.` and `..` in a `/`-separated relative path.
#[cfg_attr(not(unix), allow(dead_code))]
fn normalize(path: &str) -> Option<String> {
    let mut parts: Vec<&str> = Vec::new();
    for part in path.split('/') {
        match part {
            "" | "." => {}
            ".." => {
                parts.pop()?;
            }
            part => parts.push(part),
        }
    }
    Some(parts.join("/"))
}

/// Plans the sysroot `selection` asks for from `manifest`.
pub fn plan(fetch: &dyn Fetch, manifest: &str, selection: &Selection) -> Result<Plan, String> {
    manifest::plan(&load_packages(fetch, manifest)?, selection)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn strings(parts: &[&str]) -> Vec<String> {
        parts.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn maps_vsix_and_sdk_paths() {
        let archs = ["x64"];
        assert_eq!(
            vsix_path("Contents/VC/Tools/MSVC/14.44.35207/lib/X64/msvcrt.lib", &archs).unwrap().join("/"),
            "VC/Tools/MSVC/14.44.35207/lib/x64/msvcrt.lib"
        );
        assert!(vsix_path("Contents/VC/Tools/MSVC/14.44.35207/lib/arm64/msvcrt.lib", &archs).is_none());
        assert!(vsix_path("Contents/VC/Tools/MSVC/14.44.35207/lib/x64/libcmt.pdb", &archs).is_none());
        assert!(vsix_path("Contents/VC/Tools/MSVC/14.44.35207/bin/Hostx64/x64/cl.exe", &archs).is_none());
        assert!(vsix_path("extension.vsixmanifest", &archs).is_none());
        let include = strings(&["Program Files", "Windows Kits", "10", "Include", "10.0.26100.0", "um", "Windows.h"]);
        assert_eq!(sdk_path(&include, &archs).unwrap().join("/"), "Windows Kits/10/Include/10.0.26100.0/um/Windows.h");
        let lib = strings(&["Windows Kits", "10", "Lib", "10.0.26100.0", "um", "x64", "kernel32.Lib"]);
        assert_eq!(sdk_path(&lib, &archs).unwrap().join("/"), "Windows Kits/10/Lib/10.0.26100.0/um/x64/kernel32.Lib");
        let arm = strings(&["Windows Kits", "10", "Lib", "10.0.26100.0", "um", "arm64", "kernel32.Lib"]);
        assert!(sdk_path(&arm, &archs).is_none());
        let source = strings(&["Windows Kits", "10", "Source", "10.0.26100.0", "ucrt", "x.c"]);
        assert!(sdk_path(&source, &archs).is_none());
    }

    #[test]
    fn finds_includes() {
        let text = b"#include <Windows.h>\n  #  include \"..\\shared\\BaseTsd.h\"\n#define X\n#include MACRO\n";
        assert_eq!(includes(text), ["Windows.h", "../shared/BaseTsd.h"]);
        assert_eq!(normalize("a/b/../c/./d.h").unwrap(), "a/c/d.h");
        assert!(normalize("../x").is_none());
    }

    #[test]
    fn resolves_relative_payload_urls() {
        assert_eq!(resolve_url("http://127.0.0.1:1/vs/channel", "vsman.json"), "http://127.0.0.1:1/vs/vsman.json");
        assert_eq!(resolve_url("http://a/channel", "https://b/x"), "https://b/x");
    }
}
