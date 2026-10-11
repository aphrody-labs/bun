# Source Markdown and comment review

Run `bun scripts/aphrody/source-markdown.ts --root <checkout> --ref <commit> --out <staging-directory>` after a release source commit is selected.

The generator reads immutable Git blobs. It emits `SOURCE-INDEX.md`, `BUILD-COMMANDS.md` and `source-markdown.json`. Package versions, private flags, registered modules, license links and commands come from manifests and the module registry. The JSON records source revision and input SHA-256 hashes. Repeating the command for the same commit produces the same files. Generated inventory does not claim that a declared feature works or that a package was released.

The exported `markdownInventory` helper supplies the same evidence to a release README generator. Existing README, AGENTS, CLAUDE, PLAN, TODO, notices and licenses remain owner inputs; this command does not replace them. Add `--check` in CI to compare existing staging files without writing anything. Select an immutable source commit and regenerate them when source input hashes change.

Comment selection covers tracked Rust in `src/`, excluding generated directories. Its lexer skips quoted strings, raw strings and character literals, handles lifetimes and nested block comments, and reports lexical French signals, long comments and promotional wording. Signals are review candidates, not reliable language detection or correctness judgments. JavaScript, TypeScript, C++, external vendor sources and macro-generated text need their language owner's parser.

Each candidate includes source revision, path, line, exact character offsets, source hash, comment hash, text, review rationale and protection status. License, copyright, generated-code and safety notices are protected. The selector never translates or deletes comments automatically. `reviewedReplacement` accepts an explicitly reviewed replacement, rejects stale source hashes and changed comment boundaries, and refuses protected notices. It does not write the source file.

The existing comment-cop workflow reviews pull-request comment additions; it is not a full source generator. This staging selector complements it without posting review messages or inventing explanations of code.
