# Crunchyroll native Bun migration plan

This plan records the owner's 2026-10-11 request to use Crunchyroll in the
existing authenticated Chrome environment for future live web and Chrome
qualification. It defines the remaining integration work; it does not claim
ownership of Crunchyroll infrastructure, permission to deploy its backend, or
successful live playback. Deterministic tests continue to use local fixtures.

## Existing implementation and evidence

[`@aphrody/bun-video`](https://github.com/aphrody-labs/bun-video/blob/main/package.json) is version 1.4.4
and remains private. Its explicit HLS, DASH/MPD, HAR, Bitmovin and Crunchyroll
exports retain one package rather than a duplicate player stack. The
[integration boundaries](https://github.com/aphrody-labs/bun-video/blob/main/docs/integration.md) and
[version fact check](https://github.com/aphrody-labs/bun-video/blob/main/docs/fact-check.md) distinguish
native Bun transport, inspection and serving from browser media decoding.

The [community-client migration](https://github.com/aphrody-labs/bun-video/blob/main/docs/crunchyroll-migration.md)
covers the historical `crunchyroll.js` 1.1.1 API using native fetch, isolated
authorization, deadlines, redirect refusal and safe status snapshots. Historical
endpoint compatibility still needs live qualification. Its locale defaults to
`en-US`; French behavior must be selected and verified explicitly. No device
activation API or server media decoder is implemented by this client.

The [Chrome app launcher](https://github.com/aphrody-labs/bun-video/blob/main/docs/chrome-app.md) selects
the unique active Chrome profile, opens an official site app window, and refuses
ambiguous profile selection. A shortcut and app window do not establish a PWA
installation. Chrome retains the account session and handles official playback.

The [installed Chromium qualification](../chromium/windows-install.md) records
Chromium 157.0.8099.0, a native System32 launcher and WebGPU compute
`[10,11,12,13]` on NVIDIA Lovelace without a fallback adapter. That isolated
local probe proves neither Crunchyroll authentication nor playback. Its runtime
was Bun 1.4.4 debug revision `4b7c53fb290409f026e628e09b5d2b80cdb76d32`;
current source changes require their own changed-binary gates. Chromium runs
separately over CDP; embedded Bun/JSC/V8 parity is not established.

## Delivery phases and owners

Root reported a live observation at 2026-10-11 18:34 UTC in the existing
Google Chrome session: the official watch player was playing at `0:04 / 23:17`,
with Japanese audio and French subtitles; account navigation included logout.
An activation tab was open but had not been inspected. This is an observed
official-browser baseline, not a migrated native Bun player/API qualification.

The official [device activation instructions](https://help.crunchyroll.com/hc/de/articles/9706698743956-Wie-aktiviere-ich-mein-Ger%C3%A4t-%C3%BCber-die-Website)
describe using a device-issued code on the activation page. They establish the
user-facing flow, not an API contract or authorization to deploy provider
infrastructure. The code submission remains outside this plan's browser checks.

| Phase                     | Work and owner                                                                                                                                                                                                    | Required exit evidence                                                                                                                                                                                              |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Inventory              | Bun video owner inventories installed SDK versions, exports, manifests, active Chrome discovery, official URLs and existing local fixtures. Root owns browser qualification; Shenron owns its reader integration. | Exact source revision, package locks, executable hashes and a redacted contract map; no inferred backend access.                                                                                                    |
| 2. Contracts              | Bun video owner describes catalog/profile/search requests, errors, cancellation, locale, playback lifecycle and session expiry using local fixtures and authorized browser observations.                          | Versioned schemas and tests; explicitly separate historical community endpoints from currently observed official behavior.                                                                                          |
| 3. Native adapters        | Reuse native Bun fetch, URL handling, loopback serving, MPD/HAR inspection and existing HLS/DASH lifecycle adapters. Add only missing contracts to the canonical modules.                                         | Scoped types, lint, format and changed-binary tests; no duplicated native decoder or generic credential proxy.                                                                                                      |
| 4. French UX              | Aphrody and Shenron owners connect their owned UI to those adapters, preserving official routing and French locale choices.                                                                                       | Navigation, accented search, subtitles/audio selection, empty/error states and expired-session behavior tested independently. French catalog availability is measured, not assumed.                                 |
| 5. Account and activation | Root verifies the official authenticated account and activation page in the existing Chrome environment. Device codes remain owner-controlled and are not submitted by this plan.                                 | Safe route/session evidence and explicit distinction between viewing the page, submitting a code and authorized device playback.                                                                                    |
| 6. Player                 | Bun video owner connects browser player lifecycle; root verifies an entitled title through the official player.                                                                                                   | Playback progress, seek, pause/resume, audio/subtitles, cancellation and cleanup with redacted receipts. Browser/vendor EME and licensed DRM remain the playback authority.                                         |
| 7. Infrastructure         | Aphrody Infra owner plans owned API/frontend delivery and factory placement using existing VPS/DBFR routes; Windows factory owner supplies Windows artifacts.                                                     | Access, capacity, source-pinned artifacts, rollback and health checks before apply. Crunchyroll backend migration requires separately granted service-owner source, infrastructure access and deployment authority. |
| 8. Release                | Root coordinates Bun video, Shenron and Aphrody delivery after their actual gates.                                                                                                                                | Version/source/hash receipts, registry availability, installed versions and public health verified separately. No universal release claim from a source commit.                                                     |

## Authentication and infrastructure contract

Use the active authenticated Chrome session for live UX. Do not export passwords,
cookies, OAuth tokens, signed manifest URLs, CMS signatures or DRM license
material into packages, Git, reports or memory. Browser observations must redact
query strings and authorization headers before persistence. HAR files stay in
protected ignored storage; retain only the minimum sanitized evidence required
to reproduce a contract. Do not distribute captured protected media.

Caller-owned credentials may enter the existing native client only through its
documented protected configuration. An authenticated browser does not imply
that a server process has API authorization. Test account expiry and missing
permissions as real failures, without replacing them with a successful mock in
live receipts. Do not reuse upstream embedded application credentials.

Owned infrastructure can provide the integration UI, local inspection tools,
configuration and health endpoints. Remote work follows `aphrody infra ssh exec`
with `--host vps` or `--host dbfr`, a reviewed plan, observed capacity and rollback;
DBFR remains a production host rather than a compiler factory. Route failures,
insufficient capacity, absent service-owner access, missing SDK licensing or
unavailable account entitlements are concrete delivery dependencies. They do
not authorize inventing a Crunchyroll backend, DRM implementation or activation
endpoint. No crawler, bulk download or load test targets the third-party service.

## Validation matrix

Current coordination references are `.coord/claims/browser-lab.json` for the
HLS lab, `.coord/claims/bun-video-dependencies.json` for package ownership,
and `.coord/claims/shenron-video-hls.json` for the shared SDK lifecycle.
These claims include released batches and historical blockers; recheck their
live status with the owners before editing. This plan claims only its own
documentation path, while root and the Bun video session own live browser input.

Machine-verifiable receipts must include `schema`, `phase`, `sourceRevision`,
`runtimeRevision`, `observedAt`, `checks` with command/exit code and artifact
hashes, and explicit `passed`, `failed` or `blocked` state. Browser evidence
records URL origin/path, profile selection method, selected locale, media
progress observations and redaction status. Require two increasing progress
observations to qualify continued playback; a single visible frame is only
startup evidence. Keep account identifiers and browser secrets out of receipts.

| Area          | Deterministic local gate                                                                                          | Live active-profile gate                                                                                                |
| ------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| API           | Loopback responses, URL encoding, pagination, isolated sessions, refresh races, deadlines and HTTP/JSON failures. | A small authorized request or official UI observation for each selected contract; endpoint changes recorded explicitly. |
| French routes | Fixture locale, route encoding, slug stability and UI error states.                                               | Official French navigation, displayed locale and selected content without changing account preferences unnecessarily.   |
| Activation    | URL allowlist, safe launcher plan and no code submission.                                                         | Official activation page opens within the existing session; code/device activation remains a separate action.           |
| HLS/DASH      | Manifest inspection, lifecycle setup/teardown, interceptors and cancellation against local media fixtures.        | Authorized official player progress and controls; record the actual browser and player integration.                     |
| DRM           | Configuration contracts and error propagation only.                                                               | Vendor/browser license acquisition with the entitled account; no extraction or bypass.                                  |
| GPU           | Existing local WebGPU compute and adapter receipts.                                                               | Observe real browser media/render behavior; WebGPU availability alone is not a decoder or playback-performance claim.   |
| Release       | Scoped types/lint/format/tests, dependency order and exact artifact hashes.                                       | Registry, installation and owned-site health checks after publication/deployment.                                       |

Run package tests through the repository owner wrapper, for example
`bun bd -j2 test packages/bun-video/test`. Coordinate the shared native factory
before compiling. An explicitly selected `-n` run uses an existing native
binary and must report its revision; it validates changed TypeScript behavior
without qualifying pending native source changes. Live UX is run by root and
the Bun video session in the existing browser, without replacing the profile
with a fresh unauthenticated test profile.

Each phase ends with an owned path commit and a short receipt listing source,
runtime, inputs, completed gates and remaining dependencies. Root consolidates
the results with the Bun video and Shenron sessions; their implementation and
production receipts remain authoritative for their respective surfaces.
