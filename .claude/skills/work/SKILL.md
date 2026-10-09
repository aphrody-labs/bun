---
name: work
description: "Autonomous end-to-end work loop for the Bun fork monorepo: pick the next lot, code it, gate it, commit by path, push, prove it is on origin/main, repeat. Use for any multi-step change or when asked to keep working without a human in the loop."
---

One entry point: `bun scripts/aphrody/work.ts <command>`. The queue is `scripts/aphrody/work-queue.json` (lots: id, goal, paths, status todo|active|done|blocked). No command asks a question; the exit code is the answer.

## Loop

1. `status`: ahead/behind, dirty paths grouped by lot owner, audit findings. Never touch paths owned by another active lot.
2. `next`: the lot to work on (exit 3 = queue empty: run `refill`, which turns audit findings into lots; still empty = nothing left, stop).
3. Read before coding: the memory notes and skills the lot needs (`bun-skills-catalog` routes them), the nested CLAUDE.md of the directory, `aphrody graph --source graph:bun query "<question>"` and the `bun mcp` tools. Verify that code does not already exist.
4. Code, then `gate [paths]`: `cargo check -p` for the crate, `bun test` for scripts and `test/internal`, `bun bd test` for native tests (never `bun test` on native changes), plugin `generate --check`, audit for docs and skills.
5. `ship --lot ID -m "<message>" [paths]`: gate, `git add` and `git commit -- <paths>` only, push to main, `git branch -r --contains <sha>` as proof. A red gate commits nothing.
6. `mark ID done`, back to 1. Do not stop while a lot is todo or active.

## Hard rules

- Commit messages: no co-author, no mention of AI. `ship` refuses them.
- The git index is shared between agents: commit by paths, never `git stash`, `reset`, `checkout --`, `clean` or `restore`.
- `bun bd` has no timeout; build lock: `until mkdir C:/tmp/bun-bd.lock; do sleep 20; done; …; rmdir C:/tmp/bun-bd.lock`.
- Secrets never in argv or logs. Nothing is published (npm, crates, ghcr, release) before the final pass.
- Hosts (VPS, dbfr), `C:\aphrody` and `C:\shenron` belong to the aphrody session: ask it over A2A, do not edit them from here.
- Windows: no code or script may open a console window (`bun_no_window`).
- Fix pre-existing failures met in touched files; remove what is useless.

## Infinite goal

Run the loop under `/goal` (or `/loop` without interval) with the condition "work.ts next exits 3 and refill adds nothing". Spawn parallel agents only for lots with disjoint paths; each one follows this same file and reports shas verified on origin/main.
