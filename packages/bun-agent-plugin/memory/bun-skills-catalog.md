---
name: bun-skills-catalog
description: Provider-neutral router for Bun OS agent skills and source-backed memory
metadata:
  type: reference
---

# Current skill router

Updated 2026-10-13. Claude, Codex, Antigravity, Gemini, OpenCode and local-model harnesses receive the same skill sources. Names below are semantic routes; inspect the generated skill index from the selected checkout for live availability.

| Task                                                          | Skill or reference                  |
| ------------------------------------------------------------- | ----------------------------------- |
| What the fork adds to Bun (CLI, APIs, modules, packages, tools) | bun-fork-features, bun-fork-features memory |
| Native Rust/Bun design, minimal dependencies and distribution | bun-rust-first                      |
| Bun application APIs and package replacement                  | bun-native, bun-apis                |
| Runtime build and toolchain                                   | bun-build                           |
| Add-ons: plugins, Bun Video, submodule pins, Bun OS mounts    | bun-add-ons                         |
| Rust crate ownership and interop                              | bun-crates                          |
| Runtime APIs                                                  | bun-runtime                         |
| Native video metadata, Image frame transforms and MP4 remux   | bun-video                           |
| Compositions, HLS/DASH, browser capture and bounded WebGPU    | bun-video; relevant package guide   |
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

Repository skills have one source, .claude/skills (hand-written or generated from src/agent_tools/skills.json), plus .claude/commands; the plugin generator ships them to every provider adapter. Generated catalogs are based on current implementations and lockfiles.

Resolve the selected repository's AGENTS.md and applicable nested guidance before changes. Retain concurrent ownership, one heavy build at a time, native Windows tools and the Bun OS runtime. Project memory is shared through Aphrody's bun-shared owner; provider authentication and raw sessions remain isolated. Never apply a historical workaround without checking current source and results.
