//! Visual Studio channel and installer manifests (the `VisualStudio.vsman` package list), and
//! the selection of the MSVC CRT and Windows SDK packages a cross sysroot needs.

use crate::json::Value;

/// The Visual Studio 2022 release channel: every MSVC toolset since 14.29 and the current SDKs.
pub const DEFAULT_CHANNEL: &str = "https://aka.ms/vs/17/release/channel";

#[derive(Clone, Debug)]
pub struct Payload {
    pub url: String,
    pub sha256: String,
    pub size: u64,
    pub file_name: String,
}

#[derive(Clone, Debug)]
pub struct Package {
    pub id: String,
    pub version: String,
    pub payloads: Vec<Payload>,
}

fn payloads(value: &Value) -> Vec<Payload> {
    value
        .get("payloads")
        .map(Value::as_array)
        .unwrap_or(&[])
        .iter()
        .filter_map(|p| {
            Some(Payload {
                url: p.get("url")?.as_str()?.to_owned(),
                sha256: p.get("sha256").and_then(Value::as_str).unwrap_or("").to_ascii_lowercase(),
                size: p.get("size").and_then(Value::as_u64).unwrap_or(0),
                file_name: p.get("fileName").and_then(Value::as_str).unwrap_or("").to_owned(),
            })
        })
        .collect()
}

/// The installer manifest URL named by a channel manifest.
pub fn vsman_url(channel: &str) -> Result<String, String> {
    let value = Value::parse(channel).ok_or("the channel manifest is not JSON")?;
    for item in value.get("channelItems").map(Value::as_array).unwrap_or(&[]) {
        if item.get("id").and_then(Value::as_str) == Some("Microsoft.VisualStudio.Manifests.VisualStudio") {
            if let Some(payload) = payloads(item).into_iter().next() {
                return Ok(payload.url);
            }
        }
    }
    Err("the channel manifest has no Microsoft.VisualStudio.Manifests.VisualStudio item".into())
}

pub fn packages(vsman: &str) -> Result<Vec<Package>, String> {
    let value = Value::parse(vsman).ok_or("the installer manifest is not JSON")?;
    let list = value.get("packages").ok_or("the installer manifest has no packages")?;
    Ok(list
        .as_array()
        .iter()
        .filter_map(|p| {
            // Localized duplicates carry a "language"; the neutral one is what the installer uses.
            if p.get("language").and_then(Value::as_str).is_some_and(|l| l != "neutral" && l != "en-US") {
                return None;
            }
            Some(Package {
                id: p.get("id")?.as_str()?.to_owned(),
                version: p.get("version").and_then(Value::as_str).unwrap_or("").to_owned(),
                payloads: payloads(p),
            })
        })
        .collect())
}

fn version_key(version: &str) -> Vec<u64> {
    version.split('.').map(|part| part.parse().unwrap_or(0)).collect()
}

/// `14.44` matches `14.44.17.14` and `14.44.35220`; `10.0.26100` matches `10.0.26100.0`.
fn version_matches(query: &str, version: &str) -> bool {
    version == query || version.starts_with(&format!("{query}."))
}

/// x64, x86, arm64: the names of the CRT packages and of the SDK `Lib` folders.
pub fn ms_arch(arch: &str) -> Option<&'static str> {
    match arch.to_ascii_lowercase().as_str() {
        "x64" | "x86_64" | "amd64" => Some("x64"),
        "x86" | "i686" | "i586" | "i386" => Some("x86"),
        "arm64" | "aarch64" => Some("arm64"),
        _ => None,
    }
}

pub fn rust_triple(ms_arch: &str) -> &'static str {
    match ms_arch {
        "x86" => "i686-pc-windows-msvc",
        "arm64" => "aarch64-pc-windows-msvc",
        _ => "x86_64-pc-windows-msvc",
    }
}

fn crt_arch(ms_arch: &str) -> &'static str {
    match ms_arch {
        "x86" => "x86",
        "arm64" => "ARM64",
        _ => "x64",
    }
}

#[derive(Clone, Debug)]
pub struct Selection {
    pub archs: Vec<&'static str>,
    pub toolset: Option<String>,
    pub sdk: Option<String>,
    pub spectre: bool,
}

#[derive(Debug)]
pub struct Plan {
    /// The CRT package line, `14.44.17.14`, and its version, `14.44.35220`.
    pub crt: String,
    pub crt_version: String,
    /// `10.0.26100`.
    pub sdk: String,
    pub archs: Vec<&'static str>,
    pub vsix: Vec<(String, Payload)>,
    /// The SDK installers this sysroot needs, by file name.
    pub msis: Vec<Payload>,
    /// Every cabinet of the SDK package; the installers' `Media` tables pick theirs.
    pub cabs: Vec<Payload>,
}

impl Plan {
    pub fn download_size(&self) -> u64 {
        self.vsix.iter().map(|(_, p)| p.size).sum::<u64>() + self.msis.iter().map(|p| p.size).sum::<u64>()
    }
}

/// The SDK installers with headers and import libraries (not tools, sources or redistributables).
/// Most of `Include/<v>/shared` (winerror.h, guiddef.h, ...) ships in the OnecoreUap ones.
pub fn sdk_installers(archs: &[&str]) -> Vec<String> {
    let mut names = vec![
        "Windows SDK for Windows Store Apps Headers-x86_en-us.msi".to_owned(),
        "Windows SDK for Windows Store Apps Headers OnecoreUap-x86_en-us.msi".to_owned(),
        "Windows SDK for Windows Store Apps Libs-x86_en-us.msi".to_owned(),
        "Windows SDK Desktop Headers x86-x86_en-us.msi".to_owned(),
        "Windows SDK OnecoreUap Headers x86-x86_en-us.msi".to_owned(),
        "Universal CRT Headers Libraries and Sources-x86_en-us.msi".to_owned(),
    ];
    for arch in archs {
        if *arch != "x86" {
            names.push(format!("Windows SDK Desktop Headers {arch}-x86_en-us.msi"));
            names.push(format!("Windows SDK OnecoreUap Headers {arch}-x86_en-us.msi"));
        }
        names.push(format!("Windows SDK Desktop Libs {arch}-x86_en-us.msi"));
    }
    names
}

pub fn plan(packages: &[Package], selection: &Selection) -> Result<Plan, String> {
    let mut crts: Vec<(&str, &Package)> = packages
        .iter()
        .filter_map(|p| {
            let line = p.id.strip_prefix("Microsoft.VC.")?.strip_suffix(".CRT.Headers.base")?;
            Some((line, p))
        })
        .filter(|(line, p)| {
            selection.toolset.as_deref().is_none_or(|q| version_matches(q, line) || version_matches(q, &p.version))
        })
        .collect();
    crts.sort_by_key(|(line, _)| version_key(line));
    let (crt, headers) = crts.pop().ok_or_else(|| match &selection.toolset {
        Some(q) => format!("no MSVC CRT {q} in the Visual Studio manifest"),
        None => "no MSVC CRT in the Visual Studio manifest".into(),
    })?;
    let by_id = |id: &str| packages.iter().find(|p| p.id.eq_ignore_ascii_case(id));
    let mut vsix = Vec::new();
    let mut add = |id: String| -> Result<(), String> {
        let package = by_id(&id).ok_or_else(|| format!("{id} is not in the Visual Studio manifest"))?;
        for payload in &package.payloads {
            vsix.push((id.clone(), payload.clone()));
        }
        Ok(())
    };
    add(headers.id.clone())?;
    for arch in &selection.archs {
        // Desktop: the static CRT (libcmt, libvcruntime, libcpmt). Store: the import libraries of
        // the dynamic CRT (msvcrt, vcruntime, msvcprt), oldnames and the startup objects.
        add(format!("Microsoft.VC.{crt}.CRT.{}.Desktop.base", crt_arch(arch)))?;
        add(format!("Microsoft.VC.{crt}.CRT.{}.Store.base", crt_arch(arch)))?;
        if selection.spectre {
            add(format!("Microsoft.VC.{crt}.CRT.{}.Desktop.spectre.base", crt_arch(arch)))?;
        }
    }
    let mut sdks: Vec<(&str, &Package)> = packages
        .iter()
        .filter_map(|p| {
            let version = p.id.strip_prefix("Win11SDK_").or_else(|| p.id.strip_prefix("Win10SDK_"))?;
            version.starts_with("10.0.").then_some((version, p))
        })
        .filter(|(version, _)| selection.sdk.as_deref().is_none_or(|q| version_matches(q, version) || version_matches(version, q)))
        .collect();
    sdks.sort_by_key(|(version, _)| version_key(version));
    let (sdk, sdk_package) = sdks.pop().ok_or_else(|| match &selection.sdk {
        Some(q) => format!("no Windows SDK {q} in the Visual Studio manifest"),
        None => "no Windows SDK in the Visual Studio manifest".into(),
    })?;
    let base = |p: &Payload| p.file_name.rsplit(['\\', '/']).next().unwrap_or(&p.file_name).to_owned();
    let mut msis = Vec::new();
    for name in sdk_installers(&selection.archs) {
        let payload = sdk_package
            .payloads
            .iter()
            .find(|p| base(p).eq_ignore_ascii_case(&name))
            .ok_or_else(|| format!("{name} is not in {}", sdk_package.id))?;
        msis.push(payload.clone());
    }
    let cabs = sdk_package.payloads.iter().filter(|p| p.file_name.to_ascii_lowercase().ends_with(".cab")).cloned().collect();
    Ok(Plan {
        crt: crt.to_owned(),
        crt_version: headers.version.clone(),
        sdk: sdk.to_owned(),
        archs: selection.archs.clone(),
        vsix,
        msis,
        cabs,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn package(id: &str, version: &str, files: &[&str]) -> Package {
        Package {
            id: id.into(),
            version: version.into(),
            payloads: files
                .iter()
                .map(|f| Payload { url: format!("https://example/{f}"), sha256: String::new(), size: 1, file_name: f.to_string() })
                .collect(),
        }
    }

    fn manifest() -> Vec<Package> {
        let mut sdk_files: Vec<String> = sdk_installers(&["x64", "arm64"]).into_iter().map(|n| format!("Installers\\{n}")).collect();
        sdk_files.push("Installers\\abc.cab".into());
        let sdk_files: Vec<&str> = sdk_files.iter().map(String::as_str).collect();
        let mut list = vec![
            package("Win10SDK_10.0.19041", "10.0.19041.1", &sdk_files),
            package("Win11SDK_10.0.26100", "10.0.26100.4", &sdk_files),
            package("Win11SDK_10.0.22621", "10.0.22621.3", &sdk_files),
        ];
        for (line, version) in [("14.29.16.11", "14.29.30156"), ("14.44.17.14", "14.44.35220"), ("14.38.17.8", "14.38.33135")] {
            list.push(package(&format!("Microsoft.VC.{line}.CRT.Headers.base"), version, &["h.vsix"]));
            for arch in ["x64", "ARM64", "x86"] {
                list.push(package(&format!("Microsoft.VC.{line}.CRT.{arch}.Desktop.base"), version, &["d.vsix"]));
                list.push(package(&format!("Microsoft.VC.{line}.CRT.{arch}.Store.base"), version, &["s.vsix"]));
            }
        }
        list
    }

    #[test]
    fn picks_the_newest_crt_and_sdk() {
        let selection = Selection { archs: vec!["x64", "arm64"], toolset: None, sdk: None, spectre: false };
        let plan = plan(&manifest(), &selection).unwrap();
        assert_eq!((plan.crt.as_str(), plan.crt_version.as_str(), plan.sdk.as_str()), ("14.44.17.14", "14.44.35220", "10.0.26100"));
        let ids: Vec<&str> = plan.vsix.iter().map(|(id, _)| id.as_str()).collect();
        assert_eq!(
            ids,
            [
                "Microsoft.VC.14.44.17.14.CRT.Headers.base",
                "Microsoft.VC.14.44.17.14.CRT.x64.Desktop.base",
                "Microsoft.VC.14.44.17.14.CRT.x64.Store.base",
                "Microsoft.VC.14.44.17.14.CRT.ARM64.Desktop.base",
                "Microsoft.VC.14.44.17.14.CRT.ARM64.Store.base"
            ]
        );
        assert_eq!(plan.msis.len(), 12);
        assert_eq!(plan.cabs.len(), 1);
    }

    #[test]
    fn selects_by_prefix() {
        let selection =
            Selection { archs: vec!["x64"], toolset: Some("14.38".into()), sdk: Some("10.0.22621".into()), spectre: false };
        let plan = plan(&manifest(), &selection).unwrap();
        assert_eq!((plan.crt.as_str(), plan.sdk.as_str()), ("14.38.17.8", "10.0.22621"));
        let selection = Selection { archs: vec!["x64"], toolset: Some("14.29.30156".into()), sdk: None, spectre: false };
        assert_eq!(super::plan(&manifest(), &selection).unwrap().crt, "14.29.16.11");
        let selection = Selection { archs: vec!["x64"], toolset: Some("14.99".into()), sdk: None, spectre: false };
        assert!(super::plan(&manifest(), &selection).unwrap_err().contains("14.99"));
    }

    #[test]
    fn reads_channel_and_installer_manifests() {
        let channel = r#"{"channelItems":[{"id":"Other"},{"id":"Microsoft.VisualStudio.Manifests.VisualStudio","payloads":[{"url":"https://x/VisualStudio.vsman"}]}]}"#;
        assert_eq!(vsman_url(channel).unwrap(), "https://x/VisualStudio.vsman");
        let vsman = r#"{"packages":[{"id":"A","version":"1","payloads":[{"fileName":"a.vsix","sha256":"AB","size":3,"url":"u"}]},{"id":"A","language":"de-DE"}]}"#;
        let list = packages(vsman).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].payloads[0].sha256, "ab");
    }
}
