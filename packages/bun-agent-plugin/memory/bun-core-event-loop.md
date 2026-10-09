---
name: bun-core-event-loop
description: "Bun's event loop in Rust — VirtualMachine access, jsc::EventLoop tick/run_callback/Stopped, Task/TaskTag/Taskable/ConcurrentTask, hoisted dispatch in bun_runtime, AnyEventLoop/EventLoopHandle/MiniEventLoop, timers, KeepAlive, uSockets/libuv"
metadata:
 type: reference
---

# Event loop (src/jsc/event_loop.rs, src/event_loop/, src/runtime/dispatch.rs)

## VirtualMachine (src/jsc/VirtualMachine.rs, about 7.8k lines)
- **One per JS thread** (the main thread and each Worker), stored in TLS `VM`. Fields that change after init are wrapped in `JsCell`.
- **Access**
 - `VirtualMachine::get -> &'static VirtualMachine`, plus `get_or_null`, `get_mut_ptr`, `as_mut`, `get_mut`.
 - Accessors: `vm.global`, `vm.event_loop -> *mut EventLoop`, `vm.rare_data`, `vm.jsc_vm`.
- **Lifecycle and task helpers**: `init(InitOptions)`, `enqueue_task`, `tick`, `is_shutting_down`.
- **From a host fn**: `global.bun_vm`.

## jsc::EventLoop
- **Fields**: `tasks: Queue` (a `LinearFifo<Task>`), `immediate_tasks` and `next_immediate_tasks` (for setImmediate), the concurrent MPSC queue, `entered_event_loop_count`, and more.
- **Debug log scope**: `declare_scope!(EventLoop, hidden)`, enabled with `BUN_DEBUG_EventLoop=1`.
- **`tick`** runs `tick_turn`:
 1. `tick_concurrent` moves cross-thread tasks into the queue.
 2. `process_gc_timer`.
 3. `tick_with_count` runs queued tasks, with microtasks drained per task. Concurrent refills are bounded by `CONCURRENT_REFILLS_PER_TICK`.
 4. `drain_microtasks_with_global`.
 5. `handle_rejected_promises`.
 - Variants: `tick_tasks_only`, `tick_concurrent_with_count`, `auto_tick` (also polls I/O), `wait_for_promise`.
- **Calling JS from native code outside a task**
 - Use `event_loop.run_callback(context, callback, global, this, &args)` or `run_callback_with_result`.
 - These check `enter_js` (script allowed, no pending exception), wrap the call in `enter`/`exit` so microtasks drain on exit, and report errors through `task::report_error_or_terminate`.
 - Never call `callback.call` directly from an I/O callback.
 - `context: ContextId` names whose script continues; use `ContextId::NONE` when there is none.
- **Other methods**: `enter`/`exit` guards, `drain_microtasks -> Result<, Stopped>`, `enqueue_task`, `enqueue_task_after_yield`, `wakeup`, `js_poster`, `ref_keep_alive`/`unref_keep_alive`, `usockets_loop`, `uv_loop` (Windows).
- **`Stopped`**: a unit error meaning the VM no longer runs script (worker terminate or teardown).
 - Only loop-level code returns it.
 - To cross into a `JsResult` function, use `Stopped::throw(global)`, which throws a TerminationException if inside script and otherwise yields `JsError::Terminated`. There is no implicit `From`.
- **Noalias workaround**: `run_callback` launders `&mut self` through `core::hint::black_box`, because JS re-enters the same EventLoop and LLVM could otherwise cache `entered_event_loop_count` across the call (marked "R-2 noalias mitigation"). Copy this pattern when a `&mut self` method calls into JS.

## Tasks (src/event_loop/ConcurrentTask.rs, src/jsc/Task.rs)
- **`Task`**: `struct Task { tag: TaskTag, ptr: *mut , context: ContextId }`, asserted to be two words. `TaskTag(pub u8)`; the constants live in `bun_event_loop::task_tag` (about 96 entries).
- **`trait Taskable`**: `const TAG`, `unsafe fn release_unrun(this)` (frees a task that will never run at VM teardown, without running it), and `context`.
- **Construction**: `Task::init(ptr)` or `Task::from_boxed(Box<T>)`.
- **Dispatch** happens in `bun_runtime::dispatch::run_task`, one `match` over all tags (high tier owns every type).
 - Low tiers call it through `extern "Rust"` `__bun_tick_queue_with_count`, defined `#[no_mangle]` in `src/runtime/dispatch.rs`.
 - `run_file_poll` handles the `bun_io::FilePoll` owners the same way.
- **Adding a task type**: tag, `impl Taskable`, `run_task` arm, `__bun_release_task_unrun` arm, then bump `task_tag::COUNT`.
- **`ConcurrentTask`** (`#[repr(C)] { task: Task, next: Link, auto_delete: bool }`)
 - Use it for worker-thread to JS-thread delivery: `ConcurrentTask::create(task)` or `create_from(ptr)` returns a `NonNull`.
 - Then call `event_loop.enqueue_task_concurrent(..)`, which uses a lock-free MPSC queue and wakes the loop.
- **Thread-pool work**: `bun_threading::WorkPool`/`ThreadPool` tasks (`IntrusiveWorkTask`, `OwnedTask`) run off-thread, then post a ConcurrentTask back. The `AnyTaskWithExtraContext` and `DeferredTaskQueue` helpers also exist.
 - DeferredTaskQueue holds work batched until after the microtask drain (HTTP response writes, file sink flushes).

## Loop abstractions (src/event_loop/)
- **`AnyEventLoop`** = `Js { owner: JsEventLoop } | Mini(Box<MiniEventLoop>)`. Code that runs both with and without JS uses it (the package manager, shell, spawn).
- **`EventLoopHandle`** = `Js { owner } | Mini(BackRef<MiniEventLoop>)`. It is `Copy` and stored in `uws::InternalLoopData`.
- **`MiniEventLoop`**: a loop without a JS VM (`bun install`, `bun build` threads).
 - `SpawnSyncEventLoop` serves spawnSync.
 - `README.md` in that folder documents the tick order: concurrent, GC timer, tasks, nextTick, microtasks, immediates, timers, I/O poll.
- **`EventLoopTimer`** (`EventLoopTimer.rs`): an intrusive heap timer with `Tag` (TimeoutObject, ImmediateObject, DNSResolver, WTFTimer, Postgres/MySQL/Valkey timeouts...). The timer heap is in `src/runtime/timer/`.

## Polling and I/O
- **Backends**: on posix, uSockets (epoll/kqueue, `bun_uws_sys::Loop`) via `bun_io::posix_event_loop`/`FilePoll`. On Windows, libuv (`uv_loop`) via `bun_io::windows_event_loop`.
- **`KeepAlive`** (`bun_io::KeepAlive`): `ref_(bun_io::js_vm_ctx)`/`unref(..)` keep the process alive while an operation is pending. Every ref needs an unref on all paths.
- **Readers and writers**: `PipeReader`/`PipeWriter` are generic over a parent through `impl_streaming_writer_parent!`.
- **nextTick and microtasks**: nextTick lives in `src/jsc/bindings/JSNextTickQueue.cpp`; microtasks are JSC's queue, drained via `drain_microtasks`.

## Cross-thread rules
- Never touch a JSValue, Strong, String (WTF) or VirtualMachine off its thread.
- Post a task instead, with `VmHandle`/`Ticket` from VirtualMachine.rs or `ConcurrentTask`.
- Worker termination shows up as `Stopped`. Code that waits in loops must propagate it.

Related: `bun-core-jsc-rust-api`, `bun-core-gc-lifetimes`, `bun-core-crate-map`.
