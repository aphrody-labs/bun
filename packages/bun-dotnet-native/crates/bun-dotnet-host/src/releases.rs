// SPDX-License-Identifier: MIT
//! The .NET release metadata (`releases-index.json`, `<channel>/releases.json`): channel,
//! version and file selection for `bun dotnet setup`, with the `dotnet-install` channel names
//! (`A.B`, `A.B.Cxx`, `LTS`, `STS`, `latest`).

use std::path::{Component as PathComponent, Path, PathBuf};

use serde_json::Value;

use crate::ARCH;
use crate::version::Version;

pub const DEFAULT_FEED: &str = "https://builds.dotnet.microsoft.com/dotnet/release-metadata";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Product {
    Sdk,
    Runtime,
    AspNetCore,
    WindowsDesktop,
}

impl Product {
    /// `--runtime` values of `dotnet-install`; `None` is the SDK.
    pub fn parse_runtime(name: Option<&str>) -> Option<Self> {
        match name.map(str::to_ascii_lowercase).as_deref() {
            None | Some("sdk") => Some(Self::Sdk),
            Some("dotnet") => Some(Self::Runtime),
            Some("aspnetcore") => Some(Self::AspNetCore),
            Some("windowsdesktop") => Some(Self::WindowsDesktop),
            _ => None,
        }
    }

    fn key(self) -> &'static str {
        match self {
            Self::Sdk => "sdk",
            Self::Runtime => "runtime",
            Self::AspNetCore => "aspnetcore-runtime",
            Self::WindowsDesktop => "windowsdesktop",
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Sdk => "sdk",
            Self::Runtime => "dotnet",
            Self::AspNetCore => "aspnetcore",
            Self::WindowsDesktop => "windowsdesktop",
        }
    }

    /// Install-relative directory that holds `version` once installed.
    pub fn installed_dir(self, version: &str) -> PathBuf {
        match self {
            Self::Sdk => Path::new("sdk").join(version),
            Self::Runtime => Path::new("shared").join("Microsoft.NETCore.App").join(version),
            Self::AspNetCore => Path::new("shared").join("Microsoft.AspNetCore.App").join(version),
            Self::WindowsDesktop => Path::new("shared").join("Microsoft.WindowsDesktop.App").join(version),
        }
    }

    /// Prefix of the archive names (`dotnet-sdk-win-x64.zip`).
    fn file_prefix(self) -> &'static str {
        match self {
            Self::Sdk => "dotnet-sdk-",
            Self::Runtime => "dotnet-runtime-",
            Self::AspNetCore => "aspnetcore-runtime-",
            Self::WindowsDesktop => "windowsdesktop-runtime-",
        }
    }
}

/// Runtime identifier of this machine (`win-x64`, `linux-musl-arm64`, `osx-arm64`, …).
pub fn host_rid() -> String {
    rid_for(ARCH)
}

pub fn rid_for(arch: &str) -> String {
    let os = if cfg!(windows) {
        "win"
    } else if cfg!(target_os = "macos") {
        "osx"
    } else if cfg!(target_os = "freebsd") {
        "freebsd"
    } else if is_musl() {
        "linux-musl"
    } else {
        "linux"
    };
    format!("{os}-{arch}")
}

fn is_musl() -> bool {
    cfg!(target_env = "musl")
        || std::fs::read_dir("/lib")
            .map(|entries| {
                entries
                    .filter_map(Result::ok)
                    .any(|entry| entry.file_name().to_string_lossy().starts_with("ld-musl-"))
            })
            .unwrap_or(false)
}

/// The `releases.json` URL and channel version for `channel`.
pub fn pick_channel(index: &Value, channel: &str) -> Result<(String, String), String> {
    let entries = index
        .get("releases-index")
        .and_then(Value::as_array)
        .ok_or("releases-index.json has no 'releases-index' array")?;
    let text = |entry: &Value, key: &str| entry.get(key).and_then(Value::as_str).unwrap_or("").to_owned();
    let channel_version = |entry: &Value| {
        let text = text(entry, "channel-version");
        Version::parse(&format!("{text}.0"))
    };
    let lower = channel.to_ascii_lowercase();
    let supported = |entry: &Value| matches!(text(entry, "support-phase").as_str(), "active" | "maintenance");
    let chosen = match lower.as_str() {
        "lts" | "sts" => entries
            .iter()
            .filter(|entry| text(entry, "release-type") == lower && supported(entry))
            .max_by_key(|entry| channel_version(entry)),
        "latest" | "current" => entries
            .iter()
            .filter(|entry| text(entry, "support-phase") == "active")
            .max_by_key(|entry| channel_version(entry)),
        _ => {
            let wanted: String = channel.split('.').take(2).collect::<Vec<_>>().join(".");
            entries.iter().find(|entry| text(entry, "channel-version") == wanted)
        }
    };
    let entry = chosen.ok_or_else(|| format!("no .NET channel matches '{channel}'"))?;
    let url = text(entry, "releases.json");
    if url.is_empty() {
        return Err(format!("channel {} has no releases.json", text(entry, "channel-version")));
    }
    Ok((text(entry, "channel-version"), url))
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Asset {
    pub product: Product,
    pub version: String,
    pub rid: String,
    pub name: String,
    pub url: String,
    /// Lowercase hex SHA-512.
    pub hash: String,
}

/// Every `(version, files)` the channel's releases list for `product`.
fn product_entries(releases: &Value, product: Product) -> Vec<(String, &Value)> {
    let mut entries: Vec<&Value> = Vec::new();
    for release in releases.get("releases").and_then(Value::as_array).into_iter().flatten() {
        if product == Product::Sdk {
            entries.extend(release.get("sdks").and_then(Value::as_array).into_iter().flatten());
        }
        entries.extend(release.get(product.key()));
    }
    let mut found: Vec<(String, &Value)> = Vec::new();
    for entry in entries {
        if let (Some(version), Some(files)) = (entry.get("version").and_then(Value::as_str), entry.get("files"))
            && !found.iter().any(|(known, _)| known == version)
        {
            found.push((version.to_owned(), files));
        }
    }
    found
}

/// The archive of `product` for `rid`: `version` exactly, else the newest in the channel (a
/// `A.B.Cxx` channel narrows SDKs to that feature band; prereleases only when the channel has
/// no release yet).
pub fn pick_asset(releases: &Value, product: Product, channel: &str, version: Option<&str>, rid: &str) -> Result<Asset, String> {
    let entries = product_entries(releases, product);
    let band = channel
        .split('.')
        .nth(2)
        .and_then(|part| part.strip_suffix("xx"))
        .and_then(|digit| digit.parse::<u64>().ok());
    let chosen = match version {
        Some(version) => entries
            .iter()
            .find(|(known, _)| known == version)
            .ok_or_else(|| format!(".NET {} {version} is not in channel {channel}", product.as_str()))?,
        None => {
            let candidates: Vec<(Version, &(String, &Value))> = entries
                .iter()
                .filter_map(|entry| Version::parse(&entry.0).map(|parsed| (parsed, entry)))
                .filter(|(parsed, _)| product != Product::Sdk || band.is_none_or(|band| parsed.feature_band() == band))
                .collect();
            let has_release = candidates.iter().any(|(parsed, _)| !parsed.is_prerelease());
            candidates
                .into_iter()
                .filter(|(parsed, _)| !has_release || !parsed.is_prerelease())
                .max_by(|a, b| a.0.cmp(&b.0))
                .map(|(_, entry)| entry)
                .ok_or_else(|| format!("channel {channel} lists no .NET {}", product.as_str()))?
        }
    };
    let (version, files) = chosen;
    let extension = if rid.starts_with("win-") { ".zip" } else { ".tar.gz" };
    let file = files
        .as_array()
        .into_iter()
        .flatten()
        .filter(|file| file.get("rid").and_then(Value::as_str) == Some(rid))
        .filter_map(|file| {
            let name = file.get("name").and_then(Value::as_str)?;
            (name.starts_with(product.file_prefix()) && name.ends_with(extension) && !name.contains("composite"))
                .then_some((name, file))
        })
        .min_by_key(|(name, _)| name.len())
        .ok_or_else(|| format!("no {extension} archive of .NET {} {version} for {rid}", product.as_str()))?
        .1;
    let field = |key: &str| file.get(key).and_then(Value::as_str).unwrap_or("").to_owned();
    Ok(Asset {
        product,
        version: version.clone(),
        rid: rid.to_owned(),
        name: field("name"),
        url: field("url"),
        hash: field("hash").to_ascii_lowercase(),
    })
}

/// `root` joined with an archive path, or `None` when the entry would escape `root`.
pub fn safe_join(root: &Path, entry: &str) -> Option<PathBuf> {
    let mut path = root.to_path_buf();
    let mut depth = 0usize;
    for part in Path::new(&entry.replace('\\', "/")).components() {
        match part {
            PathComponent::Normal(part) => {
                path.push(part);
                depth += 1;
            }
            PathComponent::CurDir => {}
            _ => return None,
        }
    }
    (depth > 0).then_some(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn index() -> Value {
        serde_json::from_str(
            r#"{"releases-index":[
              {"channel-version":"11.0","release-type":"sts","support-phase":"preview","releases.json":"u11"},
              {"channel-version":"10.0","release-type":"lts","support-phase":"active","releases.json":"u10"},
              {"channel-version":"9.0","release-type":"sts","support-phase":"active","releases.json":"u9"},
              {"channel-version":"8.0","release-type":"lts","support-phase":"maintenance","releases.json":"u8"}]}"#,
        )
        .unwrap()
    }

    #[test]
    fn channels() {
        assert_eq!(pick_channel(&index(), "LTS").unwrap().1, "u10");
        assert_eq!(pick_channel(&index(), "sts").unwrap().1, "u9");
        assert_eq!(pick_channel(&index(), "latest").unwrap().1, "u10");
        assert_eq!(pick_channel(&index(), "8.0.1xx").unwrap().1, "u8");
        assert_eq!(pick_channel(&index(), "11.0").unwrap().1, "u11");
        assert!(pick_channel(&index(), "7.0").is_err());
    }

    fn file(name: &str, rid: &str) -> String {
        format!(r#"{{"name":"{name}","rid":"{rid}","url":"https://x/{name}","hash":"AB"}}"#)
    }

    #[test]
    fn assets() {
        let releases: Value = serde_json::from_str(&format!(
            r#"{{"releases":[
              {{"release-version":"10.0.2","sdk":{{"version":"10.0.102","files":[{}]}},"sdks":[{{"version":"10.0.102","files":[{}]}},{{"version":"10.0.201","files":[{},{}]}}],
                "runtime":{{"version":"10.0.2","files":[{},{}]}},"aspnetcore-runtime":{{"version":"10.0.2","files":[{},{}]}}}},
              {{"release-version":"10.0.1","sdk":{{"version":"10.0.101","files":[{}]}},"runtime":{{"version":"10.0.1","files":[{}]}}}}]}}"#,
            file("dotnet-sdk-win-x64.zip", "win-x64"),
            file("dotnet-sdk-win-x64.zip", "win-x64"),
            file("dotnet-sdk-win-x64.exe", "win-x64"),
            file("dotnet-sdk-win-x64.zip", "win-x64"),
            file("dotnet-runtime-win-x64.zip", "win-x64"),
            file("dotnet-runtime-linux-x64.tar.gz", "linux-x64"),
            file("aspnetcore-runtime-composite-win-x64.zip", "win-x64"),
            file("aspnetcore-runtime-win-x64.zip", "win-x64"),
            file("dotnet-sdk-win-x64.zip", "win-x64"),
            file("dotnet-runtime-win-x64.zip", "win-x64"),
        ))
        .unwrap();
        let pick = |product, channel, version, rid| pick_asset(&releases, product, channel, version, rid);
        assert_eq!(pick(Product::Sdk, "10.0", None, "win-x64").unwrap().version, "10.0.201");
        assert_eq!(pick(Product::Sdk, "10.0.1xx", None, "win-x64").unwrap().version, "10.0.102");
        assert_eq!(pick(Product::Sdk, "10.0", Some("10.0.101"), "win-x64").unwrap().version, "10.0.101");
        let runtime = pick(Product::Runtime, "10.0", None, "linux-x64").unwrap();
        assert_eq!((runtime.version.as_str(), runtime.name.as_str(), runtime.hash.as_str()), ("10.0.2", "dotnet-runtime-linux-x64.tar.gz", "ab"));
        assert_eq!(pick(Product::AspNetCore, "10.0", None, "win-x64").unwrap().name, "aspnetcore-runtime-win-x64.zip");
        assert!(pick(Product::WindowsDesktop, "10.0", None, "win-x64").is_err());
        assert!(pick(Product::Runtime, "10.0", None, "osx-arm64").is_err());
    }

    #[test]
    fn joins_safely() {
        let root = Path::new("root");
        assert_eq!(safe_join(root, "./sdk/10.0.100/dotnet.dll"), Some(root.join("sdk").join("10.0.100").join("dotnet.dll")));
        assert_eq!(safe_join(root, "../evil"), None);
        assert_eq!(safe_join(root, "/etc/passwd"), None);
        assert_eq!(safe_join(root, "./"), None);
    }
}
