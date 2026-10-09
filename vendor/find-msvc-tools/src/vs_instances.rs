use std::borrow::Cow;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

use crate::setup_config::{EnumSetupInstances, SetupInstance};

pub enum VsInstance {
    Com(SetupInstance),
    State(StateInstance),
}

impl VsInstance {
    #[allow(dead_code)]
    pub fn instance_id(&self) -> Option<Cow<'_, str>> {
        match self {
            VsInstance::Com(s) => s
                .instance_id()
                .ok()
                .and_then(|s| s.into_string().ok())
                .map(Cow::from),
            VsInstance::State(v) => v.map.get("instanceId").map(Cow::from),
        }
    }

    pub fn installation_name(&self) -> Option<Cow<'_, str>> {
        match self {
            VsInstance::Com(s) => s
                .installation_name()
                .ok()
                .and_then(|s| s.into_string().ok())
                .map(Cow::from),
            VsInstance::State(v) => v.map.get("installationName").map(Cow::from),
        }
    }

    pub fn installation_path(&self) -> Option<PathBuf> {
        match self {
            VsInstance::Com(s) => s.installation_path().ok().map(PathBuf::from),
            VsInstance::State(v) => v.map.get("installationPath").map(PathBuf::from),
        }
    }

    pub fn installation_version(&self) -> Option<Cow<'_, str>> {
        match self {
            VsInstance::Com(s) => s
                .installation_version()
                .ok()
                .and_then(|s| s.into_string().ok())
                .map(Cow::from),
            VsInstance::State(v) => v.map.get("installationVersion").map(Cow::from),
        }
    }
}

pub enum VsInstances {
    ComBased(EnumSetupInstances),
    StateBased(Vec<StateInstance>),
}

impl IntoIterator for VsInstances {
    type Item = VsInstance;
    #[allow(bare_trait_objects)]
    type IntoIter = Box<dyn Iterator<Item = Self::Item>>;

    fn into_iter(self) -> Self::IntoIter {
        match self {
            VsInstances::ComBased(e) => {
                Box::new(e.into_iter().filter_map(Result::ok).map(VsInstance::Com))
            }
            VsInstances::StateBased(v) => Box::new(v.into_iter().map(VsInstance::State)),
        }
    }
}

/// An instance read from the Visual Studio Installer's own record,
/// `%ProgramData%\Microsoft\VisualStudio\Packages\_Instances\<id>\state.json` (what the Setup
/// Configuration COM server reads). Used when that COM server is not registered, as on some ARM64
/// installs, instead of running `vswhere.exe`.
#[derive(Debug)]
pub struct StateInstance {
    map: HashMap<String, String>,
}

impl StateInstance {
    const KEYS: [&'static str; 3] = ["installationName", "installationPath", "installationVersion"];

    pub fn parse(id: &str, json: &[u8]) -> Result<Self, &'static str> {
        let text = std::str::from_utf8(json).map_err(|_| "state.json is not UTF-8")?;
        let mut map = HashMap::new();
        map.insert("instanceId".to_owned(), id.to_owned());
        for key in Self::KEYS {
            let value = top_level_string(text.as_bytes(), key).ok_or("required properties not found")?;
            map.insert(key.to_owned(), value);
        }
        Ok(Self { map })
    }

    /// Every instance under `instances_dir` (`...\Packages\_Instances`).
    pub fn read_all(instances_dir: &Path) -> Vec<Self> {
        let Ok(entries) = instances_dir.read_dir() else {
            return Vec::new();
        };
        entries
            .filter_map(Result::ok)
            .filter_map(|entry| {
                let id = entry.file_name().into_string().ok()?;
                let bytes = std::fs::read(entry.path().join("state.json")).ok()?;
                Self::parse(&id, &bytes).ok()
            })
            .collect()
    }
}

fn skip_ws(bytes: &[u8], mut i: usize) -> usize {
    while i < bytes.len() && matches!(bytes[i], b' ' | b'\t' | b'\r' | b'\n') {
        i += 1;
    }
    i
}

/// The string value of `key` at depth 1 of a JSON object (nested objects are skipped).
fn top_level_string(bytes: &[u8], key: &str) -> Option<String> {
    let mut depth = 0usize;
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'{' | b'[' => depth += 1,
            b'}' | b']' => depth = depth.saturating_sub(1),
            b'"' => {
                let (s, end) = json_string(bytes, i)?;
                i = end;
                if depth == 1 && s == key {
                    let j = skip_ws(bytes, i);
                    if bytes.get(j) == Some(&b':') {
                        let j = skip_ws(bytes, j + 1);
                        if bytes.get(j) == Some(&b'"') {
                            return json_string(bytes, j).map(|(s, _)| s);
                        }
                    }
                }
                continue;
            }
            _ => {}
        }
        i += 1;
    }
    None
}

/// Decodes the JSON string starting at `bytes[start] == b'"'`; returns it and the index after the
/// closing quote.
fn json_string(bytes: &[u8], start: usize) -> Option<(String, usize)> {
    let mut out = Vec::new();
    let mut i = start + 1;
    while i < bytes.len() {
        match bytes[i] {
            b'"' => return Some((String::from_utf8(out).ok()?, i + 1)),
            b'\\' => {
                i += 1;
                match *bytes.get(i)? {
                    b'n' => out.push(b'\n'),
                    b'r' => out.push(b'\r'),
                    b't' => out.push(b'\t'),
                    b'b' => out.push(8),
                    b'f' => out.push(12),
                    b'u' => {
                        let hex = std::str::from_utf8(bytes.get(i + 1..i + 5)?).ok()?;
                        let mut code = u32::from_str_radix(hex, 16).ok()?;
                        i += 4;
                        if (0xD800..0xDC00).contains(&code)
                            && bytes.get(i + 1) == Some(&b'\\')
                            && bytes.get(i + 2) == Some(&b'u')
                        {
                            let low = std::str::from_utf8(bytes.get(i + 3..i + 7)?).ok()?;
                            let low = u32::from_str_radix(low, 16).ok()?;
                            code = 0x10000 + ((code - 0xD800) << 10) + (low.wrapping_sub(0xDC00) & 0x3FF);
                            i += 6;
                        }
                        let ch = char::from_u32(code).unwrap_or('\u{FFFD}');
                        let mut buf = [0; 4];
                        out.extend_from_slice(ch.encode_utf8(&mut buf).as_bytes());
                    }
                    other => out.push(other),
                }
            }
            b => out.push(b),
        }
        i += 1;
    }
    None
}

#[cfg(test)]
mod tests_ {
    use std::borrow::Cow;
    use std::path::PathBuf;

    #[test]
    fn it_parses_state_json_correctly() {
        let json = br#"{"icon":{"mimeType":"image/svg+xml","installationName":"nested"},"installationName":"VisualStudio/18.10.2+12217.157","catalogInfo":{"id":"VisualStudio/18.10.2+12217.157","productDisplayVersion":"18.10.2"},"installationPath":"C:\\Program Files (x86)\\Microsoft Visual Studio\\18\\BuildTools","installationVersion":"18.10.12217.157","localizedResources":[{"title":"Build Tools \u00e9"}]}"#;
        let instance = super::StateInstance::parse("75701dc3", json).unwrap();
        let vs_instance = super::VsInstance::State(instance);
        assert_eq!(vs_instance.instance_id(), Some(Cow::from("75701dc3")));
        assert_eq!(
            vs_instance.installation_name(),
            Some(Cow::from("VisualStudio/18.10.2+12217.157"))
        );
        assert_eq!(
            vs_instance.installation_path(),
            Some(PathBuf::from(
                r"C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools"
            ))
        );
        assert_eq!(
            vs_instance.installation_version(),
            Some(Cow::from("18.10.12217.157"))
        );
    }

    #[test]
    fn it_returns_an_error_for_empty_or_incomplete_state() {
        assert!(super::StateInstance::parse("x", b"").is_err());
        assert!(super::StateInstance::parse("x", b"{}").is_err());
        assert!(super::StateInstance::parse(
            "x",
            br#"{"catalogInfo":{"installationName":"a","installationPath":"b","installationVersion":"c"}}"#
        )
        .is_err());
    }
}
