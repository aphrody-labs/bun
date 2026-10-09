---
name: bun-core-sys-syscalls
description: "bun_sys syscall layer (Maybe<T>, sys::Error/Tag, Fd encoding, File RAII, FdExt, platform modules), bun_alloc allocators/arenas, and sys_jsc conversion traits"
metadata:
 type: reference
---

# bun_sys, Fd, and bun_alloc

## Fd (src/bun_core/util.rs:824)
- **Type**: `pub struct Fd(pub FdBacking)`. The backing is `i32` on posix and `u64` on Windows.
 - On Windows bit 63 is the kind: `.system = 0` is a HANDLE and `.uv = 1` is a libuv/CRT fd.
- **Constructors and constants**: `Fd::INVALID`, `Fd::from_native`, `Fd::from_uv`, `Fd::from_system`, `Fd::stdin`, `stdout`, `stderr`.
- **Closing**: `bun_sys::FdExt` (in `src/sys/fd.rs`) adds `close`, `close_allowing_bad_file_descriptor`, `close_allowing_standard_io`, `make_lib_uv_owned`, `make_path_u8` and `delete_tree`.
- `CloseOnDrop` is the RAII guard for a raw Fd.

## Result type and errors (src/sys/lib.rs, src/sys/Error.rs)
- **Result alias**: `pub type Maybe<T> = Result<T, bun_sys::Error>` (also aliased `bun_sys::Result<T>`).
 - The Zig port mapping is `Maybe(T)` with `.result` and `.err`, which became `Result` plus `?`.
- **Error fields**: `bun_sys::Error { errno: u16, fd: Fd, path: Box<[u8]>, syscall: Tag, dest: Box<[u8]> }`.
- **Error methods**
 - Construct: `Error::new(errno, tag)`, `from_code`, `from_code_int`, `from_win32`.
 - Inspect: `get_errno -> E`, `is_retry` (EAGAIN).
 - Special values: `Error::oom`, `Error::retry`.
 - Builders: `with_fd`, `with_path`, `with_path_and_syscall`, `with_path_dest`.
- **`Tag(pub u8)`** is the syscall name, a newtype with stable discriminants: `TODO=0`, `dup=1`, `access=2`, `connect=3`, `chmod=4`, and so on. `Tag::name` gives the text.
- **Re-exports**: `E`, `SystemErrno` and `get_errno` from `bun_errno`.
- **Open flags** are in `mod O` (`O::RDONLY`, `O::CREAT`, `O::CLOEXEC`...).

## File (src/sys/file.rs) — Drop closes the fd
- **Opening**
 - `File::from_fd(fd)`
 - `File::open(&ZStr, flags, mode)`
 - `File::openat(dir: impl AsFd, path: &[u8], flags, mode)`
 - Also: `make_open`, `create(dir, path, truncate)`.
- **Reading**: `read`, `read_all`, `read_to_end`, `read_to_end_small`, `pread_all`, `read_from(dir, path)` (one-shot read).
- **Writing**: `write_all`, `pwrite_all`, `write_file`.
- **Other**: `stat`, `kind`, `get_path`, `close(self)` (explicit close returning Maybe).

## Free functions (bun_sys)
- **Open and directories**: `open`, `openat`, `openat_a`, `open_dir_at`, `mkdir_recursive`.
- **Read and write**: `read`, `write`, `pread`, `pwrite`, `read_nowait`.
- **Fd handling**: `close`, `dup`, `dup_at_least`, `set_nonblocking`.
- **Paths**: `getcwd_z`, `get_fd_path`, `stat`, `fstat`, `lstat`, `unlink`, `rename`.
- **Dynamic loading**: `dlopen` and the `dlsym_with_handle!` macro.
- **Error handling style**: the functions return `Maybe<T>` and never panic. Callers propagate with `?` or `match` on `Err(e)` with `e.get_errno`.
- **Platform modules**: `windows` (NT/Win32 helpers, `windows::env::convert_env_to_wtf8`), `sys_uv` (libuv fs on Windows), `posix`, `linux` (io_uring/epoll helpers) and `darwin`.
 - Windows paths must go through the `bun_paths` wide buffers (`w_path_buffer_pool`).
- **Skill**: `.claude/skills/rust-system-calls/SKILL.md`. Never use `std::fs` (disallowed). Use `bun_sys` so you get errno, path and syscall in errors plus Windows uv/NT handling.

## sys_jsc (src/sys_jsc/lib.rs)
- **`ErrorJsc` trait**: `err.to_js(global) -> JsResult<JSValue>` builds a Node-style SystemError with code, errno, syscall and path.
- **Other traits**: `SystemErrorJsc::to_error_instance(global)`, `FdJsc` (Fd to and from a JS number), and `signal_code_jsc`.
- **Typical pattern in a host fn**:
 ```rust
 let file = match bun_sys::File::openat(dir, path, O::RDONLY, 0) {
 Ok(f) => f
 Err(e) => return Err(global.throw_value(e.with_path(path).to_js(global)?))
 };
 ```

## bun_alloc (src/bun_alloc/lib.rs)
- **Global allocator**: `#[global_allocator]` is `Mimalloc`. Under `cfg(bun_asan)` std `System` is used so ASAN can see the allocations.
- **Memory shared with C/C++**: use `bun_alloc::default_alloc::{malloc, realloc, free, usable_size}`. Never free C-allocated memory with Rust `Box`.
- **Arenas**
 - Types: `MimallocArena` (alias `Arena`), `ArenaVec`/`BabyVec`, `ArenaBox`, `AstAlloc`/`AstBox`/`AstVec`, `MaxHeapAllocator`, `stack_fallback`.
 - **Arena reset does NOT run Drop.** A type that owns a heap allocation or a refcount (a String, RefPtr, Vec...) must be released explicitly before the reset, in Zig `deinit` order.
- **OOM**: `AllocError`, the `oom_from_alloc!` macro, and `out_of_memory -> !` (aborts with Bun's OOM message through `Bun__outOfMemory`).
- **Other**: `SEP`/`SEP_STR` (path separator), the `bss_singleton!` macro (static lazy singleton in .bss), `WTFStringImplStruct`.
- **Dependencies**: `use_mimalloc_in_dependencies` in `main` routes the ICU and other C library allocators to mimalloc. BoringSSL is hooked at link time; c-ares is hooked at lazy init.

## Spawning processes
- Use `bun_core::util::spawn_sync_inherit` for simple cases and the `bun_spawn_sys` crate for the full posix_spawn and Windows uv path.
- `std::process::Command` is disallowed.

## Threads
- Use `bun_threading::spawn_named(name, f)` or the `ThreadPool`/`WorkPool` (see `bun-core-event-loop` for how results come back through ConcurrentTask).

Related: `bun-core-crate-map`, `bun-core-strings-fmt-output`, `bun-core-idioms`.
