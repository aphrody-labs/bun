# Benchmark

See https://codspeed.io/oxc-project/oxc

## Locally

```sh
# On PR branch
cargo bench -p bun_ecma_benchmark --bench parser -- --save-baseline pr
git checkout main
cargo bench -p bun_ecma_benchmark --bench parser -- --save-baseline main
critcmp # via `cargo binstall critcmp`
```

## Lexer

`oxc_lexer` is benchmarked head-to-head against the lexer in `oxc_parser`, measuring wallclock time.
This benchmark does not run on CodSpeed, because its CPU simulation does not model the out-of-order
execution and branch prediction which `oxc_lexer` is designed to exploit.

```sh
# Build the parser baseline without SIMD target features.
cargo bench -p bun_ecma_benchmark --features lexer_wallclock --bench lexer_wallclock_old -- --save-baseline lexer_old
# Compare the scalar lexer.
cargo bench -p bun_ecma_benchmark --features lexer_wallclock --bench lexer_wallclock_new -- --baseline lexer_old
# Compare the SIMD lexer on a compatible x86_64 host.
cargo --config src/js_parser/lexer/simd.toml bench -p bun_ecma_benchmark --features lexer_wallclock --bench lexer_wallclock_new -- --baseline lexer_old
```

`oxc_parser` is always built without the SIMD flags, so the 2 lexers are benchmarked in separate builds.
The "change" which criterion reports for `oxc_lexer` is its time relative to `oxc_parser`'s.
The "change" reported for `oxc_parser` (if any) is relative to its previous run.

The SIMD configuration is owned by `src/js_parser/lexer/simd.toml`.
