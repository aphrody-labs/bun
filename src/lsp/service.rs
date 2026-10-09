//! One question to the servers of a file, and its answer in a bounded, serializable shape.

use std::collections::HashMap;
use std::fmt::Write as _;
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{Duration, Instant, SystemTime};

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::ai::{self, Problem};
use crate::backend::Backend;
use crate::graph::{Graphs, Index};
use crate::language::{self, Language};
use crate::pool::{self, Group, Pool};
use crate::protocol::{self, path_key, path_to_uri, uri_to_path};
use crate::links::{self, Site};
use crate::{NativeDiagnostic, Options, TypeScriptDiagnostics};

/// What to ask.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum QueryKind {
    Diagnostics,
    Definition,
    References,
    Hover,
    /// The symbols of the file (`textDocument/documentSymbol`).
    Symbols,
    /// The symbols of the workspace whose names match `Query::text` (`workspace/symbol`).
    WorkspaceSymbols,
    /// Renames the symbol at the position to `Query::text` (`textDocument/rename`).
    Rename,
    /// What the code graph, the language server and the docs of the workspace know of the symbol
    /// at the position.
    Context,
    /// The functions that call the symbol at the position, and its uses in other languages.
    Callers,
    /// The functions that the symbol at the position calls, and its definitions in other languages.
    Callees,
    /// Lines around the position, or around the first error, fixed by the model of `BUN_LSP_AI`.
    Fix,
}

impl QueryKind {
    pub fn parse(name: &str) -> Option<QueryKind> {
        Some(match name {
            "diagnostics" | "diag" | "check" => QueryKind::Diagnostics,
            "definition" | "def" | "goto" => QueryKind::Definition,
            "references" | "refs" => QueryKind::References,
            "hover" | "type" => QueryKind::Hover,
            "symbols" | "outline" => QueryKind::Symbols,
            "workspace-symbols" | "wsymbols" => QueryKind::WorkspaceSymbols,
            "rename" => QueryKind::Rename,
            "context" | "ctx" | "explain" => QueryKind::Context,
            "callers" | "incoming" => QueryKind::Callers,
            "callees" | "outgoing" => QueryKind::Callees,
            "fix" => QueryKind::Fix,
            _ => return None,
        })
    }

    fn needs_position(self) -> bool {
        matches!(
            self,
            QueryKind::Definition
                | QueryKind::References
                | QueryKind::Hover
                | QueryKind::Rename
                | QueryKind::Context
                | QueryKind::Callers
                | QueryKind::Callees
        )
    }

    /// Answered by the code graph without a language server.
    fn of_graph(self) -> bool {
        matches!(self, QueryKind::Context | QueryKind::Callers | QueryKind::Callees | QueryKind::Fix)
    }
}

/// A question about a file. Lines and columns are 1-based; columns count characters.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Query {
    pub kind: QueryKind,
    /// The file, or for `WorkspaceSymbols` a file or directory of the workspace. Relative paths are
    /// resolved against the working directory of the process that runs the query.
    pub file: PathBuf,
    #[serde(default)]
    pub line: Option<u32>,
    #[serde(default)]
    pub column: Option<u32>,
    /// The new name of `Rename`, the query of `WorkspaceSymbols`.
    #[serde(default)]
    pub text: Option<String>,
    /// The most items; `Options::limit` if absent.
    #[serde(default)]
    pub limit: Option<usize>,
    /// `Rename`: write the edits to the files.
    #[serde(default)]
    pub apply: bool,
    /// How long it may take; `Options::timeout` if absent.
    #[serde(default)]
    pub timeout_ms: Option<u64>,
}

impl Query {
    pub fn new(kind: QueryKind, file: PathBuf) -> Query {
        Query { kind, file, line: None, column: None, text: None, limit: None, apply: false, timeout_ms: None }
    }

    pub fn at(kind: QueryKind, file: PathBuf, line: u32, column: u32) -> Query {
        Query { line: Some(line), column: Some(column), ..Query::new(kind, file) }
    }

    /// `file` made absolute against the working directory of this process.
    pub fn absolute(mut self) -> Query {
        if let Ok(file) = std::path::absolute(&self.file) {
            self.file = file;
        }
        self
    }
}

/// A place in a file, with what is there. Lines and columns are 1-based; columns count characters.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    pub path: PathBuf,
    pub line: u32,
    pub column: u32,
    pub end_line: u32,
    pub end_column: u32,
    /// Diagnostics: `error`, `warning`, `information`, `hint`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub severity: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub code: Option<String>,
    /// The server or tool: `ts`, `ty`, `ruff`, `rustc`, `clang`, `bun`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    /// Symbols: the name, its kind and the names of the symbols it is in.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub symbol_kind: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub container: Option<String>,
    /// Definitions and references: the line, trimmed.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub preview: Option<String>,
    /// Rename: the text that replaces the range.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub new_text: Option<String>,
}

/// The answer to a `Query`.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Answer {
    pub kind: QueryKind,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub language: Option<Language>,
    pub root: PathBuf,
    /// What answered: server names, or `bun check`.
    pub servers: Vec<String>,
    pub items: Vec<Item>,
    /// `Hover`: the text, as Markdown.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hover: Option<String>,
    /// Items before `limit` cut them.
    pub total: usize,
    pub truncated: bool,
    /// False if a server did not answer in time and the items may be stale or missing.
    pub complete: bool,
    /// `Rename` with `apply`: the files were written.
    #[serde(default)]
    pub applied: bool,
    pub elapsed_ms: u64,
}

const MAX_MESSAGE: usize = 2000;
const MAX_HOVER: usize = 8000;
const MAX_PREVIEW: usize = 200;
const WORKSPACE_SYMBOLS_TTL: Duration = Duration::from_secs(10);
/// How long a model may take to fix lines, unless the query says.
const AI_TIMEOUT: Duration = Duration::from_secs(300);
/// How long a fix waits for the code graph.
const AI_GRAPH_WAIT: Duration = Duration::from_secs(10);

fn truncate(text: &str, max: usize) -> String {
    match text.char_indices().nth(max) {
        Some((at, _)) => format!("{}…", &text[..at]),
        None => text.to_owned(),
    }
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(std::sync::PoisonError::into_inner)
}

/// Texts of files read for one answer.
#[derive(Default)]
struct Texts(HashMap<String, Option<String>>);

impl Texts {
    fn get(&mut self, path: &Path) -> Option<&str> {
        self.0.entry(path_key(path)).or_insert_with(|| std::fs::read_to_string(path).ok()).as_deref()
    }

    /// 1-based line and character column of an LSP position in `path`.
    fn position(&mut self, path: &Path, position: &Value) -> (u32, u32) {
        let line = position.get("line").and_then(Value::as_u64).unwrap_or(0) as u32;
        let character = position.get("character").and_then(Value::as_u64).unwrap_or(0) as u32;
        let column = match self.get(path) {
            Some(text) => protocol::char_column(protocol::line_of(text, line), character),
            None => character,
        };
        (line + 1, column + 1)
    }

    fn item(&mut self, path: &Path, range: &Value) -> Item {
        let (line, column) = self.position(path, &range["start"]);
        let (end_line, end_column) = self.position(path, &range["end"]);
        Item { path: path.to_path_buf(), line, column, end_line, end_column, ..Item::default() }
    }

    fn preview(&mut self, path: &Path, line: u32) -> Option<String> {
        let text = self.get(path)?;
        Some(truncate(protocol::line_of(text, line.saturating_sub(1)).trim(), MAX_PREVIEW))
    }

    /// A site of the code graph, with its line as preview.
    fn site(&mut self, site: &Site, source: &str) -> Item {
        let range = json!({
            "start": { "line": site.line, "character": site.start },
            "end": { "line": site.line, "character": site.end },
        });
        let mut item = self.item(&site.path, &range);
        item.preview = self.preview(&site.path, item.line);
        item.source = Some(source.to_owned());
        item
    }
}

/// Appends `item` unless an item starts on the same line of the same file.
fn push_new(items: &mut Vec<Item>, item: Item) {
    let key = path_key(&item.path);
    if !items.iter().any(|it| it.line == item.line && path_key(&it.path) == key) {
        items.push(item);
    }
}

fn severity_name(severity: u64) -> &'static str {
    match severity {
        2 => "warning",
        3 => "information",
        4 => "hint",
        _ => "error",
    }
}

fn symbol_kind_name(kind: u64) -> &'static str {
    const NAMES: [&str; 26] = [
        "file", "module", "namespace", "package", "class", "method", "property", "field", "constructor", "enum",
        "interface", "function", "variable", "constant", "string", "number", "boolean", "array", "object", "key",
        "null", "enum-member", "struct", "event", "operator", "type-parameter",
    ];
    NAMES.get((kind as usize).wrapping_sub(1)).copied().unwrap_or("symbol")
}

/// `Location | Location[] | LocationLink[] | null` as `(uri, range)` pairs.
fn locations(value: &Value) -> Vec<(String, Value)> {
    let one = |value: &Value| -> Option<(String, Value)> {
        if let Some(uri) = value.get("uri").and_then(Value::as_str) {
            return Some((uri.to_owned(), value.get("range").cloned().unwrap_or(Value::Null)));
        }
        let uri = value.get("targetUri").and_then(Value::as_str)?;
        let range = value.get("targetSelectionRange").or_else(|| value.get("targetRange")).cloned().unwrap_or(Value::Null);
        Some((uri.to_owned(), range))
    };
    match value {
        Value::Array(values) => values.iter().filter_map(one).collect(),
        Value::Null => Vec::new(),
        value => one(value).into_iter().collect(),
    }
}

/// `MarkupContent | MarkedString | MarkedString[]` as Markdown.
fn hover_text(contents: &Value) -> String {
    match contents {
        Value::String(text) => text.clone(),
        Value::Array(parts) => parts.iter().map(hover_text).filter(|it| !it.is_empty()).collect::<Vec<_>>().join("\n\n"),
        Value::Object(object) => {
            let value = object.get("value").and_then(Value::as_str).unwrap_or("");
            match object.get("language").and_then(Value::as_str) {
                Some(language) => format!("```{language}\n{value}\n```"),
                None => value.to_owned(),
            }
        }
        _ => String::new(),
    }
}

fn diagnostic_item(texts: &mut Texts, path: &Path, diagnostic: &Value, fallback_source: &str) -> Item {
    let mut item = texts.item(path, &diagnostic["range"]);
    item.severity = Some(severity_name(diagnostic.get("severity").and_then(Value::as_u64).unwrap_or(1)).to_owned());
    item.code = match diagnostic.get("code") {
        Some(Value::String(code)) => Some(code.clone()),
        Some(Value::Number(code)) => Some(code.to_string()),
        _ => None,
    };
    let source = diagnostic.get("source").and_then(Value::as_str).unwrap_or(fallback_source);
    item.source = Some(source.to_owned());
    let message = diagnostic.get("message").and_then(Value::as_str).unwrap_or("");
    item.message = Some(truncate(message, MAX_MESSAGE));
    item
}

fn native_item(texts: &mut Texts, diagnostic: &NativeDiagnostic) -> Item {
    let range = json!({
        "start": { "line": diagnostic.start.0, "character": diagnostic.start.1 },
        "end": { "line": diagnostic.end.0, "character": diagnostic.end.1 },
    });
    let mut item = texts.item(&diagnostic.path, &range);
    item.severity = Some(severity_name(u64::from(diagnostic.severity)).to_owned());
    item.code.clone_from(&diagnostic.code);
    item.source = Some("bun".to_owned());
    item.message = Some(truncate(&diagnostic.message, MAX_MESSAGE));
    item
}

/// `DocumentSymbol[]` or `SymbolInformation[]`, flattened in document order.
fn symbol_items(texts: &mut Texts, path: Option<&Path>, value: &Value, container: Option<&str>, items: &mut Vec<Item>) {
    let Some(symbols) = value.as_array() else { return };
    for symbol in symbols {
        let name = symbol.get("name").and_then(Value::as_str).unwrap_or("").to_owned();
        let (symbol_path, range) = match symbol.get("location") {
            Some(location) => {
                let uri = location.get("uri").and_then(Value::as_str).unwrap_or("");
                let range = location.get("range").cloned().unwrap_or_else(|| json!({ "start": {}, "end": {} }));
                (uri_to_path(uri), range)
            }
            None => (path.map(Path::to_path_buf), symbol.get("selectionRange").or_else(|| symbol.get("range")).cloned().unwrap_or(Value::Null)),
        };
        let Some(symbol_path) = symbol_path else { continue };
        let mut item = texts.item(&symbol_path, &range);
        item.symbol_kind = Some(symbol_kind_name(symbol.get("kind").and_then(Value::as_u64).unwrap_or(0)).to_owned());
        item.container = symbol
            .get("containerName")
            .and_then(Value::as_str)
            .filter(|it| !it.is_empty())
            .map(str::to_owned)
            .or_else(|| container.map(str::to_owned));
        item.message = symbol.get("detail").and_then(Value::as_str).filter(|it| !it.is_empty()).map(|it| truncate(it, MAX_PREVIEW));
        item.name = Some(name.clone());
        items.push(item);
        if let Some(children) = symbol.get("children") {
            let nested = match container {
                Some(container) => format!("{container}.{name}"),
                None => name,
            };
            symbol_items(texts, Some(&symbol_path), children, Some(&nested), items);
        }
    }
}

/// `WorkspaceEdit` as `(path, range, new text)`.
fn workspace_edits(edit: &Value) -> Vec<(PathBuf, Value, String)> {
    let mut edits = Vec::new();
    let mut push = |uri: &str, list: &Value| {
        let Some(path) = uri_to_path(uri) else { return };
        for edit in list.as_array().into_iter().flatten() {
            let text = edit.get("newText").and_then(Value::as_str).unwrap_or("").to_owned();
            edits.push((path.clone(), edit.get("range").cloned().unwrap_or(Value::Null), text));
        }
    };
    if let Some(changes) = edit.get("changes").and_then(Value::as_object) {
        for (uri, list) in changes {
            push(uri, list);
        }
    }
    for change in edit.get("documentChanges").and_then(Value::as_array).into_iter().flatten() {
        if let Some(uri) = change.pointer("/textDocument/uri").and_then(Value::as_str) {
            push(uri, &change["edits"]);
        }
    }
    edits
}

/// Byte offset of an LSP position in `text`.
fn offset_of(text: &str, position: &Value) -> usize {
    let line = position.get("line").and_then(Value::as_u64).unwrap_or(0) as usize;
    let character = position.get("character").and_then(Value::as_u64).unwrap_or(0) as u32;
    let mut start = 0;
    for _ in 0..line {
        match text[start..].find('\n') {
            Some(at) => start += at + 1,
            None => return text.len(),
        }
    }
    let line_text = protocol::line_of(&text[start..], 0);
    let column = protocol::char_column(line_text, character) as usize;
    start + line_text.char_indices().nth(column).map_or(line_text.len(), |(at, _)| at)
}

/// Applies `edits` of one file to `text`.
fn apply_edits(text: &str, edits: &[(&Value, &str)]) -> String {
    let mut ranges: Vec<(usize, usize, &str)> =
        edits.iter().map(|(range, new)| (offset_of(text, &range["start"]), offset_of(text, &range["end"]), *new)).collect();
    ranges.sort_by_key(|range| std::cmp::Reverse(range.0));
    let mut result = text.to_owned();
    for (start, end, new) in ranges {
        if start <= end && end <= result.len() {
            result.replace_range(start..end, new);
        }
    }
    result
}

struct CachedSymbols {
    modified: Option<SystemTime>,
    length: u64,
    items: Vec<Item>,
}

/// Language servers for many queries. `Service` is `Sync`: several threads can query at once.
pub struct Service {
    pool: Pool,
    graphs: Arc<Graphs>,
    symbols: Mutex<HashMap<String, CachedSymbols>>,
    workspace_symbols: Mutex<HashMap<(String, String), (Instant, Vec<Item>, Vec<String>)>>,
}

impl Service {
    pub fn new(options: Options) -> Service {
        let handler: crate::backend::Handler = Arc::new(|backend: &Arc<Backend>, incoming| pool::answer_server_request(backend, incoming));
        Service::with_pool(Pool::new(options, pool::default_initialize_params(), handler))
    }

    pub(crate) fn with_pool(pool: Pool) -> Service {
        let graphs = Graphs::new(pool.options());
        Service { pool, graphs, symbols: Mutex::new(HashMap::new()), workspace_symbols: Mutex::new(HashMap::new()) }
    }

    /// The code graphs of the workspaces queried.
    pub fn graphs(&self) -> &Arc<Graphs> {
        &self.graphs
    }

    pub fn options(&self) -> &Options {
        self.pool.options()
    }

    pub fn pool(&self) -> &Pool {
        &self.pool
    }

    /// Answers `query`. `cancelled` stops the wait for the servers.
    pub fn query(&self, query: &Query, cancelled: Option<&AtomicBool>) -> Result<Answer, String> {
        let started = Instant::now();
        let query = query.clone().absolute();
        let limit = query.limit.unwrap_or_else(|| self.options().limit).clamp(1, 100_000);
        let timeout = query.timeout_ms.map_or_else(|| self.options().timeout, Duration::from_millis);
        if query.kind == QueryKind::WorkspaceSymbols {
            return self.workspace_symbols(&query, limit, timeout, cancelled, started);
        }
        let file = &query.file;
        let language = Language::of_path(file);
        let by_graph = matches!(query.kind, QueryKind::Definition | QueryKind::References | QueryKind::Hover) && self.graphs.enabled();
        if query.kind.of_graph() || (language.is_none() && by_graph) {
            return self.graph_query(&query, language, limit, timeout, cancelled, started);
        }
        let Some(language) = language else {
            return Err(format!("no language server handles {:?}: unknown extension", file.display().to_string()));
        };
        let text = std::fs::read_to_string(file).map_err(|err| format!("could not read {:?}: {err}", file.display().to_string()))?;
        let root = language::project_root(language, file);
        let position = match (query.kind.needs_position(), query.line) {
            (false, _) => None,
            (true, None) => return Err(format!("{} needs a position: <file>:<line>:<column>", kind_name(query.kind))),
            (true, Some(line)) => {
                let line = line.saturating_sub(1);
                let column = query.column.unwrap_or(1).saturating_sub(1);
                Some(json!({ "line": line, "character": protocol::utf16_column(protocol::line_of(&text, line), column) }))
            }
        };
        let mut answer = Answer {
            kind: query.kind,
            language: Some(language),
            root: root.clone(),
            servers: Vec::new(),
            items: Vec::new(),
            hover: None,
            total: 0,
            truncated: false,
            complete: true,
            applied: false,
            elapsed_ms: 0,
        };
        let mut texts = Texts::default();
        texts.0.insert(path_key(file), Some(text.clone()));
        let use_native = query.kind == QueryKind::Diagnostics
            && language == Language::TypeScript
            && self.options().typescript_diagnostics == TypeScriptDiagnostics::Native;
        if let (true, Some(native)) = (use_native, self.options().native.as_ref()) {
            let diagnostics = native.check(&root, std::slice::from_ref(file), &[(file.clone(), text.clone())])?;
            answer.servers.push("bun check".to_owned());
            answer.items = diagnostics.iter().map(|it| native_item(&mut texts, it)).collect();
            return Ok(finish(answer, limit, started));
        }
        let group = match self.pool.get(language, &root) {
            Ok(group) => group,
            Err(err) if by_graph => {
                return self.graph_query(&query, Some(language), limit, timeout, cancelled, started).map_err(|graph| format!("{err}\n{graph}"));
            }
            Err(err) => return Err(err),
        };
        answer.servers = group.backends().map(|it| it.command.name.clone()).collect();
        let backend = &group.primary;
        let uri = path_to_uri(file);
        match query.kind {
            QueryKind::Diagnostics => {
                for backend in group.backends() {
                    let (diagnostics, complete) = backend.diagnostics(file, &text, timeout, cancelled);
                    answer.complete &= complete;
                    let source = backend.command.name.clone();
                    answer.items.extend(diagnostics.iter().map(|it| diagnostic_item(&mut texts, file, it, &source)));
                }
                answer.items.sort_by_key(|it| (it.line, it.column));
            }
            QueryKind::Definition | QueryKind::References => {
                backend.sync(file, &text, None);
                let (method, mut params) = match query.kind {
                    QueryKind::Definition => ("textDocument/definition", json!({})),
                    _ => ("textDocument/references", json!({ "context": { "includeDeclaration": true } })),
                };
                params["textDocument"] = json!({ "uri": uri });
                params["position"] = position.unwrap_or_default();
                let result = request(backend, method, params, timeout, cancelled);
                if let Ok(result) = &result {
                    for (uri, range) in locations(result) {
                        let Some(path) = uri_to_path(&uri) else { continue };
                        let mut item = texts.item(&path, &range);
                        item.preview = texts.preview(&path, item.line);
                        answer.items.push(item);
                    }
                }
                // Without an answer of the server, the graph is all there is: wait for it.
                let workspace = language::workspace_root(file);
                let index = if answer.items.is_empty() { self.graphs.wait(&workspace, timeout) } else { self.graphs.current(&workspace) };
                if let (Some(index), Some((line, character, word))) = (index, place(&text, &query)) {
                    let before = answer.items.len();
                    graph_locations(&index, &mut texts, &mut answer.items, query.kind, file, (line, character), &word);
                    if answer.items.len() > before {
                        answer.servers.push("bun graph".to_owned());
                    }
                }
                if answer.items.is_empty() {
                    result?;
                }
            }
            QueryKind::Hover => {
                backend.sync(file, &text, None);
                let params = json!({ "textDocument": { "uri": uri }, "position": position });
                let result = request(backend, "textDocument/hover", params, timeout, cancelled)?;
                if let Some(range) = result.get("range") {
                    answer.items.push(texts.item(file, range));
                }
                let mut hover = hover_text(&result["contents"]);
                if let (Some(index), Some((line, character, word))) = (self.graphs.current(&language::workspace_root(file)), place(&text, &query))
                    && let Some(described) = index.describe(file, line, character, &word)
                {
                    if !hover.is_empty() {
                        hover.push_str("\n\n---\n\n");
                    }
                    hover.push_str(&described);
                    answer.servers.push("bun graph".to_owned());
                }
                answer.hover = (!hover.is_empty()).then(|| truncate(&hover, MAX_HOVER));
            }
            QueryKind::Symbols => {
                answer.items = self.document_symbols(backend, file, &text, &mut texts, timeout, cancelled)?;
            }
            QueryKind::Rename => {
                let Some(new_name) = query.text.as_deref().filter(|it| !it.is_empty()) else {
                    return Err("rename needs the new name".to_owned());
                };
                backend.sync(file, &text, None);
                let params = json!({ "textDocument": { "uri": uri }, "position": position, "newName": new_name });
                let result = request(backend, "textDocument/rename", params, timeout, cancelled)?;
                let edits = workspace_edits(&result);
                for (path, range, new_text) in &edits {
                    let mut item = texts.item(path, range);
                    item.new_text = Some(new_text.clone());
                    answer.items.push(item);
                }
                if query.apply {
                    apply_workspace_edits(&group, &edits)?;
                    answer.applied = true;
                }
            }
            QueryKind::WorkspaceSymbols | QueryKind::Context | QueryKind::Callers | QueryKind::Callees | QueryKind::Fix => {}
        }
        Ok(finish(answer, limit, started))
    }

    /// The answers of the code graph, and of a model for `Fix`.
    fn graph_query(
        &self,
        query: &Query,
        language: Option<Language>,
        limit: usize,
        timeout: Duration,
        cancelled: Option<&AtomicBool>,
        started: Instant,
    ) -> Result<Answer, String> {
        let file = &query.file;
        let text = std::fs::read_to_string(file).map_err(|err| format!("could not read {:?}: {err}", file.display().to_string()))?;
        let root = language::workspace_root(file);
        let mut answer = Answer {
            kind: query.kind,
            language,
            root: root.clone(),
            servers: Vec::new(),
            items: Vec::new(),
            hover: None,
            total: 0,
            truncated: false,
            complete: true,
            applied: false,
            elapsed_ms: 0,
        };
        if query.kind == QueryKind::Fix {
            self.fix(query, language, &text, &mut answer, cancelled)?;
            return Ok(finish(answer, limit, started));
        }
        let mut texts = Texts::default();
        texts.0.insert(path_key(file), Some(text.clone()));
        let Some((line, character, word)) = place(&text, query) else {
            return Err(format!("{} needs a position on a name: <file>:<line>:<column>", kind_name(query.kind)));
        };
        let index = self.graphs.wait(&root, timeout);
        if index.is_some() {
            answer.servers.push("bun graph".to_owned());
        }
        match query.kind {
            QueryKind::Callers | QueryKind::Callees => {
                let index = index.ok_or_else(|| self.no_graph(&root))?;
                let incoming = query.kind == QueryKind::Callers;
                let node = index.node_at(file, line, &word);
                if let Some(node) = node {
                    let list = if incoming { index.callers(node) } else { index.callees(node) };
                    for (symbol, call) in list {
                        // A caller is shown at its call, a callee at its definition.
                        let site = if incoming { call.unwrap_or_else(|| symbol.site.clone()) } else { symbol.site.clone() };
                        let mut item = texts.site(&site, "calls");
                        item.name = Some(symbol.name);
                        item.symbol_kind = Some(symbol.kind.to_owned());
                        answer.items.push(item);
                    }
                }
                let links = index.links_at(file, line, character, Some(&word));
                for link in links.iter().filter(|it| it.definition != incoming) {
                    let mut item = texts.site(&link.to, link.why);
                    item.name = Some(word.clone());
                    push_new(&mut answer.items, item);
                }
                if node.is_none() && links.is_empty() {
                    return Err(format!("the code graph has no function `{word}` at {}:{}", file.display(), line + 1));
                }
            }
            QueryKind::Definition | QueryKind::References => {
                let index = index.ok_or_else(|| self.no_graph(&root))?;
                graph_locations(&index, &mut texts, &mut answer.items, query.kind, file, (line, character), &word);
            }
            QueryKind::Hover => {
                let index = index.ok_or_else(|| self.no_graph(&root))?;
                answer.hover = index.describe(file, line, character, &word);
            }
            _ => {
                let mut parts = Vec::new();
                if let Some(index) = &index {
                    parts.extend(index.describe(file, line, character, &word));
                    for link in index.links_at(file, line, character, Some(&word)) {
                        let mut item = texts.site(&link.to, link.why);
                        item.name = Some(word.clone());
                        push_new(&mut answer.items, item);
                    }
                }
                if let Some(language) = language
                    && let Ok(group) = self.pool.get(language, &language::project_root(language, file))
                {
                    let backend = &group.primary;
                    backend.sync(file, &text, None);
                    let params = json!({ "textDocument": { "uri": path_to_uri(file) }, "position": { "line": line, "character": character } });
                    match request(backend, "textDocument/hover", params, timeout, cancelled) {
                        Ok(result) => {
                            let hover = hover_text(&result["contents"]);
                            if !hover.is_empty() {
                                parts.push(hover);
                            }
                            answer.servers.push(backend.command.name.clone());
                        }
                        Err(_) => answer.complete = false,
                    }
                }
                for (path, excerpt) in ai::docs(&root, &word) {
                    parts.push(format!("**{path}**\n\n{excerpt}"));
                }
                if parts.is_empty() {
                    return Err(format!("nothing is known of `{word}` at {}:{}", file.display(), line + 1));
                }
                answer.hover = Some(truncate(&parts.join("\n\n---\n\n"), MAX_HOVER));
            }
        }
        Ok(finish(answer, limit, started))
    }

    fn no_graph(&self, root: &Path) -> String {
        if self.graphs.enabled() {
            format!("the code graph of {} is still being built: ask again", root.display())
        } else {
            "the code graph is off (BUN_LSP_GRAPH=0)".to_owned()
        }
    }

    /// Asks the model of `BUN_LSP_AI` to fix the lines around the position, or around the first
    /// error of the file.
    fn fix(&self, query: &Query, language: Option<Language>, text: &str, answer: &mut Answer, cancelled: Option<&AtomicBool>) -> Result<(), String> {
        let Some(command) = self.options().ai.clone() else {
            return Err("fix needs a model: set BUN_LSP_AI to a command that reads a prompt on stdin, such as BUN_LSP_AI=\"claude -p\"".to_owned());
        };
        let file = &query.file;
        // Diagnostics cost a server start unless one runs or `bun check` answers: only then, or
        // when no line says where the problem is.
        let cheap = language.is_some_and(|language| {
            (language == Language::TypeScript
                && self.options().typescript_diagnostics == TypeScriptDiagnostics::Native
                && self.options().native.is_some())
                || self.pool.running_group(language, &language::project_root(language, file)).is_some()
        });
        let mut diagnostics = Vec::new();
        if language.is_some() && (cheap || query.line.is_none()) {
            let mut check = Query::new(QueryKind::Diagnostics, file.clone());
            check.timeout_ms = query.timeout_ms;
            if let Ok(checked) = self.query(&check, cancelled) {
                answer.servers.extend(checked.servers);
                diagnostics = checked.items;
            }
        }
        let key = path_key(file);
        diagnostics.retain(|it| path_key(&it.path) == key);
        let (line, end) = match query.line {
            Some(line) => (line.saturating_sub(1), line.saturating_sub(1)),
            None => {
                let first = (diagnostics.iter().find(|it| it.severity.as_deref() == Some("error")))
                    .ok_or_else(|| format!("no error in {}: give the line to fix, <file>:<line>", file.display()))?;
                (first.line.saturating_sub(1), first.end_line.max(first.line).saturating_sub(1))
            }
        };
        let (start, stop) = ai::window(ai::line_count(text), line, end);
        let near = (diagnostics.iter())
            .filter(|it| (start + 1..=stop + 1).contains(&it.line))
            .map(|it| {
                let code = it.code.as_deref().map(|it| format!(" {it}")).unwrap_or_default();
                let severity = it.severity.as_deref().unwrap_or("error");
                format!("{}:{} {severity}{code}: {}", it.line, it.column, it.message.as_deref().unwrap_or(""))
            })
            .collect();
        let line_text = protocol::line_of(text, line);
        let column = query.column.map_or_else(|| line_text.chars().take_while(|it| it.is_whitespace()).count() as u32, |it| it.saturating_sub(1));
        let character = protocol::utf16_column(line_text, column);
        let word = links::word_at(line_text, character).map(|it| it.0).unwrap_or_default();
        let root = language::workspace_root(file);
        let graph = self.graphs.wait(&root, AI_GRAPH_WAIT).and_then(|index| index.describe(file, line, character, &word));
        let problem = Problem {
            root: &root,
            path: file,
            language: language.map_or("text", Language::name),
            text,
            start,
            end: stop,
            diagnostics: near,
            hover: None,
            graph,
            docs: ai::docs(&root, &word),
        };
        let timeout = query.timeout_ms.map_or(AI_TIMEOUT, Duration::from_millis);
        let reply = ai::run(&command, &ai::prompt(&problem), timeout)?;
        let replacement =
            ai::replacement(&reply).ok_or_else(|| format!("the model answered without a code block: {}", truncate(reply.trim(), 500)))?;
        answer.servers.push(command[0].clone());
        answer.items.push(Item {
            path: file.clone(),
            line: start + 1,
            column: 1,
            end_line: stop + 1,
            end_column: protocol::line_of(text, stop).chars().count() as u32 + 1,
            new_text: Some(replacement.clone()),
            source: Some("ai".to_owned()),
            ..Item::default()
        });
        if query.apply {
            let edited = ai::splice(text, start, stop, &replacement);
            std::fs::write(file, &edited).map_err(|err| format!("could not write {:?}: {err}", file.display().to_string()))?;
            if let Some(language) = language
                && let Some(group) = self.pool.running_group(language, &language::project_root(language, file))
            {
                for backend in group.backends() {
                    backend.sync(file, &edited, None);
                }
            }
            self.graphs.touch(&root);
            answer.applied = true;
        }
        Ok(())
    }

    fn document_symbols(
        &self,
        backend: &Arc<Backend>,
        file: &Path,
        text: &str,
        texts: &mut Texts,
        timeout: Duration,
        cancelled: Option<&AtomicBool>,
    ) -> Result<Vec<Item>, String> {
        let metadata = std::fs::metadata(file).ok();
        let modified = metadata.as_ref().and_then(|it| it.modified().ok());
        let length = metadata.map_or(0, |it| it.len());
        let key = path_key(file);
        if let Some(cached) = lock(&self.symbols).get(&key)
            && cached.modified == modified
            && cached.length == length
            && modified.is_some()
        {
            return Ok(cached.items.clone());
        }
        backend.sync(file, text, None);
        let params = json!({ "textDocument": { "uri": path_to_uri(file) } });
        let result = request(backend, "textDocument/documentSymbol", params, timeout, cancelled)?;
        let mut items = Vec::new();
        symbol_items(texts, Some(file), &result, None, &mut items);
        let mut symbols = lock(&self.symbols);
        if symbols.len() > 4096 {
            symbols.clear();
        }
        symbols.insert(key, CachedSymbols { modified, length, items: items.clone() });
        Ok(items)
    }

    fn workspace_symbols(
        &self,
        query: &Query,
        limit: usize,
        timeout: Duration,
        cancelled: Option<&AtomicBool>,
        started: Instant,
    ) -> Result<Answer, String> {
        let text = query.text.clone().unwrap_or_default();
        let languages = match Language::of_path(&query.file) {
            Some(language) if query.file.is_file() => vec![language],
            _ => language::languages_in(&language::workspace_root(&query.file.join("_"))),
        };
        if languages.is_empty() && !self.graphs.enabled() {
            return Err(format!("no project in {:?}: no tsconfig.json, package.json, pyproject.toml, Cargo.toml or compile_commands.json", query.file.display().to_string()));
        }
        let root = language::workspace_root(&query.file);
        let key = (path_key(&root), format!("{languages:?}\u{0}{text}"));
        let mut answer = Answer {
            kind: QueryKind::WorkspaceSymbols,
            language: (languages.len() == 1).then(|| languages[0]),
            root,
            servers: Vec::new(),
            items: Vec::new(),
            hover: None,
            total: 0,
            truncated: false,
            complete: true,
            applied: false,
            elapsed_ms: 0,
        };
        if let Some((at, items, servers)) = lock(&self.workspace_symbols).get(&key)
            && at.elapsed() < WORKSPACE_SYMBOLS_TTL
        {
            answer.items.clone_from(items);
            answer.servers.clone_from(servers);
            return Ok(finish(answer, limit, started));
        }
        let mut texts = Texts::default();
        let mut errors = Vec::new();
        for language in languages {
            let start = if query.file.is_file() { query.file.clone() } else { query.file.join("_") };
            let project = language::project_root(language, &start);
            let group = match self.pool.get(language, &project) {
                Ok(group) => group,
                Err(err) => {
                    errors.push(err);
                    continue;
                }
            };
            open_any_file(&group.primary, &project, language);
            answer.servers.push(group.primary.command.name.clone());
            match request(&group.primary, "workspace/symbol", json!({ "query": text }), timeout, cancelled) {
                Ok(result) => symbol_items(&mut texts, None, &result, None, &mut answer.items),
                Err(err) => errors.push(err),
            }
        }
        // Without a server, the graph is all there is: wait for it.
        let index = if answer.servers.is_empty() { self.graphs.wait(&answer.root, timeout) } else { self.graphs.current(&answer.root) };
        if let Some(index) = index.filter(|_| !text.is_empty()) {
            let before = answer.items.len();
            for symbol in index.search(&text, limit) {
                let mut item = texts.site(&symbol.site, "bun graph");
                item.preview = None;
                item.name = Some(symbol.name);
                item.symbol_kind = Some(symbol.kind.to_owned());
                push_new(&mut answer.items, item);
            }
            if answer.items.len() > before || answer.servers.is_empty() {
                answer.servers.push("bun graph".to_owned());
            }
        }
        if answer.servers.is_empty() {
            if errors.is_empty() {
                errors.push(format!("no project in {:?} and no code graph", query.file.display().to_string()));
            }
            return Err(errors.join("\n"));
        }
        answer.complete = errors.is_empty();
        let mut cache = lock(&self.workspace_symbols);
        cache.retain(|_, (at, ..)| at.elapsed() < WORKSPACE_SYMBOLS_TTL);
        cache.insert(key, (Instant::now(), answer.items.clone(), answer.servers.clone()));
        drop(cache);
        Ok(finish(answer, limit, started))
    }

    /// Starts the servers of `root` (the languages that have a project there, or `languages`) and
    /// opens one file of each, so that the first query does not wait for the project to load.
    pub fn warm(&self, root: &Path, languages: &[Language]) -> Vec<(Language, Result<String, String>)> {
        let languages = if languages.is_empty() { language::languages_in(root) } else { languages.to_vec() };
        drop(self.graphs.current(root));
        std::thread::scope(|scope| {
            #[expect(clippy::needless_collect, reason = "every server starts before the first join")]
            let handles: Vec<_> = languages
                .iter()
                .map(|&language| {
                    scope.spawn(move || {
                        let project = language::project_root(language, &root.join("_"));
                        let result = self.pool.get(language, &project).map(|group| {
                            open_any_file(&group.primary, &project, language);
                            group.backends().map(|it| it.command.name.clone()).collect::<Vec<_>>().join(", ")
                        });
                        (language, result)
                    })
                })
                .collect();
            handles.into_iter().filter_map(|it| it.join().ok()).collect()
        })
    }

    /// The running servers.
    pub fn status(&self) -> Value {
        let servers: Vec<Value> = (self.pool.running().iter())
            .flat_map(|group| {
                group.backends().map(|backend| {
                    json!({
                        "language": group.language,
                        "root": group.root,
                        "server": backend.command.name,
                        "command": backend.command.command_line(),
                        "openDocuments": backend.open_documents(),
                        "idleSeconds": backend.idle_for().as_secs(),
                    })
                })
            })
            .collect();
        let graphs: Vec<Value> = (self.graphs.built().iter())
            .map(|index| {
                json!({
                    "root": index.root(),
                    "files": index.files(),
                    "nodes": index.nodes(),
                    "edges": index.edges(),
                    "links": index.link_count(),
                    "buildMs": index.elapsed().as_millis() as u64,
                })
            })
            .collect();
        json!({ "pid": std::process::id(), "servers": servers, "graphs": graphs })
    }

    /// Stops the servers that nothing used for `Options::server_idle`.
    pub fn reap(&self) {
        self.pool.reap(self.options().server_idle);
    }

    pub fn shutdown(&self) {
        self.pool.shutdown();
    }
}

/// The 0-based line, UTF-16 column and name at the position of `query` in `text`.
fn place(text: &str, query: &Query) -> Option<(u32, u32, String)> {
    let line = query.line?.saturating_sub(1);
    let line_text = protocol::line_of(text, line);
    let character = protocol::utf16_column(line_text, query.column.unwrap_or(1).saturating_sub(1));
    let (word, ..) = links::word_at(line_text, character)?;
    Some((line, character, word))
}

/// Adds what the code graph knows: the definitions of `word` in other languages, or its uses
/// and calls. Without a link, a definition is the symbol of that name.
fn graph_locations(index: &Index, texts: &mut Texts, items: &mut Vec<Item>, kind: QueryKind, file: &Path, (line, character): (u32, u32), word: &str) {
    let definition = kind == QueryKind::Definition;
    let links = index.links_at(file, line, character, Some(word));
    for link in links.iter().filter(|it| !definition || it.definition) {
        push_new(items, texts.site(&link.to, link.why));
    }
    if definition && items.is_empty() {
        for symbol in index.search(word, 8).into_iter().filter(|it| it.name == word) {
            push_new(items, texts.site(&symbol.site, "bun graph"));
        }
    }
    if !definition && let Some(node) = index.node_at(file, line, word) {
        for (symbol, call) in index.callers(node) {
            push_new(items, texts.site(&call.unwrap_or(symbol.site), "calls"));
        }
    }
}

fn kind_name(kind: QueryKind) -> String {
    serde_json::to_value(kind).ok().and_then(|it| it.as_str().map(str::to_owned)).unwrap_or_default()
}

fn request(backend: &Backend, method: &str, params: Value, timeout: Duration, cancelled: Option<&AtomicBool>) -> Result<Value, String> {
    backend.request(method, params, timeout, cancelled).map_err(|err| format!("{}: {method}: {}", backend.command.name, err.message))
}

fn finish(mut answer: Answer, limit: usize, started: Instant) -> Answer {
    answer.total = answer.items.len();
    answer.truncated = answer.items.len() > limit;
    answer.items.truncate(limit);
    answer.elapsed_ms = started.elapsed().as_millis() as u64;
    answer
}

fn apply_workspace_edits(group: &Group, edits: &[(PathBuf, Value, String)]) -> Result<(), String> {
    let mut by_file: HashMap<String, (PathBuf, Vec<(&Value, &str)>)> = HashMap::new();
    for (path, range, text) in edits {
        by_file.entry(path_key(path)).or_insert_with(|| (path.clone(), Vec::new())).1.push((range, text.as_str()));
    }
    for (path, edits) in by_file.values() {
        let text = std::fs::read_to_string(path).map_err(|err| format!("could not read {:?}: {err}", path.display().to_string()))?;
        let edited = apply_edits(&text, edits);
        std::fs::write(path, &edited).map_err(|err| format!("could not write {:?}: {err}", path.display().to_string()))?;
        for backend in group.backends() {
            backend.sync(path, &edited, None);
        }
    }
    Ok(())
}

/// Directories that hold no sources of the project.
const SKIPPED_DIRS: [&str; 8] = ["node_modules", ".git", "target", "build", "dist", ".venv", "__pycache__", "vendor"];

/// Opens a file of `language` under `root`, if the server has none open: servers load a project
/// for an open file.
fn open_any_file(backend: &Backend, root: &Path, language: Language) {
    if backend.open_documents() > 0 || language == Language::Cpp {
        return;
    }
    let mut queue = std::collections::VecDeque::from([root.to_path_buf()]);
    let mut seen = 0usize;
    while let Some(dir) = queue.pop_front() {
        let Ok(entries) = std::fs::read_dir(&dir) else { continue };
        for entry in entries.flatten() {
            seen += 1;
            if seen > 2000 {
                return;
            }
            let path = entry.path();
            let is_dir = entry.file_type().is_ok_and(|it| it.is_dir());
            let name = entry.file_name().to_string_lossy().into_owned();
            if is_dir {
                if !SKIPPED_DIRS.contains(&name.as_str()) && !name.starts_with('.') {
                    queue.push_back(path);
                }
            } else if Language::of_path(&path) == Some(language)
                && !name.ends_with(".d.ts")
                && let Ok(text) = std::fs::read_to_string(&path)
            {
                backend.sync(&path, &text, None);
                return;
            }
        }
    }
}

impl Answer {
    /// The answer as text for a terminal: one line per item, paths relative to `cwd`.
    pub fn render(&self, cwd: &Path) -> String {
        let mut out = String::new();
        let show = |path: &Path| -> String {
            let relative = path.strip_prefix(cwd).unwrap_or(path);
            relative.display().to_string()
        };
        if let Some(hover) = &self.hover {
            out.push_str(hover);
            out.push('\n');
        }
        for item in &self.items {
            let place = format!("{}:{}:{}", show(&item.path), item.line, item.column);
            match self.kind {
                QueryKind::Diagnostics => {
                    let severity = item.severity.as_deref().unwrap_or("error");
                    let code = item.code.as_deref().map(|code| match item.source.as_deref() {
                        Some("ts" | "bun" | "tsgo" | "typescript") if code.bytes().all(|it| it.is_ascii_digit()) => format!(" TS{code}"),
                        _ => format!(" {code}"),
                    });
                    let message = item.message.as_deref().unwrap_or("").replace('\n', "\n  ");
                    let _ = writeln!(out, "{place}: {severity}{}: {message}", code.unwrap_or_default());
                }
                QueryKind::Hover => {}
                QueryKind::Symbols | QueryKind::WorkspaceSymbols => {
                    let kind = item.symbol_kind.as_deref().unwrap_or("symbol");
                    let name = item.name.as_deref().unwrap_or("");
                    let container = item.container.as_deref().map(|it| format!(" in {it}")).unwrap_or_default();
                    let _ = writeln!(out, "{place}: {kind} {name}{container}");
                }
                QueryKind::Rename => {
                    let _ = writeln!(out, "{place}-{}:{}: {}", item.end_line, item.end_column, item.new_text.as_deref().unwrap_or(""));
                }
                QueryKind::Definition | QueryKind::References | QueryKind::Context => {
                    let why = match item.source.as_deref() {
                        Some(source) => format!("[{source}] "),
                        _ => String::new(),
                    };
                    let _ = writeln!(out, "{place}: {why}{}", item.preview.as_deref().unwrap_or(""));
                }
                QueryKind::Callers | QueryKind::Callees => {
                    let what = match (item.symbol_kind.as_deref(), item.name.as_deref()) {
                        (Some(kind), Some(name)) => format!("{kind} {name}"),
                        _ => format!("[{}]", item.source.as_deref().unwrap_or("link")),
                    };
                    let _ = writeln!(out, "{place}: {what}: {}", item.preview.as_deref().unwrap_or(""));
                }
                QueryKind::Fix => {
                    let _ = writeln!(out, "{place}-{}:{}:", item.end_line, item.end_column);
                    out.push_str(item.new_text.as_deref().unwrap_or(""));
                    if !out.ends_with('\n') {
                        out.push('\n');
                    }
                }
            }
        }
        if self.truncated {
            let _ = writeln!(out, "… {} more (--limit)", self.total - self.items.len());
        }
        if self.applied {
            let _ = writeln!(out, "applied {} edits", self.items.len());
        }
        if !self.complete {
            let _ = writeln!(out, "note: a server did not answer in time; the answer may be incomplete");
        }
        out
    }

    /// Whether the answer has an error diagnostic.
    pub fn has_errors(&self) -> bool {
        self.kind == QueryKind::Diagnostics && self.items.iter().any(|it| it.severity.as_deref() == Some("error"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn applies_edits_from_the_end() {
        let text = "let a = 1;\nconsole.log(a, a);\n";
        let range = |line: u32, start: u32, end: u32| json!({ "start": { "line": line, "character": start }, "end": { "line": line, "character": end } });
        let (first, second, third) = (range(0, 4, 5), range(1, 12, 13), range(1, 15, 16));
        let edited = apply_edits(text, &[(&first, "b"), (&second, "b"), (&third, "b")]);
        assert_eq!(edited, "let b = 1;\nconsole.log(b, b);\n");
    }

    #[test]
    fn reads_locations_and_hovers() {
        let link = json!([{ "targetUri": "file:///a.ts", "targetSelectionRange": { "start": {}, "end": {} } }]);
        assert_eq!(locations(&link).len(), 1);
        assert_eq!(locations(&Value::Null).len(), 0);
        assert_eq!(hover_text(&json!({ "kind": "markdown", "value": "x" })), "x");
        assert_eq!(hover_text(&json!([{ "language": "ts", "value": "let x" }, "doc"])), "```ts\nlet x\n```\n\ndoc");
    }

    #[test]
    fn parses_query_kinds() {
        assert_eq!(QueryKind::parse("refs"), Some(QueryKind::References));
        assert_eq!(kind_name(QueryKind::WorkspaceSymbols), "workspace-symbols");
    }
}
