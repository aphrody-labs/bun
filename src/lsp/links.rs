//! Links between languages that no single language server sees, read from source text: the C ABI
//! symbols that Rust, C/C++ and Zig share by name, the `$newRustFunction`/`$newCppFunction`/
//! `$newZigFunction`/`$rust`/`$cpp`/`$zig` calls of Bun's builtin modules, and the members of
//! `.classes.ts` definitions. [`crate::graph`] resolves them against the code graph.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use crate::protocol::path_key;

pub const NATIVE_CALLS: [(&str, Family); 6] = [
    ("$newRustFunction(", Family::Rust),
    ("$newCppFunction(", Family::C),
    ("$newZigFunction(", Family::Zig),
    ("$rust(", Family::Rust),
    ("$cpp(", Family::C),
    ("$zig(", Family::Zig),
];

/// A range on one line. Lines are 0-based, columns count UTF-16 code units.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct Site {
    pub path: PathBuf,
    pub line: u32,
    pub start: u32,
    pub end: u32,
}

impl Site {
    pub fn contains(&self, path: &str, line: u32, character: u32) -> bool {
        self.line == line && self.start <= character && character <= self.end && path_key(&self.path) == path
    }
}

/// The other end of a link between languages.
#[derive(Clone, Debug)]
pub struct Link {
    pub to: Site,
    /// `c-abi`, `js2native` or `classes.ts`.
    pub why: &'static str,
    /// `to` defines the symbol.
    pub definition: bool,
}

/// A node of the graph.
#[derive(Clone, Debug)]
pub struct Symbol {
    pub name: String,
    /// `function`, `method`, `type`, `section` or `file`.
    pub kind: &'static str,
    pub site: Site,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Family {
    Rust,
    C,
    Zig,
    Script,
}

impl Family {
    pub fn of(path: &str) -> Option<Family> {
        Some(match path.rsplit_once('.')?.1 {
            "rs" => Family::Rust,
            "c" | "cc" | "cpp" | "cxx" | "h" | "hh" | "hpp" | "hxx" | "m" | "mm" => Family::C,
            "zig" => Family::Zig,
            "ts" | "tsx" | "mts" | "cts" | "js" | "jsx" | "mjs" | "cjs" => Family::Script,
            _ => return None,
        })
    }
}

/// A use of a C ABI symbol.
#[derive(Clone, Debug)]
pub struct AbiSite {
    pub site: Site,
    pub family: Family,
    pub definition: bool,
}

/// `$newRustFunction("file.rs", "Type.name", n)` and its kin.
#[derive(Clone, Debug)]
pub struct NativeCall {
    pub site: Site,
    pub family: Family,
    pub file: String,
    pub name: String,
}

/// `fn: "name"` (or `getter`, `setter`) of a `define({ name: "Class" })`, or the class name itself.
#[derive(Clone, Debug)]
pub struct ClassMember {
    pub site: Site,
    pub class: String,
    pub member: Option<String>,
}

#[derive(Clone, Debug, Default)]
pub struct Scan {
    pub abi: Vec<(String, AbiSite)>,
    pub natives: Vec<NativeCall>,
    pub classes: Vec<ClassMember>,
    /// Graph labels by line: the columns of the name.
    pub columns: HashMap<(String, u32), (u32, u32)>,
}

fn is_word(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_' || c == '$'
}

/// The words of `line` with their character columns.
fn words(line: &str) -> Vec<(usize, &str)> {
    let mut out = Vec::new();
    let mut start = None;
    for (at, c) in line.char_indices() {
        match (is_word(c), start) {
            (true, None) => start = Some(at),
            (false, Some(from)) => {
                out.push((from, &line[from..at]));
                start = None;
            }
            _ => {}
        }
    }
    if let Some(from) = start {
        out.push((from, &line[from..]));
    }
    out
}

pub fn utf16_len(text: &str) -> u32 {
    text.chars().map(|c| c.len_utf16() as u32).sum()
}

/// UTF-16 range of the byte range `at..at + len` of `line`.
pub fn range16(line: &str, at: usize, len: usize) -> (u32, u32) {
    let start = utf16_len(&line[..at]);
    (start, start + utf16_len(&line[at..at + len]))
}

/// The word under the UTF-16 column `character` of `line`, with its UTF-16 range.
pub fn word_at(line: &str, character: u32) -> Option<(String, u32, u32)> {
    words(line).into_iter().find_map(|(at, word)| {
        let (start, end) = range16(line, at, word.len());
        (start <= character && character <= end).then(|| (word.to_owned(), start, end))
    })
}

/// Columns of the first whole-word `name` in `line`.
pub fn find_word(line: &str, name: &str) -> Option<(u32, u32)> {
    words(line).into_iter().find(|(_, word)| *word == name).map(|(at, word)| range16(line, at, word.len()))
}

/// Whether `line` holds the whole word `name`.
pub fn word_at_any(line: &str, name: &str) -> bool {
    line.contains(name) && find_word(line, name).is_some()
}

/// `fromVLQ` → `from_vlq`, `doRef` → `do_ref`.
pub fn snake_case(name: &str) -> String {
    let chars: Vec<char> = name.chars().collect();
    let mut out = String::with_capacity(name.len() + 4);
    for (i, &c) in chars.iter().enumerate() {
        if c.is_ascii_uppercase() && i > 0 {
            let previous = chars[i - 1];
            let next_lower = chars.get(i + 1).is_some_and(char::is_ascii_lowercase);
            if previous.is_ascii_lowercase() || previous.is_ascii_digit() || (previous.is_ascii_uppercase() && next_lower) {
                out.push('_');
            }
        }
        out.push(c.to_ascii_lowercase());
    }
    out
}

/// `Bun__canonicalizeIP`, `GlobPrototype__match`: Bun's names for symbols that cross languages.
pub fn is_abi_name(word: &str) -> bool {
    let Some((head, tail)) = word.split_once("__") else { return false };
    word.len() >= 5
        && head.chars().next().is_some_and(|c| c.is_ascii_alphabetic())
        && !tail.is_empty()
        && !tail.starts_with('_')
        && !word.ends_with('_')
        && !word.chars().all(|c| c.is_ascii_uppercase() || c == '_' || c.is_ascii_digit())
}

pub fn is_comment(trimmed: &str) -> bool {
    trimmed.starts_with("//") || trimmed.starts_with("/*") || trimmed.starts_with('*')
}

/// Whether `line` defines `name` in a language of `family`.
pub fn defines(family: Family, line: &str, name: &str) -> bool {
    let after = |prefix: &str| {
        line.match_indices(prefix).any(|(at, _)| {
            let rest = &line[at + prefix.len()..];
            rest.starts_with(name) && !rest[name.len()..].starts_with(is_word)
        })
    };
    match family {
        Family::Rust | Family::Zig => after("fn "),
        Family::Script => after("function ") || after("const ") || after("let "),
        Family::C => {
            let trimmed = line.trim_end();
            let call = line.match_indices(name).any(|(at, _)| line[at + name.len()..].trim_start().starts_with('('));
            (after("DEFINE_HOST_FUNCTION(") || after("define ") || after("DEFINE_HOST_FUNCTION_TYPE("))
                || (call
                    && !line.starts_with([' ', '\t'])
                    && !trimmed.ends_with(';')
                    && !trimmed.starts_with("return")
                    && !trimmed.starts_with('#'))
        }
    }
}

/// The next string literal of `text` from byte `from`: its contents and byte offset.
pub fn next_string(text: &str, from: usize) -> Option<(usize, &str)> {
    let rest = &text[from..];
    let open = rest.find(['"', '\''])?;
    if rest[..open].contains([')', ';']) {
        return None;
    }
    let quote = rest.as_bytes()[open] as char;
    let body = &rest[open + 1..];
    let close = body.find(quote)?;
    Some((from + open + 1, &body[..close]))
}

/// What `text` holds: C ABI symbols, native calls, class members, and the columns of the graph
/// nodes `labels` (label and `Lnn` location).
pub fn scan_file(path: &Path, rel: &str, text: &str, labels: &[(String, String)]) -> Scan {
    let mut scan = Scan::default();
    let family = Family::of(rel);
    let lines: Vec<&str> = text.split('\n').map(|line| line.strip_suffix('\r').unwrap_or(line)).collect();
    let site = |line: usize, start: u32, end: u32| Site { path: path.to_path_buf(), line: line as u32, start, end };
    for (label, loc) in labels {
        let Some(line) = loc.strip_prefix('L').and_then(|it| it.parse::<usize>().ok()) else { continue };
        if let Some(columns) = lines.get(line.wrapping_sub(1)).and_then(|text| find_word(text, bare_name(label))) {
            scan.columns.insert((label.clone(), line as u32), columns);
        }
    }
    match family {
        Some(family @ (Family::Rust | Family::C | Family::Zig)) => {
            for (number, line) in lines.iter().enumerate() {
                let trimmed = line.trim_start();
                if is_comment(trimmed) {
                    continue;
                }
                let exported = match family {
                    Family::Rust => {
                        line.contains("extern \"C\" fn")
                            || (line.contains("fn ") && lines[number.saturating_sub(3)..number].iter().any(|it| it.contains("no_mangle")))
                    }
                    Family::Zig => line.contains("export fn "),
                    _ => line.contains("extern \"C\"") && line.contains('('),
                };
                for (at, word) in words(line) {
                    let abi = is_abi_name(word) || (exported && defines(family, line, word));
                    if !abi {
                        continue;
                    }
                    let (start, end) = range16(line, at, word.len());
                    let definition = defines(family, line, word);
                    scan.abi.push((word.to_owned(), AbiSite { site: site(number, start, end), family, definition }));
                }
            }
        }
        Some(Family::Script) => {
            for (marker, target) in NATIVE_CALLS {
                for (at, _) in text.match_indices(marker) {
                    let Some((file_at, file)) = next_string(text, at + marker.len()) else { continue };
                    let Some((name_at, name)) = next_string(text, file_at + file.len() + 1) else { continue };
                    let line = text[..name_at].matches('\n').count();
                    let line_start = text[..name_at].rfind('\n').map_or(0, |it| it + 1);
                    let (start, end) = range16(lines[line], name_at - line_start, name.len());
                    scan.natives.push(NativeCall { site: site(line, start, end), family: target, file: file.to_owned(), name: name.to_owned() });
                }
            }
            if rel.ends_with(".classes.ts") {
                let mut class: Option<String> = None;
                for (number, line) in lines.iter().enumerate() {
                    if line.contains("define(") {
                        class = None;
                    }
                    for key in ["name:", "fn:", "getter:", "setter:"] {
                        let Some(at) = line.find(key) else { continue };
                        if at > 0 && line[..at].ends_with(is_word) {
                            continue;
                        }
                        let Some((value_at, value)) = next_string(line, at + key.len()) else { continue };
                        if value.is_empty() || !value.chars().all(is_word) {
                            continue;
                        }
                        let (start, end) = range16(line, value_at, value.len());
                        if key == "name:" {
                            if class.is_none() {
                                class = Some(value.to_owned());
                                scan.classes.push(ClassMember { site: site(number, start, end), class: value.to_owned(), member: None });
                            }
                        } else if let Some(class) = &class {
                            scan.classes.push(ClassMember {
                                site: site(number, start, end),
                                class: class.clone(),
                                member: Some(value.to_owned()),
                            });
                        }
                    }
                }
            }
        }
        _ => {}
    }
    scan
}

/// `name` of the labels `name()`, `.name()` and `name`.
pub fn bare_name(label: &str) -> &str {
    let label = label.strip_prefix('.').unwrap_or(label);
    label.strip_suffix("()").unwrap_or(label)
}

#[cfg(test)]
mod tests {
    use super::*;


    #[test]
    fn names() {
        assert_eq!(snake_case("fromVLQ"), "from_vlq");
        assert_eq!(snake_case("doRef"), "do_ref");
        assert_eq!(snake_case("parse"), "parse");
        assert!(is_abi_name("Bun__canonicalizeIP"));
        assert!(is_abi_name("GlobPrototype__match"));
        assert!(!is_abi_name("__cplusplus"));
        assert!(!is_abi_name("FOO__BAR"));
        assert_eq!(word_at("let x = foo_bar(1);", 10), Some(("foo_bar".to_owned(), 8, 15)));
        assert!(defines(Family::C, "extern \"C\" JSC::EncodedJSValue Bun__x(int a) {", "Bun__x"));
        assert!(!defines(Family::C, "extern \"C\" void Bun__x(int a);", "Bun__x"));
        assert!(defines(Family::Rust, "pub extern \"C\" fn Bun__x() {}", "Bun__x"));
    }

    #[test]
    fn scans_links() {
        let path = Path::new("/r/a.ts");
        let text = "export const diff = $newRustFunction(\"patch.rs\", \"TestingAPIs.makeDiff\", 0);
";
        let scan = scan_file(path, "a.ts", text, &[]);
        assert_eq!(scan.natives.len(), 1);
        let call = &scan.natives[0];
        assert_eq!((call.file.as_str(), call.name.as_str(), call.family), ("patch.rs", "TestingAPIs.makeDiff", Family::Rust));
        assert_eq!((call.site.line, call.site.start, call.site.end), (0, 50, 70));

        let text = "export default [
  define({
    name: \"Glob\",
    proto: {
      match: { fn: \"match\", length: 1 },
    },
  }),
];
";
        let scan = scan_file(Path::new("/r/glob.classes.ts"), "glob.classes.ts", text, &[]);
        let members: Vec<(&str, Option<&str>, u32)> = scan.classes.iter().map(|it| (it.class.as_str(), it.member.as_deref(), it.site.line)).collect();
        assert_eq!(members, [("Glob", None, 2), ("Glob", Some("match"), 4)]);

        let text = "extern \"C\" unsigned Bun__answer();
unsigned twice() {
    return Bun__answer() * 2;
}
";
        let scan = scan_file(Path::new("/r/a.cpp"), "a.cpp", text, &[("twice()".to_owned(), "L2".to_owned())]);
        let abi: Vec<(&str, u32, bool)> = scan.abi.iter().map(|(name, it)| (name.as_str(), it.site.line, it.definition)).collect();
        assert_eq!(abi, [("Bun__answer", 0, false), ("Bun__answer", 2, false)]);
        assert_eq!(scan.columns.get(&("twice()".to_owned(), 2)), Some(&(9, 14)));
    }
}
