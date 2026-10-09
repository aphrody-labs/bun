// SPDX-License-Identifier: Apache-2.0

#[derive(Debug, thiserror::Error)]
pub enum WorkspaceError {
    #[error("workspace operation cancelled")]
    Cancelled,
    #[error("workspace limit exceeded: {0}")]
    Limit(&'static str),
    #[error("invalid workspace request: {0}")]
    Invalid(String),
    #[error("workspace path is outside the sandbox or traverses a link: {0}")]
    Sandbox(String),
    #[error("file changed since the expected revision: {0}")]
    Conflict(String),
    #[error("file replacement committed but directory sync failed: {0}")]
    Durability(String),
    #[error("native file operation failed: {0}")]
    Native(String),
    #[error("workspace capability is unavailable: {0}")]
    Unavailable(&'static str),
    #[error("workflow stage {stage} failed after completed stages {completed:?}: {source}")]
    Workflow {
        stage: String,
        completed: Vec<String>,
        source: Box<WorkspaceError>,
    },
    #[error("edit interrupted after applied files {applied:?}: {source}")]
    EditInterrupted {
        applied: Vec<String>,
        source: Box<WorkspaceError>,
    },
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
    #[error(transparent)]
    Regex(#[from] regex::Error),
    #[error(transparent)]
    Walk(#[from] ignore::Error),
    #[error(transparent)]
    Worker(#[from] tokio::task::JoinError),
}

impl From<bun_sys::Error> for WorkspaceError {
    fn from(error: bun_sys::Error) -> Self {
        Self::Native(error.to_string())
    }
}

pub type Result<T> = std::result::Result<T, WorkspaceError>;
