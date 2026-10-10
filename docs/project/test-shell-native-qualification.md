# Native shell and test environment qualification — 2026-10-10

The shell lexer now records an error when input ends inside a single or double
quote. Previously `bunsh -c` executed the incomplete quoted word. Both cases now
produce no command output and exit 2. The existing test covers both quote kinds;
both fail on the installed runtime and pass on the rebuilt native executable.

The session runner consumes its final optional mutable session reference after
execution, retaining cwd, variables and exit-state updates. Test-environment FFI
arguments use explicit raw pointers; the borrowed strings still outlive the call.

Native Windows gates:

- Session/exec suite: 34 pass, nine skips, 88 assertions and one snapshot.
- Selected quote/command-substitution tests: 45 pass, six skips, 43 todos and
  136 assertions. The todos are not implemented coverage.
- Test-environment installation/cleanup: two pass, seven assertions.
- oxlint, oxfmt and diff whitespace checks pass for the owned test.

Scoped TypeScript remains unsuccessful because the unchanged shell test helper
references an undeclared `Bun.jest` property. The pre-change test checkout
reproduces that same error in `test_builder.ts:9`; no type declaration was
changed to suppress it.

Strict Clippy checks both `bun_shell_parser` and `bun_runtime` on Windows/Linux
GNU x64/ARM64. The three owned Rust files have no diagnostics. The complete
runtime still fails with 151 Windows and 12 GNU Linux diagnostics elsewhere.
Linux execution, release distribution and host activation remain pending.

Receipts: `tmp/test-shell-native-{session-final,environment-final,quotes}.log`,
`tmp/test-shell-unclosed-system-baseline.log`, `tmp/test-shell{-baseline,}-types.log`
and `tmp/test-shell-final-clippy-{linux,windows}-{x64,arm64}.jsonl`.
