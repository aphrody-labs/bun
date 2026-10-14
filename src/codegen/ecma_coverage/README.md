# Coverage tests

Tools are tested against [test262], [babel] and [TypeScript] for conformance.

Conformance inputs belong under `src/codegen/ecma_coverage`: `test262`,
`babel`, `typescript`, and `estree-conformance`. Commands below run from the
repository root and use its Cargo workspace.

## Development

```bash
# full run
cargo run -p bun_ecma_coverage --

# run a single tool against its supported conformance suites
cargo run -p bun_ecma_coverage -- parser
cargo run -p bun_ecma_coverage -- transformer
cargo run -p bun_ecma_coverage -- minifier

# run in watch
cargo watch -x 'run -p bun_ecma_coverage -- minifier'

# filter for a file path
cargo watch -x 'run -p bun_ecma_coverage -- minifier --filter filter-file-path'

# find crash scene by turning off rayon and print out the test cases in serial
cargo run -p bun_ecma_coverage -- --debug

# Run after submodules are updated
UPDATE_SNAPSHOT=1 cargo run -p bun_ecma_coverage --
```

<!-- Links -->

[test262]: https://github.com/tc39/test262
[babel]: https://github.com/babel/babel
[TypeScript]: https://github.com/microsoft/TypeScript
