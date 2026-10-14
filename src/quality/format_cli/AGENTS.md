# Bun formatter integration

Use Bun's native `bun check`, `bun lint`, `bun fmt` and `bun n2b` commands directly. Build checkout changes with `bun bd --ci=on -j1`.

The formatter belongs to Bun's root Cargo workspace. The runtime CLI entry point is `src/runtime/cli/format_command.rs`, backed by `src/format`; the API facade remains `src/quality/src`. The shared addon is built with `bun scripts/aphrody/build-napi.ts packages/bun-oxc` from the repository root.

Retained conformance inputs and language adapters document the imported formatter contracts. Preserve their fixtures, snapshots and licenses. Native formatting reports unsupported embedded languages and JavaScript configuration explicitly.

### Platform considerations

Oxfmt is built for multiple platforms (Linux, macOS, Windows) and architectures.

When working with file paths in CLI code, be aware of Windows path differences:

- Use `std::path::Path` / `PathBuf` instead of manual string manipulation with `/`
- Be cautious with path comparisons and normalization across platforms
  - Avoid hardcoding `/` as a path separator; prefer `Path::join()`
  - Windows uses `\` as a path separator and has drive letter prefixes (e.g., `C:\`)

## CLI implementations

Native CLI formatting and linting use `src/format` and `src/lint`. The addon and API integrations retain their configuration owners under `src/quality`.

### Ignore architecture

Ignore handling is intentionally split across entry points.
Use the entry-point map above; keep detailed behavior and rationale next to the relevant implementation and tests.

The stable distinction is:

- Formatter-owned ignores control formatting eligibility where the entry point supports them
  - These include `.prettierignore`, CLI `--ignore-path`, `!` patterns and config `ignorePatterns`
  - They exclude an explicitly requested document
- Git-derived ignores scope filesystem discovery
  - `.gitignore` and `.git/info/exclude`
  - They do not exclude an explicitly requested document

## Formatter implementations

Oxfmt utilizes different implementations depending on the file extension and filename:

- Tier 1: Rust implementations using `oxc_formatter`, `oxc_formatter_json`, etc found in this repository
- Tier 2: Rust implementations using external libraries like `oxc_toml`
- Tier 3: Delegations to Prettier via NAPI-JS calls (e.g., for Vue or MDX)
- Tier 4: Delegations to Prettier that require additional Prettier plugins (e.g., for Svelte)

NOTE: Rust written formatters never fall back to Prettier, since they exist to reduce the dependency on Prettier.

### Divergence vs Prettier

Known divergences live in DIVERGENCES.md (embedding / dispatch layer only); single-language ones live in the owning crate's.

- The pin is a minimal repro in `conformance/fixtures/edge-cases/`
- `conformance/run.ts` derives the file-to-entry map from every `DIVERGENCES.md` (this one's `Pin:` / `Conformance:`, the crates' `Oxfmt:`), prints the ref next to each failure,
  and warns on a failure no entry lists (unclassified) and on a listed file that passes (stale)
- All current entries are embedding-layer decisions that outlive the Prettier delegation;
  if an entry about the Prettier-fallback boundary itself is ever added, group it under a separate heading in DIVERGENCES.md so the removal scope stays obvious when the fallback goes away

Conformance failures (`conformance/snapshots/`) no entry accounts for, to fix rather than admit:

- `jsdoc`: `externals/svelte/compiler/print/index.js`
  - `if (!(a && b))` hugs `!(` to the head paren since prettier/prettier#18401, not ported yet (Prettier conformance `js/if/condition-break/unary-expression.js`; unrelated to JSDoc)

### Embedded language formatting

Embedded languages (e.g. css-in-js, CSS front matter YAML) go through the `FormatDispatcher` (defined in `oxc_formatter_core`) assembled by `src/core/embed/dispatcher.rs`.

Routing is ONE table (`dispatcher::route`):

- `Native` languages (js/ts/css/graphql/yaml/json/markdown/...) get a Rust branch
- `Prettier` set (html/angular/vue/svelte/handlebars/mdx) goes to the Prettier Doc→IR channel
  - `embed/prettier_doc.rs`, napi only; svelte only with the `svelte` config
- everything else is deliberately preserved

Language-pair data crosses as `DispatchRequest::parent_context` markers the dispatcher translates for the child, so no language crate depends on another.

Vocabulary: "fallback" = the dispatcher's optional `PrettierDocFallback` slot (a build/root may not install one).
The pure Rust build runs fallback-less, so non-native embeds (html-in-js, TOML/custom front matter) deliberately stay verbatim.

The roots install `SessionServices`, all via `embed/services.rs::for_root` (one definition per build; the napi one takes the `ExternalServices` transport, and adds the Prettier fallback / string embedder / Tailwind sorter to the registry dispatcher): the JS/TS, CSS and Markdown file roots (`core/format.rs`, `PhysicalFile` sessions, both builds) and the Vue/Svelte `<script>` root (`api/text_to_doc_api.rs`, `VirtualDocument` session, napi only).

Which languages may dispatch AT ALL from a given host is the host crate's own gate (e.g. `oxc_formatter_css` dispatches only `yaml`/`toml` front matter, `oxc_formatter_markdown` every fenced code block's language); the shared `route()` table then decides who serves the language.
Adding a dispatch call to a host crate is therefore a routing decision (check `route()` and the embedded conformance when doing so. A root needing a bespoke service set would assemble the `SessionServices` struct literally), none does today.
`embeddedLanguageFormatting: off` installs no dispatcher, every builder consults the same off-gate, `ResolvedDispatchConfig::is_embedded_formatting_enabled`.
Tracing span namespaces: `oxfmt::embed::` = pure Rust work, `oxfmt::external::` = napi-crossing calls.

Per-language options are NOT built up front: `ResolvedDispatchConfig` maps them lazily at dispatch time (`OnceLock`-memoized) from the host file's resolved config, including the Prettier options JSON for the JS-side consumers. `src/core/external_services.rs` bridges the napi callbacks into these factories.

A separate string-out channel (the session's `string_embedder` service, NOT the dispatcher) carries JSDoc's string-in/string-out consumer:

- JSDoc fenced code blocks: the host (`oxc_formatter`) embeds only the `prettier-plugin-jsdoc` set (css/less/scss/json/yaml/html), then routing follows ONE rule, the same `dispatcher::route` table
  - a `Native` fence language formats through `FormatSession::dispatch_to_string` via a thin string adapter (`embed/jsdoc_fence.rs::format_native_fence`, EVERY build, the pure Rust build wires it via `services::for_root`)
  - html fences stay on the Prettier string path (`embed/prettier_string.rs`, napi only; its Doc→IR conversion has unrepresentable cases);
  - everything else stays verbatim
  - the embedder carries the caller's effective print width; both branches honor it (native via `PrintWidth` override, Prettier via `printWidth` in the options JSON), so a fence prints at the same width a JS/TS snippet in the same position would (see `upstream-jsdoc-bugs.md` #11 for the deliberate divergence from upstream's flat `printWidth - 4`)

NOTE: The string-out channel outlives the html rewrite; its full exit criterion is owned by `oxc_formatter_core`'s AGENTS.md (domain (4)).
The half owned here: JSDoc's string-out is NOT structural, fences can move to IR-out (session dispatch inside the comment IR) once the printer grows a per-line prefix mechanism for the `*` continuation, deferred for verification time, not by design.

### Tailwind CSS class sorting

Tailwind class sorting (`sortTailwindcss`) splits responsibilities:

- Rust collects classes into `FormatElement::TailwindClass`
  - `className` etc. in JS/TS, `@apply` in CSS — incl. css-in-js and JSDoc fenced blocks
- and the JS side sorts them in one batch
  - `sortTailwindClasses` → tailwind's `getClassOrder`, which needs the resolved Tailwind config

Embedded children add classes into the `FormatSession`'s class scope, shared with the parent, so the root document sorts them in the same batch.

The four data paths (JS/TS top-level / standalone CSS / embedded CSS / JSDoc fenced CSS) are documented at `embed::services::for_root` (napi definition).
No CSS goes to Prettier for this; the pure Rust build never collects at all (both mappers gate collection behind napi, since no sorter exists there).

## Verification

Run from the Bun repository root:

```sh
bun bd --ci=on -j1 fmt --config=.oxfmtrc.json --check <path>
bun bd --ci=on -j1 test test/cli/lint/toolchain.test.ts
bun scripts/build/rust/cargo-serial.ts --msvc test -p bun_format_cli --lib --locked --jobs 1
```

Keep conformance oracles inside their existing harnesses. They are reference test inputs, not runtime formatter backends.

## Test organization (`test/` directory)

### `test/api/`: Formatting result tests

Focuses on verifying formatting output. Use the Node.js API. No fixtures, test inputs are inline in each test file.

- Multiple `*.test.ts` files coexist in a flat directory (no subdirectories)
- Snapshots are colocated in `__snapshots__/` by Vitest

### `test/cli/`: CLI fixture-driven tests

A single `cli.test.ts` auto-discovers and runs all fixture directories via `utils.ts`.

- Each fixture directory contains:
  - `options.json` — array of test cases (args, cwd, env, stdin, etc.)
  - `fixtures/` — input files for the test cases
  - `*.snap.md` — file snapshots (one per test case, named `0.snap.md`, `1.snap.md`, …)
- Adding a new CLI test: create a new directory with `options.json` and `fixtures/`, then run the test to generate snapshots
  - `fixtures/` represents a single project structure
  - Multiple test cases (different args, cwd, etc.) against the same structure go in one `options.json`
  - If a scenario needs a different project layout, create a separate directory
  - Name related directories with a shared prefix (e.g., `nested_config/`, `nested_config_no_root/`)
- If exceptional test cases are required, place a separate `*.test.ts` file for them

### `test/lsp/`: LSP integration tests

Each test directory follows the 1:1:1 rule:

- 1 test file (`*.test.ts` with the same name as the directory)
- 0 or 1 `fixtures/` directory
- Snapshots are colocated in `__snapshots__/` by Vitest

Shared helpers are in `utils.ts` at the `test/lsp/` level.

## After updating `Oxfmtrc` (`src/core/oxfmtrc.rs`)

When modifying the `Oxfmtrc` struct (and configuration options):

- Regenerate the canonical configuration schema and TypeScript declarations with their source generators under `src/codegen`.
- Run `cargo test -p bun_ecma_website_formatter` to update schema markdown snapshots
  - Then, `cargo insta accept`
