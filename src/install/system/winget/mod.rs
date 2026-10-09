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

mod installer;

use super::value::{self, Value};
use super::{
    Ctx, Error, InstallRoot, InstalledRecord, LockEntry, PackageInfo, Result, SearchHit, Source,
    SourceKind,
};

use aphrody_pkg_system::winget::{self as pure, IndexRow, VersionRef, check_id, url_join};

pub use pure::DEFAULT_SOURCE;

#[derive(Default)]
pub struct Winget {
    index: Option<Vec<IndexRow>>,
}

pub fn base_url(ctx: &Ctx<'_>) -> String {
    let mut base = ctx
        .env_var(b"BUN_WINGET_SOURCE")
        .unwrap_or_else(|| DEFAULT_SOURCE.to_owned());
    while base.ends_with('/') {
        base.pop();
    }
    base
}

impl Winget {
    fn load_index(&mut self, ctx: &Ctx<'_>) -> Result<&[IndexRow]> {
        if self.index.is_none() {
            let base = base_url(ctx);
            let cache_name = {
                let mut n = String::from("index-");
                n.push_str(&super::sha256_hex_of(base.as_bytes())[..12]);
                n.push_str(".db");
                n
            };
            let cache_path = super::join(&ctx.source_cache_dir(SourceKind::Winget), &[cache_name.as_bytes()]);
            let cached = super::fs::read_with_age(&cache_path);
            let fresh = cached
                .as_ref()
                .is_some_and(|(_, age)| !ctx.options.refresh && (ctx.options.offline || *age <= pure::INDEX_MAX_AGE_SECS));
            let db = match cached {
                Some((bytes, _)) if fresh => bytes,
                stale => match download_index(ctx, &base) {
                    Ok(bytes) => {
                        super::fs::write(&cache_path, &bytes)?;
                        bytes
                    }
                    Err(err) => match stale {
                        Some((bytes, _)) => bytes,
                        None => return Err(err),
                    },
                },
            };
            self.index = Some(pure::parse_index(&db)?);
        }
        Ok(self.index.as_deref().unwrap_or(&[]))
    }

    fn find(&mut self, ctx: &Ctx<'_>, id: &str) -> Result<IndexRow> {
        check_id(id)?;
        Ok(pure::find(self.load_index(ctx)?, id)?.clone())
    }

    fn versions(&self, ctx: &Ctx<'_>, row: &IndexRow) -> Result<Vec<VersionRef>> {
        let url = url_join(&base_url(ctx), &row.version_data_path());
        // The path embeds the index hash, so a cached copy never goes stale.
        let bytes = ctx.fetch_cached(SourceKind::Winget, &row.version_data_cache_name(), &url, u64::MAX)?;
        let yaml = super::mszip::decode(&bytes)?;
        let doc = value::parse_yaml(&yaml, "versionData.yaml")?;
        Ok(pure::version_refs(&doc, &row.id)?)
    }

    fn manifest(&self, ctx: &Ctx<'_>, id: &str, v: &VersionRef) -> Result<Value> {
        let url = url_join(&base_url(ctx), &v.rel_path);
        let what = format!("winget manifest {id}@{}", v.version);
        let (bytes, _) = ctx.fetch_verified(SourceKind::Winget, &what, &url, &v.sha256, ".yaml")?;
        value::parse_yaml(&bytes, "manifest.yaml")
    }
}

fn download_index(ctx: &Ctx<'_>, base: &str) -> Result<Vec<u8>> {
    let msix = ctx.fetch(&url_join(base, pure::SOURCE_MSIX))?;
    super::archive::read_entry(&msix, "source2.msix", pure::INDEX_ENTRY)?
        .ok_or_else(|| Error::Parse("source2.msix has no Public/index.db".to_owned()))
}

impl Source for Winget {
    fn kind(&self) -> SourceKind {
        SourceKind::Winget
    }

    fn host_can_install(&self, _ctx: &Ctx<'_>) -> bool {
        cfg!(windows)
    }

    fn search(&mut self, ctx: &Ctx<'_>, query: &str, limit: usize) -> Result<Vec<SearchHit>> {
        let index = self.load_index(ctx)?;
        Ok(pure::search(index, query, limit)
            .into_iter()
            .map(|r| SearchHit {
                id: r.id.clone(),
                name: r.name.clone(),
                version: r.latest.clone(),
                description: None,
            })
            .collect())
    }

    fn info(&mut self, ctx: &Ctx<'_>, id: &str) -> Result<PackageInfo> {
        let row = self.find(ctx, id)?;
        let versions = self.versions(ctx, &row)?;
        let latest = versions[0].clone();
        let m = self.manifest(ctx, &row.id, &latest)?;
        let s = |k: &str| m.str_ci(k).map(str::to_owned);
        Ok(PackageInfo {
            id: row.id.clone(),
            name: s("PackageName").unwrap_or(row.name),
            latest: latest.version,
            versions: versions.into_iter().map(|v| v.version).collect(),
            publisher: s("Publisher"),
            description: s("ShortDescription").or_else(|| s("Description")),
            homepage: s("PackageUrl").or_else(|| s("PublisherUrl")),
            license: s("License"),
        })
    }

    fn resolve(&mut self, ctx: &Ctx<'_>, id: &str, range: &str) -> Result<LockEntry> {
        let row = self.find(ctx, id)?;
        let versions = self.versions(ctx, &row)?;
        let v = pure::select_version(&versions, &row.id, range)?;
        let m = self.manifest(ctx, &row.id, v)?;
        let mut entry = LockEntry::new(SourceKind::Winget, &row.id);
        range.clone_into(&mut entry.specifier);
        entry.version.clone_from(&v.version);
        entry.url = url_join(&base_url(ctx), &v.rel_path);
        entry.hash = format!("sha256:{}", v.sha256);
        entry.deps = pure::manifest_deps(&m);
        entry.meta.insert("manifest".to_owned(), v.rel_path.clone());
        Ok(entry)
    }

    fn install(&mut self, ctx: &Ctx<'_>, entry: &LockEntry, root: &InstallRoot) -> Result<InstalledRecord> {
        check_id(&entry.id)?;
        let sha = entry
            .hash
            .strip_prefix("sha256:")
            .ok_or_else(|| Error::Parse(format!("winget lock entry {} has no sha256 hash", entry.id)))?;
        let what = format!("winget manifest {}@{}", entry.id, entry.version);
        let (bytes, _) = ctx.fetch_verified(SourceKind::Winget, &what, &entry.url, sha, ".yaml")?;
        let manifest = value::parse_yaml(&bytes, "manifest.yaml")?;
        installer::install(ctx, entry, &manifest, root)
    }

    fn remove(&mut self, ctx: &Ctx<'_>, record: &InstalledRecord, root: &InstallRoot) -> Result<()> {
        installer::remove(ctx, record, root)
    }
}
