// SPDX-License-Identifier: Apache-2.0
//! Bounded archive index acquisition; capture bodies are never downloaded here.

use rusqlite::{Connection, OptionalExtension, params};
use url::Url;

use crate::CrawlTransport;

const MAX_PAGE_BYTES: usize = 8 * 1024 * 1024;
const MAX_ROWS: usize = 10_000;

#[derive(Clone, Copy, Debug)]
pub enum CdxMatch {
    Exact,
    Prefix,
    Host,
    Domain,
}

impl CdxMatch {
    fn parameter(self) -> &'static str {
        match self {
            Self::Exact => "exact",
            Self::Prefix => "prefix",
            Self::Host => "host",
            Self::Domain => "domain",
        }
    }
}

#[derive(Debug, Default)]
pub struct ArchiveReport {
    pub pages: usize,
    pub inserted: usize,
    pub complete: bool,
}

fn endpoint(raw: &str) -> Result<Url, String> {
    let url = Url::parse(raw).map_err(|_| "Invalid archive endpoint")?;
    if !matches!(url.scheme(), "http" | "https")
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err("Archive endpoint must use HTTP(S) without credentials".into());
    }
    Ok(url)
}

fn initialize(db: &Connection) -> Result<(), String> {
    let timeout = std::time::Duration::from_secs(5);
    let started = std::time::Instant::now();
    let journal_mode = loop {
        db.busy_timeout(timeout.saturating_sub(started.elapsed()))
            .map_err(|error| error.to_string())?;
        match db.execute_batch("PRAGMA journal_mode=WAL;") {
            Err(error)
                if error.sqlite_error_code() == Some(rusqlite::ErrorCode::DatabaseBusy)
                    && started.elapsed() < timeout =>
            {
                // A WAL promotion can bypass the busy handler to release its read lock.
                std::thread::yield_now();
            }
            result => break result,
        }
    };
    db.busy_timeout(timeout)
        .map_err(|error| error.to_string())?;
    journal_mode.map_err(|error| error.to_string())?;
    db.execute_batch(
        "CREATE TABLE IF NOT EXISTS archive_captures(
      query_key TEXT NOT NULL, urlkey TEXT NOT NULL, timestamp TEXT NOT NULL,
      original TEXT NOT NULL, mimetype TEXT NOT NULL, statuscode TEXT NOT NULL,
      digest TEXT NOT NULL, length TEXT NOT NULL,
      PRIMARY KEY(query_key,urlkey,timestamp,original,digest));
      CREATE TABLE IF NOT EXISTS archive_checkpoints(
      query_key TEXT PRIMARY KEY, cursor TEXT, complete INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS archive_items(
      query_key TEXT NOT NULL,identifier TEXT NOT NULL,metadata TEXT NOT NULL,
      PRIMARY KEY(query_key,identifier));
      CREATE TABLE IF NOT EXISTS archive_cursors(
      query_key TEXT NOT NULL,cursor TEXT NOT NULL,PRIMARY KEY(query_key,cursor));",
    )
    .map_err(|error| error.to_string())
}

fn record_cursor(
    transaction: &rusqlite::Transaction<'_>,
    key: &str,
    next: Option<&str>,
) -> Result<(), String> {
    if let Some(next) = next {
        let inserted = transaction
            .execute(
                "INSERT OR IGNORE INTO archive_cursors VALUES (?1,?2)",
                params![key, next],
            )
            .map_err(|error| error.to_string())?;
        if inserted == 0 {
            return Err("Archive continuation repeats a committed cursor".into());
        }
    }
    Ok(())
}

/// Commit each CDX page and its continuation together in the caller's SQLite store.
/// Repeating a failed page is idempotent; page limits bound each invocation.
pub async fn index_wayback<T: CrawlTransport>(
    transport: &T,
    db: &mut Connection,
    endpoint_url: &str,
    seed: &str,
    scope: CdxMatch,
    page_size: usize,
    max_pages: usize,
) -> Result<ArchiveReport, String> {
    if seed.is_empty()
        || seed.len() > 4096
        || !(1..=MAX_ROWS).contains(&page_size)
        || !(1..=1000).contains(&max_pages)
    {
        return Err("Invalid archive seed or page bounds".into());
    }
    let seed_url = if seed.contains("://") {
        endpoint(seed)?
    } else {
        endpoint(&format!(
            "https://{}",
            seed.strip_prefix("*.").unwrap_or(seed)
        ))?
    };
    if seed_url
        .host_str()
        .is_none_or(|host| host.is_empty() || host.contains('*'))
    {
        return Err("Invalid archive seed host".into());
    }
    if let Some(url::Host::Domain(host)) = seed_url.host()
        && (host.len() > 253
            || !host
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'-' | b'_')))
    {
        return Err("Invalid archive seed domain".into());
    }
    let mut query = endpoint(endpoint_url)?;
    query
        .query_pairs_mut()
        .clear()
        .append_pair("url", seed)
        .append_pair("matchType", scope.parameter())
        .append_pair("limit", &page_size.to_string())
        .append_pair(
            "fl",
            "urlkey,timestamp,original,mimetype,statuscode,digest,length",
        )
        .append_pair("showResumeKey", "true")
        .append_pair("filter", "original:https?://.*")
        .append_pair("gzip", "false");
    let key = blake3::hash(query.as_str().as_bytes()).to_hex().to_string();
    initialize(db)?;
    let checkpoint: Option<(Option<String>, bool)> = db
        .query_row(
            "SELECT cursor,complete FROM archive_checkpoints WHERE query_key=?1",
            [&key],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    let mut report = ArchiveReport::default();
    let mut cursor = checkpoint.as_ref().and_then(|value| value.0.clone());
    if checkpoint.is_some_and(|value| value.1) {
        report.complete = true;
        return Ok(report);
    }
    for _ in 0..max_pages {
        let mut page_url = query.clone();
        if let Some(value) = &cursor {
            // CDXQuery reads the form parameter, then CDXServer decodes its encoded token.
            page_url.query_pairs_mut().append_pair("resumeKey", value);
        }
        let response = transport.fetch_archive(&page_url).await?;
        if response.status != 200 || response.body.len() > MAX_PAGE_BYTES {
            return Err("CDX page failed or exceeded its byte bound".into());
        }
        let transaction = db.transaction().map_err(|error| error.to_string())?;
        let mut inserted = 0;
        let mut rows = 0;
        let mut next = None;
        let mut separator = false;
        for line in response.body.lines() {
            if line.trim().is_empty() {
                separator = true;
                continue;
            }
            if next.is_some() {
                return Err("Unexpected data after CDX continuation".into());
            }
            let fields: Vec<_> = line.split_ascii_whitespace().take(8).collect();
            if separator && fields.len() == 1 {
                if line.len() > 16_384 {
                    return Err("CDX continuation exceeds its bound".into());
                }
                next = Some(line.trim().to_owned());
                continue;
            }
            if separator
                || fields.len() != 7
                || fields[1].len() != 14
                || !fields[1].bytes().all(|byte| byte.is_ascii_digit())
            {
                return Err("Malformed CDX record".into());
            }
            rows += 1;
            if rows > page_size {
                return Err("CDX page exceeds its row bound".into());
            }
            let original = endpoint(fields[2])?;
            inserted += transaction
                .execute(
                    "INSERT OR IGNORE INTO archive_captures VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
                    params![
                        key,
                        fields[0],
                        fields[1],
                        original.as_str(),
                        fields[3],
                        fields[4],
                        fields[5],
                        fields[6]
                    ],
                )
                .map_err(|error| error.to_string())?;
        }
        if next.is_some() && next == cursor {
            return Err("CDX continuation did not advance".into());
        }
        let complete = next.is_none();
        record_cursor(&transaction, &key, next.as_deref())?;
        transaction.execute(
            "INSERT INTO archive_checkpoints VALUES (?1,?2,?3) ON CONFLICT(query_key) DO UPDATE SET cursor=excluded.cursor,complete=excluded.complete",
            params![key, next, complete],
        ).map_err(|error| error.to_string())?;
        transaction.commit().map_err(|error| error.to_string())?;
        report.pages += 1;
        report.inserted += inserted;
        report.complete = complete;
        cursor = next;
        if complete {
            break;
        }
    }
    Ok(report)
}

#[derive(Clone, Copy, Debug)]
pub enum ArchiveMediaType {
    Image,
    Movies,
}

/// Construct an explicit bounded metadata query; no item files are acquired.
pub fn media_search_url(
    endpoint_url: &str,
    query: &str,
    media_type: ArchiveMediaType,
    page: u32,
    rows: usize,
) -> Result<Url, String> {
    if query.is_empty() || query.len() > 4096 || page == 0 || !(1..=1000).contains(&rows) {
        return Err("Invalid archive media query bounds".into());
    }
    let media = match media_type {
        ArchiveMediaType::Image => "image",
        ArchiveMediaType::Movies => "movies",
    };
    let mut url = endpoint(endpoint_url)?;
    url.query_pairs_mut()
        .clear()
        .append_pair("q", &format!("({query}) AND mediatype:{media}"))
        .append_pair("output", "json")
        .append_pair("rows", &rows.to_string())
        .append_pair("page", &page.to_string())
        .append_pair("sort[]", "identifier asc")
        .append_pair("fl[]", "identifier")
        .append_pair("fl[]", "title")
        .append_pair("fl[]", "mediatype");
    Ok(url)
}

pub async fn search_media<T: CrawlTransport>(
    transport: &T,
    endpoint_url: &str,
    query: &str,
    media_type: ArchiveMediaType,
    page: u32,
    rows: usize,
) -> Result<serde_json::Value, String> {
    let url = media_search_url(endpoint_url, query, media_type, page, rows)?;
    let response = transport.fetch_archive(&url).await?;
    if response.status != 200 || response.body.len() > MAX_PAGE_BYTES {
        return Err("Archive media page failed or exceeded its byte bound".into());
    }
    let value: serde_json::Value =
        serde_json::from_str(&response.body).map_err(|_| "Malformed archive media response")?;
    let docs = value
        .get("response")
        .and_then(|response| response.get("docs"))
        .and_then(serde_json::Value::as_array)
        .ok_or("Archive media response has no document array")?;
    let expected = match media_type {
        ArchiveMediaType::Image => "image",
        ArchiveMediaType::Movies => "movies",
    };
    if docs.len() > rows
        || docs.iter().any(|doc| {
            doc.get("identifier")
                .and_then(serde_json::Value::as_str)
                .is_none_or(|identifier| identifier.is_empty() || identifier.len() > 4096)
                || doc.get("mediatype").and_then(serde_json::Value::as_str) != Some(expected)
        })
    {
        return Err("Archive media response violates requested bounds or mediatype".into());
    }
    Ok(value)
}

/// IA's cursor endpoint avoids Advanced Search's 10,000-result sorted-page ceiling.
pub async fn index_media<T: CrawlTransport>(
    transport: &T,
    db: &mut Connection,
    endpoint_url: &str,
    search: &str,
    media_type: ArchiveMediaType,
    page_size: usize,
    max_pages: usize,
) -> Result<ArchiveReport, String> {
    if search.is_empty()
        || search.len() > 4096
        || !(100..=MAX_ROWS).contains(&page_size)
        || !(1..=1000).contains(&max_pages)
    {
        return Err("Invalid archive media cursor bounds".into());
    }
    let media = match media_type {
        ArchiveMediaType::Image => "image",
        ArchiveMediaType::Movies => "movies",
    };
    let mut query = endpoint(endpoint_url)?;
    query
        .query_pairs_mut()
        .clear()
        .append_pair("q", &format!("({search}) AND mediatype:{media}"))
        .append_pair("count", &page_size.to_string())
        .append_pair("fields", "identifier,title,mediatype")
        .append_pair("sorts", "identifier");
    let key = blake3::hash(query.as_str().as_bytes()).to_hex().to_string();
    initialize(db)?;
    let checkpoint: Option<(Option<String>, bool)> = db
        .query_row(
            "SELECT cursor,complete FROM archive_checkpoints WHERE query_key=?1",
            [&key],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    let mut cursor = checkpoint.as_ref().and_then(|value| value.0.clone());
    let mut report = ArchiveReport::default();
    if checkpoint.is_some_and(|value| value.1) {
        report.complete = true;
        return Ok(report);
    }
    for _ in 0..max_pages {
        let mut page_url = query.clone();
        if let Some(value) = &cursor {
            page_url.query_pairs_mut().append_pair("cursor", value);
        }
        let response = transport.fetch_archive(&page_url).await?;
        if response.status != 200 || response.body.len() > MAX_PAGE_BYTES {
            return Err("Archive cursor page failed or exceeded its byte bound".into());
        }
        let value: serde_json::Value = serde_json::from_str(&response.body)
            .map_err(|_| "Malformed archive cursor response")?;
        let items = value
            .get("items")
            .and_then(serde_json::Value::as_array)
            .ok_or("Archive cursor response has no items")?;
        if items.len() > page_size {
            return Err("Archive cursor response exceeds its row bound".into());
        }
        let next = match value.get("cursor") {
            None | Some(serde_json::Value::Null) => None,
            Some(serde_json::Value::String(next)) if !next.is_empty() && next.len() <= 16_384 => {
                Some(next.clone())
            }
            _ => return Err("Invalid archive continuation".into()),
        };
        if next.is_some() && (next == cursor || items.is_empty()) {
            return Err("Archive continuation did not advance".into());
        }
        let transaction = db.transaction().map_err(|error| error.to_string())?;
        let mut inserted = 0;
        for item in items {
            let identifier = item
                .get("identifier")
                .and_then(serde_json::Value::as_str)
                .filter(|identifier| !identifier.is_empty() && identifier.len() <= 4096)
                .ok_or("Invalid archive item identifier")?;
            if item.get("mediatype").and_then(serde_json::Value::as_str) != Some(media) {
                return Err("Archive item does not match requested mediatype".into());
            }
            let metadata = serde_json::json!({"identifier": identifier, "title": item.get("title"), "mediatype": media});
            inserted += transaction
                .execute(
                    "INSERT OR IGNORE INTO archive_items VALUES (?1,?2,?3)",
                    params![key, identifier, metadata.to_string()],
                )
                .map_err(|error| error.to_string())?;
        }
        let complete = next.is_none();
        record_cursor(&transaction, &key, next.as_deref())?;
        transaction.execute("INSERT INTO archive_checkpoints VALUES (?1,?2,?3) ON CONFLICT(query_key) DO UPDATE SET cursor=excluded.cursor,complete=excluded.complete", params![key, next, complete])
            .map_err(|error| error.to_string())?;
        transaction.commit().map_err(|error| error.to_string())?;
        report.pages += 1;
        report.inserted += inserted;
        report.complete = complete;
        cursor = next;
        if complete {
            break;
        }
    }
    Ok(report)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::FetchResult;
    use std::cell::RefCell;

    #[test]
    fn independent_processes_initialize_a_cold_archive() {
        use std::io::{BufRead, Read, Write};
        use std::process::{Command, Stdio};

        const CHILD_DATABASE: &str = "BUN_CRAWL_ARCHIVE_INITIALIZE_TEST_DATABASE";
        if let Some(path) = std::env::var_os(CHILD_DATABASE) {
            let db = Connection::open(path).unwrap();
            println!("archive-initialize-ready");
            std::io::stdout().flush().unwrap();
            std::io::stdin().read_exact(&mut [0]).unwrap();
            initialize(&db).unwrap();
            let mode: String = db
                .query_row("PRAGMA journal_mode", [], |row| row.get(0))
                .unwrap();
            assert_eq!(mode, "wal");
            let timeout: i64 = db
                .query_row("PRAGMA busy_timeout", [], |row| row.get(0))
                .unwrap();
            assert_eq!(timeout, 5000);
            return;
        }

        struct Fixture(std::path::PathBuf);
        impl Drop for Fixture {
            fn drop(&mut self) {
                let _ = std::fs::remove_dir_all(&self.0);
            }
        }
        struct Child(std::process::Child);
        impl Drop for Child {
            fn drop(&mut self) {
                let _ = self.0.kill();
                let _ = self.0.wait();
            }
        }
        let fixture = Fixture(std::env::temp_dir().join(format!(
            "bun-crawl-archive-initialize-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        )));
        std::fs::create_dir_all(&fixture.0).unwrap();
        for round in 0..8 {
            let path = fixture.0.join(format!("{round}.sqlite"));
            let mut children: Vec<_> = (0..4)
                .map(|_| {
                    let mut child = Child(
                        Command::new(std::env::current_exe().unwrap())
                            .args([
                                "--exact",
                                "archive::tests::independent_processes_initialize_a_cold_archive",
                                "--nocapture",
                            ])
                            .env(CHILD_DATABASE, &path)
                            .stdin(Stdio::piped())
                            .stdout(Stdio::piped())
                            .spawn()
                            .unwrap(),
                    );
                    let mut output = std::io::BufReader::new(child.0.stdout.take().unwrap());
                    loop {
                        let mut line = String::new();
                        assert_ne!(
                            output.read_line(&mut line).unwrap(),
                            0,
                            "child exited before the initialization barrier"
                        );
                        if line.trim() == "archive-initialize-ready" {
                            break;
                        }
                    }
                    (child, output)
                })
                .collect();
            for (child, _) in &mut children {
                child.0.stdin.take().unwrap().write_all(&[1]).unwrap();
            }
            for (mut child, mut output) in children {
                let mut log = String::new();
                output.read_to_string(&mut log).unwrap();
                assert!(child.0.wait().unwrap().success(), "{log}");
            }
            let db = Connection::open(path).unwrap();
            let tables: i64 = db
                .query_row(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name LIKE 'archive_%'",
                    [],
                    |row| row.get(0),
                )
                .unwrap();
            assert_eq!(tables, 4);
        }
    }

    struct Fixture {
        replies: RefCell<Vec<String>>,
        calls: RefCell<Vec<Url>>,
    }

    #[tokio::test]
    async fn media_cursor_commits_idempotently_and_resumes_between_invocations() {
        let transport = fixture(&[
            r#"{"items":[{"identifier":"first","title":"Fixture","mediatype":"image"}],"cursor":"next=opaque"}"#,
            r#"{"items":[{"identifier":"first","title":"Fixture","mediatype":"image"},{"identifier":"second","mediatype":"image"}]}"#,
        ]);
        let mut db = Connection::open_in_memory().unwrap();
        let first = index_media(
            &transport,
            &mut db,
            "https://archive.test/scrape",
            "collection:fixture",
            ArchiveMediaType::Image,
            100,
            1,
        )
        .await
        .unwrap();
        assert_eq!(first.inserted, 1);
        assert!(!first.complete);
        let second = index_media(
            &transport,
            &mut db,
            "https://archive.test/scrape",
            "collection:fixture",
            ArchiveMediaType::Image,
            100,
            1,
        )
        .await
        .unwrap();
        assert!(second.complete);
        assert_eq!(second.inserted, 1);
        assert_eq!(
            transport.calls.borrow()[1]
                .query_pairs()
                .find(|(key, _)| key == "cursor")
                .unwrap()
                .1,
            "next=opaque"
        );
        assert_eq!(
            db.query_row("SELECT COUNT(*) FROM archive_items", [], |row| row
                .get::<_, i64>(0))
                .unwrap(),
            2
        );
    }
    impl CrawlTransport for Fixture {
        async fn fetch(&self, url: &Url) -> Result<FetchResult, String> {
            self.calls.borrow_mut().push(url.clone());
            Ok(FetchResult {
                url: url.clone(),
                status: 200,
                content_type: None,
                body: self.replies.borrow_mut().remove(0),
            })
        }
    }
    fn fixture(replies: &[&str]) -> Fixture {
        Fixture {
            replies: RefCell::new(replies.iter().map(|value| (*value).to_owned()).collect()),
            calls: RefCell::new(Vec::new()),
        }
    }

    #[tokio::test]
    async fn resumes_committed_pages_without_collecting_the_index() {
        let transport = fixture(&[
            "test,example)/a 20260101000000 https://example.test/a text/html 200 HASH 12\n\nnext%2Bkey\n",
            "test,example)/b 20260102000000 https://example.test/b text/html 200 HASH2 14\n",
        ]);
        let mut db = Connection::open_in_memory().unwrap();
        let first = index_wayback(
            &transport,
            &mut db,
            "https://archive.test/cdx",
            "example.test",
            CdxMatch::Host,
            1,
            1,
        )
        .await
        .unwrap();
        assert_eq!(first.inserted, 1);
        assert!(!first.complete);
        let second = index_wayback(
            &transport,
            &mut db,
            "https://archive.test/cdx",
            "example.test",
            CdxMatch::Host,
            1,
            1,
        )
        .await
        .unwrap();
        assert!(second.complete);
        assert_eq!(
            transport.calls.borrow()[1]
                .query_pairs()
                .find(|(key, _)| key == "resumeKey")
                .unwrap()
                .1,
            "next%2Bkey"
        );
        let finished = index_wayback(
            &transport,
            &mut db,
            "https://archive.test/cdx",
            "example.test",
            CdxMatch::Host,
            1,
            1,
        )
        .await
        .unwrap();
        assert_eq!(finished.pages, 0);
        assert_eq!(
            db.query_row("SELECT COUNT(*) FROM archive_captures", [], |row| row
                .get::<_, i64>(0))
                .unwrap(),
            2
        );
    }

    #[tokio::test]
    async fn invalid_page_rolls_back_records_and_checkpoint() {
        let transport = fixture(&[
            "test,example)/a 20260101000000 https://example.test/a text/html 200 HASH 12\nmalformed\n",
        ]);
        let mut db = Connection::open_in_memory().unwrap();
        assert!(
            index_wayback(
                &transport,
                &mut db,
                "https://archive.test/cdx",
                "example.test",
                CdxMatch::Host,
                2,
                1
            )
            .await
            .is_err()
        );
        assert_eq!(
            db.query_row("SELECT COUNT(*) FROM archive_captures", [], |row| row
                .get::<_, i64>(0))
                .unwrap(),
            0
        );
        assert_eq!(
            db.query_row("SELECT COUNT(*) FROM archive_checkpoints", [], |row| row
                .get::<_, i64>(0))
                .unwrap(),
            0
        );
    }

    #[tokio::test]
    async fn documented_cdx_cursor_survives_form_and_server_decoding_after_resume() {
        let cursor = "org%2Carchive%29%2F+19980109140106%21";
        let page = format!(
            "org,archive)/ 19980109140106 http://archive.org:80/ text/html 200 HASH 1402\n\n{cursor}\n"
        );
        let transport = fixture(&[&page, ""]);
        let mut db = Connection::open_in_memory().unwrap();
        index_wayback(
            &transport,
            &mut db,
            "https://archive.test/cdx",
            "archive.org",
            CdxMatch::Host,
            1,
            1,
        )
        .await
        .unwrap();
        assert_eq!(
            db.query_row("SELECT cursor FROM archive_checkpoints", [], |row| row
                .get::<_, String>(
                0
            ))
            .unwrap(),
            cursor
        );
        index_wayback(
            &transport,
            &mut db,
            "https://archive.test/cdx",
            "archive.org",
            CdxMatch::Host,
            1,
            1,
        )
        .await
        .unwrap();
        let calls = transport.calls.borrow();
        let servlet_parameter = calls[1]
            .query_pairs()
            .find(|(key, _)| key == "resumeKey")
            .unwrap()
            .1;
        assert_eq!(servlet_parameter, cursor);
        let server_input = format!("resumeKey={servlet_parameter}");
        let decoded = url::form_urlencoded::parse(server_input.as_bytes())
            .next()
            .unwrap()
            .1;
        assert_eq!(decoded, "org,archive)/ 19980109140106!");
        assert_eq!(
            calls[0]
                .query_pairs()
                .find(|(key, _)| key == "matchType")
                .unwrap()
                .1,
            "host"
        );
        assert_eq!(
            calls[1]
                .query_pairs()
                .find(|(key, _)| key == "matchType")
                .unwrap()
                .1,
            "host"
        );
    }

    #[tokio::test]
    async fn different_cdx_scopes_do_not_share_a_checkpoint() {
        let transport = fixture(&[
            "test,example)/a 20260101000000 https://example.test/a text/html 200 HASH 12\n\nA\n",
            "test,example)/b 20260102000000 https://example.test/b text/html 200 HASH 12\n",
        ]);
        let mut db = Connection::open_in_memory().unwrap();
        index_wayback(
            &transport,
            &mut db,
            "https://archive.test/cdx",
            "example.test",
            CdxMatch::Host,
            1,
            1,
        )
        .await
        .unwrap();
        index_wayback(
            &transport,
            &mut db,
            "https://archive.test/cdx",
            "example.test",
            CdxMatch::Prefix,
            1,
            1,
        )
        .await
        .unwrap();
        assert!(
            !transport.calls.borrow()[1]
                .query_pairs()
                .any(|(key, _)| key == "resumeKey")
        );
        assert_eq!(
            db.query_row("SELECT COUNT(*) FROM archive_checkpoints", [], |row| row
                .get::<_, i64>(0))
                .unwrap(),
            2
        );
    }

    #[tokio::test]
    async fn cursor_cycles_across_invocations_do_not_commit_the_failed_page() {
        let transport = fixture(&[
            "test,example)/a 20260101000000 https://example.test/a text/html 200 HASH 12\n\nA\n",
            "test,example)/b 20260102000000 https://example.test/b text/html 200 HASH 12\n\nB\n",
            "test,example)/c 20260103000000 https://example.test/c text/html 200 HASH 12\n\nA\n",
        ]);
        let mut db = Connection::open_in_memory().unwrap();
        for _ in 0..2 {
            index_wayback(
                &transport,
                &mut db,
                "https://archive.test/cdx",
                "example.test",
                CdxMatch::Host,
                1,
                1,
            )
            .await
            .unwrap();
        }
        assert!(
            index_wayback(
                &transport,
                &mut db,
                "https://archive.test/cdx",
                "example.test",
                CdxMatch::Host,
                1,
                1
            )
            .await
            .unwrap_err()
            .contains("repeats a committed cursor")
        );
        assert_eq!(
            db.query_row("SELECT COUNT(*) FROM archive_captures", [], |row| row
                .get::<_, i64>(0))
                .unwrap(),
            2
        );
        assert_eq!(
            db.query_row("SELECT cursor FROM archive_checkpoints", [], |row| row
                .get::<_, String>(
                0
            ))
            .unwrap(),
            "B"
        );
    }

    #[tokio::test]
    async fn media_queries_preserve_query_and_enforce_requested_type() {
        let transport = fixture(&[
            r#"{"response":{"docs":[{"identifier":"fixture","title":"Fixture","mediatype":"movies"}]}}"#,
        ]);
        let result = search_media(
            &transport,
            "https://archive.test/advancedsearch.php",
            "title:fixture",
            ArchiveMediaType::Movies,
            2,
            1,
        )
        .await
        .unwrap();
        assert_eq!(result["response"]["docs"][0]["identifier"], "fixture");
        assert_eq!(
            transport.calls.borrow()[0]
                .query_pairs()
                .find(|(key, _)| key == "q")
                .unwrap()
                .1,
            "(title:fixture) AND mediatype:movies"
        );
        assert!(
            media_search_url(
                "https://user:secret@archive.test/search",
                "fixture",
                ArchiveMediaType::Image,
                1,
                10
            )
            .is_err()
        );
    }
}
