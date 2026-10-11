# Omar source and public Bun owners

The owner requested the complete `aphrody-labs/omar` source to be cloned under
`vendor/` and its reusable capabilities migrated into generic Bun owners.
`vendor/omar` preserves the complete tracked source snapshot at
`d565a5a67d570e3648c091c351698781fb24bf54`. The upstream repository remains private;
all source bytes are tracked here so public consumers need no upstream access.
The initial Git clone metadata stays outside the published source tree.
The local `.gitattributes` preserves upstream blob bytes without line-ending
normalization; it is vendoring metadata, outside the upstream file inventory.

The upstream source inventory records every tracked file's Git blob, SHA-256,
size, owner path and disposition. Generate with
`bun run scripts/aphrody/vendor-omar.ts --write`; verify with the same command
without `--write`. It checks the pinned clean snapshot, owner presence and hashes.

| Capability | Public owner |
| --- | --- |
| Service commands, Windows Jobs, restarts, health, status | `@aphrody/supervisor/services` |
| Caller-reviewed NSSM installation plan | `@aphrody/supervisor/windows-service-plan` |
| MFT baseline and transactional USN replay | `@aphrody/bun-tools/indexing` |
| PE scans, imports/API sets and hardlink coverage | `@aphrody/bun-tools/indexing` |
| Explicit SQLite metadata publication to Redis | `@aphrody/bun-tools/indexing` |
| Source domain indexing and resource metadata | `@aphrody/bun-tools/indexing`, native `bun:graph` |
| Checked independent legacy index conversion | `@aphrody/bun-tools/indexing` |
| Bounded periodic task service | `@aphrody/bun-tools/task-service` |
| Configurable SOCKS5-to-CONNECT proxy | `@aphrody/bun-tools/connect-proxy` |
| Windows snapshot/event stream | `@aphrody/bun-tools/system-stream` |
| Metadata explorer, cache/services diagnostics, assistant | `@aphrody/bun-webos` |
| Tailwind/M3, desktop examples and existing applications | Existing WebOS/Tailwind packages |
| Native inventory, guarded VFS writes and MCP | Existing Bun host/VFS/MCP owners |
| Engine builds, installer, release and plugin setup | Existing build/release/plugin workflows |

The migration removes operational dependence on the Omar snapshot. Imported
modules read no personal Redis configuration, service catalog, browser profile,
cookies, model directory or credential file. Ports, paths, source domains,
volumes, tables, service commands and assistant models come from the caller.
No blanket feature flag activation is performed.

`historical-host-input` means a machine-specific service manifest, Nginx config,
container configuration, SSH public key or runtime record retained only as
upstream provenance. Public equivalents are caller-supplied service commands,
WebOS options and cache/proxy configuration. `superseded-host-maintenance` means
one-time personal cleanup/consolidation/checkpoint scripts whose underlying
guarded VFS capability already exists. Their destructive host lists are not
replayed. `existing-native-workflow` and `existing-plugin-owner` reuse the actual
build/installer/release/MCP owners instead of copying personal bootstrap scripts.

WebOS and Tailwind already contained most upstream application files; source
provenance remains singular. WebOS now exposes the generic explorer and optional
integrations, includes production worker bundling, and stages a caller-provided
factory-built WASM artifact with a verified hash. Staging does not compile or
certify a new WASM runtime.

The root upstream snapshot has no tracked LICENSE file. Its WebOS manifest
declares Apache-2.0; the destination preserves that license and attribution.
Supervisor/tools retain their existing MIT declarations under the owner's
explicit migration request. The upstream snapshot is not relabeled. No runtime,
database, profile, model or private data from Omar's machine was transferred.

These packages expose public source entrypoints and publication metadata.
Source delivery, registry publication and host activation are separate gates.
Qualification on 2026-10-11 used the changed native Bun 1.4.4 debug factory
(`4b7c53fb290409f026e628e09b5d2b80cdb76d32`): 70 tests passed, none failed,
and two existing POSIX supervisor tests were skipped on Windows across six files
(270 assertions). The WebOS four-file gate independently passed 38 tests,
including Fluent/browser and public-asset coverage. Scoped TypeScript checked
61 files; oxlint, oxfmt and diff whitespace checks passed.

The public WebOS archive was installed into a fresh consumer project with the
changed native runtime. Its bundled canonical Tailwind 1.4.4 source hash was
preserved, and HTML, compiled CSS and JavaScript returned HTTP 200. Its published
dependency range permits the existing registry release while retaining the
bundled owner version. Public package archives are downloadable artifacts;
this does not claim an npm 1.4.4 registry publication.

`packages/bun-webos/public-site` supplies a separate static introduction and
browser-only demonstration for the additive Aphrody `/labs/webos/` route. It
contains no host, private database or model endpoint. The original private Omar
console and its service configuration remain separate deployment owners.
