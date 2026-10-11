<!-- SPDX-License-Identifier: Apache-2.0 -->
# Bun browser content extraction

Lazy Rust library of the Bun browser provider: main-content selection,
HTML-to-Markdown, structural chunks, SimHash, dates, canonical URL processing
and media/player resolution. It uses the provider's shared HTML DOM backend;
remote documents receive no host or Bun privileges through extraction.

The current import's original and integrated SHA256 hashes are recorded in
[../../MIGRATION.json](../../MIGRATION.json). Older source ancestry remains
in Git and provenance comments; it does not establish current runtime parity.

Preserve extraction fixtures, Markdown code blocks, media resolver behavior,
URL normalization and canonical output before switching existing consumers.
Qualify these through the VPS factory. Unit tests or source presence alone do
not establish complete browser, CLI, MCP or Bun FFI qualification.
