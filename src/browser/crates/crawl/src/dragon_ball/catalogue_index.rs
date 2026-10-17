// SPDX-License-Identifier: Apache-2.0
//! Offline projections of public catalogue metadata, never media acquisition.
use serde_json::Value;
use std::{
    collections::{BTreeMap, BTreeSet},
    path::Path,
};

pub(super) const EXPORTS: &[&str] = &[
    "shenron-catalogue.json",
    "shenron_catalogue.json",
    "toei-episodes.json",
    "jump-stats.json",
    "db_official_news.json",
    "dragonballcn.json",
    "data/catalogues/dragonballcn.json",
    "publications/manga-catalogue/index.json",
    "catalog/assets/index.json",
];

#[derive(Default)]
struct MangaVolumeAssets {
    asset_count: u64,
    total_bytes: u64,
    numbered_webp_count: u64,
    image_numbers: BTreeSet<u64>,
}

fn manga_volume_asset(path: &str) -> Option<(String, u64, Option<u64>)> {
    let mut parts = path.split('/');
    if !parts.next()?.is_empty() || parts.next()? != "assets" || parts.next()? != "manga" {
        return None;
    }
    let series = parts.next()?;
    let folder = parts.next()?;
    let filename = parts.next()?;
    if parts.next().is_some() || series.is_empty() {
        return None;
    }
    let volume = folder.strip_prefix("vol")?.parse::<u64>().ok()?;
    let image_number = filename
        .strip_suffix(".webp")
        .and_then(|number| number.parse::<u64>().ok());
    Some((series.to_owned(), volume, image_number))
}

/// Keep the catalogue records separate from captured page bodies at the same URL.
/// URL validation is supplied by the Web owner, including its source deny-set.
pub(super) fn read_catalogue(
    path: &Path,
    validate: impl Fn(&str) -> Result<(), String>,
    digest: impl Fn(&[u8]) -> String,
) -> Result<BTreeMap<String, String>, String> {
    let bytes = std::fs::read(path).map_err(|error| format!("{}: {error}", path.display()))?;
    let value: Value =
        serde_json::from_slice(&bytes).map_err(|error| format!("{}: {error}", path.display()))?;
    let mut documents = BTreeMap::new();
    let schema = value.get("schema").and_then(Value::as_str);
    let base = match schema {
        Some("shenron-manga-cdn/v1") => {
            "https://cdn.dragonballfr.com/publications/manga-catalogue/index.json"
        }
        Some("shenron-public-cdn/v1") => "https://cdn.dragonballfr.com/catalog/assets/index.json",
        Some("aphrody-dragonballcn-snapshot/v1") => "https://comic.dragonballcn.com/",
        Some("aphrody-bun-rust-crate-index/v1") => "https://github.com/aphrody-labs/bun",
        Some(other) => return Err(format!("unsupported catalogue schema: {other}")),
        None => "https://dragonballfr.com/",
    };
    let provenance = serde_json::json!({
        "schema": schema,
        "revision": value.get("revision"),
        "observedAt": value.get("observedAt").or_else(|| value.get("releve_le")),
        "scope": value.get("scope"),
        "totals": value.get("totals"),
        "assetAvailabilityVerified": value.get("assetAvailabilityVerified"),
        "fullEditionPaginationVerified": value.get("fullEditionPaginationVerified"),
        "complete": value.get("complete"),
        "previewVolumeIds": value.get("previewVolumeIds"),
        "missingOrPartialReaderVolumeIds": value.get("missingOrPartialReaderVolumeIds"),
        "assetInventorySha256": value.get("assetInventorySha256"),
        "inventorySha256": value.get("inventorySha256"),
        "repository": value.get("repository"),
        "producer": value.get("producer"),
        "coverage": value.get("coverage"),
        "notice": value.get("avertissement"),
        "canonical_eligible": false,
        "catalogueSha256": digest(&bytes),
    });
    let mut add =
        |kind: &str, identity: String, row: &Value, fallback: &str| -> Result<(), String> {
            let source = row
                .get("url")
                .or_else(|| row.get("url_fiche"))
                .or_else(|| row.get("sourceUrl"))
                .and_then(Value::as_str)
                .unwrap_or(fallback);
            validate(source)?;
            let title = [
                "title",
                "titre_tome",
                "libelle",
                "name",
                "titre",
                "title_ja",
            ]
            .into_iter()
            .find_map(|field| {
                row.get(field)
                    .and_then(Value::as_str)
                    .filter(|title| !title.trim().is_empty())
            })
            .unwrap_or(kind);
            // A fixed projection excludes unrecognized/private fields from exported snapshots.
            let mut fields = serde_json::Map::new();
            for field in [
                "id",
                "name",
                "version",
                "license",
                "manifest",
                "domain",
                "snapshot",
                "snapshotSHA256",
                "manifestSHA256",
                "manifestBytes",
                "repository",
                "sourceRevision",
                "producerRevision",
                "producerSHA256",
                "workspaceCrates",
                "indexedDomains",
                "crateManifestsFound",
                "missingCrateManifests",
                "sourceFiles",
                "nativeFiles",
                "unresolvedFiles",
                "metadataOnlyFiles",
                "parseErrors",
                "symbolIdCollisions",
                "unresolvedCalls",
                "fileCoverageComplete",
                "exportDomainsVerified",
                "exportArtifactFilesVerified",
                "missingSourceHashes",
                "truncatedDomainExports",
                "missingDomainBenchmarks",
                "allExportArtifactsHashVerified",
                "did",
                "slug",
                "series",
                "series_identifier",
                "volume_number",
                "chapter_number",
                "episode_number",
                "episodeNumber",
                "broadcastDate",
                "imageUrl",
                "sourceUrl",
                "source_url",
                "source_label",
                "path",
                "mime",
                "size",
                "issue",
                "year",
                "rank",
                "colorPages",
                "gallery",
                "title",
                "title_ja",
                "titre_tome",
                "titre",
                "url_fiche",
                "libelle",
                "synopsis",
                "summary",
                "description",
                "date",
                "tags",
                "galleryUrls",
                "contentMarkdown",
                "isbn",
                "published_at",
                "publication_date",
                "premiere_edition",
                "parution",
                "editeur",
                "prix",
                "magazine",
                "lignes",
                "rubrique",
                "planches",
                "volume_id",
                "page_count",
                "listedPages",
                "hasListedPages",
                "readerExtent",
                "cover",
                "couverture",
                "previewPages",
                "sha256",
                "url",
                "totalFiles",
                "totalBytes",
                "totalFolders",
                "files",
                "folders",
                "inventoryScope",
                "assetCount",
                "numberedWebpImageCount",
                "firstImageNumber",
                "lastImageNumber",
                "numberedImageSequenceContiguousFromOne",
                "assetAvailabilityVerified",
                "fullEditionPaginationVerified",
                "rightsVerified",
                "editionMatchVerified",
                "languageVerified",
                "contentIdentityVerified",
                "readerEligible",
                "canonical_eligible",
                "notice",
            ] {
                if let Some(value) = row.get(field).filter(|value| !value.is_null()) {
                    fields.insert(field.into(), value.clone());
                }
            }
            let key = format!(
                "{}#catalogue-{kind}-{identity}",
                source.split('#').next().unwrap_or(source)
            );
            let markdown = format!(
                "# {title}\n\nSource: {source}\n\nCategory: {kind}\n\n{}\n\nProvenance: {}\n",
                serde_json::to_string_pretty(&fields).map_err(|error| error.to_string())?,
                provenance,
            );
            if let Some(existing) = documents.insert(key, markdown.clone())
                && existing != markdown
            {
                return Err("conflicting catalogue record identity".into());
            }
            Ok(())
        };
    if schema == Some("aphrody-bun-rust-crate-index/v1") {
        let repository = value
            .get("repository")
            .and_then(Value::as_str)
            .ok_or("Bun crate catalogue has no repository")?;
        if repository != "aphrody-labs/bun" {
            return Err("unsupported Bun crate catalogue repository".into());
        }
        let revision = value
            .get("revision")
            .and_then(Value::as_str)
            .ok_or("Bun crate catalogue has no revision")?;
        if revision.len() != 40 || !revision.bytes().all(|byte| byte.is_ascii_hexdigit()) {
            return Err("invalid Bun crate catalogue revision".into());
        }
        let producer = value
            .get("producer")
            .and_then(Value::as_object)
            .ok_or("Bun crate catalogue has no producer")?;
        let bun_version = producer
            .get("bunVersion")
            .and_then(Value::as_str)
            .filter(|version| !version.trim().is_empty())
            .ok_or("Bun crate catalogue has no producer version")?;
        let bun_revision = producer
            .get("bunRevision")
            .and_then(Value::as_str)
            .ok_or("Bun crate catalogue has no producer revision")?;
        let producer_sha = producer
            .get("sha256")
            .and_then(Value::as_str)
            .ok_or("Bun crate catalogue has no producer checksum")?;
        if bun_revision.len() != 40 || !bun_revision.bytes().all(|byte| byte.is_ascii_hexdigit()) {
            return Err("invalid Bun crate catalogue producer revision".into());
        }
        if producer_sha.len() != 64 || !producer_sha.bytes().all(|byte| byte.is_ascii_hexdigit()) {
            return Err("invalid Bun crate catalogue producer checksum".into());
        }
        let crates = value
            .get("crates")
            .and_then(Value::as_array)
            .ok_or("Bun crate catalogue has no crates")?;
        let coverage = value
            .get("coverage")
            .and_then(Value::as_object)
            .ok_or("Bun crate catalogue has no coverage")?;
        let workspace_crates = coverage
            .get("workspaceCrates")
            .and_then(Value::as_u64)
            .ok_or("Bun crate catalogue has no workspace crate count")?;
        if crates.len() as u64 != workspace_crates
            || coverage.get("crateManifestsFound").and_then(Value::as_u64) != Some(workspace_crates)
            || coverage
                .get("missingCrateManifests")
                .and_then(Value::as_u64)
                != Some(0)
        {
            return Err("Bun crate manifest coverage does not match catalogue rows".into());
        }
        let mut names = BTreeSet::new();
        let mut manifests = BTreeSet::new();
        let mut domains = BTreeSet::new();
        for row in crates {
            let name = row
                .get("name")
                .and_then(Value::as_str)
                .ok_or("Bun crate record has no name")?;
            if name.is_empty()
                || !name
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
            {
                return Err("invalid Bun crate name".into());
            }
            if !names.insert(name) {
                return Err("duplicate Bun crate name".into());
            }
            let manifest = row
                .get("manifest")
                .and_then(Value::as_str)
                .ok_or("Bun crate record has no manifest")?;
            if manifest.split('/').next_back() != Some("Cargo.toml")
                || manifest.split('/').any(|part| {
                    part.is_empty()
                        || part == "."
                        || part == ".."
                        || !part.bytes().all(|byte| {
                            byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.')
                        })
                })
            {
                return Err("invalid Bun crate manifest path".into());
            }
            if !manifests.insert(manifest) {
                return Err("duplicate Bun crate manifest path".into());
            }
            let domain = row
                .get("domain")
                .and_then(Value::as_str)
                .ok_or("Bun crate record has no graph domain")?;
            if domain.is_empty()
                || domain.starts_with('/')
                || domain.split('/').any(|part| part == "..")
            {
                return Err("invalid Bun crate graph domain".into());
            }
            domains.insert(domain);
            let version = row
                .get("version")
                .and_then(Value::as_str)
                .ok_or("Bun crate record has no version")?;
            let snapshot = row
                .get("snapshot")
                .and_then(Value::as_str)
                .filter(|snapshot| !snapshot.trim().is_empty())
                .ok_or("Bun crate record has no graph snapshot identity")?;
            let manifest_sha = row
                .get("manifestSHA256")
                .and_then(Value::as_str)
                .ok_or("Bun crate record has no manifest checksum")?;
            let snapshot_sha = row
                .get("snapshotSHA256")
                .and_then(Value::as_str)
                .ok_or("Bun crate record has no graph snapshot checksum")?;
            for checksum in [manifest_sha, snapshot_sha] {
                if checksum.len() != 64 || !checksum.bytes().all(|byte| byte.is_ascii_hexdigit()) {
                    return Err("invalid Bun crate record checksum".into());
                }
            }
            let manifest_bytes = row
                .get("manifestBytes")
                .and_then(Value::as_u64)
                .ok_or("Bun crate record has no manifest size")?;
            if version.is_empty() || manifest_bytes == 0 {
                return Err("invalid Bun crate version or manifest size".into());
            }
            let source = format!("{base}/tree/{revision}/{manifest}");
            let crate_record = serde_json::json!({
                "id": name,
                "title": name,
                "name": name,
                "version": version,
                "license": row.get("license"),
                "manifest": manifest,
                "domain": domain,
                "snapshot": snapshot,
                "snapshotSHA256": snapshot_sha,
                "manifestSHA256": manifest_sha,
                "manifestBytes": manifest_bytes,
                "repository": repository,
                "sourceRevision": revision,
                "url": source,
            });
            add(
                "rust-crate",
                format!("{name}-{manifest}"),
                &crate_record,
                &source,
            )?;
        }
        let expected_domains = coverage
            .get("indexedDomains")
            .and_then(Value::as_u64)
            .ok_or("Bun crate catalogue has no indexed domain count")?;
        if domains.len() as u64 != expected_domains {
            return Err("Bun crate graph domain coverage does not match catalogue".into());
        }
        let summary = serde_json::json!({
            "title": "Bun Rust workspace crate graph index",
            "url": format!("{base}/tree/{revision}"),
            "repository": repository,
            "sourceRevision": revision,
            "version": bun_version,
            "producerRevision": bun_revision,
            "producerSHA256": producer_sha,
            "workspaceCrates": workspace_crates,
            "indexedDomains": expected_domains,
            "crateManifestsFound": coverage.get("crateManifestsFound"),
            "missingCrateManifests": coverage.get("missingCrateManifests"),
            "sourceFiles": coverage.get("sourceFiles"),
            "nativeFiles": coverage.get("nativeFiles"),
            "unresolvedFiles": coverage.get("unresolvedFiles"),
            "metadataOnlyFiles": coverage.get("metadataOnlyFiles"),
            "parseErrors": coverage.get("parseErrors"),
            "symbolIdCollisions": coverage.get("symbolIdCollisions"),
            "unresolvedCalls": coverage.get("unresolvedCalls"),
            "fileCoverageComplete": coverage.get("fileCoverageComplete"),
            "exportDomainsVerified": coverage.get("exportDomainsVerified"),
            "exportArtifactFilesVerified": coverage.get("exportArtifactFilesVerified"),
            "missingSourceHashes": coverage.get("missingSourceHashes"),
            "truncatedDomainExports": coverage.get("truncatedDomainExports"),
            "missingDomainBenchmarks": coverage.get("missingDomainBenchmarks"),
            "allExportArtifactsHashVerified": coverage.get("allExportArtifactsHashVerified"),
            "description": format!(
                "Snapshot-pinned Rust workspace metadata for {workspace_crates} crates across {expected_domains} graph domains. File coverage complete: {}. This is navigation metadata, not build or test qualification.",
                coverage.get("fileCoverageComplete").and_then(Value::as_bool).unwrap_or(false)
            ),
        });
        add(
            "rust-crate-index",
            "summary".into(),
            &summary,
            &format!("{base}/tree/{revision}"),
        )?;
    } else if schema == Some("shenron-public-cdn/v1") {
        add("asset-inventory", "index".into(), &value, base)?;
        let pages = value
            .pointer("/files/pages")
            .and_then(Value::as_array)
            .ok_or("asset catalogue has no file pages")?;
        let parent = path
            .parent()
            .ok_or("catalogue has no parent directory")?
            .canonicalize()
            .map_err(|error| error.to_string())?;
        let revision = value
            .get("revision")
            .and_then(Value::as_str)
            .ok_or("asset catalogue has no revision")?;
        if revision.len() != 64 || !revision.bytes().all(|byte| byte.is_ascii_hexdigit()) {
            return Err("invalid asset catalogue revision".into());
        }
        let prefix = format!("/catalog/assets/revisions/{revision}/files/");
        let mut count = 0_u64;
        let mut seen_pages = BTreeSet::new();
        let mut seen_assets = BTreeSet::new();
        let mut manga_volume_assets: BTreeMap<(String, u64), MangaVolumeAssets> = BTreeMap::new();
        for descriptor in pages {
            let url = descriptor
                .get("url")
                .and_then(Value::as_str)
                .ok_or("file page has no URL")?;
            if !seen_pages.insert(url) {
                return Err("duplicate catalogue file page".into());
            }
            let suffix = url
                .strip_prefix(&prefix)
                .ok_or("file page is outside the catalogue revision")?;
            if !suffix.starts_with("page-")
                || !suffix.ends_with(".json")
                || suffix.contains(['/', '\\', '%'])
                || suffix.contains("..")
            {
                return Err("invalid catalogue file page path".into());
            }
            let page_path = parent
                .join("revisions")
                .join(revision)
                .join("files")
                .join(suffix)
                .canonicalize()
                .map_err(|error| format!("local catalogue page {url}: {error}"))?;
            if !page_path.starts_with(&parent) {
                return Err("catalogue page escapes its local root".into());
            }
            let bytes = std::fs::read(page_path).map_err(|error| error.to_string())?;
            if descriptor.get("sha256").and_then(Value::as_str) != Some(digest(&bytes).as_str()) {
                return Err("catalogue file page checksum mismatch".into());
            }
            let page: Value = serde_json::from_slice(&bytes).map_err(|error| error.to_string())?;
            if page.get("revision").and_then(Value::as_str) != Some(revision)
                || page.get("path") != Some(&Value::Null)
            {
                return Err("catalogue file page revision or scope mismatch".into());
            }
            let rows = page
                .get("entries")
                .and_then(Value::as_array)
                .ok_or("catalogue page has no entries")?;
            if descriptor.get("count").and_then(Value::as_u64) != Some(rows.len() as u64) {
                return Err("catalogue file page count mismatch".into());
            }
            for row in rows {
                let asset = row
                    .get("path")
                    .and_then(Value::as_str)
                    .ok_or("asset has no path")?;
                if !seen_assets.insert(asset.to_owned()) {
                    return Err("duplicate catalogue asset path".into());
                }
                if !asset.starts_with('/')
                    || asset.starts_with("//")
                    || asset.contains(['#', '?', '\\'])
                    || asset.split('/').any(|part| part == "..")
                {
                    return Err("invalid public asset path".into());
                }
                let url = format!("https://cdn.dragonballfr.com{asset}");
                add("asset", "metadata".into(), row, &url)?;
                if let Some((series, volume, image_number)) = manga_volume_asset(asset) {
                    let group = manga_volume_assets.entry((series, volume)).or_default();
                    group.asset_count += 1;
                    group.total_bytes += row.get("size").and_then(Value::as_u64).unwrap_or(0);
                    if let Some(image_number) = image_number {
                        group.numbered_webp_count += 1;
                        group.image_numbers.insert(image_number);
                    }
                }
                count += 1;
            }
        }
        if value.get("totalFiles").and_then(Value::as_u64) != Some(count) {
            return Err("catalogue total file count mismatch".into());
        }
        for ((series, volume), group) in manga_volume_assets {
            let sequence_contiguous = !group.image_numbers.is_empty()
                && group.image_numbers.len() as u64 == group.numbered_webp_count
                && group
                    .image_numbers
                    .iter()
                    .copied()
                    .eq(1..=group.numbered_webp_count);
            let first_image_number = group.image_numbers.first().copied();
            let last_image_number = group.image_numbers.last().copied();
            let row = serde_json::json!({
                "title": format!("Manga asset inventory candidate: {series} volume {volume}"),
                "series": series,
                "volume_number": volume,
                "sourceUrl": format!("https://cdn.dragonballfr.com/assets/manga/{series}/vol{volume}/"),
                "inventoryScope": "public-cdn-path-metadata-only",
                "assetCount": group.asset_count,
                "totalBytes": group.total_bytes,
                "numberedWebpImageCount": group.numbered_webp_count,
                "firstImageNumber": first_image_number,
                "lastImageNumber": last_image_number,
                "numberedImageSequenceContiguousFromOne": sequence_contiguous,
                "assetAvailabilityVerified": false,
                "fullEditionPaginationVerified": false,
                "rightsVerified": false,
                "editionMatchVerified": false,
                "languageVerified": false,
                "contentIdentityVerified": false,
                "readerEligible": false,
                "canonical_eligible": false,
                "notice": "Inventory metadata does not verify HTTP availability, image rights, exact edition, or full-reader pagination.",
            });
            add(
                "manga-volume-asset-summary",
                format!("{series}-{volume}"),
                &row,
                &format!("https://cdn.dragonballfr.com/assets/manga/{series}/vol{volume}/"),
            )?;
        }
    } else if let Some(collections) = value.get("collections").and_then(Value::as_array) {
        for collection in collections {
            let slug = collection
                .get("slug")
                .and_then(Value::as_str)
                .ok_or("collection has no slug")?;
            let source = collection
                .get("url")
                .and_then(Value::as_str)
                .ok_or("collection has no URL")?;
            for book in collection
                .get("ouvrages")
                .and_then(Value::as_array)
                .ok_or("collection has no ouvrages")?
            {
                let did = book
                    .get("did")
                    .and_then(Value::as_str)
                    .ok_or("publication has no did")?;
                let mut book = book.clone();
                book.as_object_mut()
                    .ok_or("publication must be an object")?
                    .insert("series".into(), Value::String(slug.into()));
                add("publication", format!("{slug}-{did}"), &book, source)?;
            }
        }
    } else {
        if schema == Some("shenron-manga-cdn/v1")
            && (!value.get("volumes").is_some_and(Value::is_array)
                || !value.get("chapters").is_some_and(Value::is_array))
        {
            return Err("manga catalogue requires volumes and chapters arrays".into());
        }
        let mut recognized = false;
        for field in ["volumes", "chapters", "episodes", "movies"] {
            if let Some(rows) = value.get(field) {
                recognized = true;
                for row in rows.as_array().ok_or("catalogue records must be arrays")? {
                    let identity = row
                        .get("id")
                        .or_else(|| row.get("slug"))
                        .map(Value::to_string)
                        .ok_or("catalogue record has no id or slug")?;
                    add(field, identity, row, base)?;
                }
            }
        }
        if let Some(rows) = value.as_array() {
            recognized = true;
            for row in rows {
                if let Some(url) = row.get("url").and_then(Value::as_str) {
                    let identity = row
                        .get("id")
                        .map(Value::to_string)
                        .unwrap_or_else(|| url.into());
                    add("article", identity, row, url)?;
                    continue;
                }
                if let Some(issue) = row.get("issue").and_then(Value::as_str) {
                    let year = row.get("year").unwrap_or(&Value::Null);
                    let title = row.get("title").and_then(Value::as_str).unwrap_or_default();
                    add(
                        "jump-statistic",
                        format!("{year}-{issue}-{title}"),
                        row,
                        "https://www.jajanken.net/",
                    )?;
                    continue;
                }
                let series = row
                    .get("series")
                    .and_then(Value::as_str)
                    .ok_or("episode has no series")?;
                let number = row
                    .get("episodeNumber")
                    .or_else(|| row.get("episode_number"))
                    .ok_or("episode has no episode_number")?;
                add(
                    "episode",
                    format!("{series}-{number}"),
                    row,
                    "https://lineup.toei-anim.co.jp/",
                )?;
            }
        }
        if let Some(assets) = value.get("assets").and_then(Value::as_array) {
            recognized = true;
            for asset in assets {
                let url = asset.as_str().ok_or("asset reference must be a URL")?;
                add(
                    "asset-reference",
                    "reference".into(),
                    &serde_json::json!({"url":url}),
                    url,
                )?;
            }
        }
        if !recognized {
            return Err("unrecognized catalogue: expected collections, volumes, chapters, episodes or movies".into());
        }
    }
    Ok(documents)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture(value: Value) -> Result<BTreeMap<String, String>, String> {
        let directory = std::env::temp_dir().join(format!(
            "dragon-ball-catalogue-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir(&directory).unwrap();
        let path = directory.join("catalogue.json");
        std::fs::write(&path, value.to_string()).unwrap();
        let result = read_catalogue(
            &path,
            |url| {
                if url.starts_with("https://") && !url.contains('@') {
                    Ok(())
                } else {
                    Err("unsafe URL".into())
                }
            },
            |bytes| bytes.len().to_string(),
        );
        std::fs::remove_dir_all(directory).unwrap();
        result
    }
    #[test]
    fn manga_chapters_and_volumes_keep_distinct_identities_and_provenance() {
        let records = fixture(serde_json::json!({"schema":"shenron-manga-cdn/v1","revision":"fixture-revision","volumes":[{"id":1,"title":"Son Goku","isbn":"978-fixture","privateNote":"SECRET"}],"chapters":[{"id":1,"title":"Bulma","page_count":14,"sha256":"fixture-hash"}]})).unwrap();
        assert_eq!(records.len(), 2);
        let text = records.values().cloned().collect::<String>();
        for term in [
            "Son Goku",
            "Bulma",
            "978-fixture",
            "fixture-hash",
            "fixture-revision",
            "canonical_eligible",
        ] {
            assert!(text.contains(term), "{term}");
        }
        assert!(!text.contains("SECRET"));
    }
    #[test]
    fn bibliography_and_episode_exports_remain_searchable_without_body_markdown() {
        let records = fixture(serde_json::json!({"collections":[{"slug":"original","url":"https://comic.dragonballcn.com/books","ouvrages":[{"did":"1","libelle":"Dragon Ball 1","isbn":"123","planches":192}]}]})).unwrap();
        assert!(records.values().next().unwrap().contains("192"));
        assert_eq!(fixture(serde_json::json!([{"series":"dragonz","episodeNumber":1,"title":"Gohan","synopsis":"Saiyan arrival"}])).unwrap().len(), 1);
    }
    fn bun_crate_catalogue() -> Value {
        let crate_record = |name: &str, manifest: &str| {
            serde_json::json!({
                "name": name,
                "version": "1.4.4",
                "license": "Apache-2.0",
                "manifest": manifest,
                "domain": "src/runtime",
                "snapshot": "source:bun/src/runtime:graph:fixture",
                "snapshotSHA256": "b".repeat(64),
                "manifestSHA256": "c".repeat(64),
                "manifestBytes": 42
            })
        };
        serde_json::json!({
            "schema": "aphrody-bun-rust-crate-index/v1",
            "repository": "aphrody-labs/bun",
            "revision": "a".repeat(40),
            "producer": {
                "bunVersion": "1.4.4",
                "bunRevision": "d".repeat(40),
                "sha256": "e".repeat(64)
            },
            "coverage": {
                "workspaceCrates": 2,
                "indexedDomains": 1,
                "crateManifestsFound": 2,
                "missingCrateManifests": 0,
                "sourceFiles": 100,
                "nativeFiles": 80,
                "unresolvedFiles": 20,
                "metadataOnlyFiles": 10,
                "parseErrors": 1,
                "symbolIdCollisions": 0,
                "unresolvedCalls": 5,
                "fileCoverageComplete": false,
                "exportDomainsVerified": 1,
                "exportArtifactFilesVerified": 4,
                "missingSourceHashes": 10,
                "truncatedDomainExports": 1,
                "missingDomainBenchmarks": 1,
                "allExportArtifactsHashVerified": true
            },
            "crates": [
                crate_record("bun_runtime", "src/runtime/Cargo.toml"),
                crate_record("bun_http", "src/http/Cargo.toml")
            ]
        })
    }
    #[test]
    fn bun_rust_crate_catalogue_indexes_each_crate_and_preserves_incomplete_coverage() {
        let records = fixture(bun_crate_catalogue()).unwrap();
        assert_eq!(records.len(), 3);
        let text = records.values().cloned().collect::<String>();
        for term in [
            "Category: rust-crate",
            "Category: rust-crate-index",
            "bun_runtime",
            "bun_http",
            "src/runtime/Cargo.toml",
            "manifestSHA256",
            "sourceRevision",
            "fileCoverageComplete",
            "metadataOnlyFiles",
            "canonical_eligible",
        ] {
            assert!(text.contains(term), "{term}");
        }
        assert!(text.contains("\"fileCoverageComplete\": false"));
        assert!(text.contains("This is navigation metadata, not build or test qualification."));
        assert!(text.contains("producerSHA256"));
    }
    #[test]
    fn bun_rust_crate_catalogue_rejects_duplicate_or_incomplete_manifests() {
        let mut duplicate: Value = bun_crate_catalogue();
        duplicate["crates"][1]["name"] = Value::String("bun_runtime".into());
        assert!(
            fixture(duplicate)
                .unwrap_err()
                .contains("duplicate Bun crate name")
        );

        let mut incomplete = bun_crate_catalogue();
        incomplete["coverage"]["missingCrateManifests"] = Value::from(1);
        assert!(
            fixture(incomplete)
                .unwrap_err()
                .contains("manifest coverage does not match")
        );

        let mut unsafe_path = bun_crate_catalogue();
        unsafe_path["crates"][0]["manifest"] = Value::String("../private/Cargo.toml".into());
        assert!(
            fixture(unsafe_path)
                .unwrap_err()
                .contains("invalid Bun crate manifest path")
        );

        let mut missing_snapshot = bun_crate_catalogue();
        missing_snapshot["crates"][0]
            .as_object_mut()
            .unwrap()
            .remove("snapshot");
        assert!(
            fixture(missing_snapshot)
                .unwrap_err()
                .contains("no graph snapshot identity")
        );

        let mut invalid_producer_hash = bun_crate_catalogue();
        invalid_producer_hash["producer"]["sha256"] = Value::String("bad".into());
        assert!(
            fixture(invalid_producer_hash)
                .unwrap_err()
                .contains("invalid Bun crate catalogue producer checksum")
        );
    }
    #[test]
    fn manga_coverage_keeps_reader_extent_page_counts_and_incomplete_pagination_evidence() {
        let records = fixture(serde_json::json!({
            "scope": "visible-catalogue-and-declared-page-references",
            "assetAvailabilityVerified": false,
            "fullEditionPaginationVerified": false,
            "complete": false,
            "totals": {"volumes": 329, "volumesWithListedPages": 222, "listedPages": 53304},
            "previewVolumeIds": [147, 620, 619],
            "missingOrPartialReaderVolumeIds": [147, 620, 619, 740],
            "volumes": [{
                "id": 147,
                "series": "DBS",
                "number": 24,
                "chapters": 1,
                "listedPages": 32,
                "hasListedPages": true,
                "readerExtent": "preview",
                "url": "https://dragonballfr.com/api/manga/volume/147"
            }]
        }))
        .unwrap();
        let text = records.values().cloned().collect::<String>();
        for term in [
            "fullEditionPaginationVerified",
            "\"complete\":false",
            "\"listedPages\": 32",
            "\"hasListedPages\": true",
            "\"readerExtent\": \"preview\"",
            "\"volumesWithListedPages\":222",
            "\"missingOrPartialReaderVolumeIds\":[147,620,619,740]",
        ] {
            assert!(text.contains(term), "{term}");
        }
    }
    #[test]
    fn invalid_schemas_urls_and_conflicting_ids_fail() {
        assert!(fixture(serde_json::json!({"schema":"unknown/v2"})).is_err());
        assert!(
            fixture(serde_json::json!({"episodes":[{"id":1,"url":"file:///private"}]})).is_err()
        );
        assert!(
            fixture(serde_json::json!({"episodes":[{"id":1,"title":"A"},{"id":1,"title":"B"}]}))
                .is_err()
        );
    }
    #[test]
    fn local_cdn_pages_require_matching_revision_counts_and_checksum() {
        let revision = "a".repeat(64);
        let directory =
            std::env::temp_dir().join(format!("dragon-ball-cdn-{}", std::process::id()));
        std::fs::create_dir_all(directory.join("revisions").join(&revision).join("files")).unwrap();
        let page = serde_json::json!({"revision":revision,"path":null,"entries":[{"path":"/assets/goku.webp","mime":"image/webp","size":12,"sha256":"image-hash"}]}).to_string();
        let page_path = directory
            .join("revisions")
            .join(&revision)
            .join("files/page-000000.json");
        std::fs::write(&page_path, &page).unwrap();
        let index = directory.join("index.json");
        std::fs::write(&index, serde_json::json!({"schema":"shenron-public-cdn/v1","revision":revision,"totalFiles":1,"files":{"pages":[{"url":format!("/catalog/assets/revisions/{revision}/files/page-000000.json"),"count":1,"sha256":page.len().to_string()}]}}).to_string()).unwrap();
        let digest = |bytes: &[u8]| bytes.len().to_string();
        let documents = read_catalogue(&index, |_| Ok(()), digest).unwrap();
        assert_eq!(documents.len(), 2);
        assert!(
            documents
                .values()
                .any(|text| text.contains("goku.webp") && text.contains("image-hash"))
        );
        let original_index = std::fs::read_to_string(&index).unwrap();
        let mut duplicate: Value = serde_json::from_str(&original_index).unwrap();
        let descriptor = duplicate["files"]["pages"][0].clone();
        duplicate["files"]["pages"]
            .as_array_mut()
            .unwrap()
            .push(descriptor);
        duplicate["totalFiles"] = Value::from(2);
        std::fs::write(&index, duplicate.to_string()).unwrap();
        assert!(
            read_catalogue(&index, |_| Ok(()), digest)
                .unwrap_err()
                .contains("duplicate catalogue file page")
        );
        let mut duplicate_page: Value = serde_json::from_str(&page).unwrap();
        let asset = duplicate_page["entries"][0].clone();
        duplicate_page["entries"]
            .as_array_mut()
            .unwrap()
            .push(asset);
        let duplicate_page = duplicate_page.to_string();
        let mut duplicate: Value = serde_json::from_str(&original_index).unwrap();
        duplicate["files"]["pages"][0]["count"] = Value::from(2);
        duplicate["files"]["pages"][0]["sha256"] = Value::String(digest(duplicate_page.as_bytes()));
        duplicate["totalFiles"] = Value::from(2);
        std::fs::write(&index, duplicate.to_string()).unwrap();
        std::fs::write(&page_path, duplicate_page).unwrap();
        assert!(
            read_catalogue(&index, |_| Ok(()), digest)
                .unwrap_err()
                .contains("duplicate catalogue asset path")
        );
        std::fs::write(&index, original_index).unwrap();
        std::fs::write(&page_path, format!("{page} ")).unwrap();
        assert!(
            read_catalogue(&index, |_| Ok(()), digest)
                .unwrap_err()
                .contains("checksum")
        );
        std::fs::remove_file(&page_path).unwrap();
        assert!(
            read_catalogue(&index, |_| Ok(()), digest)
                .unwrap_err()
                .contains("local catalogue page")
        );
        std::fs::remove_dir_all(directory).unwrap();
    }
    #[test]
    fn public_cdn_groups_numbered_manga_paths_without_qualifying_reader_completeness() {
        let revision = "b".repeat(64);
        let directory =
            std::env::temp_dir().join(format!("dragon-ball-cdn-groups-{}", std::process::id()));
        std::fs::create_dir_all(directory.join("revisions").join(&revision).join("files")).unwrap();
        let entries = serde_json::json!([
            {"path":"/assets/manga/ARALE/vol1/001.webp","mime":"image/webp","size":11},
            {"path":"/assets/manga/ARALE/vol1/002.webp","mime":"image/webp","size":12},
            {"path":"/assets/manga/ARALE/vol1/004.webp","mime":"image/webp","size":13},
            {"path":"/assets/manga/ARALE/vol1/cover.webp","mime":"image/webp","size":14},
            {"path":"/assets/manga/ARALE/vol2/001.webp","mime":"image/webp","size":8},
            {"path":"/assets/manga/ARALE/vol2/002.webp","mime":"image/webp","size":9}
        ]);
        let page =
            serde_json::json!({"revision":revision,"path":null,"entries":entries}).to_string();
        let page_path = directory
            .join("revisions")
            .join(&revision)
            .join("files/page-000000.json");
        std::fs::write(&page_path, &page).unwrap();
        let index = directory.join("index.json");
        std::fs::write(
            &index,
            serde_json::json!({
                "schema":"shenron-public-cdn/v1",
                "revision":revision,
                "totalFiles":6,
                "files":{"pages":[{
                    "url":format!("/catalog/assets/revisions/{revision}/files/page-000000.json"),
                    "count":6,
                    "sha256":page.len().to_string()
                }]}
            })
            .to_string(),
        )
        .unwrap();

        let documents =
            read_catalogue(&index, |_| Ok(()), |bytes| bytes.len().to_string()).unwrap();
        assert_eq!(documents.len(), 9);
        let summaries = documents
            .values()
            .filter(|text| text.contains("Category: manga-volume-asset-summary"))
            .collect::<Vec<_>>();
        assert_eq!(summaries.len(), 2);
        let volume_one = summaries
            .iter()
            .find(|text| text.contains("ARALE volume 1"))
            .unwrap();
        for term in [
            "\"assetCount\": 4",
            "\"totalBytes\": 50",
            "\"numberedWebpImageCount\": 3",
            "\"numberedImageSequenceContiguousFromOne\": false",
            "\"fullEditionPaginationVerified\": false",
            "\"rightsVerified\": false",
            "\"editionMatchVerified\": false",
            "\"languageVerified\": false",
            "\"readerEligible\": false",
        ] {
            assert!(volume_one.contains(term), "{term}");
        }
        let volume_two = summaries
            .iter()
            .find(|text| text.contains("ARALE volume 2"))
            .unwrap();
        assert!(volume_two.contains("\"numberedImageSequenceContiguousFromOne\": true"));
        std::fs::remove_dir_all(directory).unwrap();
    }
}
