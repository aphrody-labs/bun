// SPDX-License-Identifier: Apache-2.0
// Native stage scheduling replaces Aphrody workspace pipeline shell dispatch.

use std::{
    collections::{BTreeMap, BTreeSet},
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
};

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use tokio::task::JoinSet;

use crate::{
    FileTask, Limits, Result, WorkspaceError, check_cancel,
    file_tools::{self, Budget, Sandbox},
    request::validate_task,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Stage {
    pub id: String,
    #[serde(default)]
    pub depends_on: Vec<String>,
    pub task: FileTask,
}

pub(crate) fn validate(stages: &[Stage], concurrency: usize, limits: &Limits) -> Result<()> {
    if stages.is_empty() || stages.len() > limits.max_stages {
        return Err(WorkspaceError::Invalid(
            "workflow stage count is outside limits".into(),
        ));
    }
    if concurrency == 0 || concurrency > limits.max_concurrency {
        return Err(WorkspaceError::Invalid(
            "workflow concurrency is outside limits".into(),
        ));
    }
    let mut ids = BTreeSet::new();
    for stage in stages {
        if stage.id.is_empty()
            || stage.id.len() > 128
            || !stage
                .id
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b"_-.:".contains(&b))
        {
            return Err(WorkspaceError::Invalid(
                "stage id must contain 1..=128 ASCII identifier characters".into(),
            ));
        }
        if !ids.insert(stage.id.as_str()) {
            return Err(WorkspaceError::Invalid(format!(
                "duplicate stage: {}",
                stage.id
            )));
        }
        if stage.depends_on.len() > limits.max_stages {
            return Err(WorkspaceError::Limit("stage dependencies"));
        }
        validate_task(&stage.task)?;
    }
    for stage in stages {
        let mut unique = BTreeSet::new();
        for dependency in &stage.depends_on {
            if dependency == &stage.id
                || !ids.contains(dependency.as_str())
                || !unique.insert(dependency)
            {
                return Err(WorkspaceError::Invalid(format!(
                    "invalid dependency {dependency} in {}",
                    stage.id
                )));
            }
        }
    }
    let mut resolved = BTreeSet::new();
    loop {
        let before = resolved.len();
        for stage in stages {
            if stage
                .depends_on
                .iter()
                .all(|id| resolved.contains(id.as_str()))
            {
                resolved.insert(stage.id.as_str());
            }
        }
        if resolved.len() == stages.len() {
            return Ok(());
        }
        if resolved.len() == before {
            return Err(WorkspaceError::Invalid("workflow dependency cycle".into()));
        }
    }
}

pub(crate) async fn run(
    sandbox: Arc<Sandbox>,
    limits: Arc<Limits>,
    stages: Vec<Stage>,
    concurrency: usize,
    cancel: Arc<AtomicBool>,
) -> Result<Value> {
    validate(&stages, concurrency, &limits)?;
    let budget = Arc::new(Budget::default());
    let mut remaining: BTreeMap<String, Stage> = stages
        .into_iter()
        .map(|stage| (stage.id.clone(), stage))
        .collect();
    let mut finished: BTreeMap<String, Value> = BTreeMap::new();
    let mut workers = JoinSet::new();
    let mut failure = None;
    let mut output_bytes = 0_usize;
    while !remaining.is_empty() || !workers.is_empty() {
        if failure.is_none() {
            if let Err(error) = check_cancel(&cancel) {
                failure = Some(("<cancelled>".into(), error));
            }
        }
        if failure.is_none() {
            let ready: Vec<String> = remaining
                .iter()
                .filter(|(_, stage)| stage.depends_on.iter().all(|id| finished.contains_key(id)))
                .take(concurrency.saturating_sub(workers.len()))
                .map(|(id, _)| id.clone())
                .collect();
            for id in ready {
                let Some(stage) = remaining.remove(&id) else {
                    continue;
                };
                let sandbox = Arc::clone(&sandbox);
                let limits = Arc::clone(&limits);
                let cancel = Arc::clone(&cancel);
                let budget = Arc::clone(&budget);
                workers.spawn(async move {
                    (
                        id,
                        file_tools::run_with_budget(sandbox, limits, stage.task, cancel, budget)
                            .await,
                    )
                });
            }
        }
        if workers.is_empty() {
            break;
        }
        match workers.join_next().await {
            Some(Ok((id, Ok(value)))) if failure.is_none() => {
                let size = match serde_json::to_vec(&value) {
                    Ok(bytes) => bytes.len(),
                    Err(error) => {
                        failure = Some((id, WorkspaceError::Json(error)));
                        cancel.store(true, Ordering::Release);
                        continue;
                    }
                };
                match output_bytes
                    .checked_add(size)
                    .filter(|size| *size <= limits.max_output_bytes)
                {
                    Some(size) => {
                        output_bytes = size;
                        finished.insert(id, value);
                    }
                    None => {
                        failure = Some((id, WorkspaceError::Limit("workflow output bytes")));
                        cancel.store(true, Ordering::Release);
                    }
                }
            }
            Some(Ok((id, Err(error)))) if failure.is_none() => {
                failure = Some((id, error));
                cancel.store(true, Ordering::Release);
            }
            Some(Err(error)) if failure.is_none() => {
                failure = Some(("<worker>".into(), WorkspaceError::Worker(error)));
                cancel.store(true, Ordering::Release);
            }
            _ => {}
        }
        // Drain every started operation after cancellation; aborting spawn_blocking would leave writes running.
    }
    if let Some((stage, source)) = failure {
        return Err(WorkspaceError::Workflow {
            stage,
            completed: finished.into_keys().collect(),
            source: Box::new(source),
        });
    }
    check_cancel(&cancel)?;
    let result = json!({ "stages": finished, "provenance": crate::provenance() });
    file_tools::validate_output(&result, limits.max_output_bytes)?;
    Ok(result)
}
