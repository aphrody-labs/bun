# Core source migration to Bun

Inventory taken on 2026-10-13 with `aphrody workspace code-edit search --engine
text` over the selected `packages/engine/core/src` source tree. This is source
inventory, not evidence that the native providers have been replaced.

The 78 selected core source files contain these domains:

| Domain | Files | Bun migration owner or required work |
| --- | ---: | --- |
| host | 8 | Native platform owners; preserve explicit host configuration |
| sys | 7 | Bun process/platform APIs; remove runtime SDK artifact loading |
| gemma4 | 6 | Native model capability owner, including inference and lifecycle |
| redis | 6 | Bun Redis/Valkey contracts and vector operations |
| vfs | 5 | Bun file/Glob APIs and explicit checkout/home configuration |
| vendor | 5 | Bun package/Cargo source ownership and dependency registry |
| distribution | 5 | Bun artifact/release owners; remove SDK native runtime receipts |
| tools | 4 | Canonical Bun tool contracts; retain the single Aphrody MCP facade |
| server | 4 | Bun.serve; caching proxy transferred to Bun Google |
| compiler | 4 | Bun build/parser tooling; replace SDK tooling re-export |
| fleet | 4 | Host-specific infrastructure owner, separate from local runtime |
| monitor | 3 | Bun process/file/SQLite owners and lifecycle contracts |
| units | 2 | Host-specific service management and native supervisor; separate catalog.json source asset |
| verify | 2 | Bun quality scheduler and test/build owners |
| runtime | 2 | Replace native Yolo ABI engine; do not transfer its FFI loader |
| scaffold | 2 | Bun project creation and canonical Web templates |
| curation | 2 | Bun repository/source editing owners |
| coord | 2 | Workspace coordination and claim ownership |
| python | 1 | Native bun:python; remove SDK loader |
| ledger | 1 | bun:sqlite; retain protected database ownership |
| math | 1 | Bun-owned utility source |
| pm | 1 | Bun package manager |
| index.ts | 1 | Retire legacy aggregate exports after consumer switches |

The only declared core runtime dependencies are `@aphrody/runtime-sdk` and
`@oxc-project/types`. The SDK is referenced in nine core modules, with eleven
import/re-export sites. Its actual source owner is `packages/engine/runtime`,
containing seventeen TypeScript modules: artifact, browser, bundler, compute,
desktop-artifact, desktop, ffi, gpu, index, modules, preload, privilege, python,
release, target, tooling-schema and tooling. It declares `@aphrody/web-source`.
The index, compute, GPU, Python and FFI modules load external native libraries;
copying or renaming them would preserve the legacy runtime. Their native
capabilities and provider lifecycle must move into Bun instead. Browser already
re-exports the Web source owner; compiler/native re-exports SDK tooling.

Priority is to switch the standalone Bun consumers first, then replace the
SDK-backed core runtime/sys/compiler/distribution contracts, followed by their
model, supervisor and GPU providers. The remaining source domains require
consumer-by-consumer qualification before source removal. No credentials,
cookies, sessions, databases, datasets or models are included in this transfer.

The caching proxy is independent source with no imports or native Yolo ABI.
Its source checkpoint is Aphrody commit
`d3bba1bf24820a9c4db7b2c73fd4f79ce230017d`. The Bun owner is
`packages/bun-google/src/edge-proxy.ts`, exported as
`@aphrody/bun-google/edge-proxy`; Google Fonts now imports that owner. Existing
loopback cache tests move with the source, using the Bun harness temporary
directory and no timed sleep. The Aphrody source remains until the consumer
switch, publication and host gates qualify; its retention is not runtime
dependency or a claim of full migration completion.
