//! `bun lsp` on stdio: one server for the editor, which routes each message to the server of the
//! language of its document and merges what they publish.
//!
//! - Requests about a document go to the primary server of its language and project root, which
//!   starts on first use; their ids are the proxy's own, so `$/cancelRequest` follows them.
//! - Items that come back to `*/resolve` (completions, code actions, inlay hints, code lenses,
//!   document links) carry the server they came from in `data`.
//! - `workspace/symbol` asks every running server.
//! - Each document's diagnostics are those of all its servers, merged. TypeScript ones come from
//!   the [`NativeChecker`](crate::NativeChecker) when there is one.
//! - Requests of the servers go to the editor, under ids of the proxy.

use std::collections::{BTreeMap, HashMap};
use std::io::{BufRead, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicI64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, OnceLock, Weak, mpsc};
use std::time::Duration;

use serde_json::{Value, json};

use crate::backend::{Backend, Handler, Incoming};
use crate::language::{self, Language};
use crate::pool::{Group, Pool};
use crate::protocol::{self, code, path_key, uri_key, uri_to_path};
use crate::{NativeDiagnostic, Options, TypeScriptDiagnostics};

/// The field of `data` that names the server of an item.
const TAG: &str = "bunLsp";
/// How long native diagnostics wait for typing to stop.
const NATIVE_DEBOUNCE: Duration = Duration::from_millis(200);

struct Document {
    uri: String,
    path: PathBuf,
    language: Language,
    root: PathBuf,
    version: i64,
    text: String,
}

#[derive(Default)]
struct Merged {
    uri: String,
    version: Option<i64>,
    /// By server name.
    by_source: BTreeMap<String, Vec<Value>>,
}

struct Proxy {
    output: Mutex<Box<dyn Write + Send>>,
    options: Options,
    pool: OnceLock<Pool>,
    documents: Mutex<HashMap<String, Document>>,
    diagnostics: Mutex<HashMap<String, Merged>>,
    /// Requests of the editor sent on to a server: editor id → (server, server id).
    forwarded: Mutex<HashMap<String, (Arc<Backend>, i64)>>,
    /// Requests of a server sent on to the editor: proxy id → (server, server id).
    asked: Mutex<HashMap<String, (Weak<Backend>, Value)>>,
    next_asked: AtomicI64,
    /// The servers that items name in `data`, by address.
    backends: Mutex<HashMap<usize, Weak<Backend>>>,
    native: Mutex<Option<mpsc::Sender<String>>>,
    shutting_down: AtomicBool,
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(std::sync::PoisonError::into_inner)
}

fn id_key(id: &Value) -> String {
    serde_json::to_string(id).unwrap_or_default()
}

fn backend_key(backend: &Arc<Backend>) -> usize {
    Arc::as_ptr(backend).addr()
}

/// The capabilities of the proxy: what any of its servers may answer.
fn capabilities() -> Value {
    json!({
        "positionEncoding": "utf-16",
        "textDocumentSync": { "openClose": true, "change": 1, "save": { "includeText": false } },
        "hoverProvider": true,
        "definitionProvider": true,
        "declarationProvider": true,
        "typeDefinitionProvider": true,
        "implementationProvider": true,
        "referencesProvider": true,
        "documentHighlightProvider": true,
        "documentSymbolProvider": true,
        "workspaceSymbolProvider": true,
        "renameProvider": { "prepareProvider": true },
        "completionProvider": { "resolveProvider": true, "triggerCharacters": [".", ":", "\"", "'", "/", "@", "<", "#"] },
        "signatureHelpProvider": { "triggerCharacters": ["(", ",", "<"], "retriggerCharacters": [")"] },
        "codeActionProvider": { "resolveProvider": true },
        "codeLensProvider": { "resolveProvider": true },
        "documentLinkProvider": { "resolveProvider": true },
        "documentFormattingProvider": true,
        "documentRangeFormattingProvider": true,
        "foldingRangeProvider": true,
        "selectionRangeProvider": true,
        "inlayHintProvider": { "resolveProvider": true },
        "callHierarchyProvider": true,
        "typeHierarchyProvider": true,
        "workspace": { "workspaceFolders": { "supported": true, "changeNotifications": true } },
    })
}

/// `InitializeParams` for the servers: those of the editor, without pull diagnostics (the proxy
/// merges published ones) and in UTF-16.
fn server_params(client: &Value) -> Value {
    let mut params = json!({});
    for field in ["capabilities", "clientInfo", "locale", "trace"] {
        if let Some(value) = client.get(field) {
            params[field] = value.clone();
        }
    }
    if !params["capabilities"].is_object() {
        params["capabilities"] = json!({});
    }
    let capabilities = &mut params["capabilities"];
    if let Some(text_document) = capabilities.get_mut("textDocument").and_then(Value::as_object_mut) {
        text_document.remove("diagnostic");
    }
    if !capabilities["general"].is_object() {
        capabilities["general"] = json!({});
    }
    capabilities["general"]["positionEncodings"] = json!(["utf-16"]);
    params
}

/// The document a request is about.
fn request_uri(params: &Value) -> Option<&str> {
    (params.pointer("/textDocument/uri"))
        .or_else(|| params.pointer("/item/uri"))
        .or_else(|| params.get("uri"))
        .and_then(Value::as_str)
}

fn tag_item(item: &mut Value, key: usize) {
    if let Some(object) = item.as_object_mut() {
        let data = object.remove("data").unwrap_or(Value::Null);
        object.insert("data".to_owned(), json!({ TAG: key, "data": data }));
    }
}

fn tag_items(result: &mut Value, key: usize) {
    match result {
        Value::Array(items) => items.iter_mut().for_each(|item| tag_item(item, key)),
        Value::Object(object) => {
            if let Some(Value::Array(items)) = object.get_mut("items") {
                items.iter_mut().for_each(|item| tag_item(item, key));
            }
        }
        _ => {}
    }
}

/// Takes the server of an item to resolve out of its `data`.
fn untag(params: &mut Value) -> Option<usize> {
    let object = params.as_object_mut()?;
    let data = object.remove("data")?;
    let key = data.get(TAG).and_then(Value::as_u64)? as usize;
    match data.get("data") {
        None | Some(Value::Null) => {}
        Some(inner) => {
            object.insert("data".to_owned(), inner.clone());
        }
    }
    Some(key)
}

fn native_to_lsp(diagnostic: &NativeDiagnostic) -> Value {
    let mut value = json!({
        "range": {
            "start": { "line": diagnostic.start.0, "character": diagnostic.start.1 },
            "end": { "line": diagnostic.end.0, "character": diagnostic.end.1 },
        },
        "severity": diagnostic.severity,
        "source": "bun",
        "message": diagnostic.message,
    });
    if let Some(code) = &diagnostic.code {
        value["code"] = code.parse::<u64>().map_or_else(|_| json!(code), |number| json!(number));
    }
    value
}

impl Proxy {
    fn send(&self, message: &Value) {
        let mut output = lock(&self.output);
        let _ = protocol::write_message(&mut *output, message);
    }

    fn pool(&self) -> Option<&Pool> {
        self.pool.get()
    }

    fn native_active(&self) -> bool {
        self.options.native.is_some() && self.options.typescript_diagnostics == TypeScriptDiagnostics::Native
    }

    /// The servers of `path`, started if needed, with the open documents of their project.
    fn group_for(&self, path: &Path) -> Result<Group, String> {
        let pool = self.pool().ok_or("the server is not initialized")?;
        let language = Language::of_path(path).ok_or_else(|| format!("no language server handles {}", path.display()))?;
        let root = language::project_root(language, path);
        let group = pool.get(language, &root)?;
        let root_key = path_key(&root);
        let documents = lock(&self.documents);
        let mut backends = lock(&self.backends);
        backends.retain(|_, it| it.strong_count() > 0);
        for backend in group.backends() {
            backends.insert(backend_key(backend), Arc::downgrade(backend));
            if backend.open_documents() > 0 {
                continue;
            }
            for document in documents.values() {
                if document.language == language && path_key(&document.root) == root_key {
                    backend.sync(&document.path, &document.text, Some(document.version));
                }
            }
        }
        Ok(group)
    }

    fn publish(&self, key: &str) {
        let message = {
            let diagnostics = lock(&self.diagnostics);
            let Some(merged) = diagnostics.get(key) else { return };
            let items: Vec<Value> = merged.by_source.values().flatten().cloned().collect();
            let mut params = json!({ "uri": merged.uri, "diagnostics": items });
            if let Some(version) = merged.version {
                params["version"] = json!(version);
            }
            protocol::notification("textDocument/publishDiagnostics", params)
        };
        self.send(&message);
    }

    fn set_diagnostics(&self, uri: &str, source: &str, version: Option<i64>, items: Vec<Value>) {
        let key = uri_key(uri);
        {
            let mut diagnostics = lock(&self.diagnostics);
            let merged = diagnostics.entry(key.clone()).or_default();
            uri.clone_into(&mut merged.uri);
            if version.is_some() {
                merged.version = version;
            }
            merged.by_source.insert(source.to_owned(), items);
        }
        self.publish(&key);
    }

    /// What a server sends on its own.
    fn from_server(self: &Arc<Self>, backend: &Arc<Backend>, incoming: Incoming) {
        match incoming {
            Incoming::Notification { method, params } if method == "textDocument/publishDiagnostics" => {
                if backend.language == Language::TypeScript && self.native_active() {
                    return;
                }
                let Some(uri) = params.get("uri").and_then(Value::as_str) else { return };
                let items = params.get("diagnostics").and_then(Value::as_array).cloned().unwrap_or_default();
                let version = params.get("version").and_then(Value::as_i64);
                self.set_diagnostics(uri, &backend.command.name, version, items);
            }
            Incoming::Notification { method, params } => self.send(&protocol::notification(&method, params)),
            Incoming::Request { id, method, params } => {
                let ours = format!("bun-lsp/{}", self.next_asked.fetch_add(1, Ordering::Relaxed));
                lock(&self.asked).insert(id_key(&json!(ours)), (Arc::downgrade(backend), id));
                self.send(&json!({ "jsonrpc": "2.0", "id": ours, "method": method, "params": params }));
            }
        }
    }

    /// Sends a request of the editor to `backend`; its answer goes back to the editor.
    fn forward(self: &Arc<Self>, backend: &Arc<Backend>, id: Value, method: &str, params: Value, tag: bool) {
        let key = id_key(&id);
        let proxy = Arc::clone(self);
        let tag_key = tag.then(|| backend_key(backend));
        let reply_key = key.clone();
        let server_id = backend.send(
            method,
            params,
            Box::new(move |result| {
                lock(&proxy.forwarded).remove(&reply_key);
                let message = match result {
                    Ok(mut result) => {
                        if let Some(tag_key) = tag_key {
                            tag_items(&mut result, tag_key);
                        }
                        protocol::response(id, result)
                    }
                    Err(err) => protocol::error_response(id, err.code, &err.message),
                };
                proxy.send(&message);
            }),
        );
        let mut forwarded = lock(&self.forwarded);
        // The answer may already be back.
        if backend.is_alive() {
            forwarded.insert(key, (Arc::clone(backend), server_id));
        }
    }

    fn resolve(self: &Arc<Self>, id: Value, method: &str, mut params: Value) {
        let backend = untag(&mut params).and_then(|key| lock(&self.backends).get(&key).and_then(Weak::upgrade));
        let Some(backend) = backend else {
            // Not ours, or its server stopped: the item is complete as it is.
            self.send(&protocol::response(id, params));
            return;
        };
        let proxy = Arc::clone(self);
        let key = backend_key(&backend);
        backend.send(
            method,
            params,
            Box::new(move |result| {
                let message = match result {
                    Ok(mut item) => {
                        tag_item(&mut item, key);
                        protocol::response(id, item)
                    }
                    Err(err) => protocol::error_response(id, err.code, &err.message),
                };
                proxy.send(&message);
            }),
        );
    }

    fn workspace_symbol(self: &Arc<Self>, id: Value, params: &Value) {
        let Some(pool) = self.pool() else { return };
        let primaries: Vec<Arc<Backend>> = pool.running().into_iter().map(|group| group.primary).collect();
        if primaries.is_empty() {
            self.send(&protocol::response(id, json!([])));
            return;
        }
        let collected = Arc::new(Mutex::new((primaries.len(), Vec::<Value>::new())));
        let limit = self.options.limit.max(1000);
        for backend in primaries {
            let (proxy, collected, id) = (Arc::clone(self), Arc::clone(&collected), id.clone());
            backend.send(
                "workspace/symbol",
                params.clone(),
                Box::new(move |result| {
                    let mut collected = lock(&collected);
                    if let Ok(Value::Array(items)) = result {
                        collected.1.extend(items);
                    }
                    collected.0 -= 1;
                    if collected.0 == 0 {
                        let mut items = std::mem::take(&mut collected.1);
                        items.truncate(limit);
                        drop(collected);
                        proxy.send(&protocol::response(id, Value::Array(items)));
                    }
                }),
            );
        }
    }

    fn execute_command(self: &Arc<Self>, id: Value, params: Value) {
        let command = params.get("command").and_then(Value::as_str).unwrap_or("");
        let backend = self.pool().and_then(|pool| {
            pool.running().into_iter().flat_map(|group| group.backends().cloned().collect::<Vec<_>>()).find(|backend| {
                let capabilities = backend.capabilities();
                (capabilities.pointer("/executeCommandProvider/commands").and_then(Value::as_array))
                    .is_some_and(|commands| commands.iter().any(|it| it.as_str() == Some(command)))
            })
        });
        match backend {
            Some(backend) => self.forward(&backend, id, "workspace/executeCommand", params, false),
            None => self.send(&protocol::error_response(id, code::METHOD_NOT_FOUND, &format!("no server runs {command}"))),
        }
    }

    fn request(self: &Arc<Self>, id: Value, method: &str, params: Value) {
        match method {
            "shutdown" => {
                self.shutting_down.store(true, Ordering::Release);
                *lock(&self.native) = None;
                if let Some(pool) = self.pool() {
                    pool.shutdown();
                }
                self.send(&protocol::response(id, Value::Null));
            }
            "workspace/symbol" => self.workspace_symbol(id, &params),
            "workspace/executeCommand" => self.execute_command(id, params),
            "completionItem/resolve" | "codeAction/resolve" | "inlayHint/resolve" | "codeLens/resolve" | "documentLink/resolve" => {
                self.resolve(id, method, params);
            }
            _ => {
                let Some(path) = request_uri(&params).and_then(uri_to_path) else {
                    self.send(&protocol::error_response(id, code::METHOD_NOT_FOUND, &format!("{method} is not supported")));
                    return;
                };
                let group = match self.group_for(&path) {
                    Ok(group) => group,
                    Err(message) => {
                        self.send(&protocol::error_response(id, code::INTERNAL_ERROR, &message));
                        return;
                    }
                };
                if let Some(document) = lock(&self.documents).get(&path_key(&path)) {
                    group.primary.sync(&document.path, &document.text, Some(document.version));
                }
                let tag = matches!(
                    method,
                    "textDocument/completion"
                        | "textDocument/codeAction"
                        | "textDocument/inlayHint"
                        | "textDocument/codeLens"
                        | "textDocument/documentLink"
                );
                self.forward(&group.primary, id, method, params, tag);
            }
        }
    }

    fn open(self: &Arc<Self>, params: &Value) {
        let Some(item) = params.get("textDocument") else { return };
        let Some(uri) = item.get("uri").and_then(Value::as_str) else { return };
        let Some(path) = uri_to_path(uri) else { return };
        let Some(language) = Language::of_path(&path) else { return };
        let document = Document {
            uri: uri.to_owned(),
            root: language::project_root(language, &path),
            path: path.clone(),
            language,
            version: item.get("version").and_then(Value::as_i64).unwrap_or(1),
            text: item.get("text").and_then(Value::as_str).unwrap_or("").to_owned(),
        };
        let (text, version) = (document.text.clone(), document.version);
        lock(&self.documents).insert(path_key(&path), document);
        self.check_natively(&path);
        // Starting a server takes seconds: the editor goes on meanwhile.
        let proxy = Arc::clone(self);
        let _ = std::thread::Builder::new().name("lsp-open".into()).spawn(move || match proxy.group_for(&path) {
            Ok(group) => {
                for backend in group.backends() {
                    backend.sync(&path, &text, Some(version));
                }
            }
            Err(message) => proxy.send(&protocol::notification(
                "window/logMessage",
                json!({ "type": 2, "message": format!("bun lsp: {message}") }),
            )),
        });
    }

    fn change(&self, params: &Value) {
        let Some(uri) = params.pointer("/textDocument/uri").and_then(Value::as_str) else { return };
        let Some(path) = uri_to_path(uri) else { return };
        let Some(text) = (params.get("contentChanges").and_then(Value::as_array))
            .and_then(|changes| changes.last())
            .and_then(|change| change.get("text"))
            .and_then(Value::as_str)
        else {
            return;
        };
        let version = params.pointer("/textDocument/version").and_then(Value::as_i64);
        let key = path_key(&path);
        let (language, root) = {
            let mut documents = lock(&self.documents);
            let Some(document) = documents.get_mut(&key) else { return };
            text.clone_into(&mut document.text);
            document.version = version.unwrap_or(document.version + 1);
            (document.language, document.root.clone())
        };
        if let Some(group) = self.pool().and_then(|pool| pool.running_group(language, &root)) {
            let version = lock(&self.documents).get(&key).map_or(1, |it| it.version);
            for backend in group.backends() {
                backend.sync(&path, text, Some(version));
            }
        }
        self.check_natively(&path);
    }

    fn close(&self, params: &Value) {
        let Some(uri) = params.pointer("/textDocument/uri").and_then(Value::as_str) else { return };
        let Some(path) = uri_to_path(uri) else { return };
        let Some(document) = lock(&self.documents).remove(&path_key(&path)) else { return };
        if let Some(group) = self.pool().and_then(|pool| pool.running_group(document.language, &document.root)) {
            for backend in group.backends() {
                backend.close(&path);
            }
        }
        let key = uri_key(uri);
        if lock(&self.diagnostics).remove(&key).is_some() {
            self.send(&protocol::notification("textDocument/publishDiagnostics", json!({ "uri": uri, "diagnostics": [] })));
        }
    }

    fn broadcast(&self, method: &str, params: &Value) {
        let Some(pool) = self.pool() else { return };
        for group in pool.running() {
            for backend in group.backends() {
                backend.notify(method, params.clone());
            }
        }
    }

    fn save(&self, params: &Value) {
        let Some(uri) = params.pointer("/textDocument/uri").and_then(Value::as_str) else { return };
        let Some(path) = uri_to_path(uri) else { return };
        if let Some(language) = Language::of_path(&path)
            && let Some(group) = self.pool().and_then(|pool| pool.running_group(language, &language::project_root(language, &path)))
        {
            for backend in group.backends() {
                backend.notify("textDocument/didSave", params.clone());
            }
        }
        self.check_natively(&path);
    }

    fn check_natively(&self, path: &Path) {
        if Language::of_path(path) != Some(Language::TypeScript) || !self.native_active() {
            return;
        }
        if let Some(sender) = lock(&self.native).as_ref() {
            let _ = sender.send(path_key(path));
        }
    }

    /// Checks the TypeScript documents that changed, once typing stops.
    fn native_worker(&self, receiver: &mpsc::Receiver<String>) {
        let Some(native) = self.options.native.clone() else { return };
        while let Ok(first) = receiver.recv() {
            let mut keys = vec![first];
            while let Ok(key) = receiver.recv_timeout(NATIVE_DEBOUNCE) {
                if !keys.contains(&key) {
                    keys.push(key);
                }
            }
            for key in keys {
                let Some((uri, path, root, text, version)) = lock(&self.documents)
                    .get(&key)
                    .map(|it| (it.uri.clone(), it.path.clone(), it.root.clone(), it.text.clone(), it.version))
                else {
                    continue;
                };
                let items = match native.check(&root, std::slice::from_ref(&path), &[(path.clone(), text)]) {
                    Ok(diagnostics) => (diagnostics.iter())
                        .filter(|it| path_key(&it.path) == key)
                        .map(native_to_lsp)
                        .collect(),
                    Err(message) => {
                        self.send(&protocol::notification("window/logMessage", json!({ "type": 1, "message": format!("bun check: {message}") })));
                        continue;
                    }
                };
                // A newer text is queued already.
                if lock(&self.documents).get(&key).is_some_and(|it| it.version == version) {
                    self.set_diagnostics(&uri, "bun check", Some(version), items);
                }
            }
        }
    }

    fn notification(self: &Arc<Self>, method: &str, params: &Value) {
        match method {
            "textDocument/didOpen" => self.open(params),
            "textDocument/didChange" => self.change(params),
            "textDocument/didClose" => self.close(params),
            "textDocument/didSave" => self.save(params),
            "$/cancelRequest" => {
                let Some(id) = params.get("id") else { return };
                if let Some((backend, server_id)) = lock(&self.forwarded).remove(&id_key(id)) {
                    backend.cancel(server_id);
                }
            }
            "workspace/didChangeConfiguration" | "workspace/didChangeWatchedFiles" | "workspace/didChangeWorkspaceFolders" => {
                self.broadcast(method, params);
            }
            _ => {}
        }
    }

    /// The editor's answer to a request of a server.
    fn answer(&self, message: &Value) {
        let Some(id) = message.get("id") else { return };
        let Some((backend, server_id)) = lock(&self.asked).remove(&id_key(id)) else { return };
        let Some(backend) = backend.upgrade() else { return };
        let mut answer = message.clone();
        answer["id"] = server_id;
        backend.respond(&answer);
    }
}

/// Serves the editor on `input` and `output` until `exit` or the end of `input`. Returns the exit
/// code: 1 after an `exit` without `shutdown`.
pub fn run(input: &mut impl BufRead, output: Box<dyn Write + Send>, options: Options) -> i32 {
    let proxy = Arc::new(Proxy {
        output: Mutex::new(output),
        options,
        pool: OnceLock::new(),
        documents: Mutex::new(HashMap::new()),
        diagnostics: Mutex::new(HashMap::new()),
        forwarded: Mutex::new(HashMap::new()),
        asked: Mutex::new(HashMap::new()),
        next_asked: AtomicI64::new(1),
        backends: Mutex::new(HashMap::new()),
        native: Mutex::new(None),
        shutting_down: AtomicBool::new(false),
    });
    let code = loop {
        let message = match protocol::read_message(input) {
            Ok(Some(message)) => message,
            Ok(None) | Err(_) => break 0,
        };
        let method = message.get("method").and_then(Value::as_str).map(str::to_owned);
        let id = message.get("id").cloned();
        let params = message.get("params").cloned().unwrap_or(Value::Null);
        match (method.as_deref(), id) {
            (Some("exit"), _) => break if proxy.shutting_down.load(Ordering::Acquire) { 0 } else { 1 },
            (Some("initialize"), Some(id)) => {
                let weak = Arc::downgrade(&proxy);
                let handler: Handler = Arc::new(move |backend: &Arc<Backend>, incoming| {
                    if let Some(proxy) = weak.upgrade() {
                        proxy.from_server(backend, incoming);
                    }
                });
                let _ = proxy.pool.set(Pool::new(proxy.options.clone(), server_params(&params), handler));
                if proxy.native_active() {
                    let (sender, receiver) = mpsc::channel();
                    *lock(&proxy.native) = Some(sender);
                    let worker = Arc::clone(&proxy);
                    let _ = std::thread::Builder::new().name("lsp-native".into()).spawn(move || worker.native_worker(&receiver));
                }
                proxy.send(&protocol::response(
                    id,
                    json!({
                        "capabilities": capabilities(),
                        "serverInfo": { "name": "bun lsp", "version": env!("CARGO_PKG_VERSION") },
                    }),
                ));
            }
            (Some("initialized"), None) => {}
            (Some(method), Some(id)) if proxy.pool().is_none() => {
                proxy.send(&protocol::error_response(id, code::SERVER_NOT_INITIALIZED, &format!("{method} before initialize")));
            }
            (Some(method), Some(id)) => proxy.request(id, method, params),
            (Some(method), None) => proxy.notification(method, &params),
            (None, Some(_)) => proxy.answer(&message),
            (None, None) => {}
        }
    };
    *lock(&proxy.native) = None;
    if let Some(pool) = proxy.pool() {
        pool.shutdown();
    }
    code
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tags_and_untags_items() {
        let mut result = json!({ "isIncomplete": false, "items": [{ "label": "a", "data": 7 }, { "label": "b" }] });
        tag_items(&mut result, 42);
        let mut first = result["items"][0].clone();
        let mut second = result["items"][1].clone();
        assert_eq!(untag(&mut first), Some(42));
        assert_eq!(first, json!({ "label": "a", "data": 7 }));
        assert_eq!(untag(&mut second), Some(42));
        assert_eq!(second, json!({ "label": "b" }));
        assert_eq!(untag(&mut json!({ "label": "c", "data": 1 })), None);
    }

    #[test]
    fn server_params_drop_pull_diagnostics() {
        let params = server_params(&json!({ "capabilities": { "textDocument": { "diagnostic": {}, "hover": {} } }, "rootUri": "file:///x" }));
        assert!(params.pointer("/capabilities/textDocument/diagnostic").is_none());
        assert!(params.pointer("/capabilities/textDocument/hover").is_some());
        assert!(params.get("rootUri").is_none());
        assert_eq!(params.pointer("/capabilities/general/positionEncodings"), Some(&json!(["utf-16"])));
    }

    #[test]
    fn finds_the_document_of_a_request() {
        assert_eq!(request_uri(&json!({ "textDocument": { "uri": "file:///a.ts" } })), Some("file:///a.ts"));
        assert_eq!(request_uri(&json!({ "item": { "uri": "file:///b.rs" } })), Some("file:///b.rs"));
        assert_eq!(request_uri(&json!({})), None);
    }

    #[test]
    fn converts_native_diagnostics() {
        let diagnostic = NativeDiagnostic {
            path: PathBuf::from("a.ts"),
            start: (1, 2),
            end: (1, 5),
            severity: 1,
            code: Some("2322".into()),
            message: "x".into(),
        };
        let value = native_to_lsp(&diagnostic);
        assert_eq!(value["code"], json!(2322));
        assert_eq!(value["range"]["end"]["character"], json!(5));
    }
}

