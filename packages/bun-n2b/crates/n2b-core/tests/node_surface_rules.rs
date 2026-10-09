// Copyright 2026 aphrody-code
// SPDX-License-Identifier: Apache-2.0
//! Rules added from the Node public surface (docs/aphrody/merge/M-n2b-node.md).
use aphrody_n2b_core::{
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
