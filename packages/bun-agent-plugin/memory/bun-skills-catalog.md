---
name: bun-skills-catalog
description: Provider-neutral router for the Bun fork plugin's current skills and source-backed memory
metadata:
  type: reference
---

# Current skill router

Updated 2026-10-13. Claude, Codex, Antigravity, Gemini, OpenCode and local-model harnesses receive the same skill sources. Names below are semantic routes; inspect the generated skill index from the selected checkout for live availability.

| Task                                                          | Skill or reference                  |
| ------------------------------------------------------------- | ----------------------------------- |
| Native Rust/Bun design, minimal dependencies and distribution | bun-rust-first                      |
| Bun application APIs and package replacement                  | bun-native, bun-apis                |
| Runtime build and toolchain                                   | bun-build                           |
| Rust crate ownership and interop                              | bun-crates                          |
| Runtime APIs                                                  | bun-runtime                         |
| Test harness and changed-binary proof                         | bun-tests, verify                   |
| Documentation lookup                                          | bun-docs                            |
| Source graph and bounded indexing                             | bun-graph, bun-aphrody-graph-memory |
| Exact locked dependency sources                               | bun-deps                            |
| Rust JSC classes                                              | implementing-jsc-classes-rust       |
| GC ownership                                                  | javascriptcore-garbage-collector    |
| Native syscall reuse                                          | rust-system-calls                   |
| Native Windows                                                | win32                               |
| Agent adapter schemas                                         | generated agent-adapters.md         |
| Shared decisions and qualification                            | bun-agent-shared-memory             |

Package-owned skills have one canonical source in packages/bun-agent-plugin/skills. Neutral repository directories .agents/skills and skills are supported; .claude/skills and .claude/commands are compatibility sources, not a requirement to run Claude. Generated catalogs are based on current implementations and lockfiles.

Resolve the selected repository's AGENTS.md and applicable nested guidance before changes. Retain concurrent ownership, one heavy build at a time, native Windows tools and the fork runtime. Project memory is shared through Aphrody's bun-shared owner; provider authentication and raw sessions remain isolated. Never apply a historical workaround without checking current source and results.
