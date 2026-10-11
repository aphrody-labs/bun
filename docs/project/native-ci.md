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
The observed old fusion checkout is absent and the existing VPS Bun checkout is
dirty, so neither is silently reset or adopted. Deployment remains blocked until
Infra qualifies a clean declared checkout and the sibling source allocation.

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
