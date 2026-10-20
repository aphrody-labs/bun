# Release readiness — 2026-10-20

The requested delivery is a stable unified Bun Video package on npm and a working
deployment at `https://video.aphrody.com`, qualified using the Shenron catalogue.
This audit is not a release receipt. No new media, package or deployment test has
passed during this audit.

## Observed state

| Surface | Observation |
| --- | --- |
| Source | `packages/bun-video/package.json`: `1.4.4-video.3` |
| npm registry | `latest`: `1.4.4-video.0`; `next`: `1.4.4-video.1` |
| Requested site | HTTPS HEAD returned HTTP 404 |
| Supplied fixture | `C:\src\shenron\data\episode\Dragon+Ball+Super+Beerus+-+02+VOSTFR.mp4`, 284,260,952 bytes |
| Local runtime | Aphrody doctor recognizes `1.4.6-canary.1`, revision `169d8c5ea` |
| VPS reachability | Native Aphrody `infra ssh status --host vps --json` failed: SSH connection to `10.200.77.1:22` timed out |
| Infra source | Expected `C:\src\aphrody\docs\operations\cloud\CLOUD-READY.md` is absent; GitHub file retrieval returned 404 |

The archived native Windows CLI was found under
`~/.aphrody/releases/aphrody-native-21ff48ba62/native/aphrody.exe`.
It exposes `infra ssh exec`, but service catalogue inspection requires the absent
Infra owner's `tools/config/service-catalog.json`. Do not invent a service, port,
SSH route or deployment target from these missing inputs.

## Qualification and ownership gaps

The repository owner requires builds and qualification on the VPS only.
`scripts/run-library-build.ts` and `scripts/run-package-qualification.ts` currently
import `bun:windows` and reject other hosts. The release workflow uses Windows
and exact-source native full-release receipts. Supporting VPS qualification
therefore requires adapting the actual native asset build and isolated consumer
path, not simply deleting the platform guards or skipping publication checks.

`scripts/publish.ts` requires the exact archive's successful outside-consumer
receipt, registry-sourced types, export checks and the current runtime revision.
Keep those checks when consolidating the qualification runner.

The existing data-site server is documented as a loopback workshop. Its Host
and Origin checks and private catalogue handling need explicit review before
using it as the public service. A local server starting does not qualify the
requested public domain.

## Remaining delivery gates

1. Restore the canonical Infra source/catalogue and VPS reachability; read
   `CLOUD-READY.md`, inspect the native host catalogue, then plan before apply.
2. Resolve the current Shenron catalogue's episode ID for the supplied **02**
   fixture. The historical Beerus **01** mapping in
   [Shenron episode assets](shenron-episode-assets.md) is not its identity.
3. Consolidate the existing library build and consumer qualification for the
   VPS's target. Reuse one shared factory lane and existing outputs.
4. Qualify source checks, protocols, native decoding and transformations,
   remux/frame/audio readback, worker cancellation and the outside-package
   consumer. Qualify renderers, encoding and GPU paths separately.
5. Exercise the supplied episode and a bounded catalogue sample without
   modifying source media. Keep media, cookies and signed URLs out of Git,
   npm and the public deployment.
6. Publish only the exact qualified archive; read back registry version and
   integrity. A prerelease `next` publication alone is not a stable release.
7. Deploy through the Infra owner, then verify public HTTP, browser playback,
   seeking, subtitles, jobs and error paths. Record the deployed revision and
   actual results, and synchronize PC/VPS at the delivery boundary.

Earlier results and their limits remain in [Qualification](qualification.md).
