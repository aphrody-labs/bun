// SPDX-License-Identifier: Apache-2.0

use std::{
    io,
    sync::{
        Arc,
        atomic::{AtomicBool, AtomicUsize, Ordering},
    },
};

use serde::Serialize;
use serde_json::Value;

use crate::{FileTask, Limits, Result, WorkspaceError, check_cancel};

mod edit;
mod polyglot;
mod sandbox;
mod scan;
#[cfg(windows)]
mod windows_metadata;

pub(crate) use sandbox::Sandbox;

#[derive(Default)]
pub(crate) struct Budget {
    pub(crate) entries: AtomicUsize,
    pub(crate) files: AtomicUsize,
    pub(crate) source_bytes: AtomicUsize,
    pub(crate) matches: AtomicUsize,
}

pub(crate) fn charge(
    counter: &AtomicUsize,
    count: usize,
    ceiling: usize,
    name: &'static str,
) -> Result<()> {
    counter
        .try_update(Ordering::Relaxed, Ordering::Relaxed, |used| {
            used.checked_add(count).filter(|next| *next <= ceiling)
        })
        .map(|_| ())
        .map_err(|_| WorkspaceError::Limit(name))
}

pub(crate) async fn run(
    sandbox: Arc<Sandbox>,
    limits: Arc<Limits>,
    task: FileTask,
    cancel: Arc<AtomicBool>,
) -> Result<Value> {
    run_with_budget(sandbox, limits, task, cancel, Arc::new(Budget::default())).await
}

pub(crate) async fn run_with_budget(
    sandbox: Arc<Sandbox>,
    limits: Arc<Limits>,
    task: FileTask,
    cancel: Arc<AtomicBool>,
    budget: Arc<Budget>,
) -> Result<Value> {
    check_cancel(&cancel)?;
    // Async lock acquisition never occupies a blocking worker while waiting for an editor.
    let writer = if matches!(&task, FileTask::Edit { apply: true, .. }) {
        Some(sandbox::WRITERS.lock().await)
    } else {
        None
    };
    let output_limit = limits.max_output_bytes;
    let result = tokio::task::spawn_blocking(move || {
        let _writer = writer;
        match task {
            FileTask::Scan {
                selection,
                hash,
                parse,
            } => scan::scan(&sandbox, &selection, hash, parse, &limits, &budget, &cancel),
            FileTask::Inspect { path, mode } => {
                scan::inspect(&sandbox, &path, mode, &limits, &budget, &cancel)
            }
            FileTask::Edit {
                selection,
                rule,
                apply,
                expected,
            } => edit::edit(
                &sandbox, &selection, &rule, apply, &expected, &limits, &budget, &cancel,
            ),
            FileTask::Can { path, write } => sandbox.can(&path, write, &cancel),
        }
    })
    .await??;
    validate_output(&result, output_limit)?;
    Ok(result)
}

pub(crate) fn validate_output(value: &Value, limit: usize) -> Result<()> {
    validate_serialized(value, limit)
}

pub(crate) fn validate_serialized<T: Serialize>(value: &T, limit: usize) -> Result<()> {
    serde_json::to_writer(Counter { count: 0, limit }, value)?;
    Ok(())
}

struct Counter {
    count: usize,
    limit: usize,
}

impl io::Write for Counter {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        self.count = self
            .count
            .checked_add(bytes.len())
            .filter(|count| *count <= self.limit)
            .ok_or_else(|| io::Error::other("workspace output byte limit exceeded"))?;
        Ok(bytes.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

pub(crate) struct BoundedOutput {
    bytes: Vec<u8>,
    limit: usize,
}

impl BoundedOutput {
    pub(crate) fn new(limit: usize) -> Self {
        Self {
            bytes: Vec::new(),
            limit,
        }
    }

    pub(crate) fn into_string(self) -> Result<String> {
        String::from_utf8(self.bytes).map_err(|error| WorkspaceError::Invalid(error.to_string()))
    }
}

impl io::Write for BoundedOutput {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        if self
            .bytes
            .len()
            .checked_add(bytes.len())
            .is_none_or(|size| size > self.limit)
        {
            return Err(io::Error::other("workspace output byte limit exceeded"));
        }
        self.bytes.extend_from_slice(bytes);
        Ok(bytes.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}
