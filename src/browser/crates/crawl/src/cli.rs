// SPDX-License-Identifier: Apache-2.0
//! Native CLI over the canonical archive index and persistent crawl scheduler.
use std::path::{Path, PathBuf};

use serde_json::{Value, json};
use url::Url;

use crate::archive::{ArchiveMediaType, CdxMatch, index_media, index_wayback};
use crate::{
    AddRequest, BunBrowserTransport, CrawlOptions, Frontier, FrontierOptions, crawl_bounded,
};

pub const HELP: &str = "bun crawl archive-cdx --store FILE --seed URL [--scope exact|prefix|host|domain] [--page-size 1000] [--max-pages 1]\nbun crawl archive-media --store FILE --query QUERY --mediatype image|movies [--page-size 100] [--max-pages 1]\nbun crawl sitemaps|run --store FILE --seed URL [--seed URL] [--max-sitemaps 25] [--max-requests 25] [--concurrency 4]\nbun crawl dragon-ball --store DIRECTORY --config ABSOLUTE_FILE --operation plan|status|crawl [--source ID] [--max-requests 25]\nOptional: --endpoint URL (archive routes), --allow-private (explicit local fixtures), --timeout-ms 30000\nArchive/page stores are explicit SQLite paths; Dragon Ball uses a private campaign directory. Archive routes acquire metadata only. Native HTTP concurrency is 1..128.\n";

#[derive(Debug)]
pub struct Options {
    pub action: String,
    pub store: PathBuf,
    pub seeds: Vec<Url>,
    pub query: Option<String>,
    pub endpoint: Option<String>,
    pub media_type: Option<ArchiveMediaType>,
    pub scope: CdxMatch,
    pub page_size: usize,
    pub max_pages: usize,
    pub max_requests: usize,
    pub max_sitemaps: usize,
    pub concurrency: usize,
    pub timeout_ms: u64,
    pub allow_private: bool,
    pub operation: Option<String>,
    pub config: Option<PathBuf>,
    pub sources: Vec<String>,
}

pub fn parse_json(value: &Value) -> Result<Options, String> {
    let object = value.as_object().ok_or("Crawl options must be an object")?;
    let action = object
        .get("action")
        .and_then(Value::as_str)
        .ok_or("Crawl action is required")?;
    let store = object
        .get("store")
        .and_then(Value::as_str)
        .ok_or("Crawl store is required")?;
    if !Path::new(store).is_absolute() {
        return Err("Crawl store must be absolute".into());
    }
    let mut args = vec![action.to_owned(), "--store".into(), store.to_owned()];
    for (key, value) in object {
        let flag = match key.as_str() {
            "action" | "store" | "signal" => continue,
            "seed" => "--seed",
            "query" => "--query",
            "endpoint" => "--endpoint",
            "mediaType" => "--mediatype",
            "scope" => "--scope",
            "pageSize" => "--page-size",
            "maxPages" => "--max-pages",
            "maxRequests" => "--max-requests",
            "maxSitemaps" => "--max-sitemaps",
            "concurrency" => "--concurrency",
            "timeout" => "--timeout-ms",
            "operation" => "--operation",
            "config" => "--config",
            "sources" => {
                let sources = value.as_array().ok_or("sources must be an array")?;
                if sources.len() > 64 { return Err("Too many Dragon Ball sources".into()); }
                for source in sources {
                    args.extend(["--source".into(), source.as_str().ok_or("source must be a string")?.to_owned()]);
                }
                continue;
            }
            "allowPrivate" => {
                if value.as_bool().ok_or("allowPrivate must be a boolean")? {
                    args.push("--allow-private".into());
                }
                continue;
            }
            "seeds" => {
                let seeds = value.as_array().ok_or("seeds must be an array")?;
                if seeds.len() > 32 {
                    return Err("Too many crawl seeds".into());
                }
                for seed in seeds {
                    args.extend([
                        "--seed".into(),
                        seed.as_str().ok_or("seed must be a string")?.to_owned(),
                    ]);
                }
                continue;
            }
            _ => return Err("Unsupported Crawl option".into()),
        };
        let parameter = if matches!(
            key.as_str(),
            "pageSize" | "maxPages" | "maxRequests" | "maxSitemaps" | "concurrency" | "timeout"
        ) {
            value
                .as_u64()
                .ok_or("Crawl bounds must be unsigned integers")?
                .to_string()
        } else {
            value
                .as_str()
                .ok_or("Crawl option must be a string")?
                .to_owned()
        };
        args.extend([flag.to_owned(), parameter]);
    }
    parse(
        &args,
        Path::new(store).parent().ok_or("Invalid store path")?,
    )
}

pub fn checkpoint_scope(options: &Options) -> Option<String> {
    if options.action == "dragon-ball" && options.operation.as_deref() == Some("crawl") {
        return Some("dragon-ball-campaign".into());
    }
    if !options.action.starts_with("archive-") {
        return None;
    }
    let default = if options.action == "archive-cdx" {
        "https://web.archive.org/cdx/search/cdx"
    } else {
        "https://archive.org/services/search/v1/scrape"
    };
    let mut endpoint = Url::parse(options.endpoint.as_deref().unwrap_or(default)).ok()?;
    endpoint.set_query(None);
    let scope = if options.action == "archive-cdx" {
        format!("{:?}", options.scope)
    } else {
        String::new()
    };
    Some(
        json!([
            options.action,
            endpoint.as_str(),
            scope,
            format!("{:?}", options.media_type),
            options.seeds.first().map(Url::as_str).unwrap_or(""),
            options.query.as_deref().unwrap_or(""),
            options.page_size
        ])
        .to_string(),
    )
}

pub fn parse(args: &[String], cwd: &Path) -> Result<Options, String> {
    let action = args
        .first()
        .ok_or("A native crawl action is required")?
        .clone();
    if !["archive-cdx", "archive-media", "sitemaps", "run", "dragon-ball"].contains(&action.as_str()) {
        return Err("Unknown native crawl action".into());
    }
    let mut value = Options {
        page_size: if action == "archive-media" { 100 } else { 1000 },
        action,
        store: PathBuf::new(),
        seeds: Vec::new(),
        query: None,
        endpoint: None,
        media_type: None,
        scope: CdxMatch::Exact,
        max_pages: 1,
        max_requests: 25,
        max_sitemaps: 25,
        concurrency: 4,
        timeout_ms: 30000,
        allow_private: false,
        operation: None,
        config: None,
        sources: Vec::new(),
    };
    let mut index = 1;
    while index < args.len() {
        let flag = &args[index];
        index += 1;
        let supported = match flag.as_str() {
            "--store" | "--allow-private" | "--timeout-ms" => true,
            "--seed" => value.action != "archive-media",
            "--scope" => value.action == "archive-cdx",
            "--query" | "--mediatype" => value.action == "archive-media",
            "--endpoint" | "--page-size" | "--max-pages" => value.action.starts_with("archive-"),
            "--max-sitemaps" | "--concurrency" => {
                matches!(value.action.as_str(), "run" | "sitemaps")
            }
            "--max-requests" => matches!(value.action.as_str(), "run" | "dragon-ball"),
            "--operation" | "--config" | "--source" => value.action == "dragon-ball",
            _ => false,
        };
        if !supported {
            return Err("Unsupported option for native crawl action".into());
        }
        if flag == "--allow-private" {
            value.allow_private = true;
            continue;
        }
        let parameter = args
            .get(index)
            .ok_or("Native crawl option requires a value")?;
        index += 1;
        match flag.as_str() {
            "--store" => {
                let path = PathBuf::from(parameter);
                value.store = if path.is_absolute() {
                    path
                } else {
                    cwd.join(path)
                };
            }
            "--operation" => value.operation = Some(parameter.clone()),
            "--config" => value.config = Some(PathBuf::from(parameter)),
            "--source" => {
                if value.sources.len() >= 64 { return Err("Too many Dragon Ball sources".into()); }
                value.sources.push(parameter.clone());
            }
            "--seed" => {
                if value.seeds.len() >= 32 {
                    return Err("Native crawl accepts at most 32 explicit seeds".into());
                }
                value.seeds.push(http_url(parameter)?);
            }
            "--query" => {
                if parameter.is_empty() || parameter.len() > 4096 {
                    return Err("Invalid archive query bounds".into());
                }
                value.query = Some(parameter.clone());
            }
            "--endpoint" => value.endpoint = Some(http_url(parameter)?.to_string()),
            "--mediatype" => {
                value.media_type = Some(match parameter.as_str() {
                    "image" => ArchiveMediaType::Image,
                    "movies" => ArchiveMediaType::Movies,
                    _ => return Err("Archive mediatype must be image or movies".into()),
                })
            }
            "--scope" => {
                value.scope = match parameter.as_str() {
                    "exact" => CdxMatch::Exact,
                    "prefix" => CdxMatch::Prefix,
                    "host" => CdxMatch::Host,
                    "domain" => CdxMatch::Domain,
                    _ => return Err("Invalid CDX match scope".into()),
                }
            }
            "--page-size" => value.page_size = integer(parameter, 1, 10_000)?,
            "--max-pages" => value.max_pages = integer(parameter, 1, 1000)?,
            "--max-requests" => value.max_requests = integer(parameter, 0, if value.action == "dragon-ball" { 100_000 } else { 1000 })?,
            "--max-sitemaps" => value.max_sitemaps = integer(parameter, 0, 100)?,
            "--concurrency" => value.concurrency = integer(parameter, 1, 128)?,
            "--timeout-ms" => value.timeout_ms = integer(parameter, 1, if value.action == "dragon-ball" { 1_800_000 } else { 120_000 })? as u64,
            _ => return Err("Unknown native crawl option".into()),
        }
    }
    validate(&value)?;
    Ok(value)
}

pub fn validate(value: &Options) -> Result<(), String> {
    if value.store.as_os_str().is_empty() || !value.store.is_absolute() {
        return Err("Native crawl requires --store FILE".into());
    }
    if value.action == "dragon-ball" {
        if !matches!(value.operation.as_deref(), Some("plan" | "status" | "crawl"))
            || !value.config.as_ref().is_some_and(|path| path.is_absolute())
            || value.sources.len() > 64 || value.max_requests > 100_000
            || !(1..=1_800_000).contains(&value.timeout_ms)
            || value.sources.iter().any(|source| source.is_empty() || !source.bytes().all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_')))
            || !value.seeds.is_empty() || value.query.is_some() || value.endpoint.is_some() || value.media_type.is_some() {
            return Err("Dragon Ball requires operation plan|status|crawl, absolute config, and bounded sources".into());
        }
        return Ok(());
    }
    if !["archive-cdx", "archive-media", "sitemaps", "run"].contains(&value.action.as_str())
        || value.seeds.len() > 32
        || !(1..=10_000).contains(&value.page_size)
        || !(1..=1000).contains(&value.max_pages)
        || value.max_requests > 1000
        || value.max_sitemaps > 100
        || !(1..=128).contains(&value.concurrency)
        || !(1..=120_000).contains(&value.timeout_ms)
    {
        return Err("Invalid native crawl option bounds".into());
    }
    for seed in &value.seeds {
        http_url(seed.as_str())?;
    }
    if let Some(endpoint) = &value.endpoint {
        http_url(endpoint)?;
    }
    if value
        .query
        .as_ref()
        .is_some_and(|query| query.is_empty() || query.len() > 4096)
    {
        return Err("Invalid archive query bounds".into());
    }
    match value.action.as_str() {
        "archive-media"
            if value.query.is_none()
                || value.media_type.is_none()
                || value.page_size < 100
                || !value.seeds.is_empty() =>
        {
            return Err(
                "Archive media requires --query and --mediatype, page-size >=100, without seeds"
                    .into(),
            );
        }
        "archive-cdx"
            if value.seeds.len() != 1 || value.query.is_some() || value.media_type.is_some() =>
        {
            return Err("CDX requires exactly one explicit seed".into());
        }
        "run" | "sitemaps"
            if value.seeds.is_empty()
                || value.query.is_some()
                || value.endpoint.is_some()
                || value.media_type.is_some() =>
        {
            return Err(
                "Native page crawling requires explicit seeds and no archive options".into(),
            );
        }
        _ => {}
    }
    Ok(())
}

fn integer(raw: &str, minimum: usize, maximum: usize) -> Result<usize, String> {
    raw.parse::<usize>()
        .ok()
        .filter(|value| (minimum..=maximum).contains(value))
        .ok_or_else(|| format!("Native crawl integer must be {minimum}..{maximum}"))
}

fn http_url(raw: &str) -> Result<Url, String> {
    if raw.is_empty() || raw.len() > 4096 {
        return Err("Invalid crawl URL bounds".into());
    }
    let url = Url::parse(raw).map_err(|_| "Invalid crawl URL")?;
    if !matches!(url.scheme(), "http" | "https")
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err("Crawl URLs require HTTP(S) without credentials".into());
    }
    Ok(url)
}

pub async fn execute(options: &Options) -> Result<Value, String> {
    validate(options)?;
    if options.action == "dragon-ball" {
        return execute_dragon_ball(options).await;
    }
    let client = bun_browser_net::BunBrowserHttpClient::with_full_options(
        std::sync::Arc::new(bun_browser_net::CookieJar::new()),
        None,
        options.allow_private,
    );
    let transport = BunBrowserTransport::new(client);
    let operation = async {
        if options.action.starts_with("archive-") {
            let mut db =
                rusqlite::Connection::open(&options.store).map_err(|error| error.to_string())?;
            let report = if options.action == "archive-cdx" {
                index_wayback(
                    &transport,
                    &mut db,
                    options
                        .endpoint
                        .as_deref()
                        .unwrap_or("https://web.archive.org/cdx/search/cdx"),
                    options.seeds[0].as_str(),
                    options.scope,
                    options.page_size,
                    options.max_pages,
                )
                .await?
            } else {
                index_media(
                    &transport,
                    &mut db,
                    options
                        .endpoint
                        .as_deref()
                        .unwrap_or("https://archive.org/services/search/v1/scrape"),
                    options.query.as_deref().unwrap(),
                    options.media_type.unwrap(),
                    options.page_size,
                    options.max_pages,
                )
                .await?
            };
            return Ok(
                json!({"owner":"bun_browser_crawl","action":options.action,"pages":report.pages,"inserted":report.inserted,"complete":report.complete}),
            );
        }
        let now = chrono::Utc::now().timestamp_millis();
        let mut frontier = Frontier::open(
            &options.store,
            FrontierOptions {
                per_host_delay_ms: 1000,
                ..FrontierOptions::default()
            },
            now,
        )
        .map_err(|error| error.to_string())?;
        for seed in &options.seeds {
            frontier
                .enqueue(AddRequest::seed(seed.as_str()), now)
                .map_err(|error| error.to_string())?;
        }
        let crawl = CrawlOptions {
            max_requests: if options.action == "sitemaps" {
                0
            } else {
                options.max_requests
            },
            max_concurrency: options.concurrency,
            allowed_domains: options
                .seeds
                .iter()
                .filter_map(|seed| seed.host_str().map(str::to_owned))
                .collect(),
            obey_robots: false,
            ingest_sitemaps: true,
            max_sitemaps: options.max_sitemaps,
            ..CrawlOptions::default()
        };
        let report = crawl_bounded(&mut frontier, &transport, &crawl)
            .await
            .map_err(|error| error.to_string())?;
        Ok(
            json!({"owner":"bun_browser_crawl","action":options.action,"attempts":report.attempts,"pages":report.pages_processed,"pageDetailsDropped":report.page_details_dropped,"errorCount":report.error_count,"errorsDropped":report.errors_dropped,
            "sitemapsFetched":report.sitemaps_fetched,"sitemapEntriesProcessed":report.sitemap_entries_processed,"sitemapsPending":report.sitemaps_pending,
            "sitemapHostsPending":report.sitemap_hosts_pending,"sitemapBudgetExhausted":report.sitemap_budget_exhausted,"errors":report.errors,"frontier":{"pending":report.frontier.pending,"done":report.frontier.done}}),
        )
    };
    tokio::time::timeout(
        std::time::Duration::from_millis(options.timeout_ms),
        operation,
    )
    .await
    .map_err(|_| {
        "Native crawl deadline exceeded; committed checkpoints remain resumable".to_owned()
    })?
}

async fn execute_dragon_ball(options: &Options) -> Result<Value, String> {
    use crate::dragon_ball::{DragonBallPlan, DragonBallRunOptions, TargetSnapshot, target_policy_sha256, run_dragon_ball};
    let config = options.config.as_ref().ok_or("Dragon Ball config required")?;
    let metadata = std::fs::symlink_metadata(config).map_err(|error| error.to_string())?;
    if !metadata.is_file() || metadata.len() > 2 * 1024 * 1024 {
        return Err("Dragon Ball config must be a bounded regular file".into());
    }
    let plan: DragonBallPlan = serde_json::from_slice(&std::fs::read(config).map_err(|error| error.to_string())?)
        .map_err(|error| error.to_string())?;
    let selected = plan.selected_targets(&options.sources)?;
    if selected.len() > 64 { return Err("Too many selected Dragon Ball sources".into()); }
    let operation = options.operation.as_deref().ok_or("Dragon Ball operation required")?;
    if operation == "plan" {
        return Ok(json!({"owner":"bun_browser_crawl","action":"dragon-ball","operation":"plan",
            "output":options.store,"pages":0,"documents":0,"targets":selected,"maxRequests":options.max_requests}));
    }
    if operation == "status" {
        let mut targets = Vec::new();
        let mut errors = Vec::new();
        let mut pending = 0u64;
        let mut locked = 0u64;
        let mut failed = 0u64;
        let mut documents = 0usize;
        let mut complete = !selected.is_empty();
        for target in selected {
            let snapshot_path = options.store.join("target-status").join(format!("{}.json", target.id));
            let snapshot: Option<TargetSnapshot> = if snapshot_path.exists() {
                let metadata = std::fs::symlink_metadata(&snapshot_path).map_err(|error| error.to_string())?;
                if !metadata.is_file() || metadata.len() > 4 * 1024 * 1024 { return Err("Invalid Dragon Ball target status".into()); }
                let snapshot: TargetSnapshot = serde_json::from_slice(&std::fs::read(snapshot_path).map_err(|error| error.to_string())?).map_err(|error| error.to_string())?;
                if snapshot.schema == "bun-dragon-ball-target-status/v1" && snapshot.report.id == target.id && snapshot.policy_sha256 == target_policy_sha256(&plan, target, None, false)? { Some(snapshot) } else { None }
            } else { None };
            let prior = snapshot.as_ref().map(|snapshot| &snapshot.report);
            if let Some(prior) = prior { errors.extend(prior.errors.iter().cloned()); }
            let path = options.store.join("frontier").join(format!("{}.sqlite", target.id));
            let (p, l, f, done, present) = if path.exists() {
                let metadata = std::fs::symlink_metadata(&path).map_err(|error| error.to_string())?;
                if !metadata.is_file() { return Err("Invalid Dragon Ball frontier".into()); }
                let db = rusqlite::Connection::open_with_flags(path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
                    .map_err(|error| error.to_string())?;
                db.query_row("SELECT COALESCE(SUM(state='pending'),0),COALESCE(SUM(state='locked'),0),COALESCE(SUM(state='failed'),0),COALESCE(SUM(state='done'),0) FROM requests", [], |row| Ok((row.get::<_, i64>(0)? as u64,row.get::<_, i64>(1)? as u64,row.get::<_, i64>(2)? as u64,row.get::<_, i64>(3)? as u64,true)))
                    .map_err(|error| error.to_string())?
            } else { (0,0,0,0,false) };
            let completed = prior.is_some_and(|prior| prior.completed && prior.errors.is_empty())
                && (target.mode == "mediawiki" || (present && done > 0))
                && p == 0 && l == 0 && f == 0;
            pending += p; locked += l; failed += f;
            let count = prior.map_or(0, |prior| prior.documents);
            documents += count; complete &= completed;
            targets.push(json!({"id":target.id,"pending":p,"locked":l,"failed":f,"done":done,"documents":count,"completed":completed,"frontierPresent":present}));
        }
        return Ok(json!({"owner":"bun_browser_crawl","action":"dragon-ball","operation":"status","output":options.store,
            "pages":documents,"documents":documents,"targets":targets,"pending":pending,"locked":locked,"failed":failed,"complete":complete,
            "errors":errors}));
    }
    let client = bun_browser_net::BunBrowserHttpClient::with_full_options(std::sync::Arc::new(bun_browser_net::CookieJar::new()), None, options.allow_private);
    let transport = BunBrowserTransport::new(client);
    let run = DragonBallRunOptions { output:options.store.clone(),sources:options.sources.clone(),max_requests:Some(options.max_requests),max_depth:None,with_gallery:false,force:false };
    let report = tokio::time::timeout(std::time::Duration::from_millis(options.timeout_ms), run_dragon_ball(&plan, &run, &transport))
        .await.map_err(|_| "Dragon Ball deadline exceeded; committed checkpoints remain resumable".to_owned())??;
    let pending: u64 = report.targets.iter().map(|target| target.pending).sum();
    let mut value = serde_json::to_value(&report).map_err(|error| error.to_string())?;
    let object = value.as_object_mut().ok_or("Invalid Dragon Ball report")?;
    object.insert("owner".into(), json!("bun_browser_crawl")); object.insert("action".into(),json!("dragon-ball"));
    object.insert("operation".into(),json!("crawl")); object.insert("pages".into(),json!(report.documents));
    object.insert("complete".into(),json!(report.completed)); object.insert("pending".into(),json!(pending));
    Ok(value)
}

#[cfg(test)]
mod tests {
    use super::*;
    struct Scratch(PathBuf);
    impl Scratch {
        fn new() -> Self {
            static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
            let path = std::env::temp_dir().join(format!("bun-crawl-native-dragon-ball-{}-{}", std::process::id(), NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed)));
            std::fs::create_dir(&path).unwrap();
            Self(path)
        }
    }
    impl Drop for Scratch { fn drop(&mut self) { let _ = std::fs::remove_dir_all(&self.0); } }

    #[tokio::test]
    async fn dragon_ball_plan_and_status_do_not_create_or_recover_frontiers() {
        let scratch = Scratch::new();
        let output = scratch.0.join("campaign");
        let config = scratch.0.join("plan.json");
        let mut plan = crate::dragon_ball::DragonBallPlan { respect_robots: false, ..Default::default() };
        plan.targets.truncate(2);
        std::fs::write(&config, serde_json::to_vec(&plan).unwrap()).unwrap();
        let options = |operation: &str| parse_json(&json!({"action":"dragon-ball","operation":operation,"store":output,"config":config})).unwrap();
        let planned = execute(&options("plan")).await.unwrap();
        assert_eq!(planned["targets"].as_array().unwrap().len(), 2);
        assert!(planned.get("complete").is_none());
        assert!(!output.exists());
        let absent = execute(&options("status")).await.unwrap();
        assert_eq!(absent["complete"], false);
        assert!(!output.exists());
        std::fs::create_dir_all(output.join("frontier")).unwrap();
        let mut snapshots = Vec::new();
        for (index, target) in plan.targets.iter().enumerate() {
            let path = output.join("frontier").join(format!("{}.sqlite", target.id));
            let mut frontier = Frontier::open(&path, FrontierOptions::default(), 0).unwrap();
            frontier.enqueue(AddRequest::seed(&target.seeds[0]), 0).unwrap();
            if index == 1 { frontier.lease_next(0).unwrap().unwrap(); }
            drop(frontier);
            snapshots.push((path.clone(), std::fs::read(path).unwrap()));
        }
        let status = execute(&options("status")).await.unwrap();
        assert_eq!(status["targets"].as_array().unwrap().len(), 2);
        assert_eq!(status["pending"], 1);
        assert_eq!(status["locked"], 1);
        assert_eq!(status["complete"], false);
        for (path, before) in snapshots { assert_eq!(std::fs::read(path).unwrap(), before); }
    }

    #[test]
    fn dragon_ball_rejects_unqualified_rendering_and_invalid_contracts() {
        let root = std::env::current_dir().unwrap();
        let base = json!({"action":"dragon-ball","operation":"crawl","store":root,"config":root.join("plan.json"),"sources":["official"],"maxRequests":100000,"timeout":900000});
        let parsed = parse_json(&base).unwrap();
        assert_eq!(checkpoint_scope(&parsed).as_deref(), Some("dragon-ball-campaign"));
        for (key, value) in [("operation",json!("render")),("config",json!("relative.json")),("sources",json!(["../escape"])),("render",json!(true))] {
            let mut invalid = base.clone(); invalid[key] = value;
            assert!(parse_json(&invalid).is_err(), "{key}");
        }
        let mut plan = base; plan["operation"] = json!("plan");
        assert!(checkpoint_scope(&parse_json(&plan).unwrap()).is_none());
    }
    #[tokio::test]
    async fn dragon_ball_zero_budget_preserves_resumable_campaign_without_network() {
        let scratch = Scratch::new();
        let output = scratch.0.join("campaign");
        let config = scratch.0.join("plan.json");
        let mut plan = crate::dragon_ball::DragonBallPlan { respect_robots: false, ..Default::default() };
        plan.targets.truncate(1);
        std::fs::write(&config, serde_json::to_vec(&plan).unwrap()).unwrap();
        let options = parse_json(&json!({"action":"dragon-ball","operation":"crawl","store":output,"config":config,"maxRequests":0})).unwrap();
        let report = execute(&options).await.unwrap();
        assert_eq!(report["operation"], "crawl");
        assert_eq!(report["network_requests"], 0);
        assert_eq!(report["complete"], false);
        assert!(report["pending"].as_u64().unwrap() > 0);
        assert!(output.join("report.json").is_file());
        assert!(output.join("target-status").join(format!("{}.json", plan.targets[0].id)).is_file());
        let mut status = options;
        status.operation = Some("status".into());
        let status = execute(&status).await.unwrap();
        assert_eq!(status["pending"], report["pending"]);
        assert_eq!(status["complete"], false);
    }
    #[tokio::test]
    async fn dragon_ball_status_uses_independent_policy_pinned_source_receipts() {
        use crate::dragon_ball::{TargetSnapshot, target_policy_sha256};
        let scratch = Scratch::new();
        let output = scratch.0.join("campaign");
        let config = scratch.0.join("plan.json");
        let mut plan = crate::dragon_ball::DragonBallPlan { respect_robots: false, ..Default::default() };
        plan.targets.truncate(2);
        std::fs::create_dir_all(output.join("target-status")).unwrap();
        for (index, target) in plan.targets.iter().enumerate() {
            let mut snapshot = TargetSnapshot { schema:"bun-dragon-ball-target-status/v1".into(),policy_sha256:target_policy_sha256(&plan,target,None,false).unwrap(),report:Default::default() };
            snapshot.report.id = target.id.clone();
            snapshot.report.documents = index + 1;
            snapshot.report.completed = true;
            std::fs::write(output.join("target-status").join(format!("{}.json",target.id)),serde_json::to_vec(&snapshot).unwrap()).unwrap();
            let path = output.join("frontier").join(format!("{}.sqlite",target.id));
            let mut frontier = Frontier::open(path,FrontierOptions::default(),0).unwrap();
            frontier.enqueue(AddRequest::seed(&target.seeds[0]),0).unwrap();
            let lease = frontier.lease_next(0).unwrap().unwrap();
            frontier.mark_done(&lease,&crate::frontier::PageRecord { title:target.id.clone(),markdown:target.id.clone(),content_hash:target.id.clone(),simhash:0 },0).unwrap();
        }
        std::fs::write(&config,serde_json::to_vec(&plan).unwrap()).unwrap();
        std::fs::write(output.join("report.json"),b"obsolete global report").unwrap();
        let options = parse_json(&json!({"action":"dragon-ball","operation":"status","store":output,"config":config})).unwrap();
        let status = execute(&options).await.unwrap();
        assert_eq!(status["complete"],true);
        assert_eq!(status["documents"],3);
        let changed = format!("{}?changed=1",plan.targets[0].seeds[0]);
        plan.targets[0].seeds.push(changed);
        std::fs::write(&config,serde_json::to_vec(&plan).unwrap()).unwrap();
        let status = execute(&options).await.unwrap();
        assert_eq!(status["complete"],false);
        assert_eq!(status["targets"][0]["completed"],false);
        assert_eq!(status["targets"][1]["completed"],true);
    }
    #[test]
    fn api_adapter_keeps_independent_checkpoint_scopes() {
        let cwd = std::env::current_dir().unwrap();
        let store = cwd.join("fixture.sqlite");
        let first = parse_json(
            &json!({"action":"archive-cdx","store":store,"seed":"https://example.test/a@b"}),
        )
        .unwrap();
        let second = parse_json(
            &json!({"action":"archive-cdx","store":store,"seed":"https://example.test/other"}),
        )
        .unwrap();
        assert_ne!(checkpoint_scope(&first), checkpoint_scope(&second));
        assert!(parse_json(&json!({"action":"archive-media","store":store,"query":"one","mediaType":"image","scope":"host"})).is_err());
        assert!(
            parse_json(
                &json!({"action":"run","store":"relative.sqlite","seed":"https://example.test/"})
            )
            .is_err()
        );
        assert!(
            parse_json(
                &json!({"action":"run","store":store,"seed":"https://example.test/","maxPages":10})
            )
            .is_err()
        );
    }
    #[test]
    fn parser_keeps_stores_explicit_and_validates_before_io() {
        let cwd = std::env::current_dir().unwrap();
        let parse_args = |args: &[&str]| {
            parse(
                &args
                    .iter()
                    .map(|value| (*value).to_owned())
                    .collect::<Vec<_>>(),
                &cwd,
            )
        };
        assert!(parse_args(&["archive-cdx", "--seed", "https://example.test"]).is_err());
        assert!(
            parse_args(&[
                "archive-cdx",
                "--store",
                "fixture.sqlite",
                "--seed",
                "https://user:secret@example.test"
            ])
            .is_err()
        );
        let options = parse_args(&[
            "archive-media",
            "--store",
            "fixture.sqlite",
            "--query",
            "collection:fixture",
            "--mediatype",
            "movies",
        ])
        .unwrap();
        assert!(options.store.is_absolute());
        assert_eq!(options.page_size, 100);
        assert!(!options.allow_private);
        assert!(
            parse_args(&[
                "run",
                "--store",
                "fixture.sqlite",
                "--seed",
                "https://example.test",
                "--concurrency",
                "129"
            ])
            .is_err()
        );
    }
}
