# Google services for the Aphrody Bun fork

`@aphrody/bun-google` uses the built-in `bun:google` transport. It needs the
fork containing that module. The package has no npm runtime dependencies.

```ts
import { createGoogleServices } from "@aphrody/bun-google";

// Supply a provider owned by your existing authenticated application.
const google = createGoogleServices({ credentialProvider });
const document = await google.docs.get(documentId, signal);
await google.docs.batchUpdate(documentId, reviewedRequests, document.revisionId!, signal);
```

The credential provider returns a bearer token for each request. The transport
uses Bun fetch in process, enforces Google HTTPS or loopback endpoints, rejects
redirects, and preserves cancellation. Credentials are never discovered
implicitly. Existing OS credential storage and ADC adapters retain ownership.

| Surface | Executable contract |
| --- | --- |
| `createClient`, `googleRuntime` | Native REST transport and public configuration |
| `drive` | List/get/export files; bounded page iterator |
| `docs` | Get document; update with required reviewed revision |
| `gemini` | JSON generateContent; streaming SSE Response |
| `chromium`, `obscura`, `dns` | Exact aliases of existing runtime owners |
| `crates/boq` | Standalone `aphrody-boq` Rust codec, source provenance preserved |

Windows Credential Manager target reads and Antigravity Cloud Code/Vertex models,
generation and streaming use the native in-process SDK. The explicit credential
provider returns token strings to JavaScript; the desktop owner retains refresh
and store writes. Interactive PKCE login keeps the existing CLI owner.

Drive reconciliation, resumable model uploads, Fonts proxy and Gemini Web
adapters were transferred under `aphrody/`. Their complete engine and release
qualification remains separate from this REST SDK.
Protected credentials and cookie stores retain their original locations.
This package does not claim complete
Google API or JSC/V8 compatibility. It performs no automatic retries of writes.

Contracts follow the official [Drive list](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/list),
[Drive export](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/export),
[Docs batchUpdate](https://developers.google.com/workspace/docs/api/reference/rest/v1/documents/batchUpdate)
and [Gemini generateContent](https://ai.google.dev/api/generate-content) references.
