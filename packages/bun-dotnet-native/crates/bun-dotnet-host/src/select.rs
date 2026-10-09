// SPDX-License-Identifier: MIT
//! SDK and framework selection with the muxer's semantics: `global.json` (`sdk_resolver.cpp`)
//! and `.runtimeconfig.json` roll-forward (`fx_resolver.cpp`, `fx_reference.cpp`).

use std::path::{Path, PathBuf};

use serde_json::Value;

use crate::inventory::Component;
use crate::version::Version;

// ─── SDK (global.json) ───────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SdkPolicy {
    Disable,
    Patch,
    Feature,
    Minor,
    Major,
    LatestPatch,
    LatestFeature,
    LatestMinor,
    LatestMajor,
}

impl SdkPolicy {
    const NAMES: [(&'static str, SdkPolicy); 9] = [
        ("disable", Self::Disable),
        ("patch", Self::Patch),
        ("feature", Self::Feature),
        ("minor", Self::Minor),
        ("major", Self::Major),
        ("latestPatch", Self::LatestPatch),
        ("latestFeature", Self::LatestFeature),
        ("latestMinor", Self::LatestMinor),
        ("latestMajor", Self::LatestMajor),
    ];

    pub fn parse(name: &str) -> Option<Self> {
        Self::NAMES
            .iter()
            .find(|(known, _)| known.eq_ignore_ascii_case(name))
            .map(|(_, policy)| *policy)
    }

    pub fn as_str(self) -> &'static str {
        Self::NAMES.iter().find(|(_, policy)| *policy == self).map_or("", |(name, _)| name)
    }

    fn uses_latest(self) -> bool {
        matches!(
            self,
            Self::LatestPatch | Self::LatestFeature | Self::LatestMinor | Self::LatestMajor
        )
    }
}

#[derive(Debug, Clone)]
pub struct SdkRequest {
    /// The `global.json` that was found, used or not.
    pub global_json: Option<PathBuf>,
    /// Why the `global.json` settings were ignored or are invalid.
    pub global_json_error: Option<String>,
    pub version: Option<Version>,
    pub policy: SdkPolicy,
    pub allow_prerelease: bool,
    /// `sdk.paths` (`None`: the install root only).
    pub paths: Option<Vec<String>>,
    pub error_message: Option<String>,
}

impl Default for SdkRequest {
    fn default() -> Self {
        Self {
            global_json: None,
            global_json_error: None,
            version: None,
            policy: SdkPolicy::LatestMajor,
            allow_prerelease: true,
            paths: None,
            error_message: None,
        }
    }
}

/// The nearest `global.json` from `cwd` upward.
pub fn find_global_json(cwd: &Path) -> Option<PathBuf> {
    cwd.ancestors().map(|dir| dir.join("global.json")).find(|file| file.is_file())
}

impl SdkRequest {
    /// Reads the nearest `global.json`; invalid settings fall back to the default request.
    pub fn from_cwd(cwd: &Path) -> Self {
        match find_global_json(cwd) {
            Some(path) => Self::from_global_json(&path),
            None => Self::default(),
        }
    }

    pub fn from_global_json(path: &Path) -> Self {
        let parsed = read_json(path)
            .map_err(|error| (None, error))
            .and_then(|json| Self::from_json(&json));
        match parsed {
            Ok(mut request) => {
                request.global_json = Some(path.to_path_buf());
                request
            }
            Err((Some(mut request), error)) => {
                // Invalid version band: reported, the settings stay in force.
                request.global_json = Some(path.to_path_buf());
                request.global_json_error = Some(error);
                request
            }
            Err((None, error)) => Self {
                global_json: Some(path.to_path_buf()),
                global_json_error: Some(error),
                ..Self::default()
            },
        }
    }

    fn from_json(json: &Value) -> Result<Self, (Option<Self>, String)> {
        let fail = |message: String| Err((None, message));
        let mut request = Self::default();
        let Some(sdk) = json.get("sdk").filter(|sdk| !sdk.is_null()) else {
            return Ok(request);
        };
        let Some(sdk) = sdk.as_object() else {
            return fail("Expected a JSON object for the 'sdk' value".into());
        };
        let field = |name: &str| sdk.get(name).filter(|value| !value.is_null());
        if let Some(version) = field("version") {
            let Some(text) = version.as_str() else {
                return fail("Expected a string for the 'sdk/version' value".into());
            };
            let Some(parsed) = Version::parse(text) else {
                return fail(format!("Version '{text}' is not valid for the 'sdk/version' value"));
            };
            request.version = Some(parsed);
            request.policy = SdkPolicy::Patch;
        }
        if let Some(policy) = field("rollForward") {
            let Some(name) = policy.as_str() else {
                return fail("Expected a string for the 'sdk/rollForward' value".into());
            };
            let Some(parsed) = SdkPolicy::parse(name) else {
                return fail(format!(
                    "The roll-forward policy '{name}' is not supported for the 'sdk/rollForward' value"
                ));
            };
            if parsed != SdkPolicy::LatestMajor && request.version.is_none() {
                return fail(format!("The roll-forward policy '{name}' requires a 'sdk/version' value"));
            }
            request.policy = parsed;
        }
        if let Some(allow) = field("allowPrerelease") {
            let Some(allow) = allow.as_bool() else {
                return fail("Expected a boolean for the 'sdk/allowPrerelease' value".into());
            };
            request.allow_prerelease = allow;
        }
        if let Some(paths) = field("paths") {
            let Some(paths) = paths.as_array() else {
                return fail("Expected an array for 'sdk/paths' value".into());
            };
            request.paths = Some(paths.iter().filter_map(|path| path.as_str().map(str::to_owned)).collect());
        }
        if let Some(message) = field("errorMessage") {
            let Some(message) = message.as_str() else {
                return fail("Expected a string for the 'sdk/errorMessage' value".into());
            };
            request.error_message = Some(message.to_owned());
        }
        if request.version.as_ref().is_some_and(Version::is_prerelease) {
            request.allow_prerelease = true;
        }
        if let Some(version) = &request.version
            && version.feature_band() < 1
        {
            let message = format!(
                "Version '{version}' is not valid for the 'sdk/version' value. SDK feature bands start at 1 - for example, {}.{}.100",
                version.major, version.minor
            );
            return Err((Some(request), message));
        }
        Ok(request)
    }

    /// Directories whose `sdk/` is searched, in priority order.
    pub fn search_roots(&self, dotnet_root: &Path) -> Vec<PathBuf> {
        let Some(paths) = &self.paths else {
            return vec![dotnet_root.to_path_buf()];
        };
        let base = self
            .global_json
            .as_deref()
            .and_then(Path::parent)
            .unwrap_or(Path::new("."));
        paths
            .iter()
            .map(|path| {
                if path == "$host$" {
                    dotnet_root.to_path_buf()
                } else if Path::new(path).is_absolute() {
                    PathBuf::from(path)
                } else {
                    base.join(path)
                }
            })
            .collect()
    }

    fn matches(&self, current: &Version) -> bool {
        if (!self.allow_prerelease && current.is_prerelease()) || self.policy == SdkPolicy::Disable {
            return false;
        }
        let Some(requested) = &self.version else {
            return true;
        };
        let same_major = current.major == requested.major;
        let same_minor = same_major && current.minor == requested.minor;
        let ok = match self.policy {
            SdkPolicy::Patch | SdkPolicy::LatestPatch => {
                same_minor && current.feature_band() == requested.feature_band()
            }
            SdkPolicy::Feature | SdkPolicy::LatestFeature => same_minor,
            SdkPolicy::Minor | SdkPolicy::LatestMinor => same_major,
            SdkPolicy::Major | SdkPolicy::LatestMajor | SdkPolicy::Disable => true,
        };
        ok && current >= requested
    }

    fn better(&self, current: &Version, previous: Option<&Version>) -> bool {
        let Some(previous) = previous else {
            return true;
        };
        if self.version.is_none()
            || self.policy.uses_latest()
            || (current.major == previous.major
                && current.minor == previous.minor
                && current.feature_band() == previous.feature_band())
        {
            current > previous
        } else {
            current < previous
        }
    }

    /// Picks an SDK among `sdks` (the `sdk/<version>` directories of one search root).
    pub fn pick<'a>(&self, sdk_dir: &Path, sdks: &'a [Component]) -> Option<Picked<'a>> {
        if matches!(self.policy, SdkPolicy::Disable | SdkPolicy::Patch)
            && let Some(requested) = &self.version
        {
            let probe = sdk_dir.join(requested.as_str());
            if probe.join("dotnet.dll").is_file() {
                return Some(Picked::Exact(requested.clone(), probe));
            }
        }
        if self.policy == SdkPolicy::Disable {
            return None;
        }
        let mut best: Option<&Component> = None;
        for sdk in sdks {
            if self.matches(&sdk.version) && self.better(&sdk.version, best.map(|b| &b.version)) {
                best = Some(sdk);
            }
        }
        best.map(Picked::Listed)
    }
}

pub enum Picked<'a> {
    Exact(Version, PathBuf),
    Listed(&'a Component),
}

#[derive(Debug, Clone)]
pub struct SdkResolution {
    pub request: SdkRequest,
    /// Search roots, in order.
    pub roots: Vec<PathBuf>,
    pub selected: Option<Component>,
    /// Muxer-style error when nothing matched.
    pub error: Option<String>,
}

/// Resolves the SDK `dotnet` would run from `cwd` with the install at `dotnet_root`.
pub fn resolve_sdk(dotnet_root: &Path, cwd: &Path) -> SdkResolution {
    resolve_sdk_with(dotnet_root, SdkRequest::from_cwd(cwd))
}

pub fn resolve_sdk_with(dotnet_root: &Path, request: SdkRequest) -> SdkResolution {
    let roots = request.search_roots(dotnet_root);
    let mut selected = None;
    for root in &roots {
        let sdk_dir = root.join("sdk");
        if !sdk_dir.is_dir() {
            continue;
        }
        let listed = crate::inventory::scan_root(root, String::new())
            .map(|install| install.sdks)
            .unwrap_or_default();
        if let Some(picked) = request.pick(&sdk_dir, &listed) {
            selected = Some(match picked {
                Picked::Exact(version, path) => Component { version, path },
                Picked::Listed(component) => component.clone(),
            });
            break;
        }
    }
    let error = selected.is_none().then(|| {
        if let Some(message) = &request.error_message {
            return message.clone();
        }
        match &request.version {
            Some(version) => {
                let mut text = format!("A compatible .NET SDK was not found.\n\nRequested SDK version: {version}");
                if let Some(path) = &request.global_json {
                    text.push_str(&format!("\nglobal.json file: {}", path.display()));
                }
                text
            }
            None => "No .NET SDKs were found.".to_owned(),
        }
    });
    SdkResolution {
        request,
        roots,
        selected,
        error,
    }
}

// ─── Frameworks (.runtimeconfig.json) ────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RollForward {
    Disable,
    LatestPatch,
    Minor,
    LatestMinor,
    Major,
    LatestMajor,
}

impl RollForward {
    const NAMES: [(&'static str, RollForward); 6] = [
        ("Disable", Self::Disable),
        ("LatestPatch", Self::LatestPatch),
        ("Minor", Self::Minor),
        ("LatestMinor", Self::LatestMinor),
        ("Major", Self::Major),
        ("LatestMajor", Self::LatestMajor),
    ];

    pub fn parse(name: &str) -> Option<Self> {
        Self::NAMES
            .iter()
            .find(|(known, _)| known.eq_ignore_ascii_case(name))
            .map(|(_, value)| *value)
    }

    pub fn as_str(self) -> &'static str {
        Self::NAMES.iter().find(|(_, value)| *value == self).map_or("", |(name, _)| name)
    }

    /// `rollForwardOnNoCandidateFx` (0, 1, 2).
    pub fn from_no_candidate_fx(value: i64) -> Option<Self> {
        match value {
            0 => Some(Self::LatestPatch),
            1 => Some(Self::Minor),
            2 => Some(Self::Major),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
enum Range {
    Exact,
    Patch,
    Minor,
    Major,
}

#[derive(Debug, Clone)]
pub struct FrameworkReference {
    pub name: String,
    pub version: Version,
    pub roll_forward: RollForward,
    pub apply_patches: bool,
    pub prefer_release: bool,
}

impl FrameworkReference {
    fn range(&self) -> (Range, bool) {
        match self.roll_forward {
            RollForward::Disable => (Range::Exact, false),
            RollForward::LatestPatch => (Range::Patch, false),
            RollForward::Minor => (Range::Minor, false),
            RollForward::LatestMinor => (Range::Minor, true),
            RollForward::Major => (Range::Major, false),
            RollForward::LatestMajor => (Range::Major, true),
        }
    }

    fn compatible(&self, higher: &Version) -> bool {
        let (range, _) = self.range();
        if *higher == self.version {
            return true;
        }
        if higher.major != self.version.major && range < Range::Major {
            return false;
        }
        if higher.minor != self.version.minor && range < Range::Minor {
            return false;
        }
        if higher.patch != self.version.patch && range == Range::Patch && !self.apply_patches {
            return false;
        }
        range != Range::Exact
    }

    fn best_without_patch_roll<'a>(&self, versions: &'a [Component], release_only: bool) -> Option<&'a Component> {
        let (range, highest) = self.range();
        if range < Range::Patch {
            return None;
        }
        let highest = range != Range::Patch && highest;
        let mut best: Option<&Component> = None;
        for candidate in versions {
            let version = &candidate.version;
            if (release_only && version.is_prerelease()) || *version < self.version || !self.compatible(version) {
                continue;
            }
            best = Some(match best {
                None => candidate,
                Some(previous) if (highest && version > &previous.version) || (!highest && version < &previous.version) => {
                    candidate
                }
                Some(previous) => previous,
            });
        }
        best
    }

    fn roll_to_latest_patch<'a>(&self, versions: &'a [Component], start: &'a Component, release_only: bool) -> &'a Component {
        let (range, _) = self.range();
        if range < Range::Patch || start.version.is_prerelease() {
            return start;
        }
        let from = &start.version;
        let mut best = start;
        for candidate in versions {
            let version = &candidate.version;
            if (!release_only || !version.is_prerelease())
                && (self.apply_patches || version.patch == from.patch)
                && version >= from
                && version.major == from.major
                && version.minor == from.minor
                && version > &best.version
            {
                best = candidate;
            }
        }
        best
    }

    fn search<'a>(&self, versions: &'a [Component], release_only: bool) -> Option<&'a Component> {
        let start = self.best_without_patch_roll(versions, release_only)?;
        Some(self.roll_to_latest_patch(versions, start, release_only))
    }

    /// The installed version the host would bind, or `None`.
    pub fn resolve<'a>(&self, framework_dir: &Path, versions: &'a [Component]) -> Option<Resolved<'a>> {
        let (range, _) = self.range();
        if range == Range::Exact || (range == Range::Patch && !self.apply_patches && !self.version.is_prerelease()) {
            let dir = framework_dir.join(self.version.as_str());
            let deps = dir.join(format!("{}.deps.json", self.name));
            return deps.is_file().then(|| Resolved::Exact(self.version.clone(), dir));
        }
        if self.prefer_release
            && let Some(found) = self.search(versions, true)
        {
            return Some(Resolved::Listed(found));
        }
        self.search(versions, false).map(Resolved::Listed)
    }
}

pub enum Resolved<'a> {
    Exact(Version, PathBuf),
    Listed(&'a Component),
}

impl Resolved<'_> {
    pub fn into_component(self) -> Component {
        match self {
            Self::Exact(version, path) => Component { version, path },
            Self::Listed(component) => component.clone(),
        }
    }
}

/// Settings that apply before the per-framework ones.
#[derive(Debug, Clone, Default)]
pub struct RollForwardEnv {
    /// `DOTNET_ROLL_FORWARD`.
    pub roll_forward: Option<String>,
    /// `DOTNET_ROLL_FORWARD_ON_NO_CANDIDATE_FX`.
    pub on_no_candidate_fx: Option<String>,
    /// `DOTNET_ROLL_FORWARD_TO_PRERELEASE`.
    pub to_prerelease: Option<String>,
}

impl RollForwardEnv {
    pub fn from_process() -> Self {
        let var = |name: &str| std::env::var(name).ok().filter(|value| !value.is_empty());
        Self {
            roll_forward: var("DOTNET_ROLL_FORWARD"),
            on_no_candidate_fx: var("DOTNET_ROLL_FORWARD_ON_NO_CANDIDATE_FX"),
            to_prerelease: var("DOTNET_ROLL_FORWARD_TO_PRERELEASE"),
        }
    }
}

/// Framework references of a `.runtimeconfig.json` (and `.runtimeconfig.dev.json` is not read:
/// it carries probing paths only), with the host's precedence: `rollForwardOnNoCandidateFx`
/// from the environment, then the file's options, then `DOTNET_ROLL_FORWARD`.
pub fn framework_references(json: &Value, env: &RollForwardEnv) -> Result<Vec<FrameworkReference>, String> {
    let options = json.get("runtimeOptions").and_then(Value::as_object);
    let mut roll_forward = RollForward::Minor;
    let mut apply_patches = true;
    if let Some(value) = env.on_no_candidate_fx.as_deref().and_then(|value| value.parse::<i64>().ok()) {
        roll_forward = RollForward::from_no_candidate_fx(value).unwrap_or(roll_forward);
    }
    let read_settings = |object: &serde_json::Map<String, Value>,
                         roll_forward: &mut RollForward,
                         apply_patches: &mut bool|
     -> Result<(), String> {
        if let Some(value) = object.get("rollForward").and_then(Value::as_str) {
            *roll_forward = RollForward::parse(value).ok_or("Invalid value for property 'rollForward'.")?;
        }
        if let Some(value) = object.get("applyPatches").and_then(Value::as_bool) {
            *apply_patches = value;
        }
        if let Some(value) = object.get("rollForwardOnNoCandidateFx").and_then(Value::as_i64) {
            *roll_forward = RollForward::from_no_candidate_fx(value).unwrap_or(*roll_forward);
        }
        Ok(())
    };
    if let Some(options) = options {
        read_settings(options, &mut roll_forward, &mut apply_patches)?;
    }
    if let Some(value) = &env.roll_forward {
        roll_forward = RollForward::parse(value).ok_or_else(|| format!("Invalid value for DOTNET_ROLL_FORWARD: {value}"))?;
    }
    let to_prerelease = env.to_prerelease.as_deref() == Some("1");
    let mut references = Vec::new();
    let mut entries: Vec<&serde_json::Map<String, Value>> = Vec::new();
    if let Some(options) = options {
        if let Some(framework) = options.get("framework").and_then(Value::as_object) {
            entries.push(framework);
        }
        if let Some(frameworks) = options.get("frameworks").and_then(Value::as_array) {
            entries.extend(frameworks.iter().filter_map(Value::as_object));
        }
    }
    for entry in entries {
        let name = entry.get("name").and_then(Value::as_str).ok_or("framework without a name")?;
        let text = entry.get("version").and_then(Value::as_str).ok_or("framework without a version")?;
        let version = Version::parse(text).ok_or_else(|| format!("invalid framework version {text}"))?;
        let (mut roll, mut patches) = (roll_forward, apply_patches);
        if env.roll_forward.is_none() {
            read_settings(entry, &mut roll, &mut patches)?;
        }
        references.push(FrameworkReference {
            name: name.to_owned(),
            prefer_release: !version.is_prerelease() && !to_prerelease,
            version,
            roll_forward: roll,
            apply_patches: patches,
        });
    }
    Ok(references)
}

fn strip_bom(bytes: &[u8]) -> std::borrow::Cow<'_, [u8]> {
    std::borrow::Cow::Borrowed(bytes.strip_prefix(b"\xef\xbb\xbf").unwrap_or(bytes))
}

/// Parses a JSON file that may start with a UTF-8 BOM.
pub fn read_json(path: &Path) -> Result<Value, String> {
    let bytes = std::fs::read(path).map_err(|error| format!("{}: {error}", path.display()))?;
    serde_json::from_slice(&strip_bom(&bytes)).map_err(|error| format!("{}: {error}", path.display()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn list(versions: &[&str]) -> Vec<Component> {
        versions
            .iter()
            .map(|text| Component {
                version: Version::parse(text).unwrap(),
                path: PathBuf::from(text),
            })
            .collect()
    }

    fn sdk(json: &str, installed: &[&str]) -> Option<String> {
        let value: Value = serde_json::from_str(json).unwrap();
        let request = SdkRequest::from_json(&value).unwrap();
        let sdks = list(installed);
        request.pick(Path::new("/nonexistent/sdk"), &sdks).map(|picked| match picked {
            Picked::Exact(version, _) => version.to_string(),
            Picked::Listed(component) => component.version.to_string(),
        })
    }

    #[test]
    fn global_json_policies() {
        let installed = ["8.0.100", "8.0.204", "8.0.212", "8.0.300", "9.0.100", "10.0.100-rc.1", "10.0.401"];
        assert_eq!(sdk("{}", &installed).as_deref(), Some("10.0.401"));
        assert_eq!(sdk(r#"{"sdk":{"version":"8.0.200"}}"#, &installed).as_deref(), Some("8.0.212"));
        assert_eq!(sdk(r#"{"sdk":{"version":"8.0.200","rollForward":"feature"}}"#, &installed).as_deref(), Some("8.0.212"));
        assert_eq!(sdk(r#"{"sdk":{"version":"8.0.250","rollForward":"feature"}}"#, &installed).as_deref(), Some("8.0.300"));
        assert_eq!(sdk(r#"{"sdk":{"version":"8.0.200","rollForward":"latestFeature"}}"#, &installed).as_deref(), Some("8.0.300"));
        assert_eq!(sdk(r#"{"sdk":{"version":"8.0.400","rollForward":"major"}}"#, &installed).as_deref(), Some("9.0.100"));
        assert_eq!(sdk(r#"{"sdk":{"version":"8.0.400","rollForward":"latestMajor"}}"#, &installed).as_deref(), Some("10.0.401"));
        assert_eq!(
            sdk(r#"{"sdk":{"version":"8.0.400","rollForward":"latestMajor","allowPrerelease":false}}"#, &installed).as_deref(),
            Some("10.0.401")
        );
        assert_eq!(sdk(r#"{"sdk":{"version":"8.0.400","rollForward":"minor"}}"#, &installed), None);
        assert_eq!(sdk(r#"{"sdk":{"version":"8.0.205","rollForward":"disable"}}"#, &installed), None);
        assert_eq!(
            sdk(r#"{"sdk":{"version":"10.0.100-preview.1","rollForward":"patch"}}"#, &["10.0.100-rc.1", "10.0.100"]).as_deref(),
            Some("10.0.100")
        );
        let value: Value = serde_json::from_str(r#"{"sdk":{"rollForward":"patch"}}"#).unwrap();
        assert!(SdkRequest::from_json(&value).is_err());
        let value: Value = serde_json::from_str(r#"{"sdk":{"version":"8.0.0"}}"#).unwrap();
        assert!(matches!(SdkRequest::from_json(&value), Err((Some(_), _))));
    }

    fn fx(roll: RollForward, apply_patches: bool, requested: &str, installed: &[&str]) -> Option<String> {
        let version = Version::parse(requested).unwrap();
        let reference = FrameworkReference {
            name: "Microsoft.NETCore.App".into(),
            prefer_release: !version.is_prerelease(),
            version,
            roll_forward: roll,
            apply_patches,
        };
        let versions = list(installed);
        reference
            .resolve(Path::new("/nonexistent"), &versions)
            .map(|resolved| resolved.into_component().version.to_string())
    }

    #[test]
    fn runtimeconfig_roll_forward() {
        let installed = ["8.0.1", "8.0.21", "8.2.3", "9.0.0-rc.1", "9.0.5", "10.0.12"];
        assert_eq!(fx(RollForward::Minor, true, "8.0.0", &installed).as_deref(), Some("8.0.21"));
        assert_eq!(fx(RollForward::Minor, true, "8.1.0", &installed).as_deref(), Some("8.2.3"));
        assert_eq!(fx(RollForward::LatestMinor, true, "8.0.0", &installed).as_deref(), Some("8.2.3"));
        assert_eq!(fx(RollForward::Major, true, "8.3.0", &installed).as_deref(), Some("9.0.5"));
        assert_eq!(fx(RollForward::LatestMajor, true, "8.0.0", &installed).as_deref(), Some("10.0.12"));
        assert_eq!(fx(RollForward::LatestPatch, true, "8.0.2", &installed).as_deref(), Some("8.0.21"));
        assert_eq!(fx(RollForward::LatestPatch, true, "8.1.0", &installed), None);
        assert_eq!(fx(RollForward::Minor, true, "10.0.0", &installed).as_deref(), Some("10.0.12"));
        assert_eq!(fx(RollForward::Disable, true, "8.0.1", &installed), None);
        assert_eq!(fx(RollForward::Major, true, "9.0.0-preview.1", &["9.0.0-rc.1", "9.0.5"]).as_deref(), Some("9.0.0-rc.1"));
    }

    #[test]
    fn runtimeconfig_precedence() {
        let json: Value = serde_json::from_str(
            r#"{"runtimeOptions":{"rollForward":"LatestMajor","frameworks":[{"name":"Microsoft.NETCore.App","version":"8.0.0"},{"name":"Microsoft.AspNetCore.App","version":"8.0.0","rollForward":"Disable"}]}}"#,
        )
        .unwrap();
        let references = framework_references(&json, &RollForwardEnv::default()).unwrap();
        assert_eq!(references[0].roll_forward, RollForward::LatestMajor);
        assert_eq!(references[1].roll_forward, RollForward::Disable);
        let env = RollForwardEnv {
            roll_forward: Some("major".into()),
            ..Default::default()
        };
        let references = framework_references(&json, &env).unwrap();
        assert!(references.iter().all(|reference| reference.roll_forward == RollForward::Major));
    }
}
