use std::sync::{Arc, Mutex, TryLockError, atomic::Ordering};

use bun_jsc::{
    self as jsc, CallFrame, ErrorCode, JSGlobalObject, JSValue, JsClass as _, JsResult,
    StringJsc as _,
};
use serde::de::DeserializeOwned;
use serde_json::Value;

use super::{
    Cancel, Controller, Error, OperationOptions, Options, ProviderOptions, Result, Running,
    executor, fail, native, probe, timeout,
};

#[bun_jsc::JsClass(no_constructor, no_construct)]
pub(crate) struct NginxHandle {
    controller: Arc<Mutex<Controller>>,
}

#[derive(jsc::JsAffine)]
struct Js {
    promise: jsc::JSPromiseStrong,
    _abort: Box<AbortState>,
    _receiver: Option<jsc::Strong>,
}
struct AbortState {
    handle: jsc::AbortHandle,
    cancel: Arc<Cancel>,
}
// The AbortHandle remains on the JS thread; workers receive only Cancel's atomics/Notify.
unsafe impl jsc::job::JsAffine for AbortState {}
jsc::impl_abort_handle_owner!(AbortState, handle, |this, _cause| {
    // SAFETY: the registered callback retains its boxed JS-thread owner.
    let cancel = unsafe { &(*this).cancel };
    cancel.flag.store(true, Ordering::Release);
    cancel.event.notify_one();
});

enum Request {
    Probe(ProviderOptions),
    Create(Options),
    Execute {
        action: String,
        controller: Arc<Mutex<Controller>>,
        options: OperationOptions,
    },
}
enum Response {
    Created(Arc<Mutex<Controller>>),
    Value(Value, Option<Arc<Running>>),
}
struct Task {
    request: Option<Request>,
    cancel: Arc<Cancel>,
    result: Option<Result<Response>>,
}

async fn bounded<T>(
    duration: u64,
    cancel: Arc<Cancel>,
    operation: impl std::future::Future<Output = Result<T>>,
) -> Result<T> {
    if cancel.flag.load(Ordering::Acquire) {
        return Err(fail("ABORT_ERR", "NGINX operation aborted"));
    }
    tokio::select! {
        biased;
        _ = cancel.event.notified() => Err(fail("ABORT_ERR", "NGINX operation aborted")),
        result = tokio::time::timeout(timeout(duration)?, operation) => result.unwrap_or_else(|_| Err(fail("ERR_NGINX_TIMEOUT", "NGINX operation deadline exceeded"))),
    }
}

impl jsc::JobContext for Task {
    type OffThread = Self;
    type Js = Js;
    const CANCELLABLE: bool = true;
    unsafe fn cancel(this: *mut Self) {
        // SAFETY: the immutable Arc lives for the job; only atomics and Notify cross threads.
        let cancel = unsafe { &(*this).cancel };
        cancel.flag.store(true, Ordering::Release);
        cancel.event.notify_one();
    }
    fn run(this: &mut Self, done: jsc::Completion<Self>) -> Option<jsc::Completion<Self>> {
        this.result = Some((|| {
            if this.cancel.flag.load(Ordering::Acquire) {
                return Err(fail("ABORT_ERR", "NGINX operation aborted"));
            }
            match this.request.take().expect("owned NGINX request") {
                Request::Probe(options) => {
                    let runtime = executor()?;
                    runtime
                        .block_on(bounded(
                            options.timeout_ms,
                            this.cancel.clone(),
                            probe(&options),
                        ))
                        .map(|value| Response::Value(value, None))
                }
                Request::Create(options) => {
                    let runtime = executor()?;
                    let provider = ProviderOptions {
                        binary: options.binary.clone(),
                        binary_arguments: options.binary_arguments.clone(),
                        timeout_ms: options.timeout_ms,
                        max_output_bytes: options.max_output_bytes,
                    };
                    let info = runtime.block_on(bounded(
                        provider.timeout_ms,
                        this.cancel.clone(),
                        probe(&provider),
                    ))?;
                    if info.get("available") != Some(&Value::Bool(true)) {
                        return Err(fail(
                            "ERR_NGINX_PROVIDER_UNAVAILABLE",
                            "NGINX executable is unavailable; select an installed native binary",
                        ));
                    }
                    if this.cancel.flag.load(Ordering::Acquire) {
                        return Err(fail("ABORT_ERR", "NGINX operation aborted"));
                    }
                    Controller::new(options, runtime)
                        .map(|controller| Response::Created(Arc::new(Mutex::new(controller))))
                }
                Request::Execute {
                    action,
                    controller,
                    options,
                } => {
                    let mut guard = match controller.try_lock() {
                        Ok(guard) => guard,
                        Err(TryLockError::WouldBlock) => {
                            return Err(fail(
                                "ERR_NGINX_BUSY",
                                "Another operation is active on this NGINX controller",
                            ));
                        }
                        Err(TryLockError::Poisoned(_)) => {
                            return Err(native("NGINX controller ownership lock failed"));
                        }
                    };
                    let runtime = guard.runtime;
                    let value =
                        runtime.block_on(guard.execute(&action, options, this.cancel.clone()))?;
                    let monitor = if action == "start" {
                        guard.take_monitor()
                    } else {
                        None
                    };
                    Ok(Response::Value(value, monitor))
                }
            }
        })());
        Some(done)
    }
    fn then(this: Self, mut js: Js, cx: &jsc::JsThread<'_>) -> JsResult<()> {
        let global = cx.global();
        match this.result.expect("completed NGINX job") {
            Ok(Response::Created(controller)) => js.promise.resolve(
                global,
                NginxHandle::to_js_boxed(Box::new(NginxHandle { controller }), global),
            ),
            Ok(Response::Value(value, monitor)) => {
                if let Some(running) = monitor {
                    jsc::Job::<Monitor>::schedule(
                        cx,
                        Monitor {
                            running,
                            cancel: Arc::new(Cancel::default()),
                        },
                        MonitorJs {},
                    );
                }
                match serde_json::to_vec(&value) {
                    Ok(bytes) => {
                        match bun_core::String::from_bytes(&bytes).to_js_by_parse_json(global) {
                            Ok(value) => js.promise.resolve(global, value),
                            Err(error) => js.promise.reject(global, Err(error)),
                        }
                    }
                    Err(error) => reject(&mut js, global, native(error)),
                }
            }
            Err(error) => reject(&mut js, global, error),
        }
    }
}

#[derive(jsc::JsAffine)]
struct MonitorJs {}
struct Monitor {
    running: Arc<Running>,
    cancel: Arc<Cancel>,
}
impl jsc::JobContext for Monitor {
    type OffThread = Self;
    type Js = MonitorJs;
    const CANCELLABLE: bool = true;
    unsafe fn cancel(this: *mut Self) {
        // SAFETY: cancellation only touches immutable job fields and thread-safe wakeups.
        let cancel = unsafe { &(*this).cancel };
        cancel.flag.store(true, Ordering::Release);
        cancel.event.notify_one();
    }
    fn run(this: &mut Self, done: jsc::Completion<Self>) -> Option<jsc::Completion<Self>> {
        let running = this.running.clone();
        let cancel = this.cancel.clone();
        // The executor receives only OS state and Completion's Ticket, never a JS handle.
        match executor() {
            Ok(runtime) => {
                runtime.spawn(async move {
                    running.monitor(cancel).await;
                    done.finish();
                });
                None
            }
            Err(_) => {
                let _ = running.terminate();
                Some(done)
            }
        }
    }
    fn then(_this: Self, _js: MonitorJs, _cx: &jsc::JsThread<'_>) -> JsResult<()> {
        // Job::take releases the JS-affine keep-alive after the master has been reaped.
        Ok(())
    }
}
impl Drop for Monitor {
    fn drop(&mut self) {
        // An unrun cancelled job still owns its master; kill before returning to the VM.
        let _ = self.running.terminate();
        self.running.reap_unmonitored();
    }
}

fn reject(js: &mut Js, global: &JSGlobalObject, error: Error) -> JsResult<()> {
    let code = match error.code {
        "ERR_NGINX_PROVIDER_UNAVAILABLE" => ErrorCode::ERR_NGINX_PROVIDER_UNAVAILABLE,
        "ERR_NGINX_TIMEOUT" => ErrorCode::ERR_NGINX_TIMEOUT,
        "ERR_NGINX_CONFIG" => ErrorCode::ERR_NGINX_CONFIG,
        "ERR_NGINX_OWNER" => ErrorCode::ERR_NGINX_OWNER,
        "ERR_NGINX_BUSY" => ErrorCode::ERR_NGINX_BUSY,
        "ERR_NGINX_NATIVE" => ErrorCode::ERR_NGINX_NATIVE,
        "ERR_NGINX_OUTPUT_LIMIT" => ErrorCode::ERR_NGINX_OUTPUT_LIMIT,
        "ERR_INVALID_ARG_VALUE" => ErrorCode::ERR_INVALID_ARG_VALUE,
        "ERR_INVALID_STATE" => ErrorCode::ERR_INVALID_STATE,
        "ABORT_ERR" => ErrorCode::ABORT_ERR,
        _ => ErrorCode::ERR_INVALID_STATE,
    };
    let value = code.fmt(global, format_args!("{}", error.message));
    let _hold = jsc::Strong::create(value, global);
    js.promise.reject(global, Ok(value))
}

fn parse<T: DeserializeOwned>(global: &JSGlobalObject, value: &Value) -> JsResult<T> {
    serde_json::from_value(value.clone()).map_err(|error| {
        ErrorCode::ERR_INVALID_ARG_VALUE
            .throw(global, format_args!("Invalid NGINX options: {error}"))
    })
}

pub(crate) fn js_nginx(global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
    let action = frame.argument(0).to_utf8(global)?;
    let action = std::str::from_utf8(&action)
        .map_err(|_| global.throw_invalid_arguments(format_args!("NGINX action must be UTF-8")))?;
    let controller = if action != "probe" && action != "create" {
        let handle = NginxHandle::from_js(frame.argument(1)).ok_or_else(|| {
            ErrorCode::ERR_INVALID_ARG_VALUE
                .throw(global, format_args!("Expected an owned NGINX handle"))
        })?;
        // SAFETY: from_js verified the private class and the call frame roots its wrapper.
        Some(unsafe { (*handle).controller.clone() })
    } else {
        None
    };
    let options = frame.argument(2);
    if !options.is_undefined_or_null() && !options.is_object() {
        return Err(ErrorCode::ERR_INVALID_ARG_VALUE
            .throw(global, format_args!("NGINX options must be an object")));
    }
    let signal = if options.is_object() {
        match options.get(global, "signal")? {
            Some(signal) if !signal.is_undefined_or_null() => {
                Some(jsc::AbortSignal::ref_from_js(signal).ok_or_else(|| {
                    ErrorCode::ERR_INVALID_ARG_VALUE
                        .throw(global, format_args!("signal must be an AbortSignal"))
                })?)
            }
            _ => None,
        }
    } else {
        None
    };
    let mut value = if options.is_object() {
        let json = options.json_stringify(global, 0)?;
        let json = json.to_utf8();
        if json.slice().len() > 64 << 10 {
            return Err(ErrorCode::ERR_INVALID_ARG_VALUE
                .throw(global, format_args!("NGINX options exceed 64 KiB")));
        }
        serde_json::from_slice::<Value>(json.slice()).map_err(|error| {
            ErrorCode::ERR_INVALID_ARG_VALUE
                .throw(global, format_args!("Invalid NGINX options: {error}"))
        })?
    } else {
        serde_json::json!({})
    };
    if let Some(object) = value.as_object_mut() {
        object.remove("signal");
    }
    let receiver = controller
        .as_ref()
        .map(|_| jsc::Strong::create(frame.argument(1), global));
    let request = match action {
        "probe" => Request::Probe(parse(global, &value)?),
        "create" => Request::Create(parse(global, &value)?),
        "info" | "validate" | "start" | "reload" | "quit" | "status" | "close" => {
            Request::Execute {
                action: action.to_owned(),
                controller: controller.expect("verified NGINX handle"),
                options: parse(global, &value)?,
            }
        }
        _ => {
            return Err(ErrorCode::ERR_INVALID_ARG_VALUE
                .throw(global, format_args!("Unknown NGINX action '{action}'")));
        }
    };
    let cancel = Arc::new(Cancel::default());
    let promise = jsc::JSPromiseStrong::init(global);
    let result = promise.value();
    let cx = global.js_thread_of_caller();
    let mut abort = Box::new(AbortState {
        handle: jsc::AbortHandle::for_owner::<AbortState>(),
        cancel: cancel.clone(),
    });
    // SAFETY: the scheduled JS-affine state owns this box until promise settlement.
    unsafe {
        jsc::AbortHandle::arm_owner(&raw mut *abort, cx.context());
        if let Some(signal) = signal {
            jsc::AbortHandle::follow_owner(&raw mut *abort, signal);
        }
    }
    jsc::Job::<Task>::schedule(
        &cx,
        Task {
            request: Some(request),
            cancel,
            result: None,
        },
        Js {
            promise,
            _abort: abort,
            _receiver: receiver,
        },
    );
    Ok(result)
}
