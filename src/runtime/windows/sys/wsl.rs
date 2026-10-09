//! Registered WSL distributions, read from `HKCU\...\Lxss` (no `wsl.exe` round-trip).

use super::Json;
use super::registry::{read_dword, read_string, root, subkeys};

const LXSS: &str = r"Software\Microsoft\Windows\CurrentVersion\Lxss";
const HKCU: u32 = 1;

/// `[{ id, name, basePath, version, default }]`; empty when WSL has no distribution.
pub(crate) fn distributions_json() -> String {
    let mut j = Json::new();
    j.begin_array();
    if let Some(hkcu) = root(HKCU) {
        let default = read_string(hkcu, LXSS, "DefaultDistribution").unwrap_or_default();
        for id in subkeys(hkcu, LXSS) {
            let path = format!(r"{LXSS}\{id}");
            let Some(name) = read_string(hkcu, &path, "DistributionName") else {
                continue;
            };
            let base_path = read_string(hkcu, &path, "BasePath").unwrap_or_default();
            let version = read_dword(hkcu, &path, "Version").unwrap_or(1);
            j.begin_object()
                .field_str("id", &id)
                .field_str("name", &name)
                .field_str(
                    "basePath",
                    base_path.strip_prefix(r"\\?\").unwrap_or(&base_path),
                )
                .field_num("version", version as f64)
                .field_bool("default", id.eq_ignore_ascii_case(&default))
                .end_object();
        }
    }
    j.end_array();
    j.finish()
}
