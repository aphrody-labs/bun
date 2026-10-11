---
name: google
description: Use the Aphrody Bun Google REST SDK and existing browser owners, preserving credential stores and reviewed document revisions.
---

# Google on the Bun fork

Use `bun:google` for authenticated REST transport in the Aphrody runtime.
Use `@aphrody/bun-google` for Drive file listing/export, Docs reads/revision-guarded
updates and Gemini JSON/SSE transport. The package requires a fork containing the
Google module; a version string alone is not a capability check.

## Runtime and credentials

`googleRuntime()` resolves public project, location, home and auth configuration.
It does not load credentials. `createClient({ credentialProvider, baseURL })` calls
the provider for each request. Supply the provider from the existing authenticated
owner. Provider cancellation receives the request's `AbortSignal`.

Keep tokens, cookies, sessions, databases and model weights in their configured
protected stores. Do not log credentials or copy them to a repository. The native
transport owns Authorization, rejects redirects and redacts provider/HTTP errors.
No implicit login, account selection, Credential Manager discovery, ADC or token
refresh is implemented by this module. Preserve the existing authenticated
Aphrody adapters until a replacement is executed and tested.

## Services and writes

`createGoogleServices(options)` exposes `drive.listFiles/getFile/exportFile/files`,
`docs.get/batchUpdate` and `gemini.generate/stream`. Supply an explicit credential
provider. Drive iteration is bounded by `maxPages`, detects repeated page tokens,
and requires `nextPageToken` in a caller-provided field mask. Gemini streaming
returns an SSE `Response`; the caller owns reading and cancelling its body.

Only perform remote writes authorized by the user's request. Read Docs before
mutation and pass the reviewed `revisionId` to `batchUpdate`; missing revision
fails before any HTTP call. Preserve existing Drive preflight/simulation, backups,
checksums and post-write verification. This SDK does not replace those workflows.

## Browser and engine owners

`bun:google.chromium` and `.obscura` are identity aliases of their existing
modules. `.dns` is Bun's native DNS object. Use the original browser launch/CDP
contracts and explicit cookie/profile isolation. Bun JavaScript runs on JSC.
Chromium and the inspected Obscura source use V8 with their own execution contexts.
The aliases do not establish an in-process V8/JSC bridge or browser parity.
Reuse `@aphrody/bun-web`, Bun Web APIs, fetch and existing GPU owners.

## Qualification

From the Bun checkout, run `bun bd test test/js/bun/google.test.ts`, then
`bun bd test ./packages/bun-google/test/services.test.ts`. The `./` prefix is
required for package test discovery. Use local ephemeral servers and
fixture credentials. Run scoped TypeScript, oxlint/oxfmt and the serialized Rust
Boq gates. Qualify real provider requests, browser artifacts and live account
authentication separately. Source pushes do not activate services or publish
packages. The migration matrix is `docs/aphrody/google-migration.md` in the fork.
