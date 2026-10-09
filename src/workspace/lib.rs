// SPDX-License-Identifier: Apache-2.0
//! Bounded native workspace operations and dependency-ordered workflows.

use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};

use serde::{Deserialize, Serialize};
use serde_json::Value;

mod error;
#[path = "../file_tools/mod.rs"]
mod file_tools;
mod request;
#[path = "../workflow/mod.rs"]
mod workflow;

pub use error::{Result, WorkspaceError};
pub use request::{
    EditKind, EditRule, FileTask, InspectMode, Limits, Matcher, Selection, WorkspaceOperation,
    WorkspaceRequest,
};
pub use workflow::Stage;

pub const MAX_REQUEST_BYTES: usize = 2 * 1024 * 1024;

#[derive(Debug, Serialize, Deserialize)]
pub struct SourceProvenance {
    pub repository: String,
    pub revision: String,
    pub license: String,
}

#[cfg(test)]
mod tests;

pub fn provenance() -> SourceProvenance {
    SourceProvenance {
        repository: "https://github.com/aphrody-labs/aphrody".into(),
        revision: "7e9df1c89c1b5de85c3a16a92949cb709de6f4ac".into(),
        license: "Apache-2.0".into(),
    }
}

pub(crate) fn check_cancel(cancel: &AtomicBool) -> Result<()> {
    if cancel.load(Ordering::Acquire) {
        Err(WorkspaceError::Cancelled)
    } else {
        Ok(())
    }
}

pub async fn execute_json(json: &str, cancel: Arc<AtomicBool>) -> Result<String> {
    if json.len() > MAX_REQUEST_BYTES {
        return Err(WorkspaceError::Limit("request bytes"));
    }
    check_cancel(&cancel)?;
    let request: WorkspaceRequest = serde_json::from_str(json)?;
    let output_limit = request.limits.max_output_bytes;
    let result = run(request, cancel).await?;
    let mut output = file_tools::BoundedOutput::new(output_limit);
    serde_json::to_writer(&mut output, &result)?;
    output.into_string()
}

pub async fn run(request: WorkspaceRequest, cancel: Arc<AtomicBool>) -> Result<Value> {
    request.validate()?;
    file_tools::validate_serialized(&request, MAX_REQUEST_BYTES)?;
    check_cancel(&cancel)?;
    let limits = Arc::new(request.limits);
    let root = request.root;
    let sandbox = tokio::task::spawn_blocking(move || file_tools::Sandbox::new(&root)).await??;
    let sandbox = Arc::new(sandbox);
    match request.operation {
        WorkspaceOperation::File { task } => file_tools::run(sandbox, limits, task, cancel).await,
        WorkspaceOperation::Workflow {
            stages,
            concurrency,
        } => workflow::run(sandbox, limits, stages, concurrency, cancel).await,
    }
}
