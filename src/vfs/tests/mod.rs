// SPDX-License-Identifier: Apache-2.0

use std::{fs, path::Path, sync::atomic::AtomicBool};

use crate::{
    EditOp, EditPlan, EditStatus, GrepOptions, HitKind, Index, IndexOptions, KindFilter, MatchKind,
    QueryMode, SearchQuery, Session, SortOrder, SourceChoice, SpanProvider, VfsError, edit, grep,
};

fn write(root: &Path, relative: &str, content: &str) {
    let path = root.join(relative);
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, content).unwrap();
}

fn fixture() -> tempfile::TempDir {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    write(
        root,
        "src/main.rs",
        "fn main() {\n    println!(\"hello\");\n}\n",
    );
    write(
        root,
        "src/lib.rs",
        "pub fn hello() -> &'static str {\n    \"Hello\"\n}\n",
    );
    write(
        root,
        "src/util/strings.rs",
        "pub fn upper(s: &str) -> String { s.to_uppercase() }\n",
    );
    write(root, "docs/README.md", "# Readme\nhello world\n");
    write(root, "docs/guide/intro.md", "intro\n");
    write(root, "node_modules/pkg/index.js", "module.exports = 1;\n");
    write(root, ".hidden/secret.txt", "hello secret\n");
    write(root, "build/out.bin", "a\0b hello\n");
    write(root, ".gitignore", "build/\n");
    dir
}

fn options(root: &Path) -> IndexOptions {
    IndexOptions {
        root: root.to_path_buf(),
        source: SourceChoice::Walk,
        threads: 4,
        ..IndexOptions::default()
    }
}

#[allow(
    clippy::needless_pass_by_value,
    reason = "call sites build the query inline"
)]
fn names(index: &Index, query: SearchQuery) -> Vec<String> {
    index
        .search(&query)
        .unwrap()
        .hits
        .into_iter()
        .map(|hit| hit.name)
        .collect()
}

fn query(text: &str) -> SearchQuery {
    SearchQuery {
        query: text.into(),
        limit: 100,
        ..SearchQuery::default()
    }
}

#[test]
fn walk_index_and_search() {
    let dir = fixture();
    let cancel = AtomicBool::new(false);
    let index = Index::build(&options(dir.path()), &cancel).unwrap();
    let stats = index.stats();
    assert_eq!(stats.files, 9);
    assert!(stats.directories >= 8);

    let page = index.search(&query("main")).unwrap();
    assert_eq!(page.total, 1);
    let hit = &page.hits[0];
    assert_eq!(hit.name, "main.rs");
    assert_eq!(hit.kind, HitKind::File);
    assert!(
        hit.path
            .ends_with(&format!("src{}main.rs", std::path::MAIN_SEPARATOR))
    );
    assert!(Path::new(&hit.path).is_file());
    assert_eq!(hit.size, Some(fs::metadata(&hit.path).unwrap().len()));

    // Relevance: exact name before prefix before contains.
    assert_eq!(names(&index, query("lib.rs")), ["lib.rs"]);
    let ranked = names(&index, query("readme"));
    assert_eq!(ranked, ["README.md"]);
    assert_eq!(
        names(&index, query("rs src")).len(),
        0,
        "all terms must match the name"
    );
    assert_eq!(names(&index, query("README")), ["README.md"]);
    assert!(names(&index, query("Readme")).is_empty(), "smart case");
    assert!(names(&index, query("README.MD")).is_empty());

    // Path terms.
    let mut in_util = names(&index, query("src/util"));
    in_util.sort();
    assert_eq!(in_util, ["strings.rs", "util"]);
    assert_eq!(names(&index, query("util/str")), ["strings.rs"]);
    let absolute = format!("{}/docs/guide", dir.path().display());
    let mut anchored = names(&index, query(&absolute));
    anchored.sort();
    assert_eq!(anchored, ["guide", "intro.md"]);

    // Glob / regex / exact.
    let mut rust = names(
        &index,
        SearchQuery {
            query: "*.rs".into(),
            mode: QueryMode::Glob,
            limit: 100,
            ..SearchQuery::default()
        },
    );
    rust.sort();
    assert_eq!(rust, ["lib.rs", "main.rs", "strings.rs"]);
    assert_eq!(
        names(
            &index,
            SearchQuery {
                query: "src/**/strings.rs".into(),
                mode: QueryMode::Glob,
                ..SearchQuery::default()
            }
        ),
        ["strings.rs"]
    );
    assert_eq!(
        names(
            &index,
            SearchQuery {
                query: "^m.*\\.rs$".into(),
                mode: QueryMode::Regex,
                ..SearchQuery::default()
            }
        ),
        ["main.rs"]
    );
    assert_eq!(
        names(
            &index,
            SearchQuery {
                query: "intro.md".into(),
                mode: QueryMode::Exact,
                ..SearchQuery::default()
            }
        ),
        ["intro.md"]
    );

    // Filters.
    assert_eq!(
        names(
            &index,
            SearchQuery {
                query: "docs".into(),
                kind: Some(KindFilter::Dir),
                ..SearchQuery::default()
            }
        ),
        ["docs"]
    );
    let mut md = names(
        &index,
        SearchQuery {
            extensions: vec!["MD".into()],
            limit: 100,
            ..SearchQuery::default()
        },
    );
    md.sort();
    assert_eq!(md, ["README.md", "intro.md"]);
    let under = dir.path().join("src").display().to_string();
    let mut src = names(
        &index,
        SearchQuery {
            under: Some(under),
            kind: Some(KindFilter::File),
            limit: 100,
            ..SearchQuery::default()
        },
    );
    src.sort();
    assert_eq!(src, ["lib.rs", "main.rs", "strings.rs"]);
    let outside = SearchQuery {
        under: Some("/definitely/elsewhere".into()),
        ..SearchQuery::default()
    };
    assert!(matches!(index.search(&outside), Err(VfsError::Invalid(_))));

    // Sorting and pagination.
    let by_size = index
        .search(&SearchQuery {
            kind: Some(KindFilter::File),
            sort: SortOrder::Size,
            limit: 1,
            ..SearchQuery::default()
        })
        .unwrap();
    assert_eq!(by_size.hits[0].name, "strings.rs");
    assert_eq!(by_size.next_offset, Some(1));
    let all = index
        .search(&SearchQuery {
            sort: SortOrder::Name,
            limit: 1000,
            ..SearchQuery::default()
        })
        .unwrap();
    assert_eq!(all.total, index.len());
    let mut collected = Vec::new();
    let mut offset = 0;
    loop {
        let page = index
            .search(&SearchQuery {
                sort: SortOrder::Name,
                offset,
                limit: 3,
                ..SearchQuery::default()
            })
            .unwrap();
        collected.extend(page.hits.into_iter().map(|hit| hit.path));
        match page.next_offset {
            Some(next) => offset = next,
            None => break,
        }
    }
    assert_eq!(
        collected,
        all.hits.into_iter().map(|hit| hit.path).collect::<Vec<_>>()
    );
}

#[test]
fn exclusions_hidden_and_gitignore() {
    let dir = fixture();
    let cancel = AtomicBool::new(false);
    let mut opts = options(dir.path());
    opts.exclude = vec![
        "node_modules".into(),
        dir.path().join("docs").join("guide").display().to_string(),
    ];
    opts.hidden = false;
    let index = Index::build(&opts, &cancel).unwrap();
    assert!(names(&index, query("index.js")).is_empty());
    assert!(names(&index, query("intro")).is_empty());
    assert_eq!(names(&index, query("guide")), ["guide"]);
    assert!(names(&index, query("secret")).is_empty());
    assert_eq!(names(&index, query("out.bin")), ["out.bin"]);

    let mut ignored = options(dir.path());
    ignored.gitignore = true;
    let index = Index::build(&ignored, &cancel).unwrap();
    assert!(names(&index, query("out.bin")).is_empty());
    assert_eq!(names(&index, query("strings")), ["strings.rs"]);
    assert_eq!(
        index.search(&query("strings")).unwrap().hits[0].path,
        dir.path()
            .join("src/util/strings.rs")
            .display()
            .to_string()
            .replace('/', std::path::MAIN_SEPARATOR_STR)
    );
}

#[test]
fn snapshot_roundtrip_and_refresh() {
    let dir = fixture();
    let cancel = AtomicBool::new(false);
    let index = Index::build(&options(dir.path()), &cancel).unwrap();
    let snapshot = dir.path().join("snap").join("index.bvfs");
    assert!(index.save(&snapshot).unwrap() > 0);
    let mut opened = Index::open(&snapshot).unwrap();
    assert!(opened.stats().mapped);
    assert_eq!(opened.len(), index.len());
    assert_eq!(opened.root(), index.root());
    assert_eq!(names(&opened, query("strings")), ["strings.rs"]);
    drop(index);

    // Directory mtimes have one-second resolution on some file systems.
    std::thread::sleep(std::time::Duration::from_millis(1100));
    write(dir.path(), "src/util/added.rs", "x");
    write(dir.path(), "fresh/deep/new.txt", "x");
    fs::remove_dir_all(dir.path().join("docs/guide")).unwrap();
    fs::rename(
        dir.path().join("src/lib.rs"),
        dir.path().join("src/library.rs"),
    )
    .unwrap();
    let stats = opened.refresh(&cancel).unwrap();
    assert!(!stats.rebuilt);
    assert!(stats.added >= 4, "{stats:?}");
    assert!(stats.removed >= 2, "{stats:?}");
    assert_eq!(names(&opened, query("added")), ["added.rs"]);
    assert_eq!(names(&opened, query("new.txt")), ["new.txt"]);
    assert!(
        opened.search(&query("new.txt")).unwrap().hits[0]
            .path
            .contains("deep")
    );
    assert!(names(&opened, query("intro")).is_empty());
    assert!(names(&opened, query("lib.rs")).is_empty());
    assert_eq!(names(&opened, query("library")), ["library.rs"]);
    let fresh = Index::build(&options(dir.path()), &cancel).unwrap();
    assert_eq!(fresh.len(), opened.len());

    // Saving over the mapped snapshot works while it is open.
    opened.save(&snapshot).unwrap();
    let again = Index::open(&snapshot).unwrap();
    assert_eq!(names(&again, query("library")), ["library.rs"]);
    assert!(
        Index::default_snapshot_path("C:\\")
            .to_string_lossy()
            .ends_with(".bvfs")
    );
}

#[test]
fn cancel_stops_build() {
    let dir = fixture();
    let cancel = AtomicBool::new(true);
    assert!(matches!(
        Index::build(&options(dir.path()), &cancel),
        Err(VfsError::Cancelled)
    ));
}

fn grep_options(root: &Path, pattern: &str) -> GrepOptions {
    GrepOptions {
        root: root.to_path_buf(),
        pattern: pattern.into(),
        ..GrepOptions::default()
    }
}

#[test]
fn grep_content() {
    let dir = fixture();
    let cancel = AtomicBool::new(false);
    let page = grep(&grep_options(dir.path(), "hello"), &cancel).unwrap();
    let paths: Vec<_> = page
        .hits
        .iter()
        .map(|hit| (hit.path.as_str(), hit.line))
        .collect();
    // Smart case: `hello` matches `Hello`; hidden, gitignored and binary files are skipped.
    assert_eq!(
        paths,
        [
            ("docs/README.md", 2),
            ("src/lib.rs", 1),
            ("src/lib.rs", 2),
            ("src/main.rs", 2)
        ]
    );
    assert_eq!(page.hits[3].column, 15);
    assert_eq!(page.hits[3].text, "    println!(\"hello\");");
    assert!(!page.truncated);

    let sensitive = grep(&grep_options(dir.path(), "Hello"), &cancel).unwrap();
    assert_eq!(sensitive.hits.len(), 1);

    let mut regex = grep_options(dir.path(), r"fn \w+\(");
    regex.regex = true;
    regex.globs = vec!["*.rs".into(), "!main.rs".into()];
    let page = grep(&regex, &cancel).unwrap();
    assert_eq!(
        page.hits
            .iter()
            .map(|hit| hit.path.as_str())
            .collect::<Vec<_>>(),
        ["src/lib.rs", "src/util/strings.rs"]
    );

    let mut context = grep_options(dir.path(), "println");
    context.context = 1;
    let page = grep(&context, &cancel).unwrap();
    assert_eq!(page.hits[0].before, ["fn main() {"]);
    assert_eq!(page.hits[0].after, ["}"]);

    let mut paged = grep_options(dir.path(), "hello");
    paged.limit = 2;
    let first = grep(&paged, &cancel).unwrap();
    assert!(first.truncated);
    assert_eq!(first.next_offset, Some(2));
    paged.offset = 2;
    let second = grep(&paged, &cancel).unwrap();
    assert_eq!(second.hits.len(), 2);
    assert_eq!(second.hits[0].path, "src/lib.rs");
    assert_eq!(second.hits[0].line, 2);
    assert_eq!(second.next_offset, None);

    let mut hidden = grep_options(dir.path(), "secret");
    hidden.hidden = true;
    assert_eq!(grep(&hidden, &cancel).unwrap().hits.len(), 1);

    let mut files = grep_options(dir.path(), "hello");
    files.files_only = true;
    assert_eq!(grep(&files, &cancel).unwrap().hits.len(), 3);

    let mut scoped = grep_options(dir.path(), "hello");
    scoped.paths = vec!["docs".into()];
    assert_eq!(grep(&scoped, &cancel).unwrap().hits.len(), 1);
    scoped.paths = vec!["../".into()];
    assert!(matches!(grep(&scoped, &cancel), Err(VfsError::Outside(_))));
}

fn plan(root: &Path, ops: Vec<EditOp>, apply: bool) -> EditPlan {
    EditPlan {
        root: root.to_path_buf(),
        ops,
        apply,
        ..EditPlan::default()
    }
}

fn read(root: &Path, relative: &str) -> String {
    fs::read_to_string(root.join(relative)).unwrap()
}

#[test]
fn edit_dry_run_then_apply() {
    let dir = fixture();
    let root = dir.path();
    let cancel = AtomicBool::new(false);
    let ops = vec![EditOp::Replace {
        files: vec!["src".into()],
        find: "hello".into(),
        replace: "greet".into(),
        matcher: MatchKind::Literal,
        case_insensitive: false,
        expect: Some(2),
    }];
    let report = edit(&plan(root, ops.clone(), false), None, &cancel).unwrap();
    assert!(!report.applied);
    assert!(report.dry_run);
    assert_eq!(report.summary.files_changed, 2);
    assert_eq!(report.summary.replacements, 2);
    assert!(report.diff.contains("--- a/src/lib.rs"));
    assert!(report.diff.contains("-pub fn hello() -> &'static str {"));
    assert!(report.diff.contains("+pub fn greet() -> &'static str {"));
    assert!(
        read(root, "src/lib.rs").contains("hello"),
        "dry run must not write"
    );

    let report = edit(&plan(root, ops, true), None, &cancel).unwrap();
    assert!(report.applied, "{report:?}");
    assert!(read(root, "src/lib.rs").starts_with("pub fn greet()"));
    assert!(read(root, "src/main.rs").contains("println!(\"greet\")"));
    let leftovers: Vec<_> = fs::read_dir(root.join("src"))
        .unwrap()
        .map(|entry| entry.unwrap().file_name())
        .filter(|name| name.to_string_lossy().contains("bunvfs"))
        .collect();
    assert!(leftovers.is_empty(), "{leftovers:?}");
}

#[test]
fn edit_regex_globs_write_delete_rename() {
    let dir = fixture();
    let root = dir.path();
    let cancel = AtomicBool::new(false);
    let ops = vec![
        EditOp::Replace {
            files: vec!["src/**/*.rs".into()],
            find: r"pub fn (\w+)".into(),
            replace: "pub(crate) fn ${1}_v2".into(),
            matcher: MatchKind::Regex,
            case_insensitive: false,
            expect: None,
        },
        EditOp::Write {
            path: "notes/new.md".into(),
            content: "new\n".into(),
        },
        EditOp::Delete {
            path: "docs/guide/intro.md".into(),
        },
        EditOp::Rename {
            from: "docs".into(),
            to: "manual".into(),
        },
        EditOp::Rename {
            from: "manual/README.md".into(),
            to: "manual/index.md".into(),
        },
    ];
    let report = edit(&plan(root, ops, true), None, &cancel).unwrap();
    assert!(report.applied, "{report:?}");
    assert_eq!(report.summary.files_changed, 2);
    assert_eq!(report.summary.files_created, 1);
    assert_eq!(report.summary.files_deleted, 1);
    assert_eq!(report.summary.renames, 2);
    assert!(read(root, "src/lib.rs").starts_with("pub(crate) fn hello_v2()"));
    assert!(read(root, "src/util/strings.rs").starts_with("pub(crate) fn upper_v2("));
    assert_eq!(read(root, "notes/new.md"), "new\n");
    assert!(!root.join("docs").exists());
    assert_eq!(read(root, "manual/index.md"), "# Readme\nhello world\n");
    assert!(!root.join("manual/guide/intro.md").exists());
}

#[test]
fn edit_failures_write_nothing() {
    let dir = fixture();
    let root = dir.path();
    let cancel = AtomicBool::new(false);
    let replace = |expect| EditOp::Replace {
        files: vec!["src".into()],
        find: "hello".into(),
        replace: "x".into(),
        matcher: MatchKind::Literal,
        case_insensitive: false,
        expect,
    };
    assert!(matches!(
        edit(&plan(root, vec![replace(Some(5))], true), None, &cancel),
        Err(VfsError::Invalid(_))
    ));
    let conflict = vec![
        replace(None),
        EditOp::Rename {
            from: "src/lib.rs".into(),
            to: "src/main.rs".into(),
        },
    ];
    assert!(matches!(
        edit(&plan(root, conflict, true), None, &cancel),
        Err(VfsError::Invalid(_))
    ));
    let missing = vec![
        replace(None),
        EditOp::Rename {
            from: "nope".into(),
            to: "other".into(),
        },
    ];
    assert!(edit(&plan(root, missing, true), None, &cancel).is_err());
    let outside = vec![EditOp::Write {
        path: "../escape.txt".into(),
        content: String::new(),
    }];
    assert!(matches!(
        edit(&plan(root, outside, true), None, &cancel),
        Err(VfsError::Outside(_))
    ));
    let explicit_binary = vec![EditOp::Replace {
        files: vec!["build/out.bin".into()],
        find: "a".into(),
        replace: "b".into(),
        matcher: MatchKind::Literal,
        case_insensitive: false,
        expect: None,
    }];
    assert!(edit(&plan(root, explicit_binary, true), None, &cancel).is_err());
    assert!(read(root, "src/lib.rs").contains("hello"));
    assert!(read(root, "src/main.rs").contains("hello"));
    assert!(!root.join("other").exists());

    // A rename that fails while applying (its parent is a file) rolls back the content edits.
    write(root, "blocker", "file, not a directory");
    let blocked = vec![
        replace(None),
        EditOp::Rename {
            from: "src/lib.rs".into(),
            to: "blocker/lib.rs".into(),
        },
    ];
    let report = edit(&plan(root, blocked, true), None, &cancel).unwrap();
    assert!(!report.applied);
    assert!(report.error.is_some());
    assert!(
        report
            .files
            .iter()
            .all(|file| file.status == EditStatus::RolledBack),
        "{report:?}"
    );
    assert_eq!(report.renames[0].status, EditStatus::Failed);
    assert!(read(root, "src/lib.rs").contains("hello"));
    assert!(read(root, "src/main.rs").contains("hello"));
}

struct Words;

impl SpanProvider for Words {
    fn identifier_spans(
        &self,
        _path: &str,
        source: &str,
        name: &str,
    ) -> Result<Vec<(usize, usize)>, String> {
        let bytes = source.as_bytes();
        let mut spans = Vec::new();
        let mut at = 0;
        while let Some(found) = source[at..].find(name) {
            let start = at + found;
            let end = start + name.len();
            let word = |index: Option<&u8>| {
                index.is_some_and(|byte| byte.is_ascii_alphanumeric() || *byte == b'_')
            };
            if !word(start.checked_sub(1).and_then(|before| bytes.get(before)))
                && !word(bytes.get(end))
            {
                spans.push((start, end));
            }
            at = end;
        }
        Ok(spans)
    }
}

#[test]
fn edit_identifier_uses_provider() {
    let dir = fixture();
    let root = dir.path();
    write(
        root,
        "a.ts",
        "const hello = 1; const helloWorld = hello + 1;\n",
    );
    let cancel = AtomicBool::new(false);
    let ops = vec![EditOp::Replace {
        files: vec!["a.ts".into()],
        find: "hello".into(),
        replace: "hi".into(),
        matcher: MatchKind::Identifier,
        case_insensitive: false,
        expect: Some(2),
    }];
    assert!(edit(&plan(root, ops.clone(), true), None, &cancel).is_err());
    let report = edit(&plan(root, ops, true), Some(&Words), &cancel).unwrap();
    assert!(report.applied);
    assert_eq!(
        read(root, "a.ts"),
        "const hi = 1; const helloWorld = hi + 1;\n"
    );
}

/// Real volume measurement: `cargo test -p bun_vfs -- --ignored --nocapture volume`.
#[test]
#[ignore = "indexes the whole system volume"]
#[allow(
    clippy::disallowed_macros,
    reason = "measurement output for --nocapture"
)]
fn volume_build_and_query() {
    let cancel = AtomicBool::new(false);
    let started = std::time::Instant::now();
    let index = Index::build(&IndexOptions::default(), &cancel).unwrap();
    let built = started.elapsed();
    let stats = index.stats();
    let snapshot = std::env::temp_dir().join("bun-vfs-volume-test.bvfs");
    let started = std::time::Instant::now();
    index.save(&snapshot).unwrap();
    let saved = started.elapsed();
    let started = std::time::Instant::now();
    let opened = Index::open(&snapshot).unwrap();
    let open = started.elapsed();
    eprintln!(
        "source={:?} entries={} dirs={} build={built:?} save={saved:?} open={open:?}",
        stats.source, stats.entries, stats.directories
    );
    for text in [
        "readme",
        "kernel32.dll",
        "node_modules",
        "windows/system32 notepad",
        "zzzzqqqq",
    ] {
        let _ = opened.search(&query(text)).unwrap();
        let mut best = u64::MAX;
        for _ in 0..5 {
            best = best.min(opened.search(&query(text)).unwrap().elapsed_us);
        }
        let page = opened.search(&query(text)).unwrap();
        eprintln!(
            "query {text:?}: total={} best={best}us first={:?}",
            page.total,
            page.hits.first().map(|hit| &hit.path)
        );
    }
    let mut refreshed = opened;
    let started = std::time::Instant::now();
    let refresh = refreshed.refresh(&cancel).unwrap();
    eprintln!("refresh={:?} {refresh:?}", started.elapsed());
    let _ = fs::remove_file(snapshot);
}

#[test]
fn load_builds_then_reuses_the_snapshot() {
    let dir = tempfile::tempdir().unwrap();
    let store = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(dir.path().join("src")).unwrap();
    std::fs::write(dir.path().join("src/a.txt"), "a").unwrap();
    let snapshot = store.path().join("index.bvfs");
    let options = IndexOptions {
        root: dir.path().to_path_buf(),
        ..IndexOptions::default()
    };
    let cancel = AtomicBool::new(false);
    let (index, report) = Index::load(&options, Some(&snapshot), &cancel).unwrap();
    assert!(!report.reused && report.saved_bytes.is_some());
    let first = index.len();
    drop(index);
    let (index, report) = Index::load(&options, Some(&snapshot), &cancel).unwrap();
    assert!(report.reused);
    assert_eq!(index.len(), first);
    drop(index);
    std::fs::write(dir.path().join("src/b.txt"), "b").unwrap();
    let (index, report) = Index::load(&options, Some(&snapshot), &cancel).unwrap();
    assert!(report.reused && report.saved_bytes.is_some());
    assert_eq!(index.len(), first + 1);
    drop(index);
    let other = IndexOptions {
        hidden: false,
        ..options
    };
    let (_, report) = Index::load(&other, Some(&snapshot), &cancel).unwrap();
    assert!(!report.reused);
}

#[test]
fn session_routes_json() {
    let dir = tempfile::tempdir().unwrap();
    let store = tempfile::tempdir().unwrap();
    std::fs::write(dir.path().join("needle.txt"), "alpha beta\n").unwrap();
    let session = Session::new(None);
    let cancel = AtomicBool::new(false);
    let call = |op: &str, input: serde_json::Value| -> serde_json::Value {
        serde_json::from_str(&session.call(op, &input.to_string(), &cancel).unwrap()).unwrap()
    };
    let snapshot = store.path().join("s.bvfs");
    let loaded = call(
        "load",
        serde_json::json!({ "options": { "root": dir.path() }, "snapshot": snapshot }),
    );
    let handle = loaded["handle"].as_u64().unwrap();
    assert_eq!(loaded["report"]["reused"], false);
    let page = call(
        "search",
        serde_json::json!({ "handle": handle, "query": { "query": "needle" } }),
    );
    assert_eq!(page["hits"][0]["name"], "needle.txt");
    let grep = call(
        "grep",
        serde_json::json!({ "root": dir.path(), "pattern": "beta" }),
    );
    assert_eq!(grep["hits"][0]["line"], 1);
    assert_eq!(
        call("close", serde_json::json!({ "handle": handle }))["closed"],
        true
    );
    let error = session
        .call(
            "stats",
            &serde_json::json!({ "handle": handle }).to_string(),
            &cancel,
        )
        .unwrap_err();
    assert_eq!(error.code(), "ERR_VFS_INVALID");
    let error = session
        .call("search", r#"{"handle":1,"bogus":1}"#, &cancel)
        .unwrap_err();
    assert_eq!(error.code(), "ERR_VFS_INVALID");
}
