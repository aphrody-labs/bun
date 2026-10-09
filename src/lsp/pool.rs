//! The language servers that are running: started on first use, one per language and project
//! root, stopped when idle or when there are too many.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{Duration, Instant};

use serde_json::{Value, json};

use crate::Options;
use crate::backend::{Backend, Handler, Incoming};
use crate::language::{self, Language};
use crate::protocol::{self, code, path_key, path_to_uri};

/// The servers of one language for one project root.
#[derive(Clone)]
pub struct Group {
    pub language: Language,
    pub root: PathBuf,
    pub primary: Arc<Backend>,
    /// Asked for diagnostics too.
    pub secondary: Vec<Arc<Backend>>,
}

impl Group {
    pub fn backends(&self) -> impl Iterator<Item = &Arc<Backend>> {
        std::iter::once(&self.primary).chain(self.secondary.iter())
    }

    fn idle_for(&self) -> Duration {
        self.backends().map(|it| it.idle_for()).min().unwrap_or_default()
    }

    fn stop(&self) {
        for backend in self.backends() {
            backend.stop();
        }
    }
}

enum Slot {
    Empty,
    Running(Group),
    /// Starting failed; it is tried again after `RETRY_AFTER`.
    Failed(String, Instant),
}

const RETRY_AFTER: Duration = Duration::from_secs(20);

pub struct Pool {
    options: Options,
    params: Value,
    handler: Handler,
    slots: Mutex<HashMap<(Language, String), Arc<Mutex<Slot>>>>,
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(std::sync::PoisonError::into_inner)
}

/// `InitializeParams` of a client that reads answers rather than shows them.
pub fn default_initialize_params() -> Value {
    json!({
        "clientInfo": { "name": "bun lsp", "version": env!("CARGO_PKG_VERSION") },
        "capabilities": {
            "general": { "positionEncodings": ["utf-16"] },
            "textDocument": {
                "synchronization": { "didSave": true, "dynamicRegistration": false },
                "publishDiagnostics": { "relatedInformation": true, "versionSupport": true, "codeDescriptionSupport": true },
                "diagnostic": { "dynamicRegistration": false, "relatedDocumentSupport": false },
                "hover": { "contentFormat": ["markdown", "plaintext"] },
                "definition": { "linkSupport": true },
                "references": {},
                "documentSymbol": { "hierarchicalDocumentSymbolSupport": true },
                "rename": { "prepareSupport": false },
            },
            "workspace": {
                "symbol": {},
                "workspaceFolders": true,
                "configuration": true,
                "workspaceEdit": { "documentChanges": true },
            },
            "window": { "workDoneProgress": false },
        },
    })
}

/// Answers what a server asks a client that has no user interface.
pub fn answer_server_request(backend: &Arc<Backend>, incoming: Incoming) {
    let Incoming::Request { id, method, params } = incoming else { return };
    let result = match method.as_str() {
        "workspace/configuration" => {
            let count = params.get("items").and_then(Value::as_array).map_or(0, Vec::len);
            Value::Array(vec![Value::Null; count])
        }
        "workspace/workspaceFolders" => {
            let uri = path_to_uri(&backend.root);
            json!([{ "uri": uri, "name": backend.root.display().to_string() }])
        }
        "workspace/applyEdit" => json!({ "applied": false, "failureReason": "bun lsp applies edits itself" }),
        "window/showDocument" => json!({ "success": false }),
        "window/workDoneProgress/create"
        | "client/registerCapability"
        | "client/unregisterCapability"
        | "window/showMessageRequest"
        | "workspace/diagnostic/refresh"
        | "workspace/semanticTokens/refresh"
        | "workspace/inlayHint/refresh"
        | "workspace/codeLens/refresh" => Value::Null,
        _ => {
            backend.respond(&protocol::error_response(id, code::METHOD_NOT_FOUND, &format!("{method} is not supported")));
            return;
        }
    };
    backend.respond(&protocol::response(id, result));
}

impl Pool {
    pub fn new(options: Options, params: Value, handler: Handler) -> Pool {
        Pool { options, params, handler, slots: Mutex::new(HashMap::new()) }
    }

    pub fn options(&self) -> &Options {
        &self.options
    }

    /// The servers of `language` for `root`, started if they are not running.
    pub fn get(&self, language: Language, root: &Path) -> Result<Group, String> {
        let slot = {
            let mut slots = lock(&self.slots);
            Arc::clone(slots.entry((language, path_key(root))).or_insert_with(|| Arc::new(Mutex::new(Slot::Empty))))
        };
        let mut slot = lock(&slot);
        match &*slot {
            Slot::Running(group) if group.primary.is_alive() => return Ok(group.clone()),
            Slot::Running(group) => group.stop(),
            Slot::Failed(message, at) if at.elapsed() < RETRY_AFTER => return Err(message.clone()),
            _ => {}
        }
        self.make_room(language, root);
        match self.start(language, root) {
            Ok(group) => {
                *slot = Slot::Running(group.clone());
                Ok(group)
            }
            Err(message) => {
                *slot = Slot::Failed(message.clone(), Instant::now());
                Err(message)
            }
        }
    }

    /// The running group of `language` for `root`, without starting it.
    pub fn running_group(&self, language: Language, root: &Path) -> Option<Group> {
        let slot = lock(&self.slots).get(&(language, path_key(root))).cloned()?;
        let slot = slot.try_lock().ok()?;
        match &*slot {
            Slot::Running(group) if group.primary.is_alive() => Some(group.clone()),
            _ => None,
        }
    }

    fn start(&self, language: Language, root: &Path) -> Result<Group, String> {
        let servers = language::discover(language, root, &self.options);
        let Some(command) = servers.primary else {
            let missing = servers.missing.unwrap_or_default();
            return Err(format!("no {} language server found: install {missing}", language.name()));
        };
        let timeout = self.options.timeout.max(Duration::from_secs(30));
        let primary = Backend::start(language, root, command, &self.params, Arc::clone(&self.handler), timeout)?;
        // Best effort: the primary answers everything that a secondary would add to.
        let secondary = (servers.secondary.into_iter())
            .filter_map(|command| Backend::start(language, root, command, &self.params, Arc::clone(&self.handler), timeout).ok())
            .collect();
        Ok(Group { language, root: root.to_path_buf(), primary, secondary })
    }

    /// Every running group.
    pub fn running(&self) -> Vec<Group> {
        let slots: Vec<Arc<Mutex<Slot>>> = lock(&self.slots).values().cloned().collect();
        slots
            .iter()
            .filter_map(|slot| match &*slot.try_lock().ok()? {
                Slot::Running(group) if group.primary.is_alive() => Some(group.clone()),
                _ => None,
            })
            .collect()
    }

    /// Stops the least recently used groups until another fits under `Options::max_servers`.
    fn make_room(&self, language: Language, root: &Path) {
        let mut running = self.running();
        running.retain(|group| !(group.language == language && path_key(&group.root) == path_key(root)));
        let count: usize = running.iter().map(|group| group.backends().count()).sum();
        if count < self.options.max_servers {
            return;
        }
        running.sort_by_key(|group| std::cmp::Reverse(group.idle_for()));
        let mut excess = count + 1 - self.options.max_servers;
        for group in running {
            if excess == 0 {
                break;
            }
            excess = excess.saturating_sub(group.backends().count());
            self.remove(&group);
        }
    }

    fn remove(&self, group: &Group) {
        let slot = lock(&self.slots).remove(&(group.language, path_key(&group.root)));
        group.stop();
        drop(slot);
    }

    /// Stops the groups that nothing used for `idle`.
    pub fn reap(&self, idle: Duration) {
        for group in self.running() {
            if group.idle_for() >= idle {
                self.remove(&group);
            }
        }
    }

    pub fn shutdown(&self) {
        let slots: Vec<Arc<Mutex<Slot>>> = lock(&self.slots).drain().map(|(_, slot)| slot).collect();
        let groups: Vec<Group> = slots
            .iter()
            .filter_map(|slot| match &*lock(slot) {
                Slot::Running(group) => Some(group.clone()),
                _ => None,
            })
            .collect();
        std::thread::scope(|scope| {
            for group in &groups {
                scope.spawn(|| group.stop());
            }
        });
    }
}
