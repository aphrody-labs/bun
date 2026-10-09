// SPDX-License-Identifier: MIT
//! Every .NET install on the machine, whatever its version or location: install roots from the
//! environment, the registered install locations, the default and package-manager locations,
//! `PATH` and the user installs; in each root its `hostfxr`s, SDKs, shared frameworks and
//! workloads. On Windows also the .NET Framework releases (registry `NDP`).
//!
//! Only the disk and `InstalledVersions\<arch>\InstallLocation` are trusted: MSI product records
//! may be stale or purged while the files are intact.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use crate::version::Version;
use crate::{ARCH, HOSTFXR_NAME, env_path};

pub const FRAMEWORKS: [&str; 3] = [
    "Microsoft.NETCore.App",
    "Microsoft.AspNetCore.App",
    "Microsoft.WindowsDesktop.App",
];

pub const ARCHES: [&str; 8] = [
    "x64",
    "x86",
    "arm64",
    "arm",
    "riscv64",
    "loongarch64",
    "s390x",
    "ppc64le",
];

#[derive(Debug, Clone)]
pub struct Component {
    pub version: Version,
    pub path: PathBuf,
}

#[derive(Debug, Clone)]
pub struct Framework {
    pub name: String,
    pub versions: Vec<Component>,
}

#[derive(Debug, Clone)]
pub struct Workload {
    /// SDK feature band (`10.0.100`).
    pub band: String,
    pub id: String,
    /// `"file"` (metadata/workloads), `"msi"` (registry) or `"userlocal"`.
    pub source: &'static str,
}

#[derive(Debug, Clone, Default)]
pub struct Workloads {
    pub installed: Vec<Workload>,
    /// `(band, installer type)` from `metadata/workloads/<band>/installertype/<type>`.
    pub installer_types: Vec<(String, String)>,
    /// `(band, version)` from `sdk-manifests/<band>/workloadsets/<version>`.
    pub sets: Vec<(String, String)>,
    /// `(band, manifest id, version)` from `sdk-manifests`.
    pub manifests: Vec<(String, String, Option<String>)>,
}

#[derive(Debug, Clone)]
pub struct Install {
    pub root: PathBuf,
    /// Architecture of the binaries (`x64`, `arm64`, …), read from their headers.
    pub arch: Option<&'static str>,
    /// How the root was found, in discovery order.
    pub sources: Vec<String>,
    pub muxer: Option<PathBuf>,
    pub hostfxr: Vec<Component>,
    pub sdks: Vec<Component>,
    pub frameworks: Vec<Framework>,
    pub workloads: Workloads,
}

impl Install {
    pub fn framework(&self, name: &str) -> &[Component] {
        self.frameworks
            .iter()
            .find(|framework| framework.name.eq_ignore_ascii_case(name))
            .map_or(&[], |framework| &framework.versions)
    }

    pub fn latest_hostfxr(&self) -> Option<&Component> {
        self.hostfxr.last()
    }
}

#[derive(Debug, Clone)]
pub struct NetFramework {
    /// `4.8.1`, `3.5`, …
    pub version: String,
    /// Full build version from the registry (`4.8.09222`).
    pub build: Option<String>,
    /// `Release` DWORD (4.5 and later).
    pub release: Option<u32>,
    pub service_pack: Option<u32>,
}

#[derive(Debug, Clone)]
pub struct Inventory {
    pub host_arch: &'static str,
    pub installs: Vec<Install>,
    pub net_framework: Vec<NetFramework>,
}

impl Inventory {
    /// The install the `nethost` order would pick for this process' architecture.
    pub fn primary(&self) -> Option<&Install> {
        self.installs
            .iter()
            .find(|install| install.arch.is_none_or(|arch| arch == self.host_arch) && !install.hostfxr.is_empty())
    }
}

/// Scans the machine.
pub fn scan() -> Inventory {
    let mut installs: Vec<Install> = Vec::new();
    let mut keys: Vec<PathBuf> = Vec::new();
    for (source, root) in candidate_roots() {
        let Some(key) = canonical(&root) else {
            continue;
        };
        if let Some(index) = keys.iter().position(|known| *known == key) {
            if !installs[index].sources.contains(&source) {
                installs[index].sources.push(source);
            }
            continue;
        }
        if let Some(install) = scan_root(&key, source) {
            keys.push(key);
            installs.push(install);
        }
    }
    Inventory {
        host_arch: ARCH,
        installs,
        net_framework: net_framework(),
    }
}

/// One root, or `None` when it holds no .NET layout (`host/fxr`, `sdk` or `shared`).
pub fn scan_root(root: &Path, source: String) -> Option<Install> {
    let fxr = root.join("host").join("fxr");
    let hostfxr = components(&fxr, |dir| dir.join(HOSTFXR_NAME).is_file(), |dir| dir.join(HOSTFXR_NAME));
    let sdks = components(&root.join("sdk"), |dir| dir.join("dotnet.dll").is_file(), Path::to_path_buf);
    let shared = root.join("shared");
    let mut names: Vec<String> = FRAMEWORKS.iter().map(|name| (*name).to_owned()).collect();
    for name in subdirectories(&shared) {
        if !names.iter().any(|known| known.eq_ignore_ascii_case(&name)) {
            names.push(name);
        }
    }
    let frameworks: Vec<Framework> = names
        .into_iter()
        .map(|name| Framework {
            versions: components(&shared.join(&name), |_| true, Path::to_path_buf),
            name,
        })
        .filter(|framework| !framework.versions.is_empty())
        .collect();
    if hostfxr.is_empty() && sdks.is_empty() && frameworks.is_empty() {
        return None;
    }
    let muxer = root.join(MUXER_NAME);
    let muxer = muxer.is_file().then_some(muxer);
    let arch = muxer
        .as_deref()
        .or(hostfxr.last().map(|component| component.path.as_path()))
        .and_then(binary_arch);
    Some(Install {
        root: root.to_path_buf(),
        arch,
        sources: vec![source],
        workloads: workloads(root, arch.unwrap_or(ARCH)),
        muxer,
        hostfxr,
        sdks,
        frameworks,
    })
}

#[cfg(windows)]
pub const MUXER_NAME: &str = "dotnet.exe";
#[cfg(not(windows))]
pub const MUXER_NAME: &str = "dotnet";

/// Every place a .NET install can live, in `nethost` priority order first.
pub fn candidate_roots() -> Vec<(String, PathBuf)> {
    let mut roots = Vec::new();
    let mut push = |source: String, root: PathBuf| roots.push((source, root));
    let own = format!("DOTNET_ROOT_{}", ARCH.to_ascii_uppercase());
    if let Some(root) = env_path(&own) {
        push(own.clone(), root);
    }
    if let Some(root) = env_path("DOTNET_ROOT") {
        push("DOTNET_ROOT".into(), root);
    }
    for arch in ARCHES {
        let name = format!("DOTNET_ROOT_{}", arch.to_ascii_uppercase());
        if name != own
            && let Some(root) = env_path(&name)
        {
            push(name, root);
        }
    }
    if let Some(root) = env_path("DOTNET_ROOT(x86)") {
        push("DOTNET_ROOT(x86)".into(), root);
    }
    for (source, root) in registered_locations() {
        push(source, root);
    }
    for (source, root) in default_locations() {
        push(source, root);
    }
    for root in path_locations() {
        push("PATH".into(), root);
    }
    if let Some(root) = env_path("DOTNET_INSTALL_DIR") {
        push("DOTNET_INSTALL_DIR".into(), root);
    }
    for (source, root) in user_locations() {
        push(source, root);
    }
    roots
}

/// `InstallLocation` of every architecture, in both registry views (Windows), or the
/// `/etc/dotnet/install_location[_<arch>]` files (Unix).
#[cfg(windows)]
pub fn registered_locations() -> Vec<(String, PathBuf)> {
    use crate::registry::{View, string};
    let mut found = Vec::new();
    let order = std::iter::once(ARCH).chain(ARCHES.into_iter().filter(|arch| *arch != ARCH));
    for arch in order {
        let key = format!(r"SOFTWARE\dotnet\Setup\InstalledVersions\{arch}");
        for (view, label) in [(View::Bits32, "32-bit"), (View::Bits64, "64-bit")] {
            if let Some(location) = string(view, &key, "InstallLocation") {
                found.push((
                    format!(r"HKLM\{key}\InstallLocation ({label} view)"),
                    PathBuf::from(location),
                ));
            }
        }
    }
    found
}

#[cfg(unix)]
pub fn registered_locations() -> Vec<(String, PathBuf)> {
    let mut found = Vec::new();
    let mut files = vec![format!("/etc/dotnet/install_location_{ARCH}")];
    files.push("/etc/dotnet/install_location".to_owned());
    files.extend(
        ARCHES
            .iter()
            .filter(|arch| **arch != ARCH)
            .map(|arch| format!("/etc/dotnet/install_location_{arch}")),
    );
    for file in files {
        if let Ok(text) = std::fs::read_to_string(&file)
            && let Some(line) = text.lines().map(str::trim).find(|line| !line.is_empty())
        {
            found.push((file, PathBuf::from(line)));
        }
    }
    found
}

#[cfg(windows)]
fn default_locations() -> Vec<(String, PathBuf)> {
    let mut found = Vec::new();
    for variable in ["ProgramW6432", "ProgramFiles", "ProgramFiles(x86)", "ProgramFiles(Arm)"] {
        if let Some(dir) = env_path(variable) {
            found.push((format!("%{variable}%"), dir.join("dotnet")));
            // x64 installs on an Arm64 machine.
            found.push((format!("%{variable}%"), dir.join("dotnet").join("x64")));
        }
    }
    found.push(("default".into(), PathBuf::from(r"C:\Program Files\dotnet")));
    found.push(("default".into(), PathBuf::from(r"C:\Program Files (x86)\dotnet")));
    found
}

#[cfg(unix)]
fn default_locations() -> Vec<(String, PathBuf)> {
    [
        "/usr/local/share/dotnet",
        "/usr/local/share/dotnet/x64",
        "/usr/share/dotnet",
        "/usr/lib/dotnet",
        "/usr/lib64/dotnet",
        "/usr/local/lib/dotnet",
        "/opt/dotnet",
        "/opt/homebrew/opt/dotnet/libexec",
        "/usr/local/opt/dotnet/libexec",
        "/home/linuxbrew/.linuxbrew/opt/dotnet/libexec",
        "/snap/dotnet-sdk/current",
        "/snap/dotnet/current",
        "/nix/var/nix/profiles/default/share/dotnet",
    ]
    .into_iter()
    .map(|root| ("default".to_owned(), PathBuf::from(root)))
    .collect()
}

fn home() -> Option<PathBuf> {
    env_path(if cfg!(windows) { "USERPROFILE" } else { "HOME" })
}

fn user_locations() -> Vec<(String, PathBuf)> {
    let mut found = Vec::new();
    if let Some(dir) = default_install_dir() {
        found.push(("user install".to_owned(), dir));
    }
    if let Some(home) = home() {
        found.push(("~/.dotnet".to_owned(), home.join(".dotnet")));
    }
    found
}

/// Where `bun dotnet setup` installs by default, like `dotnet-install`:
/// `%LOCALAPPDATA%\Microsoft\dotnet` on Windows, `~/.dotnet` elsewhere.
pub fn default_install_dir() -> Option<PathBuf> {
    if cfg!(windows) {
        env_path("LOCALAPPDATA").map(|dir| dir.join("Microsoft").join("dotnet"))
    } else {
        home().map(|home| home.join(".dotnet"))
    }
}

/// The directory of every `dotnet` on `PATH` (symlinks resolved), skipping this process.
fn path_locations() -> Vec<PathBuf> {
    let own = std::env::current_exe().ok().and_then(|exe| exe.canonicalize().ok());
    let Some(path) = std::env::var_os("PATH") else {
        return Vec::new();
    };
    std::env::split_paths(&path)
        .filter_map(|dir| dir.join(MUXER_NAME).canonicalize().ok())
        .filter(|candidate| Some(candidate) != own.as_ref())
        .filter_map(|candidate| candidate.parent().map(Path::to_path_buf))
        .collect()
}

/// Canonical form of an existing directory, without the `\\?\` prefix on Windows.
pub fn canonical(root: &Path) -> Option<PathBuf> {
    let path = root.canonicalize().ok()?;
    if !path.is_dir() {
        return None;
    }
    #[cfg(windows)]
    {
        let text = path.to_string_lossy();
        if let Some(rest) = text.strip_prefix(r"\\?\")
            && !rest.starts_with("UNC\\")
        {
            return Some(PathBuf::from(rest));
        }
    }
    Some(path)
}

fn subdirectories(dir: &Path) -> Vec<String> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    entries
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_dir() || kind.is_symlink()) && entry.path().is_dir())
        .filter_map(|entry| entry.file_name().into_string().ok())
        .collect()
}

/// Version-named subdirectories of `dir` accepted by `accept`, ascending.
fn components(dir: &Path, accept: impl Fn(&Path) -> bool, path: impl Fn(&Path) -> PathBuf) -> Vec<Component> {
    let mut found: Vec<Component> = subdirectories(dir)
        .into_iter()
        .filter_map(|name| {
            let version = Version::parse(&name)?;
            let full = dir.join(&name);
            accept(&full).then(|| Component {
                version,
                path: path(&full),
            })
        })
        .collect();
    found.sort_by(|a, b| a.version.cmp(&b.version));
    found
}

/// Architecture of a PE, ELF or Mach-O binary.
pub fn binary_arch(path: &Path) -> Option<&'static str> {
    use std::io::{Read, Seek, SeekFrom};
    let mut file = std::fs::File::open(path).ok()?;
    let mut head = [0u8; 64];
    file.read_exact(&mut head).ok()?;
    if head.starts_with(b"MZ") {
        let offset = u32::from_le_bytes(head[0x3c..0x40].try_into().ok()?);
        let mut pe = [0u8; 6];
        file.seek(SeekFrom::Start(u64::from(offset))).ok()?;
        file.read_exact(&mut pe).ok()?;
        if &pe[..4] != b"PE\0\0" {
            return None;
        }
        return match u16::from_le_bytes([pe[4], pe[5]]) {
            0x8664 => Some("x64"),
            0x014c => Some("x86"),
            0xaa64 => Some("arm64"),
            0x01c4 => Some("arm"),
            _ => None,
        };
    }
    if head.starts_with(b"\x7fELF") {
        let machine = if head[5] == 2 {
            u16::from_be_bytes([head[18], head[19]])
        } else {
            u16::from_le_bytes([head[18], head[19]])
        };
        return match machine {
            0x3e => Some("x64"),
            0xb7 => Some("arm64"),
            0x03 => Some("x86"),
            0x28 => Some("arm"),
            0xf3 => Some("riscv64"),
            0x102 => Some("loongarch64"),
            0x16 => Some("s390x"),
            0x15 => Some("ppc64le"),
            _ => None,
        };
    }
    let magic = u32::from_le_bytes(head[..4].try_into().ok()?);
    if magic == 0xfeed_facf {
        return match u32::from_le_bytes(head[4..8].try_into().ok()?) {
            0x0100_0007 => Some("x64"),
            0x0100_000c => Some("arm64"),
            _ => None,
        };
    }
    if u32::from_be_bytes(head[..4].try_into().ok()?) == 0xcafe_babe {
        return Some("universal");
    }
    None
}

fn workloads(root: &Path, arch: &str) -> Workloads {
    let mut result = Workloads::default();
    let metadata = root.join("metadata").join("workloads");
    let mut user_local = false;
    // `<band>/…` and, since .NET 8, `<arch>/<band>/…`.
    let mut band_dirs: Vec<(String, PathBuf)> = Vec::new();
    for name in subdirectories(&metadata) {
        if Version::parse(&name).is_some() {
            band_dirs.push((name.clone(), metadata.join(&name)));
        } else {
            for band in subdirectories(&metadata.join(&name)) {
                if Version::parse(&band).is_some() {
                    band_dirs.push((band.clone(), metadata.join(&name).join(&band)));
                }
            }
        }
    }
    for (band, dir) in &band_dirs {
        for kind in files(&dir.join("installertype")) {
            result.installer_types.push((band.clone(), kind));
        }
        user_local |= dir.join("userlocal").exists();
        for id in files(&dir.join("InstalledWorkloads")) {
            result.installed.push(Workload {
                band: band.clone(),
                id,
                source: "file",
            });
        }
    }
    if user_local
        && let Some(home) = env_path("DOTNET_CLI_HOME").or_else(home)
    {
        let user = home.join(".dotnet").join("metadata").join("workloads");
        for (band, _) in &band_dirs {
            for dir in [user.join(arch).join(band), user.join(band)] {
                for id in files(&dir.join("InstalledWorkloads")) {
                    result.installed.push(Workload {
                        band: band.clone(),
                        id,
                        source: "userlocal",
                    });
                }
            }
        }
    }
    #[cfg(windows)]
    {
        use crate::registry::{View, subkeys};
        for view in [View::Bits32, View::Bits64] {
            let base = format!(r"SOFTWARE\Microsoft\dotnet\InstalledWorkloads\Standalone\{arch}");
            for band in subkeys(view, &base) {
                for id in subkeys(view, &format!(r"{base}\{band}")) {
                    if !result.installed.iter().any(|known| known.band == band && known.id == id) {
                        result.installed.push(Workload {
                            band: band.clone(),
                            id,
                            source: "msi",
                        });
                    }
                }
            }
        }
    }
    let manifests = root.join("sdk-manifests");
    for band in subdirectories(&manifests) {
        for id in subdirectories(&manifests.join(&band)) {
            let dir = manifests.join(&band).join(&id);
            if id.eq_ignore_ascii_case("workloadsets") {
                for version in subdirectories(&dir) {
                    result.sets.push((band.clone(), version));
                }
                continue;
            }
            if dir.join("WorkloadManifest.json").is_file() {
                result.manifests.push((band.clone(), id, None));
            } else {
                for version in subdirectories(&dir) {
                    if dir.join(&version).join("WorkloadManifest.json").is_file() {
                        result.manifests.push((band.clone(), id.clone(), Some(version)));
                    }
                }
            }
        }
    }
    result.installed.sort_by(|a, b| (&a.band, &a.id).cmp(&(&b.band, &b.id)));
    result.installed.dedup_by(|a, b| a.band == b.band && a.id == b.id);
    result
}

fn files(dir: &Path) -> Vec<String> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut names: Vec<String> = entries
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_file()))
        .filter_map(|entry| entry.file_name().into_string().ok())
        .collect();
    names.sort();
    names
}

/// .NET Framework releases from `HKLM\SOFTWARE\Microsoft\NET Framework Setup\NDP`.
#[cfg(windows)]
pub fn net_framework() -> Vec<NetFramework> {
    use crate::registry::{View, dword, string, subkeys};
    const NDP: &str = r"SOFTWARE\Microsoft\NET Framework Setup\NDP";
    let mut found = Vec::new();
    for name in subkeys(View::Bits64, NDP) {
        if !name.starts_with('v') || name == "v4.0" {
            continue;
        }
        let key = if name == "v4" {
            format!(r"{NDP}\v4\Full")
        } else {
            format!(r"{NDP}\{name}")
        };
        if dword(View::Bits64, &key, "Install") != Some(1) {
            continue;
        }
        let build = string(View::Bits64, &key, "Version");
        let release = dword(View::Bits64, &key, "Release");
        let version = match release {
            Some(release) => framework_release_name(release).to_owned(),
            None => name.trim_start_matches('v').to_owned(),
        };
        found.push(NetFramework {
            version,
            build,
            release,
            service_pack: dword(View::Bits64, &key, "SP"),
        });
    }
    found
}

#[cfg(not(windows))]
pub fn net_framework() -> Vec<NetFramework> {
    Vec::new()
}

/// .NET Framework 4.x product version for a `Release` value.
pub fn framework_release_name(release: u32) -> &'static str {
    match release {
        533_320.. => "4.8.1",
        528_040.. => "4.8",
        461_808.. => "4.7.2",
        461_308.. => "4.7.1",
        460_798.. => "4.7",
        394_802.. => "4.6.2",
        394_254.. => "4.6.1",
        393_295.. => "4.6",
        379_893.. => "4.5.2",
        378_675.. => "4.5.1",
        378_389.. => "4.5",
        _ => "4.0",
    }
}

/// Every install's components keyed by root, for fingerprints.
pub fn layout_dirs(root: &Path) -> Vec<PathBuf> {
    let mut dirs = vec![root.join("host").join("fxr"), root.join("sdk")];
    let shared = root.join("shared");
    dirs.push(shared.clone());
    for name in subdirectories(&shared) {
        dirs.push(shared.join(name));
    }
    dirs.push(root.join("metadata").join("workloads"));
    dirs
}

/// `{ name → versions }` of an install, for JSON.
pub fn frameworks_map(install: &Install) -> BTreeMap<String, Vec<String>> {
    install
        .frameworks
        .iter()
        .map(|framework| {
            (
                framework.name.clone(),
                framework.versions.iter().map(|component| component.version.to_string()).collect(),
            )
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn release_names() {
        assert_eq!(framework_release_name(533_510), "4.8.1");
        assert_eq!(framework_release_name(528_449), "4.8");
        assert_eq!(framework_release_name(461_814), "4.7.2");
        assert_eq!(framework_release_name(378_389), "4.5");
    }

    #[test]
    fn scans_a_fake_root() {
        let dir = std::env::temp_dir().join(format!("bun-dotnet-inventory-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("host/fxr/9.0.1")).unwrap();
        std::fs::write(dir.join("host/fxr/9.0.1").join(HOSTFXR_NAME), b"").unwrap();
        std::fs::create_dir_all(dir.join("sdk/9.0.100")).unwrap();
        std::fs::write(dir.join("sdk/9.0.100/dotnet.dll"), b"").unwrap();
        std::fs::create_dir_all(dir.join("sdk/9.0.200")).unwrap();
        std::fs::create_dir_all(dir.join("shared/Microsoft.NETCore.App/9.0.1")).unwrap();
        std::fs::create_dir_all(dir.join("shared/Microsoft.NETCore.App/9.0.10")).unwrap();
        std::fs::create_dir_all(dir.join("metadata/workloads/x64/9.0.100/InstalledWorkloads")).unwrap();
        std::fs::write(dir.join("metadata/workloads/x64/9.0.100/InstalledWorkloads/wasm-tools"), b"").unwrap();
        std::fs::create_dir_all(dir.join("sdk-manifests/9.0.100/workloadsets/9.0.101")).unwrap();
        let install = scan_root(&dir, "test".into()).unwrap();
        assert_eq!(install.hostfxr.len(), 1);
        assert_eq!(install.sdks.iter().map(|c| c.version.to_string()).collect::<Vec<_>>(), ["9.0.100"]);
        assert_eq!(
            install.framework("microsoft.netcore.app").iter().map(|c| c.version.to_string()).collect::<Vec<_>>(),
            ["9.0.1", "9.0.10"]
        );
        assert_eq!(install.workloads.installed[0].id, "wasm-tools");
        assert_eq!(install.workloads.sets, [("9.0.100".to_owned(), "9.0.101".to_owned())]);
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
