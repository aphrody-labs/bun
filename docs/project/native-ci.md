<!-- SPDX-License-Identifier: Apache-2.0 -->

# Native CI through the existing Infra factory

The Bun coordinator delegates execution, source verification, detached jobs and
heavy/source locks to Aphrody Workspace's `build-factory.ts`. Serialized Cargo
retains its own owner lock and shared sccache. There is no additional runner or
lock implementation. `build-fleet.ts` retains host scheduling authority.

From the Bun checkout:

```sh
bun scripts/aphrody/native-ci.ts plan --revision <full-40-character-sha> --id native-unique-id
bun scripts/aphrody/native-ci.ts run --revision <full-40-character-sha> --id native-unique-id
bun scripts/aphrody/native-ci.ts status --revision <full-40-character-sha> --id native-unique-id
```

Plan exposes every fixed command. Run dispatches one detached owner job. Status
reconciles that job without replay. The worker records gate exit codes, log
hashes, source revision and pipeline hash under the factory artifact allocation.
An existing run directory is never overwritten. The first failed gate stops the
pipeline. Strict Clippy failures remain failures. The installer source batch
`5d3b1e47` passed Windows check, strict Clippy with zero diagnostics and 25 native
tests, with two platform-dependent skips. The complete Linux pipeline still
requires its own successful receipt.

Each Clippy gate explicitly selects its source owner's `CLIPPY_CONF_DIR`.
Google and Web are standalone provider workspaces: their checked-in `clippy.toml`
files preserve Aphrody's default configuration, while their Cargo workspace lints
and `-D warnings` remain enforced. The installer selects the Bun root configuration,
including its runtime API restrictions. Inherited process configuration cannot
replace these selections. The plan and gate hash include these relative paths;
the worker resolves them within the pinned checkout. No lint allowance or warning
suppression is introduced, and no Bun engine dependency is added to providers.

Infra's build-factory configuration and Bun's fusion-factory configuration must
declare the same `bun-os` checkout. Both the Bun source and sibling Aphrody Cargo
wrapper must be provisioned and pinned through their existing source owners.
Prepare through the owner CLI before execution; preserve foreign dirty files.
On 2026-10-11 the declared VPS checkout was reconciled without a reset: eight
tracked changes were checksum-backed up and retained in a verified stash before
owner preparation. Generated Cargo caches remain preserved in each standalone
provider's anchored `target/` exclusion. Source files and other untracked paths
still participate in the clean-source guard. The first pinned run passed Google
compilation and tests, then failed Clippy; full Linux qualification remains pending
until a subsequent immutable run records all fourteen successful gates.

The `rust-dependencies` gate runs before installer Cargo gates. It preflights all
root and `src/` Cargo path dependencies, then provisions only the missing pinned
`lolhtml`, `rust-argon2` and `uutils` sources through the existing build fetcher.
Pins and patches come from their build dependency owners. All three destinations
are checked before any download; unknown or mismatched existing sources and
escaping symlinks are preserved and rejected. Downloads stay in the checkout's
`build/native-ci-downloads` cache under the existing factory locks. Post-fetch
source stamps and Cargo package manifests must match. A matching `.ref` records
the source identity and patch contract, not proof that every vendor byte is clean;
the fetch owner preserves edits at a matching identity. This gate fetches source
without compiling an engine. It then derives every enabled archive source and patch identity from the native debug
build configuration and preflights those destinations before calling
`bun bd -j1 --profile=debug --ci=true --cache-dir=build/native-ci-downloads --configure-only`.
This owner command emits the build graph and Rust options without running Ninja
compilation. Resolving the owner's toolchain can install its pinned Rust channel
and rust-src component; this preflight is not a read-only tool probe.
The pinned Ninja tool may be acquired in the same scoped cache;
cross-target SDK provisioning is rejected. Unknown archive directories block
configuration instead of reaching the build owner's stale-source invalidation.
The resulting `build_options.rs` must be canonical, contain the immutable source
SHA and have its content hash recorded in the gate log.
The generated Cargo configuration must be absent or match the hash previously
recorded by this gate. Unknown operator configuration is backed up privately and
preserved without invoking configure. Git-tracked configuration is never replaced;
the Bun source pin and clean status are checked again after generation.

The schedule is deliberately disabled in native-ci.json. Infra can plan and
activate a timer through its host catalog after qualifying the source allocation;
this script writes no service unit and starts no competing scheduler.

Publication always remains closed here. Linux factory success does not establish
Windows/macOS qualification, artifact hashes, installation or activation. Use the
existing release owner and its cross-platform artifact qualification before any
publication. Credentials remain host-local; no token appears in configuration.

Buildkite self-hosted agents require a new account and agent token. Woodpecker
requires a server, OAuth and a container worker. The existing Bun/Infra factory
avoids those new authorities and services while retaining source pins and locks.
No GitHub Actions workflow is removed until replacement execution qualifies.
