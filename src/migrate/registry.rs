//! The rule registry: TOML files that say what `bun migrate` looks for and what it rewrites it to. The files in
//! `registry/` are built in, and `--registry` adds more. A row of an added file with a name that an earlier row has
//! (a crate) replaces it; every other row adds to the rules.

use bun_core::strings;

use crate::bytes::glob_matches;
use crate::regex::Regex;
use crate::toml::{self, Row};

#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Debug)]
pub enum Severity {
    Info,
    Warn,
    Error,
}

impl Severity {
    pub fn parse(name: &[u8]) -> Option<Severity> {
        match name {
            b"info" => Some(Severity::Info),
            b"warn" => Some(Severity::Warn),
            b"error" => Some(Severity::Error),
            _ => None,
        }
    }

    pub fn name(self) -> &'static str {
        match self {
            Severity::Info => "info",
            Severity::Warn => "warn",
            Severity::Error => "error",
        }
    }
}

/// What a file is, which decides the rules that read it.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(crate) enum Kind {
    Manifest,
    Script,
    Source,
    Dockerfile,
    Compose,
    Ci,
    Shell,
    Husky,
    Procfile,
    Turbo,
}

impl Kind {
    fn parse(name: &[u8]) -> Option<Kind> {
        Some(match name {
            b"manifest" => Kind::Manifest,
            b"script" => Kind::Script,
            b"source" => Kind::Source,
            b"dockerfile" => Kind::Dockerfile,
            b"compose" => Kind::Compose,
            b"ci" => Kind::Ci,
            b"shell" => Kind::Shell,
            b"husky" => Kind::Husky,
            b"procfile" => Kind::Procfile,
            b"turbo" => Kind::Turbo,
            _ => return None,
        })
    }

    /// The kind of a file, from its path relative to the project root.
    pub(crate) fn of_path(path: &[u8]) -> Option<Kind> {
        let name = crate::bytes::basename(path);
        let ends = |suffix: &[u8]| name.ends_with(suffix);
        let within = |dir: &[u8]| path.starts_with(dir) || strings::contains(path, &[b"/", dir].concat());
        Some(match name {
            b"package.json" => Kind::Manifest,
            b"turbo.json" => Kind::Turbo,
            b"Procfile" => Kind::Procfile,
            _ if name.starts_with(b"Dockerfile") || ends(b".Dockerfile") || name == b"Containerfile" => Kind::Dockerfile,
            _ if (name.starts_with(b"docker-compose") || name.starts_with(b"compose.")) && (ends(b".yml") || ends(b".yaml")) => Kind::Compose,
            _ if name.starts_with(b"Procfile.") => Kind::Procfile,
            _ if within(b".husky/") && !name.starts_with(b"_") && !strings::contains_char(name, b'.') => Kind::Husky,
            _ if within(b".github/workflows/") && (ends(b".yml") || ends(b".yaml")) => Kind::Ci,
            b".gitlab-ci.yml" => Kind::Ci,
            _ if ends(b".sh") || ends(b".bash") => Kind::Shell,
            _ if [&b".js"[..], b".jsx", b".ts", b".tsx", b".mjs", b".cjs", b".mts", b".cts"].iter().any(|suffix| ends(suffix)) && !ends(b".d.ts") => Kind::Source,
            _ => return None,
        })
    }
}

pub(crate) struct TextRule {
    pub(crate) id: Vec<u8>,
    pub(crate) kinds: Vec<Kind>,
    pub(crate) files: Vec<Vec<u8>>,
    pub(crate) pattern: Regex,
    pub(crate) replace: Option<Vec<u8>>,
    pub(crate) message: Vec<u8>,
    pub(crate) severity: Severity,
    pub(crate) autofix: bool,
    pub(crate) aggressive: bool,
    pub(crate) requires: Option<Regex>,
    pub(crate) unless: Option<Regex>,
    pub(crate) import_from: Option<Regex>,
    pub(crate) docs: Vec<u8>,
}

impl TextRule {
    pub(crate) fn applies_to(&self, kind: Option<Kind>, path: &[u8]) -> bool {
        let name = crate::bytes::basename(path);
        kind.is_some_and(|kind| self.kinds.contains(&kind)) || self.files.iter().any(|glob| glob_matches(glob, name))
    }
}

pub(crate) enum JsonTest {
    Equals(Vec<Vec<u8>>),
    Absent,
    Items { has: Vec<Vec<u8>>, lacks: Vec<Vec<u8>> },
}

pub(crate) struct JsonRule {
    pub(crate) id: Vec<u8>,
    pub(crate) files: Vec<Vec<u8>>,
    pub(crate) path: Vec<Vec<u8>>,
    pub(crate) test: JsonTest,
    pub(crate) message: Vec<u8>,
    pub(crate) severity: Severity,
    pub(crate) docs: Vec<u8>,
}

pub(crate) struct PackageRule {
    pub(crate) id: Vec<u8>,
    pub(crate) packages: Vec<Vec<u8>>,
    pub(crate) replacement: Vec<u8>,
}

pub(crate) struct HotRule {
    pub(crate) packages: Vec<Vec<u8>>,
    pub(crate) crate_name: Vec<u8>,
    pub(crate) area: Vec<u8>,
}

pub(crate) struct ToolRule {
    pub(crate) name: Vec<u8>,
    pub(crate) to: Vec<u8>,
    pub(crate) crate_name: Vec<u8>,
    /// Accepted flag and what it becomes (empty: dropped). No flags: the call is always manual.
    pub(crate) flags: Vec<(Vec<u8>, Vec<u8>)>,
    pub(crate) valued: Vec<Vec<u8>>,
    pub(crate) paths: bool,
    pub(crate) require: Vec<Vec<u8>>,
    pub(crate) note: Vec<u8>,
}

#[derive(Default)]
pub(crate) struct Registry {
    pub(crate) text: Vec<TextRule>,
    pub(crate) json: Vec<JsonRule>,
    pub(crate) packages: Vec<PackageRule>,
    pub(crate) crates: Vec<(Vec<u8>, Vec<u8>)>,
    pub(crate) addons: Vec<Vec<u8>>,
    pub(crate) hot: Vec<HotRule>,
    pub(crate) tools: Vec<ToolRule>,
}

const BUILT_IN: [(&str, &str); 6] = [
    ("scripts.toml", include_str!("registry/scripts.toml")),
    ("files.toml", include_str!("registry/files.toml")),
    ("apis.toml", include_str!("registry/apis.toml")),
    ("json.toml", include_str!("registry/json.toml")),
    ("packages.toml", include_str!("registry/packages.toml")),
    ("rust.toml", include_str!("registry/rust.toml")),
];

/// Why a registry file was refused.
pub struct RegistryError {
    pub file: String,
    pub line: usize,
    pub message: String,
}

impl Registry {
    pub(crate) fn built_in() -> Result<Registry, RegistryError> {
        let mut registry = Registry::default();
        for (name, source) in BUILT_IN {
            registry.add(name, source.as_bytes())?;
        }
        Ok(registry)
    }

    pub(crate) fn add(&mut self, file: &str, source: &[u8]) -> Result<(), RegistryError> {
        let rows = toml::parse(source).map_err(|error| RegistryError { file: file.into(), line: error.line, message: error.message.into() })?;
        for (index, row) in rows.iter().enumerate() {
            self.add_row(row).map_err(|message| RegistryError { file: file.into(), line: index + 1, message })?;
        }
        Ok(())
    }

    fn add_row(&mut self, row: &Row) -> Result<(), String> {
        let text = |key: &str| row.str(key).map(<[u8]>::to_vec).unwrap_or_default();
        let owned = |items: Vec<&[u8]>| items.into_iter().map(<[u8]>::to_vec).collect::<Vec<_>>();
        match row.section.as_slice() {
            b"text" => {
                let flags = row.str("flags").unwrap_or(b"");
                let compile = |pattern: &[u8]| Regex::new(pattern, flags).map_err(|error| format!("{error}: {}", String::from_utf8_lossy(pattern)));
                let kinds = row.list("kinds").into_iter().map(|name| Kind::parse(name).ok_or_else(|| format!("unknown kind {}", String::from_utf8_lossy(name)))).collect::<Result<Vec<Kind>, String>>()?;
                self.text.push(TextRule {
                    id: text("id"),
                    kinds,
                    files: owned(row.list("files")),
                    pattern: compile(row.str("pattern").ok_or("a text rule needs a pattern")?)?,
                    replace: row.str("replace").map(<[u8]>::to_vec),
                    message: text("message"),
                    severity: row.str("severity").map_or(Some(Severity::Warn), Severity::parse).ok_or("unknown severity")?,
                    autofix: row.bool("autofix"),
                    aggressive: row.bool("aggressive"),
                    requires: row.str("requires").map(&compile).transpose()?,
                    unless: row.str("unless").map(&compile).transpose()?,
                    import_from: row.str("import_from").map(|module| Regex::new(&import_pattern(module), b"m").map_err(|error| error.to_string())).transpose()?,
                    docs: text("docs"),
                });
            }
            b"json" => {
                let test = if row.bool("absent") {
                    JsonTest::Absent
                } else if !row.list("equals").is_empty() {
                    JsonTest::Equals(owned(row.list("equals")))
                } else {
                    JsonTest::Items { has: owned(row.list("has")), lacks: owned(row.list("lacks")) }
                };
                let path = text("path").split(|&byte| byte == b'.').map(<[u8]>::to_vec).collect();
                self.json.push(JsonRule {
                    id: text("id"),
                    files: owned(row.list("files")),
                    path,
                    test,
                    message: text("message"),
                    severity: row.str("severity").map_or(Some(Severity::Info), Severity::parse).ok_or("unknown severity")?,
                    docs: text("docs"),
                });
            }
            b"packages" => self.packages.push(PackageRule { id: text("id"), packages: owned(row.list("packages")), replacement: text("replacement") }),
            b"crate" => {
                let (name, repo) = (text("name"), text("repo"));
                match self.crates.iter_mut().find(|(known, _)| *known == name) {
                    Some(entry) => entry.1 = repo,
                    None => self.crates.push((name, repo)),
                }
            }
            b"addon" => self.addons.extend(owned(row.list("packages"))),
            b"hot" => self.hot.push(HotRule { packages: owned(row.list("packages")), crate_name: text("crate"), area: text("area") }),
            b"tool" => {
                let flags: Vec<(Vec<u8>, Vec<u8>)> = row
                    .list("flags")
                    .into_iter()
                    .filter_map(|pair| crate::bytes::find_from(pair, b"=", 0).map(|at| (pair[..at].to_vec(), pair[at + 1..].to_vec())))
                    .collect();
                self.tools.push(ToolRule {
                    name: text("name"),
                    to: text("to"),
                    crate_name: text("crate"),
                    flags,
                    valued: owned(row.list("valued")),
                    paths: row.bool("paths"),
                    require: owned(row.list("require")),
                    note: text("note"),
                });
            }
            other => return Err(format!("unknown section {}", String::from_utf8_lossy(other))),
        }
        Ok(())
    }

    /// Turns rules off or changes their severity. An id that ends with `/` stands for every rule under it.
    pub(crate) fn apply_overrides(&mut self, overrides: &[(Vec<u8>, Option<Severity>)]) {
        for (id, level) in overrides {
            let hit = |rule: &[u8]| overrides_match(id, rule);
            match level {
                None => {
                    self.text.retain(|rule| !hit(&rule.id));
                    self.json.retain(|rule| !hit(&rule.id));
                    self.packages.retain(|rule| !hit(&rule.id));
                }
                Some(severity) => {
                    self.text.iter_mut().filter(|rule| hit(&rule.id)).for_each(|rule| rule.severity = *severity);
                    self.json.iter_mut().filter(|rule| hit(&rule.id)).for_each(|rule| rule.severity = *severity);
                }
            }
        }
    }

    pub(crate) fn repo_of(&self, crate_name: &[u8]) -> Option<&[u8]> {
        self.crates.iter().find(|(name, _)| name == crate_name).map(|(_, repo)| repo.as_slice())
    }
}

impl JsonRule {
    pub(crate) fn applies_to(&self, path: &[u8]) -> bool {
        let name = crate::bytes::basename(path);
        self.files.iter().any(|glob| glob_matches(glob, name))
    }
}

/// A pattern for an import of `module`, with or without the `node:` prefix and with any subpath.
fn import_pattern(module: &[u8]) -> Vec<u8> {
    let mut pattern = b"(?:\\bfrom\\s*|\\brequire\\s*\\(\\s*|\\bimport\\s*\\(\\s*|^\\s*import\\s+)[\\x22\\x27](?:node:)?".to_vec();
    for &byte in module {
        if !byte.is_ascii_alphanumeric() && byte != b'_' {
            pattern.push(b'\\');
        }
        pattern.push(byte);
    }
    pattern.extend_from_slice(b"(?:/[\\w./-]*)?[\\x22\\x27]");
    pattern
}

/// Whether the override `id` is for the rule `rule`.
pub(crate) fn overrides_match(id: &[u8], rule: &[u8]) -> bool {
    rule == id || (id.ends_with(b"/") && rule.starts_with(id))
}
