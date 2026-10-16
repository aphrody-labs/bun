# Source context and typed selection

The plugin exports `bun-agent-plugin/decision`. Its generated
`yolo/context-catalog.json` derives compact tool cards from the registered Rust
modules and agent-tool JSON, and skill cards from the plugin's existing skill
assembly. Source paths and hashes trace tool metadata; skill hashes identify
exact generated resources. This index qualifies source extraction, not binary
availability or behavior.

```ts
import type { Provider } from "bun:yolo";
import { createContextSelector } from "bun-agent-plugin/decision";
const selector = createContextSelector(
  await Bun.file("yolo/context-catalog.json").json(),
);
export async function selectContext(provider: Provider) {
  return await selector.select({
    task: "Find callers of Bun.Video frame transforms",
    provider,
  });
}
```

Build the lexical index once. Selection sends only the task and candidate
descriptions, never whole skills, schemas or graph bodies. At most one tool
Choice and one skill Choice share one request. Each includes `none_suitable`;
Rust validates the responses and applies the separate Choice confidence
threshold. Defaults are 12 candidates per kind, 32 KiB per request, a 10-second
deadline and zero retries. A smaller byte budget removes whole low-ranked
candidates and records how many it omitted. It does not truncate descriptions.
Shortlisting is lexical and cannot guarantee recall; `considered` exposes the
exact candidates. No candidates means no provider call.

Read selected skill resources on demand and verify their `resourceSha256`.
For tools, request the running MCP server's schema and check its exposed names,
annotations and execution policy. A selected source reference never authorizes
an action. Keep tool registration and skill instructions in their existing
owners; unsupported metadata expressions remain explicitly unresolved.

The caller must supply a provider. `code` and a qualified local provider use the
same native validator; there is no implicit paid fallback. Optional
`cache: { owner, scope, providerIdentity }` borrows the existing native
`bun:graphx` `GraphRedisCache`. Its snapshot key includes the complete source
catalogue, exact request and a caller-supplied non-secret provider identity.
The caller owns the cache URL, TTL and lifetime. Cached responses pass through
Rust validation again; invalid data fails without a paid retry. `cacheHit`,
request bytes, provider time, model and token usage remain observable.

Use local `bun:yolo.code` fixtures for tests. A successful provider call establishes
that probe's protocol compatibility; it does not establish calibration,
latency improvement, training correctness or every client's execution.
The [Bun decision reference](/docs/runtime/decisions) defines confidence,
abstention and the boundary between native validation and provider qualification.
