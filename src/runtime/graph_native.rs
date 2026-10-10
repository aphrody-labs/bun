use std::collections::BTreeMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, LazyLock};

use bun_jsc::{CallFrame, JSGlobalObject, JSValue, JsResult};
use bun_threading::Guarded;

const MAX_JOBS: usize = 4;
struct Job {
    cancelled: AtomicBool,
    active: AtomicBool,
    released: AtomicBool,
}

static JOBS: LazyLock<Guarded<BTreeMap<Vec<u8>, Arc<Job>>>> =
    LazyLock::new(|| Guarded::new(BTreeMap::new()));

struct ExecuteJob {
    id: Vec<u8>,
    job: Arc<Job>,
}

impl Drop for ExecuteJob {
    fn drop(&mut self) {
        let mut jobs = JOBS.lock();
        self.job.active.store(false, Ordering::Release);
        if self.job.released.load(Ordering::Acquire)
            && jobs
                .get(self.id.as_slice())
                .is_some_and(|job| Arc::ptr_eq(job, &self.job))
        {
            jobs.remove(self.id.as_slice());
        }
    }
}

pub(crate) fn js_graph_native(global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
    let action = frame.argument(0).to_utf8(global)?;
    let id = frame.argument(1).to_utf8(global)?;
    if id.is_empty() || id.len() > 64 {
        return Err(global.throw_invalid_arguments(format_args!("Invalid native graph job id")));
    }
    let cancelled = {
        let mut jobs = JOBS.lock();
        match action.as_ref() {
            b"start" => {
                if jobs.len() >= MAX_JOBS || jobs.contains_key(id.as_ref()) {
                    return Err(global.throw_invalid_arguments(format_args!(
                        "Native graph capacity exceeded or job already registered"
                    )));
                }
                jobs.insert(
                    id.to_vec(),
                    Arc::new(Job {
                        cancelled: AtomicBool::new(false),
                        active: AtomicBool::new(false),
                        released: AtomicBool::new(false),
                    }),
                );
                return Ok(JSValue::TRUE);
            }
            b"cancel" | b"release" => {
                if let Some(job) = jobs.get(id.as_ref()).cloned() {
                    job.cancelled.store(true, Ordering::Release);
                    if action.as_ref() == b"release" {
                        job.released.store(true, Ordering::Release);
                        // An in-flight native pass keeps its capacity until ExecuteJob drops.
                        if !job.active.load(Ordering::Acquire) {
                            jobs.remove(id.as_ref());
                        }
                    }
                    return Ok(JSValue::TRUE);
                }
                return Ok(JSValue::FALSE);
            }
            b"execute" => {
                let job = jobs.get(id.as_ref()).cloned().ok_or_else(|| {
                    global.throw_invalid_arguments(format_args!("Unknown native graph job"))
                })?;
                if job.active.swap(true, Ordering::AcqRel) {
                    return Err(global.throw_invalid_arguments(format_args!(
                        "Native graph job is already executing"
                    )));
                }
                job
            }
            _ => {
                return Err(
                    global.throw_invalid_arguments(format_args!("Unknown native graph action"))
                );
            }
        }
    };
    let guard = ExecuteJob {
        id: id.to_vec(),
        job: cancelled,
    };
    let input = frame.argument(2).to_utf8(global)?;
    let output = bun_graph::execute_json(&input, &guard.job.cancelled)
        .map_err(|error| global.throw_invalid_arguments(format_args!("Native graph: {error}")))?;
    bun_jsc::bun_string_jsc::create_utf8_for_js(global, &output)
}
