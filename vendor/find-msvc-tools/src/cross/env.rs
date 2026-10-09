//! LLVM tool discovery and the cargo/cc-rs environment of a cross sysroot.

use std::path::{Path, PathBuf};

use super::manifest::rust_triple;
use super::Sysroot;
use crate::json::Writer;

pub const TOOLS: [&str; 6] = ["clang-cl", "lld-link", "llvm-lib", "llvm-rc", "llvm-mt", "llvm-dlltool"];

fn exe(name: &str) -> String {
    if cfg!(windows) {
        format!("{name}.exe")
    } else {
        name.to_owned()
    }
}

fn path_dirs() -> Vec<PathBuf> {
    std::env::var_os("PATH").map(|p| std::env::split_paths(&p).collect()).unwrap_or_default()
}

/// `/usr/lib/llvm-20/bin` (Debian, Ubuntu), `/usr/lib/llvm20/bin` (Alpine), Homebrew, `C:\Program
/// Files\LLVM\bin`; highest version first.
fn llvm_dirs() -> Vec<PathBuf> {
    let mut versioned: Vec<(u32, PathBuf)> = Vec::new();
    for parent in ["/usr/lib", "/usr/local/lib", "/usr/lib64"] {
        for entry in std::fs::read_dir(parent).into_iter().flatten().flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            if let Some(version) = name.strip_prefix("llvm").map(|v| v.trim_start_matches('-')) {
                if let Ok(version) = version.parse::<u32>() {
                    versioned.push((version, entry.path().join("bin")));
                }
            }
        }
    }
    versioned.sort_by(|a, b| b.0.cmp(&a.0));
    let mut dirs: Vec<PathBuf> = versioned.into_iter().map(|(_, dir)| dir).collect();
    for fixed in ["/opt/homebrew/opt/llvm/bin", "/usr/local/opt/llvm/bin", "C:\\Program Files\\LLVM\\bin"] {
        dirs.push(PathBuf::from(fixed));
    }
    dirs
}

/// `name` on `PATH`, in the newest LLVM install, or as `name-<version>` on `PATH`.
pub fn find_tool(name: &str) -> Option<PathBuf> {
    let file = exe(name);
    let path = path_dirs();
    if let Some(found) = path.iter().map(|dir| dir.join(&file)).find(|p| p.is_file()) {
        return Some(found);
    }
    if let Some(found) = llvm_dirs().into_iter().map(|dir| dir.join(&file)).find(|p| p.is_file()) {
        return Some(found);
    }
    let prefix = format!("{name}-");
    let mut versioned: Vec<(u32, PathBuf)> = Vec::new();
    for dir in &path {
        for entry in std::fs::read_dir(dir).into_iter().flatten().flatten() {
            let entry_name = entry.file_name().to_string_lossy().into_owned();
            let stem = entry_name.strip_suffix(".exe").unwrap_or(&entry_name);
            if let Some(Ok(version)) = stem.strip_prefix(&prefix).map(str::parse::<u32>) {
                versioned.push((version, entry.path()));
            }
        }
    }
    versioned.into_iter().max_by_key(|(version, _)| *version).map(|(_, path)| path)
}

pub struct Tools {
    pub found: Vec<(&'static str, Option<PathBuf>)>,
}

impl Tools {
    pub fn discover() -> Tools {
        Tools { found: TOOLS.iter().map(|name| (*name, find_tool(name))).collect() }
    }

    pub fn get(&self, name: &str) -> Option<&Path> {
        self.found.iter().find(|(n, _)| *n == name).and_then(|(_, p)| p.as_deref())
    }

    /// The path, or the bare name when the tool is not installed (yet).
    fn or_name(&self, name: &str) -> String {
        self.get(name).map_or_else(|| name.to_owned(), |p| p.to_string_lossy().into_owned())
    }
}

fn slash(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

/// Include directories of `sysroot` (`/imsvc` for clang-cl).
pub fn include_dirs(sysroot: &Sysroot) -> Vec<PathBuf> {
    let sdk = sysroot.sdk_dir().join("Include").join(&sysroot.sdk_version);
    let mut dirs = vec![sysroot.crt_dir().join("include")];
    for part in ["ucrt", "um", "shared", "winrt", "cppwinrt"] {
        dirs.push(sdk.join(part));
    }
    dirs
}

/// Library directories of `sysroot` for `arch` (`x64`, `arm64`, `x86`).
pub fn lib_dirs(sysroot: &Sysroot, arch: &str) -> Vec<PathBuf> {
    let sdk = sysroot.sdk_dir().join("Lib").join(&sysroot.sdk_version);
    vec![sysroot.crt_dir().join("lib").join(arch), sdk.join("um").join(arch), sdk.join("ucrt").join(arch)]
}

/// The variables cargo, rustc and cc-rs read for every architecture of `sysroot`.
pub fn vars(sysroot: &Sysroot, tools: &Tools) -> Vec<(String, String)> {
    let clang_cl = tools.or_name("clang-cl");
    let lld_link = tools.or_name("lld-link");
    let llvm_lib = tools.or_name("llvm-lib");
    let mut out: Vec<(String, String)> = vec![
        ("BUN_MSVC_SYSROOT".into(), slash(&sysroot.root)),
        ("BUN_MSVC_VERSION".into(), sysroot.msvc_version.clone()),
        ("BUN_MSVC_SDK_VERSION".into(), sysroot.sdk_version.clone()),
    ];
    let includes: Vec<String> = include_dirs(sysroot).iter().map(|d| format!("/imsvc{}", slash(d))).collect();
    for arch in &sysroot.archs {
        let triple = rust_triple(arch);
        let lower = triple.replace('-', "_");
        let upper = lower.to_uppercase();
        let flags = format!("--target={triple} {}", includes.join(" "));
        let rustflags: Vec<String> = lib_dirs(sysroot, arch).iter().map(|d| format!("-Lnative={}", slash(d))).collect();
        out.push((format!("CC_{lower}"), clang_cl.clone()));
        out.push((format!("CXX_{lower}"), clang_cl.clone()));
        out.push((format!("AR_{lower}"), llvm_lib.clone()));
        out.push((format!("CFLAGS_{lower}"), flags.clone()));
        out.push((format!("CXXFLAGS_{lower}"), flags));
        out.push((format!("CARGO_TARGET_{upper}_LINKER"), lld_link.clone()));
        out.push((format!("CARGO_TARGET_{upper}_RUSTFLAGS"), rustflags.join(" ")));
    }
    out
}

fn sh_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

/// `sh` (`export K='v'`), `json`, `pwsh`, `cmd` or `github` (`$GITHUB_ENV` lines).
pub fn format(vars: &[(String, String)], format: &str) -> Result<String, String> {
    let mut out = String::new();
    match format {
        "sh" | "bash" | "zsh" => {
            for (key, value) in vars {
                out.push_str(&format!("export {key}={}\n", sh_quote(value)));
            }
        }
        "pwsh" | "powershell" => {
            for (key, value) in vars {
                out.push_str(&format!("$env:{key} = '{}'\n", value.replace('\'', "''")));
            }
        }
        "cmd" => {
            for (key, value) in vars {
                out.push_str(&format!("set \"{key}={value}\"\n"));
            }
        }
        "github" => {
            for (key, value) in vars {
                out.push_str(&format!("{key}={value}\n"));
            }
        }
        "json" => {
            let mut w = Writer::new();
            w.begin_object();
            for (key, value) in vars {
                w.field(key, value);
            }
            w.end_object();
            out = w.finish() + "\n";
        }
        other => return Err(format!("unknown format: {other} (sh, json, pwsh, cmd, github)")),
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exports_cargo_and_cc_variables() {
        let sysroot = Sysroot {
            root: PathBuf::from("/c/sysroot"),
            crt: "14.44.17.14".into(),
            msvc_version: "14.44.35207".into(),
            sdk: "10.0.26100".into(),
            sdk_version: "10.0.26100.0".into(),
            archs: vec!["x64".into(), "arm64".into()],
            spectre: false,
        };
        let tools = Tools { found: vec![("clang-cl", Some(PathBuf::from("/usr/bin/clang-cl"))), ("lld-link", None)] };
        let vars = vars(&sysroot, &tools);
        let get = |key: &str| vars.iter().find(|(k, _)| k == key).map(|(_, v)| v.as_str()).unwrap();
        assert_eq!(get("CC_x86_64_pc_windows_msvc"), "/usr/bin/clang-cl");
        assert_eq!(get("CARGO_TARGET_AARCH64_PC_WINDOWS_MSVC_LINKER"), "lld-link");
        assert_eq!(get("AR_aarch64_pc_windows_msvc"), "llvm-lib");
        assert!(get("CFLAGS_x86_64_pc_windows_msvc").starts_with("--target=x86_64-pc-windows-msvc /imsvc"));
        assert!(get("CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_RUSTFLAGS").contains("-Lnative="));
        let sh = format(&[("A".into(), "it's".into())], "sh").unwrap();
        assert_eq!(sh, "export A='it'\\''s'\n");
        assert_eq!(format(&[("A".into(), "b".into())], "json").unwrap(), "{\"A\":\"b\"}\n");
        assert!(format(&[], "fish").is_err());
    }
}
