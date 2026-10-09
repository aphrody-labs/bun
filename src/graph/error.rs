// SPDX-License-Identifier: Apache-2.0

use thiserror::Error;

pub type Result<T, E = GraphError> = std::result::Result<T, E>;

#[derive(Debug, Error)]
pub enum GraphError {
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("no node matches `{0}`")]
    NoMatch(String),
    #[error("`{text}` matches {total} nodes; pass an id or `file::symbol`:\n  {}", candidates.join("\n  "))]
    Ambiguous {
        text: String,
        total: usize,
        candidates: Vec<String>,
    },
    #[error("invalid graph input: {0}")]
    Invalid(String),
    #[error("graph limit exceeded: {0}")]
    Limit(&'static str),
    #[error("graph operation cancelled")]
    Cancelled,
}

pub(crate) fn check_cancel(cancelled: &std::sync::atomic::AtomicBool) -> Result<()> {
    if cancelled.load(std::sync::atomic::Ordering::Relaxed) {
        Err(GraphError::Cancelled)
    } else {
        Ok(())
    }
}
