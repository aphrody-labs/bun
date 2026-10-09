---
name: bun-core-jsc-rust-api
description: "bun_jsc Rust API for touching JavaScriptCore — JSValue, JSGlobalObject, CallFrame, JsResult/JsError, host_fn adapters & ABI, exception scopes, cpp.rs ZIG_EXPORT bindings, ErrorCode/$ERR_* pipeline"
metadata:
 type: reference
---

# bun_jsc: the Rust-side JSC API (src/jsc/)

## Core types
- **`JSValue`** (src/jsc/JSValue.rs) is `#[repr(transparent)] struct JSValue(pub usize, PhantomData<*const >)`, an EncodedJSValue that is !Send.
 - Constants: `ZERO` (empty, meaning "exception pending" at the ABI), `UNDEFINED`, `NULL`, `TRUE`, `FALSE`.
 - Property and call access
 - `get(global, "prop") -> JsResult<Option<JSValue>>` and `get_if_property_exists`.
 - `call(global, this, &[JSValue]) -> JsResult<JSValue>`.
 - Conversions
 - `to_bun_string(global)?`, `to_utf8(global)?` (gives `Utf8Bytes<'static>`) and `to_js_string_view`.
 - `as_::<T: JsClass> -> Option<*mut T>` and `as_class_ref` (downcast to a native class).
 - GC helpers: `ensure_still_alive`, `protect`/`unprotect`/`protected`. Avoid protect; see `bun-core-gc-lifetimes`.
 - Builders and checks: `js_number`, `create_empty_object`, and the `is_*` predicates.
- **`JSGlobalObject`** (src/jsc/JSGlobalObject.rs) is declared with `bun_opaque::opaque_ffi! { pub struct JSGlobalObject; }`. It is always borrowed as `&JSGlobalObject`.
 - Throwing (each returns a `JsError` you `return Err(..)`):
 - `throw(format_args!)`, `throw_value`, `throw_type_error`, `throw_range_error`.
 - Argument errors: `throw_invalid_arguments`, `throw_invalid_argument_type_value(argname, typename, value)`, `throw_not_enough_arguments`.
 - Other: `throw_out_of_memory`, `throw_dom_exception`.
 - Creating errors: `create_error_instance(format_args!)` and `create_type_error_instance`.
 - Pending exceptions: `has_exception`, `take_exception`, `clear_exception` (REVIEW.md: never clear blindly).
 - Node-style coded errors use `global.err(ErrorCode::ERR_INVALID_ARG_VALUE, format_args!(..))`, which returns an `ErrorBuilder` with `.throw`, `.to_js` or `.reject`. Both the `ErrorCode::INVALID_STATE` and `ErrorCode::ERR_INVALID_STATE` aliases exist.
 - VM access: `bun_vm -> &'static VirtualMachine` and `vm` (the JSC VM).
 - Storing a global in a struct: use `GlobalRef(BackRef<JSGlobalObject>)`.
- **`CallFrame`** (src/jsc/CallFrame.rs)
 - Methods: `arguments`, `arguments_as_array::<N>`, `argument(i)` (gives `undefined` when out of range), `arguments_undef::<MAX>`, `this`, `callee`.
 - `ArgumentsSlice::init(vm, slice)` with `next_eat` for sequential parsing.

## Errors and results
- `pub type JsResult<T> = Result<T, JsError>`, where `JsError` (in bun_core) is `Thrown | OutOfMemory | Terminated`.
 - `Err(Thrown)` means a JS exception is pending on the VM; it carries no payload.
 - `?` propagates it.
- **Converting `JsResult<JSValue>` to a raw `JSValue` for the ABI**: only `HostReturn::or_pending_exception` is allowed. `unwrap_or(JSValue::ZERO)` is banned by a source lint.
- `ThrowFmtArgs` is used for formatted throws.

## Host functions (src/jsc/host_fn.rs)
- **ABI**
 - `JsHostFn` is `unsafe extern "sysv64"` on Windows x64 and `extern "C"` elsewhere (JSC_CALLING_CONVENTION).
 - The `jsc_host_abi!` macro writes such functions; `jsc_promise_handler!` writes promise reaction handlers.
- **Rust-side signature**: `JsHostFnZig = fn(&JSGlobalObject, &CallFrame) -> JsResult<JSValue>`.
- **Adapters**
 - `to_js_host_call` wraps the call in an ExceptionValidationScope and asserts that an empty return happens exactly when an exception is pending.
 - `from_js_host_call` (zero means throw) and `from_js_host_call_generic` (check_slow).
 - For generated classes: `host_fn_this`, `host_fn_this_shared`, `host_fn_getter(_shared)`, `host_fn_setter`, `host_fn_static`, `host_fn_construct(_this)`, `host_fn_lazy`, `host_fn_finalize`, `host_fn_finalize_ref_counted`.
 - `__macro_support::host_fn_result` adds a `catch_unwind` barrier, because panics must not unwind into C++.
- **Proc macros** (src/jsc_macros/lib.rs, re-exported by bun_jsc)
 - `#[bun_jsc::host_fn]` covers a free fn; `#[bun_jsc::host_fn(method)]`, `(getter)`, `(setter)` and `(static)` cover class members.
 - Also: `host_call`, `#[bun_jsc::JsClass]`, `codegen_cached_accessors!`, `JsAffine`.

## Exception scopes (src/jsc/TopExceptionScope.rs)
- **Declaring**: `top_scope!(scope, global)` declares an address-stable scope (it must not move).
- **Methods**: `scope.return_if_exception?`, `exception`, `err_for_pending`, `clear_exception_except_termination`.
- **`src!`** builds the `SourceLocation` that the validation scopes use.
- **Rule** (REVIEW.md): check for an exception after every call that can enter JS. Verify with `BUN_JSC_validateExceptionChecks=1 BUN_JSC_dumpSimulatedThrows=1 bun bd ...`.

## C++ bindings: src/jsc/cpp.rs
- `include!`s the generated `${BUN_CODEGEN_DIR}/cpp.rs`, which `src/codegen/cppbind.ts` produces from C++ functions marked `[[ZIG_EXPORT(mode)]]`.
- The mode is one of `nothrow`, `zero_is_throw`, `false_is_throw`, `null_is_throw`, `check_slow`. The generated wrapper returns `JsResult` according to the mode.
- New code should call `crate::cpp::Foo__bar(...)` and not redeclare `extern "C"` blocks by hand.

## ErrorCode and $ERR_* pipeline
- **Source**: `src/jsc/bindings/ErrorCode.ts` holds entries like `["ERR_INVALID_ARG_TYPE", TypeError]`, with an optional name or extra prototypes. Add new codes here only.
- **Generator**: `src/codegen/generate-node-errors.ts` emits
 - `ErrorCode+List.h` and `ErrorCode+Data.h` (C++)
 - `ErrorCode.generated.rs`, included by `src/jsc/ErrorCode.rs` as `ErrorCode(pub u16)` constants
 - `ErrorCode.d.ts` (`declare function $ERR_X(...)` for the builtin JS).
- **Call sites**
 - Builtin TS (`src/js/**`): `throw $ERR_INVALID_ARG_TYPE("cb", "function", callback)` (see src/js/node/fs.ts).
 - C++: `Bun::ERR::INVALID_ARG_TYPE(throwScope, globalObject...)` (`src/jsc/bindings/ErrorCode.cpp`, around line 845) or `Bun::throwError(globalObject, scope, code, message)`.
 - Rust: `global.err(ErrorCode::X, format_args!(..)).throw`, which goes through `Bun__createErrorWithCode`.

## Other re-exports from bun_jsc (src/jsc/lib.rs)
- Handles: `Strong`, `StrongOptional`, `Weak`, `WeakRefType`, `JsRef`, `JsCellRefExt` (`bun-core-gc-lifetimes`).
- Values and errors: `MarkedArgumentBuffer`, `JSPromise`, `SystemError`, `ConsoleObject`, `ErrorBuilder`.
- Tasks: `Task`, `Taskable`, `task_tag` (from bun_event_loop, `bun-core-event-loop`).
- `JsThread<'_>`, obtained via `global.js_thread_of_caller(frame)`, is a token proving you are on the JS thread.

## Typical host fn
```rust
#[bun_jsc::host_fn]
pub fn js_foo(global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
 let [a, b] = frame.arguments_as_array::<2>;
 if !a.is_string { return Err(global.throw_invalid_argument_type_value(b"a", b"string", a)); }
 let s = a.to_bun_string(global)?; // String, Drop derefs
 let r = b.call(global, JSValue::UNDEFINED, &[a])?;
 Ok(r)
}
```

Related: `bun-core-classes-ts-bindings`, `bun-core-gc-lifetimes`, `bun-core-strings-fmt-output`.
