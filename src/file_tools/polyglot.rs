// SPDX-License-Identifier: Apache-2.0
//! File classification and structural extraction.
// Absorbed from packages/bun-runtime-sdk/crates/yolo-core/src/polyglot.rs; unbounded filesystem entrypoints are replaced by Sandbox.

use crate::{Result, WorkspaceError, check_cancel};
use std::{collections::BTreeSet, path::Path, sync::atomic::AtomicBool};

use regex::Regex;
use serde::Serialize;

#[derive(Clone, Debug, Serialize)]
pub(super) struct LanguageDefinition {
    id: &'static str,
    name: &'static str,
    category: &'static str,
    extensions: &'static [&'static str],
    filenames: &'static [&'static str],
    shebangs: &'static [&'static str],
    test_runner: Option<&'static str>,
    build_gate: Option<&'static str>,
    mime_type: &'static str,
}

macro_rules! language {
    ($id:literal, $name:literal, $category:literal, [$($extension:literal),*], [$($filename:literal),*], [$($shebang:literal),*], $test:expr, $build:expr, $mime:literal) => {
        LanguageDefinition { id: $id, name: $name, category: $category, extensions: &[$($extension),*], filenames: &[$($filename),*], shebangs: &[$($shebang),*], test_runner: $test, build_gate: $build, mime_type: $mime }
    };
}

static LANGUAGE_REGISTRY: &[LanguageDefinition] = &[
    language!(
        "rust",
        "Rust",
        "programming",
        [".rs"],
        ["Cargo.toml"],
        [],
        Some("cargo test"),
        Some("cargo check --workspace --all-targets"),
        "text/x-rust"
    ),
    language!(
        "typescript",
        "TypeScript",
        "programming",
        [".ts", ".tsx", ".mts", ".cts"],
        ["tsconfig.json"],
        ["bun", "deno", "ts-node"],
        Some("bun test"),
        Some("tsc --noEmit"),
        "application/typescript"
    ),
    language!(
        "javascript",
        "JavaScript",
        "programming",
        [".js", ".jsx", ".mjs", ".cjs"],
        ["package.json"],
        ["node", "bun"],
        Some("bun test"),
        None,
        "application/javascript"
    ),
    language!(
        "python",
        "Python",
        "programming",
        [".py", ".pyw", ".pyi"],
        ["pyproject.toml", "requirements.txt", "Pipfile"],
        ["python", "python3", "uv run"],
        Some("pytest || python -m unittest"),
        Some("python -m py_compile"),
        "text/x-python"
    ),
    language!(
        "csharp",
        "C#",
        "programming",
        [".cs", ".csx"],
        [],
        [],
        Some("dotnet test"),
        Some("dotnet build"),
        "text/x-csharp"
    ),
    language!(
        "cpp",
        "C++",
        "programming",
        [".cpp", ".cxx", ".cc", ".hpp", ".hxx", ".hh"],
        ["CMakeLists.txt"],
        [],
        Some("ctest || make test"),
        Some("cmake --build . || make"),
        "text/x-c++src"
    ),
    language!(
        "c",
        "C",
        "programming",
        [".c", ".h"],
        ["Makefile"],
        [],
        Some("make test"),
        Some("make"),
        "text/x-csrc"
    ),
    language!(
        "assembly",
        "Assembly",
        "programming",
        [".asm", ".s", ".nasm"],
        [],
        [],
        None,
        Some("nasm -f elf64 || as"),
        "text/x-asm"
    ),
    language!(
        "go",
        "Go",
        "programming",
        [".go"],
        ["go.mod"],
        [],
        Some("go test ..."),
        Some("go build ..."),
        "text/x-go"
    ),
    language!(
        "java",
        "Java",
        "programming",
        [".java"],
        ["pom.xml", "build.gradle"],
        [],
        Some("mvn test || ./gradlew test"),
        Some("javac"),
        "text/x-java"
    ),
    language!(
        "kotlin",
        "Kotlin",
        "programming",
        [".kt", ".kts"],
        [],
        [],
        Some("./gradlew test"),
        Some("kotlinc"),
        "text/x-kotlin"
    ),
    language!(
        "swift",
        "Swift",
        "programming",
        [".swift"],
        ["Package.swift"],
        [],
        Some("swift test"),
        Some("swift build"),
        "text/x-swift"
    ),
    language!(
        "ruby",
        "Ruby",
        "programming",
        [".rb", ".rake"],
        ["Gemfile", "Rakefile"],
        ["ruby"],
        Some("bundle exec rspec"),
        None,
        "text/x-ruby"
    ),
    language!(
        "php",
        "PHP",
        "programming",
        [".php", ".phtml"],
        ["composer.json"],
        ["php"],
        Some("./vendor/bin/phpunit"),
        None,
        "application/x-httpd-php"
    ),
    language!(
        "shell",
        "Shell",
        "programming",
        [".sh", ".bash", ".zsh"],
        [],
        ["bash", "sh", "zsh"],
        Some("bats test"),
        Some("bash -n"),
        "application/x-sh"
    ),
    language!(
        "powershell",
        "PowerShell",
        "programming",
        [".ps1", ".psm1", ".psd1"],
        [],
        ["pwsh", "powershell"],
        Some("Invoke-Pester"),
        None,
        "application/x-powershell"
    ),
    language!(
        "html",
        "HTML",
        "markup",
        [".html", ".htm"],
        [],
        [],
        None,
        None,
        "text/html"
    ),
    language!(
        "css",
        "CSS",
        "markup",
        [".css", ".scss", ".sass", ".less"],
        [],
        [],
        None,
        None,
        "text/css"
    ),
    language!(
        "json",
        "JSON",
        "data",
        [".json", ".jsonc", ".jsonl"],
        [],
        [],
        None,
        None,
        "application/json"
    ),
    language!(
        "yaml",
        "YAML",
        "data",
        [".yaml", ".yml"],
        [],
        [],
        None,
        None,
        "text/yaml"
    ),
    language!(
        "toml",
        "TOML",
        "data",
        [".toml"],
        [],
        [],
        None,
        None,
        "application/toml"
    ),
    language!(
        "markdown",
        "Markdown",
        "prose",
        [".md", ".markdown", ".mdown"],
        [],
        [],
        None,
        None,
        "text/markdown"
    ),
    language!(
        "sql",
        "SQL",
        "data",
        [".sql"],
        [],
        [],
        None,
        None,
        "application/sql"
    ),
    language!(
        "dockerfile",
        "Dockerfile",
        "config",
        [".dockerfile"],
        ["Dockerfile", "Containerfile"],
        [],
        None,
        None,
        "text/x-dockerfile"
    ),
    language!(
        "pseudocode",
        "Pseudocode",
        "prose",
        [".pseudo", ".algo"],
        [],
        [],
        None,
        None,
        "text/x-pseudocode"
    ),
];

fn unknown() -> LanguageDefinition {
    LanguageDefinition {
        id: "unknown",
        name: "Plain Text",
        category: "prose",
        extensions: &[],
        filenames: &[],
        shebangs: &[],
        test_runner: None,
        build_gate: None,
        mime_type: "text/plain",
    }
}

fn by_id(id: &str) -> LanguageDefinition {
    LANGUAGE_REGISTRY
        .iter()
        .find(|language| language.id == id)
        .cloned()
        .expect("registry id")
}

pub(super) fn detect(path: &Path, content: Option<&str>) -> LanguageDefinition {
    let filename = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default();
    let lowercase = filename.to_ascii_lowercase();
    if let Some(language) = LANGUAGE_REGISTRY.iter().find(|language| {
        language
            .filenames
            .iter()
            .any(|name| name.eq_ignore_ascii_case(filename))
    }) {
        return language.clone();
    }
    if let Some(first_line) = content
        .filter(|text| text.starts_with("#!"))
        .and_then(|text| text.lines().next())
        .map(str::to_ascii_lowercase)
        && let Some(language) = LANGUAGE_REGISTRY.iter().find(|language| {
            language
                .shebangs
                .iter()
                .any(|needle| first_line.contains(needle))
        })
    {
        return language.clone();
    }
    let extension = lowercase
        .rsplit_once('.')
        .map(|(_, extension)| format!(".{extension}"))
        .unwrap_or_default();
    if let Some(language) = LANGUAGE_REGISTRY
        .iter()
        .find(|language| language.extensions.contains(&extension.as_str()))
    {
        return language.clone();
    }
    if let Some(text) = content {
        let trimmed = text.trim();
        if matches!(trimmed.to_ascii_lowercase().as_str(), value if value.starts_with("<!doctype html") || value.starts_with("<html"))
        {
            return by_id("html");
        }
        if serde_json::from_str::<serde_json::Value>(trimmed).is_ok() {
            return by_id("json");
        }
    }
    unknown()
}

#[derive(Debug, Serialize)]
struct Declarations {
    classes: Vec<String>,
    functions: Vec<String>,
    interfaces: Vec<String>,
    /// Module-level constants; constants local to a function or block are not listed.
    constants: Vec<String>,
    /// Enum names.
    enums: Vec<String>,
    /// Enum variants as `Enum.Variant`.
    enum_variants: Vec<String>,
}

#[derive(Debug, Serialize)]
pub(super) struct ParseResult {
    language: String,
    category: String,
    mime_type: String,
    is_binary: bool,
    total_lines: usize,
    code_lines: usize,
    comment_lines: usize,
    blank_lines: usize,
    imports: Vec<String>,
    declarations: Declarations,
    validation_gate: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    diagnostics: Vec<String>,
}

macro_rules! captures {
    ($pattern:literal, $text:expr) => {{
        static REGEX: std::sync::LazyLock<Regex> =
            std::sync::LazyLock::new(|| Regex::new($pattern).expect("static extraction regex"));
        REGEX
            .captures($text)
            .and_then(|captures| captures.get(1))
            .map(|capture| capture.as_str().to_owned())
    }};
}
#[derive(Default)]
struct Symbols {
    items: Vec<String>,
    seen: BTreeSet<String>,
}

fn push_unique(values: &mut Symbols, value: Option<String>) {
    if let Some(value) = value {
        if values.seen.insert(value.clone()) {
            values.items.push(value);
        }
    }
}
pub(super) fn parse(
    path: &Path,
    content: &str,
    max_records: usize,
    cancel: &AtomicBool,
) -> Result<ParseResult> {
    let definition = detect(path, Some(content));
    let mut imports = Symbols::default();
    let mut classes = Symbols::default();
    let mut functions = Symbols::default();
    let mut interfaces = Symbols::default();
    let mut constants = Symbols::default();
    let mut enums = Symbols::default();
    let enum_variants = Vec::new();
    let mut blank_lines = 0;
    let mut comment_lines = 0;
    let mut code_lines = 0;
    let mut in_block_comment = false;

    for raw in content.lines() {
        check_cancel(cancel)?;
        if imports.items.len()
            + classes.items.len()
            + functions.items.len()
            + interfaces.items.len()
            + constants.items.len()
            + enums.items.len()
            > max_records
        {
            return Err(WorkspaceError::Limit("extracted records"));
        }
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            blank_lines += 1;
            continue;
        }
        let mut line = trimmed;
        if in_block_comment {
            comment_lines += 1;
            if let Some((_, rest)) = line.split_once("*/") {
                in_block_comment = false;
                line = rest.trim();
            } else {
                continue;
            }
        }
        if line.starts_with("/*") {
            comment_lines += 1;
            if !line.contains("*/") {
                in_block_comment = true;
            }
            continue;
        }
        if line.starts_with("//")
            || line.starts_with('#')
            || line.starts_with(';')
            || line.starts_with("--")
        {
            comment_lines += 1;
            continue;
        }
        code_lines += 1;
        match definition.id {
            "rust" => {
                push_unique(&mut imports, captures!(r"^(?:pub\s+)?use\s+([\w:]+)", line));
                push_unique(
                    &mut functions,
                    captures!(r"^(?:pub(?:\([^)]+\))?\s+)?(?:async\s+)?fn\s+(\w+)", line),
                );
                push_unique(
                    &mut classes,
                    captures!(r"^(?:pub(?:\([^)]+\))?\s+)?struct\s+(\w+)", line),
                );
                push_unique(
                    &mut enums,
                    captures!(r"^(?:pub(?:\([^)]+\))?\s+)?enum\s+(\w+)", line),
                );
                push_unique(
                    &mut interfaces,
                    captures!(r"^(?:pub\s+)?trait\s+(\w+)", line),
                );
                push_unique(
                    &mut constants,
                    captures!(r"^(?:pub\s+)?const\s+(\w+)", line),
                );
            }
            "python" => {
                push_unique(
                    &mut imports,
                    captures!(r"^from\s+([\w.]+)\s+import", line)
                        .or_else(|| captures!(r"^import\s+([\w.]+)", line)),
                );
                push_unique(
                    &mut functions,
                    captures!(r"^(?:async\s+)?def\s+(\w+)", line),
                );
                push_unique(&mut classes, captures!(r"^class\s+(\w+)", line));
            }
            "csharp" => {
                push_unique(&mut imports, captures!(r"^using\s+([\w.]+);", line));
                push_unique(&mut classes, captures!(r"\bclass\s+(\w+)", line));
                push_unique(&mut interfaces, captures!(r"\binterface\s+(\w+)", line));
            }
            "c" | "cpp" => {
                push_unique(
                    &mut imports,
                    captures!(r#"^#include\s*[<\"]([^>\"]+)[>\"]"#, line),
                );
                push_unique(&mut classes, captures!(r"^class\s+(\w+)", line));
                push_unique(
                    &mut functions,
                    captures!(r"^[\w*&]+\s+(\w+)\s*\([^)]*\)\s*\{", line),
                );
            }
            "go" => {
                push_unique(
                    &mut imports,
                    captures!(r#"^import\s+[\"'](.*?)[\"']"#, line),
                );
                push_unique(
                    &mut functions,
                    captures!(r"^func\s+(?:\([^)]+\)\s+)?(\w+)", line),
                );
                push_unique(&mut classes, captures!(r"^type\s+(\w+)\s+struct", line));
                push_unique(
                    &mut interfaces,
                    captures!(r"^type\s+(\w+)\s+interface", line),
                );
            }
            "assembly" => push_unique(&mut functions, captures!(r"^(\w+):", line)),
            _ => {}
        }
    }
    if imports.items.len()
        + classes.items.len()
        + functions.items.len()
        + interfaces.items.len()
        + constants.items.len()
        + enums.items.len()
        > max_records
    {
        return Err(WorkspaceError::Limit("extracted records"));
    }
    let diagnostics = Vec::new();
    let validation_gate = match (definition.build_gate, definition.test_runner) {
        (Some(build), Some(test)) => Some(format!("{build} && {test}")),
        (Some(build), None) => Some(build.to_owned()),
        (None, Some(test)) => Some(test.to_owned()),
        (None, None) => None,
    };
    Ok(ParseResult {
        language: definition.name.to_owned(),
        category: definition.category.to_owned(),
        mime_type: definition.mime_type.to_owned(),
        is_binary: false,
        total_lines: content.lines().count(),
        code_lines,
        comment_lines,
        blank_lines,
        imports: imports.items,
        declarations: Declarations {
            classes: classes.items,
            functions: functions.items,
            interfaces: interfaces.items,
            constants: constants.items,
            enums: enums.items,
            enum_variants,
        },
        validation_gate,
        diagnostics,
    })
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::*;
    #[test]
    fn detects_exact_filename() {
        assert_eq!(detect(Path::new("Cargo.toml"), None).id, "rust");
    }
    #[test]
    fn detects_shebang() {
        assert_eq!(
            detect(Path::new("tool"), Some("#!/usr/bin/env python3\n")).id,
            "python"
        );
    }
    #[test]
    fn detects_polyglot_extensions_and_build_files() {
        assert_eq!(detect(Path::new("engine.cs"), None).id, "csharp");
        assert_eq!(detect(Path::new("CMakeLists.txt"), None).id, "cpp");
        assert_eq!(detect(Path::new("kernel.nasm"), None).id, "assembly");
        assert_eq!(detect(Path::new("service.go"), None).id, "go");
    }
    #[test]
    fn parses_rust_symbols() {
        let result = parse(
      Path::new("lib.rs"),
      "use std::fs;\npub struct Engine;\npub(crate) enum Kind { A }\npub trait Run {}\npub fn execute() {}\n",
      64, &AtomicBool::new(false),
    ).expect("bounded Rust fixture");
        assert_eq!(result.imports, ["std::fs"]);
        assert_eq!(result.declarations.classes, ["Engine"]);
        assert_eq!(result.declarations.enums, ["Kind"]);
        assert_eq!(result.declarations.functions, ["execute"]);
    }
}
