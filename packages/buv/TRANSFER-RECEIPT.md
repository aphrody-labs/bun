<!-- SPDX-License-Identifier: Apache-2.0 -->
# `vu` runtime transfer receipt

Date: 2026-10-09

Source: `/srv/aphrody-build/workspaces/vu-wsl`, `aphrody-labs/vu` commit `6ea52f1aada7269d81470dd9d93144555610868e` (clean at inspection).

Destination: optional Bun package `packages/bun-vu`; standalone Rust workspace is deliberately not a member of Bun's root Cargo graph.

## Transferred implementation

This is the existing `vu` runtime, not a replacement scaffold. It includes the two Rust packages `vu` and `vu-runtime`, launcher and PyO3 `Py_BytesMain` bridge, the tracked `compile.py` and `hf.py` helpers embedded by `include_str!`, package lifecycle/build scripts, script tests, `vu.json`, dependency pins, licenses, and notices. The Rust crate sources, manifests, build scripts, Python helpers, and original `Cargo.lock` match the source checkout byte-for-byte; their SHA-256 values and the broader source/transfer inventories are recorded in `provenance.json`. `transfer-integrity.test.ts` pins the source revision, ten critical runtime paths, and lockfile digest.

The runtime preserves these established interfaces and behavior:

- `vu uv ...` and supported uv verbs execute the pinned, unmodified uv sidecar; `vu install` maps to `uv sync`.
- `vu ruff ...`, `vu lint`, and `vu format` execute the pinned ruff sidecar.
- `vu python ...` invokes embedded CPython through PyO3. `VU_PYTHON` or the nearest `.python-version` selects a compatible managed interpreter; uv installs a missing selection on demand.
- `python install/list/use/pin/find/dir`, `run`, `ffi info/check`, `hf status/download/path`, `compile`, `--help`, and `--version` remain routed by the native launcher. Child processes receive the runtime `bin` first on `PATH`, `VU_RUNTIME`, and uv managed-interpreter defaults, while caller-provided values remain authoritative.
- Artifact assembly retains the CPython prefix, `bin/vu`, `bin/uv`, `bin/ruff`, per-component licenses, and a per-file hash/mode/symlink/target manifest. Install remains plan-only by default; apply verifies the artifact before activation and supports rollback through `current`/`previous`.

Read-only inspection of install receipt filenames and schema keys confirmed that forge/install receipts include host, artifact, install-home, and activation fields. Their contents were not copied or included in the package. Existing installed runtimes, caches, stores, provider credentials, and datasets were not read or changed.

## External inputs and ownership

`uv` 0.12.23 (`46b84fd0bfec23b72f29e8e2185ba68a65052f48`), `ruff` 0.16.10 (`3265ed1f944c98bb4c04d632fbefb1257cdb583d`), PyO3 0.29.3 (`451d99fdcdcddf159e8e0a1186960b332cdb5d7c`), and python-build-standalone commit `5e46737f6480fc315ebfea83866910cbfcc772f0` remain exact, demand-loaded external inputs. CPython asset digests for 3.12.15 and 3.14.8 remain in `vendor.json`. uv/ruff stay separate sidecars with their own lockfiles; neither is a dependency in the `vu` Cargo graph. `vendor/`, `build/`, and `target/` are ignored and excluded from transfer.

The legacy standalone `vu python` process remains available for compatibility; this package does not initialize another in-process CPython host inside Bun. The parent reports that `packages/bun-python-native` is now on Bun origin/main at `84a5f33140cef2a63088d8484e84c0a2e5aba785`, with its own checked ABI/Windows wheel. This batch does not activate `vu` through that host or establish a unique Bun Python activation. A future Bun-facing `vu` entry must reuse that bridge and retain pinned uv/ruff sidecars without creating a second host. Aphrody retains Python applications and product RAG business logic. `packages/bun-runtime-sdk`, root Bun Cargo files, and Bun runtime source are outside this transfer.

The source `LICENSE` text is preserved with repository-standard LF line endings; the original source SHA-256 and normalized transferred SHA-256 are both recorded in `provenance.json`. `NOTICE` remains byte-identical. Third-party license/provenance records remain attached to the artifact as before. Excluded paths include `.git`, `.claude`, `receipts/`, `__pycache__`, `*.pyc`, binaries, build output, and vendored source trees.

## Qualification status

The transfer receipt and integrity test are authored in this lane. The independent package uses `packages/bun-vu/clippy.toml` to clear only inherited Bun-engine `disallowed-methods`, `disallowed-macros`, and `disallowed-types` policy because this standalone workspace has no `bun_core`, `bun_sys`, or `bun_threading` dependencies. It adds no Clippy `allow` entries; workspace `all = warn` and gate `-D warnings` remain active.

The original offline gate was check 0, test 0 (18 Rust tests), Clippy 101. The Clippy failure came from root engine-only bans on `std::env`, `std::fs`, `std::println`, and `str::lines` in the standalone package/build scripts. After adding the package-local policy config, the serialized owner script `/home/ubuntu/.aphrody/workspace/codex-relay-2026-10-09/vu-native-gates.sh` completed check, test, and strict Clippy with exit 0, using `PYO3_CONFIG_FILE=/srv/aphrody-build/workspaces/vu-wsl/build/pyo3-config.txt`, `CARGO_TARGET_DIR=/home/ubuntu/.aphrody/workspace/codex-relay-2026-10-09/vu-gate-target`, the shared Cargo lock, and two jobs. `cargo fetch --locked` had acquired only `libc 0.2.190` and `portable-atomic 1.15.0`; `Cargo.lock` remained unchanged. The final aggregate Bun suite including this receipt test and the conformance skip test ran 67 tests: 52 passed, 15 environment-dependent skips, 0 failed, 310 assertions.

`packages/bun-python-conformance` adds a POSIX C ABI driver and Bun runner for the real `bun_py_abi_version() == 1` / `bun_py_main(argc, argv, out_exit_code)` host contract. It requires the actual installed `BUN_PYTHON_EXECUTABLE` as `argv[0]`, passes the created venv's real executable for venv checks, and never infers a prefix from the current working directory. It first calls `aphrody_py_load(BUN_PYTHON_LIBPYTHON)` and does not call `aphrody_py_init`; the active host remains loaded until that driver process exits. Source, host, libpython, executable, and log SHA-256 provenance is in `packages/bun-python-conformance/native-host-provenance.json`.

One actual run used the transported immutable source proof and built `libbun_python_host.so`. ABI loading, UTF-8 argv, `-m`/`sys.path`, venv creation/executable/prefix, UTF-8 stdio, stdin, `-c`, traceback, and `SystemExit` terminal behavior passed. Specifically, `SystemExit(7)` terminated with process status 7 and `SystemExit(-1)` with status 255 before `bun_py_main` returned; the gate now records those as true terminal statuses and does not claim `out_exit_code` was written. The run ended `open`/77 because PyTorch was absent, CUDA hardware and driver were unavailable, and no weights were configured. This direct C ABI run does not establish installed Bun runtime activation. Mixed Python/JavaScript values, Rust FFI, zero-copy ownership, GC roots, callbacks, cancellation, thread teardown, Windows driver behavior, and model inference remain open. No Bun engine build, runtime installation, activation, or publication is part of this batch. No startup, size, or memory improvement is claimed.

This batch closes only the `vu` runtime ownership transfer into an optional Bun package. It does not close the broader Aphrody LAYERS objective, Windows/System32 APIs, COSMIC, .NET hosting, Tauri/CEF packaging, or full shared-CPython integration.
