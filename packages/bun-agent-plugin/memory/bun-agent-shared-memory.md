---
name: bun-agent-shared-memory
description: Shared source-backed Bun OS decisions and qualification for coding-agent harnesses
metadata:
  type: reference
---

# Shared Bun OS source context

This is project knowledge, independent of the model or harness. Read the
current source and selected qualification receipt before relying on a result.
Credentials, raw sessions, cookies, private datasets and weights stay in their
protected stores.

## Source ownership

`packages/bun-agent-plugin` owns the agent integration. `src/spec.ts` declares
the harness targets; `src/generate.ts` assembles skills and source-derived tool
metadata; `src/install.ts` owns adapter installation. The source policy is
`skills/bun-rust-first/SKILL.md` within that package.

`src/hooks/rewrite.ts` owns command conversion. Hooks and callback adapters
delegate to that owner; they do not choose a provider or change authentication.
Antigravity and Gemini have distinct schemas. The local bundle makes resources
available to a compatible harness without downloading models or assuming
client lifecycle events. See `docs/agent-adapters.md` for adapter contracts.

## Evidence boundaries

Generation proves source assembly. A hook fixture proves that fixture's
behavior. Embedded plugin execution, each harness client and installation
ownership require their own gates against the selected executable and source.
Do not describe a previous failure or a dated pass as current runtime status.

Graph contracts are owned by `src/graph/api.rs` and
`packages/bun-types/graph-native.d.ts`. Keep repository, source, profile,
snapshot and runtime/frontend identity explicit. Preserve unresolved nodes,
parser limits and metadata-only entries; source extraction does not establish
complete AST coverage or a complete training dataset.

Use `bun mcp` memory/search and graph tools when they cover the task. Provider
state and authentication remain separate from shared project context. Preserve
concurrent checkouts, active artifacts and protected stores; an ignored path
is not a cleanup authorization.

Related: `bun-os-runtime`, `bun-skills-catalog`, `bun-graph-structure`.

