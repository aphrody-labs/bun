<!-- SPDX-License-Identifier: Apache-2.0 -->

# Runtime C ABI 1.6

The standalone `buv-runtime` artifact exposes a versioned C ABI. Canonical
`buv_*` and compatible `yolo_*` names share the same handles, registry and
process owner. This source contract does not qualify every native target.

| Piece                      | Canonical path in Bun                                              |
| -------------------------- | ------------------------------------------------------------------ |
| Library (cdylib + rlib)    | `packages/bun-runtime-sdk/crates/yolo-runtime`                     |
| C headers                  | `packages/bun-runtime-sdk/include/buv_runtime.h`, `yolo_runtime.h` |
| TypeScript SDK (`bun:ffi`) | `packages/bun-runtime-sdk/src`                                     |
| Python ctypes              | `packages/bun-runtime-sdk/python/ctypes`                           |
| Artifact staging           | `packages/bun-runtime-sdk/scripts/stage.ts`                        |

```sh
bun scripts/build/rust/cargo-serial.ts build --profile runtime -p yolo-runtime --jobs 1
bun scripts/build/rust/cargo-serial.ts test -p yolo-runtime --lib --jobs 1 -- --test-threads=1
bun packages/bun-runtime-sdk/scripts/stage.ts
```

On Windows, the serialized Cargo wrapper accepts `--msvc` before the Cargo
command. Staging selects `target/runtime` and writes
`target/artifact/<target>/current` with the library, headers and manifest.
The manifest records target, ABI, source revision, profile and checksums.
The compiled library's build info identifies the selected native revision.
An explicit compiled library path may be passed to the staging command when
Cargo uses the shared cache instead of the package's default target directory.

## Core capabilities

The table uses compatible `yolo_*` names; matching `buv_*` entry points
forward to the same owner.

| Capability          | Entry points                                      | Owner                                           |
| ------------------- | ------------------------------------------------- | ----------------------------------------------- |
| `system.stats`      | `yolo_system_stats`                               | `yolo_core` system statistics                   |
| `bench.compute`     | `yolo_bench_start`, operation wait/cancel/release | cancellable native benchmark                    |
| `process.supervise` | process spawn/status/read/stop/release            | Unix process group or Windows Job               |
| `process.stdin`     | process stdin_write/stdin_close                   | bounded owned pipe writer                       |
| `process.wait`      | process wait_start, operation wait/cancel/release | same process owner, exit and capture completion |
| `http.probe`        | `yolo_http_probe_start`                           | bounded HTTP/1.0 probe                          |

Browser and GPU symbols remain optional feature extensions. Declarations do
not establish availability; negotiate capabilities before resolving symbols.
SDK preload modules reuse this C ABI without a second native supervisor.

## ABI and ownership

`yolo_abi_version()` returns `(major << 16) | minor`. Another major or a newer
requested minor is rejected. ABI 1.x remains additive: 1.1 introduced process
supervision, 1.2 bounded capture, 1.3 asynchronous stop, 1.4 lossless capture,
1.5 optional GPU calls and 1.6 stdin/completion wait. Original spawn structures
and ABI 1.4 flags keep their layout and behavior.

Handles are opaque 64-bit slot/generation IDs. Released handles are rejected;
no raw state pointer leaves the library. Returned `YoloBuffer` allocations
belong to the library: preserve data/len/cap and free them with
`yolo_buffer_free`. The library copies input before returning and retains no
caller pointer. Consumers copy output before freeing it.

Every entry point returns `YoloStatus`; `yolo_last_error` returns the failure
message for the calling thread. Worker failures propagate through operation
wait. The artifact uses the `runtime` profile with panic unwinding;
`build_info.panic_recovery` records whether panic containment is available.

Operations and processes share the runtime capacity, default 4 and at most 64.
A completion wait uses the existing process slot; cleanup operations do not
consume another slot. Release each operation and process handle normally.

Blocking operation wait clones its Arc before releasing the registry lock.
Cancel, process release and runtime close may run concurrently without
retaining foreign memory. Runtime destroy invalidates handles, cancels all
waiters first, then stops processes and joins workers outside that lock.
The caller must let concurrent foreign calls return before unloading the
dynamic library. A binding must not hold its mutation lock through blocking
wait if another thread needs to cancel it.

## Binary capture (ABI 1.4)

`YOLO_SPAWN_CAPTURE` keeps the last 64 KiB of each stream.
`YOLO_SPAWN_CAPTURE_LOSSLESS` retains complete bytes up to the explicit
per-stream budget, default/maximum 64 MiB, and reports `OUTPUT_LIMIT` instead
of silently truncating. The optional appended capture budget preserves the
original spawn structure. `process_output_complete` reports both reader EOFs;
reading can still return a capture failure.

Unix readers use nonblocking descriptors. Windows readers use
[PeekNamedPipe](https://learn.microsoft.com/en-us/windows/win32/api/namedpipeapi/nf-namedpipeapi-peeknamedpipe)
before reading available bytes from the sole owned handle. Shutdown joins
readers; an escaped descendant retaining output beyond the drain deadline
produces an incomplete-output error. Escaped groups are outside the owned
group and are not claimed terminated.

## Stdin and completion (ABI 1.6)

Require ABI 1.6 plus `process.stdin` and `process.wait` before resolving the
three added symbols. `YOLO_SPAWN_PIPE_STDIN` (flag 8) opts into a pipe and may
combine with capture. It is incompatible with null stdio. Windows stdin
spawning requires successful Job adoption; older non-stdin callers retain
their existing direct-child fallback if adoption fails.

`process_stdin_write` copies/enqueues at most 1 MiB cumulatively, with at most
64 pending chunks. It performs no pipe I/O on the calling thread. A full
chunk queue returns `BUSY`; excess bytes or write-after-close return
`INVALID_ARGUMENT`. Zero bytes may use a null input pointer.
`process_stdin_close` drains accepted bytes and then produces EOF; repeated
close succeeds. Cancellation stops the writer and discards pending input.

The unique writer belongs to the existing process state. Unix writes are
nonblocking. Windows cancellation uses
[CancelSynchronousIo](https://learn.microsoft.com/en-us/windows/win32/fileio/cancelsynchronousio-func)
on that dedicated writer thread, checks cancellation between writes and
rechecks completion to cover cancellation before a pending WriteFile call.
No thread shared with unrelated operations is cancelled.

`process_wait_start` returns one cancellable operation per process.
`operation_wait` timeout leaves that operation running; cancel/release stops
the owned process group or Job and joins pipe workers. A successful result
is JSON:

```json
{
  "state": 1,
  "pid": 42,
  "exit_code": 0,
  "signal": 0,
  "output_complete": true,
  "stdin_complete": true
}
```

Success follows child exit and full capture EOF. Capture overflow, pipe I/O
failure or accepted stdin bytes left unwritten produce an error. Client
payload travels through stdin, without process arguments or temporary files.
Language clients wait through the native operation instead of polling status.

## Qualification

Native receipts identify the tested library, source, host and gates. A header
or compilation does not qualify pipe cancellation, process behavior, ABI or
packaging on every platform. Optional missing providers remain explicit.
This supervisor is separate from Bun's NGINX controller and native inference;
its process gates do not qualify a model or model weights.
