---
name: bun-core-classes-ts-bindings
description: "The .classes.ts → generate-classes.ts → ZigGeneratedClasses.cpp + generated_classes.rs pipeline, #[JsClass] Rust side, generated symbol names, and two end-to-end examples (Glob, CronJob); plus hand-written C++ class pattern"
metadata:
 type: reference
---

# JS classes backed by Rust: the `.classes.ts` pipeline

## Pipeline
- **Inputs**: `src/**/X.classes.ts` files calling `define({...})`. The schema is `src/codegen/class-definitions.ts`.
- **Generator**: `src/codegen/generate-classes.ts`, which runs automatically during `bun bd`. It emits:
 - C++: `build/debug/codegen/ZigGeneratedClasses.{h,cpp}` plus IsoSubspace headers. Each class `JS<T> : JSC::JSDestructibleObject` holds `void* m_ctx`, uses `subspaceFor` with `BUN_SUBSPACE_SLOTS`, and has a prototype and constructor.
 - Rust: `generated_classes.rs`, included in bun_runtime as `crate::generated_classes` (see also `src/runtime/generated_classes.rs`).

## class-definitions.ts options (main ones)
- **Wiring**
 - `name`: the JS class name.
 - `rustPath`: the Rust type path.
 - `sharedThis`: methods get `&self`, not `&mut self`.
- **Construction**: `construct`, `constructNeedsThis`, `call`, `noConstructor`.
- **Lifetime**
 - `finalize`: the Rust side gets an owned `Box<Self>`.
 - `refCounted`: the wrapper holds one ref; finalize gets `&self` and the codegen then derefs.
 - `hasPendingActivity`: called on the GC thread, so read only atomics.
- **Members**
 - `klass`: static members.
 - `proto`: entries of fn, getter, setter, `cache: true`, `builtin`, `privateSymbol`, `length`.
 - `values: [...]` and `valuesArray`: WriteBarrier slots on the JS wrapper.
- **Other**: `JSType: "0b11101110"`, `estimatedSize`, `memoryCost`, `isEventEmitter`, `structuredClone`, `inspectCustom`.

## Generated symbols (extern ABI; T is the class name)
- **Lifecycle**: `${T}Class__construct`, `${T}Class__finalize`, `${T}__hasPendingActivity`, `${T}__ZigStructSize`.
- **Prototype members**: `${T}Prototype__${fn}`, plus `${T}Prototype__${field}SetCachedValue` and `GetCachedValue` for cached slots.
- **Wrapper access**: `${T}__fromJS`, `${T}__fromJSDirect`, `${T}__create`, `${T}__getConstructor`, `${T}__dangerouslySetPtr`.
- Rust thunks are wrapped in `bun_jsc::jsc_host_abi!` with `#[unsafe(no_mangle)]`.
 - Example: `GlobPrototype__match(this:&Glob..)` calls `host_fn::host_fn_this_shared(this, global, callframe, |t,g,c| Glob::r#match(t,g,c))`.
- **`pub mod js_${T}`** provides `from_js`, `from_js_direct`, `get_constructor`, `to_js` and `detach_ptr`.
 - `to_js` **transfers ownership** of the Box or the ref to the wrapper. Do not ref again (src/CLAUDE.md).
- **`#[bun_jsc::JsClass]`** (options `no_constructor`, `no_finalize`, `estimated_size`) binds those externs and implements the `JsClass` trait (`to_js`, `from_js`...).

## Example 1: Glob (owned Box, pending activity)
- **Definition**: `src/runtime/api/Glob.classes.ts` sets `construct`, `finalize` and `hasPendingActivity`.
 - Proto `scan`/`scanSync` are `builtin` (JS in src/js); their internal natives `__scan`/`__scanSync` use `privateSymbol` (pull, resolveSync).
 - `match` is a plain fn.
- **Rust**: `src/runtime/api/glob.rs`.
 ```rust
 #[bun_jsc::JsClass]
 pub(crate) struct Glob { pattern: Box<[u8]>, has_pending_activity: AtomicUsize }
 pub(crate) fn constructor(global_this: &JSGlobalObject, callframe: &CallFrame) -> JsResult<Box<Glob>>
 pub(crate) fn has_pending_activity(&self) -> bool // GC thread: atomics only
 ```
 Methods take `&self` because of `sharedThis`.

## Example 2: CronJob (refCounted, cached values, no constructor)
- **Definition**: `src/runtime/api/cron.classes.ts` sets `noConstructor` and `refCounted`.
 - Proto: `stop`, `@@dispose`, `ref` mapped to `doRef`, `unref` mapped to `doUnref`.
 - Getter `cron` with `cache: true`.
 - `values: ["callback", "pendingPromise"]`.
- **Rust**: `src/runtime/api/cron.rs`, around line 1370.
 ```rust
 #[bun_jsc::JsClass(no_constructor)]
 #[derive(bun_ptr::CellRefCounted)]
 #[repr(align(16))]
 pub(crate) struct CronJob {
 ref_count: Cell<u32>
 self_ref: Cell<BackRef<CronJob, bun_ptr::Root>>
 event_loop_timer: JsCell<EventLoopTimer>
 global: GlobalRef
 poll_ref: JsCell<KeepAlive>
 this_value: JsCell<JsRef>
 /* ... */
 }
 #[bun_jsc::host_fn(method)] pub(crate) fn stop(&self, _g: &JSGlobalObject, f: &CallFrame) -> JsResult<JSValue>
 #[bun_jsc::host_fn(getter)] fn get_cron(_this: &Self, _g: &JSGlobalObject) -> JsResult<JSValue>
 pub(crate) mod js { bun_jsc::codegen_cached_accessors!("CronJob"; callback, cron, pendingPromise); }
 // usage: js::callback_get_cached(js_this), js::pending_promise_set_cached(js_this, &global, v)
 ```
- The generated finalize goes through `host_fn_finalize_ref_counted`.
- The wrapper JSValue is kept in `this_value: JsCell<JsRef>`. It is strong while a timer is armed and weak while idle; see `bun-core-gc-lifetimes`.

## Rules (from the implementing-jsc-classes-rust skill)
- **Never store a raw `JSValue` field.** Use `values` cached slots, `JsRef`, or `Strong`.
- **Hook signatures**
 - `constructor(&JSGlobalObject, &CallFrame) -> JsResult<Box<Self>>`
 - method `(&self, &JSGlobalObject, &CallFrame) -> JsResult<JSValue>`
 - getter `(&self, &JSGlobalObject) -> JsResult<JSValue>`
 - setter `(&self, &JSGlobalObject, JSValue) -> JsResult<bool>`
 - finalize `(self: Box<Self>)`, or `(&self)` when the class is refCounted.
- **Interior mutability**: with `sharedThis`, put fields that change after construction in `Cell` or `JsCell`.
- Traits `JsFinalize` (default `drop(Box)`) / `JsFinalizeRefCounted` (default no-op `&self`) are blanket impls in `src/jsc/lib.rs:1494`; thunks `host_fn_finalize` / `host_fn_finalize_ref_counted` in `src/jsc/host_fn.rs:624`. (Skill fixed 2026-10-08: the old `bun_ptr::finalize_js_box` reference no longer exists.)

## Hand-written C++ classes (implementing-jsc-classes-cpp skill)
- **Classes**: `Foo : JSC::JSDestructibleObject` (when it has C++ fields), `FooPrototype : JSNonFinalObject`, `FooConstructor : InternalFunction`.
- **Properties**: `HashTableValue` tables with `reifyStaticProperties`. Put `#include "root.h"` first.
- **IsoSubspaces**: declare slots in `src/jsc/bindings/webcore/DOMClientIsoSubspaces.h` and `DOMIsoSubspaces.h`. The subspaces are created only in `BunClientData.cpp` `subspaceForImplSlow`, which `test/internal/source-lints/iso-subspace-creation.test.ts` checks.
- **Structure caching**: `LazyClassStructure` in `ZigGlobalObject.h/.cpp`, with `initLater` and `.visit(visitor)`. REVIEW.md, however, says to add no new ZigGlobalObject fields and no new code in the monolithic `bindings.cpp`.
- **Exposing to Rust**: `extern "C" EncodedJSValue Bun__Foo__toJS(Zig::GlobalObject*, Foo*)`; add `[[ZIG_EXPORT(...)]]` so cppbind generates the Rust import.
- **Throwing in C++**: `DECLARE_THROW_SCOPE(vm)`, `RETURN_IF_EXCEPTION`, `Bun::throwThisTypeError`.

Related: `bun-core-jsc-rust-api`, `bun-core-gc-lifetimes`.
