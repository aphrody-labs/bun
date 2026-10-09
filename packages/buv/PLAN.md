# Buv / PyJS: long-term runtime plan

Buv ships the Bun fork with embedded UV. PyJS is the shared JavaScript/TypeScript
and CPython surface. Upstream `bun` and `uv` names and binary contracts remain
distinct. The default JavaScript process starts without initializing Python,
opening the graph database, connecting Redis, starting language servers, or
loading a compiler backend.

Development, scripts, tests and production use the qualified Bun fork selected
from the workspace or an explicit artifact. Remove discovery fallbacks to the
legacy system Bun. Build the debug artifact with a separate qualified fork
bootstrap so Windows does not try to overwrite a running executable. Record the
actual executable path, revision and hash for every gate and child process.

## Qualification before promotion

Every promoted artifact identifies the Bun, UV, WebKit, CPython and optional
compiler revisions, dirty source hashes, compiler flags, target ABI and binary
SHA-256. Debug, release, PGO, free-threaded and JIT builds have separate baselines.
Source coverage and working execution are separate graph properties.

The current baseline is stored in `bun_python.sqlite`; immutable source graphs,
command receipts, tests, benchmark samples and fixes retain their provenance.
`bun_python.json` is a complete streamed snapshot. Runtime evidence and private
databases remain excluded from Git. The graph records unresolved calls explicitly;
it does not infer compatibility from a file, crate or matching hash alone.

Finish the pending native bridge, codec, compiler and plugin gates before marking
those capabilities ready. The existing package transfer receipt describes its
historical scope and must not become a receipt for a different runtime.

## Performance contract

Maintain paired, interleaved before/after benchmarks on the same qualified host
with identical outputs. Record CPU, OS, toolchain, build mode, memory, warmup,
sample count and resource contention. Preserve raw samples, median, p95 and an
uncertainty estimate. Begin with at least 25 measured samples; increase sampling
only when noise prevents a decision. Compare the same algorithm and data where
possible; package managers and different language linters have explicit scope.

The release gate covers JavaScript startup and idle RSS, parsing and bundling,
package installation, shell/process startup, Python startup, JSON and buffers,
FFI latency, event-loop delay, throughput under concurrent calls and peak RSS.
An optimization must also exercise its fallback and worst inputs. The CPython
JSON experiment already demonstrated why a fast ASCII case needs a long escaped
string and Unicode baseline beside it.

A repeatable regression outside the measured noise budget blocks promotion.
Choose numerical budgets from qualified baseline distributions per host/target,
not one arbitrary percentage on heterogeneous CI machines. Never mix release and
debug timings or declare whole-engine parity from a microbenchmark. Fairness,
cancellation and memory retention are gates alongside throughput.

## Bounded resource ownership

One scheduler owns each host's CPU, memory, storage and build reservations. Give
runtime requests, background indexing and compiler jobs separate bounded queues;
interactive execution has priority over bulk work. Record queue wait, service time,
active jobs, peak RSS and event-loop delay so saturation is attributable. Default
limits follow the selected host's qualified capacity and remain overridable.

Recursive work uses visited sets, depth/node/byte limits and cancellation propagated
to child processes. A timeout cancels owned work and closes its resources. Retries
have deadlines and bounded backoff; repeated failures do not spawn more workers.
Serialize mutations of one checkout, native build directory and SQLite writer.
Parallelize independent source reads and isolated target builds within reservations.

Keep SQLite as the durable evidence store and Redis as an optional reconstructible
cache. Chunk imports, release write transactions before yielding, stream exports
with backpressure and pin a read snapshot before the first asynchronous write.
Store large source payloads once by content hash; snapshot summaries and indexed
nodes must not duplicate complete call arrays. Version schema migrations, qualify
backup/restore and impose explicit retention on reproducible caches and artifacts.
Protected databases, source history and active build outputs are not eviction
candidates. Record cold-cache, warm-cache and concurrent-reader/writer benchmarks.

## One stable interpreter boundary

Keep `bun:python` and its `buv:python` / `pyjs:python` aliases backed by one native
host implementation. Use a versioned C ABI, explicit ownership, RAII, stable
error/status semantics and a lazy shared CPython library. Multiple consumers must
share the same interpreter and allocator contracts; loaded modules cannot be
unloaded while borrowed buffers or operations remain alive.

Reject a second consumer selecting a different interpreter version, GIL mode or
allocator while a shared interpreter is live. Only its owner may initialize and
finalize it. Leases are tested through cancellation, worker shutdown and extension
code retaining an exported view; buffers remain valid until the last lease ends.

The current string/JSON bridge is useful but allocates. Add CPython's buffer
protocol for large numeric arrays and byte buffers with explicit leases, lengths,
alignment and lifetime checks. Do not use JSON for tensor payloads. Add batched
calls to amortize GIL and ABI crossings; measure before introducing object handles
or a result cache. Tensor/device buffers need separate ownership and stream
synchronization tests before advertising PyTorch/PyCUDA interoperability.

Python workers serialize dependent operations, bound outstanding requests and
preserve cancellation/shutdown. Offloading protects the JS event loop; it does
not make a GIL-bound computation parallel. Qualify free-threaded CPython and
subinterpreters separately against extension-module compatibility. Keep bounded
worker pools and backpressure rather than allocating a worker for each call.

Track interpreter version, limited-ABI status, GIL mode, extension initialization,
allocator and platform ABI in the compatibility matrix. Test shutdown with pending
calls, failed imports, exceptions and repeated open/close. An extension declared
subinterpreter-safe or free-threaded needs execution tests in that exact mode.
The matrix includes NumPy and PyTorch independently of their main-interpreter
import tests and records unsupported variants explicitly.
Long-running native work supports cooperative cancellation; unsafe forced interpreter
termination requires an isolated process boundary rather than a shared host DLL.

## Build products and compiler backends

Expose Python compilation through the Bun CLI and the same capability catalogue.
Distinguish bytecode/zipapps, native executables, CPython extension modules,
exported C ABI libraries and WASI modules in both flags and receipts. A Python
extension DLL is not automatically a general-purpose C ABI library.

Reuse vendored UV for isolated, pinned compiler environments and dependency
resolution. Cython and Nuitka are real optional native compiler backends. Keep
their code generation and C/C++ build off the normal runtime startup path.
Discover includes, libraries, extension suffixes and runtime dependencies from
the selected CPython/toolchain, not workstation paths. Handle packages and data
files explicitly, including dynamic imports; test produced artifacts in a fresh
environment without the development checkout.

Build each OS/architecture against its qualified native, SSH or Docker toolchain.
An ELF `.so` and a Windows DLL are different artifacts, not interchangeable suffixes.
For WASM, build actual CPython WASI with frozen application/stdlib modules and
run the result under a qualified WASI engine. Native dependencies need their own
WASM port or an actionable unsupported-capability result. Do not replace CPython
with RustPython while claiming CPython extension compatibility.

## Development tools outside the runtime hot path

`.pyjs`, `.pyts` and `.pytsx` retain the JS, TS and TSX grammars and resolution
rules. Python code uses explicit embedded regions such as `py.exec` rather than
an ambiguous second parser guessing which language each expression belongs to.
Preserve raw template bytes, source locations and source maps through printing,
bundling and compilation. Add mixed-language syntax only with a versioned grammar,
parser, printer, formatter and diagnostic mapping tested together.

The `bun-uv` plugin keeps TypeScript and Python language-server processes separate
behind one async LSP transport. Route document regions and edits by exact UTF-16
ranges; preserve request IDs, cancellation, diagnostics, configuration and shutdown.
Ruff lint support and Python type analysis are separate advertised capabilities.
Use installed TS7/Python backend versions; a newer documentation version is not
proof of a newer binary. Skills and source-backed documentation require no provider
credential copying, fabricated Codex LSP configuration or model fine-tuning claim.

## Upstream and release ownership

Preserve upstream licenses, Git history, pins and independently reproducible locks.
Keep UV source in one vendored tree, Bun APIs in the core, and the SDK as consumers
of those APIs. Legacy Yolo/VU runtime compatibility aliases can be retired only
after every indexed consumer migrates and its native gate passes. Global automation,
provider stores and the canonical Aphrody MCP are separate ownership boundaries.

Upgrade one dependency family per qualified batch. Link the source change to
affected consumers, targets, tests and benchmarks in the graph. Source-call edges
aid impact analysis; dynamic Python/JS imports and C++ overloads still need runtime
coverage. No auto-fix is promoted merely because a benchmark improves: outputs,
ABI, language semantics, resource bounds and regression tests must all pass.

Promote immutable artifacts through staging, native consumer qualification and
atomic activation with a verified previous artifact for rollback. A normal push
uses the existing authorized remote and ancestor checks; publication remains an
owner decision. Preserve concurrent edits and never rewrite others' work to force
a gate green.

## Ordered delivery

1. Finish current gates and publish exact evidence for the existing native bridge,
   codecs, source graphs and CPython JSON patch.
2. Qualify produced EXE/DLL/ELF/WASI artifacts and their dependency closures.
3. Add leased buffers and batched FFI calls with latency/RSS/event-loop benchmarks.
4. Qualify Python libraries, free-threaded/subinterpreter variants and device buffers
   against a versioned compatibility matrix.
5. Make promotion gates and rollback automatic on qualified hosts, then broaden
   platform and upstream coverage without weakening the JavaScript startup budget.
