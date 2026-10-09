//! winget community source, read natively (no `winget.exe`).
//!
//! Protocol (source v2, `https://cdn.winget.microsoft.com/cache`):
//! 1. `source2.msix` (zip) → `Public/index.db` (SQLite): table `packages(id, name, moniker,
//!    latest_version, hash)`.
//! 2. `packages/<id>/<hex(hash)[0..8]>/versionData.mszyml`: MSZIP-compressed YAML
//!    `vD: [{ v, rP, s256H }]` (version, manifest path, manifest sha256).
//! 3. `<rP>`: merged YAML manifest, verified against `s256H`.
//!
//! `BUN_WINGET_SOURCE` overrides the base URL (tests point it at a local server).

use super::{Ctx, InstallRoot, InstalledRecord, LockEntry, PackageInfo, Result, SearchHit, Source, SourceKind};

pub const DEFAULT_SOURCE: &str = "https://cdn.winget.microsoft.com/cache";

#[derive(Default)]
pub struct Winget {}

impl Source for Winget {
    fn kind(&self) -> SourceKind {
        SourceKind::Winget
    }

    fn host_can_install(&self, _ctx: &Ctx<'_>) -> bool {
        cfg!(windows)
    }

    fn search(&mut self, _ctx: &Ctx<'_>, _query: &str, _limit: usize) -> Result<Vec<SearchHit>> {
        Err(super::Error::Unsupported("winget search: ⏳".to_owned()))
    }

    fn info(&mut self, _ctx: &Ctx<'_>, _id: &str) -> Result<PackageInfo> {
        Err(super::Error::Unsupported("winget info: ⏳".to_owned()))
    }

    fn resolve(&mut self, _ctx: &Ctx<'_>, _id: &str, _range: &str) -> Result<LockEntry> {
        Err(super::Error::Unsupported("winget resolve: ⏳".to_owned()))
    }

    fn install(
        &mut self,
        _ctx: &Ctx<'_>,
        _entry: &LockEntry,
        _root: &InstallRoot,
    ) -> Result<InstalledRecord> {
        Err(super::Error::Unsupported("winget install: ⏳".to_owned()))
    }

    fn remove(
        &mut self,
        _ctx: &Ctx<'_>,
        _record: &InstalledRecord,
        _root: &InstallRoot,
    ) -> Result<()> {
        Err(super::Error::Unsupported("winget remove: ⏳".to_owned()))
    }
}
