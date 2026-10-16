<!-- SPDX-License-Identifier: MIT -->

# Google and Chromium SDK 1.4.4

Published on 2026-10-11 from source commit
`34ccfafae0f0dd0d1daf6a1b1c38fbad8d3f4ec3`.

The [GitHub SDK release](https://github.com/aphrody-labs/bun/releases/tag/google-chromium-sdk-v1.4.4)
contains the three npm archives, SHA-256 checksums, source blob/hash manifests
and the verified crates.io publication report. All three npm registry SHA-512
integrities matched the archives uploaded by the existing release owner.

| Registry  | Package                                                                               | Version         |
| --------- | ------------------------------------------------------------------------------------- | --------------- |
| npm       | [@aphrody/bun-google](https://www.npmjs.com/package/@aphrody/bun-google)              | 1.4.4           |
| npm       | [@aphrody/bun-chromium](https://www.npmjs.com/package/@aphrody/bun-chromium)          | 1.4.4           |
| npm       | [@aphrody/bun-types](https://www.npmjs.com/package/@aphrody/bun-types)                | 1.4.4-aphrody.1 |
| crates.io | [aphrody-boq](https://crates.io/crates/aphrody-boq/1.4.4)                             | 1.4.4           |
| crates.io | [aphrody-proc](https://crates.io/crates/aphrody-proc/1.4.4)                           | 1.4.4           |
| crates.io | [aphrody-toolcall](https://crates.io/crates/aphrody-toolcall/1.4.4)                   | 1.4.4           |
| crates.io | [aphrody-model-client](https://crates.io/crates/aphrody-model-client/1.4.4)           | 1.4.4           |
| crates.io | [aphrody-gemini-web](https://crates.io/crates/aphrody-gemini-web/1.4.4)               | 1.4.4           |
| crates.io | [aphrody-antigravity](https://crates.io/crates/aphrody-antigravity/1.4.4)             | 1.4.4           |
| crates.io | [aphrody-model-antigravity](https://crates.io/crates/aphrody-model-antigravity/1.4.4) | 1.4.4           |

The SDK native modules require the Aphrody Bun fork >= 1.4.4. These package
publications do not qualify a complete runtime distribution or Chromium engine
for Windows, Linux and macOS. Those artifacts follow their existing factory
and release gates. No browser profile or credential is included in this release.

The public search SDK invokes the existing bounded, anonymous native search
owner. Live anonymous Google requests encountered an upstream anti-bot page
during qualification. Successful package tests therefore do not establish live
search availability or an authenticated dedicated Google account.

See the [Google SDK](../../packages/bun-google/README.md),
[Chromium SDK](../../packages/bun-chromium/README.md),
[native CI](native-ci.md) and [graph scope](google-chromium-graph.md).
