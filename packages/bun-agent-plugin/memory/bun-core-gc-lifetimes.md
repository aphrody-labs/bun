---
name: bun-core-gc-lifetimes
description: "Keeping JS values and native objects alive correctly in Bun Rust — Strong/StrongOptional/Weak/JsRef, refcount types (RefPtr, CellRefCounted, ThreadSafeRefCount), BackRef/JsCell/ThisPtr, JSC GC rules (write barriers, extra memory, pending activity), threading affinity"
metadata:
 type: reference
---

# GC, handles, refcounts, lifetimes

## JS handles (src/jsc/Strong.rs, Weak.rs, JSRef.rs)
- **`Strong`**: `Strong::create(value, global)`, `get`, `set`. It is a GC root (HandleSlot) released on Drop. It is !Send: create and drop it only on the JS thread.
- **`StrongOptional`**: `has`, `swap`, `try_swap`, `clear_without_deallocation`.
- **`Weak<T>`**: `create`, `create_passive`, `get`, `clear` (JSC::Weak with an optional finalizer context).
- **`JsRef`**, the default way a native object holds its own JS wrapper
 - Definition: `enum JsRef { Weak(JSValue), Strong(Strong), Finalized }`.
 - Methods: `init_weak`, `init_strong`, `empty`, `try_get`, `get`, `set_weak`, `set_strong`, `upgrade` (to strong while busy), `downgrade` (to weak while idle), `finalize`, `update`, `is_strong`.
 - The pattern is "strong while busy, weak while idle", e.g. while a timer, request or socket is pending. It is preferred over `hasPendingActivity`.
- **Never** store a raw `JSValue` in a heap struct: the GC cannot see it.
 - Use a `values:` cached slot (written with WriteBarrier, via `codegen_cached_accessors!`), `JsRef`, or `Strong`.
 - REVIEW.md: root or copy every JSValue held beyond the current call.
- **Stack values**: `JSValue::ensure_still_alive` keeps a value alive across native code that does not mention it.
- **Avoid `protect`/`gcProtect`.** They are leak-prone global counts.

## JSC GC facts (javascriptcore-garbage-collector skill)
- **Collector**: Riptide, which is concurrent and generational. C++ cells reference others via `WriteBarrier<>` and trace them in `visitChildren`.
- **Liveness tools**: output constraints (`BunGCOutputConstraint.cpp`), opaque roots, and `JSC::Weak` with a `WeakHandleOwner`.
- **External memory**: use `reportExtraMemoryAllocated` together with `reportExtraMemoryVisited` (both halves are required), or `memoryCost`/`estimatedSize` in `.classes.ts`.
- **`hasPendingActivity`** runs on the GC thread concurrently, so read only atomics (for example `AtomicUsize` as in Glob).
- **Debug env vars**: `BUN_JSC_collectContinuously=1`, `BUN_JSC_useConcurrentGC=0`, `BUN_JSC_scribbleFreeCells=1`, `BUN_JSC_verifyGC=1`, `BUN_JSC_logGC=1`.
- **CLAUDE.md rule 15**: the conservative stack scanner is never the root cause. Find the real retainer (a WriteBarrier, Strong, protect, missing deref, pending activity or closure).

## Refcounting (src/ptr/ref_count.rs)
- **Single-threaded intrusive**: `RefCounted` and `RefCount<T>`.
- **Atomic**: `ThreadSafeRefCounted` and `ThreadSafeRefCount<T>`.
- **`unsafe trait CellRefCounted`** with `#[derive(bun_ptr::CellRefCounted)]` uses a bare `ref_count: Cell<u32>` field. `#[ref_count(destroy = Self::fn)]` sets a custom destroy. This is what `refCounted` .classes.ts types use.
- **`AnyRefCounted`** abstracts over all of these.
- **`RefPtr<T>`** is an owned +1 ref with `into_raw`/`from_raw`. A debug canary catches use-after-destroy.
- **Ownership transfer rule** (src/CLAUDE.md): `to_js` and the `create` constructors adopt the ref you pass. Do not `ref` again.
- **RAII**: take the guard at the acquisition site and never pair ref/deref manually across branches. REVIEW.md requires balanced refcounts.
- **Arenas**: values in an `Arena` are not dropped on reset; release refs explicitly first.

## Non-owning pointers (bun_ptr)
- **`BackRef<T, P = Shared|Mut|Root>`** points to a parent that strictly outlives the holder; safe Deref is backed by that invariant. `Root` marks a self-reference such as `CronJob.self_ref`.
- **Other wrappers**
 - `ParentRef`, `ThisPtr<T>`, `DetachablePtr`, `RawRefCount`.
 - `WeakPtr` (native weak, not JSC).
 - `CowSlice`, `RawSlice`, `TaggedPtr`.
 - `detach_lifetime`: an explicit escape hatch with a SAFETY comment.
- **`JsCell<T>`** (src/ptr/js_cell.rs) is an `UnsafeCell` wrapper.
 - `with_mut(|v| ..)` is safe; `get_mut` is unsafe.
 - Use it for fields of `&self` (sharedThis) classes and of `VirtualMachine` that change after init. It is sound only because a single JS thread owns them, so re-entrancy is the only hazard. Do not hold a `with_mut` borrow across a call that can enter JS.

## Thread affinity
- **One VM per thread.** `VirtualMachine` is deliberately !Send/!Sync, enforced at compile time.
 - `VirtualMachine::get` returns `&'static` from TLS `VM`; `get_or_null` returns None off a JS thread.
 - Other threads post work through `ConcurrentTask` or the `VmHandle`/`Ticket` APIs (`bun-core-event-loop`).
- **Thread checks**: `bun_safety::ThreadLock` asserts an owning thread in debug builds. `JsThread<'_>` is a proof token obtained via `global.js_thread_of_caller(frame)`.
- **Strings across threads**: `thread_isolated_copy`/`make_thread_shareable` (`bun-core-strings-fmt-output`).
- **Per-VM state** belongs on `VirtualMachine` or `RareData` (`vm.rare_data`), never in a `static` or a thread_local (REVIEW.md).

## Finalization
- **`.classes.ts` finalize**
 - Owned classes receive `Box<Self>`; drop it, or detach it if a pending op still uses it.
 - refCounted classes receive `&self`. Call `this_value.finalize` and let the codegen deref.
- **Timing**: finalizers run during GC sweep on the JS thread. Do not call into JS or allocate JS objects there.
- **Keep-alives**: KeepAlive (`bun_io::KeepAlive`, `ref_`/`unref`) keeps the *event loop* alive, not the object. Pair it with `JsRef::upgrade` when both are needed.

Related: `bun-core-classes-ts-bindings`, `bun-core-jsc-rust-api`, `bun-core-event-loop`.
