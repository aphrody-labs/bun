// Copyright 2026 aphrody-code
#![allow(linker_messages)] // MSVC import-library progress is not a compiler diagnostic.
// SPDX-License-Identifier: Apache-2.0

use bun_migrate::rules::cli_commands::apply_cli_rules;

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
    assert_eq!(out, "// npx tsc\nnpx tsc\n");
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
    assert_eq!(rewrite("pnpm exec tsc"), "pnpm exec tsc");
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

#[test]
fn rewrites_native_quality_and_migration_executables() {
    for (source, expected) in [
        ("oxlint --config lint.json --fix src", "bun lint --config lint.json --fix src"),
        ("pnpm exec oxlint --deny-warnings src", "bun lint --deny-warnings src"),
        ("bunx --bun oxfmt --write .", "bun fmt --write ."),
        ("npm exec oxfmt --check src", "bun fmt --check src"),
        ("npx n2b --fix .", "bun n2b --fix ."),
        ("yarn dlx n2b migrate .", "bun n2b migrate ."),
    ] {
        let (findings, output) = apply_cli_rules("script.sh", source, false);
        assert_eq!(output, expected, "{source}");
        assert_eq!(findings.len(), 1, "runner must not produce another finding: {source}");
        assert!(findings[0].autofix);
    }
}

#[test]
fn rewrites_only_explicit_type_checks_without_emission() {
    for (source, expected) in [
        ("npx tsc --noEmit", "bun check --noEmit"),
        ("tsgo --no-emit -p ./tsconfig.json", "bun check --no-emit -p ./tsconfig.json"),
        (
            "pnpm exec tsc --project tsconfig.json --noEmit",
            "bun check --project tsconfig.json --noEmit",
        ),
        (
            "bunx --bun tsgo --noEmit --strict && bun test",
            "bun check --noEmit --strict && bun test",
        ),
        ("tsc --noEmit;oxfmt --check .", "bun check --noEmit;bun fmt --check ."),
        ("tsc --noEmit\r\noxfmt --check .\r\n", "bun check --noEmit\r\nbun fmt --check .\r\n"),
    ] {
        let (findings, output) = apply_cli_rules("script.sh", source, false);
        assert_eq!(output, expected, "{source}");
        assert!(findings.iter().any(|finding| finding.rule_id == "cli/native-check-no-emit"));
        assert!(!findings.iter().any(|finding| finding.rule_id == "cli/native-check-manual"));
    }
}

#[test]
fn preserves_type_emission_declarations_and_watch_even_in_migration_mode() {
    for source in [
        "tsc",
        "pnpm exec tsc",
        "npx tsgo -d",
        "tsc --watch --noEmit",
        "bunx tsc --noEmit --emitDeclarationOnly",
        "tsgo --noEmit --declaration",
        "tsc --noEmit --build .",
        "npx tsc --noEmit --outDir dist",
        "tsc --noEmit false",
        "tsgo --noEmit --no-emit=false",
    ] {
        for aggressive in [false, true] {
            let (findings, output) = apply_cli_rules("script.sh", source, aggressive);
            assert_eq!(output, source, "no native or bunx fallback: {source}");
            assert_eq!(findings.len(), 1, "{source}");
            assert_eq!(findings[0].rule_id, "cli/native-check-manual");
            assert!(!findings[0].autofix);
        }
    }
}

#[test]
fn requires_manual_eslint_and_prettier_configuration_migration() {
    for source in [
        "npx eslint --config eslint.config.mjs src",
        "pnpm exec eslint --fix .",
        "prettier --write .",
        "bunx --bun prettier --config .prettierrc --check .",
    ] {
        for aggressive in [false, true] {
            let (findings, output) = apply_cli_rules("script.sh", source, aggressive);
            assert_eq!(output, source, "must not silently omit external configuration: {source}");
            assert_eq!(findings.len(), 1, "{source}");
            assert!(!findings[0].autofix);
            assert!(findings[0].rule_id.ends_with("-manual"));
        }
    }
    let (_, output) = apply_cli_rules("script.sh", "npx eslint .;oxfmt --check .", true);
    assert_eq!(output, "npx eslint .;bun fmt --check .");
}

#[test]
fn native_command_rules_preserve_comments_arguments_and_unrelated_packages() {
    for source in [
        "# npx tsc --noEmit",
        "  // pnpm exec oxlint --fix .",
        "echo 'tsc --noEmit'",
        "echo prettier.config.js",
        "echo prettier --write .",
        "node --inspect scripts/oxlint.js",
        "bunx @eslint/js",
        "bunx prettier-plugin-tailwindcss",
        "tsgo-helper --noEmit",
    ] {
        let (findings, output) = apply_cli_rules("script.sh", source, true);
        assert_eq!(output, source, "{source}");
        assert!(!findings.iter().any(|finding| finding.rule_id.starts_with("cli/native-")));
    }
    for (source, expected) in [
        ("npx shadcn add button", "bunx shadcn add button"),
        ("pnpm exec prettier-plugin-tailwindcss", "bunx prettier-plugin-tailwindcss"),
        ("npm exec eslint-config-bun", "bunx eslint-config-bun"),
        ("npx oxlint-fix src", "bunx oxlint-fix src"),
    ] {
        let (findings, output) = apply_cli_rules("script.sh", source, true);
        assert_eq!(output, expected);
        assert!(!findings.iter().any(|finding| finding.rule_id.starts_with("cli/native-")));
    }
}

#[test]
fn rewrites_versioned_native_tools_and_package_runner_flags() {
    for (source, expected) in [
        ("npx oxlint@0.15 --fix src", "bun lint --fix src"),
        ("npx --no-install oxlint@1.87.0 --format=json src", "bun lint --format=json src"),
        ("npm exec --yes -- oxfmt@0.72 --check src", "bun fmt --check src"),
        ("bunx --no-install --bun oxfmt@latest --write .", "bun fmt --write ."),
        ("npx -y n2b@latest --fix .", "bun n2b --fix ."),
        ("npx n2b@latest --fix .", "bun n2b --fix ."),
        ("npx --yes --no-install tsc@5.9 --noEmit", "bun check --noEmit"),
        ("bunx --bun tsgo@next --no-emit --strict", "bun check --no-emit --strict"),
    ] {
        let (findings, output) = apply_cli_rules("script.sh", source, false);
        assert_eq!(output, expected, "{source}");
        assert_eq!(findings.len(), 1, "must not fall back to bunx: {source}");
        assert!(findings[0].rule_id.starts_with("cli/native-"));
        assert!(findings[0].autofix);
    }
}

#[test]
fn versioned_tools_without_equivalent_native_behavior_remain_manual() {
    for source in [
        "bunx prettier@3 --check .",
        "npx --yes prettier@3 --plugin prettier-plugin-tailwindcss --write .",
        "npx --no-install eslint@9 --config eslint.config.js .",
        "npx -y tsgo@latest -d",
        "bunx --no-install tsc@5.9 --watch --noEmit",
        "npm exec --yes -- tsc@5 --emitDeclarationOnly",
    ] {
        for aggressive in [false, true] {
            let (findings, output) = apply_cli_rules("script.sh", source, aggressive);
            assert_eq!(output, source, "{source}");
            assert_eq!(findings.len(), 1, "must not fall back to bunx: {source}");
            assert!(findings[0].rule_id.ends_with("-manual"));
            assert!(!findings[0].autofix);
        }
    }
    for source in [
        "echo oxlint.config@1",
        "echo 'prettier@3 --write .'",
        "# npx --yes oxlint@0.15",
        "// bunx prettier@3 --check .",
        "bunx oxlint.config@1",
        "bunx prettier-plugin-tailwindcss@3",
    ] {
        let (findings, output) = apply_cli_rules("script.sh", source, true);
        assert_eq!(output, source, "{source}");
        assert!(!findings.iter().any(|finding| finding.rule_id.starts_with("cli/native-")));
    }
}

#[test]
fn native_commands_reuse_adjacent_separators() {
    use bun_migrate::scanners::package_json::scan_package_json;
    for (source, expected) in [
        ("npx oxlint;npx oxlint", "bun lint;bun lint"),
        ("npx oxfmt&&npx oxfmt", "bun fmt&&bun fmt"),
        ("npx oxlint||npx oxlint", "bun lint||bun lint"),
        ("npx tsc --noEmit;npx tsc --noEmit", "bun check --noEmit;bun check --noEmit"),
    ] {
        let content = serde_json::json!({ "scripts": { "quality": source } }).to_string();
        let (findings, output) = scan_package_json("package.json", &content);
        let output: serde_json::Value = serde_json::from_str(&output).unwrap();
        assert_eq!(output["scripts"]["quality"], expected, "{source}");
        assert_eq!(findings.iter().filter(|f| f.rule_id.starts_with("cli/native-")).count(), 2);
    }
}

#[test]
fn native_commands_work_through_document_scanners() {
    use bun_migrate::scanners::{dockerfile::scan_dockerfile, workflows::scan_workflow};
    let source =
        "FROM oven/bun:latest\nRUN npx -y oxlint@1.70.0 src;npm exec -- oxfmt@latest --check .\n";
    let (findings, output) = scan_dockerfile("Dockerfile", source, false);
    assert_eq!(output, "FROM oven/bun:latest\nRUN bun lint src;bun fmt --check .\n");
    assert_eq!(findings.len(), 2);
    assert_eq!(findings[0].original, "npx -y oxlint@1.70.0 src");
    let source = "steps:\n  - run: npx --yes tsc@6.0.2 --noEmit\n  - run: yarn dlx @aphrody/bun-plugin-n2b@latest --fix .\n";
    let (findings, output) = scan_workflow(".github/workflows/ci.yml", source, false);
    assert_eq!(output, "steps:\n  - run: bun check --noEmit\n  - run: bun n2b --fix .\n");
    assert_eq!(findings.len(), 2);
}

#[test]
fn wrapped_type_emitters_are_manual_without_runner_fallback() {
    use bun_migrate::scanners::package_json::scan_package_json;
    for command in [
        "npx -y tsc@6.0.2 -d",
        "npm exec -- tsc -b .",
        "pnpm dlx tsgo --declaration",
        "yarn dlx @typescript/native-preview@latest --noEmit false",
        "bunx --bun tsc --noEmit=false",
        "npx tsc --noEmit --declaration",
        "bunx @typescript/native-preview",
    ] {
        let source = format!("{command};{command}");
        for aggressive in [false, true] {
            let (findings, output) = apply_cli_rules("script.sh", &source, aggressive);
            assert_eq!(output, source, "{source}");
            assert_eq!(findings.len(), 2, "{source}");
            assert!(findings.iter().all(|f| f.rule_id == "cli/native-check-manual" && !f.autofix));
            assert!(findings.iter().all(|f| f.message.contains("SDK TypeScript")));
        }
        let content = serde_json::json!({ "scripts": { "build": source } }).to_string();
        let (findings, output) = scan_package_json("package.json", &content);
        let output: serde_json::Value = serde_json::from_str(&output).unwrap();
        assert_eq!(output["scripts"]["build"], source);
        assert_eq!(
            findings
                .iter()
                .filter(|f| f.rule_id == "cli/native-check-manual" && !f.autofix)
                .count(),
            2
        );
    }
    assert_eq!(rewrite("npx unrelated-package --noEmit"), "bunx unrelated-package --noEmit");
    assert_eq!(
        rewrite("bunx --bun @typescript/native-preview@latest --noEmit"),
        "bun check --noEmit"
    );
}

#[test]
fn generic_package_runners_do_not_rewrite_echo_arguments() {
    for source in [
        "echo npx shadcn add button",
        "echo 'npx oxlint@0.15 --fix .'",
        "echo \"npm exec prettier@3 --write .\"",
        "echo 'pnpm exec eslint --config eslint.config.js .'",
        "echo 'pnpm dlx shadcn add button'",
        "echo \"yarn exec oxfmt --check .\"",
        "echo 'yarn dlx n2b@latest --fix .'",
        "# npx shadcn add button",
        "  // npm exec shadcn add button",
    ] {
        let (findings, output) = apply_cli_rules("script.sh", source, true);
        assert_eq!(output, source, "{source}");
        assert!(findings.is_empty(), "echo/comment is data: {source}");
    }
}

#[test]
fn generic_package_runners_rewrite_executable_positions_and_keep_shell_prefixes() {
    for (source, expected) in [
        ("  npx shadcn add button", "  bunx shadcn add button"),
        ("npm exec shadcn add button", "bunx shadcn add button"),
        ("pnpm exec shadcn add button", "bunx shadcn add button"),
        ("pnpm dlx shadcn add button", "bunx shadcn add button"),
        ("yarn exec shadcn add button", "bunx shadcn add button"),
        ("yarn dlx shadcn add button", "bunx shadcn add button"),
        ("echo ready && npx shadcn add button", "echo ready && bunx shadcn add button"),
        ("npx shadcn;npx create-vite", "bunx shadcn;bunx create-vite"),
        ("(npx shadcn add button)", "(bunx shadcn add button)"),
        ("$(npm exec shadcn add button)", "$(bunx shadcn add button)"),
        ("npx shadcn | pnpm exec create-vite", "bunx shadcn | bunx create-vite"),
        ("RUN npx shadcn add button", "RUN bunx shadcn add button"),
        ("  - run: npm exec shadcn add button", "  - run: bunx shadcn add button"),
    ] {
        let (findings, output) = apply_cli_rules("script.sh", source, true);
        assert_eq!(output, expected, "{source}");
        assert!(!findings.is_empty(), "{source}");
        assert!(!findings.iter().any(|finding| finding.rule_id.starts_with("cli/native-")));
    }
}

#[test]
fn quoted_or_escaped_operators_do_not_make_arguments_executable() {
    for source in [
        "echo 'x; npx shadcn add button'",
        "echo \"x && npx oxlint@0.15 --fix .\"",
        "echo 'x | npm exec oxfmt --write .'",
        "echo \"x (pnpm exec shadcn)\"",
        "echo 'x; npm install'",
        r#"echo "x \" && npx shadcn add button""#,
        r"echo x\; npx shadcn add button",
        r"echo x\&\& npx shadcn add button",
        r"echo 'it'\''s; npx shadcn add button'",
        "echo done # ignored; npx shadcn add button",
        "echo '$(npx shadcn add button)'",
    ] {
        for aggressive in [false, true] {
            let (findings, output) = apply_cli_rules("script.sh", source, aggressive);
            assert_eq!(output, source, "{source}");
            assert!(findings.is_empty(), "literal argument or comment: {source}");
        }
    }
}

#[test]
fn real_commands_after_quoted_arguments_and_in_substitutions_still_rewrite() {
    for (source, expected) in [
        (
            "echo 'x; npx shadcn'; npx shadcn add button",
            "echo 'x; npx shadcn'; bunx shadcn add button",
        ),
        (
            "echo \"x && npx oxlint\" && npx oxlint --fix .",
            "echo \"x && npx oxlint\" && bun lint --fix .",
        ),
        (r"echo x\\; npx shadcn add button", r"echo x\\; bunx shadcn add button"),
        ("echo \"$(npx shadcn add button)\"", "echo \"$(bunx shadcn add button)\""),
        (
            "echo 'x; npm install' | npm exec shadcn add button",
            "echo 'x; npm install' | bunx shadcn add button",
        ),
        ("RUN echo 'x; npx shadcn'; npx shadcn", "RUN echo 'x; npx shadcn'; bunx shadcn"),
        ("  - run: echo 'x; npx shadcn'; npx shadcn", "  - run: echo 'x; npx shadcn'; bunx shadcn"),
    ] {
        let (findings, output) = apply_cli_rules("script.sh", source, true);
        assert_eq!(output, expected, "{source}");
        assert_eq!(findings.len(), 1, "only the real command: {source}");
    }
}

#[test]
fn native_findings_exclude_shared_command_separators() {
    for (source, expected, original, replacement) in [
        ("npx oxlint;npx oxlint", "bun lint;bun lint", "npx oxlint", "bun lint"),
        ("npx oxfmt&&npx oxfmt", "bun fmt&&bun fmt", "npx oxfmt", "bun fmt"),
        (
            "npx tsc --noEmit;npx tsc --noEmit",
            "bun check --noEmit;bun check --noEmit",
            "npx tsc --noEmit",
            "bun check --noEmit",
        ),
    ] {
        let (findings, output) = apply_cli_rules("script.sh", source, true);
        assert_eq!(output, expected);
        assert_eq!(findings.len(), 2);
        for finding in findings {
            assert_eq!(finding.original, original);
            assert_eq!(finding.replacement.as_deref(), Some(replacement));
        }
    }
}

#[test]
fn substitutions_comments_and_literal_type_flags_keep_their_contexts() {
    let source = "echo \"$(echo 'x; npx literal'; npx shadcn)\" && npx oxlint .";
    let (findings, output) = apply_cli_rules("script.sh", source, true);
    assert_eq!(output, "echo \"$(echo 'x; npx literal'; bunx shadcn)\" && bun lint .");
    assert_eq!(findings.len(), 2);
    let source = "echo done # fake; npx oxlint\nnpx shadcn";
    let (findings, output) = apply_cli_rules("script.sh", source, true);
    assert_eq!(output, "echo done # fake; npx oxlint\nbunx shadcn");
    assert_eq!(findings.len(), 1);
    let source = r#"echo "\$(npx shadcn)""#;
    assert_eq!(apply_cli_rules("script.sh", source, true).1, source);
    let source = r#"npx tsc --project "config --noEmit value.json""#;
    let (findings, output) = apply_cli_rules("script.sh", source, true);
    assert_eq!(output, source);
    assert_eq!(findings.len(), 1);
    assert_eq!(findings[0].rule_id, "cli/native-check-manual");
    assert!(!findings[0].autofix);
}

#[test]
fn procfile_scanner_preserves_process_labels_and_reports_commands() {
    use bun_migrate::scanners::procfile::scan_procfile;

    for path in ["Procfile", "Procfile.dev", "config/Procfile.production", "config\\Procfile.dev"] {
        let source = "web: npm start\nworker: node worker.js\n";
        let (findings, output) = scan_procfile(path, source, false);
        assert_eq!(output, "web: bun start\nworker: node worker.js\n", "{path}");
        assert!(findings.iter().any(|f| f.rule_id == "cli/node-script" && !f.autofix));
        let findings: Vec<_> =
            findings.into_iter().filter(|f| f.rule_id != "cli/node-script").collect();
        assert_eq!(findings.len(), 1, "{path}");
        assert_eq!(findings[0].rule_id, "cli/npm-start");
        assert_eq!(findings[0].original, "npm start");
        assert_eq!(findings[0].replacement.as_deref(), Some("bun start"));
    }

    let source = "web:npx oxlint --fix .\n  worker: npx shadcn add button\n";
    let (findings, output) = scan_procfile("Procfile.dev", source, true);
    assert_eq!(output, "web:bun lint --fix .\n  worker: bunx shadcn add button\n");
    assert_eq!(findings.len(), 2);
    assert_eq!(findings[0].original, "npx oxlint --fix .");
    assert_eq!(findings[0].replacement.as_deref(), Some("bun lint --fix ."));

    let source = "web: echo 'x; npx literal'; npx oxlint . # npx ignored\n";
    let (findings, output) = scan_procfile("Procfile", source, true);
    assert_eq!(output, "web: echo 'x; npx literal'; bun lint . # npx ignored\n");
    assert_eq!(findings.len(), 1);
}

#[test]
fn procfile_labels_do_not_enable_shell_arguments_comments_or_literals() {
    for path in ["script.sh", "Procfile.dev"] {
        for source in [
            "echo web: npx shadcn add button",
            "echo 'web: npx shadcn add button'",
            "echo \"web: x && npx oxlint\"",
            "# web: npm start\n",
            "echo 'literal\nweb: npx shadcn\n'",
            "echo \\\nweb: npx shadcn",
        ] {
            let (findings, output) = apply_cli_rules(path, source, true);
            assert_eq!(output, source, "{path}: {source}");
            assert!(findings.is_empty(), "{path}: {source}");
        }
    }
    let source = "web: npm start\n";
    for path in ["script.sh", "MyProcfile"] {
        let (findings, output) = apply_cli_rules(path, source, true);
        assert_eq!(output, source);
        assert!(findings.is_empty());
    }
}

#[test]
fn brave_pnpm_frozen_yes_and_node_scripts() {
    let src =
        "pnpm install --frozen-lockfile --yes && node ./build/commands/scripts/sync.ts --init";
    let (_, out) = apply_cli_rules("package.json [scripts.init]", src, true);
    assert_eq!(out, "bun install && bun ./build/commands/scripts/sync.ts --init");
    let (_, out) = apply_cli_rules("p [scripts.a]", "pnpm install --yes", true);
    assert_eq!(out, "bun install");
    let jest = "node --no-sparkplug node_modules/jest/bin/jest.js";
    assert_eq!(apply_cli_rules("p [scripts.t]", jest, true).1, jest);
    let (findings, out) = apply_cli_rules("p [scripts.b]", "node ./build.ts", false);
    assert_eq!(out, "node ./build.ts", "node → bun is aggressive-only");
    assert!(findings.iter().any(|f| f.rule_id == "cli/node-script" && !f.autofix));
}
