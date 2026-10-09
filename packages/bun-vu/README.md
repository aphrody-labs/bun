<!-- SPDX-License-Identifier: Apache-2.0 -->
# @aphrody/bun-vu

Optional packaging and lifecycle package for the real `vu` Python runtime. `vu` remains the inverse-`uv` product: it launches pinned, unmodified `uv` and `ruff` sidecars and provides an embedded CPython CLI through the separately owned runtime crates. This package contains the runtime's actual Bun fetch, forge, assembly, manifest, smoke, installation, and shared-libpython scripts and their script tests. Its presence adds no dependency to Bun's default Cargo graph.

## Source and ownership

The packaging implementation was transferred from `aphrody-labs/vu` at commit `6ea52f1aada7269d81470dd9d93144555610868e`. File SHA-256 values and upstream pins are recorded in `provenance.json`. `vendor.json` preserves the exact `uv`, `ruff`, `PyO3`, and python-build-standalone refs, asset hashes, and upstream lock metadata. Source checkouts are fetched only into ignored `vendor/` when explicitly requested; they are not copied into Git or into the Bun binary.

The launcher and PyO3 runtime crates are already present in this checkout at base commit `3eb98a38` and match the source crate files recorded in `provenance.json`; their Cargo workspace manifest is integrated with the Bun fork. They are outside this lane's edit ownership. The source checkout used for provenance is `/srv/aphrody-build/workspaces/vu-wsl`; it remains read-only. `bun-runtime-sdk` remains the owner of existing `yolo-core`/PyO3 facilities. This package does not add a second CPython host to Bun: use the standalone `vu python` path until the explicit shared-host contract in `bun-python-native` is implemented and qualified.

## Fetch and package

Network acquisition is disabled unless `--allow-network` is supplied:

```sh
bun scripts/fetch.ts --allow-network
bun scripts/assemble.ts --target-dir <release-target> --out <artifact-store> --revision <source-sha> --target <rust-target>
bun scripts/smoke.ts <artifact>
```

The fetcher verifies pinned Git commits and CPython archive SHA-256 plus size. `uv` and `ruff` remain separate executables built with their own upstream `Cargo.lock` files; they are not Rust dependencies of Bun. The runtime artifact contains the CPython prefix, `bin/vu`, `bin/uv`, `bin/ruff`, component licences, and a file/link/target/ABI manifest. `bun scripts/forge.ts --allow-network` runs pinned sidecar and runtime builds, Rust tests and Clippy, assembly, and smoke checks. The coordinator owns the single final gate pass and host allocation; this transfer does not run it.

## Install and rollback

Install defaults to plan-only. `--apply` is required to copy and activate an artifact. `VU_HOME` defaults to `~/.vu`; receipt output defaults to `$VU_HOME/receipts` (override with `VU_RECEIPT_DIR`). Artifacts are immutable by version and revision; an existing artifact is verified and reused, never removed or overwritten. Activation atomically flips `current` while preserving `previous`; `--rollback --apply` switches those links. A target mismatch is refused before activation. Host installation and runtime activation are separate from source transfer and artifact assembly.

```sh
bun scripts/install.ts --from <artifact>
bun scripts/install.ts --from <artifact> --apply
bun scripts/install.ts --rollback --apply
```

## Shared CPython boundary

`scripts/shared-libpython.ts` retains the existing probe for loading the runtime's one shared `libpython` with `RTLD_NOW|RTLD_GLOBAL` and exercising an abi3 extension. It is a compatibility probe, not a second production host or authorization boundary. The future Bun-hosted CPython API belongs to `bun-python-native`; its owner must define handle ownership, thread/GIL behavior, finalization, ABI negotiation, allocator/lifetime rules, and permission checks before this package uses it.

## Licence

This package is Apache-2.0. `NOTICE` records the separate licenses of uv, ruff, PyO3, CPython, and python-build-standalone. Runtime artifacts carry each component's license files as before.
