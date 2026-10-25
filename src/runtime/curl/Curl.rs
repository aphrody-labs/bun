use super::provider;
use bun_jsc::{self as jsc, CallFrame, JSGlobalObject, JSValue, JsResult, StringJsc as _};
use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};

#[bun_jsc::JsClass]
pub(crate) struct Curl;

#[derive(bun_jsc::JsAffine)]
struct Js {
    promise: jsc::JSPromiseStrong,
    _abort: Box<AbortState>,
}
struct AbortState {
    handle: jsc::AbortHandle,
    cancel: Arc<AtomicBool>,
}
unsafe impl jsc::job::JsAffine for AbortState {}
jsc::impl_abort_handle_owner!(AbortState, handle, |this, _cause| {
    // The stable JS-side owner shares only its atomic cancellation flag with the worker.
    unsafe { (*this).cancel.store(true, Ordering::Relaxed) };
});
struct Task {
    request: Option<provider::Request>,
    result: Option<Result<provider::Response, String>>,
}

impl jsc::JobContext for Task {
    type OffThread = Self;
    type Js = Js;
    fn run(this: &mut Self, done: jsc::Completion<Self>) -> Option<jsc::Completion<Self>> {
        this.result = Some(provider::perform(
            this.request.take().expect("owned request"),
        ));
        Some(done)
    }
    fn then(this: Self, mut js: Js, cx: &jsc::JsThread<'_>) -> JsResult<()> {
        let global = cx.global();
        match this.result.expect("completed request") {
            Ok(response) => {
                let object = JSValue::create_empty_object(global, 3);
                let _hold = jsc::Strong::create(object, global);
                object.put(
                    global,
                    b"status",
                    JSValue::js_number(f64::from(response.status)),
                );
                let blob = crate::webcore::blob::Blob::init(response.body, global);
                object.put(
                    global,
                    b"body",
                    <crate::webcore::blob::Blob as jsc::JsClass>::to_js(blob, global),
                );
                let headers = redact_headers(&response.headers);
                object.put(
                    global,
                    b"headers",
                    bun_core::String::from_bytes(headers.as_bytes()).to_js(global)?,
                );
                js.promise.resolve(global, object)
            }
            Err(message) => {
                let error = global.create_error_instance(format_args!("{message}"));
                let _hold = jsc::Strong::create(error, global);
                error.put(
                    global,
                    "code",
                    bun_core::String::from_bytes(
                        message
                            .split(':')
                            .next()
                            .unwrap_or("ERR_CURL_NATIVE")
                            .as_bytes(),
                    )
                    .to_js(global)?,
                );
                js.promise.reject(global, Ok(error))
            }
        }
    }
}

fn redact_headers(bytes: &[u8]) -> String {
    let mut protected = false;
    String::from_utf8_lossy(bytes)
        .lines()
        .map(|line| {
            if (line.starts_with(' ') || line.starts_with('\t')) && protected {
                return "[redacted]\r\n".to_owned();
            }
            protected = false;
            if let Some((name, _)) = line.split_once(':') {
                if [
                    "set-cookie",
                    "cookie",
                    "authorization",
                    "proxy-authorization",
                ]
                .iter()
                .any(|protected| name.eq_ignore_ascii_case(protected))
                {
                    protected = true;
                    return format!("{name}: [redacted]\r\n");
                }
            }
            format!("{line}\r\n")
        })
        .collect()
}

impl Curl {
    pub(crate) fn constructor(_: &JSGlobalObject, _: &CallFrame) -> JsResult<Box<Self>> {
        Ok(Box::new(Self))
    }
    pub(crate) fn get_available(
        _: &JSGlobalObject,
        _: JSValue,
        _: crate::generated_classes::PropertyName,
    ) -> JsResult<JSValue> {
        Ok(JSValue::js_boolean(cfg!(feature = "curl_native")))
    }
    pub(crate) fn capabilities(global: &JSGlobalObject, _: &CallFrame) -> JsResult<JSValue> {
        let object = JSValue::create_empty_object(global, 4);
        let _hold = jsc::Strong::create(object, global);
        object.put(
            global,
            b"available",
            JSValue::js_boolean(cfg!(feature = "curl_native")),
        );
        #[cfg(not(feature = "curl_native"))]
        {
            object.put(
                global,
                b"protocols",
                JSValue::create_empty_array(global, 0)?,
            );
        }
        #[cfg(feature = "curl_native")]
        {
            use super::ffi;
            if ffi::initialize() != 0 {
                return Err(global.throw(format_args!("ERR_CURL_INIT")));
            }
            let info = unsafe { ffi::curl_version_info(0).as_ref() }
                .ok_or_else(|| global.throw(format_args!("ERR_CURL_VERSION")))?;
            for (name, pointer) in [
                (b"version".as_slice(), info.version),
                (b"tls".as_slice(), info.ssl_version),
            ] {
                let value = if pointer.is_null() {
                    JSValue::NULL
                } else {
                    bun_core::String::from_bytes(
                        unsafe { std::ffi::CStr::from_ptr(pointer) }.to_bytes(),
                    )
                    .to_js(global)?
                };
                object.put(global, name, value);
            }
            let mut protocols = Vec::new();
            if !info.protocols.is_null() {
                for index in 0..256 {
                    let pointer = unsafe { *info.protocols.add(index) };
                    if pointer.is_null() {
                        break;
                    }
                    protocols.push(unsafe { std::ffi::CStr::from_ptr(pointer) }.to_bytes());
                }
            }
            object.put(
                global,
                b"protocols",
                JSValue::create_array_from_iter(global, protocols.into_iter(), |bytes| {
                    bun_core::String::from_bytes(bytes).to_js(global)
                })?,
            );
            object.put(
                global,
                b"features",
                JSValue::js_number(f64::from(info.features)),
            );
        }
        Ok(object)
    }
    pub(crate) fn request(global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
        let url = frame.argument(0);
        if !url.is_string() {
            return Err(
                global.throw_invalid_arguments(format_args!("Curl.request expects a URL string"))
            );
        }
        let url = url.to_bun_string(global)?;
        let url = url.to_utf8();
        let url = String::from_utf8(url.slice().to_vec())
            .map_err(|_| global.throw_invalid_arguments(format_args!("Curl URL must be UTF-8")))?;
        let options = frame.argument(1);
        let signal = if options.is_object() {
            match options.get(global, "signal")? {
                Some(value) if !value.is_undefined_or_null() => {
                    Some(jsc::AbortSignal::ref_from_js(value).ok_or_else(|| {
                        global
                            .throw_invalid_arguments(format_args!("signal must be an AbortSignal"))
                    })?)
                }
                _ => None,
            }
        } else {
            None
        };
        let invalid =
            || global.throw_invalid_arguments(format_args!("Invalid or unsupported Curl option"));
        let mut object = serde_json::Map::new();
        let mut body = None;
        if !options.is_undefined_or_null() {
            if !options.is_object() {
                return Err(invalid());
            }
            let keys = options.keys(global)?;
            let _keys_hold = jsc::Strong::create(keys, global);
            let length = keys.get_length(global)?;
            if length > 16 {
                return Err(invalid());
            }
            for index in 0..length {
                let key = keys.get_index(global, index as u32)?;
                let name = key.to_bun_string(global)?;
                let name = name.to_utf8();
                let name = std::str::from_utf8(name.slice()).map_err(|_| invalid())?;
                if ![
                    "method", "headers", "body", "timeout", "maxBytes", "followRedirects",
                    "maxRedirects", "signal", "options",
                ]
                .contains(&name)
                {
                    return Err(invalid());
                }
                // The signal getter was already evaluated above. Snapshot every other getter once.
                if name == "signal" {
                    continue;
                }
                let Some(value) = options.get_own(global, &key.to_bun_string(global)?)? else {
                    continue;
                };
                if value.is_undefined() {
                    continue;
                }
                let _value_hold = jsc::Strong::create(value, global);
                if name == "body" {
                    body = Some(if value.is_string() {
                        value.to_bun_string(global)?.to_utf8().slice().to_vec()
                    } else if let Some(buffer) = value.as_array_buffer(global) {
                        if buffer.is_detached() {
                            return Err(invalid());
                        }
                        // No borrowed backing store crosses getters, GC or the worker boundary.
                        buffer.slice().to_vec()
                    } else {
                        return Err(invalid());
                    });
                } else {
                    let json = value.json_stringify(global, 0)?;
                    let json = json.to_utf8();
                    object.insert(
                        name.to_owned(),
                        serde_json::from_slice(json.slice()).map_err(|_| invalid())?,
                    );
                }
            }
        }
        let number = |key: &str, default: u64| -> JsResult<u64> {
            object
                .get(key)
                .map_or(Ok(default), |value| value.as_u64().ok_or_else(invalid))
        };
        let method = object
            .get("method")
            .map(|value| value.as_str().map(str::to_owned).ok_or_else(invalid))
            .transpose()?;
        let headers = object
            .get("headers")
            .map(|value| {
                value
                    .as_array()
                    .ok_or_else(invalid)?
                    .iter()
                    .map(|value| value.as_str().map(str::to_owned).ok_or_else(invalid))
                    .collect::<JsResult<Vec<_>>>()
            })
            .transpose()?
            .unwrap_or_default();
        let cancel = Arc::new(AtomicBool::new(false));
        let request = provider::Request {
            url,
            method,
            body,
            headers,
            timeout: std::time::Duration::from_millis(number("timeout", 30_000)?),
            max_bytes: usize::try_from(number("maxBytes", 64 << 20)?).map_err(|_| invalid())?,
            follow_redirects: object
                .get("followRedirects")
                .map_or(Ok(false), |value| value.as_bool().ok_or_else(invalid))?,
            max_redirects: u32::try_from(number("maxRedirects", 10)?).map_err(|_| invalid())?,
            options: object
                .get("options")
                .map(|value| {
                    value.as_object().ok_or_else(invalid).map(|object| {
                        object
                            .iter()
                            .map(|(name, value)| (name.clone(), value.clone()))
                            .collect()
                    })
                })
                .transpose()?
                .unwrap_or_default(),
            cancel: cancel.clone(),
        };
        let promise = jsc::JSPromiseStrong::init(global);
        let value = promise.value();
        let cx = global.js_thread_of_caller();
        let mut abort = Box::new(AbortState {
            handle: jsc::AbortHandle::for_owner::<AbortState>(),
            cancel,
        });
        // Box keeps the AbortHandle address stable through Job's JS-side moves.
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
                result: None,
            },
            Js {
                promise,
                _abort: abort,
            },
        );
        Ok(value)
    }
}
