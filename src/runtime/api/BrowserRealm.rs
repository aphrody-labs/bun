//! A page-owned ECMAScript realm sharing Bun's JSC VM and a native HTML tree.
//!
//! The backing JSC context is registered with its owning VM. That registry is
//! authoritative: GC finalizers only post an ID to the owner loop; teardown
//! releases every context before destroying the JSC VM. No page-realm value
//! crosses into Bun's host realm.

use core::cell::Cell;
use core::ffi::c_void;
use std::sync::Arc;

use bun_browser_dom::{DomTree, NodeId};
use bun_event_loop::{Task, TaskTag, Taskable, task_tag};
use bun_jsc::{CallFrame, JSGlobalObject, JSValue, JsResult, bun_string_jsc};
use bun_jsc::event_loop::ConcurrentTask;
use bun_jsc::virtual_machine::VirtualMachine;

use crate::api::html_object::HTMLDocument;

#[repr(C)]
pub(crate) struct NativeResult {
    bytes: *mut u8,
    length: usize,
    status: i32,
}

unsafe extern "C" {
    fn Bun__BrowserRealm__create(
        host_global: *mut JSGlobalObject,
        tree: *const c_void,
        origin: *const u8,
        origin_len: usize,
        frame_id: *const u8,
        frame_id_len: usize,
    ) -> *mut c_void;
    fn Bun__BrowserRealm__evaluate(
        handle: *mut c_void,
        source: *const u8,
        source_len: usize,
        source_url: *const u8,
        source_url_len: usize,
        timeout_ms: u32,
        result: *mut NativeResult,
    ) -> bool;
    fn Bun__BrowserRealm__release(handle: *mut c_void);
    fn Bun__BrowserRealm__free_bytes(bytes: *mut u8, length: usize);
}

/// Registered entry; its Box address remains stable while page callbacks use
/// `tree`. Dropping it releases the C API context first, then its Arc tree.
struct Entry {
    handle: *mut c_void,
    _tree: Arc<DomTree>,
}

impl Drop for Entry {
    fn drop(&mut self) {
        if !self.handle.is_null() {
            // SAFETY: entries are removed only on their owner JS thread or
            // during that VM's teardown, before its JSC VM is destroyed.
            unsafe { Bun__BrowserRealm__release(self.handle) };
            self.handle = core::ptr::null_mut();
        }
    }
}

/// Create a plain page global in the current VM, with only the explicit
/// `__bunDOM` bridge. The host `HTMLDocument` object itself never crosses the
/// realm boundary; only its shared native tree does.
pub(crate) fn create(global: &JSGlobalObject) -> JSValue {
    bun_jsc::create_host_function_object(global, &[("create", __jsc_host_create_realm, 3)])
}

fn string_argument(global: &JSGlobalObject, frame: &CallFrame, index: usize, name: &str) -> JsResult<String> {
    let value = frame.argument(index);
    if !value.is_string() {
        return Err(global.throw_invalid_arguments(format_args!("BrowserRealm {name} must be a string")));
    }
    let value = value.to_bun_string(global)?;
    let utf8 = value.to_utf8();
    String::from_utf8(utf8.slice().to_vec())
        .map_err(|_| global.throw_invalid_arguments(format_args!("BrowserRealm {name} must be valid UTF-8")))
}

#[bun_jsc::host_fn]
pub(crate) fn create_realm(global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
    let document_value = frame.argument(0);
    let origin = string_argument(global, frame, 1, "origin")?;
    let frame_id = string_argument(global, frame, 2, "frameId")?;
    let Some(document) = <HTMLDocument as bun_jsc::JsClass>::from_js(document_value) else {
        return Err(global.throw_invalid_arguments(format_args!("BrowserRealm.create expects a Bun.HTML document")));
    };
    // SAFETY: `from_js` returned a live wrapper; the host JS argument roots it
    // for this call. Clone only its native Arc; no JS value is inserted into
    // the page realm.
    let tree = unsafe { Arc::clone(&(*document).tree) };
    let entry = Box::new(Entry { handle: core::ptr::null_mut(), _tree: tree });
    let tree_ptr = &entry._tree as *const Arc<DomTree>;
    // SAFETY: context creation is synchronous on the caller's live VM thread.
    let handle = unsafe {
        Bun__BrowserRealm__create(
            global.as_mut_ptr(),
            tree_ptr.cast(),
            origin.as_ptr(),
            origin.len(),
            frame_id.as_ptr(),
            frame_id.len(),
        )
    };
    if handle.is_null() {
        return Err(global.throw(format_args!("Could not create isolated JSC page realm")));
    }
    let mut entry = entry;
    entry.handle = handle;
    let vm = global.bun_vm();
    let (id, poster) = vm.as_mut().register_browser_realm(entry);
    Ok(BrowserRealm::to_js_boxed(Box::new(BrowserRealm { id: Cell::new(id), poster, origin }), global))
}

#[bun_jsc::JsClass(no_constructor)]
pub(crate) struct BrowserRealm {
    id: Cell<u64>,
    poster: bun_event_loop::JsPoster,
    origin: String,
}

impl BrowserRealm {
    #[bun_jsc::host_fn(method)]
    pub(crate) fn evaluate(&self, global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
        if self.id.get() == 0 {
            return Err(global.throw(format_args!("BrowserRealm has been destroyed")));
        }
        let source = string_argument(global, frame, 0, "script")?;
        let source_url = if frame.argument(1).is_undefined() {
            format!("{}/inline", self.origin.trim_end_matches('/'))
        } else {
            string_argument(global, frame, 1, "sourceURL")?
        };
        let timeout_ms = if frame.argument(2).is_undefined() {
            5_000
        } else {
            let value = frame.argument(2);
            let Some(timeout) = value.get_number() else {
                return Err(global.throw_invalid_arguments(format_args!("BrowserRealm timeoutMs must be a number")));
            };
            if !timeout.is_finite() || timeout.fract() != 0.0 || !(1.0..=60_000.0).contains(&timeout) {
                return Err(global.throw_invalid_arguments(format_args!("BrowserRealm timeoutMs must be in 1..=60000")));
            }
            timeout as u32
        };
        let vm = global.bun_vm();
        let entry = vm.as_mut().browser_realm_mut::<Box<Entry>>(self.id.get())
            .ok_or_else(|| global.throw(format_args!("BrowserRealm was released by its owner VM")))?;
        let mut output = NativeResult { bytes: core::ptr::null_mut(), length: 0, status: 0 };
        // SAFETY: source and URL slices remain live for the synchronous call;
        // the registry owns the matching page context and native tree.
        let completed = unsafe {
            Bun__BrowserRealm__evaluate(
                entry.handle,
                source.as_ptr(), source.len(),
                source_url.as_ptr(), source_url.len(),
                timeout_ms, &mut output,
            )
        };
        if output.bytes.is_null() {
            return Err(global.throw(format_args!("BrowserRealm evaluation returned no result")));
        }
        // SAFETY: C++ allocated this exact byte span for the returned message.
        let message = unsafe { core::slice::from_raw_parts(output.bytes, output.length) }.to_vec();
        // SAFETY: exactly one release of the returned buffer.
        unsafe { Bun__BrowserRealm__free_bytes(output.bytes, output.length) };
        let text = std::str::from_utf8(&message)
            .map_err(|_| global.throw(format_args!("BrowserRealm returned invalid UTF-8")))?;
        if !completed || output.status != 0 {
            return Err(global.throw(format_args!("{text}")));
        }
        bun_string_jsc::create_utf8_for_js(global, text.as_bytes())
    }

    #[bun_jsc::host_fn(method)]
    pub(crate) fn destroy(&self, global: &JSGlobalObject, _: &CallFrame) -> JsResult<JSValue> {
        let id = self.id.replace(0);
        if id != 0 {
            // Explicit destroy is synchronous on the owner JS thread.
            let vm = global.bun_vm();
            vm.as_mut().release_browser_realm(id);
        }
        Ok(JSValue::UNDEFINED)
    }

    pub(crate) fn finalize(self: Box<Self>) {
        if self.id.get() == 0 {
            return;
        }
        let task = bun_core::heap::into_raw(Box::new(ReleaseTask { id: self.id.get() }));
        let carrier = ConcurrentTask::ConcurrentTask::create(Task::init(task));
        if let bun_event_loop::Posted::Refused(carrier) = self.poster.post(carrier) {
            // Refusal means teardown has closed the owner loop. The VM's
            // authoritative registry performs the release before JSC teardown.
            // SAFETY: the poster returned ownership of this unqueued carrier.
            unsafe { drop(bun_core::heap::take(carrier.as_ptr())) };
            // The task payload is not owned by the registry; reclaim it too.
            unsafe { drop(bun_core::heap::take(task)) };
        }
    }
}

pub(crate) struct ReleaseTask { id: u64 }

impl Taskable for ReleaseTask {
    const TAG: TaskTag = task_tag::BrowserRealmRelease;

    unsafe fn release_unrun(this: *mut Self) {
        // Both dispatch and release-unrun execute on the owner JS thread.
        // SAFETY: the Task dispatcher transfers this owned payload once on its JS thread.
        unsafe { Self::run_from_js_thread(this) };
    }

    unsafe fn context(_: *const Self) -> bun_event_loop::ContextId {
        bun_event_loop::ContextId::NONE
    }
}

impl ReleaseTask {
    pub(crate) unsafe fn run_from_js_thread(this: *mut Self) {
        // SAFETY: dispatch owns the heap payload identified by the task tag.
        let task = unsafe { bun_core::heap::take(this) };
        let vm = VirtualMachine::get_mut();
        vm.release_browser_realm(task.id);
    }
}

fn json_string(input: &str) -> String {
    let mut output = String::with_capacity(input.len() + 2);
    output.push('"');
    for ch in input.chars() {
        match ch {
            '"' => output.push_str("\\\""),
            '\\' => output.push_str("\\\\"),
            '\n' => output.push_str("\\n"),
            '\r' => output.push_str("\\r"),
            '\t' => output.push_str("\\t"),
            '\0'..='\u{1f}' => output.push_str(&format!("\\u{:04x}", ch as u32)),
            _ => output.push(ch),
        }
    }
    output.push('"');
    output
}

/// Callback used by JSC's bare page global. It speaks only JSON over the C ABI;
/// no `JSValue` or Bun host pointer enters the page realm.
#[unsafe(no_mangle)]
pub(crate) unsafe extern "C" fn Bun__BrowserRealm__dom(
    tree: *const c_void, op: u32, id: u32,
    a: *const u8, a_len: usize, b: *const u8, b_len: usize,
) -> NativeResult {
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        if tree.is_null() || (a_len != 0 && a.is_null()) || (b_len != 0 && b.is_null()) {
            return Err("native DOM callback received a null argument".to_owned());
        }
        // SAFETY: C++ stores the address of the Arc field in the VM-owned
        // stable Entry and only calls it while that entry/context is alive.
        let tree = unsafe { &*tree.cast::<Arc<DomTree>>() }.as_ref();
        let a = if a_len == 0 { &[] } else { unsafe { core::slice::from_raw_parts(a, a_len) } };
        let b = if b_len == 0 { &[] } else { unsafe { core::slice::from_raw_parts(b, b_len) } };
        let a = core::str::from_utf8(a).map_err(|_| "DOM argument must be valid UTF-8".to_owned())?;
        let b = core::str::from_utf8(b).map_err(|_| "DOM argument must be valid UTF-8".to_owned())?;
        let node = |id: u32| -> Result<NodeId, String> {
            let node = NodeId::new(id);
            tree.with_node(node, |_| ()).map(|_| node).ok_or_else(|| "DOM node ID does not belong to this document".to_owned())
        };
        let json = match op {
            0 => {
                let ids = tree.query_selector_all(a).map_err(|error| format!("Invalid selector: {error}"))?;
                let mut output = String::from("[");
                for (index, id) in ids.iter().enumerate() {
                    if index != 0 { output.push(','); }
                    output.push_str(&id.raw().to_string());
                }
                output.push(']');
                output
            }
            1 => json_string(&tree.outer_html(if id == u32::MAX { tree.document() } else { node(id)? })),
            2 => json_string(&tree.text_content(if id == u32::MAX { tree.document() } else { node(id)? })),
            3 => {
                let node = node(id)?;
                let is_html = tree.with_node(node, |node| {
                    node.as_element().is_some_and(|element| <_ as AsRef<str>>::as_ref(&element.ns) == "http://www.w3.org/1999/xhtml")
                }).unwrap_or(false);
                let name = if is_html { a.to_ascii_lowercase() } else { a.to_owned() };
                match tree.with_node(node, |node| node.get_attribute(&name).map(str::to_owned)).flatten() {
                    Some(value) => json_string(&value), None => "null".to_owned(),
                }
            }
            4 => {
                let node = node(id)?;
                let is_html = tree.with_node(node, |node| {
                    node.as_element().is_some_and(|element| <_ as AsRef<str>>::as_ref(&element.ns) == "http://www.w3.org/1999/xhtml")
                }).unwrap_or(false);
                let name = if is_html { a.to_ascii_lowercase() } else { a.to_owned() };
                if name.is_empty() || name.chars().any(|ch| ch.is_whitespace() || matches!(ch, '\0' | '"' | '\'' | '>' | '/' | '='))
                    || !tree.with_node(node, |node| node.is_element()).unwrap_or(false) {
                    return Err("setAttribute expects an element and a valid attribute name".to_owned());
                }
                let old_id = if name == "id" { tree.with_node(node, |n| n.get_attribute("id").map(str::to_owned)).flatten() } else { None };
                tree.with_node_mut(node, |n| n.set_attribute(&name, b.to_owned()));
                if name == "id" { tree.update_id_index(node, old_id.as_deref(), Some(b)); }
                "null".to_owned()
            }
            _ => return Err("unknown DOM operation".to_owned()),
        };
        Ok::<_, String>(json)
    }));
    let (status, bytes) = match result {
        Ok(Ok(value)) => (0, value.into_bytes()),
        Ok(Err(error)) => (1, json_string(&error).into_bytes()),
        Err(_) => (2, b"\"native DOM operation panicked\"".to_vec()),
    };
    let boxed = bytes.into_boxed_slice();
    let length = boxed.len();
    NativeResult { bytes: Box::into_raw(boxed).cast::<u8>(), length, status }
}

#[unsafe(no_mangle)]
pub(crate) unsafe extern "C" fn Bun__BrowserRealm__free_dom_bytes(bytes: *mut u8, length: usize) {
    if !bytes.is_null() {
        // SAFETY: returned by the callback above with the same length.
        unsafe { drop(Box::from_raw(core::ptr::slice_from_raw_parts_mut(bytes, length))) };
    }
}
