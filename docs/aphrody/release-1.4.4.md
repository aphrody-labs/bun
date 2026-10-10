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
- [ ] Commit owned changes and push the `1.4.4` branch to the existing origin.
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

The npm publisher prepares some packages by building them. The crates publisher
runs Cargo check/test and publication verification. Do not invoke these paths
under the no-build/no-test constraint. Publication and host activation remain
pending until appropriate artifacts and permitted publication paths exist.

Use `aphrody infra ssh exec --host vps|dbfr` for host operations and follow the
plan-before-apply procedure in the Aphrody repository's
`docs/operations/cloud/CLOUD-READY.md`.
