//! Small helpers shared by the server, the tools and `bun mcp install`.

use std::path::{Path, PathBuf};

/// A non-empty environment variable.
pub(crate) fn env(name: &str) -> Option<String> {
    std::env::var(name).ok().filter(|v| !v.is_empty())
}

pub(crate) fn home_dir() -> PathBuf {
    let var = if cfg!(windows) { "USERPROFILE" } else { "HOME" };
    env(var)
        .or_else(|| env("HOME"))
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."))
}

/// `$BUN_INSTALL/agent` or `~/.bun/agent`: the memory database, cache and install manifest.
pub(crate) fn agent_dir() -> PathBuf {
    env("BUN_INSTALL")
        .map(PathBuf::from)
        .unwrap_or_else(|| home_dir().join(".bun"))
        .join("agent")
}

/// Writes through a sibling temporary file and a rename, creating parent directories.
pub(crate) fn write_atomic(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let mut tmp = path.as_os_str().to_owned();
    tmp.push(format!(".{}.tmp", std::process::id()));
    std::fs::write(&tmp, bytes)?;
    std::fs::rename(&tmp, path).inspect_err(|_| {
        let _ = std::fs::remove_file(&tmp);
    })
}

/// The nearest ancestor of `dir` holding `.git`, else `dir`.
pub(crate) fn project_root(dir: &Path) -> PathBuf {
    let mut cur = Some(dir);
    while let Some(d) = cur {
        if d.join(".git").exists() {
            return d.to_path_buf();
        }
        cur = d.parent();
    }
    dir.to_path_buf()
}

/// Largest index `<= at` on a char boundary of `s`.
pub(crate) fn floor_char(s: &str, at: usize) -> usize {
    let mut i = at.min(s.len());
    while !s.is_char_boundary(i) {
        i -= 1;
    }
    i
}

/// `s` cut to `max` bytes with an ellipsis.
pub(crate) fn clip(s: &str, max: usize) -> String {
    if s.len() <= max {
        return s.to_owned();
    }
    format!("{}…", &s[..floor_char(s, max)])
}

/// YAML frontmatter fields (`key: value`, one level, quotes stripped) and the body after it.
pub(crate) fn frontmatter(text: &str) -> (Vec<(String, String)>, &str) {
    let rest = text.strip_prefix('\u{feff}').unwrap_or(text);
    let Some(after) = rest.strip_prefix("---") else {
        return (Vec::new(), text);
    };
    let after = after.trim_start_matches(['\r', '\n']);
    let Some(end) = after.find("\n---") else {
        return (Vec::new(), text);
    };
    let head = &after[..end];
    let body = after[end + 4..].trim_start_matches(['-', '\r', '\n']);
    let mut fields = Vec::new();
    for line in head.lines() {
        let line = line.trim_end();
        let Some((key, value)) = line.split_once(':') else {
            continue;
        };
        let key = key.trim();
        if key.is_empty() || key.contains(' ') {
            continue;
        }
        let value = value.trim();
        let value = value
            .strip_prefix('"')
            .and_then(|v| v.strip_suffix('"'))
            .or_else(|| value.strip_prefix('\'').and_then(|v| v.strip_suffix('\'')))
            .unwrap_or(value);
        fields.push((key.to_owned(), value.replace("\\\"", "\"")));
    }
    (fields, body)
}

pub(crate) fn field<'a>(fields: &'a [(String, String)], key: &str) -> Option<&'a str> {
    fields
        .iter()
        .find(|(k, _)| k == key)
        .map(|(_, v)| v.as_str())
        .filter(|v| !v.is_empty())
}

/// Lower-cased alphanumeric words of at least two characters.
pub(crate) fn words(text: &str) -> impl Iterator<Item = String> + '_ {
    text.split(|c: char| !c.is_alphanumeric())
        .filter(|w| w.len() >= 2)
        .map(str::to_lowercase)
}
