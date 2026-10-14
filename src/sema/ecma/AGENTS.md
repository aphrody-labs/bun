# Coding agent guides for `crates/oxc_semantic`

Use Bun's native `bun check`, `bun lint`, `bun fmt` and `bun n2b` commands directly for type checking, linting, formatting and migration. Do not install or invoke external backends for these commands.

## Testing semantic behavior

Choose the test location based on the behavior being protected. Do not add duplicate coverage if the case is already covered by `cargo run -p bun_ecma_coverage --`, an existing semantic fixture, or an upstream-derived fixture.

For OXC-specific scope, symbol, binding, or reference regressions, add a snapshot fixture under:

```text
crates/oxc_semantic/tests/fixtures/oxc/<area>/<case>.<ext>
```

The semantic snapshot harness records the scope tree, symbols, and references for every `.{js,jsx,ts,tsx}` fixture. Use a short descriptive case name, or an issue-based name when the fixture fixes a tracked issue.

Run semantic snapshot tests with:

```sh
cargo test -p bun_ecma_semantic --test main
```

Review intentional snapshot changes with:

```sh
cargo insta review -p bun_ecma_semantic
```

## Integration tests

Use `src/sema/ecma/tests/integration/` when the regression is best asserted through the Rust API rather than a snapshot. This is usually right for exact enum values, module data, CFG shape, class table behavior, or direct `Scoping` API expectations.

Run integration tests with:

```sh
cargo test -p bun_ecma_semantic --test integration
```

For CFG integration tests, enable the `cfg` feature:

```sh
cargo test -p bun_ecma_semantic --test integration --features cfg cfg
```

## Conformance checks

Use `src/sema/ecma/tests/conformance/` for broad invariants that should be checked against every semantic fixture, such as reflexive symbol declarations or identifier reference wiring.

Do not add one-off bug regressions there unless the check is intentionally generalized across all fixtures.

## Coverage fixtures

Use `src/codegen/ecma_coverage/misc/pass/` or `src/codegen/ecma_coverage/misc/fail/` only when the bug is best represented as a parser/semantic coverage case, especially for diagnostics surfaced by `cargo run -p bun_ecma_coverage -- semantic`.

Run a focused coverage case with:

```sh
cargo run -p bun_ecma_coverage -- semantic --filter misc/fail/<case>.<ext>
```

Run all semantic coverage with:

```sh
cargo run -p bun_ecma_coverage -- semantic
```
