//! `graph_query` / `graph_symbols` / `graph_callers` / `graph_path` / `graph_community` /
//! `graph_impact`: the native code graph of `bun_graph`
//! (Rust, TypeScript/JavaScript and Markdown extractors, the engine behind `bun:graph-index`),
//! built over the working directory (or `path` under it), kept in memory for the session and in
//! the result cache across sessions, keyed by a fingerprint of file sizes and mtimes.

use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::fmt::Write as _;
use std::hash::{DefaultHasher, Hash, Hasher};
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};
use std::time::UNIX_EPOCH;

use bun_graph::api::{
    GraphDocument, GraphLimits, GraphNode, GraphOperation, GraphRequest, GraphResult, GraphScope,
    PackageContext, SourceFile,
};
use bun_graph::extract::Language;

use crate::cache::Cache;
use crate::registry::{Annotations, Args, Context, Output, Tool, ToolError};

struct Built {
    graph: Arc<GraphDocument>,
    files: usize,
    skipped: usize,
    /// `built`, or the cache backend the graph came from.
    origin: &'static str,
    /// Communities, modularity and the most connected nodes, computed on first use.
    analyzed: Mutex<Option<Arc<Analyzed>>>,
}

struct Analyzed {
    graph: GraphDocument,
    modularity: f64,
    god_nodes: Vec<(String, usize)>,
}

#[derive(Default)]
struct GraphState {
    graphs: Mutex<HashMap<(PathBuf, u64), Arc<Built>>>,
}

fn scope() -> GraphScope {
    GraphScope {
        source: "graph:mcp".into(),
        profile: "workspace".into(),
    }
}

fn collect(
    root: &Path,
    base: &Path,
    max_files: usize,
) -> (Vec<(String, PathBuf, u64, u64)>, usize) {
    let mut files = Vec::new();
    let mut skipped = 0usize;
    for entry in ignore::WalkBuilder::new(base)
        .hidden(true)
        .build()
        .flatten()
    {
        if !entry.file_type().is_some_and(|t| t.is_file()) {
            continue;
        }
        let path = entry.path();
        let Ok(rel) = path.strip_prefix(root) else {
            continue;
        };
        let rel = rel
            .components()
            .map(|c| c.as_os_str().to_string_lossy())
            .collect::<Vec<_>>()
            .join("/");
        if Language::of_path(&rel).is_none() {
            continue;
        }
        let Ok(meta) = entry.metadata() else {
            continue;
        };
        if meta.len() > 1024 * 1024 || files.len() >= max_files {
            skipped += 1;
            continue;
        }
        let mtime = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_nanos() as u64)
            .unwrap_or(0);
        files.push((rel, path.to_path_buf(), meta.len(), mtime));
    }
    files.sort_by(|a, b| a.0.cmp(&b.0));
    (files, skipped)
}

fn build(ctx: &Context, args: &Args<'_>) -> Result<Arc<Built>, ToolError> {
    let root = ctx.cwd.clone();
    let base = match args.opt_str("path") {
        Some(p) => root.join(p),
        None => root.clone(),
    };
    if !base.starts_with(&root) || !base.exists() {
        return Err(ToolError::InvalidArgs(format!(
            "path must be an existing directory under {}",
            root.display()
        )));
    }
    let max_files = args.uint("max_files", 3000, 20_000) as usize;
    let (files, skipped) = collect(&root, &base, max_files);
    let mut h = DefaultHasher::new();
    for (rel, _, len, mtime) in &files {
        (rel, len, mtime).hash(&mut h);
    }
    let key = (base.clone(), h.finish());
    let state = ctx.state::<GraphState>();
    if !args.bool("refresh", false) {
        if let Some(b) = state
            .graphs
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .get(&key)
        {
            return Ok(Arc::clone(b));
        }
    }
    let cache_key = format!("graph:{}:{:016x}", base.display(), key.1);
    let cache = ctx.state::<Cache>();
    let cached = if args.bool("refresh", false) {
        None
    } else {
        cache
            .get(&cache_key)
            .and_then(|bytes| serde_json::from_slice::<GraphDocument>(&bytes).ok())
    };
    let mut origin = "built";
    let graph = match cached {
        Some(graph) => {
            origin = cache.backend();
            graph
        }
        None => {
            let mut sources = Vec::with_capacity(files.len());
            for (rel, path, _, _) in &files {
                if let Ok(content) = std::fs::read_to_string(path) {
                    sources.push(SourceFile {
                        path: rel.clone(),
                        content,
                    });
                }
            }
            let request = GraphRequest {
                scope: scope(),
                limits: GraphLimits {
                    max_files: max_files.max(1),
                    ..GraphLimits::default()
                },
                operation: GraphOperation::Build {
                    files: sources,
                    packages: PackageContext::default(),
                    root: Some(root.to_string_lossy().into_owned()),
                    built_at_commit: None,
                },
            };
            let response = bun_graph::execute(request, &AtomicBool::new(false))?;
            let GraphResult::Build { graph, .. } = response.result else {
                return Err(ToolError::Failed(
                    "graph build returned another operation".into(),
                ));
            };
            if let Ok(json) = serde_json::to_vec(&graph) {
                cache.set(&cache_key, &json, 7 * 24 * 3600);
            }
            graph
        }
    };
    let built = Arc::new(Built {
        graph: Arc::new(graph),
        files: files.len(),
        skipped,
        origin,
        analyzed: Mutex::new(None),
    });
    state
        .graphs
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .insert(key, Arc::clone(&built));
    Ok(built)
}

fn header(b: &Built) -> String {
    let mut s = format!(
        "graph: {} files, {} nodes, {} edges ({})",
        b.files,
        b.graph.nodes.len(),
        b.graph.links.len(),
        b.origin
    );
    if b.skipped > 0 {
        let _ = write!(
            s,
            " ({} files over the limits skipped; narrow with `path`)",
            b.skipped
        );
    }
    s.push('\n');
    s
}

fn location(file: &Option<String>, loc: &Option<String>) -> String {
    match (file, loc) {
        (Some(f), Some(l)) => format!("{f}:{}", l.trim_start_matches('L')),
        (Some(f), None) => f.clone(),
        _ => String::new(),
    }
}

fn graph_query(ctx: &Context, args: &Args<'_>) -> Result<Output, ToolError> {
    let question = args.str("question")?.to_owned();
    let built = build(ctx, args)?;
    let default_budget = ctx
        .profile
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .max_tokens
        * 3
        / 4;
    let budget = args
        .uint("budget_tokens", default_budget as u64, 20_000)
        .max(200) as usize;
    let request = GraphRequest {
        scope: scope(),
        limits: GraphLimits::default(),
        operation: GraphOperation::Query {
            graph: (*built.graph).clone(),
            question,
            depth: args.uint("depth", 2, 6) as usize,
            budget_tokens: budget,
            starts: 4,
            relations: args.strings("relations"),
        },
    };
    let response = bun_graph::execute(request, &AtomicBool::new(false))?;
    let GraphResult::Query { text, starts, .. } = response.result else {
        return Err(ToolError::Failed(
            "graph query returned another operation".into(),
        ));
    };
    Ok(Output::text(format!(
        "{}start nodes: {}\n\n{text}",
        header(&built),
        starts.join(", ")
    )))
}

fn graph_symbols(ctx: &Context, args: &Args<'_>) -> Result<Output, ToolError> {
    let query = args.str("query")?.to_lowercase();
    let kind = args.opt_str("kind").map(str::to_lowercase);
    let limit = args.uint("limit", 30, 500) as usize;
    let offset = args.uint("offset", 0, 1_000_000) as usize;
    let built = build(ctx, args)?;
    let mut hits: Vec<(u8, &bun_graph::api::GraphNode)> = built
        .graph
        .nodes
        .iter()
        .filter_map(|n| {
            let label = n.label.to_lowercase();
            let rank = if label == query {
                0
            } else if label.starts_with(&query) {
                1
            } else if label.contains(&query) || n.id.to_lowercase().contains(&query) {
                2
            } else {
                return None;
            };
            if let Some(k) = &kind {
                if !format!("{:?}", n.file_type)
                    .to_lowercase()
                    .contains(k.as_str())
                {
                    return None;
                }
            }
            Some((rank, n))
        })
        .collect();
    hits.sort_by(|a, b| a.0.cmp(&b.0).then(a.1.label.len().cmp(&b.1.label.len())));
    let mut out = header(&built);
    let _ = writeln!(out, "{} symbols match \"{query}\":", hits.len());
    for (_, n) in hits.iter().skip(offset).take(limit) {
        let _ = writeln!(
            out,
            "- {} ({:?}) {} [{}]",
            n.label,
            n.file_type,
            location(&n.source_file, &n.source_location),
            n.id
        );
    }
    if offset + limit < hits.len() {
        let _ = writeln!(
            out,
            "More: graph_symbols with \"offset\": {}",
            offset + limit
        );
    }
    Ok(Output::text(out))
}

/// Ids of the nodes named `name`: an exact id, or a label equal to it or ending in `::name` / `.name`.
fn resolve<'g>(g: &'g GraphDocument, name: &str) -> Vec<&'g str> {
    let lower = name.strip_suffix("()").unwrap_or(name).to_lowercase();
    let (colons, dot) = (format!("::{lower}"), format!(".{lower}"));
    g.nodes
        .iter()
        .filter(|n| {
            let label = n
                .label
                .strip_suffix("()")
                .unwrap_or(&n.label)
                .to_lowercase();
            n.id == name || label == lower || label.ends_with(&colons) || label.ends_with(&dot)
        })
        .map(|n| n.id.as_str())
        .collect()
}

fn not_found(name: &str) -> Output {
    Output::error(format!(
        "No node named \"{name}\"; find the exact name with graph_symbols."
    ))
}

fn graph_path(ctx: &Context, args: &Args<'_>) -> Result<Output, ToolError> {
    let (from, to) = (args.str("from")?, args.str("to")?);
    let built = build(ctx, args)?;
    let g = &*built.graph;
    let Some(from_id) = resolve(g, from).first().copied() else {
        return Ok(not_found(from));
    };
    let Some(to_id) = resolve(g, to).first().copied() else {
        return Ok(not_found(to));
    };
    let request = GraphRequest {
        scope: scope(),
        limits: GraphLimits::default(),
        operation: GraphOperation::Path {
            graph: g.clone(),
            from: from_id.to_owned(),
            to: to_id.to_owned(),
            directed: args.bool("directed", false),
            relations: args.strings("relations"),
        },
    };
    let response = bun_graph::execute(request, &AtomicBool::new(false))?;
    let GraphResult::Path { hops } = response.result else {
        return Err(ToolError::Failed(
            "graph path returned another operation".into(),
        ));
    };
    let by_id: HashMap<&str, &GraphNode> = g.nodes.iter().map(|n| (n.id.as_str(), n)).collect();
    let mut out = header(&built);
    let Some(hops) = hops else {
        let _ = writeln!(out, "no path from {from_id} to {to_id}");
        return Ok(Output::text(out));
    };
    let _ = writeln!(
        out,
        "{} hops from {from_id} to {to_id}:",
        hops.len().saturating_sub(1)
    );
    for hop in &hops {
        if let Some(edge) = &hop.edge {
            let arrow = if hop.forward == Some(false) {
                "<-"
            } else {
                "->"
            };
            let _ = writeln!(
                out,
                "  {arrow} {} ({})",
                edge.relation,
                location(&edge.source_file, &edge.source_location)
            );
        }
        let node = by_id.get(hop.node.as_str());
        let _ = writeln!(
            out,
            "- {} {}",
            node.map_or(hop.node.as_str(), |n| n.label.as_str()),
            node.map(|n| location(&n.source_file, &n.source_location))
                .unwrap_or_default()
        );
    }
    Ok(Output::text(out))
}

fn analyze(built: &Built) -> Result<Arc<Analyzed>, ToolError> {
    let mut slot = built.analyzed.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(a) = &*slot {
        return Ok(Arc::clone(a));
    }
    let request = GraphRequest {
        scope: scope(),
        limits: GraphLimits::default(),
        operation: GraphOperation::Analyze {
            graph: (*built.graph).clone(),
            top: 50,
        },
    };
    let response = bun_graph::execute(request, &AtomicBool::new(false))?;
    let GraphResult::Analyze {
        graph,
        modularity,
        god_nodes,
    } = response.result
    else {
        return Err(ToolError::Failed(
            "graph analyze returned another operation".into(),
        ));
    };
    let analyzed = Arc::new(Analyzed {
        graph,
        modularity,
        god_nodes: god_nodes.into_iter().map(|n| (n.id, n.degree)).collect(),
    });
    *slot = Some(Arc::clone(&analyzed));
    Ok(analyzed)
}

fn graph_community(ctx: &Context, args: &Args<'_>) -> Result<Output, ToolError> {
    let built = build(ctx, args)?;
    let top = args.uint("top", 15, 200) as usize;
    let a = analyze(&built)?;
    let mut degree: HashMap<&str, usize> = HashMap::new();
    for link in &a.graph.links {
        *degree.entry(link.source.as_str()).or_default() += 1;
        *degree.entry(link.target.as_str()).or_default() += 1;
    }
    let mut groups: BTreeMap<i64, Vec<&GraphNode>> = BTreeMap::new();
    for n in &a.graph.nodes {
        if let Some(c) = n.community {
            groups.entry(c).or_default().push(n);
        }
    }
    for members in groups.values_mut() {
        members.sort_by(|x, y| {
            degree
                .get(y.id.as_str())
                .cmp(&degree.get(x.id.as_str()))
                .then(x.label.cmp(&y.label))
        });
    }
    let mut out = header(&built);
    if let Some(name) = args.opt_str("node") {
        let ids = resolve(&a.graph, name);
        let Some(c) = a
            .graph
            .nodes
            .iter()
            .find(|n| ids.contains(&n.id.as_str()))
            .and_then(|n| n.community)
        else {
            return Ok(not_found(name));
        };
        let members = &groups[&c];
        let shown = top * 4;
        let _ = writeln!(
            out,
            "community {c} \"{}\" of {name}: {} nodes",
            members[0].community_name.as_deref().unwrap_or(""),
            members.len()
        );
        for n in members.iter().take(shown) {
            let _ = writeln!(
                out,
                "- {} {}",
                n.label,
                location(&n.source_file, &n.source_location)
            );
        }
        if members.len() > shown {
            let _ = writeln!(out, "… {} more", members.len() - shown);
        }
        return Ok(Output::text(out));
    }
    let _ = writeln!(
        out,
        "{} communities, modularity {:.3}; largest first:",
        groups.len(),
        a.modularity
    );
    for (c, members) in groups.iter().take(top) {
        let names: Vec<&str> = members.iter().take(6).map(|n| n.label.as_str()).collect();
        let _ = writeln!(
            out,
            "- {c} \"{}\" ({} nodes): {}",
            members[0].community_name.as_deref().unwrap_or(""),
            members.len(),
            names.join(", ")
        );
    }
    let _ = writeln!(out, "\nmost connected nodes:");
    for (id, d) in a.god_nodes.iter().take(top) {
        let _ = writeln!(out, "- {id} (degree {d})");
    }
    Ok(Output::text(out))
}

fn graph_impact(ctx: &Context, args: &Args<'_>) -> Result<Output, ToolError> {
    let symbol = args.str("symbol")?;
    let depth = args.uint("depth", 3, 8) as usize;
    let limit = args.uint("limit", 100, 2000) as usize;
    let mut relations = args.strings("relations");
    if relations.is_empty() {
        relations = ["calls", "imports", "imports_from", "references", "method"]
            .map(String::from)
            .to_vec();
    }
    let built = build(ctx, args)?;
    let g = &*built.graph;
    let start = resolve(g, symbol);
    if start.is_empty() {
        return Ok(not_found(symbol));
    }
    let mut dependents: HashMap<&str, Vec<&str>> = HashMap::new();
    for link in g.links.iter().filter(|l| relations.contains(&l.relation)) {
        dependents
            .entry(link.target.as_str())
            .or_default()
            .push(link.source.as_str());
    }
    let mut level_of: HashMap<&str, usize> = start.iter().map(|id| (*id, 0)).collect();
    let mut frontier = start;
    for level in 1..=depth {
        let mut next = Vec::new();
        for id in &frontier {
            for dep in dependents.get(id).into_iter().flatten() {
                if !level_of.contains_key(dep) {
                    level_of.insert(dep, level);
                    next.push(*dep);
                }
            }
        }
        if next.is_empty() {
            break;
        }
        frontier = next;
    }
    let by_id: HashMap<&str, &GraphNode> = g.nodes.iter().map(|n| (n.id.as_str(), n)).collect();
    let mut hits: Vec<(usize, &str)> = level_of
        .iter()
        .filter(|(_, d)| **d > 0)
        .map(|(id, d)| (*d, *id))
        .collect();
    hits.sort_unstable();
    let files: BTreeSet<&str> = hits
        .iter()
        .filter_map(|(_, id)| by_id.get(id).and_then(|n| n.source_file.as_deref()))
        .collect();
    let mut out = header(&built);
    let _ = writeln!(
        out,
        "changing {symbol} can affect {} nodes in {} files (up to {depth} levels over {}):",
        hits.len(),
        files.len(),
        relations.join(",")
    );
    for (d, id) in hits.iter().take(limit) {
        let n = by_id.get(id);
        let _ = writeln!(
            out,
            "- [{d}] {} {}",
            n.map_or(*id, |n| n.label.as_str()),
            n.map(|n| location(&n.source_file, &n.source_location))
                .unwrap_or_default()
        );
    }
    if hits.len() > limit {
        let _ = writeln!(out, "… {} more (raise `limit`)", hits.len() - limit);
    }
    let _ = writeln!(out, "\nfiles:");
    for f in files.iter().take(limit) {
        let _ = writeln!(out, "- {f}");
    }
    Ok(Output::text(out))
}

fn graph_callers(ctx: &Context, args: &Args<'_>) -> Result<Output, ToolError> {
    let symbol = args.str("symbol")?;
    let callees = args.opt_str("direction") == Some("callees");
    let mut relations = args.strings("relations");
    if relations.is_empty() {
        relations.push("calls".into());
    }
    let limit = args.uint("limit", 50, 1000) as usize;
    let built = build(ctx, args)?;
    let g = &*built.graph;
    let targets = resolve(g, symbol);
    if targets.is_empty() {
        return Ok(not_found(symbol));
    }
    let by_id: HashMap<&str, &bun_graph::api::GraphNode> =
        g.nodes.iter().map(|n| (n.id.as_str(), n)).collect();
    let mut out = header(&built);
    let _ = writeln!(
        out,
        "{} of {} ({} node{}), relations {}:",
        if callees { "callees" } else { "callers" },
        symbol,
        targets.len(),
        if targets.len() == 1 { "" } else { "s" },
        relations.join(",")
    );
    let mut count = 0usize;
    for link in &g.links {
        if !relations.contains(&link.relation) {
            continue;
        }
        let (anchor, other) = if callees {
            (&link.source, &link.target)
        } else {
            (&link.target, &link.source)
        };
        if !targets.contains(&anchor.as_str()) {
            continue;
        }
        count += 1;
        if count > limit {
            continue;
        }
        let other_node = by_id.get(other.as_str());
        let label = other_node
            .map(|n| n.label.as_str())
            .unwrap_or(other.as_str());
        let at = location(&link.source_file, &link.source_location);
        let defined = other_node
            .map(|n| location(&n.source_file, &n.source_location))
            .unwrap_or_default();
        let _ = writeln!(
            out,
            "- {label} at {at} (defined {defined}; {:?})",
            link.confidence
        );
    }
    if count > limit {
        let _ = writeln!(out, "… {} more (raise `limit`)", count - limit);
    }
    if count == 0 {
        let _ = writeln!(out, "none found");
    }
    Ok(Output::text(out))
}

const COMMON: &str = r#""path":{"type":"string","description":"Directory under the working directory to index (default: all of it)"},"max_files":{"type":"integer","minimum":1,"maximum":20000,"default":3000},"refresh":{"type":"boolean","description":"Rebuild instead of reusing the cached graph"}"#;

macro_rules! schema {
    ($props:literal, $required:literal) => {
        const_format::concatcp!(
            r#"{"type":"object","properties":{"#,
            $props,
            ",",
            COMMON,
            r#"},"required":"#,
            $required,
            "}"
        )
    };
}

pub(crate) const TOOLS: &[Tool] = &[
    Tool {
        name: "graph_query",
        title: "Query the code graph",
        description: "Answer a question about the code of the working directory from its native code graph (Rust, TypeScript/JavaScript, Markdown): finds the best-matching symbols and walks their neighbourhood within a token budget.",
        input_schema: schema!(
            r#""question":{"type":"string"},"depth":{"type":"integer","minimum":1,"maximum":6,"default":2},"budget_tokens":{"type":"integer","minimum":200,"maximum":20000,"default":4000},"relations":{"type":"array","items":{"type":"string"},"description":"Only follow these relations (calls, contains, imports, references, method)"}"#,
            r#"["question"]"#
        ),
        annotations: Annotations::READ_ONLY,
        call: graph_query,
    },
    Tool {
        name: "graph_symbols",
        title: "Find symbols",
        description: "Find functions, types, modules and other graph nodes by name in the working directory, with their file and line.",
        input_schema: schema!(
            r#""query":{"type":"string","description":"Name or part of it (case-insensitive)"},"kind":{"type":"string","description":"Keep nodes whose kind contains this"},"limit":{"type":"integer","minimum":1,"maximum":500,"default":30},"offset":{"type":"integer","minimum":0,"default":0}"#,
            r#"["query"]"#
        ),
        annotations: Annotations::READ_ONLY,
        call: graph_symbols,
    },
    Tool {
        name: "graph_callers",
        title: "Find callers or callees",
        description: "List the call sites of a symbol (or what it calls, with direction \"callees\") from the native code graph.",
        input_schema: schema!(
            r#""symbol":{"type":"string","description":"Node label (function name) or id from graph_symbols"},"direction":{"type":"string","enum":["callers","callees"],"default":"callers"},"relations":{"type":"array","items":{"type":"string"},"description":"Edge relations to follow (default: calls)"},"limit":{"type":"integer","minimum":1,"maximum":1000,"default":50}"#,
            r#"["symbol"]"#
        ),
        annotations: Annotations::READ_ONLY,
        call: graph_callers,
    },
    Tool {
        name: "graph_path",
        title: "Path between symbols",
        description: "Shortest path between two symbols or files of the code graph, with the relation and location of every hop: how A reaches B.",
        input_schema: schema!(
            r#""from":{"type":"string","description":"Node label or id"},"to":{"type":"string","description":"Node label or id"},"directed":{"type":"boolean","default":false,"description":"Follow edges in their direction only"},"relations":{"type":"array","items":{"type":"string"}}"#,
            r#"["from","to"]"#
        ),
        annotations: Annotations::READ_ONLY,
        call: graph_path,
    },
    Tool {
        name: "graph_community",
        title: "Code communities",
        description: "Modules of the code found by community detection (Louvain) on the code graph: the largest communities with their main members and the most connected nodes, or with `node` the community of that symbol.",
        input_schema: schema!(
            r#""node":{"type":"string","description":"List the community of this symbol"},"top":{"type":"integer","minimum":1,"maximum":200,"default":15}"#,
            r#"[]"#
        ),
        annotations: Annotations::READ_ONLY,
        call: graph_community,
    },
    Tool {
        name: "graph_impact",
        title: "Change impact",
        description: "What depends on a symbol, transitively (callers, importers, references) up to a depth: the nodes and files a change to it can affect.",
        input_schema: schema!(
            r#""symbol":{"type":"string","description":"Node label or id"},"depth":{"type":"integer","minimum":1,"maximum":8,"default":3},"relations":{"type":"array","items":{"type":"string"},"description":"Default: calls, imports, imports_from, references, method"},"limit":{"type":"integer","minimum":1,"maximum":2000,"default":100}"#,
            r#"["symbol"]"#
        ),
        annotations: Annotations::READ_ONLY,
        call: graph_impact,
    },
];
