---
name: bun-core-crate-map
description: "Map of Bun's Rust foundation crates (bun_core, bun_alloc, bun_sys, paths, collections, threading, ptr, safety, jsc, event_loop, io, uws_sys), their tiers and the lints and disallowed-std rules that govern them"
metadata:
 type: reference
---

# Bun Rust workspace: foundation crate map

Workspace root: `<bun>\Cargo.toml`. It lists about 100 members, uses edition 2024 and resolver 2.
Most crates live at `src/<name>/` and are named `bun_<name>`. Sibling `*_jsc` crates (for example `src/sys_jsc`, `src/http_jsc`, `src/css_jsc`, `bun_string_jsc`) add JS conversions through extension traits, so the lower crate never depends on JSC.

## Tiers (lowest first; a crate may only depend downward)
- **T0**
 - `bun_core` (`src/bun_core/lib.rs`, about 3k lines): String, strings, fmt, output, env, env_var, feature_flags, heap, util (ZStr, Fd).
 - `bun_alloc` (`src/bun_alloc/lib.rs`): mimalloc global allocator, arenas, AllocError.
- **Small T0/T1 utility crates**: `bun_ptr`, `bun_collections`, `bun_threading`, `bun_safety`, `bun_paths`, `bun_errno`, `bun_wyhash`, `bun_opaque`.
- **T1**: `bun_sys` (`src/sys/lib.rs`, about 10k lines) wraps the syscalls. Its platform modules are `windows/` (mod.rs, about 2.1k lines), `sys_uv`, `posix`, `linux` and `darwin`.
- **Mid tiers**: `bun_event_loop` (`src/event_loop/`), `bun_io` (`src/io/`), `bun_uws_sys` (`src/uws_sys/`).
- **T6**
 - `bun_jsc` (`src/jsc/`): JSValue, JSGlobalObject, VirtualMachine, EventLoop, host_fn.
 - `bun_runtime` (`src/runtime/`) is the crate-graph root. It owns `dispatch.rs`, `generated_classes.rs`, `bin_entry/` and every API.
- `bun_jsc_macros` (`src/jsc_macros/lib.rs`) is a proc-macro crate. It provides `#[host_fn]`, `#[JsClass]`, `host_call`, `codegen_cached_accessors!`, `JsAffine` and `#[uws_callback]`.

## Hoisted dispatch (link-time, no registration)
- Low tiers declare `extern "Rust"` functions, for example `__bun_tick_queue_with_count` and `__bun_run_immediate_task`. `bun_runtime` defines them with `#[no_mangle]`.
- `src/runtime/dispatch.rs` defines:
 - `run_task`: about 96 `Task` variants.
 - `run_file_poll`: the `bun_io::FilePoll` owners.
- Steps to add a task type:
 1. Add a tag constant in `bun_event_loop::task_tag` (`src/event_loop/ConcurrentTask.rs`).
 2. `impl Taskable for T`, which sets `const TAG`, `unsafe fn release_unrun` and `context`.
 3. Add arms in `run_task` and `__bun_release_task_unrun`.
 4. Bump the `task_tag::COUNT` assertion.
- See `bun-core-event-loop`.

## Process entry
- `src/runtime/bin_entry/mod.rs` defines `#[unsafe(no_mangle)] unsafe extern "C" fn main(argc, argv)`. Startup order:
 1. `bun_core::init_argv`
 2. `bun_crash_handler::init`
 3. `use_mimalloc_in_dependencies` (ICU and the other hooks)
 4. SIGPIPE/SIGXFSZ set to SIG_IGN (unix)
 5. Windows only: `convert_env_to_wtf8`
 6. `output::stdio::init` and `flush_guard`
 7. `pregrow_fd_table` (linux)
 8. `StackCheck::configure_thread`
 9. `ParentDeathWatchdog::install`
 10. `crate::cli::Cli::start`
 11. `Global::exit(0)`
- `bin_entry/mod.rs` also holds the ASAN/LSAN default options.
- `bin_entry/c_abi_exports.rs` exports `Bun__panic` and `Bun__outOfMemory` to C/C++.

## Workspace lints (`[workspace.lints]` in Cargo.toml)
- **Warnings are denied.** The following are also deny:
 - `dead_code` and `unreachable_pub`: use `pub(crate)` unless an item is used from another crate.
 - Clippy: `undocumented_unsafe_blocks` (every `unsafe` needs `// SAFETY:`), `mem_forget`, `ptr_as_ptr`, `ref_as_ptr`, `borrow_as_ptr`, `redundant_clone`, `large_stack_frames`, `needless_pass_by_value`, `todo`, `unimplemented`, `dbg_macro`.
- **Allowed, as a legacy of the Zig port**: `self_named_constructors` (`Type::init`), `too_many_arguments`, `needless_return`.
- **Custom cfgs**: `bun_asan`, `bun_debug`, `socket_fault_injection`.

## `clippy.toml` disallowed items (what to use instead)
- **Filesystem and processes**
 - `std::fs::*` and `std::fs::File`: use `bun_sys` (`bun_sys::File`, `open`, `openat`). See `bun-core-sys-syscalls`.
 - `std::process::Command`: use `bun_core::util::spawn_sync_inherit` or `bun_spawn_sys`.
- **Environment**: `std::env::var` is replaced by `bun_core::env_var::<NAME>::get`.
- **Threads and locks**
 - `std::thread::spawn`: use `bun_threading::spawn_named` or `ThreadPool`.
 - std `Mutex`/`RwLock`: use `bun_threading::{Mutex, RwLock}`.
- **Collections**: std `HashMap`/`HashSet` are replaced by `bun_collections` (wyhash), for example `ArrayHashMap`, `StringMap` and `zig_hash_map::HashMap`.
- **Memory and debugging**
 - `std::mem::zeroed`: use `bun_core::ffi::zeroed_unchecked` with a SAFETY comment.
 - `std::backtrace::Backtrace` is also disallowed.
- **Strings and byte search**
 - `String::from_utf8` and `from_utf8_lossy` are disallowed (Bun works in bytes).
 - `str::find`, `contains`, `split`, `lines`, `slice::windows`, `memchr::*` and the bstr `find*` functions: use the SIMD helpers in `bun_core::strings`. `test/internal/source-lints/byte-search.test.ts` enforces this for byte searches too.
- **Output**
 - The `println!`, `eprintln!`, `print!`, `eprint!` and `dbg!` macros: use the `bun_core::output` macros (`bun-core-strings-fmt-output`).
 - The `bun_core::output::pretty`/`prettyln` functions: use the `pretty!`/`prettyln!` macros instead.
- **Thresholds**: pass-by-value 64 bytes; stack-size 131072.

## Re-export surfaces worth knowing
- **`bun_collections`**: MultiArrayList, BoundedArray, HiveArray, LinearFifo, bit_set, ObjectPool, StaticHashMap, ArrayHashMap, StringMap, SmallList (smallvec), PriorityQueue, VecExt, TaggedPtr/TaggedPtrUnion (from bun_ptr).
- **`bun_threading`**
 - Locks and sync: Mutex/MutexGuard, RwLock, Condition, Futex, ResetEvent, Semaphore, WaitGroup, Channel, Guarded.
 - Pools and queues: ThreadPool, WorkPool (Task, IntrusiveWorkTask, OwnedTask), UnboundedQueue, SignalRing, io_thread_pool.
- **`bun_safety`**: thread_id and ThreadLock/ThreadLockGuard, re-exported from bun_core.
- **`bun_paths`**
 - `PathBuffer = [u8; PATH_MAX]`, about 64 KB on Windows, so never put one on the stack in a loop. Use `path_buffer_pool::get`, which returns a `PoolGuard` (thread-local cap of 4). Also `w_path_buffer_pool` and `os_path_buffer_pool`.
 - Path joins: `resolve_path::join` and `join_string_buf::<platform::Auto>`. The platform types are Posix, Windows, Loose and Nt.
 - Helpers: `dirname`, `basename`, `is_absolute`. `OSPathChar` is u16 on Windows; `OSPathSliceZ`.
- **`bun_ptr`** (details in `bun-core-gc-lifetimes`): RefPtr, RefCounted, ThreadSafeRefCounted, CellRefCounted derive, BackRef, ThisPtr, ParentRef, WeakPtr, JsCell, CowSlice, RawSlice, detach_lifetime.
- **`bun_io`**
 - PipeReader and PipeWriter (`impl_streaming_writer_parent!` with borrow = mut, shared or ptr).
 - KeepAlive (`ref_`/`unref` with `bun_io::js_vm_ctx`).
 - Also: posix_event_loop, windows_event_loop, ParentDeathWatchdog, MaxBuf.
- **`bun_uws_sys`**: App, Loop, SocketContext, SocketGroup, Request/Response, WebSocket, h2/h3/quic and udp. The C++ glue is `libuwsockets*.cpp` and the header `_libusockets.h`.

## Docs and conventions
- **Missing docs**: comments cite `docs/PORTING.md` (§Forbidden, §JSC types, §Dispatch, §extern-Rust-ban) and `LIFETIMES.tsv`, but **neither file is in the repo**. Treat the comments themselves as the spec.
- **Docs that do exist**
 - `src/CLAUDE.md`, identical to `src/AGENTS.md` (428 lines), which has the std to bun_* table.
 - `REVIEW.md` (merge-blocking rules).
 - `.claude/docs/landing-prs.md`.
 - `src/event_loop/README.md`.
- **Skills** in `.claude/skills/`: implementing-jsc-classes-rust, implementing-jsc-classes-cpp, rust-system-calls, javascriptcore-garbage-collector.
- **Module paths**: `bun_jsc` uses `#[path]` modules to map PascalCase files to snake_case modules (for example `ErrorCode.rs` becomes `error_code`).

Related: `bun-core-idioms`, `bun-core-jsc-rust-api`.
