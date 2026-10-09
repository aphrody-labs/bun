# Source and protocol references

- [Microsoft LSP 3.18](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.18/specification/) defines `Content-Length` in bytes, UTF-8 message bodies, request IDs, cancellation, initialization and shutdown. Backend position encoding is negotiated as UTF-16.
- [Microsoft TypeScript native source](https://github.com/microsoft/typescript-go) owns `tsgo`. The inspected Windows binary reports `7.0.0-dev.20260707.2`; its native `--lsp` help exposes `-stdio`, `-pipe` and `-socket`. Context7 `/microsoft/typescript/v7.0.2` is newer than this development binary and does not establish its exact behavior.
- [Astral ty editor integration](https://docs.astral.sh/ty/editors/) documents `ty server`; Context7 `/astral-sh/ty` confirms the stdio command. ty was not found in the selected Windows PATH during implementation, so no ty version or typed Python result is qualified.
- [Ruff editor integration](https://docs.astral.sh/ruff/editors/) owns `ruff server`. Ruff was absent from PATH, but the existing workspace environment supplied a native `0.16.10` executable whose `server --help` was checked. Its optional adapter accepts an explicit executable command; it does not install or change PATH.
- [OpenAI plugin packaging](https://developers.openai.com/plugins/build/plugins) supports the `.codex-plugin/plugin.json` compatibility layout and bundled skills. LSP declarations in the Claude manifest do not configure a Codex language server.

The generator records source SHA-256, declaration excerpts, actual executing Bun/JSC versions, graph producer provenance and measured benchmark rows. These are code/documentation evidence. They do not change model weights, synchronize provider memories or qualify a different native engine executable.
