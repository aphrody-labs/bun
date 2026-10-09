---
name: bun-core-strings-fmt-output
description: "bun_core String/ZStr/Utf8Bytes ownership rules, strings SIMD helpers, fmt helpers, scoped debug logging (declare_scope!/scoped_log!), pretty output macros, env_var and feature flags"
metadata:
 type: reference
---

# bun_core: strings, fmt, output, env vars

## `bun_core::String` (src/bun_core/string/mod.rs)
- **Layout**: `#[repr(C)] struct String { tag: Tag, value: StringImpl }`, where StringImpl is a union. `assert_ffi_layout!(String, 24, 8)` checks the size. On the C++ side the type is `BunString` (`src/jsc/bindings/BunString.cpp`, `headers-handwritten.h`).
- **Tag** values: `Dead=0`, `WTFStringImpl=1` (refcounted JSC string), `EncodedSlice=2`, `StaticEncodedSlice=3`, `Empty=4`, `OutOfMemory=5`.
- **Ownership**
 - `Clone` adds a ref and `Drop` removes one.
 - Passing a `String` by value across `extern "C"` transfers ownership.
 - The FFI functions are named `BunString__fromBytes`, `BunString__createAtom`, `BunString__createExternal`, and so on.
- **Constructors**
 - `String::clone_utf8(&[u8])` copies.
 - `borrow_utf8` does not copy, so the source must outlive the String.
 - Also: `static_(&'static str)`, `from_bytes`, `create_atom`, `create_format(format_args!)`, `create_external`.
- **Readers**
 - `to_utf8` returns `Utf8Bytes<'_>`; `into_utf8` returns `Utf8Bytes<'static>`.
 - `to_owned_slice` returns a `Vec<u8>`.
 - Also: `eq_ascii`, `is_dead`, `is_empty`.
- **`Utf8Bytes`** is `Borrowed(&[u8]) | Owned(Vec<u8>) | Shared(String)`. Deref it to `&[u8]`.
- **Cross-thread**
 - Use `thread_isolated_copy` to hand a string to exactly one other thread.
 - Use `make_thread_shareable` when several VMs or threads can reach it. WTFStringImpl refcounts are not atomic.
- **Other string types**
 - `StringView`, `EncodedSlice`, `MutableString`, `StringBuilder`, `SmolStr`, `HashedString`, `Utf8WithString`.
 - `ZStr`: a NUL-terminated borrowed slice, defined at `util.rs:77`. Build literals with `zstr!("..")`.
 - `ZBox` owns a NUL-terminated buffer. `WStr` is the UTF-16 equivalent.
- **JS conversions** live in `bun_string_jsc`
 - The `StringJsc` trait provides `to_js`, `into_js` and `from_js`.
 - Also: `create_utf8_for_js`, `owned_utf8_into_js`.
 - From a JSValue: `value.to_bun_string(global)?`, `value.to_utf8(global)?` and `to_js_string_view`.
- **Hashing** uses `bun_wyhash::hash`. Never use std `DefaultHasher`.

## `bun_core::strings`
- These are the SIMD/highway byte helpers (index_of_char, contains, eql, starts_with, utf16 conversions, and so on).
- `clippy.toml` bans `str::find`, `split`, `contains`, `windows` and `memchr`, and `test/internal/source-lints/byte-search.test.ts` lints the same thing, so always reach for `strings::*`.
- Bun treats bytes as WTF-8/Latin-1, not as validated `str`, and `String::from_utf8` is banned.

## fmt (src/bun_core/fmt.rs)
- **Display wrappers**: `fmt::quote`, `fmt::size` (human bytes), `fmt_path`, `fmt_identifier`, `fmt_javascript`, `redacted_npm_url`, `Table`.
- **Writing into buffers**
 - `buf_print_z(buf, format_args!)` writes NUL-terminated output into a stack buffer.
 - `VecWriter` adapts `io::Write` to a `Vec<u8>`.
- **Number parsing**: `parse_int` and `parse_double` work on bytes.

## Output and logging (src/bun_core/output.rs)
- **Scoped debug logs** (compiled only when `env::IS_DEBUG`, i.e. `cfg(bun_debug)`)
 - `declare_scope!(Name, hidden|visible)` creates a `pub static Name: ScopedLogger`.
 - `scoped_log!(Name, "fmt {}", x)` checks `IS_DEBUG && Name.is_visible`.
 - `define_scoped_log!(log, Name, hidden)` defines the scope plus a local `log!(...)` macro. This is the idiom inside a file.
 - `bun_sys` uses `syslog!` with scope `SYS` (visible), defined in `src/sys/fd.rs`.
 - The Zig port mapping is `bun.Output.scoped(.X.hidden)`, which became `declare_scope!` plus `scoped_log!`.
- **Toggling scopes at runtime**
 - Env var `BUN_DEBUG_<TAG>=1`; the tag is case-insensitive and `"0"` forces it off.
 - `BUN_DEBUG_ALL=1` turns all on; `BUN_DEBUG_QUIET_LOGS=1` silences them.
 - CLI flags: `--debug-<tag>`, `--debug-all`.
 - Logs are line-buffered and written under `WRITE_LOCK`.
- **User-facing output**
 - Macros: `pretty!`, `prettyln!`, `pretty_errorln!`, `note!`, `warn!`, `debug_warn!`.
 - Color tags such as `<green>`, `<red>`, `<b>`, `<d>`, `<r>` are compiled by `pretty_fmt!`.
 - `Output::err(error_name, fmt, args)` and `Output::flush`.
 - `output::stdio::init` runs in `main`; `flush_guard` flushes on exit.

## env (compile-time) in src/bun_core/env.rs
- Constants: `IS_DEBUG = cfg!(bun_debug)`, `IS_WINDOWS`, `IS_LINUX`, `IS_MAC`, `IS_KQUEUE`, `ENABLE_LOGS`, `ENABLE_ASAN`, `IS_CANARY`, `VERSION`, `ALLOW_ASSERT`.
- Prefer `if env::IS_DEBUG {}` to `#[cfg]` when both branches type-check.

## env_var (runtime, src/bun_core/env_var.rs)
- **Declaring**: `new!(pub NAME: string|boolean|unsigned, "NAME", { default: .. })` produces a module `NAME` with `get`, `get_not_empty` and `key`.
 - The value is read once and cached.
 - A parse failure is silently treated as unset.
- **Feature flags**: `pub mod feature_flag { new_feature_flag!(...) }` holds the runtime switches, for example `BUN_DESTRUCT_VM_ON_EXIT`, `BUN_FEATURE_FLAG_NO_LIBDEFLATE` and `BUN_FEATURE_FLAG_EXPERIMENTAL_BAKE`.
- **Usage**: `bun_core::env_var::BUN_X::get`. Never use `std::env::var` (disallowed).

## feature_flags (compile-time, src/bun_core/feature_flags.rs)
- Holds `const` bools such as `UNWRAP_COMMONJS_TO_ESM` and `RUNTIME_TRANSPILER_CACHE`.
- `bake` reads `feature_flag::BUN_FEATURE_FLAG_EXPERIMENTAL_BAKE`.

## Errors in bun_core
- **Types**
 - `pub type OOM = AllocError`.
 - `pub enum JsError { Thrown=0, OutOfMemory=1, Terminated=2 }` (`repr(u8)`). It lives in bun_core so lower crates can return it.
- **OOM helpers**
 - `handle_oom(r)` and the `UnwrapOrOom::unwrap_or_oom` trait turn an allocation failure into `out_of_memory -> !`.
 - The Zig port mapping is `bun.handleOom(x)` to `handle_oom(x)`.
- **`heap` module** for Box/raw conversions: `heap::alloc`, `into_raw`, `into_raw_nn`, `take`, `destroy`, `release`.

Related: `bun-core-idioms`, `bun-core-jsc-rust-api`, `bun-core-sys-syscalls`.
