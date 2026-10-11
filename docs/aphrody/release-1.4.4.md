# Bun 1.4.4 release

Release version: `1.4.4`. Source version: `1.4.4`. Release tag: `bun-v1.4.4`.

The owner requested repository-wide lint corrections, documentation and
infrastructure alignment, and publication to GitHub, npm, crates.io and the
production sites. The initial source preparation batch excluded builds and
tests. The owner's subsequent directive authorizes qualification on the SSH
VPS factory; heavy work remains excluded from the Windows workstation.
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

## Historical preparation inventory on 2026-10-11

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
not invoke that path from the workstation. Run qualified verification on the
serialized SSH factory before registry publication.

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
outside the pinned parser's grammar. Native compilation and test execution were excluded from the initial
preparation batch. The following qualification batch supersedes that limit
on the explicitly authorized VPS factory.

Use `aphrody infra ssh exec --host vps|dbfr` for host operations and follow the
plan-before-apply procedure in the Aphrody repository's
`docs/operations/cloud/CLOUD-READY.md`.

## SSH qualification batch on 2026-10-11

The single product version is **1.4.4**, with release tag **bun-v1.4.4**.
The Windows version synchronizer checked 848 tracked files and their coupled references
with no remaining coupled-version edits. Dependency versions and older
checksum-qualified bootstrap artifacts retain their own provenance.

The factory at `/home/ubuntu/builds/bun-browser-fusion` uses the existing
Infra heavy lease and at most six compilation jobs. Source overlays are
checked against archive inventories and SHA256 before integration.

The first candidate gate batch passed runtime HTML/JSC/APT/process tests
(204 passes, five existing host-specific skips), build configuration
(10 passes), fusion helpers (41), site and installers (36), console/assert
(35), portable COSMIC and WinRT metadata, and the existing native MCP.
Full built-in source lint passed with the candidate's native quality owner.
The type gates initially failed with 149 diagnostics; source and declaration
corrections are being integrated and must pass a fresh aggregate gate.
The rebuilt candidate also passes the environment-docblock, timers and graph
fixtures. These are scoped debug/ASAN results, not release performance or
cross-platform qualification.

The refreshed upstream ref on 2026-10-11 is
`6c1eb067e3c3943d2035bc165b241539c0b673b6`. It is already an ancestor of
HEAD `c82e6a6e3bd90511d44ada44819bbeda31ebaa76`: the ancestry check exits 0
and `HEAD..upstream/main` contains zero commits. The previous inventory of
11 missing commits and proposed merge conflicts is obsolete. These Git
checks do not qualify the uncommitted candidate overlays. The root browser
Cargo check, tests and strict Clippy remain pending a matching complete
receipt; the historical standalone browser workspace results do not qualify
that changed graph.

The owned WebKit source is clean at commit
`0c06faadf65bf8e8c8ad3a5a8aca83e1e9ed653f`. Ruby 3.3.8 was installed through
the native Bun APT adapter after a simulation, source/hash review and a
protected host-local APT/dpkg backup; dpkg audit is clean. The source JSC
build and release profiles still require separate factory receipts.

A Bun.WebView-owned Chrome 155 session qualified the fused site's desktop
and mobile menu/search, Aphrody logo, tokens/fonts and actual Material
Symbols assets. Chrome rendering remains distinct from the native JSC page
realm. The Google corpus receipt records 92 pages, 400 assets and eight
acquisition failures; its asset cap is explicit.

Current consumer observations are separate from the candidate: the owner
workstation remains on 1.4.3-aphrody.4, DBFR's shell runtime reports
1.4.3-aphrody.4. Omar's observations report 1.4.4+65c232c1d in the earlier
probe and 1.4.4+a2efe6945 at 07:40 on 2026-10-11 in the later agent report.
Different files or running processes may account for these revisions; neither
observation identifies a single installed artifact without its path and hash.
DBFR's production consumers
include older 1.4.3 Docker images. They must receive the exact verified
release bytes after artifact, installation and rollback qualification.

The runtime and native package GitHub workflows now consume factory
receipts rather than compiling on GitHub-hosted runners. Publication
requires exact source/version, artifact and log hashes, passing source
gates and native platform receipts. Stable full integration additionally
requires the pending renderer, shared CSS cascade and JSC/browser owners;
a version field alone does not satisfy these gates.

No stable 1.4.4 binary, runtime image, WASM port or comparative performance
claim is established by this source batch. The tag remains uncreated until
the immutable release source and required qualifications are complete.
