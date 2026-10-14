// Copyright 2026 aphrody-code
// SPDX-License-Identifier: Apache-2.0
use bun_migrate::{
    scanners::source::scan_source,
    types::{Mode, Report, RunOptions},
};

fn options() -> RunOptions {
    RunOptions {
        root: ".".into(),
        mode: Mode::Aggressive,
        report: Report::Json,
        quiet: true,
        ignore: vec![],
        agent: false,
        dry_run: true,
        since: None,
    }
}

#[test]
fn comments_strings_templates_and_regexp_are_not_migrated() {
    let source = r#"
// Buffer.from(value, 'base64'); child_process.spawn('tool');
/* const bytes = fs.readFileSync('input'); */
const note = "Buffer.from(value, 'base64')";
const template = `Buffer.from(value, 'base64')`;
const pattern = /Buffer.from(value, 'base64')/;
Bun.spawn(['tool']);
"#;
    let (findings, after) = scan_source("example.ts", source, &options());
    assert!(findings.iter().all(|f| !f.rule_id.starts_with("api/")), "{findings:?}");
    assert_eq!(source, after);
}

#[test]
fn native_bun_and_local_or_shadowed_spawn_are_not_node_calls() {
    for source in [
        "import {spawn} from 'node:child_process'; Bun.spawn(['tool']);",
        "const spawn = () => {}; spawn();",
        "import {spawn} from 'node:child_process'; function f(spawn) { spawn(); }",
        "import * as cp from 'node:child_process'; function f(cp) { cp.spawn(); }",
    ] {
        let (findings, _) = scan_source("example.ts", source, &options());
        assert!(
            findings.iter().all(|f| f.rule_id != "api/child-process-spawn"),
            "{source}: {findings:?}"
        );
    }
}

#[test]
fn node_spawn_named_alias_namespace_and_commonjs_calls_are_detected() {
    for source in [
        "import {spawn} from 'node:child_process'; spawn('tool');",
        "import {spawn as launch} from 'node:child_process'; launch('tool');",
        "import * as cp from 'node:child_process'; cp.spawn('tool');",
        "const cp = require('node:child_process'); cp.spawn('tool');",
        "const {spawn} = require('node:child_process'); spawn('tool');",
    ] {
        let (findings, _) = scan_source("example.ts", source, &options());
        assert_eq!(
            findings.iter().filter(|f| f.rule_id == "api/child-process-spawn").count(),
            1,
            "{source}: {findings:?}"
        );
    }
}

#[test]
fn template_interpolation_is_executable_but_template_text_is_not() {
    let source = "import {spawn as launch} from 'node:child_process'; const s = `spawn('text') ${launch('tool')}`;";
    let (findings, _) = scan_source("example.ts", source, &options());
    let spawn =
        findings.iter().filter(|f| f.rule_id == "api/child-process-spawn").collect::<Vec<_>>();
    assert_eq!(spawn.len(), 1);
    assert_eq!(spawn[0].original, "launch(");
}

#[test]
fn real_api_with_string_arguments_is_still_detected() {
    let source = "const decoded = Buffer.from(value, 'base64');";
    let (findings, _) = scan_source("example.ts", source, &options());
    assert!(findings.iter().any(|f| f.rule_id == "api/buffer-from-base64"));
}

#[test]
fn source_context_tracks_offsets_after_shebang_and_import_rewrites() {
    for module in ["fs", "node:fs"] {
        for executable in ["node", "bun"] {
            let source = format!(
                "#!/usr/bin/env {executable}\nimport fs from '{module}';\nexport const text = fs.readFileSync('input', 'utf8');\n"
            );
            let (findings, after) = scan_source("example.ts", &source, &options());
            assert!(findings.iter().any(|f| f.rule_id == "api/fs-readFileSync"), "{findings:?}");
            assert!(
                after.starts_with("#!/usr/bin/env bun\nimport fs from 'node:fs';\n"),
                "{after}"
            );
            assert!(after.contains("await Bun.file('input').text()"), "{after}");
        }
    }
}

#[test]
#[ignore = "manual native pipeline timing; run with --ignored --nocapture"]
fn native_source_pipeline_timing() {
    use std::time::Instant;

    let mut opts = options();
    opts.mode = Mode::Fix;
    let declarations = "import fs from \"node:fs\";\n".to_owned()
        + &(0..3000).map(|i| format!("const v{i} = {i};\n")).collect::<String>();
    let imports = "import \"fs\";\n".repeat(8000);
    for (name, source, expected) in [
        ("unchanged-3000-declarations", declarations.clone(), declarations),
        ("prefix-8000-imports", imports, "import \"node:fs\";\n".repeat(8000)),
    ] {
        for _ in 0..3 {
            let _ = scan_source("large.ts", &source, &opts);
        }
        let mut samples = Vec::new();
        for _ in 0..9 {
            let start = Instant::now();
            let (_, output) = scan_source("large.ts", &source, &opts);
            samples.push(start.elapsed().as_secs_f64() * 1000.0);
            assert_eq!(output, expected);
        }
        samples.sort_by(f64::total_cmp);
        println!(
            "{name}: bytes={}, median_ms={:.4}, samples={samples:?}",
            source.len(),
            samples[4]
        );
    }
}
