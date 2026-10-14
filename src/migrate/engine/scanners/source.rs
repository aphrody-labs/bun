// Copyright 2026 aphrody-code
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

use crate::rules::{
    bun_apis::apply_bun_api_rules_with_context, imports_ast::analyze_source,
    node_imports::apply_node_import_rules_with_specifiers,
};
use crate::types::{Finding, Mode, RunOptions};

use crate::scanners::shebang::scan_shebang;

pub fn scan_source(path: &str, content: &str, opts: &RunOptions) -> (Vec<Finding>, String) {
    let mut all: Vec<Finding> = Vec::new();
    let aggressive = opts.mode == Mode::Aggressive;

    let (f, working) = scan_shebang(path, content);
    all.extend(f);
    let (f, imported, context) = analyze_source(path, &working, |specifiers| {
        apply_node_import_rules_with_specifiers(path, &working, aggressive, specifiers)
    });
    all.extend(f);
    let (f, working) =
        apply_bun_api_rules_with_context(path, &imported, aggressive, &context.imports, &context);
    all.extend(f);
    all.extend(crate::rules::test_apis::test_api_findings(path, content));

    if opts.mode == Mode::Check {
        return (all, content.to_string());
    }
    (all, working)
}
