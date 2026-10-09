//! An offline Visual Studio mirror (channel, installer manifest, VSIX, MSI and cabinet payloads)
//! for the end-to-end tests here and in `test/cli/msvc/msvc.test.ts`, whose copy is written by
//! `BUN_MSVC_WRITE_FIXTURES=<dir> cargo test --lib write_fixtures`.

use std::collections::HashMap;

use super::{cab, msi, sha256, zip, Fetch};
use crate::json::Writer;

const CRT: &str = "14.44.17.14";
const MSVC: &str = "14.44.35207";
const SDK: &str = "10.0.26100.0";

struct Installer {
    name: &'static str,
    cab: &'static str,
    /// (directory path under `Windows Kits/10`, file name, contents).
    files: Vec<(&'static str, &'static str, &'static [u8])>,
}

fn installers() -> Vec<Installer> {
    let empty = |name| Installer { name, cab: "", files: vec![] };
    vec![
        Installer {
            name: "Windows SDK Desktop Headers x86-x86_en-us.msi",
            cab: "0a1b2c3d4e5f60718293a4b5c6d7e8f9.cab",
            files: vec![
                ("Include/10.0.26100.0/um", "WINDOWS.H|Windows.h", b"#include <WinError.h>\n#include <GL/gl.h>\n#include \"winbase.h\"\n"),
                ("Include/10.0.26100.0/um", "winbase.h", b"#pragma once\n"),
                ("Include/10.0.26100.0/um/gl", "GL.h", b"#pragma once\n"),
            ],
        },
        Installer {
            name: "Windows SDK for Windows Store Apps Headers OnecoreUap-x86_en-us.msi",
            cab: "1b2c3d4e5f60718293a4b5c6d7e8f90a.cab",
            files: vec![("Include/10.0.26100.0/shared", "winerror.h", b"#define S_OK 0\n")],
        },
        Installer {
            name: "Universal CRT Headers Libraries and Sources-x86_en-us.msi",
            cab: "2c3d4e5f60718293a4b5c6d7e8f90a1b.cab",
            files: vec![
                ("Include/10.0.26100.0/ucrt", "stdio.h", b"#pragma once\n"),
                ("Lib/10.0.26100.0/ucrt/x64", "ucrt.lib", b"!<arch>\n"),
                ("Lib/10.0.26100.0/ucrt/arm64", "ucrt.lib", b"!<arch>\n"),
                ("Source/10.0.26100.0/ucrt", "printf.cpp", b"// source\n"),
            ],
        },
        Installer {
            name: "Windows SDK Desktop Libs x64-x86_en-us.msi",
            cab: "3d4e5f60718293a4b5c6d7e8f90a1b2c.cab",
            files: vec![("Lib/10.0.26100.0/um/x64", "kernel32.Lib", b"!<arch>\n")],
        },
        empty("Windows SDK for Windows Store Apps Headers-x86_en-us.msi"),
        empty("Windows SDK for Windows Store Apps Libs-x86_en-us.msi"),
        empty("Windows SDK OnecoreUap Headers x86-x86_en-us.msi"),
        empty("Windows SDK Desktop Headers x64-x86_en-us.msi"),
        empty("Windows SDK OnecoreUap Headers x64-x86_en-us.msi"),
    ]
}

fn msi_and_cab(installer: &Installer) -> (Vec<u8>, Vec<u8>) {
    let mut dirs: Vec<(String, Option<String>, String)> = vec![
        ("TARGETDIR".into(), None, "SourceDir".into()),
        ("ProgramFilesFolder".into(), Some("TARGETDIR".into()), ".".into()),
        ("KITS".into(), Some("ProgramFilesFolder".into()), "WINDOW~1|Windows Kits".into()),
        ("TEN".into(), Some("KITS".into()), "10".into()),
    ];
    let mut files: Vec<(String, String, String, u32)> = Vec::new();
    let mut cab_files: Vec<(String, &[u8])> = Vec::new();
    for (n, (dir, name, contents)) in installer.files.iter().enumerate() {
        let mut parent = "TEN".to_owned();
        let mut path = String::new();
        for part in dir.split('/') {
            path.push('/');
            path.push_str(part);
            let key = format!("D{}", path.replace(['/', '.'], "_"));
            if !dirs.iter().any(|(k, _, _)| *k == key) {
                dirs.push((key.clone(), Some(parent.clone()), part.to_owned()));
            }
            parent = key;
        }
        let key = format!("fil{n}{}", installer.cab.len());
        files.push((key.clone(), parent, name.to_string(), contents.len() as u32));
        cab_files.push((key, contents));
    }
    let dirs: Vec<(&str, Option<&str>, &str)> = dirs.iter().map(|(k, p, d)| (k.as_str(), p.as_deref(), d.as_str())).collect();
    let files: Vec<(&str, &str, &str, u32)> = files.iter().map(|(k, d, n, s)| (k.as_str(), d.as_str(), n.as_str(), *s)).collect();
    let cabinets: Vec<&str> = if installer.cab.is_empty() { vec![] } else { vec![installer.cab] };
    let cab_files: Vec<(&str, &[u8])> = cab_files.iter().map(|(k, c)| (k.as_str(), *c)).collect();
    (msi::build(&dirs, &files, &cabinets), cab::build(&cab_files))
}

/// `(relative URL, contents)`: `channel`, `vsman.json` and `payloads/*`.
pub(crate) fn mirror() -> Vec<(String, Vec<u8>)> {
    let mut out: Vec<(String, Vec<u8>)> = Vec::new();
    let crt_root = format!("Contents/VC/Tools/MSVC/{MSVC}");
    let vsix: Vec<(String, Vec<u8>)> = vec![
        (
            format!("Microsoft.VC.{CRT}.CRT.Headers.base"),
            zip::build(&[
                (&format!("{crt_root}/include/vcruntime.h"), b"#pragma once\n"),
                ("[Content_Types].xml", b"<Types/>"),
            ]),
        ),
        (
            format!("Microsoft.VC.{CRT}.CRT.x64.Desktop.base"),
            zip::build(&[
                (&format!("{crt_root}/lib/x64/libcmt.lib"), b"!<arch>\n"),
                (&format!("{crt_root}/lib/x64/libcmt.pdb"), b"pdb"),
                (&format!("{crt_root}/bin/Hostx64/x64/cl.exe"), b"MZ"),
            ]),
        ),
        (
            format!("Microsoft.VC.{CRT}.CRT.x64.Store.base"),
            zip::build(&[(&format!("{crt_root}/lib/x64/msvcrt.lib"), b"!<arch>\n")]),
        ),
        (
            format!("Microsoft.VC.{CRT}.CRT.ARM64.Desktop.base"),
            zip::build(&[(&format!("{crt_root}/lib/arm64/libcmt.lib"), b"!<arch>\n")]),
        ),
        (
            format!("Microsoft.VC.{CRT}.CRT.ARM64.Store.base"),
            zip::build(&[(&format!("{crt_root}/lib/arm64/msvcrt.lib"), b"!<arch>\n")]),
        ),
    ];
    let payload = |w: &mut Writer, file_name: &str, url: &str, data: &[u8]| {
        w.begin_object()
            .field("fileName", file_name)
            .field("sha256", &sha256::hex(data).to_uppercase())
            .key("size")
            .num(data.len() as u64)
            .field("url", url)
            .end_object();
    };
    let mut w = Writer::new();
    w.begin_object().key("packages").begin_array();
    for (id, data) in &vsix {
        let file = format!("{id}.vsix");
        w.begin_object().field("id", id).field("version", "14.44.35220").field("type", "Vsix").key("payloads").begin_array();
        payload(&mut w, &file, &format!("payloads/{file}"), data);
        w.end_array().end_object();
        out.push((format!("payloads/{file}"), data.clone()));
    }
    w.begin_object().field("id", "Win11SDK_10.0.26100").field("version", "10.0.26100.4").field("type", "Exe");
    w.key("payloads").begin_array();
    for installer in installers() {
        let (msi, cab) = msi_and_cab(&installer);
        let url = format!("payloads/{}", installer.name.replace(' ', "%20"));
        payload(&mut w, &format!("Installers\\{}", installer.name), &url, &msi);
        out.push((url, msi));
        if !installer.cab.is_empty() {
            let url = format!("payloads/{}", installer.cab);
            payload(&mut w, &format!("Installers\\{}", installer.cab), &url, &cab);
            out.push((url, cab));
        }
    }
    w.end_array().end_object();
    w.end_array().end_object();
    out.push(("vsman.json".into(), w.finish().into_bytes()));
    let mut w = Writer::new();
    w.begin_object().key("channelItems").begin_array();
    w.begin_object().field("id", "Microsoft.VisualStudio.Manifests.VisualStudio").key("payloads").begin_array();
    w.begin_object().field("fileName", "VisualStudio.vsman").field("url", "vsman.json").end_object();
    w.end_array().end_object().end_array().end_object();
    out.push(("channel".into(), w.finish().into_bytes()));
    out
}

pub(crate) struct MapFetch(pub HashMap<String, Vec<u8>>);

impl Fetch for MapFetch {
    fn get(&self, url: &str) -> Result<Vec<u8>, String> {
        let key = url.strip_prefix("mirror://").unwrap_or(url);
        self.0.get(key).cloned().ok_or_else(|| format!("{url}: not found"))
    }
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::super::manifest::Selection;
    use super::super::{Installer, Sysroot};
    use super::*;

    fn temp_dir(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("bun-msvc-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir
    }

    #[test]
    fn installs_a_sysroot_from_a_mirror() {
        let fetch = MapFetch(mirror().into_iter().collect());
        let cache = temp_dir("install");
        let selection = Selection { archs: vec!["x64"], toolset: None, sdk: None, spectre: false };
        let plan = super::super::plan(&fetch, "mirror://channel", &selection).unwrap();
        let log = |_: &str| {};
        let installer = Installer { fetch: &fetch, cache_dir: cache.clone(), manifest: "mirror://channel".into(), log: &log };
        let sysroot: Sysroot = installer.install(&plan, false, false).unwrap();
        assert_eq!((sysroot.msvc_version.as_str(), sysroot.sdk_version.as_str()), (MSVC, SDK));
        let root = &sysroot.root;
        let exists = |p: &str| root.join(p).exists();
        for present in [
            "VC/Tools/MSVC/14.44.35207/include/vcruntime.h",
            "VC/Tools/MSVC/14.44.35207/lib/x64/libcmt.lib",
            "VC/Tools/MSVC/14.44.35207/lib/x64/msvcrt.lib",
            "Windows Kits/10/Include/10.0.26100.0/um/Windows.h",
            "Windows Kits/10/Include/10.0.26100.0/shared/winerror.h",
            "Windows Kits/10/Include/10.0.26100.0/ucrt/stdio.h",
            "Windows Kits/10/Lib/10.0.26100.0/um/x64/kernel32.Lib",
            "Windows Kits/10/Lib/10.0.26100.0/ucrt/x64/ucrt.lib",
            "sysroot.json",
        ] {
            assert!(exists(present), "{present}");
        }
        for absent in [
            "VC/Tools/MSVC/14.44.35207/lib/x64/libcmt.pdb",
            "VC/Tools/MSVC/14.44.35207/lib/arm64",
            "VC/Tools/MSVC/14.44.35207/bin",
            "Windows Kits/10/Lib/10.0.26100.0/ucrt/arm64",
            "Windows Kits/10/Source",
        ] {
            assert!(!exists(absent), "{absent}");
        }
        #[cfg(unix)]
        for alias in [
            "crt/include/vcruntime.h",
            "sdk/Lib/10.0.26100.0/um/x64/kernel32.lib",
            "sdk/Lib/10.0.26100.0/um/x64/KERNEL32.lib",
            "sdk/Include/10.0.26100.0/um/windows.h",
            "sdk/Include/10.0.26100.0/shared/WinError.h",
            "sdk/Include/10.0.26100.0/um/GL/gl.h",
        ] {
            assert!(exists(alias), "{alias}");
        }
        // Reused, not downloaded again.
        let empty = MapFetch(HashMap::new());
        let again = Installer { fetch: &empty, cache_dir: cache.clone(), manifest: "mirror://channel".into(), log: &log };
        assert_eq!(again.install(&plan, false, false).unwrap().root, sysroot.root);
        assert_eq!(super::super::find(&cache, Some("14.44"), Some("10.0.26100"), &["x64"]).unwrap().root, sysroot.root);
        assert!(super::super::find(&cache, None, None, &["arm64"]).is_none());
        // A corrupted download is rejected.
        let mut files: HashMap<String, Vec<u8>> = mirror().into_iter().collect();
        let vsix = files.keys().find(|k| k.ends_with("Headers.base.vsix")).unwrap().clone();
        files.get_mut(&vsix).unwrap().push(0);
        let corrupt = MapFetch(files);
        let cache2 = temp_dir("corrupt");
        let bad = Installer { fetch: &corrupt, cache_dir: cache2.clone(), manifest: "mirror://channel".into(), log: &log };
        assert!(bad.install(&plan, false, false).unwrap_err().contains("sha256"));
        let _ = std::fs::remove_dir_all(&cache);
        let _ = std::fs::remove_dir_all(&cache2);
    }

    #[test]
    fn write_fixtures() {
        let Some(dir) = std::env::var_os("BUN_MSVC_WRITE_FIXTURES") else { return };
        for (name, data) in mirror() {
            let path = Path::new(&dir).join(name.replace("%20", " "));
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
            std::fs::write(path, data).unwrap();
        }
    }
}
