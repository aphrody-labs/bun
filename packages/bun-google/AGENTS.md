# Google SDK agent contract

Use Bun's native `bun check`, `bun lint`, `bun fmt` and `bun n2b` commands directly for type checking, linting, formatting and migration. Do not install or invoke external backends for these commands.

Read [README.md](README.md) and repository instructions. Preserve explicit
credential ownership and existing protected stores. services.ts owns generic
Drive/Docs/Gemini; antigravity.ts owns Cloud Code/Vertex; credentials.ts owns
read-only exact-target parsing; cli.ts owns commands. Reuse bun:google and
existing browser/DNS owners; do not copy engines or discover credentials.

Retain endpoint envelopes, legacy APIs, cancellation and redacted failures.
Interactive PKCE remains with its existing owner until faithfully replaced.
Use mocked stores and loopback tests only. Run `bun check`, `bun lint`, `bun fmt`
and scoped `bun bd test` directly. Preserve concurrent claims and factories. Source,
registry publication, native receipts and graph coverage qualify separately.
