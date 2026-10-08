//! Safe Rust API.

use aphrody_oxc_bridge::{ErrorKind, Jsx, TransformOptions, analyze, minify, parse, transform};

#[test]
fn transform_strips_typescript() {
    let out = transform(
        "interface A { x: number }\nenum E { A = 1 }\nexport const f = (a: number): number => a + E.A;",
        "a.ts",
        &TransformOptions::default(),
    )
    .unwrap();
    assert!(!out.code.contains("interface"));
    assert!(!out.code.contains(": number"));
    assert!(out.code.contains("export const f"));
    assert!(out.map.is_none());
}

#[test]
fn transform_jsx_automatic_and_classic() {
    let src = "export const a = <div id=\"x\">hi</div>;";
    let auto = transform(src, "a.tsx", &TransformOptions::default()).unwrap();
    assert!(auto.code.contains("react/jsx-runtime"), "{}", auto.code);
    let custom = transform(
        src,
        "a.jsx",
        &TransformOptions { jsx_import_source: Some("preact".into()), ..Default::default() },
    )
    .unwrap();
    assert!(custom.code.contains("preact/jsx-runtime"), "{}", custom.code);
    let classic = transform(
        src,
        "a.jsx",
        &TransformOptions { jsx: Jsx::Classic, jsx_pragma: Some("h".into()), ..Default::default() },
    )
    .unwrap();
    assert!(classic.code.contains("h(\"div\""), "{}", classic.code);
    assert!(!classic.code.contains("jsx-runtime"));
}

#[test]
fn transform_target_lowers_syntax() {
    let src = "export const x = a?.b ?? c;";
    let kept = transform(src, "a.js", &TransformOptions::default()).unwrap();
    assert!(kept.code.contains("?."));
    let lowered = transform(
        src,
        "a.js",
        &TransformOptions { target: Some("es2019".into()), ..Default::default() },
    )
    .unwrap();
    assert!(!lowered.code.contains("?."), "{}", lowered.code);
    assert!(!lowered.code.contains("??"), "{}", lowered.code);
}

#[test]
fn transform_sourcemap_is_json() {
    let out = transform(
        "export const x: number = 1;",
        "a.ts",
        &TransformOptions { sourcemap: true, ..Default::default() },
    )
    .unwrap();
    let map: serde_json::Value = serde_json::from_str(&out.map.unwrap()).unwrap();
    assert_eq!(map["version"], 3);
    assert!(map["mappings"].as_str().is_some_and(|m| !m.is_empty()));
}

#[test]
fn transform_errors_carry_kinds() {
    let syntax = transform("const = ;", "a.ts", &TransformOptions::default()).unwrap_err();
    assert_eq!(syntax.kind, ErrorKind::Syntax);
    let input = transform("x", "a.css", &TransformOptions::default()).unwrap_err();
    assert_eq!(input.kind, ErrorKind::Input);
    let target = transform(
        "x",
        "a.js",
        &TransformOptions { target: Some("nope".into()), ..Default::default() },
    )
    .unwrap_err();
    assert_eq!(target.kind, ErrorKind::Input);
}

#[test]
fn minify_shrinks_and_rejects_bad_syntax() {
    let out = minify("const greeting = 'hello'; console.log(greeting);", "a.js").unwrap();
    assert!(out.len() < 48 && out.contains("console.log"), "{out}");
    assert_eq!(minify("const = ;", "a.js").unwrap_err().kind, ErrorKind::Syntax);
}

#[test]
fn analyze_and_parse() {
    let a = analyze("import './d'; export const v = 1;", "a.ts").unwrap();
    assert_eq!(a["imports"], serde_json::json!(["./d"]));
    assert_eq!(a["exports"], serde_json::json!(["v"]));
    let p = parse("export interface S {}", "a.ts").unwrap();
    assert_eq!(p["type"], "Program");
    assert_eq!(analyze("let a; let a;", "a.ts").unwrap_err().kind, ErrorKind::Syntax);
}
