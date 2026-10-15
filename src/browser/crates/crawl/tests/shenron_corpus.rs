// SPDX-License-Identifier: Apache-2.0
//! Private retained Shenron HTML stays outside this repository. No network transport is used.

use std::{
    cell::RefCell,
    collections::{HashMap, HashSet},
    fmt::Write,
    path::PathBuf,
};

use bun_browser_crawl::{
    AddRequest, CrawlOptions, CrawlTransport, FetchResult, Frontier, FrontierOptions,
    crawl_bounded, extract_links_opts,
};
use bun_browser_crawl::dragon_ball::{
    Catalogue, DragonBallDocument, parse_collection, parse_miscellaneous, project_document,
    validate_source_url,
};
use bun_browser_extract::{extract_main, html_to_markdown, simhash64};
use bun_browser_index::{Index, IndexParams};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use url::Url;

struct RetainedPages {
    pages: HashMap<String, String>,
    fetched: RefCell<Vec<String>>,
}

impl CrawlTransport for RetainedPages {
    async fn fetch(&self, url: &Url) -> Result<FetchResult, String> {
        let body = self
            .pages
            .get(url.as_str())
            .ok_or("URL has no retained snapshot")?;
        self.fetched.borrow_mut().push(url.to_string());
        Ok(FetchResult {
            url: url.clone(),
            status: 200,
            content_type: Some("text/html; charset=utf-8".into()),
            body: body.clone(),
        })
    }
}

fn fingerprint_vector(text: &str) -> Vec<f32> {
    let fingerprint = simhash64(text);
    (0..64)
        .map(|bit| {
            if fingerprint & (1_u64 << bit) == 0 {
                -1.0
            } else {
                1.0
            }
        })
        .collect()
}

fn markdown_checksum(markdown: &str) -> String {
    let mut output = String::with_capacity(64);
    for byte in Sha256::digest(markdown.as_bytes()) {
        write!(&mut output, "{byte:02x}").unwrap();
    }
    output
}

struct ScratchDirectory(PathBuf);

impl ScratchDirectory {
    fn new() -> Self {
        static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let path = std::env::temp_dir().join(format!(
            "bun-shenron-browser-{}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos(),
            NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        ));
        std::fs::create_dir(&path).unwrap();
        Self(path)
    }
}

impl Drop for ScratchDirectory {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn assert_fingerprint_index(vectors: &[(u64, Vec<f32>)]) {
    assert!(vectors.len() >= 2);
    let scratch = ScratchDirectory::new();
    let path = scratch.0.join("fingerprints.index");
    let index = Index::new(IndexParams::new(64)).unwrap();
    for (key, vector) in vectors {
        index.add(*key, vector).unwrap();
    }
    index.save(&path).unwrap();
    drop(index);
    let index = Index::load(&path).unwrap();
    assert_eq!(index.len(), vectors.len());
    for (_, query) in vectors {
        let hits = index.search(query, 1, None).unwrap();
        assert_eq!(hits.len(), 1);
        let (_, matched) = vectors.iter().find(|(key, _)| *key == hits[0].0).unwrap();
        assert!(
            matched == query,
            "persisted index retrieves matching content fingerprint"
        );
        assert!((hits[0].1 - 1.0).abs() < 0.00001);
    }
}

#[tokio::test]
#[ignore = "requires private retained HTML: set SHENRON_BROWSER_CORPUS to Shenron data/catalogues and run --ignored"]
async fn retained_shenron_sources_extract_crawl_and_index_offline() {
    let root = PathBuf::from(
        std::env::var_os("SHENRON_BROWSER_CORPUS").expect(
            "SHENRON_BROWSER_CORPUS must point to the private Shenron data/catalogues directory",
        ),
    );
    let catalogue: Catalogue = serde_json::from_slice(
        &std::fs::read(root.join("dragonballcn.json")).expect("read private source catalogue"),
    )
    .expect("decode canonical Shenron catalogue schema");
    assert!(!catalogue.source.is_empty());
    assert!(!catalogue.fetched_at.is_empty());
    assert!(
        catalogue.collections.len() >= 2,
        "need multiple retained source pages"
    );
    assert!(
        catalogue.collections.len() <= 32,
        "private fixture must remain bounded"
    );

    let mut pages = HashMap::new();
    let mut expected = HashMap::new();
    for collection in &catalogue.collections {
        assert!(!collection.slug.is_empty());
        assert!(
            collection
                .slug
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_')
        );
        let url = Url::parse(&collection.url).expect("catalogue source URL");
        assert_eq!(url.scheme(), "https");
        assert_eq!(url.host_str(), Some("comic.dragonballcn.com"));
        let path = root.join("pages").join(format!("{}.html", collection.slug));
        assert!(
            std::fs::metadata(&path).expect("retained source page").len() <= 2 * 1024 * 1024
        );
        let html = std::fs::read_to_string(path).expect("read retained UTF-8 HTML");
        let dom = bun_browser_dom::parse_html(&html);
        assert!(!dom.query_selector_all("a[href]").unwrap().is_empty());
        let extracted = extract_main(&html, Some(url.as_str()));
        assert!(!extracted.title.trim().is_empty());
        assert!(!extracted.text.trim().is_empty());
        assert!(!extracted.markdown.trim().is_empty());

        let actual_books: HashSet<String> = if collection.slug == "divers" {
            parse_miscellaneous(&html, &url).into_keys().collect()
        } else {
            let parsed = parse_collection(&html, &collection.slug, &url);
            assert!(
                parsed.source_title == collection.source_title,
                "retained source title matches inventory"
            );
            parsed.publications.into_iter().map(|book| book.did).collect()
        };
        let expected_books: HashSet<String> = collection
            .publications
            .iter()
            .map(|book| book.did.clone())
            .collect();
        assert!(!expected_books.is_empty());
        if collection.slug == "divers" {
            // The retained source has 47 entries absent from the dated inventory.
            assert!(expected_books.is_subset(&actual_books));
            assert_eq!(actual_books.len() - expected_books.len(), 47);
        } else {
            assert!(
                actual_books == expected_books,
                "retained publication identities differ for {} (actual {}, inventory {})",
                collection.slug,
                actual_books.len(),
                expected_books.len()
            );
        }

        let links = extract_links_opts(&html, &url, true);
        let linked: HashSet<&str> = links.iter().map(|(url, _)| url.as_str()).collect();
        assert_eq!(linked.len(), links.len(), "canonical links are deduplicated");
        for book in &collection.publications {
            assert!(
                linked.contains(book.url.as_str()),
                "inventory publication has a resolved source link"
            );
        }
        assert!(expected.insert(url.to_string(), extracted).is_none());
        assert!(pages.insert(url.to_string(), html).is_none());
    }

    let allowed_urls: HashSet<String> = pages.keys().cloned().collect();
    let seed = catalogue
        .collections
        .iter()
        .map(|collection| {
            let url = Url::parse(&collection.url).unwrap();
            let retained_links = extract_links_opts(&pages[&collection.url], &url, true)
                .into_iter()
                .filter(|(link, _)| link != &url && allowed_urls.contains(link.as_str()))
                .count();
            (collection.url.clone(), retained_links)
        })
        .max_by_key(|(_, count)| *count)
        .unwrap();
    assert!(
        seed.1 > 0,
        "retained corpus must contain links between source snapshots"
    );
    let transport = RetainedPages {
        pages,
        fetched: RefCell::new(Vec::new()),
    };
    let scratch = ScratchDirectory::new();
    let frontier_path = scratch.0.join("frontier.sqlite");
    let frontier_options = FrontierOptions {
        near_duplicate_bits: 0,
        ..FrontierOptions::default()
    };
    let mut frontier = Frontier::open(&frontier_path, frontier_options.clone(), 0).unwrap();
    frontier.enqueue(AddRequest::seed(&seed.0), 0).unwrap();
    let allowed_pattern = format!(
        "^(?:{})$",
        catalogue
            .collections
            .iter()
            .map(|collection| regex::escape(&collection.url))
            .collect::<Vec<_>>()
            .join("|")
    );
    let mut options = CrawlOptions {
        max_requests: catalogue.collections.len(),
        max_concurrency: 2,
        max_depth: 1,
        allowed_domains: vec!["comic.dragonballcn.com".into()],
        include_url_regex: vec![allowed_pattern],
        obey_robots: false,
        ingest_sitemaps: false,
        ..CrawlOptions::default()
    };
    options.max_requests = 1;
    let mut first = crawl_bounded(&mut frontier, &transport, &options)
        .await
        .unwrap();
    assert_eq!(first.attempts, 1);
    assert_eq!(first.error_count, 0);
    assert_eq!(first.pages[0].discovered_links, seed.1);
    assert_eq!(first.frontier.pending, seed.1 as u64);
    drop(frontier);
    let mut frontier = Frontier::open(&frontier_path, frontier_options, 0).unwrap();
    for collection in &catalogue.collections {
        frontier
            .enqueue(AddRequest::seed(&collection.url), 0)
            .unwrap();
    }
    options.max_requests = catalogue.collections.len();
    let mut report = crawl_bounded(&mut frontier, &transport, &options)
        .await
        .unwrap();
    assert_eq!(report.error_count, 0);
    assert_eq!(report.attempts + first.attempts, expected.len());
    assert_eq!(report.frontier.done, expected.len() as u64);
    assert_eq!(report.frontier.pending, 0);
    assert_eq!(report.frontier.locked, 0);
    assert_eq!(report.frontier.failed, 0);
    assert_eq!(
        transport.fetched.borrow().iter().cloned().collect::<HashSet<_>>(),
        allowed_urls
    );
    first.pages.append(&mut report.pages);

    // This qualifies fingerprint indexing, not semantic embedding relevance.
    let mut vectors = Vec::new();
    for (key, page) in first.pages.iter().enumerate() {
        let extracted = &expected[page.url.as_str()];
        assert!(
            page.extracted.title == extracted.title,
            "crawl preserves extracted source title"
        );
        assert!(
            page.extracted.markdown == extracted.markdown,
            "crawl preserves extracted source markdown"
        );
        if !page.duplicate {
            assert!(
                frontier.page(page.url.as_str()).unwrap()
                    == Some((extracted.title.clone(), extracted.markdown.clone())),
                "frontier retains exact source extraction"
            );
            let vector = fingerprint_vector(&extracted.text);
            vectors.push((key as u64, vector));
        }
    }
    assert_fingerprint_index(&vectors);
}

#[derive(Deserialize)]
struct NativeCapture {
    raw_html: String,
    document: DragonBallDocument,
}

#[tokio::test]
#[ignore = "requires private native captures: set SHENRON_BROWSER_CAPTURES to captures directory and run --ignored"]
async fn retained_native_captures_preserve_provenance_and_browser_content() {
    let root = PathBuf::from(
        std::env::var_os("SHENRON_BROWSER_CAPTURES")
            .expect("SHENRON_BROWSER_CAPTURES must point to private native captures directory"),
    );
    let mut directories = vec![(root, 0)];
    let mut files = Vec::new();
    while let Some((directory, depth)) = directories.pop() {
        for entry in std::fs::read_dir(directory).expect("read private capture directory") {
            let entry = entry.unwrap();
            let kind = entry.file_type().unwrap();
            assert!(
                !kind.is_symlink(),
                "private test captures must not contain symlinks"
            );
            if kind.is_dir() {
                assert!(depth < 3, "capture traversal remains bounded");
                directories.push((entry.path(), depth + 1));
            } else if entry
                .path()
                .extension()
                .is_some_and(|extension| extension == "json")
            {
                files.push(entry.path());
                assert!(files.len() <= 32, "capture fixture remains bounded");
            }
        }
    }
    files.sort();
    assert_eq!(files.len(), 17, "qualified official capture inventory");
    let mut pages = HashMap::new();
    let mut expected = HashMap::new();
    let mut hosts = HashSet::new();
    let mut retained_links = 0;
    let directory_urls: HashSet<String> = [
        "https://dragon-ball-official.com/",
        "https://en.dragon-ball-official.com/",
        "https://fr.dragon-ball-official.com/",
        "https://de.dragon-ball-official.com/",
        "https://es.dragon-ball-official.com/",
    ]
    .into_iter()
    .map(str::to_owned)
    .collect();
    let mut directories_seen = HashSet::new();
    let mut prose_pages = 0;
    for path in files {
        assert!(std::fs::metadata(&path).unwrap().len() <= 2 * 1024 * 1024);
        let capture: NativeCapture = serde_json::from_slice(&std::fs::read(path).unwrap())
            .expect("native capture schema");
        let document = capture.document;
        let url = validate_source_url(&document.canonical_url).expect("native source URL");
        assert!(url.fragment().is_none());
        assert_eq!(document.http_status, 200);
        assert!(
            url.host_str() == Some(document.source_domain.as_str()),
            "source provenance matches URL host"
        );
        assert!(!document.crawl_id.is_empty());
        assert!(!document.category.is_empty());
        assert!(document.provenance.is_object());
        chrono::DateTime::parse_from_rfc3339(&document.timestamp_utc)
            .expect("capture timestamp provenance");
        let expected_hash = markdown_checksum(&document.payload.body_markdown);
        assert!(
            expected_hash == document.raw_checksum,
            "native checksum authenticates retained Markdown"
        );
        let projected = project_document(
            &url,
            document.http_status,
            &capture.raw_html,
            &document.payload.body_markdown,
            &document.provenance,
            &document.timestamp_utc,
        )
        .unwrap();
        assert!(
            projected.document_uid == document.document_uid,
            "canonical document identity is reproducible"
        );
        assert!(
            projected.payload.title_raw == document.payload.title_raw,
            "source title projection is reproducible"
        );
        let dom = bun_browser_dom::parse_html(&capture.raw_html);
        assert!(
            dom.query_selector("html").unwrap().is_some(),
            "capture contains actual retained HTML"
        );
        let extracted = extract_main(&capture.raw_html, Some(url.as_str()));
        assert!(!extracted.title.trim().is_empty());
        let links = extract_links_opts(&capture.raw_html, &url, true);
        if directory_urls.contains(url.as_str()) {
            assert!(directories_seen.insert(url.to_string()));
            assert!(url.path() == "/" && url.query().is_none());
            assert!(extracted.text.trim().is_empty(), "directory has no main prose");
            assert!(extracted.markdown.trim().is_empty());
            assert!(!links.is_empty(), "directory retains source discovery links");
            assert!(dom.query_selector("main").unwrap().is_some());
            // The campaign's directory fallback renders the source after removing chrome.
            for id in dom
                .query_selector_all("#wm-ipp, #wm-ipp-base, #wm-ipp-print, script, style, nav, footer")
                .unwrap()
            {
                dom.remove(id);
            }
            let markdown = html_to_markdown(&dom.outer_html(dom.document()), Some(url.as_str()));
            assert!(!markdown.trim().is_empty());
            assert!(
                markdown == document.payload.body_markdown,
                "directory whole-document fallback preserves retained source Markdown"
            );
        } else {
            prose_pages += 1;
            assert!(!extracted.text.trim().is_empty());
            assert!(!extracted.markdown.trim().is_empty());
        }
        retained_links += links.len();
        hosts.insert(document.source_domain);
        assert!(expected.insert(url.to_string(), extracted).is_none());
        assert!(pages.insert(url.to_string(), capture.raw_html).is_none());
    }
    assert!(directories_seen == directory_urls, "all five locale directories are qualified");
    assert_eq!(prose_pages, 12, "all retained prose pages are qualified");
    assert!(
        retained_links > 0,
        "actual captures exercise canonical source links"
    );
    let transport = RetainedPages {
        pages,
        fetched: RefCell::new(Vec::new()),
    };
    let mut frontier = Frontier::memory(FrontierOptions {
        near_duplicate_bits: 0,
        ..FrontierOptions::default()
    })
    .unwrap();
    for url in expected.keys() {
        frontier.enqueue(AddRequest::seed(url), 0).unwrap();
    }
    let report = crawl_bounded(
        &mut frontier,
        &transport,
        &CrawlOptions {
            max_requests: expected.len(),
            max_concurrency: 2,
            max_depth: 0,
            allowed_domains: hosts.into_iter().collect(),
            obey_robots: false,
            ingest_sitemaps: false,
            ..CrawlOptions::default()
        },
    )
    .await
    .unwrap();
    assert_eq!(report.error_count, 0);
    assert_eq!(report.pages.len(), expected.len());
    assert_eq!(report.frontier.done, expected.len() as u64);
    assert_eq!(report.frontier.pending, 0);
    assert_eq!(report.frontier.failed, 0);
    let mut vectors = Vec::new();
    for (key, page) in report.pages.iter().enumerate() {
        let extracted = &expected[page.url.as_str()];
        assert!(
            page.extracted.markdown == extracted.markdown,
            "native crawler preserves retained HTML extraction"
        );
        assert!(!page.duplicate, "retained official captures have distinct content");
        assert!(
            frontier.page(page.url.as_str()).unwrap()
                == Some((extracted.title.clone(), extracted.markdown.clone())),
            "native frontier stores retained source content"
        );
        if !directory_urls.contains(page.url.as_str()) {
            vectors.push((key as u64, fingerprint_vector(&extracted.text)));
        }
    }
    assert_eq!(vectors.len(), 12, "all retained prose fingerprints reach the index");
    assert_fingerprint_index(&vectors);
}
