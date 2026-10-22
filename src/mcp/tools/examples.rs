//! `examples_search`: the bun-native dataset (scripts/aphrody/dataset), instruction → Bun-native code
//! pairs from the docs, bun-types, tests and the n2b registry, ranked with BM25 over the API names,
//! the instruction, the tags and the code. The JSONL file is read from disk, never embedded:
//! `BUN_NATIVE_DATASET`, else `$BUN_INSTALL/agent/datasets/bun-native.jsonl` (written by
//! `bun agent-plugin install`), else `build/dataset/bun-native.jsonl` of the project.

use std::collections::HashMap;
use std::fmt::Write as _;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use serde::Deserialize;

use crate::registry::{Annotations, Args, Context, Output, Tool, ToolError};
use crate::util::{agent_dir, clip, env, project_root, words};

pub(crate) const REMOTE: &str = "https://bun.aphrody.app/api/bun/search?q=";

#[derive(Deserialize)]
pub(crate) struct Entry {
    pub(crate) id: String,
    pub(crate) kind: String,
    pub(crate) instruction: String,
    pub(crate) response: String,
    #[serde(default)]
    pub(crate) code: String,
    #[serde(default)]
    pub(crate) lang: String,
    #[serde(default)]
    pub(crate) api: Vec<String>,
    #[serde(default)]
    pub(crate) tags: Vec<String>,
    pub(crate) source: String,
    #[serde(default)]
    pub(crate) version: String,
}

pub(crate) struct Dataset {
    path: PathBuf,
    entries: Vec<Entry>,
    postings: HashMap<String, Vec<(u32, f32)>>,
    lengths: Vec<f32>,
    average: f32,
}

impl Dataset {
    pub(crate) fn parse(path: PathBuf, text: &str) -> Self {
        let entries: Vec<Entry> = text
            .lines()
            .filter(|l| !l.trim().is_empty())
            .filter_map(|l| serde_json::from_str(l).ok())
            .collect();
        let mut postings: HashMap<String, Vec<(u32, f32)>> = HashMap::new();
        let mut lengths = Vec::with_capacity(entries.len());
        for (i, e) in entries.iter().enumerate() {
            let mut tf: HashMap<String, f32> = HashMap::new();
            let mut len = 0f32;
            let api = e.api.join(" ");
            let tags = e.tags.join(" ");
            for (text, weight) in [
                (api.as_str(), 4.0),
                (e.instruction.as_str(), 2.0),
                (tags.as_str(), 1.0),
                (e.code.as_str(), 1.0),
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
        Self {
            path,
            entries,
            postings,
            lengths,
            average,
        }
    }

    /// Ranked `(score, entry index)`, optionally only entries of `kind`.
    pub(crate) fn search(&self, query: &str, kind: Option<&str>) -> Vec<(f32, usize)> {
        let n = self.entries.len() as f32;
        let mut terms: Vec<String> = words(query).collect();
        terms.sort();
        terms.dedup();
        let mut scores: HashMap<usize, (f32, usize)> = HashMap::new();
        for term in &terms {
            let Some(list) = self.postings.get(term) else {
                continue;
            };
            let df = list.len() as f32;
            let idf = (1.0 + (n - df + 0.5) / (df + 0.5)).ln();
            for &(i, tf) in list {
                let len = self.lengths[i as usize];
                let s = idf * tf * 2.2 / (tf + 1.2 * (0.25 + 0.75 * len / self.average));
                let slot = scores.entry(i as usize).or_default();
                slot.0 += s;
                slot.1 += 1;
            }
        }
        let needle = query.trim().to_lowercase();
        let mut ranked: Vec<(f32, usize)> = scores
            .into_iter()
            .filter(|&(i, _)| kind.is_none_or(|k| self.entries[i].kind == k))
            .map(|(i, (s, matched))| {
                let e = &self.entries[i];
                let mut s = s * (0.5 + 0.5 * matched as f32 / terms.len().max(1) as f32);
                if e.api.iter().any(|a| a.to_lowercase() == needle) {
                    s += 6.0;
                }
                (s, i)
            })
            .collect();
        ranked.sort_by(|a, b| b.0.total_cmp(&a.0).then(a.1.cmp(&b.1)));
        ranked
    }
}

/// Where the dataset is looked for, in order.
pub(crate) fn candidates(cwd: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();
    if let Some(p) = env("BUN_NATIVE_DATASET") {
        out.push(PathBuf::from(p));
    }
    out.push(agent_dir().join("datasets").join("bun-native.jsonl"));
    out.push(
        project_root(cwd)
            .join("build")
            .join("dataset")
            .join("bun-native.jsonl"),
    );
    out
}

fn dataset(cwd: &Path) -> Option<&'static Dataset> {
    static DATASET: OnceLock<Option<Dataset>> = OnceLock::new();
    DATASET
        .get_or_init(|| {
            candidates(cwd).into_iter().find_map(|p| {
                let text = std::fs::read_to_string(&p).ok()?;
                Some(Dataset::parse(p, &text))
            })
        })
        .as_ref()
}

fn examples_search(ctx: &Context, args: &Args<'_>) -> Result<Output, ToolError> {
    let query = args.str("query")?;
    let limit = args.uint("limit", 5, 20) as usize;
    let offset = args.uint("offset", 0, 10_000) as usize;
    let kind = args.opt_str("kind").filter(|k| !k.is_empty());
    let Some(data) = dataset(&ctx.cwd) else {
        let looked: Vec<String> = candidates(&ctx.cwd)
            .iter()
            .map(|p| p.display().to_string())
            .collect();
        return Ok(Output::error(format!(
            "No bun-native dataset on this machine (looked in {}). Install it with `bun agent-plugin install --update`, or query the hosted index: {REMOTE}<words>.",
            looked.join(", ")
        )));
    };
    let ranked = data.search(query, kind);
    if ranked.is_empty() {
        return Ok(Output::text(format!(
            "No example matches \"{query}\" ({} entries in {}). Try an API name (Bun.serve, bun:sqlite) or other words; docs_search covers the prose docs.",
            data.entries.len(),
            data.path.display()
        )));
    }
    let end = (offset + limit).min(ranked.len());
    let version = data
        .entries
        .first()
        .map(|e| e.version.as_str())
        .unwrap_or("");
    let mut out = format!(
        "{} bun-native examples match \"{query}\" (Bun {version}, showing {}-{}). Write code like these: Bun APIs first, no Node/npm package where Bun has one.\n",
        ranked.len(),
        (offset + 1).min(end),
        end
    );
    for (rank, &(score, i)) in ranked.iter().enumerate().take(end).skip(offset) {
        let e = &data.entries[i];
        let _ = write!(
            out,
            "\n## {}. {} [{}] {score:.1}\n{}\n",
            rank + 1,
            e.id,
            e.kind,
            clip(&e.instruction, 400)
        );
        if !e.api.is_empty() {
            let _ = writeln!(out, "APIs: {}", e.api.join(", "));
        }
        if e.code.is_empty() {
            let _ = writeln!(out, "{}", clip(&e.response, 1200));
        } else {
            let lang = if e.lang.is_empty() { "ts" } else { &e.lang };
            let _ = writeln!(out, "```{lang}\n{}\n```", clip(e.code.trim_end(), 2400));
        }
        let _ = writeln!(out, "Source: {}", e.source);
    }
    if end < ranked.len() {
        let _ = write!(
            out,
            "\nMore: examples_search {{\"query\": \"{query}\", \"offset\": {end}}}\n"
        );
    }
    Ok(Output::text(out))
}

pub(crate) const TOOLS: &[Tool] = &[Tool {
    name: "examples_search",
    title: "Bun code examples",
    description: "Search the bun-native dataset: working Bun code for a task (Bun.serve, Bun.file, bun:sqlite, Bun.$, bun:test, Bun.sql, Bun.redis, Bun.s3, Bun.build, Bun.spawn, workers, FFI...), exact signatures from bun-types, and the Bun replacement of Node.js APIs and npm packages. Use before writing Bun code; docs_search covers the prose docs.",
    input_schema: r#"{"type":"object","properties":{"query":{"type":"string","description":"The task, an API name (Bun.serve, bun:sqlite) or an npm package to replace (express, jest)"},"kind":{"type":"string","enum":["example","signature","test","migration","cli","config","rule"],"description":"Only entries of this kind"},"limit":{"type":"integer","minimum":1,"maximum":20,"default":5},"offset":{"type":"integer","minimum":0,"default":0}},"required":["query"]}"#,
    annotations: Annotations::READ_ONLY,
    call: examples_search,
}];

#[cfg(test)]
mod tests {
    use super::*;

    const DATA: &str = r#"{"id":"example/bun-serve/1","kind":"example","instruction":"Write Bun code: Static routes (Server).","response":"r","code":"Bun.serve({ routes: {} });","lang":"ts","api":["Bun.serve"],"tags":["docs"],"source":"docs/runtime/http/server.mdx:8","version":"1.4.4"}
{"id":"migration/bun-sqlite/2","kind":"migration","instruction":"In a Bun project, what replaces the npm package better-sqlite3?","response":"Use bun:sqlite instead of better-sqlite3.","code":"","lang":"","api":["bun:sqlite"],"tags":["n2b"],"source":"packages.toml#better-sqlite3","version":"1.4.4"}
not json
"#;

    #[test]
    fn ranks_by_api_and_filters_by_kind() {
        let d = Dataset::parse(PathBuf::from("x.jsonl"), DATA);
        assert_eq!(d.entries.len(), 2);
        assert_eq!(d.search("Bun.serve routes", None)[0].1, 0);
        assert_eq!(d.search("better-sqlite3", None)[0].1, 1);
        assert!(d.search("better-sqlite3", Some("example")).is_empty());
    }
}
