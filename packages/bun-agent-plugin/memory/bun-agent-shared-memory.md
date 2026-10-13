---
name: bun-agent-shared-memory
description: Shared source-backed Bun fork decisions and qualification for Claude, Codex, Antigravity and other harnesses
metadata:
  type: reference
---

# Shared Bun fork memory

Updated 2026-10-13. This is project knowledge, independent of the model or harness.
Use one canonical Aphrody memory owner, `bun-shared`, for approved project facts.
Read current sources before relying on a recorded result; no provider credentials,
raw sessions, cookies, datasets or model weights belong in this fiche.

## Decisions and source ownership

- The agent plugin belongs to `packages/bun-agent-plugin`. Its Rust/Bun policy
  source is `skills/bun-rust-first/SKILL.md` within that package.
- `src/spec.ts` defines harness targets. `src/generate.ts` distributes common
  skills, source-derived tools and per-harness manifests. `src/install.ts`
  registers adapters without changing the selected provider/model.
- `src/hooks/rewrite.ts` owns command conversion. OpenCode delegates via its
  native callback; command-hook clients delegate via `src/hooks/pre-tool-use.ts`.
- The owner removed Codex lifecycle hooks. The repository has no `.codex/hooks.json`
  or formatter hook, and the Codex plugin ships no hooks directory or manifest
  registration. User hook state was removed and `features.hooks` disabled.
  This is independent of the tool's execution-policy rejection of recursive deletion.
- Antigravity (`agy`) is distinct from Gemini CLI (`gemini`): native plugin.json,
  hook groups and camelCase toolCall inputs vs a Gemini extension and BeforeTool.
  Do not use GEMINI.md or a Gemini manifest to qualify Antigravity.
- Local models need a harness supporting tools, MCP and skills. The `local`
  bundle exports resources without assuming lifecycle events or installing weights.
- `docs/agent-adapters.md` records Context7 IDs, dated official schema sources and
  actual compatibility limits. A generated adapter is not a client execution proof.

## Graph and types from real code

Graph input/output contracts are owned by `src/graph/api.rs` and exposed through
`packages/bun-types/graph-native.d.ts`. Deserialization defaults permit omitted
input metadata; serialized graph outputs contain those fields with null/default
values. The declaration fixture covers both directions.

Index plugin and types as separate bounded domains using native Aphrody graph/home.
Keep source labels and profiles explicit, and record extraction gaps rather than
claiming complete AST coverage. The installed parser cannot currently extract
the TS7.1 import-attribute declarations in `ts7.1/import-attributes.d.ts`; the
declaration gate still checks the real compiler contract.

## Verified qualification and limits

- The declaration integration gate passed 22 tests on the installed Aphrody runtime
  during this batch; runtime behavior is a separate changed-binary qualification.
- Native plugin adapters have local generation, hook, install/uninstall and ownership
  tests. The OpenCode callback has a direct behavioral test using the shared engine.
  The adapter batch passed 36 plugin tests. The subsequent removal of Codex hooks
  passed 14 focused generation/adapter tests; no runtime or type source changed.
- The installed runtime's embedded agent-plugin launcher has a missing module.
  Use the checkout's plugin CLI for this batch; do not claim embedded-launcher repair.
- A build launched by automatic command rewriting encountered a missing sccache
  wrapper before compilation. Pure plugin script gates use the documented keep-tool
  escape to avoid an unrelated native rebuild. This does not qualify runtime changes.
- Antigravity's existing private plugin is an older generated snapshot. It differs
  from the current shared installation, so the ownership guard preserves it rather
  than overwriting unidentified edits. The corrected adapter is generated in the
  repository bundle; execution inside the Antigravity client remains unqualified.

## Shared retrieval and ignored-path inventory

Use `aphrody memory recall --agent-id bun-shared --query <topic>` for current
project decisions. Use `aphrody home --profile bun query <topic>` for indexed
project source and fiches; this home domain profile is not an inference profile.
Do not pass it as a top-level model profile to the memory CLI. Explicitly select
the checkout directory in Aphrody Shell before formatting or running project tools.

The git-ignored inventory has 1448 aggregated file/directory entries, including
1130 vendor and 290 package entries. Ignored does not imply disposable: native
sources, registries, cookies and current work remain protected. A modified media
clone, recent CEF/build outputs and rename journals were retained.
Five old Rust logs, two Git logs and an empty temporary directory were removed
using separate non-recursive native operations, freeing 51930 bytes. Their
absence was verified. Recursive deletion of the clean temporary media clones
remains rejected before Windows execution; elevation cannot resolve that policy
decision. The modified media clone and concurrent sources remain untouched.
`sudo.exe` is available in inline mode; these successful deletions needed no
elevation. The empty embedded-plugin extraction cache is
also unchanged after a rejected deletion. Its incomplete-cache recovery bug is
still present in the native launcher source and requires a changed-binary gate.

Read live gate output and the final source commit for delivery evidence. Never
replace a missing gate with a remembered success from another revision or host.
