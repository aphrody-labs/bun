//! ConPTY capabilities of the running Windows build. Sessions are created by `Bun.Terminal`.

use super::system::version_numbers;
use super::{system_proc, Json};

/// First build exporting `CreatePseudoConsole` (Windows 10 version 1809).
const CONPTY_BUILD: u32 = 17763;

/// `{ supported, build, releasePseudoConsole, closeBlocks }`.
///
/// `releasePseudoConsole` is true when kernel32 exports `ReleasePseudoConsole` (Windows 11
/// 24H2+). Without it, `ClosePseudoConsole` blocks until the output pipe is drained.
pub(crate) fn info_json() -> String {
    let (major, _minor, build) = version_numbers();
    let supported = major == 10 && build >= CONPTY_BUILD;
    let release = system_proc("kernel32.dll", c"ReleasePseudoConsole").is_some();
    let mut j = Json::new();
    j.begin_object()
        .field_bool("supported", supported)
        .field_num("build", build as f64)
        .field_bool("releasePseudoConsole", release)
        .field_bool("closeBlocks", !release)
        .end_object();
    j.finish()
}
