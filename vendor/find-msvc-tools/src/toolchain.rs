//! Bun addition: the whole native toolchain at once — every Visual Studio / Build Tools instance,
//! the newest MSVC toolset of the newest instance that targets the requested architecture, the
//! Windows SDK (with its `UnionMetadata`), the Universal CRT, and the environment `vcvarsall.bat`
//! would produce for it. Instances come from the Setup Configuration COM API, or the installer's
//! `state.json` records when COM is not registered; `vswhere.exe` is never run.

use std::ffi::OsString;
use std::path::{Path, PathBuf};

use super::impl_::{
    atl_paths, get_sdk10_dir, get_sdks, get_ucrt_dir, host_arch, parse_version,
    vs15plus_instances, vs15plus_vc_paths, vs15plus_vc_read_version, AARCH64, X86, X86_64,
};
use super::{EnvGetter, StdEnvGetter, TargetArch};

/// A Visual Studio 2017+ (or Build Tools) installation.
#[derive(Debug, Clone)]
pub struct Instance {
    pub id: String,
    /// e.g. `VisualStudio/18.10.2+12217.157`.
    pub name: String,
    pub path: PathBuf,
    /// e.g. `18.10.12217.157`.
    pub version: String,
}

impl Instance {
    /// `BuildTools`, `Community`, `Professional`, `Enterprise`, ...: the installation directory name.
    pub fn product(&self) -> &str {
        self.path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("")
    }

    /// `VisualStudioVersion` as vcvars sets it: the major version followed by `.0`.
    pub fn visual_studio_version(&self) -> String {
        let major = self.version.split('.').next().unwrap_or("");
        format!("{major}.0")
    }
}

/// The installed Windows 10/11 SDK.
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
}

/// The Universal CRT (part of the Windows SDK install).
#[derive(Debug, Clone)]
pub struct Ucrt {
    pub dir: PathBuf,
    pub version: String,
}

/// Everything needed to run the MSVC tools for one target architecture.
#[derive(Debug, Clone)]
pub struct Toolchain {
    /// Target architecture in Visual Studio spelling: `x64`, `x86`, `arm64`, `arm64ec`, `arm`.
    pub arch: &'static str,
    /// Host architecture in Visual Studio spelling.
    pub host: &'static str,
    pub instance: Instance,
    /// e.g. `14.44.35207`.
    pub vc_tools_version: String,
    /// `<instance>\VC\Tools\MSVC\<version>`.
    pub vc_tools_dir: PathBuf,
    /// `...\bin\Host<host>\<arch>`: cl.exe, link.exe, lib.exe, dumpbin.exe, ml64.exe.
    pub vc_bin: PathBuf,
    /// `...\bin\Host<host>\<host>`: host DLLs needed by cross tools.
    pub vc_host_bin: PathBuf,
    pub sdk: Option<WindowsSdk>,
    pub ucrt: Option<Ucrt>,
    pub path: Vec<PathBuf>,
    pub include: Vec<PathBuf>,
    pub lib: Vec<PathBuf>,
    pub libpath: Vec<PathBuf>,
}

fn arch_name(arch: TargetArch) -> &'static str {
    match arch {
        TargetArch::X64 => "x64",
        TargetArch::X86 => "x86",
        TargetArch::Arm64 => "arm64",
        TargetArch::Arm64ec => "arm64ec",
        TargetArch::Arm => "arm",
    }
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

/// Every Visual Studio 2017+ instance, newest version first.
pub fn instances() -> Vec<Instance> {
    let Some(found) = vs15plus_instances(TargetArch::X64, &StdEnvGetter) else {
        return Vec::new();
    };
    let mut list: Vec<Instance> = found
        .into_iter()
        .filter_map(|instance| {
            Some(Instance {
                id: instance.instance_id().map(|id| id.into_owned()).unwrap_or_default(),
                name: instance.installation_name()?.into_owned(),
                path: instance.installation_path()?,
                version: instance.installation_version()?.into_owned(),
            })
        })
        .collect();
    list.sort_by_key(|instance| std::cmp::Reverse(parse_version(&instance.version)));
    list
}

/// The newest Windows 10/11 SDK (or the one named by `WindowsSdkDir`/`WindowsSDKVersion`).
pub fn windows_sdk() -> Option<WindowsSdk> {
    let (dir, version) = get_sdk10_dir(&StdEnvGetter)?;
    let host = host()?;
    let existing = |path: PathBuf| path.is_dir().then_some(path);
    Some(WindowsSdk {
        bin: dir.join("bin").join(&version).join(host),
        union_metadata: existing(dir.join("UnionMetadata").join(&version)),
        references: existing(dir.join("References").join(&version)),
        dir,
        version,
    })
}

/// `Windows.Win32.winmd` of the newest `Microsoft.Windows.SDK.Win32Metadata` NuGet package in
/// `NUGET_PACKAGES` or `%USERPROFILE%\.nuget\packages` (full namespaces, enums, `SetLastError`).
pub fn win32_metadata() -> Option<PathBuf> {
    let packages = std::env::var_os("NUGET_PACKAGES")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("USERPROFILE").map(|home| PathBuf::from(home).join(".nuget").join("packages")))?;
    let dir = packages.join("microsoft.windows.sdk.win32metadata");
    let mut versions: Vec<(Vec<u64>, PathBuf)> = dir
        .read_dir()
        .ok()?
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let name = entry.file_name().into_string().ok()?;
            let winmd = entry.path().join("Windows.Win32.winmd");
            let key = name
                .split(['.', '-'])
                .map(|part| part.parse::<u64>().unwrap_or(0))
                .collect();
            winmd.is_file().then_some((key, winmd))
        })
        .collect();
    versions.sort();
    versions.pop().map(|(_, path)| path)
}

/// The newest Universal CRT.
pub fn ucrt() -> Option<Ucrt> {
    get_ucrt_dir().map(|(dir, version)| Ucrt { dir, version })
}

/// The toolchain for `arch` (`x64`/`x86_64`, `x86`/`i686`, `arm64`/`aarch64`, `arm64ec`, `arm`), from
/// the newest instance whose default (or `VCToolsVersion`) toolset can target it.
pub fn toolchain(arch: &str) -> Option<Toolchain> {
    let target = TargetArch::new(arch)?;
    let env: &dyn EnvGetter = &StdEnvGetter;
    let host = host()?;
    let instance = instances().into_iter().find(|instance| {
        vs15plus_vc_paths(target, &instance.path, env).is_some()
    })?;
    let (vc_tools_dir, vc_bin, vc_host_bin, lib, alt_lib, include) =
        vs15plus_vc_paths(target, &instance.path, env)?;
    let vc_tools_version = vs15plus_vc_read_version(&instance.path, env)?;
    let sdk_paths = get_sdks(target, env);
    let sdk = windows_sdk();
    let ucrt = ucrt();

    let mut toolchain = Toolchain {
        arch: arch_name(target),
        host,
        vc_tools_version,
        vc_bin: vc_bin.clone(),
        vc_host_bin: vc_host_bin.clone(),
        path: vec![vc_bin, vc_host_bin],
        include: vec![include],
        lib: Vec::new(),
        libpath: Vec::new(),
        vc_tools_dir: vc_tools_dir.clone(),
        instance,
        sdk,
        ucrt,
    };
    toolchain.lib.extend(alt_lib);
    toolchain.lib.push(lib.clone());
    toolchain.libpath.push(lib);
    if let Some((atl_lib, atl_include)) = atl_paths(target, &vc_tools_dir) {
        toolchain.lib.push(atl_lib.clone());
        toolchain.libpath.push(atl_lib);
        toolchain.include.push(atl_include);
    }
    let auxiliary = toolchain.instance.path.join(r"VC\Auxiliary\VS\include");
    if auxiliary.is_dir() {
        toolchain.include.push(auxiliary);
    }
    if let Some(sdk_paths) = sdk_paths {
        toolchain.path.extend(sdk_paths.path);
        toolchain.include.extend(sdk_paths.include);
        toolchain.lib.extend(sdk_paths.libs);
    }
    if let Some(sdk) = &toolchain.sdk {
        toolchain.libpath.extend(sdk.union_metadata.clone());
        toolchain.libpath.extend(sdk.references.clone());
    }
    let ide = toolchain.instance.path.join(r"Common7\IDE");
    let tools = toolchain.instance.path.join(r"Common7\Tools");
    let msbuild = toolchain.instance.path.join(r"MSBuild\Current\Bin\amd64");
    toolchain
        .path
        .extend([ide, tools, msbuild].into_iter().filter(|dir| dir.is_dir()));
    Some(toolchain)
}

fn with_slash(path: &Path) -> OsString {
    let mut s = path.as_os_str().to_owned();
    s.push("\\");
    s
}

fn join(paths: &[PathBuf], previous: Option<OsString>) -> OsString {
    let previous = previous.unwrap_or_default();
    let all = paths
        .iter()
        .cloned()
        .chain(std::env::split_paths(&previous));
    std::env::join_paths(all).unwrap_or_default()
}

impl Toolchain {
    /// The variables `vcvarsall.bat <arch>` sets, with `PATH`, `INCLUDE`, `LIB` and `LIBPATH`
    /// prepended to their current values.
    pub fn env(&self) -> Vec<(&'static str, OsString)> {
        let current = |name: &'static str| StdEnvGetter.get_env(name).map(|v| v.as_ref().to_owned());
        let mut vars = vec![
            ("PATH", join(&self.path, current("PATH"))),
            ("INCLUDE", join(&self.include, current("INCLUDE"))),
            ("EXTERNAL_INCLUDE", join(&self.include, current("EXTERNAL_INCLUDE"))),
            ("LIB", join(&self.lib, current("LIB"))),
            ("LIBPATH", join(&self.libpath, current("LIBPATH"))),
            ("VSINSTALLDIR", with_slash(&self.instance.path)),
            ("VCINSTALLDIR", with_slash(&self.instance.path.join("VC"))),
            ("VCToolsInstallDir", with_slash(&self.vc_tools_dir)),
            ("VCToolsVersion", self.vc_tools_version.clone().into()),
            ("VisualStudioVersion", self.instance.visual_studio_version().into()),
            ("VSCMD_ARG_HOST_ARCH", self.host.into()),
            ("VSCMD_ARG_TGT_ARCH", self.arch.into()),
            ("VSCMD_VER", self.instance.version.clone().into()),
            ("DevEnvDir", with_slash(&self.instance.path.join(r"Common7\IDE"))),
        ];
        if self.arch != "x86" {
            vars.push(("Platform", self.arch.into()));
        }
        if let Some(sdk) = &self.sdk {
            vars.extend([
                ("WindowsSdkDir", with_slash(&sdk.dir)),
                ("WindowsSDKVersion", format!("{}\\", sdk.version).into()),
                ("WindowsSDKLibVersion", format!("{}\\", sdk.version).into()),
                ("WindowsSdkBinPath", with_slash(&sdk.dir.join("bin"))),
                ("WindowsSdkVerBinPath", with_slash(&sdk.dir.join("bin").join(&sdk.version))),
            ]);
            if let Some(union_metadata) = &sdk.union_metadata {
                let mut lib_path = with_slash(union_metadata);
                if let Some(references) = &sdk.references {
                    lib_path.push(";");
                    lib_path.push(with_slash(references));
                }
                vars.push(("WindowsLibPath", lib_path));
            }
        }
        if let Some(ucrt) = &self.ucrt {
            vars.push(("UniversalCRTSdkDir", with_slash(&ucrt.dir)));
            vars.push(("UCRTVersion", ucrt.version.clone().into()));
        }
        vars
    }

    /// The full path of `tool` (`cl`, `link`, `rc`, `midl`, `mt`, `lib`, `dumpbin`, ... with or
    /// without `.exe`) in this toolchain's `PATH` directories.
    pub fn which(&self, tool: &str) -> Option<PathBuf> {
        let has_ext = Path::new(tool).extension().is_some();
        self.path.iter().find_map(|dir| {
            let path = dir.join(tool);
            if has_ext && path.is_file() {
                return Some(path);
            }
            let exe = dir.join(format!("{tool}.exe"));
            exe.is_file().then_some(exe)
        })
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn toolchain_matches_installed_tools() {
        let Some(toolchain) = super::toolchain("x64") else {
            return;
        };
        assert_eq!(toolchain.arch, "x64");
        assert!(toolchain.which("cl").is_some_and(|cl| cl.ends_with(r"x64\cl.exe")));
        assert!(toolchain.which("link.exe").is_some());
        assert!(toolchain.vc_tools_dir.ends_with(&toolchain.vc_tools_version));
        let env = toolchain.env();
        let include = &env.iter().find(|(k, _)| *k == "INCLUDE").unwrap().1;
        assert!(include.to_string_lossy().contains(&toolchain.vc_tools_version));
        if let Some(sdk) = &toolchain.sdk {
            assert!(toolchain.which("rc").is_some());
            if let Some(union_metadata) = &sdk.union_metadata {
                assert!(union_metadata.join("Windows.winmd").is_file());
            }
        }
    }

    #[test]
    fn instances_are_sorted_newest_first() {
        let list = super::instances();
        for pair in list.windows(2) {
            assert!(super::parse_version(&pair[0].version) >= super::parse_version(&pair[1].version));
        }
    }
}
