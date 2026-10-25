use bun_jsc::{self as jsc, CallFrame, JSGlobalObject, JSValue, JsResult};

#[bun_jsc::JsClass]
pub(crate) struct Crawl;

#[cfg(feature = "browser_crawl")]
mod native {
    use super::*;
    use bun_jsc::StringJsc as _;
    use std::collections::HashMap;
    use std::path::{Path, PathBuf};
    use std::sync::{
        Arc, Mutex, OnceLock, Weak,
        atomic::{AtomicBool, Ordering},
    };

    #[derive(Default)]
    struct Cancel {
        flag: AtomicBool,
        event: tokio::sync::Notify,
    }
    #[derive(jsc::JsAffine)]
    struct Js {
        promise: jsc::JSPromiseStrong,
        _abort: Box<AbortState>,
    }
    struct AbortState {
        handle: jsc::AbortHandle,
        cancel: Arc<Cancel>,
    }
    unsafe impl jsc::job::JsAffine for AbortState {}
    jsc::impl_abort_handle_owner!(AbortState, handle, |this, _cause| {
        let cancel = unsafe { &(*this).cancel };
        cancel.flag.store(true, Ordering::Release);
        cancel.event.notify_one();
    });
    struct Task {
        options: Option<bun_browser_crawl::cli::Options>,
        cancel: Arc<Cancel>,
        result: Option<Result<String, String>>,
    }
    type QueryLocks = HashMap<(PathBuf, String), Weak<tokio::sync::Mutex<()>>>;
    static LOCKS: OnceLock<Mutex<QueryLocks>> = OnceLock::new();

    fn canonical(path: &Path) -> Result<PathBuf, String> {
        fn resolve(path: &Path) -> Result<PathBuf, String> {
            let mut bytes = path
                .to_str()
                .ok_or("Crawl store path must be UTF-8")?
                .as_bytes()
                .to_vec();
            if bun_core::strings::contains_char(&bytes, 0) {
                return Err("Invalid Crawl store path".into());
            }
            bytes.push(0);
            let mut buffer = bun_core::PathBuffer::ZEROED;
            let result =
                bun_sys::realpath(bun_core::ZStr::from_slice_with_nul(&bytes), &mut buffer)
                    .map_err(|_| "Crawl store parent must exist")?;
            let value =
                String::from_utf8(result.to_vec()).map_err(|_| "Crawl store path must be UTF-8")?;
            Ok(PathBuf::from(value))
        }
        match resolve(path) {
            Ok(value) => Ok(value),
            Err(_) => Ok(resolve(path.parent().ok_or("Invalid Crawl store parent")?)?
                .join(path.file_name().ok_or("Invalid Crawl store filename")?)),
        }
    }
    fn query_lock(
        options: &bun_browser_crawl::cli::Options,
    ) -> Result<Option<Arc<tokio::sync::Mutex<()>>>, String> {
        let Some(scope) = bun_browser_crawl::cli::checkpoint_scope(options) else {
            return Ok(None);
        };
        let key = (canonical(&options.store)?, scope);
        let mut locks = LOCKS
            .get_or_init(Default::default)
            .lock()
            .map_err(|_| "Crawl checkpoint guard unavailable")?;
        locks.retain(|_, value| value.strong_count() > 0);
        if let Some(existing) = locks.get(&key).and_then(Weak::upgrade) {
            return Ok(Some(existing));
        }
        let lock = Arc::new(tokio::sync::Mutex::new(()));
        locks.insert(key, Arc::downgrade(&lock));
        Ok(Some(lock))
    }
    impl jsc::JobContext for Task {
        type OffThread = Self;
        type Js = Js;
        fn run(this: &mut Self, done: jsc::Completion<Self>) -> Option<jsc::Completion<Self>> {
            let options = this.options.take().expect("owned Crawl options");
            this.result = Some((|| {
                if this.cancel.flag.load(Ordering::Acquire) {
                    return Err("ERR_CRAWL_ABORTED".into());
                }
                let runtime = tokio::runtime::Builder::new_current_thread()
                    .enable_all()
                    .build()
                    .map_err(|error| error.to_string())?;
                runtime.block_on(async {
                    let operation = async {
                        let lock = query_lock(&options)?;
                        let _guard = match lock { Some(lock) => Some(lock.lock_owned().await), None => None };
                        bun_browser_crawl::cli::execute(&options).await
                            .and_then(|value| serde_json::to_string(&value).map_err(|error| error.to_string()))
                    };
                    tokio::select! {
                        biased;
                        _ = this.cancel.event.notified() => Err("ERR_CRAWL_ABORTED".into()),
                        result = tokio::time::timeout(std::time::Duration::from_millis(options.timeout_ms), operation) =>
                            result.map_err(|_| "Crawl deadline exceeded; committed checkpoints remain resumable".to_owned())?,
                    }
                })
            })());
            Some(done)
        }
        fn then(this: Self, mut js: Js, cx: &jsc::JsThread<'_>) -> JsResult<()> {
            let global = cx.global();
            match this.result.expect("completed Crawl job") {
                Ok(json) => match bun_core::String::from_bytes(json.as_bytes())
                    .to_js_by_parse_json(global)
                {
                    Ok(value) => js.promise.resolve(global, value),
                    Err(error) => js.promise.reject(global, Err(error)),
                },
                Err(message) => {
                    let error = global.create_error_instance(format_args!("{message}"));
                    let _hold = jsc::Strong::create(error, global);
                    let code = if message == "ERR_CRAWL_ABORTED" {
                        "ERR_CRAWL_ABORTED"
                    } else {
                        "ERR_CRAWL_NATIVE"
                    };
                    error.put(
                        global,
                        "code",
                        bun_core::String::from_bytes(code.as_bytes()).to_js(global)?,
                    );
                    js.promise.reject(global, Ok(error))
                }
            }
        }
    }
    pub(super) fn run(global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
        let value = frame.argument(0);
        if !value.is_object() {
            return Err(global.throw_invalid_arguments(format_args!("Crawl.run expects options")));
        }
        let signal = match value.get(global, "signal")? {
            Some(signal) if !signal.is_undefined_or_null() => {
                Some(jsc::AbortSignal::ref_from_js(signal).ok_or_else(|| {
                    global.throw_invalid_arguments(format_args!("signal must be an AbortSignal"))
                })?)
            }
            _ => None,
        };
        let json = value.json_stringify(global, 0)?;
        let json = json.to_utf8();
        let options = serde_json::from_slice(json.slice())
            .map_err(|_| global.throw_invalid_arguments(format_args!("Invalid Crawl options")))?;
        let options = bun_browser_crawl::cli::parse_json(&options)
            .map_err(|message| global.throw_invalid_arguments(format_args!("{message}")))?;
        let cancel = Arc::new(Cancel::default());
        let promise = jsc::JSPromiseStrong::init(global);
        let result = promise.value();
        let cx = global.js_thread_of_caller();
        let mut abort = Box::new(AbortState {
            handle: jsc::AbortHandle::for_owner::<AbortState>(),
            cancel: cancel.clone(),
        });
        unsafe {
            jsc::AbortHandle::arm_owner(&raw mut *abort, cx.context());
            if let Some(signal) = signal {
                jsc::AbortHandle::follow_owner(&raw mut *abort, signal);
            }
        }
        jsc::Job::<Task>::schedule(
            &cx,
            Task {
                options: Some(options),
                cancel,
                result: None,
            },
            Js {
                promise,
                _abort: abort,
            },
        );
        Ok(result)
    }
}

impl Crawl {
    pub(crate) fn constructor(_: &JSGlobalObject, _: &CallFrame) -> JsResult<Box<Self>> {
        Ok(Box::new(Self))
    }
    pub(crate) fn get_available(
        _: &JSGlobalObject,
        _: JSValue,
        _: crate::generated_classes::PropertyName,
    ) -> JsResult<JSValue> {
        Ok(JSValue::js_boolean(cfg!(feature = "browser_crawl")))
    }
    pub(crate) fn run(global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
        #[cfg(feature = "browser_crawl")]
        {
            native::run(global, frame)
        }
        #[cfg(not(feature = "browser_crawl"))]
        {
            use bun_jsc::StringJsc as _;
            let _ = frame;
            let error = global.create_error_instance(format_args!(
                "ERR_CRAWL_PROVIDER_UNAVAILABLE: build with browser_crawl"
            ));
            let _hold = jsc::Strong::create(error, global);
            error.put(
                global,
                "code",
                bun_core::String::from_bytes(b"ERR_CRAWL_PROVIDER_UNAVAILABLE").to_js(global)?,
            );
            Ok(jsc::JSPromise::rejected_promise(global, error).as_value(global))
        }
    }
}
