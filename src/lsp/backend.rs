//! One language server process: requests with timeouts and cancellation, the documents it has
//! open, and the diagnostics it has published.

use std::collections::{HashMap, VecDeque};
use std::io::{BufReader, BufWriter, Read};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicI64, AtomicU64, Ordering};
use std::sync::{Arc, Condvar, Mutex, MutexGuard, mpsc};
use std::time::{Duration, Instant};

use serde_json::{Value, json};

use crate::language::{Language, ServerCommand};
use crate::protocol::{self, code, path_to_uri, uri_key};

/// An error that a server returned, or why it could not answer.
#[derive(Clone, Debug)]
pub struct RpcError {
    pub code: i64,
    pub message: String,
}

impl std::fmt::Display for RpcError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{} ({})", self.message, self.code)
    }
}

type Reply = Box<dyn FnOnce(Result<Value, RpcError>) + Send>;

/// A message that the server sent on its own: a notification, or a request to the client.
pub enum Incoming {
    Notification { method: String, params: Value },
    Request { id: Value, method: String, params: Value },
}

/// What happens to the messages that a server sends on its own.
pub type Handler = Arc<dyn Fn(&Arc<Backend>, Incoming) + Send + Sync>;

/// The diagnostics that a server last published for a document.
#[derive(Clone, Default)]
pub struct Published {
    pub version: Option<i64>,
    pub items: Vec<Value>,
    /// `Backend::published_count` when they arrived.
    pub sequence: u64,
}

struct OpenDocument {
    uri: String,
    version: i64,
    hash: u64,
    used: Instant,
}

/// The most documents a server keeps open; the least recently used is closed past it.
const MAX_OPEN_DOCUMENTS: usize = 256;
/// How long the diagnostics of a document may keep changing after the first ones arrive.
const SETTLE: Duration = Duration::from_millis(150);
const STDERR_LINES: usize = 40;

pub struct Backend {
    pub language: Language,
    pub root: PathBuf,
    pub command: ServerCommand,
    /// `InitializeResult.capabilities`.
    capabilities: Mutex<Value>,
    child: Mutex<Option<Child>>,
    stdin: Mutex<Option<BufWriter<ChildStdin>>>,
    next_id: AtomicI64,
    pending: Mutex<HashMap<i64, Reply>>,
    documents: Mutex<HashMap<String, OpenDocument>>,
    diagnostics: Mutex<HashMap<String, Published>>,
    published: Condvar,
    published_count: AtomicU64,
    alive: AtomicBool,
    used: Mutex<Instant>,
    stderr: Mutex<VecDeque<String>>,
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(std::sync::PoisonError::into_inner)
}

fn hash_text(text: &str) -> u64 {
    // FNV-1a: only compared with itself, in this process.
    text.bytes().fold(0xcbf2_9ce4_8422_2325u64, |hash, byte| (hash ^ u64::from(byte)).wrapping_mul(0x0100_0000_01b3))
}

impl Backend {
    /// Starts the server and runs `initialize`. `params` is the `InitializeParams` without the
    /// root, which is `root`.
    pub fn start(
        language: Language,
        root: &Path,
        command: ServerCommand,
        params: &Value,
        handler: Handler,
        timeout: Duration,
    ) -> Result<Arc<Backend>, String> {
        let mut process = Command::new(&command.program);
        process
            .args(&command.args)
            .envs(command.env.iter().map(|(name, value)| (name, value)))
            .current_dir(root)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            process.creation_flags(CREATE_NO_WINDOW);
        }
        let mut child = process
            .spawn()
            .map_err(|err| format!("could not start {} ({}): {err}", command.name, command.command_line()))?;
        let stdin = child.stdin.take().map(BufWriter::new);
        let stdout = child.stdout.take();
        let stderr = child.stderr.take();
        let backend = Arc::new(Backend {
            language,
            root: root.to_path_buf(),
            command,
            capabilities: Mutex::new(Value::Null),
            child: Mutex::new(Some(child)),
            stdin: Mutex::new(stdin),
            next_id: AtomicI64::new(1),
            pending: Mutex::new(HashMap::new()),
            documents: Mutex::new(HashMap::new()),
            diagnostics: Mutex::new(HashMap::new()),
            published: Condvar::new(),
            published_count: AtomicU64::new(0),
            alive: AtomicBool::new(true),
            used: Mutex::new(Instant::now()),
            stderr: Mutex::new(VecDeque::new()),
        });
        if let Some(stdout) = stdout {
            let reader = Arc::clone(&backend);
            std::thread::Builder::new()
                .name(format!("lsp-{}", backend.command.name))
                .spawn(move || reader.read_loop(stdout, &handler))
                .map_err(|err| format!("could not start a thread: {err}"))?;
        }
        if let Some(mut stderr) = stderr {
            let tail = Arc::clone(&backend);
            let _ = std::thread::Builder::new().name("lsp-stderr".into()).spawn(move || {
                let mut buffer = [0u8; 4096];
                let mut partial = String::new();
                while let Ok(read @ 1..) = stderr.read(&mut buffer) {
                    partial.push_str(&String::from_utf8_lossy(&buffer[..read]));
                    while let Some(at) = partial.find('\n') {
                        let line: String = partial.drain(..=at).collect();
                        let mut lines = lock(&tail.stderr);
                        if lines.len() == STDERR_LINES {
                            lines.pop_front();
                        }
                        lines.push_back(line.trim_end().chars().take(400).collect());
                    }
                }
            });
        }
        let mut params = params.clone();
        let uri = path_to_uri(root);
        let name = root.file_name().map_or_else(|| uri.clone(), |it| it.to_string_lossy().into_owned());
        params["processId"] = json!(std::process::id());
        params["rootUri"] = json!(uri);
        params["rootPath"] = json!(root.display().to_string());
        params["workspaceFolders"] = json!([{ "uri": uri, "name": name }]);
        if let Some(options) = &backend.command.initialization_options {
            params["initializationOptions"] = options.clone();
        }
        match backend.request("initialize", params, timeout, None) {
            Ok(result) => {
                *lock(&backend.capabilities) = result.get("capabilities").cloned().unwrap_or(Value::Null);
                backend.notify("initialized", json!({}));
                Ok(backend)
            }
            Err(err) => {
                backend.kill();
                Err(format!("{} did not initialize: {}{}", backend.command.name, err.message, backend.stderr_note()))
            }
        }
    }

    /// The last lines that the server wrote on stderr, as a note for an error message.
    pub fn stderr_note(&self) -> String {
        let lines = lock(&self.stderr);
        if lines.is_empty() {
            return String::new();
        }
        let tail: Vec<&str> = lines.iter().rev().take(5).rev().map(String::as_str).collect();
        format!("\nnote: {} stderr:\n  {}", self.command.name, tail.join("\n  "))
    }

    pub fn is_alive(&self) -> bool {
        self.alive.load(Ordering::Acquire)
    }

    pub fn capabilities(&self) -> Value {
        lock(&self.capabilities).clone()
    }

    /// Whether the server answers `method`, by its capabilities.
    pub fn supports(&self, capability: &str) -> bool {
        let capabilities = lock(&self.capabilities);
        match capabilities.get(capability) {
            None | Some(Value::Null) | Some(Value::Bool(false)) => false,
            Some(_) => true,
        }
    }

    pub fn idle_for(&self) -> Duration {
        lock(&self.used).elapsed()
    }

    fn touch(&self) {
        *lock(&self.used) = Instant::now();
    }

    fn read_loop(self: Arc<Self>, stdout: impl Read, handler: &Handler) {
        let mut reader = BufReader::new(stdout);
        while let Ok(Some(message)) = protocol::read_message(&mut reader) {
            let method = message.get("method").and_then(Value::as_str).map(str::to_owned);
            let id = message.get("id").cloned();
            match (method, id) {
                (None, Some(id)) => {
                    let Some(id) = id.as_i64() else { continue };
                    let Some(reply) = lock(&self.pending).remove(&id) else { continue };
                    let result = match message.get("error") {
                        Some(error) => Err(RpcError {
                            code: error.get("code").and_then(Value::as_i64).unwrap_or(code::INTERNAL_ERROR),
                            message: error.get("message").and_then(Value::as_str).unwrap_or("").to_owned(),
                        }),
                        None => Ok(message.get("result").cloned().unwrap_or(Value::Null)),
                    };
                    reply(result);
                }
                (Some(method), None) => {
                    let params = message.get("params").cloned().unwrap_or(Value::Null);
                    if method == "textDocument/publishDiagnostics" {
                        self.store_published(&params);
                    }
                    handler(&self, Incoming::Notification { method, params });
                }
                (Some(method), Some(id)) => {
                    let params = message.get("params").cloned().unwrap_or(Value::Null);
                    handler(&self, Incoming::Request { id, method, params });
                }
                (None, None) => {}
            }
        }
        self.alive.store(false, Ordering::Release);
        let note = self.stderr_note();
        let pending: Vec<Reply> = lock(&self.pending).drain().map(|(_, reply)| reply).collect();
        for reply in pending {
            reply(Err(RpcError { code: code::INTERNAL_ERROR, message: format!("{} exited{note}", self.command.name) }));
        }
        self.published.notify_all();
    }

    fn store_published(&self, params: &Value) {
        let Some(uri) = params.get("uri").and_then(Value::as_str) else { return };
        let sequence = self.published_count.fetch_add(1, Ordering::AcqRel) + 1;
        let published = Published {
            version: params.get("version").and_then(Value::as_i64),
            items: params.get("diagnostics").and_then(Value::as_array).cloned().unwrap_or_default(),
            sequence,
        };
        lock(&self.diagnostics).insert(uri_key(uri), published);
        self.published.notify_all();
    }

    fn write(&self, message: &Value) -> Result<(), RpcError> {
        let mut stdin = lock(&self.stdin);
        let Some(stdin) = stdin.as_mut() else {
            return Err(RpcError { code: code::INTERNAL_ERROR, message: format!("{} has stopped", self.command.name) });
        };
        protocol::write_message(stdin, message).map_err(|err| RpcError {
            code: code::INTERNAL_ERROR,
            message: format!("could not write to {}: {err}{}", self.command.name, self.stderr_note()),
        })
    }

    pub fn notify(&self, method: &str, params: Value) {
        let _ = self.write(&protocol::notification(method, params));
    }

    /// Answers a request that the server sent.
    pub fn respond(&self, message: &Value) {
        let _ = self.write(message);
    }

    /// Sends a request; `reply` gets its result. Returns the id, for `$/cancelRequest`.
    pub fn send(&self, method: &str, params: Value, reply: Reply) -> i64 {
        self.touch();
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        lock(&self.pending).insert(id, reply);
        if let Err(err) = self.write(&protocol::request(id, method, params))
            && let Some(reply) = lock(&self.pending).remove(&id)
        {
            reply(Err(err));
        }
        id
    }

    pub fn cancel(&self, id: i64) {
        self.notify("$/cancelRequest", json!({ "id": id }));
    }

    /// Sends a request and waits for its result, at most `timeout`, or until `cancelled` is set.
    pub fn request(
        &self,
        method: &str,
        params: Value,
        timeout: Duration,
        cancelled: Option<&AtomicBool>,
    ) -> Result<Value, RpcError> {
        let (sender, receiver) = mpsc::channel();
        let id = self.send(method, params, Box::new(move |result| drop(sender.send(result))));
        let deadline = Instant::now() + timeout;
        loop {
            let left = deadline.saturating_duration_since(Instant::now());
            match receiver.recv_timeout(left.min(Duration::from_millis(50))) {
                Ok(result) => return result,
                Err(mpsc::RecvTimeoutError::Disconnected) => {
                    return Err(RpcError { code: code::INTERNAL_ERROR, message: format!("{} exited", self.command.name) });
                }
                Err(mpsc::RecvTimeoutError::Timeout) => {}
            }
            let is_cancelled = cancelled.is_some_and(|flag| flag.load(Ordering::Acquire));
            if is_cancelled || Instant::now() >= deadline {
                lock(&self.pending).remove(&id);
                self.cancel(id);
                let message = match is_cancelled {
                    true => format!("{method} was cancelled"),
                    false => format!("{} did not answer {method} within {} ms", self.command.name, timeout.as_millis()),
                };
                return Err(RpcError { code: code::REQUEST_CANCELLED, message });
            }
        }
    }

    /// Opens `path` with `text`, or sends the new text if it changed. Returns its version.
    pub fn sync(&self, path: &Path, text: &str, version: Option<i64>) -> i64 {
        let key = protocol::path_key(path);
        let uri = path_to_uri(path);
        let hash = hash_text(text);
        let mut documents = lock(&self.documents);
        if let Some(document) = documents.get_mut(&key) {
            document.used = Instant::now();
            if document.hash == hash && version.is_none_or(|it| it == document.version) {
                return document.version;
            }
            document.version = version.unwrap_or(document.version + 1);
            document.hash = hash;
            let version = document.version;
            drop(documents);
            self.notify(
                "textDocument/didChange",
                json!({ "textDocument": { "uri": uri, "version": version }, "contentChanges": [{ "text": text }] }),
            );
            return version;
        }
        if documents.len() >= MAX_OPEN_DOCUMENTS
            && let Some(oldest) = documents.iter().min_by_key(|(_, it)| it.used).map(|(key, _)| key.clone())
            && let Some(closed) = documents.remove(&oldest)
        {
            lock(&self.diagnostics).remove(&oldest);
            self.notify("textDocument/didClose", json!({ "textDocument": { "uri": closed.uri } }));
        }
        let version = version.unwrap_or(1);
        documents.insert(key, OpenDocument { uri: uri.clone(), version, hash, used: Instant::now() });
        drop(documents);
        self.notify(
            "textDocument/didOpen",
            json!({ "textDocument": {
                "uri": uri,
                "languageId": Language::language_id(path),
                "version": version,
                "text": text,
            }}),
        );
        version
    }

    pub fn close(&self, path: &Path) {
        if lock(&self.documents).remove(&protocol::path_key(path)).is_some() {
            self.notify("textDocument/didClose", json!({ "textDocument": { "uri": path_to_uri(path) } }));
        }
        lock(&self.diagnostics).remove(&protocol::path_key(path));
    }

    /// How many documents are open.
    pub fn open_documents(&self) -> usize {
        lock(&self.documents).len()
    }

    /// The diagnostics last published for `path`.
    pub fn published(&self, path: &Path) -> Option<Published> {
        lock(&self.diagnostics).get(&protocol::path_key(path)).cloned()
    }

    pub fn published_count(&self) -> u64 {
        self.published_count.load(Ordering::Acquire)
    }

    /// The diagnostics of `path` with `text`: pulled with `textDocument/diagnostic` if the server
    /// can, else those it publishes after the text is sent. `complete` is false if none came in time.
    pub fn diagnostics(&self, path: &Path, text: &str, timeout: Duration, cancelled: Option<&AtomicBool>) -> (Vec<Value>, bool) {
        let before = self.published_count();
        let version = self.sync(path, text, None);
        if self.supports("diagnosticProvider") {
            let params = json!({ "textDocument": { "uri": path_to_uri(path) } });
            if let Ok(result) = self.request("textDocument/diagnostic", params, timeout, cancelled) {
                if let Some(items) = result.get("items").and_then(Value::as_array) {
                    return (items.clone(), true);
                }
                if result.get("kind").and_then(Value::as_str) == Some("unchanged")
                    && let Some(published) = self.published(path)
                {
                    return (published.items, true);
                }
            }
        }
        let key = protocol::path_key(path);
        let is_fresh = |published: &Published| match published.version {
            Some(it) => it >= version,
            None => published.sequence > before,
        };
        let deadline = Instant::now() + timeout;
        let mut diagnostics = lock(&self.diagnostics);
        let mut settled_at: Option<Instant> = None;
        loop {
            let fresh = diagnostics.get(&key).filter(|it| is_fresh(it)).cloned();
            let now = Instant::now();
            if let Some(fresh) = &fresh {
                let until = *settled_at.get_or_insert(now + SETTLE);
                if now >= until {
                    return (fresh.items.clone(), true);
                }
            }
            let cancelled = cancelled.is_some_and(|flag| flag.load(Ordering::Acquire));
            if now >= deadline || cancelled || !self.is_alive() {
                let items = diagnostics.get(&key).map(|it| it.items.clone()).unwrap_or_default();
                return (items, fresh.is_some());
            }
            let wake = settled_at.unwrap_or(deadline).min(deadline).min(now + Duration::from_millis(50));
            let (guard, _) = self
                .published
                .wait_timeout(diagnostics, wake.saturating_duration_since(now))
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            diagnostics = guard;
        }
    }

    /// `shutdown`, `exit`, then kills the process if it is still there.
    pub fn stop(&self) {
        if self.is_alive() {
            let _ = self.request("shutdown", Value::Null, Duration::from_secs(2), None);
            self.notify("exit", Value::Null);
        }
        *lock(&self.stdin) = None;
        let mut child = lock(&self.child);
        if let Some(child) = child.as_mut() {
            let deadline = Instant::now() + Duration::from_secs(1);
            while Instant::now() < deadline {
                if let Ok(Some(_)) = child.try_wait() {
                    break;
                }
                std::thread::sleep(Duration::from_millis(20));
            }
        }
        if let Some(mut child) = child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
        self.alive.store(false, Ordering::Release);
    }

    fn kill(&self) {
        *lock(&self.stdin) = None;
        if let Some(mut child) = lock(&self.child).take() {
            let _ = child.kill();
            let _ = child.wait();
        }
        self.alive.store(false, Ordering::Release);
    }
}

impl Drop for Backend {
    fn drop(&mut self) {
        if let Some(mut child) = lock(&self.child).take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}
