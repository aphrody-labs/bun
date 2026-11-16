//! `run` for a script in another language: the language comes from the file extension, else from the shebang line. Rust
//! single-file scripts go through `cargo -Zscript` (frontmatter manifest, per-script build cache of cargo itself).

use std::ffi::OsString;
use std::io::Read;
use std::path::Path;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Language {
    JavaScript,
    Shell,
    Bash,
    Rust,
}

/// The language of the script at `path`, `None` when neither the extension nor the shebang names one.
pub fn detect(path: &Path) -> Option<Language> {
    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        match ext {
            "js" | "mjs" | "cjs" | "jsx" | "ts" | "mts" | "cts" | "tsx" => return Some(Language::JavaScript),
            "rs" => return Some(Language::Rust),
            "bash" => return Some(Language::Bash),
            "sh" => return Some(Language::Shell),
            _ => {}
        }
    }
    let mut head = [0u8; 256];
    let n = std::fs::File::open(path).ok()?.read(&mut head).ok()?;
    from_shebang(&head[..n])
}

/// The language named by a `#!` line (`#!/bin/bash`, `#!/usr/bin/env -S cargo -Zscript`, `#!/usr/bin/env bun`).
pub fn from_shebang(head: &[u8]) -> Option<Language> {
    let rest = head.strip_prefix(b"#!")?;
    let line = std::str::from_utf8(&rest[..rest.iter().position(|&b| b == b'\n').unwrap_or(rest.len())]).ok()?;
    let words: Vec<&str> = line.split_whitespace().collect();
    let program = |w: &str| w.rsplit(['/', '\\']).next().unwrap_or(w).to_string();
    let first = program(words.first()?);
    let name = if first == "env" { words.iter().skip(1).find(|w| !w.starts_with('-') && !w.contains('=')).map(|w| program(w))? } else { first };
    match name.as_str() {
        "bash" => Some(Language::Bash),
        "sh" | "dash" | "ash" => Some(Language::Shell),
        "cargo" | "rust-script" => Some(Language::Rust),
        "bun" | "node" | "deno" | "ay" => Some(Language::JavaScript),
        _ => None,
    }
}

/// Runs a Rust script and returns its exit status. cargo compiles it once per content in its script target directory.
pub fn run_rust(path: &Path, args: &[OsString]) -> i32 {
    let mut cmd = std::process::Command::new("cargo");
    cmd.arg("-Zscript").arg("--quiet").arg(path).args(args);
    if std::env::var_os("RUSTC_BOOTSTRAP").is_none() {
        cmd.env("RUSTC_BOOTSTRAP", "1");
    }
    match cmd.status() {
        Ok(status) => status.code().unwrap_or(1),
        Err(e) => {
            eprintln!("cargo: {e} (a Rust script needs cargo on PATH)");
            127
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shebangs() {
        assert_eq!(from_shebang(b"#!/bin/bash\necho"), Some(Language::Bash));
        assert_eq!(from_shebang(b"#!/usr/bin/env -S cargo -Zscript\n"), Some(Language::Rust));
        assert_eq!(from_shebang(b"#!/usr/bin/env bun\n"), Some(Language::JavaScript));
        assert_eq!(from_shebang(b"#!/bin/sh"), Some(Language::Shell));
        assert_eq!(from_shebang(b"echo"), None);
    }
}
