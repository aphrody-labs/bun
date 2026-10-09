//! The code graph of a workspace, for what no single language server sees:
//! - calls between functions, from `bun_graph` (Rust, TypeScript/JavaScript and Markdown);
//! - links between languages: the C ABI symbols that Rust, C/C++ and Zig share by name, the
//!   `$newRustFunction`/`$newCppFunction`/`$newZigFunction`/`$rust`/`$cpp`/`$zig` calls of Bun's
//!   builtin modules, and the Rust methods that `.classes.ts` definitions bind.
//!
//! [`Graphs`] builds one [`Index`] per workspace root in the background, and again after
//! [`Graphs::touch`]; files whose size and modification time did not change keep their extraction.

use std::collections::{HashMap, HashSet};
use std::fmt::Write as _;
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Condvar, Mutex, MutexGuard};
use std::time::{Duration, Instant, SystemTime};

use bun_graph::Graph;
use bun_graph::extract::{self, FileExtract};

use crate::Options;
use crate::links::{self, AbiSite, ClassMember, Family, Link, NativeCall, Scan, Site, Symbol, bare_name, defines, find_word, snake_case};
use crate::protocol::path_key;

/// Directories that the graph skips, at any depth.
const SKIPPED: [&str; 10] = ["vendor", "third_party", "node_modules", "target", "build", "dist", "out", "test", "tests", "fixtures"];
const MAX_FILE: u64 = 1024 * 1024;
/// An index older than this is checked against the disk before [`Graphs::wait`] returns it.
const FRESH: Duration = Duration::from_secs(5);

struct Cached {
    length: u64,
    modified: Option<SystemTime>,
    extract: Option<FileExtract>,
    scan: Scan,
}

/// The graph of one workspace root.
pub struct Index {
    root: PathBuf,
    graph: Graph,
    sites: Vec<Option<Site>>,
    names: Vec<String>,
    by_name: HashMap<String, Vec<usize>>,
    by_file: HashMap<String, Vec<usize>>,
    abi: HashMap<String, Vec<AbiSite>>,
    /// By the `path_key` of the file of the first site.
    links: HashMap<String, Vec<(Site, Link)>>,
    files: usize,
    elapsed: Duration,
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(std::sync::PoisonError::into_inner)
}


fn wanted(rel: &str) -> bool {
    extract::Language::of_path(rel).is_some() || Family::of(rel).is_some()
}

/// The files of the graph of `root`: relative path, absolute path, length and modification time.
fn walk(root: &Path, max_files: usize) -> Vec<(String, PathBuf, u64, Option<SystemTime>)> {
    let mut files = Vec::new();
    let walker = ignore::WalkBuilder::new(root)
        .hidden(true)
        .filter_entry(|entry| {
            !(entry.depth() > 0
                && entry.file_type().is_some_and(|it| it.is_dir())
                && entry.file_name().to_str().is_some_and(|name| SKIPPED.contains(&name)))
        })
        .build();
    for entry in walker.flatten() {
        if files.len() >= max_files {
            break;
        }
        if !entry.file_type().is_some_and(|it| it.is_file()) {
            continue;
        }
        let Ok(rel) = entry.path().strip_prefix(root) else { continue };
        let rel = rel.components().map(|it| it.as_os_str().to_string_lossy()).collect::<Vec<_>>().join("/");
        if !wanted(&rel) {
            continue;
        }
        let Ok(metadata) = entry.metadata() else { continue };
        if metadata.len() > MAX_FILE {
            continue;
        }
        files.push((rel, entry.path().to_path_buf(), metadata.len(), metadata.modified().ok()));
    }
    files.sort_by(|a, b| a.0.cmp(&b.0));
    files
}

fn kind_of(graph: &Graph, node: usize) -> &'static str {
    let node = &graph.nodes[node];
    let file = node.file.as_deref().unwrap_or("");
    if node.loc.as_deref() == Some("L1") && file.rsplit('/').next() == Some(node.label.as_str()) {
        "file"
    } else if node.lang.as_deref() == Some("markdown") || file.ends_with(".md") || file.ends_with(".mdx") {
        "section"
    } else if node.label.starts_with('.') && node.label.ends_with("()") {
        "method"
    } else if node.label.ends_with("()") {
        "function"
    } else {
        "type"
    }
}

impl Index {
    /// Reads and extracts the files of `root` that changed since `cache` saw them.
    fn build(root: &Path, options: &Options, cache: &Mutex<HashMap<String, Cached>>) -> Index {
        let started = Instant::now();
        let files = walk(root, options.graph_files);
        let cancelled = AtomicBool::new(false);
        let stale: Vec<usize> = {
            let cache = lock(cache);
            (0..files.len())
                .filter(|&i| {
                    let (rel, _, length, modified) = &files[i];
                    cache.get(rel).is_none_or(|it| it.length != *length || it.modified != *modified)
                })
                .collect()
        };
        let jobs = options.jobs.max(1);
        let fresh: Vec<(String, Cached)> = std::thread::scope(|scope| {
            let handles: Vec<_> = (0..jobs)
                .map(|job| {
                    let (files, stale, cancelled) = (&files, &stale, &cancelled);
                    scope.spawn(move || {
                        let mut out = Vec::new();
                        for &i in stale.iter().skip(job).step_by(jobs) {
                            let (rel, path, length, modified) = &files[i];
                            let Ok(text) = std::fs::read_to_string(path) else { continue };
                            let extract = (extract::Language::of_path(rel).is_some())
                                .then(|| extract::extract_bounded(rel, text.as_bytes(), 128, cancelled).ok())
                                .flatten();
                            let labels: Vec<(String, String)> =
                                extract.iter().flat_map(|it| it.nodes.iter().map(|node| (node.label.clone(), node.loc.clone()))).collect();
                            let scan = links::scan_file(path, rel, &text, &labels);
                            out.push((rel.clone(), Cached { length: *length, modified: *modified, extract, scan }));
                        }
                        out
                    })
                })
                .collect();
            handles.into_iter().filter_map(|it| it.join().ok()).flatten().collect()
        });
        let mut cache = lock(cache);
        let present: HashSet<&str> = files.iter().map(|it| it.0.as_str()).collect();
        cache.retain(|rel, _| present.contains(rel.as_str()));
        cache.extend(fresh);
        let extracts: Vec<FileExtract> = files.iter().filter_map(|(rel, ..)| cache.get(rel)?.extract.clone()).collect();
        let graph = extract::resolve::assemble_with_cancellable(extracts, &extract::resolve::AssembleContext::default(), &cancelled)
            .map(|(graph, _)| graph)
            .unwrap_or_default();
        let mut index = Index {
            root: root.to_path_buf(),
            sites: Vec::with_capacity(graph.nodes.len()),
            names: Vec::with_capacity(graph.nodes.len()),
            by_name: HashMap::new(),
            by_file: HashMap::new(),
            abi: HashMap::new(),
            links: HashMap::new(),
            files: files.len(),
            elapsed: Duration::ZERO,
            graph: Graph::default(),
        };
        for (i, node) in graph.nodes.iter().enumerate() {
            let name = bare_name(&node.label).to_owned();
            let site = node.file.as_deref().and_then(|file| {
                let line = node.loc.as_deref()?.strip_prefix('L')?.parse::<u32>().ok()?;
                let (start, end) = (cache.get(file))
                    .and_then(|it| it.scan.columns.get(&(node.label.clone(), line)).copied())
                    .unwrap_or((0, 0));
                Some(Site { path: root.join(file), line: line.saturating_sub(1), start, end })
            });
            if let Some(site) = &site {
                index.by_file.entry(path_key(&site.path)).or_default().push(i);
            }
            index.by_name.entry(name.clone()).or_default().push(i);
            index.sites.push(site);
            index.names.push(name);
        }
        index.graph = graph;
        let mut natives = Vec::new();
        let mut classes = Vec::new();
        for (rel, ..) in &files {
            let Some(cached) = cache.get(rel) else { continue };
            for (name, site) in &cached.scan.abi {
                index.abi.entry(name.clone()).or_default().push(site.clone());
            }
            natives.extend(cached.scan.natives.iter().cloned());
            classes.extend(cached.scan.classes.iter().cloned());
        }
        drop(cache);
        // A symbol of one language only is not a link.
        index.abi.retain(|_, sites| {
            let first = sites[0].family;
            sites.iter().any(|it| it.family != first)
        });
        for call in natives {
            for target in index.native_targets(&call, &files) {
                index.link(call.site.clone(), target, "js2native");
            }
        }
        for member in classes {
            for target in index.class_targets(&member) {
                index.link(member.site.clone(), target, "classes.ts");
            }
        }
        index.elapsed = started.elapsed();
        index
    }

    fn link(&mut self, from: Site, to: Site, why: &'static str) {
        let back = Link { to: from.clone(), why, definition: false };
        self.links.entry(path_key(&to.path)).or_default().push((to.clone(), back));
        self.links.entry(path_key(&from.path)).or_default().push((from, Link { to, why, definition: true }));
    }

    /// Nodes named `name` in files whose relative path ends with `file`.
    fn nodes_in(&self, file: &str, names: &[&str]) -> Vec<usize> {
        let suffix = file.replace('\\', "/");
        names
            .iter()
            .flat_map(|name| self.by_name.get(*name).into_iter().flatten().copied())
            .filter(|&i| {
                let path = self.graph.nodes[i].file.as_deref().unwrap_or("");
                path == suffix || path.ends_with(&format!("/{suffix}"))
            })
            .collect()
    }

    fn native_targets(&self, call: &NativeCall, files: &[(String, PathBuf, u64, Option<SystemTime>)]) -> Vec<Site> {
        let (owner, last) = call.name.rsplit_once('.').map_or((None, call.name.as_str()), |(owner, last)| (Some(owner), last));
        if call.family == Family::Rust {
            let snake = snake_case(last);
            let mut nodes = self.nodes_in(&call.file, &[last, snake.as_str()]);
            if let Some(owner) = owner
                && nodes.len() > 1
            {
                let owned: Vec<usize> = nodes.iter().copied().filter(|&i| self.parent_label(i).is_some_and(|it| it == owner)).collect();
                if !owned.is_empty() {
                    nodes = owned;
                }
            }
            let sites: Vec<Site> = nodes.into_iter().filter_map(|i| self.sites[i].clone()).collect();
            if !sites.is_empty() {
                return sites;
            }
        }
        if let Some(sites) = self.abi.get(last) {
            let defined: Vec<Site> = sites.iter().filter(|it| it.definition && it.family == call.family).map(|it| it.site.clone()).collect();
            if !defined.is_empty() {
                return defined;
            }
        }
        // A plain name in a C++ or Zig file: read the files of that name.
        let suffix = format!("/{}", call.file.replace('\\', "/"));
        let mut out = Vec::new();
        for (rel, path, ..) in files {
            if !(rel.ends_with(&suffix) || *rel == call.file) {
                continue;
            }
            let Ok(text) = std::fs::read_to_string(path) else { continue };
            for (number, line) in text.split('\n').enumerate() {
                let line = line.strip_suffix('\r').unwrap_or(line);
                if defines(call.family, line, last)
                    && let Some((start, end)) = find_word(line, last)
                {
                    out.push(Site { path: path.clone(), line: number as u32, start, end });
                    break;
                }
            }
        }
        out
    }

    /// The label of the type a method is declared in.
    fn parent_label(&self, node: usize) -> Option<&str> {
        self.graph.in_edges(node).iter().find_map(|&e| {
            let edge = &self.graph.edges[e];
            (edge.relation == "method").then(|| self.graph.nodes[edge.src].label.as_str())
        })
    }

    fn class_targets(&self, member: &ClassMember) -> Vec<Site> {
        let rust = |i: &usize| self.graph.nodes[*i].file.as_deref().is_some_and(|it| it.ends_with(".rs"));
        let nodes: Vec<usize> = match &member.member {
            None => (self.by_name.get(&member.class).into_iter().flatten())
                .copied()
                .filter(rust)
                .filter(|&i| kind_of(&self.graph, i) == "type")
                .collect(),
            Some(name) => {
                let snake = snake_case(name);
                [name.as_str(), snake.as_str()]
                    .iter()
                    .flat_map(|it| self.by_name.get(*it).into_iter().flatten().copied())
                    .filter(rust)
                    .filter(|&i| self.parent_label(i) == Some(member.class.as_str()))
                    .collect()
            }
        };
        nodes.into_iter().filter_map(|i| self.sites[i].clone()).collect()
    }

    /// The links from the position: those whose first site holds it, and the other uses of the
    /// C ABI symbol `word` in other languages.
    pub fn links_at(&self, path: &Path, line: u32, character: u32, word: Option<&str>) -> Vec<Link> {
        let key = path_key(path);
        let mut out: Vec<Link> = (self.links.get(&key).into_iter().flatten())
            .filter(|(site, _)| site.contains(&key, line, character))
            .map(|(_, link)| link.clone())
            .collect();
        if let Some(sites) = word.and_then(|word| self.abi.get(word)) {
            let here = Family::of(&path.to_string_lossy());
            for it in sites {
                if it.site.contains(&key, line, character) || (Some(it.family) == here && !it.definition) {
                    continue;
                }
                out.push(Link { to: it.site.clone(), why: "c-abi", definition: it.definition });
            }
        }
        let mut seen = HashSet::new();
        out.retain(|it| seen.insert(it.to.clone()));
        out
    }

    /// The node at the position, else the node named `word` closest to it.
    pub fn node_at(&self, path: &Path, line: u32, word: &str) -> Option<usize> {
        let key = path_key(path);
        let in_file = self.by_file.get(&key).map(Vec::as_slice).unwrap_or_default();
        (in_file.iter().copied())
            .filter(|&i| self.names[i] == word && kind_of(&self.graph, i) != "file")
            .min_by_key(|&i| self.sites[i].as_ref().map_or(u32::MAX, |it| it.line.abs_diff(line)))
            .or_else(|| {
                let named = self.by_name.get(word)?;
                (named.len() <= 3).then(|| named.iter().copied().find(|&i| kind_of(&self.graph, i) != "file")).flatten()
            })
    }

    pub fn symbol(&self, node: usize) -> Option<Symbol> {
        Some(Symbol { name: self.names[node].clone(), kind: kind_of(&self.graph, node), site: self.sites[node].clone()? })
    }

    fn neighbours(&self, node: usize, incoming: bool) -> Vec<(Symbol, Option<Site>)> {
        let edges = if incoming { self.graph.in_edges(node) } else { self.graph.out_edges(node) };
        let mut seen = HashSet::new();
        edges
            .iter()
            .map(|&e| &self.graph.edges[e])
            .filter(|edge| edge.relation == "calls")
            .filter_map(|edge| {
                let other = if incoming { edge.src } else { edge.dst };
                let symbol = self.symbol(other)?;
                let at = edge.loc.as_deref().and_then(|it| it.strip_prefix('L')?.parse::<u32>().ok());
                let call = match (edge.file.as_deref(), at) {
                    (Some(file), Some(line)) => {
                        let path = self.root.join(file);
                        Some(Site { path, line: line.saturating_sub(1), start: 0, end: 0 })
                    }
                    _ => None,
                };
                seen.insert(other).then_some((symbol, call))
            })
            .collect()
    }

    /// The functions that call `node`, with the line of the call.
    pub fn callers(&self, node: usize) -> Vec<(Symbol, Option<Site>)> {
        self.neighbours(node, true)
    }

    /// The functions that `node` calls, with the line of the call.
    pub fn callees(&self, node: usize) -> Vec<(Symbol, Option<Site>)> {
        self.neighbours(node, false)
    }

    /// Symbols whose name contains `query`, case-insensitively: exact names first, then prefixes.
    pub fn search(&self, query: &str, limit: usize) -> Vec<Symbol> {
        let query = query.to_lowercase();
        let mut found: Vec<(u8, usize)> = (0..self.names.len())
            .filter(|&i| kind_of(&self.graph, i) != "file")
            .filter_map(|i| {
                let name = self.names[i].to_lowercase();
                let rank = if name == query {
                    0
                } else if name.starts_with(&query) {
                    1
                } else if name.contains(&query) {
                    2
                } else {
                    return None;
                };
                Some((rank, i))
            })
            .collect();
        found.sort_by_key(|&(rank, i)| (rank, self.names[i].len()));
        found.into_iter().filter_map(|(_, i)| self.symbol(i)).take(limit).collect()
    }

    fn place(&self, site: &Site) -> String {
        let path = site.path.strip_prefix(&self.root).unwrap_or(&site.path);
        format!("{}:{}", path.display().to_string().replace('\\', "/"), site.line + 1)
    }

    /// What the graph knows of the symbol at the position, as Markdown, or `None` if nothing.
    pub fn describe(&self, path: &Path, line: u32, character: u32, word: &str) -> Option<String> {
        const MAX: usize = 8;
        let node = self.node_at(path, line, word);
        let links = self.links_at(path, line, character, Some(word));
        if node.is_none() && links.is_empty() {
            return None;
        }
        let mut out = String::new();
        let list = |out: &mut String, title: &str, items: &[(Symbol, Option<Site>)]| {
            if items.is_empty() {
                return;
            }
            let _ = write!(out, "\n- {title} ({}):", items.len());
            for (symbol, site) in items.iter().take(MAX) {
                let _ = write!(out, " `{}` {}", symbol.name, self.place(site.as_ref().unwrap_or(&symbol.site)));
                out.push(',');
            }
            out.pop();
            if items.len() > MAX {
                out.push_str(", …");
            }
        };
        match node.and_then(|it| self.symbol(it)) {
            Some(symbol) => {
                let _ = write!(out, "**bun graph**: {} `{}` at {}", symbol.kind, symbol.name, self.place(&symbol.site));
                let node = node.unwrap_or_default();
                list(&mut out, "called by", &self.callers(node));
                list(&mut out, "calls", &self.callees(node));
            }
            None => {
                let _ = write!(out, "**bun graph**: `{word}`");
            }
        }
        if !links.is_empty() {
            let _ = write!(out, "\n- linked ({}):", links.len());
            for link in links.iter().take(MAX) {
                let role = if link.definition { "defined" } else { "used" };
                let _ = write!(out, " {} {role} at {},", link.why, self.place(&link.to));
            }
            out.pop();
            if links.len() > MAX {
                out.push_str(", …");
            }
        }
        Some(out)
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    /// The files read.
    pub fn files(&self) -> usize {
        self.files
    }

    /// How long the last build took.
    pub fn elapsed(&self) -> Duration {
        self.elapsed
    }

    pub fn nodes(&self) -> usize {
        self.graph.nodes.len()
    }

    pub fn edges(&self) -> usize {
        self.graph.edges.len()
    }

    pub fn link_count(&self) -> usize {
        self.links.values().map(Vec::len).sum::<usize>() / 2 + self.abi.len()
    }
}

#[derive(Default)]
struct State {
    index: Option<Arc<Index>>,
    building: bool,
    dirty: bool,
    built: Option<Instant>,
}

struct Slot {
    root: PathBuf,
    state: Mutex<State>,
    done: Condvar,
    cache: Mutex<HashMap<String, Cached>>,
}

/// The graphs of the workspaces of one process, built on demand in the background.
pub struct Graphs {
    options: Options,
    slots: Mutex<HashMap<String, Arc<Slot>>>,
}

impl Graphs {
    pub fn new(options: &Options) -> Arc<Graphs> {
        Arc::new(Graphs { options: options.clone(), slots: Mutex::new(HashMap::new()) })
    }

    pub fn enabled(&self) -> bool {
        self.options.graph
    }

    fn slot(&self, root: &Path) -> Arc<Slot> {
        let mut slots = lock(&self.slots);
        Arc::clone(slots.entry(path_key(root)).or_insert_with(|| {
            Arc::new(Slot { root: root.to_path_buf(), state: Mutex::new(State::default()), done: Condvar::new(), cache: Mutex::new(HashMap::new()) })
        }))
    }

    /// Starts a build of the graph of `root` unless one runs.
    fn start(&self, slot: &Arc<Slot>, state: &mut State) {
        if state.building {
            return;
        }
        state.building = true;
        state.dirty = false;
        let (slot, options) = (Arc::clone(slot), self.options.clone());
        let spawned = std::thread::Builder::new().name("bun-lsp-graph".into()).spawn(move || {
            let index = Arc::new(Index::build(&slot.root, &options, &slot.cache));
            let mut state = lock(&slot.state);
            state.index = Some(index);
            state.building = false;
            state.built = Some(Instant::now());
            slot.done.notify_all();
        });
        if spawned.is_err() {
            state.building = false;
        }
    }

    /// The graph of `root` as it is now, or `None` while the first build runs. Starts a build if
    /// there is none, or if a file changed since the last one.
    pub fn current(&self, root: &Path) -> Option<Arc<Index>> {
        if !self.enabled() {
            return None;
        }
        let slot = self.slot(root);
        let mut state = lock(&slot.state);
        if state.index.is_none() || state.dirty {
            self.start(&slot, &mut state);
        }
        state.index.clone()
    }

    /// The graph of `root`, up to date with the disk, waiting up to `timeout` for it.
    pub fn wait(&self, root: &Path, timeout: Duration) -> Option<Arc<Index>> {
        if !self.enabled() {
            return None;
        }
        let deadline = Instant::now() + timeout;
        let slot = self.slot(root);
        let mut state = lock(&slot.state);
        if state.index.is_none() || state.dirty || state.built.is_none_or(|it| it.elapsed() > FRESH) {
            self.start(&slot, &mut state);
        }
        while state.building {
            let left = deadline.saturating_duration_since(Instant::now());
            if left.is_zero() {
                break;
            }
            state = slot.done.wait_timeout(state, left).unwrap_or_else(std::sync::PoisonError::into_inner).0;
        }
        state.index.clone()
    }

    /// The graphs built so far.
    pub fn built(&self) -> Vec<Arc<Index>> {
        let slots: Vec<Arc<Slot>> = lock(&self.slots).values().cloned().collect();
        slots.iter().filter_map(|slot| lock(&slot.state).index.clone()).collect()
    }

    /// A file of `root` changed: the next [`Graphs::current`] rebuilds the graph.
    pub fn touch(&self, root: &Path) {
        if let Some(slot) = lock(&self.slots).get(&path_key(root)) {
            lock(&slot.state).dirty = true;
        }
    }
}

