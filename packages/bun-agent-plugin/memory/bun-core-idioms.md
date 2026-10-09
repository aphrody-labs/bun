---
name: bun-core-idioms
description: "Zig→Rust port heritage and house idioms in Bun's Rust code — naming, Zig-to-Rust mappings, unsafe/SAFETY discipline, error propagation, review rules from REVIEW.md and src/CLAUDE.md, common traits/macros"
metadata:
 type: reference
---

# Idioms and port heritage in Bun's Rust

## Zig port heritage
- The Rust tree is a port of the earlier Zig codebase. Many comments cite the Zig original (`bun.foo.bar`, `defer x.deinit`) and a `docs/PORTING.md` that is **not in the repo**.
- Marker comments you will see: `MOVE_DOWN`, `Note: reshaped for borrowck`, `R-2 noalias mitigation`, `PORT NOTE`, `§Dispatch`, `§Forbidden`.
- **Zig to Rust mapping**
 | Zig | Rust |
 |---|---|
 | `Maybe(T)` with `.result`/`.err` | `bun_sys::Maybe<T>` = `Result<T, sys::Error>` with `?` |
 | `bun.JSError!T` | `JsResult<T>` (`JsError::{Thrown, OutOfMemory, Terminated}`) |
 | `bun.handleOom(x)` | `bun_core::handle_oom(x)` / `.unwrap_or_oom` |
 | `bun.Output.scoped(.X.hidden)` | `declare_scope!(X, hidden)` + `scoped_log!(X..)` / `define_scoped_log!` |
 | `bun.String` | `bun_core::String` (Clone=ref, Drop=deref) |
 | `[:0]const u8` | `&ZStr` (`zstr!` literal), `ZBox` owned |
 | `bun.FD` | `bun_core::Fd` |
 | `bun.default_allocator` | mimalloc global, `bun_alloc::default_alloc` for C-shared memory |
 | `defer x.deinit` | Drop / RAII guard |
 | `jsc.Strong` / `JSRef` | `bun_jsc::Strong` / `JsRef` |
 | `@fieldParentPtr` | `container_of`, `from_field_ptr!`, `impl_field_parent!`, `intrusive_field!` (bun_core) |
 | `bun.Environment.isDebug` | `bun_core::env::IS_DEBUG` |
 | `bun.getenvZ` / feature flag | `bun_core::env_var::NAME::get` |
- **Naming**
 - Constructors are often `Type::init`; the lint `self_named_constructors` is allowed.
 - Some files keep PascalCase names (`ErrorCode.rs`, `VirtualMachine.rs`) and are mapped with `#[path]`.
 - Extern symbols follow the Zig ABI: `Bun__X__y`, `${T}Prototype__fn`, `JSC__JSGlobalObject__throwTerminationException`.
 - Reserved identifiers are written `r#match`.

## Unsafe discipline
- Every `unsafe {}` block needs a `// SAFETY:` comment (lint `undocumented_unsafe_blocks`, which is deny). Every `unsafe fn` needs a `# Safety` doc section.
- Pointer casts use `.cast`, `ptr::from_ref` and `ptr::from_mut`. Plain `as` pointer casts and `&x as *const _` are denied (`ptr_as_ptr`, `ref_as_ptr`, `borrow_as_ptr`).
- **No `mem::forget`.** Use `ManuallyDrop` or `heap::into_raw`/`take`.
- **No `mem::zeroed`.** Use `bun_core::ffi::zeroed_unchecked` with a SAFETY note.
- **FFI provenance** (src/CLAUDE.md): derive pointers from the owning allocation; never round-trip through `usize` when a pointer will do.
- Opaque C++ types are declared with `bun_opaque::opaque_ffi! { pub struct X; }` and only ever used behind `&X`.
- Statics shared with C must assert their layout: `assert_ffi_layout!(T, size, align)` and `const _: = assert!(size_of::<..> == ..)`.

## Error handling patterns
- **Host fns** return `JsResult<JSValue>`.
 - Throw with `return Err(global.throw_*(..))` or `global.err(ErrorCode::X, format_args!(..)).throw`.
 - Convert `sys::Error` with `ErrorJsc::to_js`.
- **Panics never cross FFI**: host fns are wrapped in `catch_unwind` by the macros. Never `.unwrap` on user input, and never return `todo!`/`unimplemented!` (both are denied).
- **OOM** goes to `out_of_memory -> !`. Never propagate allocation failure into a JS exception, except through `throw_out_of_memory`.
- **ABI boundary**: only `HostReturn::or_pending_exception` may turn a JsResult into a raw JSValue.

## REVIEW.md: things that block merges (native side)
- **Exceptions**
 - Check after every call that can run JS (getters, `call`, `to_string`, iteration).
 - Never `clear_exception` to hide an error.
 - Validate with `BUN_JSC_validateExceptionChecks=1`.
- **GC**: root or copy any JSValue kept past the current call (`bun-core-gc-lifetimes`).
- **Threads and refcounts**: thread affinity, balanced refcounts, and RAII guards at the acquisition site.
- **Per-VM state** lives on `VirtualMachine`/`RareData`. No new globals or thread_locals, and no new `ZigGlobalObject` fields or code in the monolithic `bindings.cpp`.
- **Code hygiene**
 - Comments must explain *why*. Comments that restate the code get deleted, and so does dead code (which is also denied by lint).
 - CLAUDE.md rule 13: if a workaround needs a paragraph to justify it, fix the code instead.
- **Tests** live next to existing coverage in `test/js/...`. Run `bun bd test <file>`; the test must fail with `USE_SYSTEM_BUN=1`.

## Common traits and macros cheat-sheet
- **bun_core**
 - Strings and FFI: `zstr!`, `assert_ffi_layout!`.
 - Logging: `declare_scope!`, `scoped_log!`, `define_scoped_log!`.
 - Output: `pretty!`, `prettyln!`, `pretty_errorln!`, `note!`, `warn!`.
 - Other: `enum_unwrap!`, `from_field_ptr!`, `impl_field_parent!`, `intrusive_field!`, the `UnwrapOrOom` trait.
- **bun_alloc**: `oom_from_alloc!`, `bss_singleton!`.
- **bun_sys**: `syslog!`, `dlsym_with_handle!`; traits `FdExt`, `ErrorJsc` (sys_jsc), `FdJsc`.
- **bun_ptr**: `#[derive(CellRefCounted)]`, `#[ref_count(destroy=..)]`; traits `RefCounted`, `ThreadSafeRefCounted`, `AnyRefCounted`.
- **bun_jsc**
 - Attributes: `#[host_fn]`, `#[host_fn(method|getter|setter|static)]`, `#[JsClass(..)]`.
 - Macros: `codegen_cached_accessors!`, `jsc_host_abi!`, `jsc_promise_handler!`, `top_scope!`, `src!`.
 - Traits: `JsClass`, `Taskable`, `StringJsc` (bun_string_jsc), `JsCellRefExt`.
- **bun_io**: `impl_streaming_writer_parent!`. **uws**: `#[uws_callback]`.

## Workflow reminders
- **Build**: `bun bd` (debug build; never set a timeout). Test with `bun bd test <file>` and never plain `bun test`.
- **Cross-target type-check**: `bun run rust:check-all` covers linux, macos and windows on x64 and aarch64; needed because cfg-gated code is otherwise unchecked.
- **Debug logs**: `BUN_DEBUG_QUIET_LOGS=1` silences them; `BUN_DEBUG_<SCOPE>=1` turns one scope on.
- **Codegen**: `.classes.ts`, `ErrorCode.ts` and `` are regenerated automatically by the build.
- **Branches**: names must start with `claude/` for CI.

Related: `bun-core-crate-map`, `bun-core-strings-fmt-output`, `bun-core-sys-syscalls`, `bun-core-jsc-rust-api`, `bun-core-event-loop`.
