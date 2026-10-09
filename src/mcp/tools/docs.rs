//! `docs_search` / `docs_read`: the fork's `docs/**/*.mdx`, embedded at build time and ranked with
//! BM25 over title, description, path and body. Also the `bun://docs/...` resources and the
//! generated `llms.txt` index.

use std::collections::HashMap;
use std::fmt::Write as _;
use std::sync::OnceLock;

use crate::embedded;
use crate::registry::{Annotations, Args, Context, Output, Tool, ToolError};
use crate::util::{clip, field, frontmatter, words};

pub(crate) struct Doc {
    /// Path under `docs/` without the `.mdx` extension (`runtime/http/server`).
    pub(crate) path: String,
    pub(crate) title: String,
    pub(crate) description: String,
    pub(crate) body: &'static str,
}

struct Index {
    docs: Vec<Doc>,
    postings: HashMap<String, Vec<(u32, f32)>>,
    lengths: Vec<f32>,
    average: f32,
}

fn index() -> &'static Index {
    static INDEX: OnceLock<Index> = OnceLock::new();
    INDEX.get_or_init(|| {
        let mut docs = Vec::new();
        for (path, text) in embedded::docs() {
            let (fields, body) = frontmatter(text);
            let path = path.strip_suffix(".mdx").unwrap_or(path).to_owned();
            let title = field(&fields, "title")
                .or_else(|| field(&fields, "sidebarTitle"))
                .unwrap_or(&path)
                .to_owned();
            let description = field(&fields, "description").unwrap_or("").to_owned();
            docs.push(Doc {
                path,
                title,
                description,
                body,
            });
        }
        let mut postings: HashMap<String, Vec<(u32, f32)>> = HashMap::new();
        let mut lengths = Vec::with_capacity(docs.len());
        for (i, doc) in docs.iter().enumerate() {
            let mut tf: HashMap<String, f32> = HashMap::new();
            let mut len = 0f32;
            for (text, weight) in [
                (doc.title.as_str(), 5.0),
                (doc.description.as_str(), 2.0),
                (doc.path.as_str(), 3.0),
                (doc.body, 1.0),
            ] {
                for w in words(text) {
                    *tf.entry(w).or_default() += weight;
                    len += 1.0;
                }
            }
            lengths.push(len);
            for (w, f) in tf {
                postings.entry(w).or_default().push((i as u32, f));
            }
        }
        let average = lengths.iter().sum::<f32>() / lengths.len().max(1) as f32;
        Index {
            docs,
            postings,
            lengths,
            average,
        }
    })
}

pub(crate) fn all() -> &'static [Doc] {
    &index().docs
}

/// Ranked `(score, doc index)` for `query`.
fn search(query: &str) -> Vec<(f32, usize)> {
    let idx = index();
    let n = idx.docs.len() as f32;
    let mut scores: HashMap<usize, f32> = HashMap::new();
    let mut terms: Vec<String> = words(query).collect();
    terms.sort();
    terms.dedup();
    for term in &terms {
        let Some(list) = idx.postings.get(term) else {
            continue;
        };
        let df = list.len() as f32;
        let idf = (1.0 + (n - df + 0.5) / (df + 0.5)).ln();
        for &(doc, tf) in list {
            let len = idx.lengths[doc as usize];
            let s = idf * tf * 2.2 / (tf + 1.2 * (0.25 + 0.75 * len / idx.average));
            *scores.entry(doc as usize).or_default() += s;
        }
    }
    let phrase = query.trim().to_lowercase();
    for (&doc, score) in scores.iter_mut() {
        let d = &idx.docs[doc];
        if !phrase.is_empty() && d.title.to_lowercase().contains(&phrase) {
            *score += 4.0;
        }
        if !phrase.is_empty() && d.path.contains(&phrase) {
            *score += 2.0;
        }
        let matched = terms
            .iter()
            .filter(|t| {
                idx.postings
                    .get(*t)
                    .is_some_and(|l| l.iter().any(|&(i, _)| i as usize == doc))
            })
            .count();
        *score *= 0.5 + 0.5 * matched as f32 / terms.len().max(1) as f32;
    }
    let mut ranked: Vec<(f32, usize)> = scores.into_iter().map(|(d, s)| (s, d)).collect();
    ranked.sort_by(|a, b| b.0.total_cmp(&a.0).then(a.1.cmp(&b.1)));
    ranked
}

fn snippet(body: &str, query: &str) -> String {
    let terms: Vec<String> = words(query).collect();
    let mut best = ("", 0usize);
    for line in body.lines() {
        let line = line.trim();
        if line.is_empty()
            || line.starts_with("```")
            || line.starts_with('<')
            || line.starts_with("import ")
        {
            continue;
        }
        let lower = line.to_lowercase();
        let hits = terms.iter().filter(|t| lower.contains(t.as_str())).count();
        if hits > best.1 {
            best = (line, hits);
        }
    }
    clip(best.0, 220)
}

/// Normalizes `runtime/http/server`, `/docs/runtime/http/server.mdx` and
/// `https://bun.com/docs/runtime/http/server` to an index path.
fn normalize(path: &str) -> String {
    let mut p = path.trim();
    for prefix in [
        "https://bun.com/docs/",
        "https://bun.sh/docs/",
        "bun://docs/",
        "/docs/",
        "docs/",
        "/",
    ] {
        if let Some(rest) = p.strip_prefix(prefix) {
            p = rest;
        }
    }
    let p = p.split(['#', '?']).next().unwrap_or(p);
    let p = p.trim_end_matches('/');
    p.strip_suffix(".mdx")
        .or_else(|| p.strip_suffix(".md"))
        .unwrap_or(p)
        .to_owned()
}

pub(crate) fn find(path: &str) -> Option<&'static Doc> {
    let p = normalize(path);
    let docs = all();
    docs.iter()
        .find(|d| d.path == p)
        .or_else(|| docs.iter().find(|d| d.path == format!("{p}/index")))
        .or_else(|| {
            let suffix = format!("/{p}");
            let mut hits = docs.iter().filter(|d| d.path.ends_with(&suffix));
            let first = hits.next();
            if hits.next().is_none() { first } else { None }
        })
}

/// A page as Markdown: title, description, then the MDX body.
pub(crate) fn render(doc: &Doc) -> String {
    let mut out = format!("# {}\n", doc.title);
    if !doc.description.is_empty() {
        let _ = writeln!(out, "\n> {}", doc.description);
    }
    let _ = write!(
        out,
        "\nSource: docs/{}.mdx\n\n{}",
        doc.path,
        doc.body.trim()
    );
    out
}

/// `llms.txt` over the embedded pages, grouped by top-level section.
pub(crate) fn llms_txt() -> String {
    let mut out = format!(
        "# Bun\n\n> Documentation of this Bun build ({}), embedded in the binary. Read a page with docs_read or the bun://docs/<path> resource.\n",
        crate::cli::version()
    );
    let mut section = "";
    for doc in all() {
        let top = doc.path.split('/').next().unwrap_or("");
        let top = if doc.path.contains('/') {
            top
        } else {
            "overview"
        };
        if top != section {
            section = top;
            let _ = write!(out, "\n## {top}\n\n");
        }
        let _ = write!(out, "- [{}](bun://docs/{})", doc.title, doc.path);
        if !doc.description.is_empty() {
            let _ = write!(out, ": {}", doc.description);
        }
        out.push('\n');
    }
    out
}

fn section(body: &str, heading: &str) -> Option<String> {
    let want = heading.trim().trim_start_matches('#').trim().to_lowercase();
    let mut lines = body.lines();
    let mut out = String::new();
    let mut level = 0usize;
    let mut in_fence = false;
    for line in lines.by_ref() {
        if line.trim_start().starts_with("```") {
            in_fence = !in_fence;
        }
        let hashes = line.chars().take_while(|&c| c == '#').count();
        if !in_fence
            && hashes > 0
            && line[hashes..].starts_with(' ')
            && line[hashes..].trim().to_lowercase().contains(&want)
        {
            level = hashes;
            out.push_str(line);
            out.push('\n');
            break;
        }
    }
    if level == 0 {
        return None;
    }
    in_fence = false;
    for line in lines {
        if line.trim_start().starts_with("```") {
            in_fence = !in_fence;
        }
        let hashes = line.chars().take_while(|&c| c == '#').count();
        if !in_fence && hashes > 0 && hashes <= level && line[hashes..].starts_with(' ') {
            break;
        }
        out.push_str(line);
        out.push('\n');
    }
    Some(out)
}

fn docs_search(_ctx: &Context, args: &Args<'_>) -> Result<Output, ToolError> {
    let query = args.str("query")?;
    let limit = args.uint("limit", 8, 50) as usize;
    let offset = args.uint("offset", 0, 10_000) as usize;
    let ranked = search(query);
    let docs = all();
    if ranked.is_empty() {
        return Ok(Output::text(format!(
            "No documentation page matches \"{query}\" ({} pages indexed). Try other words, or docs_read with path \"llms.txt\" for the index.",
            docs.len()
        )));
    }
    let end = (offset + limit).min(ranked.len());
    let mut out = format!(
        "{} pages match \"{query}\" (showing {}-{}). Read one with docs_read {{\"path\": ...}}.\n",
        ranked.len(),
        (offset + 1).min(end),
        end
    );
    for (rank, &(score, i)) in ranked.iter().enumerate().take(end).skip(offset) {
        let d = &docs[i];
        let _ = write!(
            out,
            "\n{}. {} — {} [{score:.1}]\n",
            rank + 1,
            d.path,
            d.title
        );
        if !d.description.is_empty() {
            let _ = writeln!(out, "   {}", clip(&d.description, 200));
        }
        let s = snippet(d.body, query);
        if !s.is_empty() {
            let _ = writeln!(out, "   > {s}");
        }
    }
    if end < ranked.len() {
        let _ = write!(
            out,
            "\nMore: docs_search {{\"query\": \"{query}\", \"offset\": {end}}}\n"
        );
    }
    Ok(Output::text(out))
}

fn docs_read(_ctx: &Context, args: &Args<'_>) -> Result<Output, ToolError> {
    let path = args.str("path")?;
    if normalize(path) == "llms.txt" || normalize(path) == "llms" {
        return Ok(Output::text(llms_txt()));
    }
    let Some(doc) = find(path) else {
        let near: Vec<String> = search(&path.replace(['/', '-'], " "))
            .into_iter()
            .take(5)
            .map(|(_, i)| all()[i].path.clone())
            .collect();
        return Ok(Output::error(format!(
            "No page at \"{path}\". Closest: {}. docs_read \"llms.txt\" lists every page.",
            if near.is_empty() {
                "none".into()
            } else {
                near.join(", ")
            }
        )));
    };
    if let Some(heading) = args.opt_str("heading") {
        return match section(doc.body, heading) {
            Some(text) => Ok(Output::text(format!(
                "# {} › {heading}\n\n{text}",
                doc.title
            ))),
            None => Ok(Output::error(format!(
                "No heading containing \"{heading}\" in {}",
                doc.path
            ))),
        };
    }
    Ok(Output::text(render(doc)))
}

pub(crate) const TOOLS: &[Tool] = &[
    Tool {
        name: "docs_search",
        title: "Search Bun docs",
        description: "Search the Bun documentation embedded in this binary (runtime APIs, bundler, package manager, test runner, guides). Returns ranked page paths with a description and a matching line; read a page with docs_read.",
        input_schema: r#"{"type":"object","properties":{"query":{"type":"string","description":"Words, an API name (Bun.serve, bun:sqlite) or a question"},"limit":{"type":"integer","minimum":1,"maximum":50,"default":8},"offset":{"type":"integer","minimum":0,"default":0}},"required":["query"]}"#,
        annotations: Annotations::READ_ONLY,
        call: docs_search,
    },
    Tool {
        name: "docs_read",
        title: "Read a Bun docs page",
        description: "Read one page of the embedded Bun documentation as Markdown, whole or one section. `path` is a docs_search result (runtime/http/server), a docs URL, or \"llms.txt\" for the index of every page.",
        input_schema: r#"{"type":"object","properties":{"path":{"type":"string","description":"Page path, docs URL, or llms.txt"},"heading":{"type":"string","description":"Only the section whose heading contains this text"}},"required":["path"]}"#,
        annotations: Annotations::READ_ONLY,
        call: docs_read,
    },
];
