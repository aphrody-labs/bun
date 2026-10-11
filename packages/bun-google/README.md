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

For dedicated email, Google user identity and keyless Cloud automation, follow the
[dedicated-account runbook](../../docs/project/google-dedicated-account.md).
OVH forwarding, Workspace/Gmail authorization and Cloud IAM qualify separately.
The runbook records the verified OVH forwarder and Windows keyless Cloud setup;
the official verification email was delivered. Signup awaits an authentication
code deliberately withheld by the connector; no dedicated Google user, Gmail
mailbox or password has been created.

| Surface                         | Executable contract                                              |
| ------------------------------- | ---------------------------------------------------------------- |
| `createClient`, `googleRuntime` | Native REST transport and public configuration                   |
| `drive`                         | List/get/export files; bounded page iterator                     |
| `docs`                          | Get document; update with required reviewed revision             |
| `gemini`                        | JSON generateContent; streaming SSE Response                     |
| `chromium`, `obscura`, `dns`    | Exact aliases of existing runtime owners                         |
| `crates/boq`                    | Standalone `aphrody-boq` Rust codec, source provenance preserved |

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

## Commands and source catalog

The `./search` subpath exports `createGooglePublicSearch`. This bounded anonymous
adapter calls the existing `aphrody web search` Rust SERP owner with `--no-auth`,
`--safe`, fixed google.com and `--transport fetch`. It never falls back to a
browser or loads account cookies. The existing owner may send its constant SOCS
consent preference cookie; there are no user/session cookies. Bounds: four jobs,
20-second cancellation deadline, 1 MiB output, 1–20 results and offset at most 1000. Query/organic output preserves the M3 search response contract. It does not
extend the authenticated `bun:google` endpoint allowlist or copy a SERP parser.

The public Bun download/site server routes `/api/search` only for declared site
hosts. It forces web SafeSearch, rejects privileged parameters, drops incoming
auth/cookie headers and returns a redacted 503 when Google blocks the request.
Deployments install `@aphrody/bun-google/search` or explicitly configure its source
module via `GOOGLE_SEARCH_SDK_MODULE`, and qualify `GOOGLE_SEARCH_OWNER`/aphrody.
This is a capability-owner CLI adapter, not an in-process native search binding.
The Windows anonymous live probe on 2026-10-11 was blocked by Google; fixture
success does not establish production availability. No auth fallback was attempted.

## Public crawl index and standalone CLI

`@aphrody/bun-google/public-index` exports `createPublicIndexSearch({ root,
collections })`. It verifies approved public snapshot pointers, SHA-256 content,
provenance, exact hosts and limits before building one in-memory SQLite FTS5
projection with isolated collection statistics. Searches return `{ body, etag,
cache }`; `body` includes `query`, `organic`, `source: "public-crawl-cache"`,
`collection` and `generatedAt`. The 128-entry query cache invalidates on changed
snapshots. `close()` releases the projection. No private home index, browser
profile, credentials or implicit database supplies missing configuration.

The separate `bun-google-index-public` binary and `./public-index-cli` subpath
delegate to that same SDK. They require an absolute export root and an absolute
JSON policy file containing the collection configuration map:

```json
{
  "google-public": {
    "pointer": "google-public.pointer.json",
    "hosts": ["developers.google.com"],
    "policySha256": "<64-character checksum of the approved crawl policy>",
    "owner": "aphrody-web-crawl"
  }
}
```

```sh
bun-google-index-public --help
bun-google-index-public --root /absolute/public-export --collections-file /absolute/public-policy.json --collection google-public --query "Bun Rust" --num 10 --start 0
```

Replace the example paths and policy checksum with the qualified producer's
actual public export/configuration; this example is not a production receipt.
Policy files are bounded to 64 KiB. Queries, collections and pagination use the
SDK bounds; SIGINT/SIGTERM cancel the standalone command. Output is JSON with
results, provenance, ETag and cache status. Errors are redacted. These public
commands do not acquire Google credentials or contact a live search provider.
`unicode61` provides Unicode lexical tokenization; comprehensive language-specific
stemming and Google-scale coverage are not claimed. A verified public snapshot
must exist before these commands return results.

`createAntigravityServices` implements Cloud Code models/bootstrap, regional Vertex
generation, Daily Cloud Code SSE decoding and userinfo. `createAntigravityCredentialProvider`
reads the desktop OAuth envelope by explicit Windows target; it never refreshes or writes.
The `./cli` subpath exports `runGoogleCommand` with provider/transport/runtime/signal injection.

```sh
bun src/cli.ts config
bun src/cli.ts authstatus --target gemini:antigravity
bun src/cli.ts models --target gemini:antigravity
bun src/cli.ts generate --target gemini:antigravity --model gemini-2.5-flash --prompt "Hello"
bun src/cli.ts stream --target gemini:antigravity --prompt "Hello"
```

The npm binary is `bun-google`; package scripts expose the same commands.
Config and imports never authenticate. Other CLI commands require an explicit
target. Tokens are not accepted as arguments; no protected store is discovered,
migrated or written. The provider returns a JS string, not an opaque token.
Generic Gemini and Antigravity endpoints have separate caller-owned token contracts.

Transferred Rust owners under `aphrody/crates` are antigravity, google, gemini-web,
gemini-runtime and model-antigravity; `crates/boq` is independent. The npm package
packs SDK sources and Boq rather than the entire transferred application tree.
Interactive PKCE login remains with the original process owner; native replacement
requires faithful callback/refresh qualification.

Run scoped strict TypeScript, oxlint, oxfmt and `bun bd -j1 test ./packages/bun-google/test`
from the root. Tests use mocked stores and loopback HTTP, never live credentials.
Source version 1.4.4, registry availability and native release receipts qualify separately;
see [publication boundary](../../docs/project/google-browser-publication.md).
Release graph catalogs immutable hashes, symbols and relative references with explicit
unsupported inputs, truncation and unresolved calls. It is not full dynamic call
coverage or JSC/V8 parity. [AGENTS.md](AGENTS.md), [CLAUDE.md](CLAUDE.md),
[GEMINI.md](GEMINI.md), [llms.txt](llms.txt) are dedicated entrypoints.
