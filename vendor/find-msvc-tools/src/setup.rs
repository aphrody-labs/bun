//! Bun addition: install, modify or repair Visual Studio / Build Tools through the Visual Studio
//! Installer (`setup.exe`) or winget, and find (and remove) the orphaned Windows Installer
//! registrations that make the installer fail with 1714/1612 (`C:\Windows\Installer` no longer
//! holds the cached `.msi` of a product the registry still lists).

use std::ffi::OsStr;
use std::os::windows::ffi::OsStrExt;
use std::path::{Path, PathBuf};
use std::process::Command;

use crate::registry::LOCAL_MACHINE_64;
use crate::toolchain::{self, installer_dir, normalize_arch, var, version_key, Instance};
/// What `bun msvc setup` should make true.
#[derive(Debug, Clone, Default)]
pub struct SetupOptions {
    /// Target architecture the C++ tools must support; the host by default.
    pub arch: Option<String>,
    /// An MSVC toolset that must be installed (`14.44` adds the side-by-side component).
    pub toolset: Option<String>,
    /// A Windows SDK version that must be installed (`10.0.26100`).
    pub sdk: Option<String>,
    /// Extra installer component or workload ids.
    pub add: Vec<String>,
    /// Which instance to modify (see `toolchain::instance_matches`); the newest by default.
    pub instance: Option<String>,
    /// Repair the instance instead of adding components.
    pub repair: bool,
    /// Update the instance to the newest release of its channel.
    pub update: bool,
    /// Product to install when no instance exists: `buildtools` (default), `community`, ...
    pub product: Option<String>,
}

/// One command of a plan.
#[derive(Debug, Clone)]
pub struct Step {
    pub program: PathBuf,
    pub args: Vec<String>,
    /// Why this step is needed.
    pub reason: String,
}

impl Step {
    /// The command line, quoted for display.
    pub fn display(&self) -> String {
        std::iter::once(self.program.display().to_string())
            .chain(self.args.iter().cloned())
            .map(|arg| if arg.contains(' ') { format!("\"{arg}\"") } else { arg })
            .collect::<Vec<_>>()
            .join(" ")
    }
}

/// The installer component that provides the C++ tools for `arch`.
pub fn vc_tools_component(arch: &str) -> &'static str {
    match arch {
        "arm64" | "arm64ec" => "Microsoft.VisualStudio.Component.VC.Tools.ARM64",
        "arm" => "Microsoft.VisualStudio.Component.VC.Tools.ARM",
        _ => "Microsoft.VisualStudio.Component.VC.Tools.x86.x64",
    }
}

/// `10.0.26100` → `Microsoft.VisualStudio.Component.Windows11SDK.26100`;
/// `10.0.19041` → `...Windows10SDK.19041`.
pub fn sdk_component(version: &str) -> Option<String> {
    let build = *version_key(version).get(2)?;
    if build == 0 {
        return None;
    }
    let family = if build >= 22000 { "Windows11SDK" } else { "Windows10SDK" };
    Some(format!("Microsoft.VisualStudio.Component.{family}.{build}"))
}

/// The side-by-side component of an older MSVC toolset (`14.44` →
/// `Microsoft.VisualStudio.Component.VC.14.44.17.14.x86.x64`): v143 toolsets `14.3x`/`14.4x`
/// come from Visual Studio 2022 17.(minor - 30), v142 `14.29` from 2019 16.11.
pub fn toolset_component(toolset: &str, arch: &str) -> Option<String> {
    let key = version_key(toolset);
    let (major, minor) = (*key.first()?, *key.get(1)?);
    if major != 14 {
        return None;
    }
    let vs = match minor {
        30..=49 => format!("17.{}", minor - 30),
        29 => "16.11".to_owned(),
        _ => return None,
    };
    let suffix = match arch {
        "arm64" | "arm64ec" => "ARM64",
        "arm" => "ARM",
        _ => "x86.x64",
    };
    Some(format!("Microsoft.VisualStudio.Component.VC.14.{minor}.{vs}.{suffix}"))
}

fn winget() -> Option<PathBuf> {
    let local = var("LOCALAPPDATA")?;
    let path = PathBuf::from(local).join(r"Microsoft\WindowsApps\winget.exe");
    path.is_file().then_some(path).or_else(|| Some(PathBuf::from("winget.exe")))
}

/// The commands that make `options` true, without running them.
pub fn plan(options: &SetupOptions, instances: &[Instance]) -> Result<Vec<Step>, String> {
    let host = toolchain::host().unwrap_or("x64");
    let arch = match &options.arch {
        Some(arch) => normalize_arch(arch).ok_or_else(|| format!("unknown architecture: {arch}"))?,
        None => host,
    };
    let instance = match &options.instance {
        Some(query) => Some(
            instances
                .iter()
                .find(|i| toolchain::instance_matches(i, query))
                .ok_or_else(|| format!("no Visual Studio instance matches {query}"))?,
        ),
        // Prefer an instance that already has the C++ tools.
        None => instances
            .iter()
            .find(|i| !i.toolsets().is_empty())
            .or_else(|| instances.first()),
    };

    let mut wanted = vec![vc_tools_component(arch).to_owned()];
    if let Some(sdk) = &options.sdk {
        wanted.push(sdk_component(sdk).ok_or_else(|| format!("not a Windows 10/11 SDK version: {sdk}"))?);
    } else if !toolchain::windows_sdks().iter().any(|sdk| sdk.complete) {
        wanted.push("Microsoft.VisualStudio.Component.Windows11SDK.26100".to_owned());
    }
    if let Some(query) = &options.toolset {
        let installed = instance.is_some_and(|i| i.toolsets().iter().any(|t| t.matches(query)));
        if !installed {
            // Toolsets newer than v143 ship with the main C++ tools component.
            if let Some(component) = toolset_component(query, arch) {
                wanted.push(component);
            }
        }
    }
    wanted.extend(options.add.iter().cloned());

    let Some(instance) = instance else {
        let product = options.product.as_deref().unwrap_or("buildtools").to_ascii_lowercase();
        let id = match product.as_str() {
            "buildtools" => "Microsoft.VisualStudio.BuildTools",
            "community" => "Microsoft.VisualStudio.Community",
            "professional" => "Microsoft.VisualStudio.Professional",
            "enterprise" => "Microsoft.VisualStudio.Enterprise",
            other => return Err(format!("unknown product: {other}")),
        };
        let mut overrides = vec!["--quiet".to_owned(), "--wait".to_owned(), "--norestart".to_owned()];
        for component in &wanted {
            overrides.push("--add".to_owned());
            overrides.push(component.clone());
        }
        overrides.push("--includeRecommended".to_owned());
        return Ok(vec![Step {
            program: winget().ok_or("winget is not installed")?,
            args: [
                "install",
                "--id",
                id,
                "--exact",
                "--silent",
                "--accept-package-agreements",
                "--accept-source-agreements",
                "--override",
            ]
            .iter()
            .map(|s| s.to_string())
            .chain(std::iter::once(overrides.join(" ")))
            .collect(),
            reason: "no Visual Studio or Build Tools instance is installed".to_owned(),
        }]);
    };

    let setup = installer_dir()
        .map(|dir| dir.join("setup.exe"))
        .filter(|p| p.is_file())
        .ok_or("the Visual Studio Installer (setup.exe) is missing; reinstall it with winget")?;
    let path = instance.path.display().to_string();
    let quiet = ["--quiet", "--norestart"].map(String::from);
    let mut steps = Vec::new();
    if options.repair {
        steps.push(Step {
            program: setup.clone(),
            args: ["repair", "--installPath", &path, "--quiet", "--norestart", "--force"].map(String::from).to_vec(),
            reason: "--repair".to_owned(),
        });
    }
    if options.update {
        steps.push(Step {
            program: setup.clone(),
            args: ["update", "--installPath", &path].map(String::from).into_iter().chain(quiet.clone()).collect(),
            reason: "--update".to_owned(),
        });
    }
    if instance.complete == Some(false) && instance.reboot_required != Some(true) && !options.repair {
        steps.push(Step {
            program: setup.clone(),
            args: ["resume", "--installPath", &path].map(String::from).into_iter().chain(quiet.clone()).collect(),
            reason: "the last install of this instance did not finish".to_owned(),
        });
    }
    let missing: Vec<&String> = wanted
        .iter()
        .filter(|c| !instance.has_component(c))
        // Instances found without installer records: trust the files for the C++ tools.
        .filter(|c| !(instance.components.is_empty() && c.starts_with("Microsoft.VisualStudio.Component.VC.Tools") && !instance.toolsets().is_empty()))
        .collect();
    if !missing.is_empty() {
        let mut args = vec!["modify".to_owned(), "--installPath".to_owned(), path.clone()];
        for component in &missing {
            args.push("--add".to_owned());
            args.push((*component).clone());
        }
        args.extend(quiet);
        steps.push(Step {
            program: setup,
            args,
            reason: format!("missing components in {}", instance.path.display()),
        });
    }
    Ok(steps)
}

/// What running a step did.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Outcome {
    Done,
    /// Done, but Windows must restart before the tools work (3010, 1641).
    RebootRequired,
    Failed(i32, &'static str),
}

/// Meaning of a Visual Studio Installer / winget exit code.
pub fn outcome(code: i32) -> Outcome {
    match code {
        0 => Outcome::Done,
        3010 | 1641 => Outcome::RebootRequired,
        740 => Outcome::Failed(code, "administrator rights are required"),
        1001 => Outcome::Failed(code, "another Visual Studio Installer is running"),
        1003 => Outcome::Failed(code, "Visual Studio is in use; close it and retry"),
        1602 => Outcome::Failed(code, "the operation was cancelled"),
        1612 | 1714 => Outcome::Failed(code, "an MSI's cached package is missing; run `bun msvc msi --fix` as administrator"),
        5007 => Outcome::Failed(code, "the computer does not meet the requirements"),
        5004 => Outcome::Failed(code, "the operation was cancelled"),
        8001..=8010 => Outcome::Failed(code, "an installer precheck failed"),
        -1073720687 => Outcome::Failed(code, "no network connection to download the packages"),
        -1073741510 => Outcome::Failed(code, "the Visual Studio Installer was terminated"),
        _ => Outcome::Failed(code, "the installer failed"),
    }
}

mod ffi {
use crate::windows_link;

#[repr(C)]
pub(super) struct ShellExecuteInfoW {
    pub(super) cb_size: u32,
    pub(super) f_mask: u32,
    pub(super) hwnd: *mut core::ffi::c_void,
    pub(super) lp_verb: *const u16,
    pub(super) lp_file: *const u16,
    pub(super) lp_parameters: *const u16,
    pub(super) lp_directory: *const u16,
    pub(super) n_show: i32,
    pub(super) h_inst_app: *mut core::ffi::c_void,
    pub(super) lp_id_list: *mut core::ffi::c_void,
    pub(super) lp_class: *const u16,
    pub(super) hkey_class: *mut core::ffi::c_void,
    pub(super) dw_hot_key: u32,
    pub(super) h_icon_or_monitor: *mut core::ffi::c_void,
    pub(super) h_process: *mut core::ffi::c_void,
}

windows_link::link!("shell32.dll" "system" fn ShellExecuteExW(info : *mut ShellExecuteInfoW) -> i32);
windows_link::link!("shell32.dll" "system" fn IsUserAnAdmin() -> i32);
windows_link::link!("kernel32.dll" "system" fn WaitForSingleObject(handle : *mut core::ffi::c_void, ms : u32) -> u32);
windows_link::link!("kernel32.dll" "system" fn GetExitCodeProcess(handle : *mut core::ffi::c_void, code : *mut u32) -> i32);
windows_link::link!("kernel32.dll" "system" fn CloseHandle(handle : *mut core::ffi::c_void) -> i32);

#[link(name = "shell32")]
extern "C" {}
}
use ffi::*;

/// Whether this process runs elevated.
pub fn is_elevated() -> bool {
    unsafe { IsUserAnAdmin() != 0 }
}

fn wide(s: &OsStr) -> Vec<u16> {
    s.encode_wide().chain(Some(0)).collect()
}

fn quote_arg(arg: &str) -> String {
    if !arg.is_empty() && !arg.contains([' ', '\t', '"']) {
        return arg.to_owned();
    }
    let mut out = String::from("\"");
    let mut backslashes = 0;
    for ch in arg.chars() {
        match ch {
            '\\' => backslashes += 1,
            '"' => {
                out.extend(std::iter::repeat('\\').take(backslashes * 2 + 1));
                out.push('"');
                backslashes = 0;
            }
            c => {
                out.extend(std::iter::repeat('\\').take(backslashes));
                out.push(c);
                backslashes = 0;
            }
        }
    }
    out.extend(std::iter::repeat('\\').take(backslashes * 2));
    out.push('"');
    out
}

/// Runs `program args` through the UAC prompt and waits for it; returns its exit code.
pub fn run_elevated(program: &Path, args: &[String]) -> Result<i32, String> {
    let file = wide(program.as_os_str());
    let params = wide(OsStr::new(&args.iter().map(|a| quote_arg(a)).collect::<Vec<_>>().join(" ")));
    let verb = wide(OsStr::new("runas"));
    let mut info = ShellExecuteInfoW {
        cb_size: std::mem::size_of::<ShellExecuteInfoW>() as u32,
        // SEE_MASK_NOCLOSEPROCESS | SEE_MASK_NOASYNC | SEE_MASK_FLAG_NO_UI
        f_mask: 0x40 | 0x100 | 0x400,
        hwnd: std::ptr::null_mut(),
        lp_verb: verb.as_ptr(),
        lp_file: file.as_ptr(),
        lp_parameters: params.as_ptr(),
        lp_directory: std::ptr::null(),
        n_show: 0,
        h_inst_app: std::ptr::null_mut(),
        lp_id_list: std::ptr::null_mut(),
        lp_class: std::ptr::null(),
        hkey_class: std::ptr::null_mut(),
        dw_hot_key: 0,
        h_icon_or_monitor: std::ptr::null_mut(),
        h_process: std::ptr::null_mut(),
    };
    unsafe {
        if ShellExecuteExW(&mut info) == 0 {
            return Err(format!("elevation failed: {}", std::io::Error::last_os_error()));
        }
        if info.h_process.is_null() {
            return Err("elevation started no process".to_owned());
        }
        WaitForSingleObject(info.h_process, u32::MAX);
        let mut code = 0u32;
        GetExitCodeProcess(info.h_process, &mut code);
        CloseHandle(info.h_process);
        Ok(code as i32)
    }
}

/// Runs a step, elevating through UAC when the program requires it.
pub fn run(step: &Step) -> Result<Outcome, String> {
    match Command::new(&step.program).args(&step.args).status() {
        Ok(status) => Ok(outcome(status.code().unwrap_or(1))),
        // ERROR_ELEVATION_REQUIRED: setup.exe's manifest asks for administrator rights.
        Err(err) if err.raw_os_error() == Some(740) => run_elevated(&step.program, &step.args).map(outcome),
        Err(err) => Err(format!("{}: {err}", step.program.display())),
    }
}

/// A Windows Installer product registered for the machine.
#[derive(Debug, Clone)]
pub struct MsiProduct {
    /// The packed (registry) product code.
    pub packed: String,
    /// `{XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX}`.
    pub product_code: String,
    pub name: String,
    pub version: String,
    /// `C:\Windows\Installer\xxxx.msi`, as the registry records it.
    pub local_package: Option<String>,
}

const USER_DATA: &str = r"SOFTWARE\Microsoft\Windows\CurrentVersion\Installer\UserData\S-1-5-18\Products";

/// Name fragments of the products the Visual Studio Installer, the Windows SDK and the
/// .NET SDKs install as MSIs.
const TOOLCHAIN_PRODUCTS: [&str; 18] = [
    "visual c++",
    "vs_",
    "visual studio",
    "vc_",
    "windows sdk",
    "windows software development",
    ".net",
    "windows app",
    "winrt",
    "universal crt",
    "kits",
    "msi development",
    "application verifier",
    "windows desktop extension",
    "windows iot",
    "windows team",
    "windows mobile",
    "sdk arm",
];

/// `0BA8F9C5...` (packed) → `{5C9F8AB0-...}`: the first three groups are reversed, the last
/// eight bytes have their nibbles swapped.
pub fn unpack_guid(packed: &str) -> Option<String> {
    if packed.len() != 32 || !packed.bytes().all(|b| b.is_ascii_hexdigit()) {
        return None;
    }
    let rev = |s: &str| s.chars().rev().collect::<String>();
    let swap = |s: &str| {
        s.as_bytes()
            .chunks(2)
            .map(|pair| format!("{}{}", pair[1] as char, pair[0] as char))
            .collect::<String>()
    };
    Some(format!(
        "{{{}-{}-{}-{}-{}}}",
        rev(&packed[0..8]),
        rev(&packed[8..12]),
        rev(&packed[12..16]),
        swap(&packed[16..20]),
        swap(&packed[20..32])
    ))
}

/// Every machine-wide MSI of the Visual Studio / Windows SDK family.
pub fn msi_products() -> Vec<MsiProduct> {
    let Ok(products) = LOCAL_MACHINE_64.open(USER_DATA.as_ref()) else {
        return Vec::new();
    };
    products
        .iter()
        .filter_map(Result::ok)
        .filter_map(|packed| {
            let packed = packed.into_string().ok()?;
            let props = products.open(format!(r"{packed}\InstallProperties").as_ref()).ok()?;
            let name = props.query_str("DisplayName").ok()?.into_string().ok()?;
            let lower = name.to_ascii_lowercase();
            if !TOOLCHAIN_PRODUCTS.iter().any(|p| lower.contains(p)) {
                return None;
            }
            Some(MsiProduct {
                product_code: unpack_guid(&packed)?,
                version: props.query_str("DisplayVersion").ok().and_then(|v| v.into_string().ok()).unwrap_or_default(),
                local_package: props
                    .query_str("LocalPackage")
                    .ok()
                    .and_then(|v| v.into_string().ok())
                    .filter(|v| !v.is_empty()),
                packed,
                name,
            })
        })
        .collect()
}

/// The products whose cached `.msi` is gone: Windows Installer cannot repair, upgrade or remove
/// them, and the Visual Studio Installer fails on them with 1714 or 1612.
pub fn msi_orphans() -> Vec<MsiProduct> {
    msi_products()
        .into_iter()
        .filter(|p| p.local_package.as_deref().map_or(true, |path| !Path::new(path).is_file()))
        .collect()
}

/// Removes the registration of an orphaned product (exported first to `backup_dir` with
/// `reg.exe export`), so the installers reinstall it from scratch. Needs administrator rights.
pub fn remove_registration(product: &MsiProduct, backup_dir: &Path) -> Result<Vec<String>, String> {
    std::fs::create_dir_all(backup_dir).map_err(|e| format!("{}: {e}", backup_dir.display()))?;
    let reg = var("SystemRoot")
        .map(|root| PathBuf::from(root).join(r"System32\reg.exe"))
        .unwrap_or_else(|| PathBuf::from("reg.exe"));
    let keys = [
        (r"SOFTWARE\Classes\Installer\Products", product.packed.clone()),
        (r"SOFTWARE\Classes\Installer\Features", product.packed.clone()),
        (USER_DATA, product.packed.clone()),
        (r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall", product.product_code.clone()),
        (r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall", product.product_code.clone()),
    ];
    let mut removed = Vec::new();
    for (index, (parent, child)) in keys.iter().enumerate() {
        let full = format!(r"{parent}\{child}");
        if LOCAL_MACHINE_64.open(full.as_ref()).is_err() {
            continue;
        }
        let backup = backup_dir.join(format!("{}-{index}.reg", product.packed));
        let status = Command::new(&reg)
            .args(["export", &format!(r"HKLM\{full}")])
            .arg(&backup)
            .args(["/y", "/reg:64"])
            .output()
            .map_err(|e| format!("reg export: {e}"))?;
        if !status.status.success() {
            return Err(format!("reg export HKLM\\{full} failed; nothing was removed for this key"));
        }
        LOCAL_MACHINE_64
            .open_writable(parent.as_ref())
            .and_then(|key| key.delete_tree(child.as_ref()))
            .map_err(|e| format!("HKLM\\{full}: {e}"))?;
        removed.push(format!(r"HKLM\{full}"));
    }
    let upgrade_codes = r"SOFTWARE\Classes\Installer\UpgradeCodes";
    if let Ok(codes) = LOCAL_MACHINE_64.open(upgrade_codes.as_ref()) {
        for code in codes.iter().filter_map(Result::ok) {
            let full = format!(r"{upgrade_codes}\{}", code.to_string_lossy());
            let Ok(key) = LOCAL_MACHINE_64.open_writable(full.as_ref()) else { continue };
            if key.value_names().iter().any(|name| name.to_string_lossy() == product.packed) {
                key.delete_value(product.packed.as_ref()).map_err(|e| format!("HKLM\\{full}: {e}"))?;
                removed.push(format!(r"HKLM\{full}\{}", product.packed));
            }
        }
    }
    Ok(removed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unpacks_product_codes() {
        // {5C9F8AB0-1234-5678-9ABC-DEF012345678}
        assert_eq!(
            unpack_guid("0BA8F9C543218765A9CBED0F21436587").as_deref(),
            Some("{5C9F8AB0-1234-5678-9ABC-DEF012345678}")
        );
        assert_eq!(unpack_guid("xyz"), None);
    }

    #[test]
    fn component_ids() {
        assert_eq!(
            sdk_component("10.0.26100.0").as_deref(),
            Some("Microsoft.VisualStudio.Component.Windows11SDK.26100")
        );
        assert_eq!(
            sdk_component("10.0.19041").as_deref(),
            Some("Microsoft.VisualStudio.Component.Windows10SDK.19041")
        );
        assert_eq!(
            toolset_component("14.44", "x64").as_deref(),
            Some("Microsoft.VisualStudio.Component.VC.14.44.17.14.x86.x64")
        );
        assert_eq!(
            toolset_component("14.29.30133", "arm64").as_deref(),
            Some("Microsoft.VisualStudio.Component.VC.14.29.16.11.ARM64")
        );
        assert_eq!(toolset_component("14.51", "x64"), None);
    }

    #[test]
    fn plans_installs() {
        let steps = plan(&SetupOptions { add: vec!["X".into()], ..Default::default() }, &[]).unwrap();
        assert_eq!(steps.len(), 1);
        assert!(steps[0].args.contains(&"Microsoft.VisualStudio.BuildTools".to_owned()));
        assert!(steps[0].args.last().unwrap().contains("--add X"));

        let instances = toolchain::instances();
        if let Some(first) = instances.first() {
            let steps = plan(&SetupOptions { repair: true, ..Default::default() }, &instances).unwrap();
            assert!(steps.iter().any(|s| s.args[0] == "repair" && s.args.contains(&first.path.display().to_string())
                || s.args[0] == "repair"));
        }
    }

    #[test]
    fn exit_codes() {
        assert_eq!(outcome(3010), Outcome::RebootRequired);
        assert!(matches!(outcome(1714), Outcome::Failed(1714, _)));
    }

    #[test]
    fn lists_msi_products() {
        for product in msi_products() {
            assert!(product.product_code.starts_with('{'));
        }
    }
}
