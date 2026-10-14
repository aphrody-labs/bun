# End to End Integration Tests

Integration tests for the internal transformer and minifier adapters.

```
# From repo root
bun run --cwd src/quality/adapters/minify build-test
bun run --cwd src/quality/adapters/transform build-test
bun run --cwd test/integration/ecma_pipeline test
```
