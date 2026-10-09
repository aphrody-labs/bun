//! `memory_search` / `memory_read` / `memory_write` / `memory_import`: project memory in SQLite
//! (`~/.bun/agent/memory.db`, `$BUN_MCP_MEMORY_DB`) with an FTS5 index. A record is keyed by
//! project (the git root of the working directory by default) and name.

use std::fmt::Write as _;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::registry::{Annotations, Args, Context, Output, Tool, ToolError};
use crate::sqlite::{Db, Param};
use crate::util::{agent_dir, clip, env, field, frontmatter, project_root, words};

const SCHEMA: &str = "PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS memories(id INTEGER PRIMARY KEY, project TEXT NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', type TEXT NOT NULL DEFAULT '', body TEXT NOT NULL, source TEXT NOT NULL DEFAULT '', updated INTEGER NOT NULL, UNIQUE(project, name));
CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(name, description, body, content='memories', content_rowid='id', tokenize='unicode61 remove_diacritics 2');
CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN INSERT INTO memories_fts(rowid, name, description, body) VALUES (new.id, new.name, new.description, new.body); END;
CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN INSERT INTO memories_fts(memories_fts, rowid, name, description, body) VALUES ('delete', old.id, old.name, old.description, old.body); END;
CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN INSERT INTO memories_fts(memories_fts, rowid, name, description, body) VALUES ('delete', old.id, old.name, old.description, old.body); INSERT INTO memories_fts(rowid, name, description, body) VALUES (new.id, new.name, new.description, new.body); END";

pub(crate) fn db_path() -> PathBuf {
    env("BUN_MCP_MEMORY_DB")
        .map(PathBuf::from)
        .unwrap_or_else(|| agent_dir().join("memory.db"))
}

/// A connection to the agent database with the memory schema applied.
pub(crate) fn open_db() -> Result<Db, String> {
    let db = Db::open(&db_path())?;
    db.exec_batch(SCHEMA)?;
    Ok(db)
}

#[derive(Default)]
struct MemoryState {
    db: OnceLock<Result<Db, String>>,
}

fn db(ctx: &Context) -> Result<&'static Db, ToolError> {
    ctx.state::<MemoryState>()
        .db
        .get_or_init(open_db)
        .as_ref()
        .map_err(|e| ToolError::Failed(format!("memory database {}: {e}", db_path().display())))
}

fn project(ctx: &Context, args: &Args<'_>) -> String {
    match args.opt_str("project") {
        Some(p) => p.to_owned(),
        None => project_root(&ctx.cwd).to_string_lossy().replace('\\', "/"),
    }
}

fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn upsert(
    db: &Db,
    project: &str,
    name: &str,
    description: &str,
    kind: &str,
    body: &str,
    source: &str,
) -> Result<(), String> {
    db.execute(
        "INSERT INTO memories(project, name, description, type, body, source, updated) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(project, name) DO UPDATE SET description = excluded.description, type = excluded.type, body = excluded.body, source = excluded.source, updated = excluded.updated",
        &[
            Param::Text(project),
            Param::Text(name),
            Param::Text(description),
            Param::Text(kind),
            Param::Text(body),
            Param::Text(source),
            Param::Int(now()),
        ],
    )
}

fn memory_search(ctx: &Context, args: &Args<'_>) -> Result<Output, ToolError> {
    let db = db(ctx)?;
    let query = args.opt_str("query").unwrap_or("");
    let project = project(ctx, args);
    let limit = args.uint("limit", 10, 100) as i64;
    let offset = args.uint("offset", 0, 100_000) as i64;
    let terms: Vec<String> = words(query)
        .map(|w| format!("\"{}\"", w.replace('"', "")))
        .collect();
    let mut rows: Vec<(String, String, String, String, String)> = Vec::new();
    let push = |row: &crate::sqlite::Row<'_>| {
        rows.push((
            row.text(0),
            row.text(1),
            row.text(2),
            row.text(3),
            row.text(4),
        ));
    };
    if terms.is_empty() {
        db.query(
            "SELECT project, name, description, type, substr(body, 1, 160) FROM memories WHERE (?1 = '*' OR project = ?1) ORDER BY updated DESC LIMIT ?2 OFFSET ?3",
            &[Param::Text(&project), Param::Int(limit), Param::Int(offset)],
            push,
        )?;
    } else {
        db.query(
            "SELECT m.project, m.name, m.description, m.type, snippet(memories_fts, 2, '«', '»', '…', 24)
             FROM memories_fts JOIN memories m ON m.id = memories_fts.rowid
             WHERE memories_fts MATCH ?1 AND (?2 = '*' OR m.project = ?2)
             ORDER BY bm25(memories_fts, 6.0, 3.0, 1.0) LIMIT ?3 OFFSET ?4",
            &[Param::Text(&terms.join(" OR ")), Param::Text(&project), Param::Int(limit), Param::Int(offset)],
            push,
        )?;
    }
    if rows.is_empty() {
        return Ok(Output::text(format!(
            "No memory matches \"{query}\" in project {project}. Use project \"*\" to search every project."
        )));
    }
    let mut out = format!(
        "{} memories (project {project}). Full text: memory_read {{\"name\": ...}}.\n",
        rows.len()
    );
    for (p, name, description, kind, snippet) in &rows {
        let _ = write!(out, "\n- {name}");
        if !kind.is_empty() {
            let _ = write!(out, " ({kind})");
        }
        if project == "*" {
            let _ = write!(out, " [{p}]");
        }
        if !description.is_empty() {
            let _ = write!(out, ": {}", clip(description, 200));
        }
        let _ = write!(out, "\n  > {}\n", clip(&snippet.replace('\n', " "), 300));
    }
    if rows.len() as i64 == limit {
        let _ = write!(
            out,
            "\nMore: memory_search with \"offset\": {}\n",
            offset + limit
        );
    }
    Ok(Output::text(out))
}

fn memory_read(ctx: &Context, args: &Args<'_>) -> Result<Output, ToolError> {
    let db = db(ctx)?;
    let name = args.str("name")?;
    let project = project(ctx, args);
    let mut found = None;
    db.query(
        "SELECT project, description, type, body, source, updated FROM memories WHERE name = ?1 AND (?2 = '*' OR project = ?2) ORDER BY updated DESC LIMIT 1",
        &[Param::Text(name), Param::Text(&project)],
        |row| {
            found = Some(format!(
                "# {name}\nproject: {}\ntype: {}\ndescription: {}\nsource: {}\nupdated: {}\n\n{}",
                row.text(0),
                row.text(2),
                row.text(1),
                row.text(4),
                row.int(5),
                row.text(3)
            ))
        },
    )?;
    Ok(match found {
        Some(text) => Output::text(text),
        None => Output::error(format!("No memory named \"{name}\" in project {project}")),
    })
}

fn memory_write(ctx: &Context, args: &Args<'_>) -> Result<Output, ToolError> {
    let db = db(ctx)?;
    let name = args.str("name")?;
    let body = args.str("body")?;
    let project = project(ctx, args);
    upsert(
        db,
        &project,
        name,
        args.opt_str("description").unwrap_or(""),
        args.opt_str("type").unwrap_or(""),
        body,
        "mcp",
    )?;
    Ok(Output::text(format!(
        "Saved memory \"{name}\" in project {project}."
    )))
}

fn import_file(db: &Db, project: &str, path: &Path) -> Result<bool, String> {
    let text = std::fs::read_to_string(path).map_err(|e| format!("{}: {e}", path.display()))?;
    let stem = path
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default();
    if stem.eq_ignore_ascii_case("MEMORY") || stem.eq_ignore_ascii_case("README") {
        return Ok(false);
    }
    let (fields, body) = frontmatter(&text);
    let name = field(&fields, "name").unwrap_or(&stem);
    upsert(
        db,
        project,
        name,
        field(&fields, "description").unwrap_or(""),
        field(&fields, "type").unwrap_or(""),
        body.trim(),
        &path.to_string_lossy(),
    )?;
    Ok(true)
}

fn memory_import(ctx: &Context, args: &Args<'_>) -> Result<Output, ToolError> {
    let db = db(ctx)?;
    let project = project(ctx, args);
    let path = ctx.cwd.join(args.str("path")?);
    let mut files = Vec::new();
    if path.is_dir() {
        for entry in std::fs::read_dir(&path)?.flatten() {
            let p = entry.path();
            if p.extension().is_some_and(|e| e == "md") && p.is_file() {
                files.push(p);
            }
        }
        files.sort();
    } else {
        files.push(path.clone());
    }
    let mut imported = 0usize;
    let mut errors = Vec::new();
    for file in files.iter().take(5000) {
        match import_file(db, &project, file) {
            Ok(true) => imported += 1,
            Ok(false) => {}
            Err(e) => errors.push(e),
        }
    }
    let mut out = format!(
        "Imported {imported} memories from {} into project {project}.",
        path.display()
    );
    if !errors.is_empty() {
        let _ = write!(out, "\n{} errors:\n{}", errors.len(), errors.join("\n"));
    }
    Ok(Output::text(out))
}

pub(crate) const TOOLS: &[Tool] = &[
    Tool {
        name: "memory_search",
        title: "Search project memory",
        description: "Full-text search (SQLite FTS5) of the persistent agent memory for this project: decisions, conventions, references saved by memory_write or imported from Markdown notes. Empty query lists the most recent entries.",
        input_schema: r#"{"type":"object","properties":{"query":{"type":"string"},"project":{"type":"string","description":"Project key (default: git root of the working directory); \"*\" searches every project"},"limit":{"type":"integer","minimum":1,"maximum":100,"default":10},"offset":{"type":"integer","minimum":0,"default":0}}}"#,
        annotations: Annotations::READ_ONLY,
        call: memory_search,
    },
    Tool {
        name: "memory_read",
        title: "Read a memory",
        description: "Read one memory entry in full by name.",
        input_schema: r#"{"type":"object","properties":{"name":{"type":"string"},"project":{"type":"string"}},"required":["name"]}"#,
        annotations: Annotations::READ_ONLY,
        call: memory_read,
    },
    Tool {
        name: "memory_write",
        title: "Save a memory",
        description: "Create or replace a memory entry (keyed by project and name) in ~/.bun/agent/memory.db, for facts worth keeping across sessions.",
        input_schema: r#"{"type":"object","properties":{"name":{"type":"string","description":"Stable key, e.g. build-commands"},"body":{"type":"string","description":"Markdown content"},"description":{"type":"string","description":"One line used in search results"},"type":{"type":"string","description":"feedback, project, reference, ..."},"project":{"type":"string"}},"required":["name","body"]}"#,
        annotations: Annotations::WRITE,
        call: memory_write,
    },
    Tool {
        name: "memory_import",
        title: "Import Markdown memories",
        description: "Import Markdown notes with YAML frontmatter (name, description, type) from a file or a directory of *.md files (MEMORY.md and README.md are skipped); existing entries with the same name are replaced.",
        input_schema: r#"{"type":"object","properties":{"path":{"type":"string","description":"File or directory, relative to the working directory or absolute"},"project":{"type":"string"}},"required":["path"]}"#,
        annotations: Annotations::WRITE,
        call: memory_import,
    },
];
