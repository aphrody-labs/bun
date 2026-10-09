// SPDX-License-Identifier: Apache-2.0
//! Native side of `bun:vfs`: JSON routes of [`bun_vfs::Session`], synchronous or on the work pool.

use std::collections::BTreeMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, LazyLock, Mutex};

use bun_jsc::bun_string_jsc::create_utf8_for_js;
use bun_jsc::{CallFrame, JSGlobalObject, JSPromiseStrong, JSValue, JsResult};

static IDENTIFIERS: bun_vfs::OxcIdentifiers = bun_vfs::OxcIdentifiers;
static SESSION: bun_vfs::Session = bun_vfs::Session::new(Some(&IDENTIFIERS));
static CANCELS: LazyLock<Mutex<BTreeMap<u32, Arc<AtomicBool>>>> =
    LazyLock::new(|| Mutex::new(BTreeMap::new()));

/// Error results are `"!<code>\t<message>"`; `bun:vfs` turns them into errors with `code`.
fn run(op: &str, input: &str, cancel: &AtomicBool) -> String {
    match SESSION.call(op, input, cancel) {
        Ok(json) => json,
        Err(error) => format!("!{}\t{error}", error.code()),
    }
}

struct VfsJob {
    op: String,
    input: String,
    token: u32,
    cancel: Arc<AtomicBool>,
    output: String,
}

impl bun_jsc::JobContext for VfsJob {
    type OffThread = VfsJob;
    type Js = JSPromiseStrong;
    fn run(job: &mut VfsJob, done: bun_jsc::Completion<Self>) -> Option<bun_jsc::Completion<Self>> {
        job.output = run(&job.op, &job.input, &job.cancel);
        Some(done)
    }
    fn then(job: VfsJob, mut promise: JSPromiseStrong, cx: &bun_jsc::JsThread<'_>) -> JsResult<()> {
        if let Ok(mut cancels) = CANCELS.lock() {
            cancels.remove(&job.token);
        }
        let global = cx.global();
        let value = create_utf8_for_js(global, job.output.as_bytes())?;
        promise.resolve(global, value)
    }
}

/// `jsVfsCall(op, json, token)`: `token` 0 runs on the JS thread and returns the result string;
/// any other token runs on the work pool and returns a promise of it, cancellable by `jsVfsCancel`.
pub(crate) fn js_vfs_call(global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
    let op = frame.argument(0).to_utf8(global)?;
    let input = frame.argument(1).to_utf8(global)?;
    let token = frame.argument(2).to_u32();
    let op = String::from_utf8_lossy(&op).into_owned();
    let input = String::from_utf8_lossy(&input).into_owned();
    if token == 0 {
        let output = run(&op, &input, &AtomicBool::new(false));
        return create_utf8_for_js(global, output.as_bytes());
    }
    let cancel = Arc::new(AtomicBool::new(false));
    if let Ok(mut cancels) = CANCELS.lock() {
        cancels.insert(token, cancel.clone());
    }
    let cx = global.js_thread_of_caller(frame);
    let promise = JSPromiseStrong::init(global);
    let value = promise.value();
    let job = VfsJob {
        op,
        input,
        token,
        cancel,
        output: String::new(),
    };
    bun_jsc::Job::<VfsJob>::schedule(&cx, job, promise);
    Ok(value)
}

/// `jsVfsCancel(token)`: asks the running operation to stop; it settles with `ABORT_ERR`.
pub(crate) fn js_vfs_cancel(_global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
    let token = frame.argument(0).to_u32();
    let found = CANCELS
        .lock()
        .ok()
        .and_then(|cancels| cancels.get(&token).cloned());
    if let Some(cancel) = &found {
        cancel.store(true, Ordering::Relaxed);
    }
    Ok(if found.is_some() { JSValue::TRUE } else { JSValue::FALSE })
}
