// SPDX-License-Identifier: Apache-2.0

use std::collections::{HashMap, HashSet, VecDeque};
use std::time::{SystemTime, UNIX_EPOCH};

use bun_browser_dom::parse_html;
use bun_browser_extract::{
    Extracted, UrlNormalizationOptions, extract_main, normalize_page_url, simhash64,
};
use bun_browser_net::BunBrowserHttpClient;
use futures::{StreamExt, stream::FuturesUnordered};
use regex::Regex;
use url::Url;

use crate::frontier::{AddRequest, Frontier, FrontierStats, PageRecord, StoredPage};
use crate::robots::RobotsFile;
use crate::sitemap::{parse_sitemap_page, seed_boost};

pub struct FetchResult {
    pub url: Url,
    pub status: u16,
    pub content_type: Option<String>,
    pub body: String,
}

// Browser transports can own a V8 isolate and yield !Send futures. The runner
// polls them on its caller's task and does not promise cross-thread execution.
#[allow(async_fn_in_trait)]
pub trait CrawlTransport {
    async fn fetch(&self, url: &Url) -> Result<FetchResult, String>;
    async fn fetch_sitemap(&self, url: &Url) -> Result<FetchResult, String> {
        self.fetch(url).await
    }
    async fn fetch_archive(&self, url: &Url) -> Result<FetchResult, String> {
        self.fetch(url).await
    }
}

/// Static HTTP transport through the existing BunBrowser network stack.
pub struct BunBrowserTransport {
    client: BunBrowserHttpClient,
}

impl Default for BunBrowserTransport {
    fn default() -> Self {
        Self {
            client: BunBrowserHttpClient::new(),
        }
    }
}

impl BunBrowserTransport {
    #[must_use]
    pub fn new(client: BunBrowserHttpClient) -> Self {
        Self { client }
    }

    /// Scope a dedicated client before use; never replace an existing owner's interceptor.
    pub async fn scoped(client: BunBrowserHttpClient, domains: &[String]) -> Result<Self, String> {
        let policy = bun_browser_net::interceptor::DomainAllowlistInterceptor::new(domains)
            .map_err(str::to_owned)?;
        {
            let mut interceptor = client.interceptor.write().await;
            if interceptor.is_some() {
                return Err("crawl scope cannot replace an existing request interceptor".into());
            }
            *interceptor = Some(Box::new(policy));
        }
        Ok(Self { client })
    }
}

impl CrawlTransport for BunBrowserTransport {
    async fn fetch(&self, url: &Url) -> Result<FetchResult, String> {
        let response = self
            .client
            .fetch(url)
            .await
            .map_err(|error| error.to_string())?;
        Ok(FetchResult {
            url: response.url.clone(),
            status: response.status,
            content_type: response.content_type().map(str::to_owned),
            body: response.text(),
        })
    }

    async fn fetch_sitemap(&self, url: &Url) -> Result<FetchResult, String> {
        let request = bun_browser_net::ResourceRequest::navigation()
            .with_max_response_bytes(16 * 1024 * 1024);
        let response = self
            .client
            .fetch_resource_with_callbacks(url, request, None)
            .await
            .map_err(|error| error.to_string())?;
        let body = crate::sitemap::decode_sitemap_bytes(&response.body)?;
        Ok(FetchResult {
            url: response.url.clone(),
            status: response.status,
            content_type: response.content_type().map(str::to_owned),
            body,
        })
    }
    async fn fetch_archive(&self, url: &Url) -> Result<FetchResult, String> {
        let request =
            bun_browser_net::ResourceRequest::navigation().with_max_response_bytes(8 * 1024 * 1024);
        let response = self
            .client
            .fetch_resource_with_callbacks(url, request, None)
            .await
            .map_err(|error| error.to_string())?;
        let content_type = response.content_type().map(str::to_owned);
        let body = String::from_utf8(response.body).map_err(|_| "Archive index is not UTF-8")?;
        Ok(FetchResult {
            url: response.url,
            status: response.status,
            content_type,
            body,
        })
    }
}

#[derive(Debug, Clone)]
pub struct CrawlOptions {
    pub max_depth: u32,
    pub max_requests: usize,
    pub max_concurrency: usize,
    pub allowed_domains: Vec<String>,
    /// URL regex filters applied before fetching. Excludes always take priority.
    pub include_url_regex: Vec<String>,
    pub exclude_url_regex: Vec<String>,
    pub max_links_per_page: usize,
    pub obey_robots: bool,
    pub ingest_sitemaps: bool,
    pub user_agent: String,
    pub max_sitemaps: usize,
    pub wait_for_revisits: bool,
    pub report_detail_limit: usize,
    pub report_max_bytes: usize,
}

impl Default for CrawlOptions {
    fn default() -> Self {
        Self {
            max_depth: 2,
            max_requests: 25,
            max_concurrency: 4,
            allowed_domains: Vec::new(),
            include_url_regex: Vec::new(),
            exclude_url_regex: Vec::new(),
            max_links_per_page: 10_000,
            obey_robots: false,
            ingest_sitemaps: false,
            user_agent: "AphrodyWeb/1.0".into(),
            max_sitemaps: 25,
            wait_for_revisits: false,
            report_detail_limit: 32,
            report_max_bytes: 8 * 1024 * 1024,
        }
    }
}

#[derive(Debug, Clone)]
pub struct CrawlPage {
    pub url: Url,
    pub depth: u32,
    pub status: u16,
    pub extracted: Extracted,
    pub duplicate: bool,
    pub discovered_links: usize,
}

#[derive(Debug, Default)]
pub struct CrawlReport {
    pub pages: Vec<CrawlPage>,
    pub pages_processed: usize,
    pub page_details_dropped: usize,
    pub errors_dropped: usize,
    pub error_count: usize,
    pub report_bytes_retained: usize,
    pub attempts: usize,
    pub exact_duplicates: usize,
    pub near_duplicates: usize,
    pub errors: Vec<(String, String)>,
    pub robots_fetched: usize,
    pub robots_blocked: usize,
    pub sitemaps_fetched: usize,
    pub sitemap_urls_enqueued: usize,
    pub sitemap_entries_processed: usize,
    pub sitemaps_pending: usize,
    pub sitemap_hosts_pending: usize,
    pub sitemap_budget_exhausted: bool,
    pub frontier: FrontierStats,
}

impl CrawlReport {
    fn retain_page(&mut self, page: CrawlPage, options: &CrawlOptions) {
        self.pages_processed += 1;
        self.page_detail(page, options);
    }

    fn page_detail(&mut self, page: CrawlPage, options: &CrawlOptions) {
        let extracted = &page.extracted;
        let mut bytes = 2 * std::mem::size_of::<CrawlPage>() + 2 * page.url.as_str().len();
        bytes += extracted.title.capacity()
            + extracted.text.capacity()
            + extracted.markdown.capacity()
            + extracted.simhash.capacity();
        for value in [
            &extracted.byline,
            &extracted.published,
            &extracted.lang,
            &extracted.canonical,
            &extracted.site_name,
            &extracted.description,
        ]
        .into_iter()
        .flatten()
        {
            bytes = bytes.saturating_add(value.capacity());
        }
        bytes = bytes.saturating_add(
            extracted
                .blocks
                .capacity()
                .saturating_mul(std::mem::size_of::<bun_browser_extract::Block>()),
        );
        for block in &extracted.blocks {
            bytes = bytes.saturating_add(block.text.capacity()).saturating_add(
                block
                    .heading_path
                    .capacity()
                    .saturating_mul(std::mem::size_of::<String>()),
            );
            for heading in &block.heading_path {
                bytes = bytes.saturating_add(heading.capacity());
            }
        }
        if self.pages.len() >= options.report_detail_limit.min(1000)
            || bytes
                > options
                    .report_max_bytes
                    .min(64 * 1024 * 1024)
                    .saturating_sub(self.report_bytes_retained)
        {
            self.page_details_dropped += 1;
            return;
        }
        self.report_bytes_retained += bytes;
        self.pages.push(page);
    }

    fn retain_error(&mut self, url: String, error: String, options: &CrawlOptions) {
        self.error_count += 1;
        self.error_detail(url, error, options);
    }

    fn error_detail(&mut self, url: String, error: String, options: &CrawlOptions) {
        let bytes = url
            .capacity()
            .saturating_add(error.capacity())
            .saturating_add(2 * std::mem::size_of::<(String, String)>());
        if self.errors.len() >= options.report_detail_limit.min(1000)
            || bytes
                > options
                    .report_max_bytes
                    .min(64 * 1024 * 1024)
                    .saturating_sub(self.report_bytes_retained)
        {
            self.errors_dropped += 1;
            return;
        }
        self.report_bytes_retained += bytes;
        self.errors.push((url, error));
    }
}

/// Drains a bounded portion of the shared frontier. A transport can be swapped
/// for a browser renderer or deterministic fixture without changing scheduling.
pub async fn crawl_bounded<T: CrawlTransport>(
    frontier: &mut Frontier,
    transport: &T,
    options: &CrawlOptions,
) -> rusqlite::Result<CrawlReport> {
    let mut report = CrawlReport::default();
    let mut active = FuturesUnordered::new();
    let concurrency = options.max_concurrency.clamp(1, 128);
    let allowed: HashSet<String> = options
        .allowed_domains
        .iter()
        .map(|s| s.to_ascii_lowercase())
        .collect();
    let include_url_regex = match compile_url_patterns(&options.include_url_regex, "include") {
        Ok(patterns) => patterns,
        Err(error) => {
            report.retain_error("include-url-regex".into(), error, options);
            return Ok(report);
        }
    };
    let exclude_url_regex = match compile_url_patterns(&options.exclude_url_regex, "exclude") {
        Ok(patterns) => patterns,
        Err(error) => {
            report.retain_error("exclude-url-regex".into(), error, options);
            return Ok(report);
        }
    };
    let mut robots = HashMap::<String, RobotsFile>::new();
    if options.ingest_sitemaps {
        ingest_seed_sitemaps(
            frontier,
            transport,
            options,
            &allowed,
            &mut robots,
            &mut report,
        )
        .await?;
    }

    loop {
        while active.len() < concurrency && report.attempts < options.max_requests {
            let Some(lease) = frontier.lease_next(now_ms())? else {
                break;
            };
            report.attempts += 1;
            if !domain_allowed(&lease.url, &allowed) {
                frontier.mark_rejected(&lease, "URL is outside allowed_domains")?;
                report.retain_error(
                    lease.url.to_string(),
                    "URL is outside allowed_domains".into(),
                    options,
                );
                continue;
            }
            if !url_matches_filters(&lease.url, &include_url_regex, &exclude_url_regex) {
                frontier.mark_rejected(&lease, "URL excluded by crawl plan")?;
                continue;
            }
            if options.obey_robots {
                let policy = load_robots(&lease.url, transport, &mut robots, &mut report).await;
                if let Some(delay) = policy.crawl_delay_ms(&options.user_agent) {
                    frontier.set_host_delay(lease.url.host_str().unwrap_or_default(), delay)?;
                }
                if !policy.allows(&lease.url, &options.user_agent) {
                    frontier.mark_rejected(&lease, "robots.txt disallows URL")?;
                    report.robots_blocked += 1;
                    continue;
                }
            }
            active.push(async move {
                let result = transport.fetch(&lease.url).await;
                (lease, result)
            });
        }

        if active.is_empty() {
            if report.attempts >= options.max_requests {
                break;
            }
            let stats = frontier.stats()?;
            if stats.pending == 0 && !options.wait_for_revisits {
                break;
            }
            let next = if stats.pending > 0 {
                frontier.next_ready_at()?
            } else {
                frontier.next_revisit_at()?
            };
            let Some(next) = next else { break };
            let delay = next.saturating_sub(now_ms());
            tokio::time::sleep(std::time::Duration::from_millis(
                delay.clamp(1, 1_000) as u64
            ))
            .await;
            continue;
        }

        let Some((lease, result)) = active.next().await else {
            break;
        };
        match result {
            Ok(response) if (200..400).contains(&response.status) => {
                let response_url = normalize_page_url(
                    response.url.as_str(),
                    None,
                    UrlNormalizationOptions::default(),
                )
                .unwrap_or_else(|_| lease.url.clone());
                if !domain_allowed(&response_url, &allowed) {
                    frontier.mark_rejected(&lease, "redirect left allowed_domains")?;
                    report.retain_error(
                        lease.url.to_string(),
                        "redirect left allowed_domains".into(),
                        options,
                    );
                    continue;
                }
                let is_html = response
                    .content_type
                    .as_deref()
                    .is_none_or(|kind| kind.contains("html") || kind.contains("xml"));
                let extracted = if is_html {
                    extract_main(&response.body, Some(response_url.as_str()))
                } else {
                    Extracted::default()
                };
                let hash_text = if extracted.text.trim().is_empty() {
                    &response.body
                } else {
                    &extracted.text
                };
                let record = PageRecord {
                    title: extracted.title.clone(),
                    markdown: extracted.markdown.clone(),
                    content_hash: blake3::hash(hash_text.as_bytes()).to_hex().to_string(),
                    simhash: simhash64(&extracted.text),
                };
                let status = frontier.mark_done(&lease, &record, now_ms())?;
                let mut discovered_links = 0;
                if is_html && lease.depth < options.max_depth && status == StoredPage::New {
                    let links = extract_links(&response.body, &response_url)
                        .into_iter()
                        .filter(|(url, _)| {
                            domain_allowed(url, &allowed)
                                && url_matches_filters(url, &include_url_regex, &exclude_url_regex)
                        })
                        .take(options.max_links_per_page);
                    discovered_links = frontier.enqueue_children(&lease, links, now_ms())?;
                }
                match status {
                    StoredPage::ExactDuplicate => report.exact_duplicates += 1,
                    StoredPage::NearDuplicate => report.near_duplicates += 1,
                    StoredPage::New => {}
                }
                report.retain_page(
                    CrawlPage {
                        url: response_url,
                        depth: lease.depth,
                        status: response.status,
                        extracted,
                        duplicate: status != StoredPage::New,
                        discovered_links,
                    },
                    options,
                );
            }
            Ok(response) => {
                let error = format!("HTTP {}", response.status);
                frontier.mark_failed(&lease, &error)?;
                report.retain_error(lease.url.to_string(), error, options);
            }
            Err(error) => {
                frontier.mark_failed(&lease, &error)?;
                report.retain_error(lease.url.to_string(), error, options);
            }
        }
    }
    report.frontier = frontier.stats()?;
    Ok(report)
}

/// Configuration options for the 24/7 continuous crawl daemon.
#[derive(Debug, Clone)]
pub struct CrawlDaemonOptions {
    /// Bounded options applied to each crawl iteration / scheduling batch.
    pub base: CrawlOptions,
    /// Delay in milliseconds when no ready URLs or revisits are available.
    pub idle_poll_ms: u64,
    /// Interval in milliseconds to run frontier maintenance (stale lock recovery, revisit promotion).
    pub maintenance_interval_ms: u64,
    /// Maximum consecutive errors or loop iterations before returning (None = run indefinitely).
    pub max_iterations: Option<usize>,
}

impl Default for CrawlDaemonOptions {
    fn default() -> Self {
        Self {
            base: CrawlOptions {
                wait_for_revisits: true,
                ..CrawlOptions::default()
            },
            idle_poll_ms: 1_000,
            maintenance_interval_ms: 10_000,
            max_iterations: None,
        }
    }
}

/// Continuous 24/7 crawl daemon that loops asynchronously over the frontier,
/// handling stale recovery, revisit promotion, and backoff during idle periods.
pub async fn crawl_daemon<T: CrawlTransport>(
    frontier: &mut Frontier,
    transport: &T,
    options: &CrawlDaemonOptions,
    shutdown: Option<tokio::sync::watch::Receiver<bool>>,
) -> rusqlite::Result<CrawlReport> {
    let mut accumulated = CrawlReport::default();
    let mut last_maintenance = now_ms();
    let mut iterations = 0;

    loop {
        if let Some(ref rx) = shutdown
            && *rx.borrow()
        {
            break;
        }
        if let Some(max_iter) = options.max_iterations
            && iterations >= max_iter
        {
            break;
        }
        iterations += 1;

        let current_time = now_ms();
        if current_time.saturating_sub(last_maintenance) >= options.maintenance_interval_ms as i64 {
            let _ = frontier.recover_stale(current_time);
            let _ = frontier.promote_due_revisits(current_time);
            last_maintenance = current_time;
        }

        let step_report = crawl_bounded(frontier, transport, &options.base).await?;
        let pages_count = step_report.pages_processed;
        accumulated.pages_processed += step_report.pages_processed;
        accumulated.page_details_dropped += step_report.page_details_dropped;
        accumulated.error_count += step_report.error_count;
        accumulated.errors_dropped += step_report.errors_dropped;
        accumulated.attempts += step_report.attempts;
        accumulated.exact_duplicates += step_report.exact_duplicates;
        accumulated.near_duplicates += step_report.near_duplicates;
        accumulated.robots_fetched += step_report.robots_fetched;
        accumulated.robots_blocked += step_report.robots_blocked;
        accumulated.sitemaps_fetched += step_report.sitemaps_fetched;
        accumulated.sitemap_urls_enqueued += step_report.sitemap_urls_enqueued;
        accumulated.sitemap_entries_processed += step_report.sitemap_entries_processed;
        accumulated.sitemaps_pending = step_report.sitemaps_pending;
        accumulated.sitemap_hosts_pending = step_report.sitemap_hosts_pending;
        accumulated.sitemap_budget_exhausted |= step_report.sitemap_budget_exhausted;
        for (url, error) in step_report.errors {
            accumulated.error_detail(url, error, &options.base);
        }
        for page in step_report.pages {
            accumulated.page_detail(page, &options.base);
        }
        accumulated.frontier = step_report.frontier;

        if pages_count == 0 {
            let stats = frontier.stats()?;
            if stats.pending == 0 {
                let next_revisit = frontier.next_revisit_at()?;
                let sleep_duration = match next_revisit {
                    Some(due) if due > current_time => {
                        let diff = (due - current_time) as u64;
                        diff.min(options.idle_poll_ms)
                    }
                    _ => options.idle_poll_ms,
                };
                tokio::time::sleep(std::time::Duration::from_millis(sleep_duration)).await;
            }
        }
    }

    accumulated.frontier = frontier.stats()?;
    Ok(accumulated)
}

fn now_ms() -> i64 {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    i64::try_from(millis).unwrap_or(i64::MAX)
}

fn domain_allowed(url: &Url, allowed: &HashSet<String>) -> bool {
    let host = url.host_str().unwrap_or_default().to_ascii_lowercase();
    allowed.is_empty()
        || allowed
            .iter()
            .any(|domain| host == *domain || host.ends_with(&format!(".{domain}")))
}

fn url_matches_filters(url: &Url, include: &[Regex], exclude: &[Regex]) -> bool {
    let value = url.as_str();
    !exclude.iter().any(|pattern| pattern.is_match(value))
        && (include.is_empty() || include.iter().any(|pattern| pattern.is_match(value)))
}

fn compile_url_patterns(patterns: &[String], kind: &str) -> Result<Vec<Regex>, String> {
    patterns
        .iter()
        .map(|pattern| {
            Regex::new(pattern)
                .map_err(|error| format!("invalid {kind} URL regex {pattern:?}: {error}"))
        })
        .collect()
}

async fn load_robots<'a, T: CrawlTransport>(
    page_url: &Url,
    transport: &T,
    cache: &'a mut HashMap<String, RobotsFile>,
    report: &mut CrawlReport,
) -> &'a RobotsFile {
    let origin = page_url.origin().ascii_serialization();
    if !cache.contains_key(&origin) {
        let robots_url = page_url
            .join("/robots.txt")
            .expect("HTTP page URL has an origin");
        let content = match transport.fetch(&robots_url).await {
            Ok(response) if response.status < 400 && response.body.len() <= 1024 * 1024 => {
                report.robots_fetched += 1;
                response.body
            }
            _ => String::new(),
        };
        cache.insert(origin.clone(), RobotsFile::parse(&robots_url, &content));
    }
    &cache[&origin]
}

async fn ingest_seed_sitemaps<T: CrawlTransport>(
    frontier: &mut Frontier,
    transport: &T,
    options: &CrawlOptions,
    allowed: &HashSet<String>,
    robots: &mut HashMap<String, RobotsFile>,
    report: &mut CrawlReport,
) -> rusqlite::Result<()> {
    let mut origins = HashSet::new();
    let mut scope_hosts: Vec<_> = allowed.iter().cloned().collect();
    scope_hosts.sort_unstable();
    let scope = blake3::hash(scope_hosts.join("\n").as_bytes())
        .to_hex()
        .to_string();
    for raw in frontier.undiscovered_seed_urls(&scope, 32)? {
        let Ok(url) = Url::parse(&raw) else { continue };
        if !domain_allowed(&url, allowed) || !origins.insert(url.origin().ascii_serialization()) {
            frontier.mark_sitemap_host_discovered(&scope, url.host_str().unwrap_or_default())?;
            continue;
        }
        let policy = load_robots(&url, transport, robots, report).await;
        if options.obey_robots
            && let Some(delay) = policy.crawl_delay_ms(&options.user_agent)
        {
            frontier.set_host_delay(url.host_str().unwrap_or_default(), delay)?;
        }
        if policy.sitemaps().is_empty() {
            if let Ok(fallback) = url.join("/sitemap.xml") {
                frontier.enqueue_sitemap(&fallback)?;
            }
        } else {
            for sitemap in policy
                .sitemaps()
                .iter()
                .filter(|url| domain_allowed(url, allowed))
            {
                frontier.enqueue_sitemap(sitemap)?;
            }
        }
        frontier.mark_sitemap_host_discovered(&scope, url.host_str().unwrap_or_default())?;
        if origins.len() >= 32 {
            break;
        }
    }
    let mut seen = HashSet::new();
    let limit = options.max_sitemaps.min(100);
    let mut sitemap_queue: VecDeque<_> = frontier.pending_sitemaps(allowed, limit)?.into();
    let mut queued: HashSet<String> = sitemap_queue
        .iter()
        .map(|(url, _, _)| url.clone())
        .collect();
    let mut attempts = 0;
    while attempts < limit {
        let remaining = 50_000usize.saturating_sub(report.sitemap_entries_processed);
        if remaining == 0 {
            report.sitemap_budget_exhausted = true;
            break;
        }
        let Some((raw, offset, previous_hash)) = sitemap_queue.pop_front() else {
            break;
        };
        let Ok(url) = Url::parse(&raw) else { continue };
        if !domain_allowed(&url, allowed) || !seen.insert(url.as_str().to_owned()) {
            continue;
        }
        attempts += 1;
        let response = match transport.fetch_sitemap(&url).await {
            Ok(response) => response,
            Err(error) => {
                report.retain_error(url.to_string(), error, options);
                continue;
            }
        };
        if response.status != 200
            || response.body.len() > 16 * 1024 * 1024
            || !domain_allowed(&response.url, allowed)
        {
            report.retain_error(
                url.to_string(),
                "Sitemap fetch failed or exceeded its byte bound".into(),
                options,
            );
            continue;
        }
        report.sitemaps_fetched += 1;
        let body_hash = blake3::hash(response.body.as_bytes()).to_hex().to_string();
        let offset = if previous_hash
            .as_deref()
            .is_some_and(|previous| previous != body_hash)
        {
            0
        } else {
            offset
        };
        let parsed = parse_sitemap_page(&response.body, &response.url, offset, remaining);
        if let Some(error) = parsed.error {
            report.retain_error(url.to_string(), error.into(), options);
            continue;
        }
        report.sitemap_entries_processed += parsed.entries_processed;
        for nested in parsed.sitemaps {
            if domain_allowed(&nested, allowed) {
                frontier.enqueue_sitemap(&nested)?;
                if !seen.contains(nested.as_str())
                    && attempts + sitemap_queue.len() < limit
                    && queued.insert(nested.as_str().to_owned())
                    && let Some((offset, false, previous_hash)) = frontier.sitemap_job(&nested)?
                {
                    sitemap_queue.push_back((nested.to_string(), offset, previous_hash));
                }
            }
        }
        let requests = parsed
            .urls
            .into_iter()
            .filter(|entry| domain_allowed(&entry.url, allowed))
            .map(|entry| AddRequest {
                url: entry.url.to_string(),
                depth: 0,
                priority: false,
                boost: seed_boost(&entry, now_ms()),
            });
        report.sitemap_urls_enqueued += frontier.enqueue_many(requests, now_ms())?;
        frontier.advance_sitemap(&url, parsed.next_offset, &body_hash)?;
    }
    report.sitemaps_pending = frontier.sitemap_pending_count(allowed)?;
    report.sitemap_hosts_pending = frontier.sitemap_hosts_pending_count(&scope)?;
    if report.sitemap_hosts_pending > 0 {
        report.sitemap_budget_exhausted = true;
    }
    if attempts >= limit && report.sitemaps_pending > 0 {
        report.sitemap_budget_exhausted = true;
    }
    Ok(())
}

/// Canonical anchor extraction: resolved, fragment-normalised, de-duplicated
/// `(url, anchor text)` pairs in document order. `skip_nofollow` drops
/// `rel=nofollow` anchors. Shared by the crawler and the `bun` crawl.
pub fn extract_links_opts(html: &str, page_url: &Url, skip_nofollow: bool) -> Vec<(Url, String)> {
    let dom = parse_html(html);
    let mut seen = HashSet::new();
    let mut links = Vec::new();
    for id in dom.query_selector_all("a[href]").unwrap_or_default() {
        let Some((href, nofollow)) = dom.with_node(id, |node| {
            (
                node.get_attribute("href").map(str::to_owned),
                node.get_attribute("rel").is_some_and(|rel| {
                    rel.split_ascii_whitespace()
                        .any(|part| part.eq_ignore_ascii_case("nofollow"))
                }),
            )
        }) else {
            continue;
        };
        if nofollow && skip_nofollow {
            continue;
        }
        let Some(href) = href else { continue };
        let Ok(url) = normalize_page_url(&href, Some(page_url), UrlNormalizationOptions::default())
        else {
            continue;
        };
        if seen.insert(url.as_str().to_owned()) {
            links.push((url, dom.text_content(id).chars().take(512).collect()));
        }
    }
    links
}

fn extract_links(html: &str, page_url: &Url) -> Vec<(Url, String)> {
    extract_links_opts(html, page_url, true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::FrontierOptions;
    use std::collections::HashMap;


    async fn http_fixture(
        response: String,
    ) -> (
        Url,
        std::sync::Arc<std::sync::atomic::AtomicUsize>,
        tokio::task::JoinHandle<()>,
    ) {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = Url::parse(&format!(
            "http://localhost:{}/",
            listener.local_addr().unwrap().port()
        ))
        .unwrap();
        let requests = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let count = std::sync::Arc::clone(&requests);
        let server = tokio::spawn(async move {
            loop {
                let Ok((mut stream, _)) = listener.accept().await else {
                    break;
                };
                count.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                let mut bytes = [0; 4096];
                if stream.read(&mut bytes).await.unwrap_or(0) == 0 {
                    continue;
                }
                stream.write_all(response.as_bytes()).await.unwrap();
            }
        });
        (url, requests, server)
    }

    #[tokio::test]
    async fn scoped_transport_blocks_page_robots_and_sitemap_redirects_before_target_contact() {
        use std::sync::{Arc, atomic::Ordering};
        let (mut forbidden, contacted, target_server) = http_fixture(
            "HTTP/1.1 200 OK\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".into(),
        )
        .await;
        forbidden.set_host(Some("127.0.0.1")).unwrap();
        let (initial, requested, source_server) = http_fixture(format!(
            "HTTP/1.1 302 Found\r\nLocation: {forbidden}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
        )).await;
        let client = BunBrowserHttpClient::with_full_options(
            Arc::new(bun_browser_net::CookieJar::new()),
            None,
            true,
        );
        let transport = BunBrowserTransport::scoped(client, &["localhost".into()])
            .await
            .unwrap();
        for path in ["/page", "/robots.txt", "/sitemap.xml"] {
            let error = transport
                .fetch(&initial.join(path).unwrap())
                .await
                .err()
                .unwrap();
            assert!(
                error.contains("blocked"),
                "the scope interceptor must reject the redirect"
            );
        }
        tokio::task::yield_now().await;
        assert_eq!(requested.load(Ordering::SeqCst), 3);
        assert_eq!(contacted.load(Ordering::SeqCst), 0);
        source_server.abort();
        target_server.abort();
    }

    #[tokio::test]
    async fn scoped_transport_follows_allowed_redirects_and_refuses_unknown_robot_policy() {
        use std::sync::{Arc, atomic::Ordering};
        let (allowed, contacted, target_server) = http_fixture(
            "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: 9\r\nConnection: close\r\n\r\npermitted".into(),
        ).await;
        let (initial, _, source_server) = http_fixture(format!(
            "HTTP/1.1 302 Found\r\nLocation: {allowed}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
        )).await;
        let client = BunBrowserHttpClient::with_full_options(
            Arc::new(bun_browser_net::CookieJar::new()),
            None,
            true,
        );
        let transport = BunBrowserTransport::scoped(client, &["localhost".into()])
            .await
            .unwrap();
        assert_eq!(transport.fetch(&initial).await.unwrap().body, "permitted");
        assert_eq!(contacted.load(Ordering::SeqCst), 1);
        let mut frontier = Frontier::memory(FrontierOptions::default()).unwrap();
        frontier
            .enqueue(AddRequest::seed("https://example.test/"), now_ms())
            .unwrap();
        let report = crawl_bounded(
            &mut frontier,
            &Fixture(HashMap::new()),
            &CrawlOptions {
                allowed_domains: vec!["example.test".into()],
                obey_robots: true,
                ..CrawlOptions::default()
            },
        )
        .await
        .unwrap();
        assert_eq!(report.pages.len(), 0);
        assert_eq!(report.robots_blocked, 1);
        assert_eq!(report.frontier.failed, 1);
        source_server.abort();
        target_server.abort();
    }

    struct Fixture(HashMap<String, String>);
    impl CrawlTransport for Fixture {
        async fn fetch(&self, url: &Url) -> Result<FetchResult, String> {
            let body = self.0.get(url.as_str()).ok_or("missing fixture")?.clone();
            Ok(FetchResult {
                url: url.clone(),
                status: 200,
                content_type: Some("text/html".into()),
                body,
            })
        }
    }

    #[tokio::test]
    async fn bounded_crawl_follows_links_and_respects_host_scope() {
        let mut frontier = Frontier::memory(FrontierOptions::default()).unwrap();
        frontier
            .enqueue(AddRequest::seed("https://example.test/"), now_ms())
            .unwrap();
        let pages = HashMap::from([
            ("https://example.test/".into(), "<main><h1>Home</h1><p>A useful page with enough content for extraction.</p><a href='/next#part'>Next</a><a href='https://elsewhere.test/'>Elsewhere</a></main>".into()),
            ("https://example.test/next".into(), "<main><h1>Next</h1><p>Another useful page with different content for extraction.</p></main>".into()),
        ]);
        let options = CrawlOptions {
            allowed_domains: vec!["example.test".into()],
            ..CrawlOptions::default()
        };
        let report = crawl_bounded(&mut frontier, &Fixture(pages), &options)
            .await
            .unwrap();
        assert_eq!(report.pages.len(), 2);
        assert_eq!(report.frontier.done, 2);
        assert_eq!(report.pages[0].discovered_links, 1);
    }

    #[tokio::test]
    async fn robots_and_nested_sitemaps_seed_allowed_pages() {
        let mut frontier = Frontier::memory(FrontierOptions::default()).unwrap();
        frontier
            .enqueue(AddRequest::seed("https://example.test/private"), now_ms())
            .unwrap();
        let pages = HashMap::from([
            ("https://example.test/robots.txt".into(), "User-agent: *\nDisallow: /private\nCrawl-delay: 0.001\nSitemap: /sitemap.xml".into()),
            ("https://example.test/sitemap.xml".into(), "<sitemapindex><sitemap><loc>https://example.test/more.xml</loc></sitemap></sitemapindex>".into()),
            ("https://example.test/more.xml".into(), "<urlset><url><loc>https://example.test/public</loc><priority>0.8</priority></url></urlset>".into()),
            ("https://example.test/public".into(), "<main><h1>Public</h1><p>This page is permitted and contains useful public information.</p></main>".into()),
        ]);
        let options = CrawlOptions {
            obey_robots: true,
            ingest_sitemaps: true,
            allowed_domains: vec!["example.test".into()],
            ..CrawlOptions::default()
        };
        let report = crawl_bounded(&mut frontier, &Fixture(pages), &options)
            .await
            .unwrap();
        assert_eq!(report.robots_fetched, 1);
        assert_eq!(report.sitemaps_fetched, 2);
        assert_eq!(report.sitemap_urls_enqueued, 1);
        assert_eq!(report.robots_blocked, 1);
        assert_eq!(report.frontier.done, 1);
    }

    #[test]
    fn links_dedupe_fragments_and_skip_nofollow() {
        let base = Url::parse("https://example.test/").unwrap();
        let html = "<a href='/a#one'>A</a><a href='/a#two'>A2</a><a href='/b' rel='nofollow'>B</a>";
        assert_eq!(
            extract_links(html, &base),
            vec![(Url::parse("https://example.test/a").unwrap(), "A".into())]
        );
    }

    #[tokio::test]
    async fn archive_transport_rejects_oversized_chunked_body_before_materializing_text() {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = Url::parse(&format!("http://{}/cdx", listener.local_addr().unwrap())).unwrap();
        let server = tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut request = [0; 4096];
            let mut used = 0;
            while !request[..used].windows(4).any(|bytes| bytes == b"\r\n\r\n") {
                assert!(used < request.len(), "fixture request headers exceed bound");
                let read = socket.read(&mut request[used..]).await.unwrap();
                assert!(read > 0, "fixture request ended before headers");
                used += read;
            }
            socket.write_all(b"HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n").await.unwrap();
            let chunk = [b'a'; 32768];
            for _ in 0..288 {
                if socket.write_all(b"8000\r\n").await.is_err()
                    || socket.write_all(&chunk).await.is_err()
                    || socket.write_all(b"\r\n").await.is_err()
                {
                    return;
                }
            }
            let _ = socket.write_all(b"0\r\n\r\n").await;
        });
        let client = bun_browser_net::BunBrowserHttpClient::with_full_options(
            std::sync::Arc::new(bun_browser_net::CookieJar::new()),
            None,
            true,
        );
        assert!(
            BunBrowserTransport::new(client)
                .fetch_archive(&url)
                .await
                .err()
                .expect("archive byte bound")
                .contains("Response body exceeded 8388608 byte limit")
        );
        server.await.unwrap();
    }

    #[tokio::test]
    async fn rejected_domains_respect_report_limits_and_preserve_error_counts() {
        for (detail_limit, byte_limit, retained) in [(1, usize::MAX, 1), (10, 0, 0)] {
            let mut frontier = Frontier::memory(FrontierOptions::default()).unwrap();
            for path in ["a", "b", "c"] {
                frontier
                    .enqueue(
                        AddRequest::seed(format!("https://outside.test/{path}")),
                        now_ms(),
                    )
                    .unwrap();
            }
            let options = CrawlOptions {
                allowed_domains: vec!["allowed.test".into()],
                report_detail_limit: detail_limit,
                report_max_bytes: byte_limit,
                ..CrawlOptions::default()
            };
            let report = crawl_bounded(&mut frontier, &Fixture(HashMap::new()), &options)
                .await
                .unwrap();
            assert_eq!(report.attempts, 3);
            assert_eq!(report.error_count, 3);
            assert_eq!(report.errors.len(), retained);
            assert_eq!(report.errors_dropped, 3 - retained);
            assert_eq!(report.frontier.failed, 3);
            for (_, error) in &report.errors {
                assert_eq!(error, "URL is outside allowed_domains");
            }
            if byte_limit == 0 {
                assert_eq!(report.report_bytes_retained, 0);
            }
        }
    }

    #[tokio::test]
    async fn page_details_can_be_disabled_without_losing_corpus_or_progress() {
        let mut frontier = Frontier::memory(FrontierOptions::default()).unwrap();
        frontier
            .enqueue(AddRequest::seed("https://example.test/"), now_ms())
            .unwrap();
        let fixture = Fixture(HashMap::from([("https://example.test/".into(), "<main><h1>Fixture</h1><p>A useful fixture paragraph retained in the corpus.</p></main>".into())]));
        let options = CrawlOptions {
            report_detail_limit: 0,
            max_requests: 1,
            ..CrawlOptions::default()
        };
        let report = crawl_bounded(&mut frontier, &fixture, &options)
            .await
            .unwrap();
        assert!(report.pages.is_empty());
        assert_eq!(report.pages_processed, 1);
        assert_eq!(report.page_details_dropped, 1);
        assert!(frontier.page("https://example.test/").unwrap().is_some());
        let mut aggregate = CrawlReport::default();
        for _ in 0..100 {
            aggregate.retain_error(
                "https://fixture.test/".into(),
                "fixture error".into(),
                &CrawlOptions::default(),
            );
        }
        assert_eq!(aggregate.error_count, 100);
        assert_eq!(aggregate.errors.len(), 32);
        assert_eq!(aggregate.errors_dropped, 68);
    }

    #[tokio::test]
    async fn sitemap_budget_keeps_nested_work_in_the_persistent_frontier() {
        let mut frontier = Frontier::memory(FrontierOptions::default()).unwrap();
        frontier
            .enqueue(AddRequest::seed("https://example.test/"), now_ms())
            .unwrap();
        let pages = HashMap::from([
            ("https://example.test/robots.txt".into(), "Sitemap: /sitemap.xml".into()),
            ("https://example.test/sitemap.xml".into(), "<sitemapindex><sitemap><loc>/a.xml</loc></sitemap><sitemap><loc>/b.xml</loc></sitemap><sitemap><loc>/c.xml</loc></sitemap></sitemapindex>".into()),
            ("https://example.test/a.xml".into(), "<urlset><url><loc>/leaf-a</loc></url></urlset>".into()),
        ]);
        let options = CrawlOptions {
            ingest_sitemaps: true,
            max_sitemaps: 1,
            max_requests: 0,
            allowed_domains: vec!["example.test".into()],
            ..CrawlOptions::default()
        };
        let first = crawl_bounded(&mut frontier, &Fixture(pages.clone()), &options)
            .await
            .unwrap();
        assert_eq!(first.sitemaps_fetched, 1);
        assert_eq!(first.sitemaps_pending, 3);
        assert!(first.sitemap_budget_exhausted);
        let second = crawl_bounded(&mut frontier, &Fixture(pages), &options)
            .await
            .unwrap();
        assert_eq!(second.sitemaps_fetched, 1);
        assert_eq!(second.sitemaps_pending, 2);
        assert!(
            frontier
                .known_urls()
                .unwrap()
                .contains("https://example.test/leaf-a")
        );
    }

    #[tokio::test]
    async fn daemon_crawl_terminates_at_max_iterations_and_accumulates_results() {
        let mut frontier = Frontier::memory(FrontierOptions::default()).unwrap();
        frontier
            .enqueue(AddRequest::seed("https://daemon.test/"), now_ms())
            .unwrap();
        let pages = HashMap::from([(
            "https://daemon.test/".into(),
            "<main><h1>Daemon Home</h1><p>Daemon content is long enough to extract.</p></main>"
                .into(),
        )]);
        let options = CrawlDaemonOptions {
            base: CrawlOptions {
                allowed_domains: vec!["daemon.test".into()],
                ..CrawlOptions::default()
            },
            max_iterations: Some(2),
            idle_poll_ms: 10,
            maintenance_interval_ms: 100,
        };
        let report = crawl_daemon(&mut frontier, &Fixture(pages), &options, None)
            .await
            .unwrap();
        assert_eq!(report.pages.len(), 1);
        assert_eq!(report.frontier.done, 1);
    }
}
