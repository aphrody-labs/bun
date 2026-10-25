# Bun Video delivery — 2026-10-11

The session's protocol adapters, native capture orchestration, six laboratories,
multilingual PWA and MV3 extension are consolidated in `packages/bun-video`.
Legacy scripts forward to that package. The artifact preserves package-local
worker and browser assets and uses pinned official upstream dependencies.

Note (2026-10-25): `packages/bun-video` is now the optional submodule
[aphrody-labs/bun-video](https://github.com/aphrody-labs/bun-video); mount it with
`git submodule update --init --checkout --recursive packages/bun-video`
([Add-ons](../project/add-ons.mdx)).

Source: [703305158ae29b3d99a354e74bba6b7866a94e35](https://github.com/aphrody-labs/bun/commit/703305158ae29b3d99a354e74bba6b7866a94e35).
Version: `@aphrody/bun-video@1.4.4-video.0`, requested npm tag `next`.
The source-pinned archive contains 72 public files and has SHA-256
`63ac74e53a48344a2321a4682db4eb074bae160dbbc5f8c9d8f88818c2985144`.
Cookies, HAR recordings, keychain descriptors and session configuration are excluded.

## Qualification

The changed Windows runtime passed 104 tests, zero failures and 1169 assertions
across 16 files. Scoped TypeScript, formatting and oxlint passed. An isolated
consumer installed the tarball outside the monorepo and verified 11 public
exports, three lazy library imports, six CLI help commands, the synthetic HLS
check and six loopback asset routes. Remotion's renderer retains its upstream
version guard and rejects the Windows API version `1.4.4-debug`.

The VPS consumer passed the same checks and also imported the official Remotion
renderer. Its CLI reports `1.4.3-aphrody.4`, while the actual API reports
`Bun.version = "1.4.3"` and revision
`41211b56872ca2957e5c037ad1756f56f8f89b7c`. This difference explains why the renderer
version guard passes there. Renderer import does not qualify composition rendering.

## npm submission

The Bun publish command returned success. Independent registry verification
observed only `0.0.0-stage`, a temporary holding version whose readme states that
the operational version was submitted for review and awaits staged release.
The requested version and `next` tag are therefore not qualified as publicly
installable. No alternate publication or review bypass was attempted.

Check the exact registry version and tarball bytes before claiming availability:
[registry package metadata](https://registry.npmjs.org/@aphrody%2fbun-video).
Local receipts are under ignored `tmp/test/publication/1.4.4-video.0`.

## Private VPS artifact

Plan and application used the Infra owner CLI. A stalled rclone dry-run was
stopped without transfer; native Infra SFTP uploaded only the public archive,
consumer probe and source/hash pins. SHA-256 was verified before installation,
after promotion and during an independent readback.

The immutable consumer is installed at
`/home/ubuntu/build/artifacts/bun-video/1.4.4-video.0-703305158ae2`.
`/home/ubuntu/build/artifacts/bun-video/current` points there atomically.
`deployment-receipt.json` records the exact source, artifact and checks.
There was no previous current target; no previous release was removed.
Rollback consists of removing only this new current pointer or selecting a
previous qualified release once one exists, preserving the immutable artifacts.

No persistent service, DNS/TLS route or authenticated session was deployed.
The consumer smoke server was stopped after its checks. DBFR was unchanged.

## Remaining limits

Authenticated Crunchyroll playback, DRM, live provider OAuth configuration and
installation into the active Google Chrome remain unqualified. The local PWA
server continues on `http://127.0.0.1:8000/pwa/`; credentials remain in the owner's
Windows keychain and protected local store.

The former root `crunchyroll-extension` and `crunchyroll-pwa` directories were
removed. Their canonical copies are packaged under `packages/bun-video/assets`.
