use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};
use std::time::Duration;

pub(crate) struct Request {
    pub url: String,
    pub method: Option<String>,
    pub headers: Vec<String>,
    pub body: Option<Vec<u8>>,
    pub timeout: Duration,
    pub max_bytes: usize,
    pub follow_redirects: bool,
    pub max_redirects: u32,
    pub options: Vec<(String, serde_json::Value)>,
    pub cancel: Arc<AtomicBool>,
}

pub(crate) struct Response {
    pub status: u32,
    pub body: Vec<u8>,
    pub headers: Vec<u8>,
}

#[cfg(feature = "curl_native")]
struct Collector {
    body: Vec<u8>,
    headers: Vec<u8>,
    limit: usize,
    overflow: bool,
    cancel: Arc<AtomicBool>,
    upload: Vec<u8>,
    upload_offset: usize,
}

#[cfg(feature = "curl_native")]
impl Collector {
    fn write(&mut self, data: &[u8]) -> usize {
        if self.cancel.load(Ordering::Relaxed)
            || data.len() > self.limit.saturating_sub(self.body.len())
        {
            self.overflow = !self.cancel.load(Ordering::Relaxed);
            return 0;
        }
        self.body.extend_from_slice(data);
        data.len()
    }

    fn header(&mut self, data: &[u8]) -> bool {
        if self.cancel.load(Ordering::Relaxed)
            || data.len() > (1usize << 20).saturating_sub(self.headers.len())
        {
            self.overflow = !self.cancel.load(Ordering::Relaxed);
            return false;
        }
        self.headers.extend_from_slice(data);
        true
    }
}

pub(crate) fn perform(request: Request) -> Result<Response, String> {
    if request.cancel.load(Ordering::Relaxed) {
        return Err("ERR_CURL_ABORTED".into());
    }
    if request.max_bytes == 0 || request.max_bytes > 256 << 20 || request.timeout.is_zero() {
        return Err("ERR_CURL_INVALID_LIMIT".into());
    }
    if request
        .body
        .as_ref()
        .is_some_and(|body| body.len() > 256 << 20)
    {
        return Err("ERR_CURL_REQUEST_LIMIT".into());
    }
    if request.url.contains('\0')
        || request.method.as_ref().is_some_and(|method| {
            method.is_empty() || !method.bytes().all(|c| c.is_ascii_alphabetic())
        })
        || request
            .headers
            .iter()
            .any(|header| bun_core::strings::index_of_any(header.as_bytes(), b"\0\r\n").is_some())
    {
        return Err("ERR_CURL_INVALID_REQUEST".into());
    }
    #[cfg(not(feature = "curl_native"))]
    {
        let _ = (
            request.follow_redirects,
            request.max_redirects,
            request.options,
        );
        let _ = request;
        Err("ERR_CURL_PROVIDER_UNAVAILABLE".into())
    }
    #[cfg(feature = "curl_native")]
    {
        native(request)
    }
}

#[cfg(feature = "curl_native")]
fn native(mut request: Request) -> Result<Response, String> {
    use super::ffi;
    use core::ffi::{c_char, c_int, c_long, c_void};
    use std::ffi::CString;
    struct Easy(*mut c_void);
    impl Drop for Easy {
        fn drop(&mut self) {
            unsafe { ffi::curl_easy_cleanup(self.0) };
        }
    }
    struct Headers(*mut ffi::Slist);
    impl Drop for Headers {
        fn drop(&mut self) {
            unsafe { ffi::curl_slist_free_all(self.0) };
        }
    }
    enum OptionValue {
        Long(c_long),
        Offset(i64),
        String(CString),
        List(Headers),
    }
    fn check(code: c_int) -> Result<(), String> {
        if code == 0 {
            Ok(())
        } else {
            Err(format!("ERR_CURL_NATIVE: {code}"))
        }
    }
    unsafe extern "C" fn write(
        data: *mut c_char,
        size: usize,
        count: usize,
        context: *mut c_void,
    ) -> usize {
        let Some(length) = size.checked_mul(count) else {
            return 0;
        };
        if length == 0 {
            return 0;
        }
        unsafe { &mut *context.cast::<Collector>() }
            .write(unsafe { core::slice::from_raw_parts(data.cast(), length) })
    }
    unsafe extern "C" fn header(
        data: *mut c_char,
        size: usize,
        count: usize,
        context: *mut c_void,
    ) -> usize {
        let Some(length) = size.checked_mul(count) else {
            return 0;
        };
        if length == 0 {
            return 0;
        }
        if unsafe { &mut *context.cast::<Collector>() }
            .header(unsafe { core::slice::from_raw_parts(data.cast(), length) })
        {
            length
        } else {
            0
        }
    }
    unsafe extern "C" fn progress(context: *mut c_void, _: i64, _: i64, _: i64, _: i64) -> c_int {
        i32::from(
            unsafe { &*context.cast::<Collector>() }
                .cancel
                .load(Ordering::Relaxed),
        )
    }
    unsafe extern "C" fn read(
        data: *mut c_char,
        size: usize,
        count: usize,
        context: *mut c_void,
    ) -> usize {
        let Some(capacity) = size.checked_mul(count) else {
            return 0x10000000;
        };
        let source = unsafe { &mut *context.cast::<Collector>() };
        if source.cancel.load(Ordering::Relaxed) {
            return 0x10000000;
        }
        let length = capacity.min(source.upload.len().saturating_sub(source.upload_offset));
        if length > 0 {
            unsafe {
                core::ptr::copy_nonoverlapping(
                    source.upload.as_ptr().add(source.upload_offset),
                    data.cast(),
                    length,
                )
            };
            source.upload_offset += length;
        }
        length
    }
    unsafe extern "C" fn seek(context: *mut c_void, offset: i64, whence: c_int) -> c_int {
        let source = unsafe { &mut *context.cast::<Collector>() };
        let base = match whence {
            0 => 0,
            1 => source.upload_offset,
            2 => source.upload.len(),
            _ => return 1,
        };
        let Some(position) = i64::try_from(base)
            .ok()
            .and_then(|base| base.checked_add(offset))
            .and_then(|value| usize::try_from(value).ok())
        else {
            return 1;
        };
        if position > source.upload.len() {
            return 1;
        }
        source.upload_offset = position;
        0
    }
    check(ffi::initialize())?;
    let body_length = request.body.as_ref().map(Vec::len);
    let mut collector = Collector {
        body: Vec::new(),
        headers: Vec::new(),
        limit: request.max_bytes,
        overflow: false,
        cancel: request.cancel.clone(),
        upload: request.body.take().unwrap_or_default(),
        upload_offset: 0,
    };
    let context = (&mut collector as *mut Collector).cast::<c_void>();
    let url = CString::new(request.url).map_err(|_| "ERR_CURL_URL")?;
    let method = request
        .method
        .map(CString::new)
        .transpose()
        .map_err(|_| "ERR_CURL_METHOD")?;
    let mut headers = Headers(core::ptr::null_mut());
    for value in &request.headers {
        let value = CString::new(value.as_bytes()).map_err(|_| "ERR_CURL_HEADER")?;
        let next = unsafe { ffi::curl_slist_append(headers.0, value.as_ptr()) };
        if next.is_null() {
            return Err("ERR_CURL_OUT_OF_MEMORY".into());
        }
        headers.0 = next;
    }
    let timeout = c_long::try_from(request.timeout.as_millis()).map_err(|_| "ERR_CURL_TIMEOUT")?;
    let redirects =
        c_long::try_from(request.max_redirects).map_err(|_| "ERR_CURL_REDIRECT_LIMIT")?;
    let mut native_options = Vec::new();
    for (name, value) in &request.options {
        let name = CString::new(name.trim_start_matches("CURLOPT_").to_ascii_uppercase())
            .map_err(|_| "ERR_CURL_OPTION")?;
        let option = unsafe { ffi::curl_easy_option_by_name(name.as_ptr()).as_ref() }
            .ok_or("ERR_CURL_OPTION_UNAVAILABLE")?;
        if [
            41, 42, 43, 99, 13, 155, 20011, 20012, 20079, 20167, 20219, 10001, 10009, 10029, 10057,
            10168,
        ]
        .contains(&option.id)
        {
            return Err("ERR_CURL_OPTION_OWNED_BY_RUNTIME".into());
        }
        let value = match option.kind {
            0 | 1 => OptionValue::Long(
                c_long::try_from(
                    value
                        .as_i64()
                        .or_else(|| value.as_bool().map(i64::from))
                        .ok_or("ERR_CURL_OPTION_TYPE")?,
                )
                .map_err(|_| "ERR_CURL_OPTION_RANGE")?,
            ),
            2 => OptionValue::Offset(value.as_i64().ok_or("ERR_CURL_OPTION_TYPE")?),
            4 => OptionValue::String(
                CString::new(value.as_str().ok_or("ERR_CURL_OPTION_TYPE")?)
                    .map_err(|_| "ERR_CURL_OPTION_NUL")?,
            ),
            5 => {
                let mut list = Headers(core::ptr::null_mut());
                for item in value.as_array().ok_or("ERR_CURL_OPTION_TYPE")? {
                    let item = CString::new(item.as_str().ok_or("ERR_CURL_OPTION_TYPE")?)
                        .map_err(|_| "ERR_CURL_OPTION_NUL")?;
                    let next = unsafe { ffi::curl_slist_append(list.0, item.as_ptr()) };
                    if next.is_null() {
                        return Err("ERR_CURL_OUT_OF_MEMORY".into());
                    }
                    list.0 = next;
                }
                OptionValue::List(list)
            }
            _ => return Err("ERR_CURL_UNSAFE_OPTION_TYPE".into()),
        };
        native_options.push((option.id, value));
    }
    let easy = Easy(unsafe { ffi::curl_easy_init() });
    if easy.0.is_null() {
        return Err("ERR_CURL_INIT".into());
    }
    // Each variadic argument follows the exact CURLOPT long/pointer/callback ABI.
    unsafe {
        check(ffi::curl_easy_setopt(easy.0, 10002, url.as_ptr()))?;
        for (option, value) in [
            (99, 1),
            (64, 1),
            (81, 2),
            (155, timeout),
            (52, c_long::from(request.follow_redirects)),
            (68, redirects),
            (43, 0),
        ] {
            check(ffi::curl_easy_setopt(easy.0, option, value))?;
        }
        for option in [10001, 10009, 10029, 10057, 10168] {
            check(ffi::curl_easy_setopt(easy.0, option, context))?;
        }
        check(ffi::curl_easy_setopt(
            easy.0,
            20011,
            write as unsafe extern "C" fn(*mut c_char, usize, usize, *mut c_void) -> usize,
        ))?;
        check(ffi::curl_easy_setopt(
            easy.0,
            20079,
            header as unsafe extern "C" fn(*mut c_char, usize, usize, *mut c_void) -> usize,
        ))?;
        check(ffi::curl_easy_setopt(
            easy.0,
            20219,
            progress as unsafe extern "C" fn(*mut c_void, i64, i64, i64, i64) -> c_int,
        ))?;
        check(ffi::curl_easy_setopt(
            easy.0,
            20012,
            read as unsafe extern "C" fn(*mut c_char, usize, usize, *mut c_void) -> usize,
        ))?;
        check(ffi::curl_easy_setopt(
            easy.0,
            20167,
            seek as unsafe extern "C" fn(*mut c_void, i64, c_int) -> c_int,
        ))?;
        if let Some(length) = body_length {
            let length = i64::try_from(length).map_err(|_| "ERR_CURL_BODY")?;
            check(ffi::curl_easy_setopt(easy.0, 30120, length))?;
            check(ffi::curl_easy_setopt(easy.0, 30115, length))?;
            check(ffi::curl_easy_setopt(
                easy.0,
                10015,
                collector.upload.as_ptr(),
            ))?;
        }
        if let Some(method) = &method {
            check(ffi::curl_easy_setopt(easy.0, 10036, method.as_ptr()))?;
            if method.as_bytes().eq_ignore_ascii_case(b"HEAD") {
                check(ffi::curl_easy_setopt(easy.0, 44, 1 as c_long))?;
            }
        }
        check(ffi::curl_easy_setopt(easy.0, 10023, headers.0))?;
        for (id, value) in &native_options {
            check(match value {
                OptionValue::Long(value) => ffi::curl_easy_setopt(easy.0, *id, *value),
                OptionValue::Offset(value) => ffi::curl_easy_setopt(easy.0, *id, *value),
                OptionValue::String(value) => ffi::curl_easy_setopt(easy.0, *id, value.as_ptr()),
                OptionValue::List(value) => ffi::curl_easy_setopt(easy.0, *id, value.0),
            })?;
        }
        let code = ffi::curl_easy_perform(easy.0);
        if code != 0 {
            if request.cancel.load(Ordering::Relaxed) {
                return Err("ERR_CURL_ABORTED".into());
            }
            if collector.overflow {
                return Err("ERR_CURL_RESPONSE_LIMIT".into());
            }
            check(code)?;
        }
        let mut status: c_long = 0;
        check(ffi::curl_easy_getinfo(
            easy.0,
            0x200002,
            &mut status as *mut c_long,
        ))?;
        drop(easy);
        Ok(Response {
            status: u32::try_from(status).map_err(|_| "ERR_CURL_STATUS")?,
            body: collector.body,
            headers: collector.headers,
        })
    }
}
