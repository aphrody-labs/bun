<!-- SPDX-License-Identifier: Apache-2.0 -->

# obscura-dom

Vendored Obscura DOM backend from Aphrody Web commit
`bbeb5ef4c497f7d27f546ad2cc15a250dcc93c83`. Aphrody Web records its
upstream at `h4ckf0r0day/obscura` commit
`1a3169da276d7720732c7b20535474942917fb83`; see `LICENSE`.

The package keeps its `obscura-dom` identity and version `1.4.4`, while its
implementation now belongs solely to `src/browser/crates/dom` in the Bun fork.
`pub use bun_browser_dom::*` preserves native type identity. The public names
`selector::ObscuraSelector`, `selector::ObscuraSelectorParser` and
`tree_sink::ObscuraElemName` remain aliases of their native counterparts.

On 2026-10-11 the five implementation and two allocation-test files were
equivalent after only `Obscura` to `BunBrowser` and `obscura` to `bun_browser`
namespace normalization (two files were also byte-identical). Before retiring
the duplicate implementation, the canonical DOM passed scoped native Windows
check, 93 tests and strict Clippy. The old allocation tests remain under the
canonical owner. Consumer tests here exercise legacy parse/select/serialization
and demonstrate that both crate names use the same concrete types.

`LICENSE` and the upstream commit provenance above remain unchanged. No V8,
JSC or browser engine build is required by this compatibility package.
