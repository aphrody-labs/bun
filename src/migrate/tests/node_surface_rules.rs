// Copyright 2026 aphrody-code
// SPDX-License-Identifier: Apache-2.0
//! Rules added from the Node public surface (docs/aphrody/merge/M-n2b-node.md).
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

fn rule_ids(source: &str) -> Vec<String> {
    scan_source("example.ts", source, &options()).0.into_iter().map(|f| f.rule_id).collect()
}

#[test]
fn util_and_os_calls_are_rewritten_to_bun_natives() {
    let source = "import util from 'node:util';\nimport os from 'node:os';\n\
const same = util.isDeepStrictEqual(a, b);\n\
const plain = util.stripVTControlCharacters(text);\n\
const jobs = os.availableParallelism();\n\
const cpus = os.cpus().length;\n";
    let (_, after) = scan_source("example.ts", source, &options());
    assert!(after.contains("const same = Bun.deepEquals(a, b, true);"), "{after}");
    assert!(after.contains("const plain = Bun.stripANSI(text);"), "{after}");
    assert!(after.contains("const jobs = navigator.hardwareConcurrency;"), "{after}");
    assert!(after.contains("const cpus = navigator.hardwareConcurrency;"), "{after}");
}

#[test]
fn calls_with_a_bun_equivalent_are_reported() {
    let source = "import zlib from 'node:zlib';\nimport { spawnSync } from 'node:child_process';\n\
import { DatabaseSync } from 'node:sqlite';\nimport fs from 'node:fs';\nimport net from 'node:net';\n\
import dns from 'node:dns';\nimport crypto from 'node:crypto';\nimport readline from 'node:readline';\n\
zlib.gunzipSync(data);\nspawnSync('git', ['status']);\nnew DatabaseSync(':memory:');\nfs.globSync('*.ts');\n\
net.createServer(onConn);\ndns.lookup('localhost');\nprocess.hrtime();\ncrypto.hash('sha1', data);\n\
readline.createInterface({ input: process.stdin });\n";
    let ids = rule_ids(source);
    for id in [
        "api/zlib-gunzipSync",
        "api/child-process-spawnSync",
        "api/sqlite-DatabaseSync",
        "api/fs-globSync",
        "api/net-createServer",
        "api/dns-lookup",
        "api/process-hrtime",
        "api/crypto-hash",
        "api/readline-createInterface",
    ] {
        assert!(ids.iter().any(|f| f == id), "{id} manquant dans {ids:?}");
    }
}

#[test]
fn call_with_extra_arguments_is_not_rewritten() {
    let source = "import util from 'node:util';\nconst same = util.isDeepStrictEqual(a, b, c);\n";
    let (_, after) = scan_source("example.ts", source, &options());
    assert_eq!(source, after);
}

#[test]
fn browser_bundled_sources_keep_bare_builtins() {
    let src = "import { EventEmitter } from 'events';\nwindow.ethereum = new EventEmitter();\n";
    let path = "components/brave_wallet/resources/ethereum_provider.js";
    let (_, after) = scan_source(path, src, &options());
    assert_eq!(after, src);
    let tsx = "import * as React from 'react';\nimport { createHash } from 'crypto';\n";
    let path = "components/brave_wallet_ui/components/desktop/hardware_wallet_connect.tsx";
    assert_eq!(scan_source(path, tsx, &options()).1, tsx);
    let (_, after) =
        scan_source("tools/lit_mangler/mangle.ts", "import fs from 'fs';\n", &options());
    assert_eq!(after, "import fs from 'node:fs';\n");
}

#[test]
fn jest_config_imports_are_never_rewritten_to_bun_test() {
    let src = "import type { Config } from 'jest';\nimport { createJsWithTsEsmPreset } from 'ts-jest';\nexport default { ...createJsWithTsEsmPreset() } satisfies Config;\n";
    let (findings, after) = scan_source("jest.config.ts", src, &options());
    assert!(!after.contains("bun:test"), "{after}");
    assert!(
        findings
            .iter()
            .any(|f| f.rule_id == "imports/bun-native" && f.message.contains("not applied"))
    );
}

#[test]
fn jest_globals_kept_while_project_runs_jest() {
    let root = std::env::temp_dir().join(format!("n2b-jest-{}", std::process::id()));
    std::fs::create_dir_all(&root).unwrap();
    std::fs::write(root.join("jest.config.ts"), "export default { testEnvironment: 'jsdom' }\n")
        .unwrap();
    let mut opts = options();
    opts.root = root.clone();
    let src = "import { describe, expect, test } from '@jest/globals';\ntest('a', () => expect(1).toBe(1));\n";
    let (findings, after) = scan_source("common/a.test.ts", src, &opts);
    std::fs::remove_dir_all(&root).unwrap();
    assert_eq!(after, src);
    assert!(findings.iter().any(|f| f.message.contains("exécute encore Jest")));
    let (_, after) = scan_source("common/a.test.ts", src, &options());
    assert!(after.contains("from 'bun:test'"), "{after}");
}

#[test]
fn node_run_tool_configs_keep_node_apis() {
    let src = "import path from 'node:path';\nimport { fileURLToPath } from 'node:url';\nconst __filename = fileURLToPath(import.meta.url);\nexport default { context: path.dirname(__filename) };\n";
    let (findings, after) = scan_source("ios/brave-ios/webpack.config.js", src, &options());
    assert_eq!(after, src);
    assert!(findings.iter().any(|f| f.rule_id == "api/filename-esm" && !f.autofix));
}
