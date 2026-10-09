// SPDX-License-Identifier: Apache-2.0
//! Native agent tools served by `bun mcp`: directory digests and the installed
//! sources and documentation of a project's dependencies.
//!
//! `tools.json` is the single source of the tool schemas:
//! `src/codegen/generate-agent-tools.ts` turns it into `generated/tools.rs`, the
//! docs page and the `bun-deps` skill. The registry below binds each name to its
//! implementation; `tools()` panics on a schema without one.

use std::{
    path::{Path, PathBuf},
    sync::{
        OnceLock,
        atomic::{AtomicBool, Ordering},
    },
};

use serde_json::Value;

mod deps;
#[path = "generated/tools.rs"]
mod generated;
mod ingest;
mod walk;

#[cfg(test)]
mod tests;

pub use generated::*;

#[derive(Debug, thiserror::Error)]
pub enum ToolError {
    #[error("invalid arguments: {0}")]
    Invalid(String),
    #[error("{0}")]
    NotFound(String),
    #[error("unknown tool: {0}")]
    Unknown(String),
    #[error("cancelled")]
    Cancelled,
    #[error("native file operation failed: {0}")]
    Native(String),
    #[error(transparent)]
    Walk(#[from] ignore::Error),
    #[error(transparent)]
    Regex(#[from] regex::Error),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
}

impl From<bun_sys::Error> for ToolError {
    fn from(error: bun_sys::Error) -> Self {
        Self::Native(error.to_string())
    }
}

pub type Result<T> = core::result::Result<T, ToolError>;

/// Per-call state. `cwd` resolves relative paths; `cancel` is polled between files.
pub struct Context<'a> {
    pub cwd: &'a Path,
    pub cancel: &'a AtomicBool,
}

impl Context<'_> {
    pub(crate) fn check(&self) -> Result<()> {
        if self.cancel.load(Ordering::Acquire) {
            Err(ToolError::Cancelled)
        } else {
            Ok(())
        }
    }

    pub(crate) fn resolve(&self, path: Option<&str>) -> PathBuf {
        match path {
            Some(path) if !path.is_empty() => self.cwd.join(path),
            _ => self.cwd.to_path_buf(),
        }
    }
}

type CallFn = fn(&Context<'_>, &Value) -> Result<String>;

/// A `tools/list` entry, generated from `tools.json`. `input_schema` is a JSON object schema.
#[derive(Clone, Copy, Debug)]
pub struct ToolSchema {
    pub name: &'static str,
    pub title: &'static str,
    pub description: &'static str,
    pub input_schema: &'static str,
}

pub struct Tool {
    pub schema: &'static ToolSchema,
    pub call: CallFn,
}

fn implementation(name: &str) -> Option<CallFn> {
    Some(match name {
        "git_ingest" => ingest::call,
        "deps_list" => deps::list,
        "deps_info" => deps::info,
        "deps_tree" => deps::tree,
        "deps_read" => deps::read,
        "deps_search" => deps::search,
        "deps_docs" => deps::docs,
        _ => return None,
    })
}

/// Every tool declared in `tools.json`, in declaration order.
pub fn tools() -> &'static [Tool] {
    static TOOLS: OnceLock<Vec<Tool>> = OnceLock::new();
    TOOLS.get_or_init(|| {
        SCHEMAS
            .iter()
            .map(|schema| Tool {
                schema,
                call: implementation(schema.name).unwrap_or_else(|| {
                    panic!(
                        "tools.json declares {} without an implementation",
                        schema.name
                    )
                }),
            })
            .collect()
    })
}

pub fn find(name: &str) -> Option<&'static Tool> {
    tools().iter().find(|tool| tool.schema.name == name)
}

/// Run one tool. `args` must be a JSON object (or null for no arguments).
pub fn call(ctx: &Context<'_>, name: &str, args: &Value) -> Result<String> {
    let tool = find(name).ok_or_else(|| ToolError::Unknown(name.to_owned()))?;
    if !(args.is_object() || args.is_null()) {
        return Err(ToolError::Invalid("arguments must be an object".into()));
    }
    (tool.call)(ctx, args)
}

pub(crate) mod args {
    use serde_json::Value;

    use crate::{Result, ToolError};

    pub(crate) fn str<'a>(args: &'a Value, key: &str) -> Option<&'a str> {
        args.get(key).and_then(Value::as_str)
    }

    pub(crate) fn required<'a>(args: &'a Value, key: &str) -> Result<&'a str> {
        match str(args, key) {
            Some(value) if !value.is_empty() => Ok(value),
            _ => Err(ToolError::Invalid(format!("`{key}` is required"))),
        }
    }

    pub(crate) fn usize(args: &Value, key: &str, default: usize) -> Result<usize> {
        match args.get(key) {
            None | Some(Value::Null) => Ok(default),
            Some(value) => value
                .as_u64()
                .and_then(|n| usize::try_from(n).ok())
                .ok_or_else(|| {
                    ToolError::Invalid(format!("`{key}` must be a non-negative integer"))
                }),
        }
    }

    pub(crate) fn bool(args: &Value, key: &str) -> bool {
        args.get(key).and_then(Value::as_bool).unwrap_or(false)
    }

    pub(crate) fn strings(args: &Value, key: &str) -> Result<Vec<String>> {
        match args.get(key) {
            None | Some(Value::Null) => Ok(Vec::new()),
            Some(Value::Array(items)) => items
                .iter()
                .map(|item| {
                    item.as_str().map(str::to_owned).ok_or_else(|| {
                        ToolError::Invalid(format!("`{key}` must be an array of strings"))
                    })
                })
                .collect(),
            Some(_) => Err(ToolError::Invalid(format!(
                "`{key}` must be an array of strings"
            ))),
        }
    }
}
