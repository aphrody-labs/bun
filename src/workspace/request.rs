// SPDX-License-Identifier: Apache-2.0

use std::{collections::BTreeMap, path::PathBuf};

use serde::{Deserialize, Serialize};

use crate::{Result, Stage, WorkspaceError};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct Limits {
    pub max_files: usize,
    pub max_entries: usize,
    pub max_file_bytes: usize,
    pub max_source_bytes: usize,
    pub max_output_bytes: usize,
    pub max_depth: usize,
    pub max_matches: usize,
    pub max_stages: usize,
    pub max_concurrency: usize,
}

impl Default for Limits {
    fn default() -> Self {
        Self {
            max_files: 4096,
            max_entries: 16384,
            max_file_bytes: 1024 * 1024,
            max_source_bytes: 32 * 1024 * 1024,
            max_output_bytes: 64 * 1024 * 1024,
            max_depth: 64,
            max_matches: 16384,
            max_stages: 128,
            max_concurrency: 4,
        }
    }
}

impl Limits {
    pub(crate) fn validate(&self) -> Result<()> {
        for (value, ceiling, name) in [
            (self.max_files, 65536, "files"),
            (self.max_entries, 262144, "directory entries"),
            (self.max_file_bytes, 64 * 1024 * 1024, "file bytes"),
            (self.max_source_bytes, 512 * 1024 * 1024, "source bytes"),
            (self.max_output_bytes, 128 * 1024 * 1024, "output bytes"),
            (self.max_depth, 256, "depth"),
            (self.max_matches, 262144, "matches"),
            (self.max_stages, 1024, "stages"),
            (self.max_concurrency, 32, "concurrency"),
        ] {
            if value == 0 || value > ceiling {
                return Err(WorkspaceError::Invalid(format!(
                    "{name} must be in 1..={ceiling}"
                )));
            }
        }
        if self.max_files > self.max_entries || self.max_file_bytes > self.max_source_bytes {
            return Err(WorkspaceError::Invalid(
                "inconsistent file/entry/byte limits".into(),
            ));
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct Selection {
    pub globs: Vec<String>,
    pub include_hidden: bool,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum InspectMode {
    Parse,
    Binary,
    Magika,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Matcher {
    Text,
    Regex,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EditKind {
    Search,
    Replace,
    AddBefore,
    AddAfter,
    Remove,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct EditRule {
    pub matcher: Matcher,
    pub kind: EditKind,
    pub find: String,
    #[serde(default)]
    pub replacement: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "op", rename_all = "snake_case", deny_unknown_fields)]
pub enum FileTask {
    Scan {
        #[serde(default)]
        selection: Selection,
        #[serde(default)]
        hash: bool,
        #[serde(default)]
        parse: bool,
    },
    Inspect {
        path: PathBuf,
        mode: InspectMode,
    },
    Edit {
        #[serde(default)]
        selection: Selection,
        rule: Box<EditRule>,
        #[serde(default)]
        apply: bool,
        #[serde(default)]
        expected: BTreeMap<String, String>,
    },
    Can {
        path: PathBuf,
        #[serde(default)]
        write: bool,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "op", rename_all = "snake_case", deny_unknown_fields)]
pub enum WorkspaceOperation {
    File {
        task: FileTask,
    },
    Workflow {
        stages: Vec<Stage>,
        concurrency: usize,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WorkspaceRequest {
    pub root: PathBuf,
    #[serde(default)]
    pub limits: Limits,
    pub operation: WorkspaceOperation,
}

impl WorkspaceRequest {
    pub(crate) fn validate(&self) -> Result<()> {
        if !self.root.is_absolute() {
            return Err(WorkspaceError::Invalid("root must be absolute".into()));
        }
        self.limits.validate()?;
        match &self.operation {
            WorkspaceOperation::File { task } => validate_task(task),
            WorkspaceOperation::Workflow {
                stages,
                concurrency,
            } => crate::workflow::validate(stages, *concurrency, &self.limits),
        }
    }
}

pub(crate) fn validate_task(task: &FileTask) -> Result<()> {
    let selection = match task {
        FileTask::Scan { selection, .. } => Some(selection),
        FileTask::Edit {
            selection,
            rule,
            apply,
            expected,
        } => {
            if rule.find.is_empty() {
                return Err(WorkspaceError::Invalid("find must not be empty".into()));
            }
            if rule.find.len() > 65536 || rule.replacement.len() > 1024 * 1024 {
                return Err(WorkspaceError::Limit("edit rule bytes"));
            }
            if *apply && rule.kind != EditKind::Search && expected.is_empty() {
                return Err(WorkspaceError::Invalid(
                    "apply requires expected hashes from a preview".into(),
                ));
            }
            if expected.len() > 65536
                || expected
                    .values()
                    .any(|hash| hash.len() != 64 || !hash.bytes().all(|b| b.is_ascii_hexdigit()))
            {
                return Err(WorkspaceError::Invalid(
                    "expected hashes must be 64 hexadecimal characters".into(),
                ));
            }
            Some(selection)
        }
        FileTask::Inspect { .. } | FileTask::Can { .. } => None,
    };
    if let Some(selection) = selection {
        if selection.globs.len() > 128 || selection.globs.iter().any(|glob| glob.len() > 4096) {
            return Err(WorkspaceError::Limit("glob patterns"));
        }
    }
    Ok(())
}
