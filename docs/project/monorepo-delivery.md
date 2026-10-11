# Source-pinned monorepo delivery

`scripts/aphrody/monorepo-delivery.ts` inventories Git objects at an immutable
revision. The inventory contains npm and Cargo manifests, vendored Git tree
identifiers, native build recipes and commit pins, dependency declarations,
lockfile hashes and Cargo registry checksums. Regression fixtures are excluded.
Reading another revision never changes the checkout or its dependency locks.

```sh
bun scripts/aphrody/monorepo-delivery.ts --ref HEAD --out delivery.json
bun scripts/aphrody/monorepo-delivery.ts --check-upstream --check-registry --out delivery-qualified.json
bun scripts/aphrody/monorepo-delivery.ts --operation build --out build-plan.json
bun scripts/aphrody/monorepo-delivery.ts --operation release-check --out release-plan.json
```

Remote HEAD observations come from the existing upstream remote and repository
URLs declared by vendor manifests and native recipes. They are observations,
not updated dependency pins. A vendor tree hash identifies the imported source
exactly but does not claim to be an upstream commit. Imports lacking upstream
commit provenance remain visible. Use the existing
`scripts/aphrody/sync-upstream.ts --dry-run` for Bun merge analysis; compatibility
gates and owner review of the resulting changes precede any pin update.

Build plans use the owner runtime factory (`bun run build:release`) and order
package build scripts by their internal dependencies. Cross-target checking and
strict locked Clippy follow the runtime build. Every public source-only npm
package is then materialized with `bun pm pack --ignore-scripts`, after declared
build scripts have run. Packing retains source and notices; it is not registry
publication or proof of missing native binaries. Runtime/native/MDX/WebKit
platform pipelines and their exact workflow blobs remain in the inventory.
Those packages require their qualified platform artifacts and are reported as
such rather than blocked because source-only packages lack build scripts.
Release plans reuse the
existing vendor, crate and npm publishers. `release-check` stages and validates
without registry publication; `release-publish --apply` runs their publication
adapters. Native platform packages, runtime archives and the WebKit inspector
retain their separate qualified artifact pipelines. Products without an adapter
are reported explicitly. The runtime factory builds its native dependency graph;
an npm package without a build script is not thereby a qualified release.

All operations plan by default. Applying a build or release requires a clean
checkout at the selected revision. Without a qualified factory profile, execution
is sequential. With a fresh profile, dependency-ready light steps overlap within
the measured CPU, RAM and disk budget; heavy steps use the shared factory lock.
Select a qualified build host and its resource permissions before applying;
DBFR production is not a compiler host. This tool neither provisions hosts nor
copies credentials. A partial pipeline requires explicit `--allow-partial`; it
never proves the entire monorepo has built or every source package has been
published.

Profile-qualified build and release operations can be submitted as detached
jobs. Submission writes an input-hashed receipt under the ignored local
`tmp/monorepo-delivery-jobs/<id>/` directory and returns without waiting for the
factory work. Repeating the same submission ID with the same inputs is
idempotent; reusing it for different inputs fails. The worker stores its report,
execution receipt and separate stdout/stderr logs beside the job record:

```sh
bun scripts/aphrody/monorepo-delivery.ts --operation release-check --profile factory.json --snapshot-hash <sha256> --apply --detach
bun scripts/aphrody/monorepo-delivery.ts --status --job <job-id>
```

The status command reports `launching`, `running`, `succeeded` or `failed`;
`launching` means the submitting process handed off the worker but its first
status write has not yet been observed. A detached worker still requires a
clean checkout at the exact source revision, a fresh capacity profile, and the
normal release gates. Install jobs can also be detached once their exact
registry report, target manifests and target directory are qualified:

```sh
bun scripts/aphrody/monorepo-delivery.ts --operation install --manifest delivery-qualified.json --target /absolute/consumer --allow-partial --apply --detach
```

The worker rechecks the report and target hashes after handoff, then holds a
per-target install lock while downloading and applying exact artifacts. A
crashed worker can leave that lock behind; inspect its job receipt and target
before clearing it. Reconciliation never replays the install automatically.
GitHub Actions workflow runs likewise use GitHub's run identity and logs; they
are not local Bun delivery job records.

## One-click consumer installation

The registry check resolves exact source versions using the publication adapter's
package name. Unpublished versions, unsupported packages and missing concrete
versions are listed as unavailable. It never replaces an unavailable version
with `latest`. Registry integrity establishes artifact identity; the associated
source revision identifies the inventory requesting that version, not an
independently proven npm build provenance attestation.

```sh
bun scripts/aphrody/monorepo-delivery.ts --check-registry --out delivery-qualified.json
bun scripts/aphrody/monorepo-delivery.ts --operation install --manifest delivery-qualified.json --target /absolute/consumer
# Apply the reviewed plan; --allow-partial explicitly selects available packages.
bun scripts/aphrody/monorepo-delivery.ts --operation install --manifest delivery-qualified.json --target /absolute/consumer --allow-partial --apply
```

Installation downloads only HTTPS npm registry artifacts, verifies their
SHA-256/384/512 integrity, retains each archive by its content hash under the
consumer's `.bun-delivery`, and invokes `bun add --exact` with those verified
archives. Authentication remains in the existing provider stores. Bun's consumer
lockfile records installation results. Runtime installation remains owned by
`scripts/aphrody/install.sh` or `scripts/aphrody/install.ps1`, including the
Windows executable-directory setting; Rust libraries are dependencies rather
than installable executables.
