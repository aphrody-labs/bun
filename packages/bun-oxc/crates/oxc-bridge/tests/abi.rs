//! C ABI 2 contract: response shapes, ownership and error kinds.

use std::{
    ffi::{CStr, CString, c_char},
    process::Command,
};

use aphrody_oxc_bridge::{
    aphrody_oxc_abi_version, aphrody_oxc_analyze, aphrody_oxc_check, aphrody_oxc_format,
    aphrody_oxc_free, aphrody_oxc_isolated_declaration, aphrody_oxc_lint, aphrody_oxc_minify,
    aphrody_oxc_minify_with, aphrody_oxc_parse, aphrody_oxc_resolve, aphrody_oxc_transform,
};

fn tool(env: &str, name: &str) -> String {
    std::env::var(env).unwrap_or_else(|_| name.to_owned())
}

fn response(pointer: *mut c_char) -> serde_json::Value {
    assert!(!pointer.is_null());
    // SAFETY: Each test passes a live bridge-owned result, then frees it once.
    let value = serde_json::from_str(unsafe { CStr::from_ptr(pointer) }.to_str().unwrap()).unwrap();
    unsafe { aphrody_oxc_free(pointer) };
    value
}

#[test]
fn formatting_minification_and_lint_preserve_response_shapes() {
    let source = CString::new("const greeting='hello'; console.log(greeting)").unwrap();
    let filename = CString::new("fixture.js").unwrap();
    let formatted = response(unsafe { aphrody_oxc_format(source.as_ptr(), filename.as_ptr()) });
    let minified = response(unsafe { aphrody_oxc_minify(source.as_ptr(), filename.as_ptr()) });
    let linted = response(unsafe { aphrody_oxc_lint(source.as_ptr(), filename.as_ptr()) });
    assert_eq!(aphrody_oxc_abi_version(), 2);
    assert_eq!(minified["ok"], true);
    assert!(minified["code"].as_str().unwrap().contains("console.log"));
    // Formatting and linting need the external binaries; without them the error names the tool.
    if installed("APHRODY_OXFMT", "oxfmt") {
        assert_eq!(formatted["ok"], true);
        assert!(formatted["code"].as_str().unwrap().contains("const greeting"));
    } else {
        assert!(formatted["error"].as_str().unwrap().contains("oxfmt"));
    }
    if installed("APHRODY_OXLINT", "oxlint") {
        assert_eq!(linted["ok"], true);
        assert!(linted["diagnostics"].is_array());
    } else {
        assert!(linted["error"].as_str().unwrap().contains("oxlint"));
    }
}

fn installed(env: &str, name: &str) -> bool {
    Command::new(tool(env, name))
        .arg("--version")
        .output()
        .is_ok_and(|output| output.status.success())
}

#[test]
fn formatting_and_lint_delegate_to_oxfmt_and_oxlint() {
    let filename = CString::new("fixture.js").unwrap();
    let source = CString::new("const x=1").unwrap();
    let formatted = response(unsafe { aphrody_oxc_format(source.as_ptr(), filename.as_ptr()) });
    if installed("APHRODY_OXFMT", "oxfmt") {
        assert_eq!(formatted["code"], "const x = 1;\n");
    } else {
        assert!(formatted["error"].as_str().unwrap().contains("oxfmt"));
    }
    let bad = CString::new("const = ;").unwrap();
    let linted = response(unsafe { aphrody_oxc_lint(bad.as_ptr(), filename.as_ptr()) });
    if installed("APHRODY_OXLINT", "oxlint") {
        assert!(!linted["diagnostics"].as_array().unwrap().is_empty());
        // Exported, so the default no-unused-vars rule has nothing to report.
        let used = CString::new("export const x = 1;\n").unwrap();
        let clean = response(unsafe { aphrody_oxc_lint(used.as_ptr(), filename.as_ptr()) });
        assert_eq!(clean["diagnostics"], serde_json::json!([]));
    } else {
        assert!(linted["error"].as_str().unwrap().contains("oxlint"));
    }
}

#[test]
fn null_invalid_utf8_and_invalid_syntax_return_owned_errors() {
    let filename = CString::new("fixture.js").unwrap();
    let null = response(unsafe { aphrody_oxc_format(std::ptr::null(), filename.as_ptr()) });
    assert_eq!(null["ok"], false);
    let invalid_utf8 = [0xff_u8, 0];
    let invalid =
        response(unsafe { aphrody_oxc_minify(invalid_utf8.as_ptr().cast(), filename.as_ptr()) });
    assert_eq!(invalid["ok"], false);
    let source = CString::new("const = ;").unwrap();
    let syntax = response(unsafe { aphrody_oxc_minify(source.as_ptr(), filename.as_ptr()) });
    assert_eq!(syntax["ok"], false);
    let linted = response(unsafe { aphrody_oxc_lint(source.as_ptr(), filename.as_ptr()) });
    if installed("APHRODY_OXLINT", "oxlint") {
        assert_eq!(linted["ok"], true);
        assert!(!linted["diagnostics"].as_array().unwrap().is_empty());
    } else {
        assert_eq!(linted["ok"], false);
    }
    // SAFETY: Null is an explicitly accepted no-op.
    unsafe { aphrody_oxc_free(std::ptr::null_mut()) };
}

#[test]
fn module_metadata_preserves_physical_requests_types_and_utf16_spans() {
    let text = "// 🐈\nimport './dep'; export { value } from './other'; import './dep'; export * from './all'; export interface Shape {} export default 1;";
    let source = CString::new(text).unwrap();
    let filename = CString::new("fixture.ts").unwrap();
    let value = response(unsafe { aphrody_oxc_analyze(source.as_ptr(), filename.as_ptr()) });
    assert_eq!(value["ok"], true);
    let result = &value["result"];
    assert_eq!(result["imports"], serde_json::json!(["./dep", "./other", "./dep", "./all"]));
    assert_eq!(result["exports"], serde_json::json!(["value", "*", "Shape", "default"]));
    assert_eq!(result["spanEncoding"], "utf16");
    let utf16 = text.encode_utf16().collect::<Vec<_>>();
    for request in result["requests"].as_array().unwrap() {
        let start = request["start"].as_u64().unwrap() as usize;
        let end = request["end"].as_u64().unwrap() as usize;
        let literal = String::from_utf16(&utf16[start..end]).unwrap();
        assert_eq!(literal, format!("'{}'", request["specifier"].as_str().unwrap()));
    }
}

#[test]
fn official_estree_serialization_retains_typed_declarations() {
    let source = CString::new("export interface Shape { value: number }").unwrap();
    let filename = CString::new("fixture.ts").unwrap();
    let value = response(unsafe { aphrody_oxc_parse(source.as_ptr(), filename.as_ptr()) });
    assert_eq!(value["ok"], true);
    assert_eq!(value["result"]["type"], "Program");
    assert_eq!(value["result"]["body"][0]["declaration"]["type"], "TSInterfaceDeclaration");
}

#[test]
fn analysis_rejects_invalid_inputs_syntax_and_semantics() {
    let filename = CString::new("fixture.ts").unwrap();
    let null = response(unsafe { aphrody_oxc_analyze(std::ptr::null(), filename.as_ptr()) });
    assert_eq!(null["kind"], "input");
    for text in ["export const = ;", "let duplicate; let duplicate;"] {
        let source = CString::new(text).unwrap();
        let value = response(unsafe { aphrody_oxc_parse(source.as_ptr(), filename.as_ptr()) });
        assert_eq!(value["ok"], false);
        assert_eq!(value["kind"], "syntax");
    }
}

#[test]
fn abi2_transform_declarations_minify_check_and_resolve() {
    let filename = CString::new("fixture.ts").unwrap();
    let source = CString::new("export const f = (a?: number): number => a ?? 1;").unwrap();
    let options = CString::new(r#"{"target":"es2019","sourcemap":true}"#).unwrap();
    let out = response(unsafe {
        aphrody_oxc_transform(source.as_ptr(), filename.as_ptr(), options.as_ptr())
    });
    assert_eq!(out["ok"], true);
    assert!(!out["code"].as_str().unwrap().contains("??"));
    assert!(out["map"].as_str().unwrap().contains("\"version\":3"));
    let plain = response(unsafe {
        aphrody_oxc_transform(source.as_ptr(), filename.as_ptr(), std::ptr::null())
    });
    assert_eq!(plain["ok"], true);
    assert_eq!(plain["map"], serde_json::Value::Null);
    let bad = CString::new(r#"{"jsx":"nope"}"#).unwrap();
    let rejected =
        response(unsafe { aphrody_oxc_transform(source.as_ptr(), filename.as_ptr(), bad.as_ptr()) });
    assert_eq!(rejected["kind"], "input");

    let dts = response(unsafe {
        aphrody_oxc_isolated_declaration(source.as_ptr(), filename.as_ptr(), std::ptr::null())
    });
    assert_eq!(dts["ok"], true);
    assert!(dts["code"].as_str().unwrap().contains("export declare const f"), "{dts}");

    let keep = CString::new(r#"{"mangle":false,"whitespace":false}"#).unwrap();
    let js = CString::new("fixture.js").unwrap();
    let code = CString::new("function f(longName) { return longName + 1; } f(1);").unwrap();
    let min =
        response(unsafe { aphrody_oxc_minify_with(code.as_ptr(), js.as_ptr(), keep.as_ptr()) });
    assert_eq!(min["ok"], true);
    assert!(min["code"].as_str().unwrap().contains("longName"));

    let dup = CString::new("let a; let a;").unwrap();
    let checked = response(unsafe { aphrody_oxc_check(dup.as_ptr(), js.as_ptr()) });
    assert_eq!(checked["ok"], true);
    assert_eq!(checked["result"]["ok"], false);
    assert!(!checked["result"]["diagnostics"].as_array().unwrap().is_empty());

    let dir = std::env::temp_dir().join(format!("aphrody-oxc-resolve-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join("dep.ts"), "export {}").unwrap();
    let from = CString::new(dir.to_str().unwrap()).unwrap();
    let specifier = CString::new("./dep").unwrap();
    let exts = CString::new(r#"{"extensions":[".ts",".js"]}"#).unwrap();
    let resolved =
        response(unsafe { aphrody_oxc_resolve(from.as_ptr(), specifier.as_ptr(), exts.as_ptr()) });
    let missing = CString::new("./missing").unwrap();
    let failed =
        response(unsafe { aphrody_oxc_resolve(from.as_ptr(), missing.as_ptr(), exts.as_ptr()) });
    let _ = std::fs::remove_dir_all(&dir);
    assert_eq!(resolved["ok"], true, "{resolved}");
    assert!(resolved["path"].as_str().unwrap().ends_with("dep.ts"));
    assert_eq!(failed["kind"], "resolve");
}
