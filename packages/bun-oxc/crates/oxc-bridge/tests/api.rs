//! Safe Rust API.

use aphrody_oxc_bridge::{
    ErrorKind, Jsx, MinifyOptions, TransformOptions, analyze, check, isolated_declaration, minify,
    minify_with, parse, resolve, transform,
};

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

#[test]
fn transform_legacy_decorators_refresh_and_styled_components() {
    let src = "function d(t: any) {}\n@d export class A {}";
    let legacy =
        transform(src, "a.ts", &TransformOptions { decorators_legacy: true, ..Default::default() })
            .unwrap();
    assert!(!legacy.code.contains("@d"), "{}", legacy.code);
    let standard = transform(src, "a.ts", &TransformOptions::default()).unwrap();
    assert!(standard.code.contains("@d"), "{}", standard.code);

    let component = "export function App() { const [n] = useState(0); return <b>{n}</b>; }";
    let refresh = transform(
        component,
        "a.tsx",
        &TransformOptions { react_refresh: true, ..Default::default() },
    )
    .unwrap();
    assert!(refresh.code.contains("$RefreshReg$"), "{}", refresh.code);

    let styled = transform(
        "import styled from 'styled-components';\nexport const Box = styled.div`color: red;`;",
        "a.js",
        &TransformOptions { styled_components: true, ..Default::default() },
    )
    .unwrap();
    assert!(styled.code.contains("displayName"), "{}", styled.code);
}

#[test]
fn transform_options_from_json() {
    let options = TransformOptions::from_json(&serde_json::json!({
        "jsx": "classic",
        "decorators": "legacy",
        "reactRefresh": true,
        "helpersModule": "@oxc-project/runtime",
    }))
    .unwrap();
    assert_eq!(options.jsx, Jsx::Classic);
    assert!(options.decorators_legacy && options.react_refresh);
    assert_eq!(options.helpers_module.as_deref(), Some("@oxc-project/runtime"));
    let error =
        TransformOptions::from_json(&serde_json::json!({ "decorators": "2022" })).unwrap_err();
    assert_eq!(error.kind, ErrorKind::Input);
}

#[test]
fn isolated_declarations_emit_dts() {
    let out = isolated_declaration(
        "export function f(a: number): string { return String(a); }\n/** @internal */ export const x: number = 1;",
        "a.ts",
        true,
        true,
    )
    .unwrap();
    assert!(out.code.contains("export declare function f(a: number): string;"), "{}", out.code);
    assert!(!out.code.contains("x: number"), "{}", out.code);
    assert!(out.map.is_some());
    let error =
        isolated_declaration("export const f = (a) => a;", "a.ts", false, false).unwrap_err();
    assert_eq!(error.kind, ErrorKind::Transform);
}

#[test]
fn minify_with_switches_and_sourcemap() {
    let src = "function f(longName) { debugger; console.log(longName); } f(1);";
    let kept = minify_with(
        src,
        "a.js",
        &MinifyOptions { mangle: false, drop_debugger: false, ..Default::default() },
    )
    .unwrap();
    assert!(kept.code.contains("longName") && kept.code.contains("debugger"), "{}", kept.code);
    let dropped = minify_with(
        src,
        "a.js",
        &MinifyOptions { drop_console: true, sourcemap: true, ..Default::default() },
    )
    .unwrap();
    assert!(!dropped.code.contains("console.log"), "{}", dropped.code);
    assert!(dropped.map.is_some());
}

#[test]
fn check_reports_semantic_errors_as_data() {
    let clean = check("export const a = 1;", "a.ts").unwrap();
    assert_eq!(clean["ok"], true);
    assert_eq!(clean["diagnostics"], serde_json::json!([]));
    let dup = check("// \u{1F408}\nlet a; let a;", "a.js").unwrap();
    assert_eq!(dup["ok"], false);
    let first = &dup["diagnostics"][0];
    assert_eq!(first["severity"], "error");
    // UTF-16 offsets: the cat is two code units, so the second `a` starts at 17 and not at 19.
    assert!(first["labels"].as_array().unwrap().iter().any(|label| label["start"] == 17), "{dup}");
    assert_eq!(check("x", "a.css").unwrap_err().kind, ErrorKind::Input);
}

#[test]
fn resolve_with_extensions_alias_and_errors() {
    let dir =
        std::env::temp_dir().join(format!("aphrody-oxc-api-resolve-{}", std::process::id()));
    std::fs::create_dir_all(dir.join("src")).unwrap();
    std::fs::write(dir.join("src/util.ts"), "export {}").unwrap();
    let from = dir.to_str().unwrap();
    let options = serde_json::json!({
        "extensions": [".ts"],
        "alias": { "@": dir.join("src").to_str().unwrap() },
    });
    let direct = resolve(from, "./src/util", &options);
    let aliased = resolve(from, "@/util", &options);
    let missing = resolve(from, "./nope", &options);
    let invalid = resolve(from, "./src/util", &serde_json::json!({ "extensions": 1 }));
    let _ = std::fs::remove_dir_all(&dir);
    assert!(direct.unwrap()["path"].as_str().unwrap().ends_with("util.ts"));
    assert!(aliased.unwrap()["path"].as_str().unwrap().ends_with("util.ts"));
    assert_eq!(missing.unwrap_err().kind, ErrorKind::Resolve);
    assert_eq!(invalid.unwrap_err().kind, ErrorKind::Input);
}
