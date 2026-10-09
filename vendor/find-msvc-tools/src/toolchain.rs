//! Bun addition: resolve the whole native toolchain of any Visual Studio 2017+ / Build Tools
//! install, in any version or location, without `vswhere.exe` and without running a `.bat`.
//!
//! - Instances come from the Setup Configuration COM API, the installer's own records
//!   (`%ProgramData%\Microsoft\VisualStudio\Packages\_Instances\*\state.json`), the
//!   `SOFTWARE\Microsoft\VisualStudio\SxS\VS7` registry key, `VSINSTALLDIR`/`VCToolsInstallDir`, and
//!   the default install directories, merged by path.
//! - Every MSVC toolset of an instance (`VC\Tools\MSVC\*`, with the `Microsoft.VCToolsVersion*.txt`
//!   aliases such as `v143` or `14.44.17.14`) can be selected by exact version or prefix.
//! - Every Windows 10/11 SDK (`KitsRoot10` + `Include\*`), the Universal CRT and the .NET Framework
//!   SDK (`NETFXSDK`).
//! - The scripts (`vcvarsall.bat`, `VsDevCmd.bat`, `Launch-VsDevShell.ps1`, ...), `vswhere.exe` and
//!   the installer, and the per host/target binaries including the LLVM/clang-cl Visual Studio ships.
//! - The environment `vcvarsall.bat <arch>` would produce, computed here.

use std::ffi::OsString;
use std::path::{Path, PathBuf};

use super::impl_::{host_arch, is_amd64_emulation_supported, AARCH64, X86, X86_64};
use crate::json::{Value, Writer};
use crate::registry::LOCAL_MACHINE;
use crate::setup_config::{eComplete, eNoRebootRequired, SetupConfiguration};

pub(crate) fn var(name: &str) -> Option<OsString> {
    std::env::var_os(name).filter(|value| !value.is_empty())
}

fn read_trimmed(path: &Path) -> Option<String> {
    let text = std::fs::read_to_string(path).ok()?;
    let text = text.trim_start_matches('\u{feff}').trim();
    (!text.is_empty()).then(|| text.to_owned())
}

fn sorted_dirs(dir: &Path) -> Vec<(String, PathBuf)> {
    let Ok(entries) = dir.read_dir() else {
        return Vec::new();
    };
    let mut dirs: Vec<(String, PathBuf)> = entries
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_ok_and(|t| t.is_dir()))
        .filter_map(|entry| Some((entry.file_name().into_string().ok()?, entry.path())))
        .collect();
    dirs.sort_by(|a, b| version_key(&b.0).cmp(&version_key(&a.0)));
    dirs
}

/// Sort key for dotted versions (`10.0.26100.0`, `14.44.35207`, `4.8.1`), numeric per part.
pub fn version_key(version: &str) -> Vec<u64> {
    version
        .trim_start_matches('v')
        .split(['.', '-', '+'])
        .map(|part| part.parse().unwrap_or(0))
        .collect()
}

/// Whether `query` selects `version`: the same version, or a prefix ending at a `.`
/// (`14.44` selects `14.44.35207`, not `14.441.0`).
pub fn version_matches(query: &str, version: &str) -> bool {
    let query = query.trim_end_matches('\\');
    let version = version.trim_end_matches('\\');
    version.eq_ignore_ascii_case(query)
        || (version.len() > query.len()
            && version[..query.len()].eq_ignore_ascii_case(query)
            && version.as_bytes()[query.len()] == b'.')
}

fn path_key(path: &Path) -> String {
    path.to_string_lossy()
        .trim_end_matches(['\\', '/'])
        .replace('/', "\\")
        .to_ascii_lowercase()
}

/// A Visual Studio 2017+ (or Build Tools) installation.
#[derive(Debug, Clone, Default)]
pub struct Instance {
    /// The installer's instance id (`75701dc3`); `registry:15.0`, `env` or `dir` for instances
    /// the installer does not know about.
    pub id: String,
    /// e.g. `VisualStudio/18.10.2+12217.157`.
    pub name: String,
    pub path: PathBuf,
    /// e.g. `18.10.12217.157`.
    pub version: String,
    /// e.g. `18.10.2` (what `VSCMD_VER` holds).
    pub display_version: Option<String>,
    /// e.g. `Microsoft.VisualStudio.Product.BuildTools`.
    pub product_id: Option<String>,
    /// e.g. `Visual Studio Build Tools 2026`.
    pub title: Option<String>,
    /// e.g. `VisualStudio.18.Release`.
    pub channel: Option<String>,
    pub prerelease: bool,
    /// From the Setup Configuration state; `None` when COM is unavailable.
    pub complete: Option<bool>,
    pub reboot_required: Option<bool>,
    /// The installed component and workload ids (`Microsoft.VisualStudio.Component.VC.Tools.x86.x64`).
    pub components: Vec<String>,
    /// Where the instance was found: `com`, `state`, `registry`, `env`, `dir`.
    pub sources: Vec<&'static str>,
}

impl Instance {
    fn bare(path: PathBuf, source: &'static str) -> Instance {
        let version = guess_version(&path);
        Instance {
            id: source.to_owned(),
            path,
            version,
            sources: vec![source],
            ..Instance::default()
        }
    }

    /// `BuildTools`, `Community`, `Professional`, `Enterprise`, `Preview`, ...: the product id's
    /// last part, or the installation directory name.
    pub fn product(&self) -> String {
        if let Some(id) = &self.product_id {
            if let Some(last) = id.rsplit('.').next() {
                return last.to_owned();
            }
        }
        self.path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("")
            .to_owned()
    }

    pub fn major(&self) -> u64 {
        version_key(&self.version).first().copied().unwrap_or(0)
    }

    /// The marketing year: 2017, 2019, 2022, 2026.
    pub fn year(&self) -> Option<u32> {
        match self.major() {
            15 => Some(2017),
            16 => Some(2019),
            17 => Some(2022),
            18 => Some(2026),
            _ => None,
        }
    }

    /// `VisualStudioVersion` as vcvars sets it: the major version followed by `.0`.
    pub fn visual_studio_version(&self) -> String {
        format!("{}.0", self.major())
    }

    pub fn has_component(&self, id: &str) -> bool {
        self.components.iter().any(|c| c.eq_ignore_ascii_case(id))
    }

    /// The MSVC toolset `Microsoft.VCToolsVersion.default.txt` names.
    pub fn default_toolset(&self) -> Option<String> {
        read_trimmed(&self.path.join(r"VC\Auxiliary\Build\Microsoft.VCToolsVersion.default.txt"))
    }

    /// Every MSVC toolset under `VC\Tools\MSVC`, newest first.
    pub fn toolsets(&self) -> Vec<Toolset> {
        let build = self.path.join(r"VC\Auxiliary\Build");
        let default = self.default_toolset();
        // `Microsoft.VCToolsVersion.v143.default.txt` and `<X>\Microsoft.VCToolsVersion.<X>.txt`
        // map an alias (`v143`, `14.44.17.14`) to a toolset directory.
        let mut aliases: Vec<(String, String)> = Vec::new();
        if let Ok(entries) = build.read_dir() {
            for entry in entries.filter_map(Result::ok) {
                let name = entry.file_name().to_string_lossy().into_owned();
                if let Some(alias) = name
                    .strip_prefix("Microsoft.VCToolsVersion.")
                    .and_then(|rest| rest.strip_suffix(".default.txt"))
                {
                    if let Some(version) = read_trimmed(&entry.path()) {
                        aliases.push((alias.to_owned(), version));
                    }
                } else if entry.path().is_dir() {
                    let file = entry.path().join(format!("Microsoft.VCToolsVersion.{name}.txt"));
                    if let Some(version) = read_trimmed(&file) {
                        aliases.push((name, version));
                    }
                }
            }
        }
        sorted_dirs(&self.path.join(r"VC\Tools\MSVC"))
            .into_iter()
            .filter(|(_, dir)| dir.join("bin").is_dir())
            .map(|(version, dir)| Toolset {
                default: default.as_deref() == Some(version.as_str()),
                aliases: aliases
                    .iter()
                    .filter(|(_, v)| *v == version)
                    .map(|(alias, _)| alias.clone())
                    .collect(),
                version,
                dir,
            })
            .collect()
    }

    /// `VC\Redist\MSVC\<Microsoft.VCRedistVersion.default.txt>`.
    pub fn redist_dir(&self) -> Option<PathBuf> {
        let version = read_trimmed(&self.path.join(r"VC\Auxiliary\Build\Microsoft.VCRedistVersion.default.txt"))?;
        let dir = self.path.join(r"VC\Redist\MSVC").join(version);
        dir.is_dir().then_some(dir)
    }

    /// The developer scripts of this instance plus `vswhere.exe` and the installer, by name.
    pub fn scripts(&self) -> Vec<(String, PathBuf)> {
        let mut scripts = Vec::new();
        let build = self.path.join(r"VC\Auxiliary\Build");
        if let Ok(entries) = build.read_dir() {
            let mut bats: Vec<(String, PathBuf)> = entries
                .filter_map(Result::ok)
                .filter_map(|entry| {
                    let name = entry.file_name().into_string().ok()?;
                    let stem = name.strip_suffix(".bat")?.to_owned();
                    Some((stem, entry.path()))
                })
                .collect();
            bats.sort();
            scripts.extend(bats);
        }
        let tools = self.path.join(r"Common7\Tools");
        for (name, file) in [
            ("VsDevCmd", "VsDevCmd.bat"),
            ("LaunchDevCmd", "LaunchDevCmd.bat"),
            ("VsMSBuildCmd", "VsMSBuildCmd.bat"),
            ("Launch-VsDevShell", "Launch-VsDevShell.ps1"),
            ("DevShell", "Microsoft.VisualStudio.DevShell.dll"),
        ] {
            let path = tools.join(file);
            if path.is_file() {
                scripts.push((name.to_owned(), path));
            }
        }
        if let Some(installer) = installer_dir() {
            for (name, file) in [("vswhere", "vswhere.exe"), ("setup", "setup.exe")] {
                let path = installer.join(file);
                if path.is_file() {
                    scripts.push((name.to_owned(), path));
                }
            }
        }
        scripts
    }

    /// The LLVM toolchain (clang, clang-cl, lld-link) installed with the instance, for `host`.
    pub fn llvm(&self, host: &str) -> Option<Llvm> {
        let root = self.path.join(r"VC\Tools\Llvm");
        let candidates: &[&str] = match host {
            "arm64" => &["ARM64", "x64", ""],
            "x64" => &["x64", ""],
            _ => &[""],
        };
        candidates.iter().find_map(|sub| {
            let dir = if sub.is_empty() { root.clone() } else { root.join(sub) };
            let bin = dir.join("bin");
            let clang_cl = bin.join("clang-cl.exe");
            clang_cl.is_file().then(|| Llvm {
                version: sorted_dirs(&dir.join(r"lib\clang")).into_iter().next().map(|(v, _)| v),
                dir,
                bin,
                clang_cl,
            })
        })
    }
}

/// `C:\Program Files (x86)\Microsoft Visual Studio\Installer`.
pub fn installer_dir() -> Option<PathBuf> {
    let base = var("ProgramFiles(x86)").or_else(|| var("ProgramFiles"))?;
    let dir = PathBuf::from(base).join(r"Microsoft Visual Studio\Installer");
    dir.is_dir().then_some(dir)
}

fn guess_version(path: &Path) -> String {
    let parent = path
        .parent()
        .and_then(|p| p.file_name())
        .and_then(|n| n.to_str())
        .unwrap_or("");
    let major = match parent {
        "2017" => 15,
        "2019" => 16,
        "2022" => 17,
        other => match other.parse::<u32>() {
            Ok(n) if (15..100).contains(&n) => n,
            _ => 0,
        },
    };
    if major > 0 {
        format!("{major}.0")
    } else {
        String::new()
    }
}

/// An MSVC toolset (`VC\Tools\MSVC\<version>`).
#[derive(Debug, Clone)]
pub struct Toolset {
    /// e.g. `14.44.35207`.
    pub version: String,
    pub dir: PathBuf,
    /// Whether `Microsoft.VCToolsVersion.default.txt` names it.
    pub default: bool,
    /// `v143`, `14.44.17.14`, ...: the side-by-side names the installer gives it.
    pub aliases: Vec<String>,
}

impl Toolset {
    pub fn matches(&self, query: &str) -> bool {
        version_matches(query, &self.version)
            || self.aliases.iter().any(|alias| alias.eq_ignore_ascii_case(query) || version_matches(query, alias))
    }

    /// `(host, [targets])` for every `bin\Host<host>\<target>` holding `cl.exe`.
    pub fn hosts(&self) -> Vec<(String, Vec<String>)> {
        let mut hosts: Vec<(String, Vec<String>)> = sorted_dirs(&self.dir.join("bin"))
            .into_iter()
            .filter_map(|(name, dir)| {
                let host = name.strip_prefix("Host")?.to_ascii_lowercase();
                let mut targets: Vec<String> = sorted_dirs(&dir)
                    .into_iter()
                    .filter(|(_, t)| t.join("cl.exe").is_file())
                    .map(|(t, _)| t.to_ascii_lowercase())
                    .collect();
                targets.sort();
                Some((host, targets))
            })
            .collect();
        hosts.sort();
        hosts
    }
}

/// The LLVM toolchain in `VC\Tools\Llvm`.
#[derive(Debug, Clone)]
pub struct Llvm {
    pub dir: PathBuf,
    pub bin: PathBuf,
    pub clang_cl: PathBuf,
    /// The clang version (`lib\clang\<version>`).
    pub version: Option<String>,
}

/// An installed Windows 10/11 SDK version.
#[derive(Debug, Clone)]
pub struct WindowsSdk {
    /// `C:\Program Files (x86)\Windows Kits\10`.
    pub dir: PathBuf,
    /// e.g. `10.0.26100.0`.
    pub version: String,
    /// `bin\<version>\<host>`: rc.exe, mt.exe, midl.exe, signtool.exe.
    pub bin: PathBuf,
    /// `UnionMetadata\<version>` (holds `Windows.winmd`), when installed.
    pub union_metadata: Option<PathBuf>,
    /// `References\<version>`, when installed.
    pub references: Option<PathBuf>,
    /// `um\Windows.h` and the `um` import libraries are present (vcvars ignores versions without).
    pub complete: bool,
    /// The Universal CRT of the same version is present.
    pub ucrt: bool,
}

impl WindowsSdk {
    pub fn windows_winmd(&self) -> Option<PathBuf> {
        self.union_metadata
            .as_ref()
            .map(|dir| dir.join("Windows.winmd"))
            .filter(|path| path.is_file())
    }
}

/// The Universal CRT (part of the Windows SDK install).
#[derive(Debug, Clone)]
pub struct Ucrt {
    pub dir: PathBuf,
    pub version: String,
}

/// An installed .NET Framework SDK (`NETFXSDK`).
#[derive(Debug, Clone)]
pub struct NetFxSdk {
    /// e.g. `4.8.1`.
    pub version: String,
    /// `C:\Program Files (x86)\Windows Kits\NETFXSDK\4.8.1`.
    pub dir: PathBuf,
    /// `...\Microsoft SDKs\Windows\v10.0A\bin\NETFX 4.8.1 Tools\` (x86) and its `x64` child.
    pub tools_x86: Option<PathBuf>,
    pub tools_x64: Option<PathBuf>,
}

/// Host architecture in Visual Studio spelling, or `None` on an unknown host.
pub fn host() -> Option<&'static str> {
    match host_arch() {
        X86 => Some("x86"),
        X86_64 => Some("x64"),
        AARCH64 => Some("arm64"),
        _ => None,
    }
}

/// `x64`/`x86_64`/`amd64`, `x86`/`i686`, `arm64`/`aarch64`, `arm64ec`, `arm` → the Visual Studio name.
pub fn normalize_arch(arch: &str) -> Option<&'static str> {
    Some(match arch.to_ascii_lowercase().as_str() {
        "x64" | "x86_64" | "amd64" => "x64",
        "x86" | "i686" | "i586" | "ia32" | "win32" => "x86",
        "arm64" | "aarch64" => "arm64",
        "arm64ec" => "arm64ec",
        "arm" | "thumbv7a" => "arm",
        _ => return None,
    })
}

fn com_instances() -> Vec<Instance> {
    if crate::com::initialize().is_err() {
        return Vec::new();
    }
    let Ok(config) = SetupConfiguration::new() else {
        return Vec::new();
    };
    let Ok(all) = config.enum_all_instances() else {
        return Vec::new();
    };
    all.filter_map(Result::ok)
        .filter_map(|instance| {
            let string = |value: Result<OsString, i32>| value.ok().and_then(|s| s.into_string().ok());
            let path = PathBuf::from(instance.installation_path().ok()?);
            let state = instance.state().ok();
            Some(Instance {
                id: string(instance.instance_id()).unwrap_or_default(),
                name: string(instance.installation_name()).unwrap_or_default(),
                version: string(instance.installation_version()).unwrap_or_default(),
                complete: state.map(|s| s == eComplete),
                reboot_required: state.map(|s| s & eNoRebootRequired == 0),
                path,
                sources: vec!["com"],
                ..Instance::default()
            })
        })
        .collect()
}

/// `%ProgramData%\Microsoft\VisualStudio\Packages\_Instances`.
pub fn instances_dir() -> PathBuf {
    let program_data = var("ProgramData").map_or_else(|| PathBuf::from(r"C:\ProgramData"), PathBuf::from);
    program_data.join(r"Microsoft\VisualStudio\Packages\_Instances")
}

fn state_instances() -> Vec<Instance> {
    sorted_dirs(&instances_dir())
        .into_iter()
        .filter_map(|(id, dir)| {
            let text = std::fs::read_to_string(dir.join("state.json")).ok()?;
            parse_state(&id, &text)
        })
        .collect()
}

/// An instance from the installer's `state.json` record.
pub fn parse_state(id: &str, text: &str) -> Option<Instance> {
    let state = Value::parse(text)?;
    let string = |path: &[&str]| state.at(path).and_then(Value::as_str).map(str::to_owned);
    Some(Instance {
        id: id.to_owned(),
        name: string(&["installationName"]).unwrap_or_default(),
        path: PathBuf::from(string(&["installationPath"])?),
        version: string(&["installationVersion"]).unwrap_or_default(),
        display_version: string(&["catalogInfo", "productDisplayVersion"]),
        product_id: string(&["product", "id"]),
        title: state
            .get("localizedResources")
            .and_then(|r| r.as_array().first())
            .and_then(|r| r.get("title"))
            .and_then(Value::as_str)
            .map(str::to_owned),
        channel: string(&["channelId"]),
        prerelease: state
            .at(&["catalogInfo", "productMilestoneIsPreRelease"])
            .and_then(Value::as_bool)
            .unwrap_or(false),
        components: state
            .get("selectedPackages")
            .map(Value::as_array)
            .unwrap_or_default()
            .iter()
            .filter_map(|p| p.get("id").and_then(Value::as_str).map(str::to_owned))
            .collect(),
        sources: vec!["state"],
        ..Instance::default()
    })
}

fn registry_instances() -> Vec<Instance> {
    let Ok(key) = LOCAL_MACHINE.open(r"SOFTWARE\Microsoft\VisualStudio\SxS\VS7".as_ref()) else {
        return Vec::new();
    };
    key.value_names()
        .into_iter()
        .filter_map(|name| {
            let name = name.into_string().ok()?;
            let major = version_key(&name).first().copied()?;
            if major < 15 {
                return None;
            }
            let path = PathBuf::from(key.query_str(&name).ok()?);
            Some(Instance {
                id: format!("registry:{name}"),
                version: name,
                ..Instance::bare(path, "registry")
            })
        })
        .collect()
}

fn env_instances() -> Vec<Instance> {
    let mut list = Vec::new();
    if let Some(dir) = var("VSINSTALLDIR") {
        list.push(Instance::bare(PathBuf::from(dir), "env"));
    }
    if let Some(dir) = var("VCToolsInstallDir") {
        // <instance>\VC\Tools\MSVC\<version>\
        if let Some(root) = Path::new(&dir).ancestors().nth(4) {
            list.push(Instance::bare(root.to_path_buf(), "env"));
        }
    }
    list
}

/// `Microsoft Visual Studio\<2017|2019|2022|18|...>\<product>` under both Program Files.
fn dir_instances() -> Vec<Instance> {
    let mut list = Vec::new();
    for base in ["ProgramFiles", "ProgramFiles(x86)"] {
        let Some(base) = var(base) else { continue };
        for (_, year) in sorted_dirs(&PathBuf::from(base).join("Microsoft Visual Studio")) {
            for (_, product) in sorted_dirs(&year) {
                if product.join(r"Common7\Tools").is_dir() || product.join(r"VC\Tools\MSVC").is_dir() {
                    list.push(Instance::bare(product, "dir"));
                }
            }
        }
    }
    list
}

fn merge(list: &mut Vec<Instance>, found: Instance) {
    let key = path_key(&found.path);
    let Some(existing) = list.iter_mut().find(|i| path_key(&i.path) == key) else {
        list.push(found);
        return;
    };
    for source in found.sources {
        if !existing.sources.contains(&source) {
            existing.sources.push(source);
        }
    }
    let installer = |id: &str| !id.is_empty() && !matches!(id, "registry" | "env" | "dir") && !id.starts_with("registry:");
    if !installer(&existing.id) && installer(&found.id) {
        existing.id = found.id;
    }
    if existing.name.is_empty() {
        existing.name = found.name;
    }
    if version_key(&found.version).len() > version_key(&existing.version).len() || existing.version.is_empty() {
        if !found.version.is_empty() {
            existing.version = found.version;
        }
    }
    existing.display_version = existing.display_version.take().or(found.display_version);
    existing.product_id = existing.product_id.take().or(found.product_id);
    existing.title = existing.title.take().or(found.title);
    existing.channel = existing.channel.take().or(found.channel);
    existing.prerelease |= found.prerelease;
    existing.complete = existing.complete.or(found.complete);
    existing.reboot_required = existing.reboot_required.or(found.reboot_required);
    if existing.components.is_empty() {
        existing.components = found.components;
    }
}

/// Every Visual Studio 2017+ instance from every source, newest version first.
pub fn instances() -> Vec<Instance> {
    let mut list = Vec::new();
    for found in com_instances()
        .into_iter()
        .chain(state_instances())
        .chain(registry_instances())
        .chain(env_instances())
        .chain(dir_instances())
    {
        if found.path.is_dir() {
            merge(&mut list, found);
        }
    }
    list.sort_by(|a, b| version_key(&b.version).cmp(&version_key(&a.version)));
    list
}

/// Selects an instance by id, path, product (`BuildTools`, `Community`), year (`2026`) or
/// version prefix (`18`, `17.14`).
pub fn instance_matches(instance: &Instance, query: &str) -> bool {
    instance.id.eq_ignore_ascii_case(query)
        || path_key(&instance.path) == path_key(Path::new(query))
        || instance.product().eq_ignore_ascii_case(query)
        || instance.product_id.as_deref().is_some_and(|id| id.eq_ignore_ascii_case(query))
        || instance.year().is_some_and(|year| year.to_string() == query)
        || version_matches(query, &instance.version)
        || instance.display_version.as_deref().is_some_and(|v| version_matches(query, v))
}

fn kits_roots() -> Vec<PathBuf> {
    let mut roots: Vec<PathBuf> = Vec::new();
    let mut push = |path: PathBuf| {
        if path.join("Include").is_dir() && !roots.iter().any(|r| path_key(r) == path_key(&path)) {
            roots.push(path);
        }
    };
    if let Some(dir) = var("WindowsSdkDir") {
        push(PathBuf::from(dir));
    }
    for (key, value) in [
        (r"SOFTWARE\Microsoft\Windows Kits\Installed Roots", "KitsRoot10"),
        (r"SOFTWARE\Microsoft\Microsoft SDKs\Windows\v10.0", "InstallationFolder"),
    ] {
        if let Some(root) = LOCAL_MACHINE.open(key.as_ref()).ok().and_then(|k| k.query_str(value).ok()) {
            push(PathBuf::from(root));
        }
    }
    if let Some(base) = var("ProgramFiles(x86)") {
        push(PathBuf::from(base).join(r"Windows Kits\10"));
    }
    roots
}

/// Every Windows 10/11 SDK version under every Windows Kits root, newest first.
pub fn windows_sdks() -> Vec<WindowsSdk> {
    let host = host().unwrap_or("x64");
    let existing = |path: PathBuf| path.is_dir().then_some(path);
    let mut sdks: Vec<WindowsSdk> = Vec::new();
    for root in kits_roots() {
        for (version, include) in sorted_dirs(&root.join("Include")) {
            if !version.starts_with("10.") {
                continue;
            }
            let lib = root.join("Lib").join(&version);
            sdks.push(WindowsSdk {
                bin: root.join("bin").join(&version).join(host),
                union_metadata: existing(root.join("UnionMetadata").join(&version)),
                references: existing(root.join("References").join(&version)),
                complete: include.join(r"um\Windows.h").is_file() && lib.join(r"um\x64\kernel32.lib").is_file()
                    || include.join(r"um\Windows.h").is_file() && lib.join(r"um\arm64\kernel32.lib").is_file(),
                ucrt: lib.join("ucrt").is_dir() && include.join("ucrt").is_dir(),
                dir: root.clone(),
                version,
            });
        }
    }
    sdks.sort_by(|a, b| version_key(&b.version).cmp(&version_key(&a.version)));
    sdks
}

/// The newest complete Windows SDK, or the one `WindowsSdkDir`/`WindowsSDKVersion` name.
pub fn windows_sdk() -> Option<WindowsSdk> {
    select_sdk(None).ok()
}

fn select_sdk(query: Option<&str>) -> Result<WindowsSdk, String> {
    let sdks = windows_sdks();
    let env_version = var("WindowsSDKVersion").and_then(|v| v.into_string().ok());
    let query = query.map(str::to_owned).or(env_version);
    match query {
        Some(query) => sdks
            .into_iter()
            .find(|sdk| version_matches(&query, &sdk.version))
            .ok_or_else(|| format!("Windows SDK {query} is not installed")),
        None => sdks
            .into_iter()
            .find(|sdk| sdk.complete)
            .ok_or_else(|| "no Windows 10/11 SDK is installed".to_owned()),
    }
}

/// The Universal CRT of `sdk`'s version, or the newest one.
pub fn ucrt_for(sdk: Option<&WindowsSdk>) -> Option<Ucrt> {
    if let Some(sdk) = sdk.filter(|sdk| sdk.ucrt) {
        return Some(Ucrt {
            dir: sdk.dir.clone(),
            version: sdk.version.clone(),
        });
    }
    windows_sdks().into_iter().find(|sdk| sdk.ucrt).map(|sdk| Ucrt {
        dir: sdk.dir,
        version: sdk.version,
    })
}

/// The newest Universal CRT.
pub fn ucrt() -> Option<Ucrt> {
    ucrt_for(None)
}

/// Every .NET Framework SDK registered under `NETFXSDK` whose directory exists, newest first.
pub fn netfx_sdks() -> Vec<NetFxSdk> {
    let Ok(root) = LOCAL_MACHINE.open(r"SOFTWARE\Microsoft\Microsoft SDKs\NETFXSDK".as_ref()) else {
        return Vec::new();
    };
    let mut list: Vec<NetFxSdk> = root
        .iter()
        .filter_map(Result::ok)
        .filter_map(|version| {
            let key = root.open(&version).ok()?;
            let dir = PathBuf::from(key.query_str("KitsInstallationFolder").ok()?);
            if !dir.join(r"include\um").is_dir() {
                return None;
            }
            let tools = |sub: &str| {
                key.open(sub.as_ref())
                    .ok()
                    .and_then(|k| k.query_str("InstallationFolder").ok())
                    .map(PathBuf::from)
                    .filter(|p| p.is_dir())
            };
            Some(NetFxSdk {
                version: version.into_string().ok()?,
                dir,
                tools_x86: tools("WinSDK-NetFx40Tools"),
                tools_x64: tools("WinSDK-NetFx40Tools-x64"),
            })
        })
        .collect();
    list.sort_by(|a, b| version_key(&b.version).cmp(&version_key(&a.version)));
    list
}

/// `Microsoft.Windows.SDK.Win32Metadata`'s `Windows.Win32.winmd` (newest NuGet package in
/// `NUGET_PACKAGES` or `%USERPROFILE%\.nuget\packages`): full namespaces, enums, `SetLastError`.
pub fn win32_metadata() -> Option<PathBuf> {
    let packages = var("NUGET_PACKAGES")
        .map(PathBuf::from)
        .or_else(|| var("USERPROFILE").map(|home| PathBuf::from(home).join(".nuget").join("packages")))?;
    sorted_dirs(&packages.join("microsoft.windows.sdk.win32metadata"))
        .into_iter()
        .map(|(_, dir)| dir.join("Windows.Win32.winmd"))
        .find(|winmd| winmd.is_file())
}

/// What to resolve. Empty fields pick the defaults `vcvarsall.bat` would.
#[derive(Debug, Clone, Default)]
pub struct Options {
    /// Target architecture (any spelling `normalize_arch` accepts); the host by default.
    pub arch: Option<String>,
    /// Host architecture of the tools; the native host by default.
    pub host: Option<String>,
    /// See `instance_matches`.
    pub instance: Option<String>,
    /// Exact version, prefix (`14.44`) or alias (`v143`, `14.44.17.14`); `VCToolsVersion`, then
    /// the instance default, otherwise.
    pub toolset: Option<String>,
    /// Exact version or prefix (`10.0.26100`); `WindowsSDKVersion`, then the newest, otherwise.
    pub sdk: Option<String>,
    /// Spectre-mitigated libraries (`vcvarsall -vcvars_spectre_libs=spectre`).
    pub spectre: bool,
}

/// Everything needed to run the MSVC tools for one host and target.
#[derive(Debug, Clone)]
pub struct Toolchain {
    /// Target architecture in Visual Studio spelling: `x64`, `x86`, `arm64`, `arm64ec`, `arm`.
    pub arch: &'static str,
    /// Host architecture of the selected tools.
    pub host: &'static str,
    pub instance: Instance,
    pub toolset: Toolset,
    /// Whether the toolset was chosen explicitly (sets `VSCMD_ARG_VCVARS_VER`).
    pub toolset_query: Option<String>,
    /// `...\bin\Host<host>\<arch>`: cl.exe, link.exe, lib.exe, dumpbin.exe, ml64.exe.
    pub vc_bin: PathBuf,
    /// `...\bin\Host<host>\<host>`: host DLLs needed by cross tools.
    pub vc_host_bin: PathBuf,
    pub sdk: Option<WindowsSdk>,
    pub ucrt: Option<Ucrt>,
    pub netfx: Option<NetFxSdk>,
    pub llvm: Option<Llvm>,
    pub spectre: bool,
    /// Prepended to `PATH`.
    pub path: Vec<PathBuf>,
    /// Appended to `PATH` (CMake and Ninja, as vcvars does).
    pub path_append: Vec<PathBuf>,
    pub include: Vec<PathBuf>,
    pub lib: Vec<PathBuf>,
    pub libpath: Vec<PathBuf>,
}

impl Toolchain {
    /// The toolset version, e.g. `14.44.35207`.
    pub fn vc_tools_version(&self) -> &str {
        &self.toolset.version
    }

    pub fn vc_tools_dir(&self) -> &Path {
        &self.toolset.dir
    }
}

fn vs_dir(arch: &str) -> &'static str {
    match arch {
        "x64" => "x64",
        "x86" => "x86",
        "arm64" | "arm64ec" => "arm64",
        _ => "arm",
    }
}

fn host_candidates(native: &str) -> Vec<&'static str> {
    match native {
        "x86" => vec!["x86"],
        "x64" => vec!["x64", "x86"],
        "arm64" if is_amd64_emulation_supported() => vec!["arm64", "x64", "x86"],
        "arm64" => vec!["arm64", "x86"],
        _ => vec![],
    }
}

/// Resolves the toolchain for `options`, or says what is missing.
pub fn resolve(options: &Options) -> Result<Toolchain, String> {
    resolve_in(options, instances())
}

/// [`resolve`] over an already enumerated instance list.
pub fn resolve_in(options: &Options, instances: Vec<Instance>) -> Result<Toolchain, String> {
    let native = host().ok_or("unsupported host architecture")?;
    let arch = match &options.arch {
        Some(arch) => normalize_arch(arch).ok_or_else(|| format!("unknown architecture: {arch}"))?,
        None => native,
    };
    let hosts: Vec<&'static str> = match &options.host {
        Some(host) => vec![normalize_arch(host).ok_or_else(|| format!("unknown host architecture: {host}"))?],
        None => host_candidates(native),
    };
    let toolset_query = options
        .toolset
        .clone()
        .or_else(|| var("VCToolsVersion").and_then(|v| v.into_string().ok()));

    if instances.is_empty() {
        return Err("no Visual Studio or Build Tools instance is installed".to_owned());
    }
    let candidates: Vec<Instance> = match &options.instance {
        Some(query) => {
            let found: Vec<Instance> = instances.into_iter().filter(|i| instance_matches(i, query)).collect();
            if found.is_empty() {
                return Err(format!("no Visual Studio instance matches {query}"));
            }
            found
        }
        None => instances,
    };

    let target_dir = vs_dir(arch);
    let mut chosen = None;
    for instance in &candidates {
        let toolsets = instance.toolsets();
        let ordered: Vec<&Toolset> = match &toolset_query {
            Some(query) => toolsets.iter().filter(|t| t.matches(query)).collect(),
            None => toolsets.iter().filter(|t| t.default).chain(toolsets.iter().filter(|t| !t.default)).collect(),
        };
        let found = ordered.into_iter().find_map(|toolset| {
            hosts.iter().find_map(|&host| {
                let host_dir = toolset.dir.join("bin").join(format!("Host{}", vs_dir(host)));
                let bin = host_dir.join(target_dir);
                bin.join("cl.exe").is_file().then(|| (toolset.clone(), host, bin, host_dir.join(vs_dir(host))))
            })
        });
        if let Some(found) = found {
            chosen = Some((instance.clone(), found));
            break;
        }
    }
    let Some((instance, (toolset, host, vc_bin, vc_host_bin))) = chosen else {
        return Err(match &toolset_query {
            Some(query) => format!("no MSVC toolset matching {query} targets {arch}"),
            None => format!("no MSVC toolset targets {arch} (install the C++ build tools component)"),
        });
    };

    let sdk = select_sdk(options.sdk.as_deref()).ok();
    if let (Some(query), None) = (&options.sdk, &sdk) {
        return Err(format!("Windows SDK {query} is not installed"));
    }
    let ucrt = ucrt_for(sdk.as_ref());
    let netfx = netfx_sdks().into_iter().next();
    let llvm = instance.llvm(host);

    let mut toolchain = Toolchain {
        arch,
        host,
        toolset_query: options.toolset.clone(),
        vc_bin,
        vc_host_bin,
        sdk,
        ucrt,
        netfx,
        llvm,
        spectre: options.spectre,
        path: Vec::new(),
        path_append: Vec::new(),
        include: Vec::new(),
        lib: Vec::new(),
        libpath: Vec::new(),
        instance,
        toolset,
    };
    toolchain.compute_paths();
    Ok(toolchain)
}

/// The toolchain for `arch` with the default instance, toolset and SDK.
pub fn toolchain(arch: &str) -> Option<Toolchain> {
    resolve(&Options {
        arch: Some(arch.to_owned()),
        ..Options::default()
    })
    .ok()
}

/// `C:\Windows\Microsoft.NET\Framework64\v4.0.30319` (or `Framework` on a 32-bit host).
fn framework_dir(host: &str) -> Option<(PathBuf, &'static str)> {
    let windir = var("SystemRoot").or_else(|| var("windir"))?;
    let name = if host == "x86" { "Framework" } else { "Framework64" };
    let dir = PathBuf::from(windir).join(r"Microsoft.NET").join(name);
    dir.join("v4.0.30319").is_dir().then_some((dir, "v4.0.30319"))
}

impl Toolchain {
    fn compute_paths(&mut self) {
        let vs = self.instance.path.clone();
        let target = vs_dir(self.arch);
        let ide = vs.join(r"Common7\IDE");
        let existing = |paths: Vec<PathBuf>| -> Vec<PathBuf> { paths.into_iter().filter(|p| p.is_dir()).collect() };

        // PATH, in vcvarsall's order.
        let mut path = vec![self.vc_bin.clone()];
        if self.vc_host_bin != self.vc_bin {
            path.push(self.vc_host_bin.clone());
        }
        path.extend(existing(vec![
            ide.join(r"VC\VCPackages"),
            ide.join(r"CommonExtensions\Microsoft\TestWindow"),
            ide.join(r"CommonExtensions\Microsoft\TeamFoundation\Team Explorer"),
            vs.join(r"MSBuild\Current\bin\Roslyn"),
        ]));
        if let Some(netfx) = &self.netfx {
            let tools = if self.host == "x86" { &netfx.tools_x86 } else { &netfx.tools_x64 };
            path.extend(tools.clone());
        }
        path.extend(existing(vec![
            vs.join(r"Team Tools\DiagnosticsHub\Collector"),
            ide.join(r"Extensions\Microsoft\CodeCoverage.Console"),
        ]));
        if let Some(sdk) = &self.sdk {
            path.extend(existing(vec![
                sdk.dir.join("bin").join(&sdk.version).join(self.host),
                sdk.dir.join("bin").join(self.host),
            ]));
        }
        let msbuild = if self.host == "x86" {
            vs.join(r"MSBuild\Current\Bin")
        } else if self.host == "arm64" && vs.join(r"MSBuild\Current\Bin\arm64").is_dir() {
            vs.join(r"MSBuild\Current\Bin\arm64")
        } else {
            vs.join(r"MSBuild\Current\Bin\amd64")
        };
        path.extend(existing(vec![msbuild]));
        if let Some((framework, version)) = framework_dir(self.host) {
            path.push(framework.join(version));
        }
        path.extend(existing(vec![ide.clone(), vs.join(r"Common7\Tools")]));
        self.path = path;
        self.path_append = existing(vec![
            ide.join(r"CommonExtensions\Microsoft\CMake\CMake\bin"),
            ide.join(r"CommonExtensions\Microsoft\CMake\Ninja"),
        ]);

        // INCLUDE
        let toolset = self.toolset.dir.clone();
        let atl = toolset.join("ATLMFC");
        let mut include = vec![toolset.join("include")];
        include.extend(existing(vec![atl.join("include"), vs.join(r"VC\Auxiliary\VS\include")]));
        if let Some(ucrt) = &self.ucrt {
            include.push(ucrt.dir.join("include").join(&ucrt.version).join("ucrt"));
        }
        if let Some(sdk) = &self.sdk {
            let dir = sdk.dir.join("include").join(&sdk.version);
            include.extend(existing(vec![dir.join("um"), dir.join("shared"), dir.join("winrt"), dir.join("cppwinrt")]));
        }
        if let Some(netfx) = &self.netfx {
            include.push(netfx.dir.join(r"include\um"));
        }
        self.include = include;

        // LIB
        let lib_dir = if self.spectre { toolset.join(r"lib\spectre") } else { toolset.join("lib") };
        let atl_lib = if self.spectre { atl.join(r"lib\spectre") } else { atl.join("lib") };
        let mut lib = existing(vec![atl_lib.join(target)]);
        lib.push(lib_dir.join(target));
        if self.arch == "arm64ec" {
            lib.extend(existing(vec![lib_dir.join("arm64ec")]));
        }
        if let Some(netfx) = &self.netfx {
            lib.extend(existing(vec![netfx.dir.join(r"lib\um").join(target)]));
        }
        if let Some(ucrt) = &self.ucrt {
            lib.push(ucrt.dir.join("lib").join(&ucrt.version).join("ucrt").join(target));
        }
        if let Some(sdk) = &self.sdk {
            lib.push(sdk.dir.join("lib").join(&sdk.version).join("um").join(target));
        }
        self.lib = lib;

        // LIBPATH
        let mut libpath = existing(vec![atl_lib.join(target)]);
        libpath.push(lib_dir.join(target));
        libpath.extend(existing(vec![toolset.join(r"lib\x86\store\references")]));
        if let Some(sdk) = &self.sdk {
            libpath.extend(sdk.union_metadata.clone());
            libpath.extend(sdk.references.clone());
        }
        if let Some((framework, version)) = framework_dir(self.host) {
            libpath.push(framework.join(version));
        }
        self.libpath = libpath;
    }

    /// The variables `vcvarsall.bat` sets to fixed values (everything but the path lists).
    pub fn vars(&self) -> Vec<(&'static str, String)> {
        let slash = |path: &Path| format!("{}\\", path.display().to_string().trim_end_matches('\\'));
        let vs = &self.instance.path;
        let mut vars: Vec<(&'static str, String)> = vec![
            ("VSINSTALLDIR", slash(vs)),
            ("VCINSTALLDIR", slash(&vs.join("VC"))),
            ("VCToolsInstallDir", slash(&self.toolset.dir)),
            ("VCToolsVersion", self.toolset.version.clone()),
            ("VisualStudioVersion", self.instance.visual_studio_version()),
            ("VSCMD_ARG_HOST_ARCH", self.host.to_owned()),
            ("VSCMD_ARG_TGT_ARCH", self.arch.to_owned()),
            ("VSCMD_ARG_app_plat", "Desktop".to_owned()),
            (
                "VSCMD_VER",
                self.instance.display_version.clone().unwrap_or_else(|| self.instance.version.clone()),
            ),
            ("CommandPromptType", if self.host == self.arch { "Native" } else { "Cross" }.to_owned()),
            ("DevEnvDir", slash(&vs.join(r"Common7\IDE"))),
        ];
        if let Some(query) = &self.toolset_query {
            vars.push(("VSCMD_ARG_VCVARS_VER", query.clone()));
        }
        if self.spectre {
            vars.push(("VSCMD_ARG_VCVARS_SPECTRE", "spectre".to_owned()));
        }
        let comntools = match self.instance.major() {
            15 => Some("VS150COMNTOOLS"),
            16 => Some("VS160COMNTOOLS"),
            17 => Some("VS170COMNTOOLS"),
            18 => Some("VS180COMNTOOLS"),
            _ => None,
        };
        if let Some(name) = comntools {
            vars.push((name, slash(&vs.join(r"Common7\Tools"))));
        }
        let vc_ide = vs.join(r"Common7\IDE\VC");
        if vc_ide.is_dir() {
            vars.push(("VCIDEInstallDir", slash(&vc_ide)));
        }
        if let Some(redist) = self.instance.redist_dir() {
            vars.push(("VCToolsRedistDir", slash(&redist)));
        }
        if self.arch != "x86" {
            vars.push(("Platform", self.arch.to_owned()));
        }
        if let Some((framework, version)) = framework_dir(self.host) {
            vars.push(("FrameworkDir", slash(&framework)));
            vars.push(("FrameworkVersion", version.to_owned()));
            vars.push(("Framework40Version", "v4.0".to_owned()));
            if self.host != "x86" {
                vars.push(("FrameworkDir64", slash(&framework)));
                vars.push(("FrameworkVersion64", version.to_owned()));
                vars.push(("__DOTNET_ADD_64BIT", "1".to_owned()));
                vars.push(("__DOTNET_PREFERRED_BITNESS", "64".to_owned()));
            } else {
                vars.push(("FrameworkDir32", slash(&framework)));
                vars.push(("FrameworkVersion32", version.to_owned()));
                vars.push(("__DOTNET_ADD_32BIT", "1".to_owned()));
                vars.push(("__DOTNET_PREFERRED_BITNESS", "32".to_owned()));
            }
        }
        if let Some(netfx) = &self.netfx {
            vars.push(("NETFXSDKDir", slash(&netfx.dir)));
            if let Some(x64) = &netfx.tools_x64 {
                vars.push(("WindowsSDK_ExecutablePath_x64", slash(x64)));
            }
            if let Some(x86) = &netfx.tools_x86 {
                vars.push(("WindowsSDK_ExecutablePath_x86", slash(x86)));
            }
        }
        if let Some(sdk) = &self.sdk {
            vars.extend([
                ("WindowsSdkDir", slash(&sdk.dir)),
                ("WindowsSDKVersion", format!("{}\\", sdk.version)),
                ("WindowsSDKLibVersion", format!("{}\\", sdk.version)),
                ("WindowsSdkBinPath", slash(&sdk.dir.join("bin"))),
                ("WindowsSdkVerBinPath", slash(&sdk.dir.join("bin").join(&sdk.version))),
            ]);
            let lib_path: Vec<String> = sdk
                .union_metadata
                .iter()
                .chain(sdk.references.iter())
                .map(|p| p.display().to_string())
                .collect();
            if !lib_path.is_empty() {
                vars.push(("WindowsLibPath", lib_path.join(";")));
            }
            if let Some(base) = var("ProgramFiles(x86)") {
                let extension = PathBuf::from(base).join(r"Microsoft SDKs\Windows Kits\10\ExtensionSDKs");
                if extension.is_dir() {
                    vars.push(("ExtensionSdkDir", extension.display().to_string()));
                }
            }
        }
        if let Some(ucrt) = &self.ucrt {
            vars.push(("UniversalCRTSdkDir", slash(&ucrt.dir)));
            vars.push(("UCRTVersion", ucrt.version.clone()));
        }
        vars
    }

    /// `(name, prepended, appended)` for `PATH`, `INCLUDE`, `EXTERNAL_INCLUDE`, `LIB`, `LIBPATH`.
    pub fn lists(&self) -> Vec<(&'static str, &[PathBuf], &[PathBuf])> {
        vec![
            ("PATH", &self.path, &self.path_append),
            ("INCLUDE", &self.include, &[]),
            ("EXTERNAL_INCLUDE", &self.include, &[]),
            ("LIB", &self.lib, &[]),
            ("LIBPATH", &self.libpath, &[]),
        ]
    }

    /// The environment after `vcvarsall.bat`: the path lists around their current values (from
    /// `current`), then the fixed variables.
    pub fn env_with(&self, current: &dyn Fn(&str) -> Option<OsString>) -> Vec<(&'static str, OsString)> {
        let mut vars = Vec::new();
        for (name, prepend, append) in self.lists() {
            let previous = current(name).unwrap_or_default();
            let previous: Vec<PathBuf> = std::env::split_paths(&previous).collect();
            let mut all: Vec<PathBuf> = prepend.to_vec();
            all.extend(previous.iter().cloned());
            for path in append {
                if !previous.iter().any(|p| path_key(p) == path_key(path)) {
                    all.push(path.clone());
                }
            }
            vars.push((name, std::env::join_paths(all).unwrap_or_default()));
        }
        vars.extend(self.vars().into_iter().map(|(k, v)| (k, OsString::from(v))));
        vars
    }

    /// [`Toolchain::env_with`] over this process's environment.
    pub fn env(&self) -> Vec<(&'static str, OsString)> {
        self.env_with(&|name| var(name))
    }

    /// The full path of `tool` (`cl`, `link`, `rc`, `midl`, `mt`, `lib`, `dumpbin`, `clang-cl`,
    /// `cmake`, ... with or without `.exe`) in this toolchain's directories.
    pub fn which(&self, tool: &str) -> Option<PathBuf> {
        let has_ext = Path::new(tool).extension().is_some_and(|ext| ext.eq_ignore_ascii_case("exe"));
        self.path
            .iter()
            .chain(self.llvm.iter().map(|llvm| &llvm.bin))
            .chain(self.path_append.iter())
            .find_map(|dir| {
                let path = if has_ext { dir.join(tool) } else { dir.join(format!("{tool}.exe")) };
                path.is_file().then_some(path)
            })
    }
}

/// Tools `bun msvc which` and `toolchain().tools` resolve.
pub const TOOLS: [&str; 14] = [
    "cl", "link", "lib", "dumpbin", "editbin", "nmake", "ml64", "rc", "midl", "mt", "signtool", "clang-cl", "cmake",
    "ninja",
];

fn path_str(path: &Path) -> String {
    path.display().to_string()
}

fn write_instance(w: &mut Writer, instance: &Instance) {
    w.begin_object()
        .field("id", &instance.id)
        .field("name", &instance.name)
        .field("product", &instance.product())
        .key("productId")
        .opt_str(instance.product_id.as_deref())
        .key("title")
        .opt_str(instance.title.as_deref())
        .field("version", &instance.version)
        .key("displayVersion")
        .opt_str(instance.display_version.as_deref())
        .key("year");
    match instance.year() {
        Some(year) => w.num(year.into()),
        None => w.null(),
    };
    w.key("channel")
        .opt_str(instance.channel.as_deref())
        .key("prerelease")
        .bool(instance.prerelease)
        .key("complete")
        .opt_bool(instance.complete)
        .key("rebootRequired")
        .opt_bool(instance.reboot_required)
        .field("path", &path_str(&instance.path));
    w.key("sources").begin_array();
    for source in &instance.sources {
        w.str(source);
    }
    w.end_array();
    w.key("toolsets").begin_array();
    for toolset in instance.toolsets() {
        write_toolset(w, &toolset);
    }
    w.end_array();
    w.key("scripts").begin_object();
    for (name, path) in instance.scripts() {
        w.field(&name, &path_str(&path));
    }
    w.end_object();
    w.key("llvm");
    write_llvm(w, instance.llvm(host().unwrap_or("x64")).as_ref());
    w.key("components").begin_array();
    for component in &instance.components {
        w.str(component);
    }
    w.end_array();
    w.end_object();
}

fn write_toolset(w: &mut Writer, toolset: &Toolset) {
    w.begin_object()
        .field("version", &toolset.version)
        .field("dir", &path_str(&toolset.dir))
        .key("default")
        .bool(toolset.default);
    w.key("aliases").begin_array();
    for alias in &toolset.aliases {
        w.str(alias);
    }
    w.end_array();
    w.key("hosts").begin_object();
    for (host, targets) in toolset.hosts() {
        w.key(&host).begin_array();
        for target in targets {
            w.str(&target);
        }
        w.end_array();
    }
    w.end_object().end_object();
}

fn write_llvm(w: &mut Writer, llvm: Option<&Llvm>) {
    match llvm {
        Some(llvm) => {
            w.begin_object()
                .key("version")
                .opt_str(llvm.version.as_deref())
                .field("dir", &path_str(&llvm.dir))
                .field("bin", &path_str(&llvm.bin))
                .field("clangCl", &path_str(&llvm.clang_cl))
                .end_object();
        }
        None => {
            w.null();
        }
    }
}

fn write_sdk(w: &mut Writer, sdk: Option<&WindowsSdk>) {
    let Some(sdk) = sdk else {
        w.null();
        return;
    };
    w.begin_object()
        .field("version", &sdk.version)
        .field("dir", &path_str(&sdk.dir))
        .field("bin", &path_str(&sdk.bin))
        .key("complete")
        .bool(sdk.complete)
        .key("unionMetadata")
        .opt_str(sdk.union_metadata.as_deref().map(path_str).as_deref())
        .key("windowsWinmd")
        .opt_str(sdk.windows_winmd().as_deref().map(path_str).as_deref())
        .end_object();
}

fn write_netfx(w: &mut Writer, netfx: Option<&NetFxSdk>) {
    let Some(netfx) = netfx else {
        w.null();
        return;
    };
    w.begin_object()
        .field("version", &netfx.version)
        .field("dir", &path_str(&netfx.dir))
        .key("tools")
        .opt_str(netfx.tools_x64.as_ref().or(netfx.tools_x86.as_ref()).map(|p| path_str(p)).as_deref())
        .end_object();
}

fn write_paths(w: &mut Writer, key: &str, paths: &[PathBuf]) {
    w.key(key).begin_array();
    for path in paths {
        w.str(&path_str(path));
    }
    w.end_array();
}

/// Everything about the toolchain for `options` as JSON: the shape of `bun msvc info` and of
/// `toolchain()` in `bun:windows`.
pub fn report(options: &Options) -> String {
    let instances = instances();
    let resolved = resolve_in(options, instances.clone());
    let toolchain = resolved.as_ref().ok();
    let sdks = windows_sdks();
    let netfx = netfx_sdks();
    let native = host().unwrap_or("x64");
    let arch = options
        .arch
        .as_deref()
        .and_then(normalize_arch)
        .unwrap_or(native);

    let mut w = Writer::new();
    w.begin_object()
        .field("arch", toolchain.map_or(arch, |t| t.arch))
        .field("host", toolchain.map_or(native, |t| t.host))
        .key("error")
        .opt_str(resolved.as_ref().err().map(String::as_str));
    w.key("instances").begin_array();
    for instance in &instances {
        write_instance(&mut w, instance);
    }
    w.end_array();
    w.key("sdks").begin_array();
    for sdk in &sdks {
        write_sdk(&mut w, Some(sdk));
    }
    w.end_array();
    w.key("netfxSdks").begin_array();
    for sdk in &netfx {
        write_netfx(&mut w, Some(sdk));
    }
    w.end_array();
    w.key("instance");
    match toolchain {
        Some(t) => write_instance(&mut w, &t.instance),
        None => {
            w.null();
        }
    }
    w.key("msvc");
    match toolchain {
        Some(t) => {
            w.begin_object()
                .field("version", &t.toolset.version)
                .field("dir", &path_str(&t.toolset.dir))
                .field("bin", &path_str(&t.vc_bin))
                .field("hostBin", &path_str(&t.vc_host_bin))
                .key("default")
                .bool(t.toolset.default)
                .end_object();
        }
        None => {
            w.null();
        }
    }
    w.key("sdk");
    let fallback_sdk = if toolchain.is_none() { windows_sdk() } else { None };
    write_sdk(&mut w, toolchain.and_then(|t| t.sdk.as_ref()).or(fallback_sdk.as_ref()));
    w.key("ucrt");
    let ucrt = toolchain.map_or_else(ucrt, |t| t.ucrt.clone());
    match &ucrt {
        Some(ucrt) => {
            w.begin_object()
                .field("version", &ucrt.version)
                .field("dir", &path_str(&ucrt.dir))
                .end_object();
        }
        None => {
            w.null();
        }
    }
    w.key("netfx");
    write_netfx(&mut w, toolchain.map_or(netfx.first(), |t| t.netfx.as_ref()));
    w.key("llvm");
    write_llvm(&mut w, toolchain.and_then(|t| t.llvm.as_ref()));
    w.key("scripts").begin_object();
    if let Some(t) = toolchain {
        for (name, path) in t.instance.scripts() {
            w.field(&name, &path_str(&path));
        }
    } else if let Some(installer) = installer_dir() {
        for (name, file) in [("vswhere", "vswhere.exe"), ("setup", "setup.exe")] {
            let path = installer.join(file);
            if path.is_file() {
                w.field(name, &path_str(&path));
            }
        }
    }
    w.end_object();
    w.key("tools").begin_object();
    for tool in TOOLS {
        w.key(tool)
            .opt_str(toolchain.and_then(|t| t.which(tool)).as_deref().map(path_str).as_deref());
    }
    w.end_object();
    w.key("env");
    match toolchain {
        Some(t) => {
            w.begin_object();
            for (name, value) in t.env() {
                w.field(name, &value.to_string_lossy());
            }
            w.end_object();
        }
        None => {
            w.null();
        }
    }
    w.key("paths");
    match toolchain {
        Some(t) => {
            w.begin_object();
            write_paths(&mut w, "path", &t.path);
            write_paths(&mut w, "pathAppend", &t.path_append);
            write_paths(&mut w, "include", &t.include);
            write_paths(&mut w, "lib", &t.lib);
            write_paths(&mut w, "libpath", &t.libpath);
            w.end_object();
        }
        None => {
            w.null();
        }
    }
    w.end_object();
    w.finish()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_prefixes() {
        assert!(version_matches("14.44", "14.44.35207"));
        assert!(version_matches("14.44.35207", "14.44.35207"));
        assert!(!version_matches("14.4", "14.44.35207"));
        assert!(!version_matches("14.441", "14.44.35207"));
        assert!(version_matches("10.0.26100", "10.0.26100.0"));
        assert!(version_key("14.51.36231") > version_key("14.44.35207"));
        assert!(version_key("10.0.26100.0") > version_key("10.0.22621.0"));
    }

    #[test]
    fn parses_installer_state() {
        let json = r#"{"installationName":"VisualStudio/18.10.2+12217.157","installationPath":"C:\\VS\\18\\BuildTools","installationVersion":"18.10.12217.157","catalogInfo":{"productDisplayVersion":"18.10.2","productMilestoneIsPreRelease":"False"},"channelId":"VisualStudio.18.Release","product":{"id":"Microsoft.VisualStudio.Product.BuildTools"},"localizedResources":[{"title":"Visual Studio Build Tools 2026"}],"selectedPackages":[{"id":"Microsoft.VisualStudio.Component.VC.Tools.x86.x64","version":"18.0"}]}"#;
        let instance = parse_state("75701dc3", json).unwrap();
        assert_eq!(instance.product(), "BuildTools");
        assert_eq!(instance.year(), Some(2026));
        assert_eq!(instance.display_version.as_deref(), Some("18.10.2"));
        assert!(instance.has_component("Microsoft.VisualStudio.Component.VC.Tools.x86.x64"));
        assert!(instance_matches(&instance, "2026"));
        assert!(instance_matches(&instance, "buildtools"));
        assert!(instance_matches(&instance, "18.10"));
        assert!(instance_matches(&instance, r"c:\vs\18\buildtools\"));
        assert!(!instance_matches(&instance, "17"));
    }

    #[test]
    fn guesses_versions_from_install_directories() {
        assert_eq!(guess_version(Path::new(r"C:\Program Files\Microsoft Visual Studio\2022\Community")), "17.0");
        assert_eq!(guess_version(Path::new(r"C:\Program Files\Microsoft Visual Studio\18\Preview")), "18.0");
        assert_eq!(guess_version(Path::new(r"D:\VS")), "");
    }

    #[test]
    fn instances_are_sorted_newest_first_and_unique() {
        let list = instances();
        for pair in list.windows(2) {
            assert!(version_key(&pair[0].version) >= version_key(&pair[1].version));
        }
        for (i, a) in list.iter().enumerate() {
            assert!(list[i + 1..].iter().all(|b| path_key(&a.path) != path_key(&b.path)));
        }
    }

    #[test]
    fn resolves_every_installed_toolset() {
        let Some(instance) = instances().into_iter().find(|i| !i.toolsets().is_empty()) else {
            return;
        };
        for toolset in instance.toolsets() {
            let prefix: String = toolset.version.split('.').take(2).collect::<Vec<_>>().join(".");
            let options = Options {
                arch: Some("x64".into()),
                toolset: Some(prefix.clone()),
                instance: Some(instance.path.display().to_string()),
                ..Options::default()
            };
            let Ok(toolchain) = resolve(&options) else { continue };
            assert!(toolchain.toolset.matches(&prefix));
            assert!(toolchain.which("cl").is_some_and(|cl| cl.starts_with(&toolchain.toolset.dir)));
            let env = toolchain.env_with(&|_| None);
            let get = |name: &str| env.iter().find(|(k, _)| *k == name).map(|(_, v)| v.to_string_lossy().into_owned());
            assert_eq!(get("VCToolsVersion").as_deref(), Some(toolchain.toolset.version.as_str()));
            assert!(get("INCLUDE").unwrap().contains(&toolchain.toolset.version));
            assert_eq!(get("VSCMD_ARG_VCVARS_VER").as_deref(), Some(prefix.as_str()));
        }
        let missing = resolve(&Options {
            toolset: Some("13.99".into()),
            ..Options::default()
        });
        assert!(missing.unwrap_err().contains("13.99"));
    }

    #[test]
    fn report_is_valid_json() {
        let report = report(&Options::default());
        let value = Value::parse(&report).expect("report parses");
        assert!(value.get("instances").is_some());
        assert!(value.get("sdks").is_some());
    }
}
