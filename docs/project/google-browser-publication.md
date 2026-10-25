# Google and browser publication boundary

Historical preparation inventory, verified on 2026-10-11 before the SDK upload.
The registry observations and dependency blockers below describe that earlier
snapshot, not the current registry state. The subsequent
[Google and Chromium SDK 1.4.4 release](google-chromium-release-1.4.4.md)
records the published packages, source revision and qualification boundaries.
On 2026-10-11, the three npm versions in that release were verified again against
their uploaded archives: all registry SHA-512 integrities matched.
Registry state must still be checked immediately before any new upload.

## Public interfaces and owners

`bun:chromium` is the runtime CDP capability. `bun:chrome` resolves to that same
built-in module and cache identity. `bun:google` provides the native REST transport,
public runtime configuration and existing Chromium, Obscura and DNS aliases.
These colon imports ship in the Bun executable; they are not npm packages or
separate Chromium engines.

| Target                                                                                                                              | Manifest or owner                    | Publication boundary                                                                                       |
| ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `@aphrody/bun-google`                                                                                                               | `packages/bun-google/package.json`   | Source SDK, stable `1.4.4`; requires a runtime containing `bun:google`                                     |
| `@aphrody/bun-types`                                                                                                                | `packages/bun-types/package.json`    | Stable `1.4.4` already exists; stage the changed types as `1.4.4-aphrody.1` using the existing fork policy |
| `@aphrody/bun-runtime` and platform packages                                                                                        | `scripts/aphrody/publish-runtime.ts` | Publish only verified native executable assets                                                             |
| `bun_browser_ssrf`, `bun_browser_dom`                                                                                               | `src/browser/crates/{ssrf,dom}`      | Canonical light Rust owners; dry-run packaging passed                                                      |
| `bun_google`                                                                                                                        | `src/google`                         | Bun Google SDK (search, language atlas, project contract), root workspace member                           |
| `aphrody-boq`, `aphrody-antigravity`, `aphrody-gemini-web`, `aphrody-gemini-runtime`, `aphrody-model-antigravity`, `aphrody-google` | aphrody-labs/bun-os `crates/`        | OS integrations over `bun_google`; published from the OS                                                   |
| `bun_browser*`, `bun_browser_engine`, `bun_x`                                                                                       | `src/browser/crates`, `src/x`        | Canonical browser and X owners in the root workspace                                                       |

The subsequent SDK batch adds `@aphrody/bun-chromium` as a real source facade:
exact builtin reexports, explicit-input commands, types and identity tests. It
contains no browser executable and qualifies separately from native engine assets.
No `@aphrody/bun-chrome` package is needed because its builtin shares Chromium's
identity. The `@aphrody/web-source` integration package remains private.

## Preparation and gates

The existing npm publisher exports tracked package blobs from an immutable HEAD,
adds the repository license, verifies packed contents and records source hashes.
Its `bun-google` selection is a runtime-coupled source package and requires no
engine build. The successful preparation command is:

```sh
bun scripts/aphrody/publish-npm.ts --dry-run --stable --no-build --only bun-google --out <approved-temporary-directory>
```

The first preparation used source
`b55a418351ad075dc04d0b5f853c17b2764d64a9` and packed 12 files. Repeat after
the publication configuration is committed. Actual upload requires the qualified
Aphrody runtime matching the source version and a clean source-pinned checkout.
Review the staged package, integrity and runtime fixture results before upload.

The browser and Boq Cargo preparation used `cargo publish --dry-run --no-verify
--locked --allow-dirty` against each exact manifest. This validates packaging and
registry resolution without compiling or uploading; it does not replace their
check, test and strict Clippy gates. The existing crate publisher now selects
these light owners explicitly.

The Google workspace lock was regenerated through Cargo after DOM unification.
Publication preparation now reports missing registry dependency owners: Boq for Gemini Web, proc for Antigravity, and Antigravity for Model Antigravity. Antigravity also
depends on the pinned `aphrody-proc` owner; Gemini runtime depends on
`aphrody-proc`, `aphrody-config` and `aphrody-mcp-client`. None of those owner
names was present on crates.io during this inventory. Publish dependency owners
first and prove the normalized registry dependency closure before selecting the
Google trio. A versioned Git dependency does not establish registry availability.

Runtime release uses the existing factory receipt and GitHub release workflows.
The receipt must identify the immutable source, executable version, hashed assets,
required gates and native platform tests. The stable integration policy still
lists renderer, browser and JSC/V8 parity blockers. Alias tests do not qualify
Chromium binary artifacts or remove those blockers.

## Live registry and authentication metadata

npm reported account `yohan971`; GitHub reported active account `aphrody-dev`.
The repository declares secret names `NPM_TOKEN` and `CARGO_REGISTRY_TOKEN`.
Their presence does not prove upload permission or validity. No credential values
were read or stored; no login or protected-store mutation was performed.

During inventory, npm returned 404 for the new Google SDK and both proposed
browser package names. Runtime latest was `1.4.3-aphrody.2`; types latest was
`1.4.4`, with no `1.4.4-aphrody.*` versions. The checked Google, canonical browser
and Obscura crate names returned 404. GitHub's newest runtime release was
`aphrody-v1.4.3-aphrody.4`; `bun-v1.4.4` did not exist. Existing runtime assets
covered Windows x64, Linux x64 and Linux x64 musl, with checksums. These older
assets do not prove inclusion of the new built-ins.
