// SPDX-License-Identifier: Apache-2.0
//! Native CLI over the canonical archive index and persistent crawl scheduler.
use std::path::{Path, PathBuf};

use serde_json::{Value, json};
use url::Url;

use crate::archive::{ArchiveMediaType, CdxMatch, index_media, index_wayback};
use crate::{
    AddRequest, BunBrowserTransport, CrawlOptions, Frontier, FrontierOptions, crawl_bounded,
};

pub const HELP: &str = "bun crawl archive-cdx --store FILE --seed URL [--scope exact|prefix|host|domain] [--page-size 1000] [--max-pages 1]\nbun crawl archive-media --store FILE --query QUERY --mediatype image|movies [--page-size 100] [--max-pages 1]\nbun crawl sitemaps|run --store FILE --seed URL [--seed URL] [--max-sitemaps 25] [--max-requests 25] [--concurrency 4]\nOptional: --endpoint URL (archive routes), --allow-private (explicit local fixtures), --timeout-ms 30000\nStores are explicit SQLite paths. Archive routes acquire metadata only. Native HTTP concurrency is 1..128.\n";

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
    if !["archive-cdx", "archive-media", "sitemaps", "run"].contains(&action.as_str()) {
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
            "--max-requests" => value.action == "run",
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
            "--max-requests" => value.max_requests = integer(parameter, 0, 1000)?,
            "--max-sitemaps" => value.max_sitemaps = integer(parameter, 0, 100)?,
            "--concurrency" => value.concurrency = integer(parameter, 1, 128)?,
            "--timeout-ms" => value.timeout_ms = integer(parameter, 1, 120_000)? as u64,
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
            obey_robots: true,
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

#[cfg(test)]
mod tests {
    use super::*;
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
