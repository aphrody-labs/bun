# Google SDK agent contract

Read [README.md](README.md) and repository instructions. Preserve explicit
credential ownership and existing protected stores. services.ts owns generic
Drive/Docs/Gemini; antigravity.ts owns Cloud Code/Vertex; credentials.ts owns
read-only exact-target parsing; cli.ts owns commands. Reuse bun:google and
existing browser/DNS owners; do not copy engines or discover credentials.

Retain endpoint envelopes, legacy APIs, cancellation and redacted failures.
Interactive PKCE remains with its existing owner until faithfully replaced.
Use mocked stores and loopback tests only. Run strict TypeScript, oxlint, oxfmt
and scoped bun bd tests. Preserve concurrent claims and factories. Source,
registry publication, native receipts and graph coverage qualify separately.
