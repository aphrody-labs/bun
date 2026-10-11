# Bun 1.4.4 release

Release branch: `1.4.4`. Source version: `1.4.4`. Release tag: `bun-v1.4.4`.

The owner requested repository-wide lint corrections, documentation and
infrastructure alignment, and publication to GitHub, npm, crates.io and the
production sites. No builds or tests are authorized for this work batch.
Existing concurrent changes remain in the original checkout.

## Delivery checklist

- [ ] Finish the repository-wide lint pass and review corrections.
- [ ] Align first-party package and crate release versions and dependency pins.
- [ ] Align documentation and deployment scripts across the owned projects.
- [x] Commit the initial source preparation and push `1.4.4` to origin.
- [ ] Publish GitHub release assets with verified checksums and provenance.
- [ ] Publish npm packages, comparing any existing immutable version first.
- [ ] Publish Rust SDK and first-party crates.
- [ ] Publish runtime container images and the Aphrody site/downloads.
- [ ] Plan host updates, apply verified artifacts, then check live versions.

## Live inventory on 2026-10-11

| Destination                           | Observed version            |
| ------------------------------------- | --------------------------- |
| VPS Bun                               | `1.4.3-aphrody.4+41211b568` |
| DBFR Bun                              | `1.4.3-aphrody.3+d46f0ed6c` |
| GitHub latest release                 | `aphrody-v1.4.3-aphrody.4`  |
| npm `@aphrody/bun-types` latest       | `1.4.4`                     |
| crates.io `aphrody-bun-macro`         | `0.1.0`                     |
| crates.io `aphrody-bun-native-plugin` | `0.2.0`                     |
| crates.io `aphrody-n2b`               | `0.7.0`                     |
| crates.io `aphrody-oxc-bridge`        | `0.2.0`                     |

No GitHub release `bun-v1.4.4` was found. A source version change does not
provide a native runtime artifact. Use the existing owner release factory
artifacts only after checking the embedded version and release checksums;
never rename a 1.4.3 binary as 1.4.4.

The npm publisher's `--no-build` mode rejects selections whose preparation
requires a build and disables package lifecycle scripts during packing and
publication. Use `--stable --no-build --only <source-package-directories>` to
publish source packages at their exact manifest version. An existing stable
version must have identical packed content; otherwise publication stops rather
than silently publishing 1.4.5. Source publication preserves normal build gates
for packages that require compiled outputs.

The crates publisher runs Cargo check/test and publication verification. Do
not invoke that path under the no-build/no-test constraint.

The historical Linux candidate on DBFR has SHA-256
`85c8f00b5d4a2f6519850df72aec6f893358894d20663e667a46487bf273ee87`,
but its live `--revision` reports `1.4.4-canary.1+4e3ddd04d`. The historical VPS
build path no longer exists. Neither observation qualifies a stable 1.4.4
artifact. Host activation remains pending a verified stable artifact.

Deployment source defaults target `ghcr.io/aphrody-labs/bun:1.4.4` and
`bun-v1.4.4`; this is configuration alignment, not a claim that the image or
release assets have been published. Existing Alpine checksums remain tied to
their original release until matching 1.4.4 musl artifacts are available.

## Lint scope

Pinned Oxlint 1.70.0 covers scripts, first-party packages and built-in
JavaScript. Exact declaration, generated-payload and upstream-fixture rule
exceptions preserve ABI aliases, injected JavaScript, TypeScript declaration
merging and callback snapshots. Orderfile workloads deliberately exercise
errors and inefficient idioms; their measured bodies remain unchanged.
Templates containing Handlebars or newer ambient import-attribute syntax are
outside the pinned parser's grammar. Native compilation and test execution
remain excluded from this batch.

Use `aphrody infra ssh exec --host vps|dbfr` for host operations and follow the
plan-before-apply procedure in the Aphrody repository's
`docs/operations/cloud/CLOUD-READY.md`.
