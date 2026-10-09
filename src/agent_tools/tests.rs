// SPDX-License-Identifier: Apache-2.0
// Fixtures are written with std::fs; the code under test reads them through bun_sys.
#![allow(clippy::disallowed_methods)]

use std::{fs, path::Path, sync::atomic::AtomicBool};

use serde_json::{Value, json};

use crate::{Context, SCHEMAS, ToolError, call, tools};

fn run(root: &Path, name: &str, args: &Value) -> crate::Result<String> {
    let cancel = AtomicBool::new(false);
    call(
        &Context {
            cwd: root,
            cancel: &cancel,
        },
        name,
        args,
    )
}

fn write(root: &Path, rel: &str, data: &[u8]) {
    let path = root.join(rel);
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, data).unwrap();
}

fn json_of(text: &str) -> Value {
    serde_json::from_str(text).unwrap()
}

#[test]
fn every_schema_has_an_implementation_and_an_object_schema() {
    assert_eq!(tools().len(), SCHEMAS.len());
    let mut names: Vec<&str> = SCHEMAS.iter().map(|s| s.name).collect();
    names.sort_unstable();
    names.dedup();
    assert_eq!(names.len(), SCHEMAS.len(), "duplicate tool names");
    for schema in SCHEMAS {
        let parsed: Value = serde_json::from_str(schema.input_schema).unwrap();
        assert_eq!(parsed["type"], "object", "{}", schema.name);
        for required in parsed["required"].as_array().into_iter().flatten() {
            let key = required.as_str().unwrap();
            assert!(
                parsed["properties"].get(key).is_some(),
                "{}: required {key} is not a property",
                schema.name
            );
        }
    }
}

#[test]
fn generated_schemas_match_tools_json() {
    let manifest: Value = serde_json::from_str(include_str!("tools.json")).unwrap();
    let declared = manifest["tools"].as_array().unwrap();
    assert_eq!(
        declared.len(),
        SCHEMAS.len(),
        "run: bun src/codegen/generate-agent-tools.ts"
    );
    for (tool, schema) in declared.iter().zip(SCHEMAS) {
        assert_eq!(tool["name"], schema.name);
        assert_eq!(tool["description"], schema.description);
        let input: Value = serde_json::from_str(schema.input_schema).unwrap();
        assert_eq!(
            tool["inputSchema"], input,
            "{}: run the generator",
            schema.name
        );
    }
}

#[test]
fn rejects_bad_calls() {
    let dir = tempfile::tempdir().unwrap();
    assert!(matches!(
        run(dir.path(), "nope", &Value::Null),
        Err(ToolError::Unknown(_))
    ));
    assert!(matches!(
        run(dir.path(), "deps_list", &json!([1])),
        Err(ToolError::Invalid(_))
    ));
    assert!(matches!(
        run(dir.path(), "deps_info", &json!({})),
        Err(ToolError::Invalid(_))
    ));
}

#[test]
fn git_ingest_digests_text_files_in_tree_order() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    write(root, "b.txt", b"bee\n");
    write(root, "A.md", b"# a\n");
    write(root, "src/lib.rs", b"fn main() {}\n");
    write(root, "blob.bin", b"\x00\x01\x02");
    write(root, ".gitignore", b"ignored.txt\n");
    write(root, "ignored.txt", b"secret\n");

    let out = run(root, "git_ingest", &json!({})).unwrap();
    let name = root.file_name().unwrap().to_string_lossy();
    assert!(
        out.starts_with(&format!(
            "Directory: {name}\nFiles analyzed: 3\nFiles listed only: 1\n"
        )),
        "{out}"
    );
    assert!(!out.contains("ignored.txt"), "{out}");
    let tree = format!(
        "└── {name}/\n    ├── A.md\n    ├── b.txt\n    ├── blob.bin\n    └── src/\n        └── lib.rs\n"
    );
    assert!(out.contains(&tree), "{out}");
    let a = out.find("FILE: A.md").unwrap();
    let b = out.find("FILE: b.txt").unwrap();
    let lib = out.find("FILE: src/lib.rs").unwrap();
    assert!(a < b && b < lib, "{out}");
    assert!(!out.contains("FILE: blob.bin"), "{out}");

    let sub = run(root, "git_ingest", &json!({ "subpath": "src" })).unwrap();
    assert!(sub.contains("Subpath: src\nFiles analyzed: 1\n"), "{sub}");
    assert!(sub.contains("FILE: src/lib.rs"), "{sub}");

    let capped = run(root, "git_ingest", &json!({ "max_total_bytes": 5 })).unwrap();
    assert!(
        capped.contains("Files analyzed: 1\nFiles listed only: 3\n"),
        "{capped}"
    );

    let only_rs = run(root, "git_ingest", &json!({ "include_patterns": ["*.rs"] })).unwrap();
    assert!(
        only_rs.contains("Files analyzed: 1\n") && only_rs.contains("FILE: src/lib.rs"),
        "{only_rs}"
    );
}

#[test]
fn git_ingest_stops_when_cancelled() {
    let dir = tempfile::tempdir().unwrap();
    write(dir.path(), "a.txt", b"a");
    let cancel = AtomicBool::new(true);
    let ctx = Context {
        cwd: dir.path(),
        cancel: &cancel,
    };
    assert!(matches!(
        call(&ctx, "git_ingest", &json!({})),
        Err(ToolError::Cancelled)
    ));
}

fn npm_fixture(root: &Path) {
    write(
        root,
        "package.json",
        br#"{"name":"app","dependencies":{"left-pad":"^1.3.0"},"devDependencies":{"missing":"1"}}"#,
    );
    write(
        root,
        "node_modules/left-pad/package.json",
        br#"{"name":"left-pad","version":"1.3.0","description":"String left pad","license":"WTFPL","types":"index.d.ts"}"#,
    );
    write(
        root,
        "node_modules/left-pad/README.md",
        "# left-pad\n\nPads strings.\n\n## Usage\n\n```js\nleftPad('foo', 5)\n```\n\n## Licence\n\nWTFPL — é\n".as_bytes(),
    );
    write(
        root,
        "node_modules/left-pad/index.js",
        b"module.exports = leftPad;\nfunction leftPad(str, len) {}\n",
    );
    write(root, "vendor/zlib/README", b"zlib compression library\n");
}

#[test]
fn deps_list_and_info_read_installed_manifests() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    npm_fixture(root);

    let list = json_of(&run(root, "deps_list", &json!({})).unwrap());
    let names: Vec<&str> = list["dependencies"]
        .as_array()
        .unwrap()
        .iter()
        .map(|d| d["name"].as_str().unwrap())
        .collect();
    assert!(
        names.contains(&"left-pad") && names.contains(&"zlib"),
        "{list}"
    );
    let pad = list["dependencies"]
        .as_array()
        .unwrap()
        .iter()
        .find(|d| d["name"] == "left-pad")
        .unwrap();
    assert_eq!(pad["version"], "1.3.0");

    let npm_only = json_of(
        &run(
            root,
            "deps_list",
            &json!({ "ecosystem": "npm", "filter": "PAD" }),
        )
        .unwrap(),
    );
    assert_eq!(
        npm_only["dependencies"].as_array().unwrap().len(),
        1,
        "{npm_only}"
    );

    let info = json_of(&run(root, "deps_info", &json!({ "name": "left-pad" })).unwrap());
    assert_eq!(info["description"], "String left pad");
    assert_eq!(info["license"], "WTFPL");
    assert_eq!(info["docs"], json!(["README.md"]));

    assert!(matches!(
        run(root, "deps_info", &json!({ "name": "missing" })),
        Err(ToolError::NotFound(_))
    ));
}

#[test]
fn deps_tree_and_read_stay_inside_the_dependency() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    npm_fixture(root);

    let tree = json_of(&run(root, "deps_tree", &json!({ "name": "left-pad" })).unwrap());
    assert_eq!(
        tree["entries"],
        json!(["README.md", "index.js", "package.json"])
    );

    let read = json_of(
        &run(
            root,
            "deps_read",
            &json!({ "name": "left-pad", "path": "README.md", "max_bytes": 9 }),
        )
        .unwrap(),
    );
    assert_eq!(read["content"], "# left-pa");
    assert_eq!(read["truncated"], true);

    // A cut inside a multi-byte character backs off to its first byte.
    let readme = fs::read(root.join("node_modules/left-pad/README.md")).unwrap();
    let e_acute = readme.len() - 2 - 1;
    let tail = json_of(
        &run(root, "deps_read", &json!({ "name": "left-pad", "path": "README.md", "offset": e_acute - 1, "max_bytes": 2 }))
            .unwrap(),
    );
    assert_eq!(tail["content"], " ");

    for escape in ["../package.json", "/etc/passwd"] {
        assert!(
            matches!(
                run(
                    root,
                    "deps_read",
                    &json!({ "name": "left-pad", "path": escape })
                ),
                Err(ToolError::Invalid(_))
            ),
            "{escape}"
        );
    }
}

#[test]
fn deps_search_and_docs_find_text() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    npm_fixture(root);

    let hits = json_of(
        &run(
            root,
            "deps_search",
            &json!({ "query": "leftPad\\(", "names": ["left-pad"] }),
        )
        .unwrap(),
    );
    let results = hits["matches"].as_array().unwrap();
    assert_eq!(results.len(), 2, "{hits}");
    assert!(
        results.iter().all(|r| r["line"].as_u64().is_some()),
        "{hits}"
    );

    let none = json_of(
        &run(
            root,
            "deps_search",
            &json!({ "query": "LEFTPAD", "names": ["left-pad"] }),
        )
        .unwrap(),
    );
    assert_eq!(none["matches"].as_array().unwrap().len(), 0, "{none}");
    let ci = json_of(
        &run(
            root,
            "deps_search",
            &json!({ "query": "LEFTPAD", "names": ["left-pad"], "case_insensitive": true }),
        )
        .unwrap(),
    );
    assert!(!ci["matches"].as_array().unwrap().is_empty(), "{ci}");

    let docs = json_of(
        &run(
            root,
            "deps_docs",
            &json!({ "query": "usage", "names": ["left-pad"] }),
        )
        .unwrap(),
    );
    assert_eq!(docs["results"][0]["heading"], "Usage", "{docs}");
    assert_eq!(docs["results"][0]["dependency"], "left-pad", "{docs}");
}
