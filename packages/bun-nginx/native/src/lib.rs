//! A real NGINX HTTP module. Requests, buffers and timers remain on its worker event loop.

// Standalone host outside Bun's event loop: std I/O, collections and strings are intended here, as in bun_host and bun_docker.
#![allow(
    clippy::disallowed_methods,
    clippy::disallowed_types,
    clippy::disallowed_macros,
)]

use core::cell::Cell;
use core::ffi::{c_char, c_void};
use core::ptr;
use std::ffi::CStr;
use std::panic::{AssertUnwindSafe, catch_unwind};

use ngx::core::{Buffer, Pool, Status};
use ngx::ffi::*;
use ngx::http::{
    self, HttpModule, HttpModuleLocationConf, HttpModuleMainConf, HttpPhase, HttpRequestHandler,
    Method, Request,
};
use ngx::{ngx_conf_log_error, ngx_string};

const NGINX_SOURCE: &str = "0a5db852e18d1c22c62a5ede1412ac3f416111a0";
const NGX_RUST_SOURCE: &str = "cf58b5270dc5e9b855dab765e9f13ba2a12c7709";

#[derive(Default, Clone, Copy)]
struct LocationConfig {
    enabled: bool,
    delay_ms: u16,
}
#[derive(Default)]
struct MainConfig {
    pending_timers: Cell<u32>,
}
struct Module;
impl HttpModule for Module {
    fn module() -> &'static ngx_module_t {
        // SAFETY: NGINX owns this ABI descriptor and initializes it before requests.
        #[cfg(not(feature = "abi-mismatch-fixture"))]
        unsafe {
            &*ptr::addr_of!(ngx_http_bun_module)
        }
        #[cfg(feature = "abi-mismatch-fixture")]
        unsafe {
            &*ptr::addr_of!(ngx_http_bun_abi_fixture_module)
        }
    }
}
// SAFETY: our descriptor creates and merges exactly this pool-owned location configuration.
unsafe impl HttpModuleLocationConf for Module {
    type LocationConf = LocationConfig;
}
// SAFETY: this configuration belongs to the cycle's pool; access stays on its worker loop.
unsafe impl HttpModuleMainConf for Module {
    type MainConf = MainConfig;
}

// Allocate and register cleanup explicitly: a failed pool allocation is checked before write.
unsafe fn pool_value<T>(pool: *mut ngx_pool_t, value: T) -> *mut T {
    if pool.is_null() {
        return ptr::null_mut();
    }
    // SAFETY: NGINX supplies a live pool on this worker/configuration thread.
    let pool = unsafe { Pool::from_ngx_pool(pool) };
    let pointer = pool.alloc(size_of::<T>()).cast::<T>();
    if pointer.is_null() || pointer.align_offset(align_of::<T>()) != 0 {
        return ptr::null_mut();
    }
    // SAFETY: allocation is aligned, sufficiently sized and uniquely owned.
    unsafe {
        pointer.write(value);
    }
    // SAFETY: the same live pool owns allocation and cleanup lifetime.
    let cleanup = unsafe { ngx_pool_cleanup_add(pool.as_ptr(), 0) };
    if cleanup.is_null() {
        // SAFETY: the initialized allocation has no registered cleanup yet.
        unsafe {
            ptr::drop_in_place(pointer);
        }
        return ptr::null_mut();
    }
    unsafe extern "C" fn cleanup_value<T>(data: *mut c_void) {
        // SAFETY: registered once for the initialized pool allocation; NGINX loop only.
        unsafe {
            ptr::drop_in_place(data.cast::<T>());
        }
    }
    // SAFETY: this uniquely owned cleanup is linked to the same pool.
    unsafe {
        (*cleanup).handler = Some(cleanup_value::<T>);
        (*cleanup).data = pointer.cast();
    }
    pointer
}

unsafe extern "C" fn create_location(cf: *mut ngx_conf_t) -> *mut c_void {
    catch_unwind(AssertUnwindSafe(|| {
        if cf.is_null() {
            return ptr::null_mut();
        }
        // SAFETY: configuration callback receives its live pool.
        unsafe { pool_value((*cf).pool, LocationConfig::default()).cast() }
    }))
    .unwrap_or(ptr::null_mut())
}
unsafe extern "C" fn create_main(cf: *mut ngx_conf_t) -> *mut c_void {
    catch_unwind(AssertUnwindSafe(|| {
        if cf.is_null() {
            return ptr::null_mut();
        }
        unsafe { pool_value((*cf).pool, MainConfig::default()).cast() }
    }))
    .unwrap_or(ptr::null_mut())
}
unsafe extern "C" fn merge_location(
    _cf: *mut ngx_conf_t,
    parent: *mut c_void,
    child: *mut c_void,
) -> *mut c_char {
    if parent.is_null() || child.is_null() {
        return ngx::core::NGX_CONF_ERROR;
    }
    // SAFETY: both configurations originate from create_location and their config pool.
    unsafe {
        let parent = &*parent.cast::<LocationConfig>();
        let child = &mut *child.cast::<LocationConfig>();
        if !child.enabled {
            *child = *parent;
        }
    }
    ngx::core::NGX_CONF_OK
}
unsafe extern "C" fn configure(
    cf: *mut ngx_conf_t,
    _command: *mut ngx_command_t,
    conf: *mut c_void,
) -> *mut c_char {
    catch_unwind(AssertUnwindSafe(|| {
        if cf.is_null() || conf.is_null() {
            return ngx::core::NGX_CONF_ERROR;
        }
        // SAFETY: NGINX passes the location configuration and checked argument array.
        let conf = unsafe { &mut *conf.cast::<LocationConfig>() };
        if conf.enabled {
            return ngx::core::NGX_CONF_ERROR;
        }
        let arguments: &[ngx_str_t] = unsafe { (*(*cf).args).as_slice() };
        let delay = if arguments.len() == 2 {
            let Some(delay) = arguments[1]
                .to_str()
                .ok()
                .and_then(|text| text.parse::<u16>().ok())
                .filter(|value| (1..=1000).contains(value))
            else {
                ngx_conf_log_error!(
                    NGX_LOG_EMERG,
                    cf,
                    "bun_nginx_delay requires an integer between 1 and 1000"
                );
                return ngx::core::NGX_CONF_ERROR;
            };
            delay
        } else if arguments.len() == 1 {
            0
        } else {
            return ngx::core::NGX_CONF_ERROR;
        };
        conf.enabled = true;
        conf.delay_ms = delay;
        ngx::core::NGX_CONF_OK
    }))
    .unwrap_or(ngx::core::NGX_CONF_ERROR)
}

#[repr(C)]
struct DelayedRequest {
    // ngx_event_ident casts event.data to the configured C connection ABI.
    #[allow(dead_code)] // Only the C debug logger reads this pool-owned prefix.
    connection: ngx_connection_t,
    event: ngx_event_t,
    request: *mut ngx_http_request_t,
    delay_ms: u16,
    main: *const MainConfig,
    pending: bool,
}
const _: () = assert!(core::mem::offset_of!(DelayedRequest, connection) == 0);
impl Drop for DelayedRequest {
    fn drop(&mut self) {
        // SAFETY: cleanup and callbacks both execute on the NGINX worker loop.
        unsafe {
            if self.pending {
                (*self.main)
                    .pending_timers
                    .set((*self.main).pending_timers.get().saturating_sub(1));
            }
            if self.event.timer_set() != 0 {
                ngx_del_timer(&raw mut self.event);
            }
            if self.event.posted() != 0 {
                ngx_delete_posted_event(&raw mut self.event);
            }
        }
    }
}
unsafe extern "C" fn delayed_response(event: *mut ngx_event_t) {
    if event.is_null() {
        return;
    }
    // SAFETY: event.data was set to its request-pool allocation before registration.
    let context = unsafe { (*event).data.cast::<DelayedRequest>() };
    if context.is_null() {
        return;
    }
    let (request, delay) = unsafe { ((*context).request, (*context).delay_ms) };
    unsafe {
        (*(*context).main)
            .pending_timers
            .set((*(*context).main).pending_timers.get().saturating_sub(1));
        (*context).pending = false;
    }
    let result = catch_unwind(AssertUnwindSafe(|| respond(request, delay)))
        .unwrap_or(Status(NGX_HTTP_INTERNAL_SERVER_ERROR as _));
    // SAFETY: the held main request count keeps its pool alive until this finalization.
    // Finalization can destroy context; nothing is dereferenced after this call.
    unsafe {
        ngx_http_finalize_request(request, result.into());
    }
}

fn respond(raw: *mut ngx_http_request_t, delay: u16) -> Status {
    if raw.is_null() {
        return Status(NGX_ERROR);
    }
    // SAFETY: called only with the live request from its content handler/timer on this loop.
    let request = unsafe { Request::from_ngx_http_request(raw) };
    let signature = unsafe { CStr::from_ptr(Module::module().signature) }
        .to_str()
        .unwrap_or("invalid");
    // These OS scalars belong to NGINX; request memory never crosses into the Bun VM.
    let (worker_pid, master_pid) = unsafe { (ngx_pid, ngx_parent) };
    let pending_timers = Module::main_conf(request).map_or(0, |config| config.pending_timers.get());
    let body = format!(
        "{{\"schema\":1,\"module\":\"ngx_http_bun_module\",\"nginxVersion\":{nginx_version},\"nginxSourceRevision\":\"{NGINX_SOURCE}\",\"ngxRustRevision\":\"{NGX_RUST_SOURCE}\",\"configurationSha256\":\"{}\",\"moduleSignature\":\"{signature}\",\"eventLoop\":\"nginx-worker\",\"allocationOwner\":\"request-pool\",\"delayMilliseconds\":{delay},\"workerPID\":{worker_pid},\"masterPID\":{master_pid},\"pendingTimers\":{pending_timers}}}",
        env!("BUN_NGINX_CONFIGURATION_SHA256")
    );
    let Some(mut buffer) = request.pool().create_buffer_from_str(&body) else {
        return Status(NGX_HTTP_INTERNAL_SERVER_ERROR as _);
    };
    let chain = request.pool().calloc_type::<ngx_chain_t>();
    if chain.is_null() {
        return Status(NGX_HTTP_INTERNAL_SERVER_ERROR as _);
    }
    request.set_status(http::HTTPStatus::OK);
    request.set_content_length_n(body.len());
    unsafe {
        (*raw).headers_out.content_type = ngx_string!("application/json");
        (*raw).headers_out.content_type_len = 16;
    }
    let headers = request.send_header();
    if headers.0 == NGX_ERROR || headers.0 > NGX_OK || request.header_only() {
        return headers;
    }
    buffer.set_last_buf(unsafe { (*raw).main == raw });
    buffer.set_last_in_chain(true);
    unsafe {
        (*chain).buf = buffer.as_ngx_buf_mut();
        (*chain).next = ptr::null_mut();
        request.output_filter(&mut *chain)
    }
}

struct Content;
impl HttpRequestHandler for Content {
    const PHASE: HttpPhase = HttpPhase::Content;
    type Output = Status;
    fn handler(request: &mut Request) -> Status {
        catch_unwind(AssertUnwindSafe(|| {
            let Some(conf) = Module::location_conf(request) else {
                return Status(NGX_DECLINED);
            };
            if !conf.enabled {
                return Status(NGX_DECLINED);
            }
            let delay = conf.delay_ms;
            if request.method() != Method::GET && request.method() != Method::HEAD {
                return Status(NGX_HTTP_NOT_ALLOWED as _);
            }
            let discard = request.discard_request_body();
            if discard.0 != NGX_OK {
                return discard;
            }
            let raw: *mut ngx_http_request_t = (&mut *request).into();
            if delay == 0 {
                return respond(raw, 0);
            }
            if request
                .get_module_ctx::<DelayedRequest>(Module::module())
                .is_some()
            {
                return Status(NGX_DONE);
            }
            let Some(main_config) = Module::main_conf(request) else {
                return Status(NGX_ERROR);
            };
            let Some(pending) = main_config.pending_timers.get().checked_add(1) else {
                return Status(NGX_ERROR);
            };
            // SAFETY: zero is a valid empty NGINX event; it is initialized before registration.
            let context = unsafe {
                pool_value(
                    (*raw).pool,
                    DelayedRequest {
                        connection: {
                            let mut identity: ngx_connection_t = core::mem::zeroed();
                            identity.fd = (*(*raw).connection).fd;
                            identity
                        },
                        event: core::mem::zeroed(),
                        request: raw,
                        delay_ms: delay,
                        main: main_config,
                        pending: false,
                    },
                )
            };
            if context.is_null() {
                return Status(NGX_HTTP_INTERNAL_SERVER_ERROR as _);
            }
            request.set_module_ctx(context.cast(), Module::module());
            unsafe {
                let main = (*raw).main;
                if (*main).count() == u16::MAX as _ {
                    return Status(NGX_ERROR);
                }
                (*main).set_count((*main).count() + 1);
                main_config.pending_timers.set(pending);
                (*context).pending = true;
                (*context).event.handler = Some(delayed_response);
                (*context).event.data = context.cast();
                (*context).event.log = (*(*raw).connection).log;
                (*context).event.set_cancelable(1);
                ngx_add_timer(&raw mut (*context).event, delay as _);
            }
            Status(NGX_DONE)
        }))
        .unwrap_or(Status(NGX_HTTP_INTERNAL_SERVER_ERROR as _))
    }
}
unsafe extern "C" fn postconfigure(cf: *mut ngx_conf_t) -> ngx_int_t {
    catch_unwind(AssertUnwindSafe(|| {
        if cf.is_null() {
            return NGX_ERROR;
        }
        unsafe { http::add_phase_handler::<Content>(&mut *cf) }.map_or(NGX_ERROR, |_| NGX_OK)
    }))
    .unwrap_or(NGX_ERROR)
}

static CONTEXT: ngx_http_module_t = ngx_http_module_t {
    preconfiguration: None,
    postconfiguration: Some(postconfigure),
    create_main_conf: Some(create_main),
    init_main_conf: None,
    create_srv_conf: None,
    merge_srv_conf: None,
    create_loc_conf: Some(create_location),
    merge_loc_conf: Some(merge_location),
};
static mut COMMANDS: [ngx_command_t; 3] = [
    ngx_command_t {
        name: ngx_string!("bun_nginx"),
        type_: NGX_HTTP_LOC_CONF | NGX_CONF_NOARGS,
        set: Some(configure),
        conf: NGX_HTTP_LOC_CONF_OFFSET,
        offset: 0,
        post: ptr::null_mut(),
    },
    ngx_command_t {
        name: ngx_string!("bun_nginx_delay"),
        type_: NGX_HTTP_LOC_CONF | NGX_CONF_TAKE1,
        set: Some(configure),
        conf: NGX_HTTP_LOC_CONF_OFFSET,
        offset: 0,
        post: ptr::null_mut(),
    },
    ngx_command_t::empty(),
];
const fn descriptor() -> ngx_module_t {
    let mut module = ngx_module_t::default();
    module.ctx = &raw const CONTEXT as _;
    module.commands = (&raw mut COMMANDS).cast();
    module.type_ = NGX_HTTP_MODULE;
    if cfg!(feature = "abi-mismatch-fixture") {
        module.signature = c"bun-deliberately-incompatible-module".as_ptr();
    }
    module
}
#[used]
#[allow(non_upper_case_globals)]
#[unsafe(no_mangle)]
#[cfg(not(feature = "abi-mismatch-fixture"))]
pub static mut ngx_http_bun_module: ngx_module_t = descriptor();
#[cfg(all(feature = "export-modules", not(feature = "abi-mismatch-fixture")))]
ngx::ngx_modules!(ngx_http_bun_module);
// A unique symbol prevents ELF interposition with the positive static module in the host.
#[used]
#[allow(non_upper_case_globals)]
#[unsafe(no_mangle)]
#[cfg(feature = "abi-mismatch-fixture")]
pub static mut ngx_http_bun_abi_fixture_module: ngx_module_t = descriptor();
#[cfg(all(feature = "export-modules", feature = "abi-mismatch-fixture"))]
ngx::ngx_modules!(ngx_http_bun_abi_fixture_module);

#[unsafe(no_mangle)]
pub extern "C" fn bun_nginx_module_abi_version() -> u32 {
    1
}
