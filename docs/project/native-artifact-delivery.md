# Native artifact delivery

`scripts/aphrody/delivery-native.ts` maps the existing runtime, Node-API,
MDX and WebKit inspector workflows to immutable source plans. It reads each
workflow and its dispatch inputs from Git objects, records its blob and SHA-256,
and retains its product and artifact contract. The repository must already be
an authorized remote. Plan generation does not execute a build or publication.

```sh
bun scripts/aphrody/delivery-native.ts --pipeline native --ref main --remote --out native-plan.json
bun scripts/aphrody/delivery-native.ts --pipeline mdx --ref main --remote --out mdx-plan.json
bun scripts/aphrody/delivery-native.ts --pipeline inspector --ref main --remote --out inspector-plan.json
bun scripts/aphrody/delivery-native.ts --pipeline runtime --ref main --remote --out runtime-plan.json
```

The three plugin workflows support `dry-run=true`. A dry run builds and performs
the existing platform smoke tests and stages packages without npm publication.
Runtime workflow dispatch has release-asset side effects even when npm publication
is disabled, so runtime qualification is not represented as a harmless dry run.
Its plan requires explicit `--publish`; this adapter always sets
`publish-npm=false` for runtime dispatch. Any publication dispatch requires a
selected source tag, never a moving branch. An explicit version must match the
source base version.

Native and MDX workflows accept an explicit `--platforms` matrix subset; the
default retains every platform. Remote qualification verifies that the pinned
bootstrap release actually provides each selected platform's smoke-test runtime.
The observed `aphrody-v1.4.3-aphrody.4` release provides Linux x64 GNU/musl and
Windows x64, so Mac and Arm matrix lanes remain blocked until their runtime
artifacts exist. Selecting three available lanes does not qualify all platforms.

Before applying a dispatch, the adapter checks that the remote ref matches the
planned source SHA, the workflow is active, and repository guards allow the
selected destination. The four owner workflows permit `aphrody-labs/bun` and
the private `aphrody-labs/bun-os` (the mirror archived since as
`aphrody-labs/bun-os-legacy`); their qualified bootstrap is the explicit
published tag `aphrody-v1.4.3-aphrody.4` from the canonical runtime repository.
Private destination publication remains governed by the existing workflow and
provider authentication; no credentials are copied to plans or artifacts.

```sh
# After reviewing the plan and selecting available CI resources:
bun scripts/aphrody/delivery-native.ts --pipeline native --platforms linux-x64-gnu,linux-x64-musl,win32-x64-msvc --ref main --operation dispatch --apply --out dispatch.json
bun scripts/aphrody/delivery-native.ts --pipeline native --ref main --operation receipt --run 123456789 --out receipt.json
```

Use the exact run identifier returned by GitHub or listed for the dispatched
workflow and source SHA. The receipt checks the workflow path, run SHA,
completion, conclusion and required build jobs. Skipped builds never qualify.
It records actual artifact names, IDs, expiry and GitHub archive digests.
Those digests are server-reported until downloaded and independently verified.
The inspector workflow currently stages a package without uploading a build
artifact; that limitation remains explicit.

Workflow success is separate from registry publication and consumer installation.
Use [monorepo delivery](monorepo-delivery.md) to resolve exact published versions,
verify npm archive integrity and install into the selected consumer directory.
An inventory revision identifies the source requesting an npm version; it is not
an independent registry build-provenance attestation. Unavailable versions remain
unavailable rather than falling back to `latest`.
