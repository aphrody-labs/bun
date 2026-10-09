// SPDX-License-Identifier: Apache-2.0
//! JSON routes over the index registry, shared by `bun:vfs`, `bun vfs` and `bun mcp`.

use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex, RwLock};

use serde::Deserialize;
use serde_json::json;

use crate::{
    EditPlan, GrepOptions, Index, IndexOptions, Result, SearchQuery, SpanProvider, VfsError, edit,
    grep,
};

/// Open indexes addressed by handle, plus the identifier matcher used by `edit`.
pub struct Session {
    indexes: Mutex<BTreeMap<u32, Arc<RwLock<Index>>>>,
    next: AtomicU32,
    spans: Option<&'static dyn SpanProvider>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct LoadRequest {
    #[serde(default)]
    options: IndexOptions,
    #[serde(default)]
    snapshot: Option<PathBuf>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct OpenRequest {
    snapshot: PathBuf,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct HandleRequest {
    handle: u32,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct SaveRequest {
    handle: u32,
    #[serde(default)]
    snapshot: Option<PathBuf>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct SearchRequest {
    handle: u32,
    #[serde(default)]
    query: SearchQuery,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct SnapshotPathRequest {
    #[serde(default)]
    root: String,
}

impl Session {
    pub const fn new(spans: Option<&'static dyn SpanProvider>) -> Self {
        Self {
            indexes: Mutex::new(BTreeMap::new()),
            next: AtomicU32::new(1),
            spans,
        }
    }

    /// Runs `op` on the JSON request `input` and returns the JSON response.
    ///
    /// | op | request | response |
    /// | --- | --- | --- |
    /// | `load` | `{options?, snapshot?}` | `{handle, stats, report}` ([`Index::load`]) |
    /// | `build` | `{options?}` | `{handle, stats}` |
    /// | `open` | `{snapshot}` | `{handle, stats}` |
    /// | `refresh` | `{handle}` | [`crate::RefreshStats`] |
    /// | `save` | `{handle, snapshot?}` | `{snapshot, bytes}` |
    /// | `search` | `{handle, query}` | [`crate::SearchPage`] |
    /// | `stats` | `{handle}` | [`crate::IndexStats`] |
    /// | `close` | `{handle}` | `{closed}` |
    /// | `snapshot_path` | `{root?}` | path string |
    /// | `grep` | [`GrepOptions`] | [`crate::GrepPage`] |
    /// | `edit` | [`EditPlan`] | [`crate::EditReport`] |
    pub fn call(&self, op: &str, input: &str, cancel: &AtomicBool) -> Result<String> {
        let input = if input.trim().is_empty() { "{}" } else { input };
        let value = match op {
            "load" => {
                let request: LoadRequest = serde_json::from_str(input)?;
                let (index, report) =
                    Index::load(&request.options, request.snapshot.as_deref(), cancel)?;
                let stats = index.stats();
                json!({ "handle": self.insert(index)?, "stats": stats, "report": report })
            }
            "build" => {
                let request: LoadRequest = serde_json::from_str(input)?;
                if request.snapshot.is_some() {
                    return Err(VfsError::Invalid("build takes no snapshot".into()));
                }
                let index = Index::build(&request.options, cancel)?;
                let stats = index.stats();
                json!({ "handle": self.insert(index)?, "stats": stats })
            }
            "open" => {
                let request: OpenRequest = serde_json::from_str(input)?;
                let index = Index::open(&request.snapshot)?;
                let stats = index.stats();
                json!({ "handle": self.insert(index)?, "stats": stats })
            }
            "refresh" => {
                let request: HandleRequest = serde_json::from_str(input)?;
                let index = self.get(request.handle)?;
                let mut index = index.write().map_err(|_| poisoned())?;
                serde_json::to_value(index.refresh(cancel)?)?
            }
            "save" => {
                let request: SaveRequest = serde_json::from_str(input)?;
                let index = self.get(request.handle)?;
                let index = index.read().map_err(|_| poisoned())?;
                let path = request
                    .snapshot
                    .unwrap_or_else(|| Index::default_snapshot_path(index.root()));
                let bytes = index.save(&path)?;
                json!({ "snapshot": path.to_string_lossy(), "bytes": bytes })
            }
            "search" => {
                let request: SearchRequest = serde_json::from_str(input)?;
                let index = self.get(request.handle)?;
                let index = index.read().map_err(|_| poisoned())?;
                serde_json::to_value(index.search(&request.query)?)?
            }
            "stats" => {
                let request: HandleRequest = serde_json::from_str(input)?;
                let index = self.get(request.handle)?;
                let index = index.read().map_err(|_| poisoned())?;
                serde_json::to_value(index.stats())?
            }
            "close" => {
                let request: HandleRequest = serde_json::from_str(input)?;
                let closed = self
                    .indexes
                    .lock()
                    .map_err(|_| poisoned())?
                    .remove(&request.handle)
                    .is_some();
                json!({ "closed": closed })
            }
            "snapshot_path" => {
                let request: SnapshotPathRequest = serde_json::from_str(input)?;
                json!(Index::default_snapshot_path(&request.root).to_string_lossy())
            }
            "grep" => {
                let options: GrepOptions = serde_json::from_str(input)?;
                serde_json::to_value(grep(&options, cancel)?)?
            }
            "edit" => {
                let plan: EditPlan = serde_json::from_str(input)?;
                serde_json::to_value(edit(&plan, self.spans, cancel)?)?
            }
            _ => return Err(VfsError::Invalid(format!("unknown vfs operation: {op}"))),
        };
        Ok(serde_json::to_string(&value)?)
    }

    fn insert(&self, index: Index) -> Result<u32> {
        let handle = self.next.fetch_add(1, Ordering::Relaxed);
        self.indexes
            .lock()
            .map_err(|_| poisoned())?
            .insert(handle, Arc::new(RwLock::new(index)));
        Ok(handle)
    }

    fn get(&self, handle: u32) -> Result<Arc<RwLock<Index>>> {
        self.indexes
            .lock()
            .map_err(|_| poisoned())?
            .get(&handle)
            .cloned()
            .ok_or_else(|| VfsError::Invalid(format!("unknown or closed index handle {handle}")))
    }
}

fn poisoned() -> VfsError {
    VfsError::Invalid("vfs index registry poisoned by a panic".into())
}

impl VfsError {
    /// Stable error code (`ERR_VFS_*`) for JS and CLI callers.
    pub fn code(&self) -> &'static str {
        match self {
            VfsError::Cancelled => "ABORT_ERR",
            VfsError::Limit(_) => "ERR_VFS_LIMIT",
            VfsError::Invalid(_) | VfsError::Json(_) | VfsError::Regex(_) | VfsError::Glob(_) => {
                "ERR_VFS_INVALID"
            }
            VfsError::Outside(_) => "ERR_VFS_OUTSIDE",
            VfsError::Path { .. } | VfsError::Io(_) | VfsError::Walk(_) => "ERR_VFS_IO",
        }
    }
}
