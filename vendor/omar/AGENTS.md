# Omar — canonical monorepo

Use Aphrody Bun 1.4.4 exclusively for JavaScript, TypeScript, orchestration and Python through `bun uv`. Prefer `bun mcp` and existing Aphrody capabilities. Read `codex/omar/references/memory.md` and the relevant skill before changes.

`private/omar.md` is confidential and excluded from Git. Do not print secrets, cache secret contents, or transfer account sessions. Service data, NTFS/PE databases, local logs and profile exports stay under ignored `server/var/`. Keep filesystem indexes metadata-only.

The canonical root is `C:/SSH/omar`. Old `C:/SSH/omar-codex`, `C:/SSH/omar-server` and `C:/SSH/omar.md` are compatibility links. Do not follow junctions recursively during scans. Maintain one local Git root for Omar; Bun and Aphrody source repositories retain their upstream identities.

Use scoped changes. Do not add or run tests unless Omar asks. Build and operational health probes are allowed for the requested deployment. Keep checkpoints in `codex/state/work.md` and durable facts without secrets in the canonical memory.
