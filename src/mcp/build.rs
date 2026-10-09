// Build scripts run on the host before bun_* crates are compiled; std is the only option.
#![allow(
    clippy::disallowed_methods,
    clippy::disallowed_types,
    clippy::disallowed_macros
)]
//! Packs `docs/**/*.mdx` and the skills (`.claude/skills/**/*.md`, overridden per skill by the
//! agent plugin build in `packages/bun-agent-plugin/dist/claude/skills` when present) into two zstd archives in `OUT_DIR`,
//! embedded by `embedded.rs`. Layout before compression: `u32 count`, then per entry
//! `u32 path_len, path, u32 data_len, data` (little endian, `/`-separated relative paths, sorted).

use std::env;
use std::fs;
use std::path::{Path, PathBuf};

fn collect(root: &Path, dir: &Path, ext: &str, out: &mut Vec<(String, Vec<u8>)>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(kind) = entry.file_type() else {
            continue;
        };
        if kind.is_dir() {
            collect(root, &path, ext, out);
        } else if kind.is_file() && path.extension().is_some_and(|e| e == ext) {
            let rel = path
                .strip_prefix(root)
                .expect("entry under root")
                .components()
                .map(|c| c.as_os_str().to_string_lossy().into_owned())
                .collect::<Vec<_>>()
                .join("/");
            out.push((rel, fs::read(&path).expect("read embedded file")));
        }
    }
}

fn pack(name: &str, roots: &[PathBuf], ext: &str) {
    let mut files: Vec<(String, Vec<u8>)> = Vec::new();
    for root in roots {
        println!("cargo:rerun-if-changed={}", root.display());
        let mut found = Vec::new();
        collect(root, root, ext, &mut found);
        let top = |p: &str| p.split('/').next().unwrap_or(p).trim_end_matches(".md").to_owned();
        let replaced: std::collections::HashSet<String> = found.iter().map(|(p, _)| top(p)).collect();
        files.retain(|(p, _)| !replaced.contains(&top(p)));
        files.extend(found);
    }
    files.sort_by(|a, b| a.0.cmp(&b.0));
    let mut raw = Vec::new();
    raw.extend_from_slice(&u32::try_from(files.len()).unwrap().to_le_bytes());
    for (path, data) in &files {
        raw.extend_from_slice(&u32::try_from(path.len()).unwrap().to_le_bytes());
        raw.extend_from_slice(path.as_bytes());
        raw.extend_from_slice(&u32::try_from(data.len()).unwrap().to_le_bytes());
        raw.extend_from_slice(data);
    }
    let packed = zstd::bulk::compress(&raw, 19).expect("zstd compress");
    let out = PathBuf::from(env::var("OUT_DIR").unwrap()).join(name);
    fs::write(out, packed).expect("write archive");
}

fn main() {
    let manifest = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
    let repo = manifest.parent().and_then(Path::parent).expect("repo root");
    pack("docs.bin.zst", &[repo.join("docs")], "mdx");
    pack(
        "skills.bin.zst",
        &[
            repo.join(".claude").join("skills"),
            repo.join("packages/bun-agent-plugin/dist/claude/skills"),
        ],
        "md",
    );
}
