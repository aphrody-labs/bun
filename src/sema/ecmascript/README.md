# `oxc_ecmascript`

ECMAScript Operations defined in the spec https://tc39.es/ecma262/

## Cargo features

- `side_effects`: Enables side-effect analysis.
- `constant_evaluation`: Enables constant evaluation and implies `side_effects`.

Tests reside in `src/transpiler/minifier/tests/ecmascript` due to cyclic dependency with `oxc_parser`.
