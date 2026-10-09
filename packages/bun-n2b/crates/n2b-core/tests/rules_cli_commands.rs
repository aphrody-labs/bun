// Copyright 2026 aphrody-code
#![allow(linker_messages)] // MSVC import-library progress is not a compiler diagnostic.
// SPDX-License-Identifier: Apache-2.0

use aphrody_n2b_core::rules::cli_commands::apply_cli_rules;

#[test]
fn skips_hash_commented_command() {
    let src = "# npm install\nnpm install\n";
    let (findings, out) = apply_cli_rules("script.sh", src, false);
    assert_eq!(findings.len(), 1, "only the non-commented line is reported");
    assert_eq!(out, "# npm install\nbun install\n", "commented line must remain untouched");
}

#[test]
fn skips_slash_commented_command() {
    let src = "// npx tsc\nnpx tsc\n";
    let (findings, out) = apply_cli_rules("note.md", src, false);
    assert_eq!(findings.len(), 1);
    assert_eq!(out, "// npx tsc\nbunx tsc\n");
}

#[test]
fn rewrites_all_when_no_comment() {
    let src = "npm install\nnpm test\n";
    let (findings, out) = apply_cli_rules("a.sh", src, false);
    assert_eq!(findings.len(), 2);
    assert_eq!(out, "bun install\nbun test\n");
}

#[test]
fn indented_comment_still_skipped() {
    let src = "    # npm install\nnpm install\n";
    let (_, out) = apply_cli_rules("a.sh", src, false);
    assert_eq!(out, "    # npm install\nbun install\n");
}

fn rewrite(src: &str) -> String {
    apply_cli_rules("package.json [scripts.x]", src, true).1
}

#[test]
fn rewrites_vitest_and_jest_scripts_in_aggressive_mode() {
    assert_eq!(rewrite("vitest run"), "bun test");
    assert_eq!(rewrite("vitest run --coverage"), "bun test --coverage");
    assert_eq!(rewrite("vitest"), "bun test");
    assert_eq!(rewrite("vitest watch"), "bun test --watch");
    assert_eq!(rewrite("vitest dev"), "bun test --watch");
    assert_eq!(rewrite("npx vitest run"), "bun test");
    assert_eq!(rewrite("bunx --bun vitest"), "bun test");
    assert_eq!(rewrite("pnpm exec vitest run"), "bun test");
    assert_eq!(rewrite("yarn vitest"), "bun test");
    assert_eq!(rewrite("jest --coverage"), "bun test --coverage");
    assert_eq!(rewrite("npx jest"), "bun test");
    assert_eq!(rewrite("tsc && vitest run"), "tsc && bun test");
}

#[test]
fn leaves_vitest_packages_and_configs_alone() {
    for src in [
        "vitest --config vitest.config.ts",
        "node scripts/vitest-setup.js",
        "bunx @vitest/ui",
        "echo vitest.config.ts",
        "jest-codemods src",
    ] {
        let (findings, out) = apply_cli_rules("a.sh", src, true);
        let test_rules: Vec<&str> = findings
            .iter()
            .map(|f| f.rule_id.as_str())
            .filter(|id| id.starts_with("cli/vitest") || *id == "cli/jest")
            .collect();
        if src.starts_with("vitest --config") {
            assert_eq!(out, "bun test --config vitest.config.ts");
        } else {
            assert!(test_rules.is_empty(), "{src} matched {test_rules:?}");
        }
    }
}

#[test]
fn aggressive_rules_are_reported_without_autofix_outside_aggressive_mode() {
    let (findings, out) = apply_cli_rules("a.sh", "vitest run\n", false);
    assert_eq!(out, "vitest run\n");
    assert_eq!(findings.len(), 1, "vitest run must not also match the bare vitest rule");
    assert_eq!(findings[0].rule_id, "cli/vitest-run");
    assert!(!findings[0].autofix);
    assert_eq!(findings[0].aggressive, Some(true));
    assert_eq!(findings[0].original, "vitest run");
    assert_eq!(findings[0].replacement.as_deref(), Some("bun test"));
}

#[test]
fn rewrites_typescript_runners() {
    assert_eq!(rewrite("ts-node src/index.ts"), "bun src/index.ts");
    assert_eq!(rewrite("tsx scripts/build.mts --flag"), "bun scripts/build.mts --flag");
    assert_eq!(rewrite("tsx watch src/server.ts"), "bun --watch src/server.ts");
    assert_eq!(rewrite("node --loader ts-node/esm src/a.ts"), "bun src/a.ts");
    assert_eq!(rewrite("node --import tsx src/a.ts"), "bun src/a.ts");
    assert_eq!(rewrite("node -r ts-node/register src/a.ts"), "bun src/a.ts");
}

#[test]
fn rewrites_pnpm_recursive_and_filter() {
    assert_eq!(rewrite("pnpm -r build"), "bun run --filter '*' build");
    assert_eq!(rewrite("pnpm --recursive run test"), "bun run --filter '*' test");
    assert_eq!(rewrite("pnpm --filter web dev"), "bun run --filter web dev");
    assert_eq!(rewrite("pnpm -F @scope/api run build"), "bun run --filter @scope/api build");
    assert_eq!(rewrite("pnpm exec tsc"), "bunx tsc");
    assert_eq!(rewrite("pnpm dlx create-vite"), "bunx create-vite");
    // pnpm sub-commands and graph selectors have no `bun run --filter` equivalent.
    for src in
        ["pnpm -r exec rm -rf dist", "pnpm --filter web... build", "pnpm --filter web add zod"]
    {
        let (findings, _) = apply_cli_rules("a.sh", src, true);
        assert!(
            !findings
                .iter()
                .any(|f| f.rule_id == "cli/pnpm-recursive" || f.rule_id == "cli/pnpm-filter"),
            "{src}"
        );
    }
}

#[test]
fn npm_link_keeps_folder_arguments() {
    assert_eq!(rewrite("npm link"), "bun link");
    assert_eq!(rewrite("npm link @scope/pkg && next"), "bun link @scope/pkg && next");
    // `bun link` rejects a folder ("unrecognised dependency format").
    for src in [
        "(cd app && npm link \"$(dirname \"$BIN\")/..\")",
        "npm link ../pkg",
        "npm link /abs/pkg",
        r"npm link C:\pkg",
    ] {
        assert_eq!(rewrite(src), src);
    }
}
