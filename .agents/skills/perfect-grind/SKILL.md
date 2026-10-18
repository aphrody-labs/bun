---
name: perfect-grind
description: "Auto-goal mode that keeps working until nothing is left: fix bugs, build features, finish every plan, research the web, GitHub, Context7 and the Bun docs, use every installed skill, MCP server and CLI, pick the best stack, replace stubs and placeholders, delete dead code, deduplicate packages and crates, flatten the monorepo, then commit, push, deploy, publish and fix whatever breaks. Use when asked to grind, finish everything, or run without stopping."
---

Run this under `/goal` (or `/loop` without an interval). Set the goal condition to the exit test in "Done" below, then do not stop, ask or summarize until it is true. Each pass is one lot with a proof, not a plan.

## Pass

1. **Orient.** Read `AGENTS.md`/`AGENTS.md`, `PLAN.md`, the nested guidance of the directory, memory notes and `git status`. Pick the queue: `bun scripts/aphrody/work.ts status|next` when the checkout has it; otherwise list open plan items, failing gates, stubs and TODOs yourself. Never touch paths another active lot owns.
2. **Research before building.** Verify the thing does not already exist (`aphrody graph --source graph:bun query "<question>"`, `graph_symbols`, grep). Then look outward, in this order, stopping when the answer is solid:
   - `bun mcp` tools: `docs_search`/`docs_read`, `examples_search`, `deps_docs`/`deps_read` for pinned dependency sources.
   - Context7 (`resolve-library-id`, `query-docs`) for every library you touch; your memory of an API is not a source.
   - GitHub (`gh search code|repos|issues`, `gh api`) for how upstream and comparable projects solved it; read the code, not the README.
   - Web search for current releases, benchmarks and known bugs. Prefer primary sources; cite the URL and date in the commit body or the doc you write.
3. **Use what is installed.** List skills (`skills_list`), MCP servers (`/mcp`) and CLIs on the host (`bun`, `cargo`, `gh`, `glab`, `ssh` aliases, browser tools such as Obscura/Lightpanda/Playwright/agent-browser) and use the one that fits instead of writing a script. Prefer Bun-native APIs over Node modules and npm packages.
4. **Choose the stack on evidence.** When a choice exists, compare 2-3 options on a measurable (size, speed, maintenance, license, fit with the repo), run a small benchmark or spike, and record the decision in one paragraph. Keep the option that wins, delete the spike.
5. **Implement.** Fix the cause, not the symptom. Finish features end to end: code, types, docs, tests. Follow the neighbouring code's style and comment density.
6. **Clean as you go.**
   - Replace every stub, placeholder, `TODO`, `unimplemented!()`, fake data and "not supported yet" path in the files you touch with a real implementation, or delete the surface if nothing uses it.
   - Remove dead code: unused exports, files, flags, deps and tests of removed behaviour. Prove it with the graph (`graph_callers`) or a search before deleting.
   - Deduplicate packages and crates: find parallel implementations of one capability, keep the canonical owner, port the unique behaviour into it, migrate callers, delete the copy.
   - Flatten the monorepo: one workspace root, one lockfile, no nested workspaces (`bun scripts/aphrody/flatten-workspace.ts <dir> --check` for Cargo), shared deps hoisted, one version per dependency.
7. **Gate.** Run the narrowest real gate for the change: `bun bd test <file>` for native code (never plain `bun test`), `cargo check -p <crate>`/`cargo clippy`, `bun test` for scripts, native `bun bd check|lint|fmt|n2b`. A red gate is fixed, not skipped. Fix pre-existing failures in files you touched.
8. **Ship.** Commit by path with the owner's identity, `git fetch`, confirm ancestry or rebase, normal push, then prove it with `git branch -r --contains <sha>`. Then deploy and publish what the change affects (site, runtime, SDK, npm, crates) using the project's own release scripts and the credentials already in the protected env files. Verify the live result (HTTP status, version endpoint, `npm view`, `cargo search`) before calling it shipped.
9. **If it breaks, fix forward.** A failed deploy, publish or CI run becomes the next lot: read the logs (`bun run ci:errors`, `ci:logs`), fix the cause, ship again. Roll back only to restore service, and say so.
10. **Record.** Mark the lot done, save any durable lesson as a memory note, then start the next pass.

## Rules that do not bend

- Never print, log or commit secrets; read them from protected env files by reference.
- Never force-push, `git reset --hard`, `git stash`, `git clean` or `git checkout --` on a shared tree. Commit only paths you own and keep other agents' staged work.
- Publishing and deleting need the credential or authorization to exist already; if one is missing, report the concrete blocker, continue with independent lots and pursue an authorized alternative. Do not fabricate a receipt, token or qualification record.
- Do not bypass security controls of third-party sites (challenge solving, fingerprint spoofing). Skipping `robots.txt` on the owner's own crawls is an owner decision; keep it scoped to what the owner named.
- Report results as measured: failing tests, skipped steps and qualification limits are stated, not hidden.
- Long builds run in the background; no timeout on `bun bd`. Respect build locks and host load.
- Parallel agents only for lots with disjoint paths; each follows this file and reports SHAs verified on origin.

## Done

Stop only when all hold, and say which command proved each:

- the queue is empty and `refill`/a fresh audit adds nothing (`work.ts next` exits 3);
- no stub, placeholder or dead code is left in the touched areas;
- gates are green on a clean tree and every commit is on `origin/main`;
- deploys and publishes are live and verified, or each remaining blocker is named with its cause.
