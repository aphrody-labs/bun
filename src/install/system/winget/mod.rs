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

pub const DEFAULT_SOURCE: &str = "https://cdn.winget.microsoft.com/cache";

/// The index is refreshed after an hour, like `winget source update`'s auto-update.
const INDEX_MAX_AGE_SECS: u64 = 60 * 60;

#[derive(Clone, Debug)]
struct IndexRow {
    id: String,
    name: String,
    moniker: Option<String>,
    latest: String,
    hash: Vec<u8>,
}

#[derive(Clone, Debug)]
struct VersionRef {
    version: String,
    rel_path: String,
    sha256: String,
}

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

fn url_join(base: &str, rel: &str) -> String {
    let mut url = String::with_capacity(base.len() + 1 + rel.len());
    url.push_str(base);
    url.push('/');
    url.push_str(rel.trim_start_matches('/'));
    url
}

/// Package ids go into URLs verbatim; reject anything that could escape the path.
fn check_id(id: &str) -> Result<()> {
    let ok = !id.is_empty()
        && id
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, b'.' | b'-' | b'_' | b'+'))
        && !id.starts_with('.');
    if ok {
        Ok(())
    } else {
        Err(Error::Parse(format!("invalid winget package id \"{id}\"")))
    }
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
                .is_some_and(|(_, age)| !ctx.options.refresh && (ctx.options.offline || *age <= INDEX_MAX_AGE_SECS));
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
            self.index = Some(parse_index(&db)?);
        }
        Ok(self.index.as_deref().unwrap_or(&[]))
    }

    fn find(&mut self, ctx: &Ctx<'_>, id: &str) -> Result<IndexRow> {
        check_id(id)?;
        self.load_index(ctx)?
            .iter()
            .find(|r| r.id.eq_ignore_ascii_case(id))
            .cloned()
            .ok_or_else(|| Error::NotFound(format!("winget package \"{id}\"")))
    }

    fn versions(&self, ctx: &Ctx<'_>, row: &IndexRow) -> Result<Vec<VersionRef>> {
        let hash8 = &super::hex(&row.hash)[..8.min(row.hash.len() * 2)];
        let rel = format!("packages/{}/{}/versionData.mszyml", row.id, hash8);
        let url = url_join(&base_url(ctx), &rel);
        let cache_name = format!("versions/{}-{}.mszyml", row.id, hash8);
        // The path embeds the index hash, so a cached copy never goes stale.
        let bytes = ctx.fetch_cached(SourceKind::Winget, &cache_name, &url, u64::MAX)?;
        let yaml = super::mszip::decode(&bytes)?;
        let doc = value::parse_yaml(&yaml, "versionData.yaml")?;
        let mut out = Vec::new();
        for v in doc.array_ci("vD") {
            let (Some(version), Some(rel_path), Some(sha256)) = (v.str_ci("v"), v.str_ci("rP"), v.str_ci("s256H")) else {
                continue;
            };
            out.push(VersionRef {
                version: version.to_owned(),
                rel_path: rel_path.to_owned(),
                sha256: sha256.to_ascii_lowercase(),
            });
        }
        if out.is_empty() {
            return Err(Error::Parse(format!("winget: no versions listed for {}", row.id)));
        }
        out.sort_by(|a, b| super::version::compare(&b.version, &a.version));
        Ok(out)
    }

    fn manifest(&self, ctx: &Ctx<'_>, id: &str, v: &VersionRef) -> Result<Value> {
        let url = url_join(&base_url(ctx), &v.rel_path);
        let what = format!("winget manifest {id}@{}", v.version);
        let (bytes, _) = ctx.fetch_verified(SourceKind::Winget, &what, &url, &v.sha256, ".yaml")?;
        value::parse_yaml(&bytes, "manifest.yaml")
    }
}

fn download_index(ctx: &Ctx<'_>, base: &str) -> Result<Vec<u8>> {
    let msix = ctx.fetch(&url_join(base, "source2.msix"))?;
    super::archive::read_entry(&msix, "source2.msix", b"Public/index.db")?
        .ok_or_else(|| Error::Parse("source2.msix has no Public/index.db".to_owned()))
}

fn parse_index(db: &[u8]) -> Result<Vec<IndexRow>> {
    let db = super::sqlite::Database::open(db)?;
    let (root, cols) = db.table("packages")?;
    let col = |name: &str| cols.iter().position(|c| c.eq_ignore_ascii_case(name));
    let (Some(c_id), Some(c_name), Some(c_latest), Some(c_hash)) =
        (col("id"), col("name"), col("latest_version"), col("hash"))
    else {
        return Err(Error::Parse("winget index: unexpected packages table layout".to_owned()));
    };
    let c_moniker = col("moniker");
    let mut rows = Vec::new();
    db.scan(root, &mut |_, cells| {
        let text = |i: usize| cells.get(i).and_then(|c| c.text()).map(super::lossy);
        let (Some(id), Some(latest)) = (text(c_id), text(c_latest)) else {
            return Ok(());
        };
        rows.push(IndexRow {
            id,
            name: text(c_name).unwrap_or_default(),
            moniker: c_moniker.and_then(text),
            latest,
            hash: cells.get(c_hash).and_then(|c| c.bytes()).map(<[u8]>::to_vec).unwrap_or_default(),
        });
        Ok(())
    })?;
    Ok(rows)
}

/// `Dependencies.PackageDependencies[].PackageIdentifier`, at the root or on any installer.
fn manifest_deps(m: &Value) -> Vec<String> {
    let mut deps: Vec<String> = Vec::new();
    let mut add = |node: &Value| {
        if let Some(d) = node.get_ci("Dependencies") {
            for p in d.array_ci("PackageDependencies") {
                if let Some(id) = p.str_ci("PackageIdentifier") {
                    let key = super::lock_key(SourceKind::Winget, id);
                    if !deps.contains(&key) {
                        deps.push(key);
                    }
                }
            }
        }
    };
    add(m);
    for inst in m.array_ci("Installers") {
        add(inst);
    }
    deps
}

fn contains_ci(haystack: &str, needle_lower: &str) -> bool {
    bun_core::strings::index_of(haystack.to_ascii_lowercase().as_bytes(), needle_lower.as_bytes()).is_some()
}

impl Source for Winget {
    fn kind(&self) -> SourceKind {
        SourceKind::Winget
    }

    fn host_can_install(&self, _ctx: &Ctx<'_>) -> bool {
        cfg!(windows)
    }

    fn search(&mut self, ctx: &Ctx<'_>, query: &str, limit: usize) -> Result<Vec<SearchHit>> {
        let q = query.trim().to_ascii_lowercase();
        let index = self.load_index(ctx)?;
        let mut hits: Vec<(u8, &IndexRow)> = index
            .iter()
            .filter_map(|r| {
                let rank = if r.id.eq_ignore_ascii_case(&q)
                    || r.moniker.as_deref().is_some_and(|m| m.eq_ignore_ascii_case(&q))
                {
                    0
                } else if r.name.eq_ignore_ascii_case(&q) {
                    1
                } else if contains_ci(&r.id, &q) || r.moniker.as_deref().is_some_and(|m| contains_ci(m, &q)) {
                    2
                } else if contains_ci(&r.name, &q) {
                    3
                } else {
                    return None;
                };
                Some((rank, r))
            })
            .collect();
        hits.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| a.1.id.to_ascii_lowercase().cmp(&b.1.id.to_ascii_lowercase())));
        Ok(hits
            .into_iter()
            .take(if limit == 0 { usize::MAX } else { limit })
            .map(|(_, r)| SearchHit {
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
            name: s("PackageName").unwrap_or(row.name.clone()),
            latest: latest.version.clone(),
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
        let best = super::version::best_match(versions.iter().map(|v| v.version.as_str()), range, super::version::compare)
            .ok_or_else(|| Error::NoMatchingVersion {
                id: row.id.clone(),
                range: range.to_owned(),
            })?
            .to_owned();
        let v = versions
            .iter()
            .find(|v| v.version == best)
            .expect("best_match returns one of the inputs");
        let m = self.manifest(ctx, &row.id, v)?;
        let mut entry = LockEntry::new(SourceKind::Winget, &row.id);
        entry.specifier = range.to_owned();
        entry.version = v.version.clone();
        entry.url = url_join(&base_url(ctx), &v.rel_path);
        entry.hash = format!("sha256:{}", v.sha256);
        entry.deps = manifest_deps(&m);
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
