//! Installed-package database: `<root>/.bun-system/installed.json`.
//!
//! Records what each install put on disk (or which native installer ran) so
//! `bun remove`/upgrades can undo it without the native package manager.

use std::collections::BTreeMap;

use super::value::{Value, write_json_string};
use super::{Error, Result, SourceKind};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum InstallKind {
    /// Files extracted under the install root; `files` lists them.
    Files,
    /// A native installer ran (msi/exe/msix); `uninstall` undoes it.
    Native,
}

impl InstallKind {
    fn name(self) -> &'static str {
        match self {
            InstallKind::Files => "files",
            InstallKind::Native => "native",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct InstalledRecord {
    pub source: SourceKind,
    pub id: String,
    pub version: String,
    /// Lock hash this record was installed from.
    pub hash: String,
    pub kind: InstallKind,
    /// Absolute paths written (files and directories, deepest last).
    pub files: Vec<String>,
    /// Absolute paths of command shims created in the bin dir.
    pub bins: Vec<String>,
    /// argv that uninstalls a native install (empty for `Files`).
    pub uninstall: Vec<String>,
    /// Source-specific data (installer type, product code, scope, …).
    pub meta: BTreeMap<String, String>,
}

impl InstalledRecord {
    pub fn new(source: SourceKind, id: &str, version: &str, hash: &str, kind: InstallKind) -> Self {
        InstalledRecord {
            source,
            id: id.to_owned(),
            version: version.to_owned(),
            hash: hash.to_owned(),
            kind,
            files: Vec::new(),
            bins: Vec::new(),
            uninstall: Vec::new(),
            meta: BTreeMap::new(),
        }
    }

    fn write_json(&self, out: &mut String) {
        let list = |out: &mut String, items: &[String]| {
            out.push('[');
            for (i, s) in items.iter().enumerate() {
                if i > 0 {
                    out.push_str(", ");
                }
                write_json_string(out, s);
            }
            out.push(']');
        };
        out.push_str("{ \"version\": ");
        write_json_string(out, &self.version);
        out.push_str(", \"hash\": ");
        write_json_string(out, &self.hash);
        out.push_str(", \"kind\": ");
        write_json_string(out, self.kind.name());
        out.push_str(", \"files\": ");
        list(out, &self.files);
        out.push_str(", \"bins\": ");
        list(out, &self.bins);
        out.push_str(", \"uninstall\": ");
        list(out, &self.uninstall);
        out.push_str(", \"meta\": {");
        for (i, (k, v)) in self.meta.iter().enumerate() {
            if i > 0 {
                out.push_str(", ");
            }
            write_json_string(out, k);
            out.push_str(": ");
            write_json_string(out, v);
        }
        out.push_str("} }");
    }

    fn from_value(key: &str, v: &Value) -> Result<Self> {
        let spec = super::parse_entry(key.as_bytes(), b"*")
            .ok_or_else(|| Error::Parse(format!("installed.json: bad key \"{key}\"")))?;
        let s = |name: &str| v.get(name).and_then(Value::as_str).unwrap_or("").to_owned();
        let list = |name: &str| -> Vec<String> {
            v.get(name)
                .map(|a| a.as_array().iter().filter_map(|x| x.as_str().map(str::to_owned)).collect())
                .unwrap_or_default()
        };
        let kind = match v.get("kind").and_then(Value::as_str) {
            Some("native") => InstallKind::Native,
            _ => InstallKind::Files,
        };
        let mut rec = InstalledRecord::new(spec.source, &spec.id, &s("version"), &s("hash"), kind);
        rec.files = list("files");
        rec.bins = list("bins");
        rec.uninstall = list("uninstall");
        if let Some(Value::Object(rows)) = v.get("meta") {
            for (k, val) in rows {
                if let Some(val) = val.as_str() {
                    rec.meta.insert(k.clone(), val.to_owned());
                }
            }
        }
        Ok(rec)
    }
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct InstalledDb {
    /// Keyed by `<source>:<id>`.
    pub entries: BTreeMap<String, InstalledRecord>,
}

impl InstalledDb {
    /// Missing file = empty db.
    pub fn load(path: &[u8]) -> Result<InstalledDb> {
        let Some(bytes) = super::fs::read(path) else {
            return Ok(InstalledDb::default());
        };
        let root = super::value::parse_json(&bytes, "installed.json")?;
        let mut db = InstalledDb::default();
        if let Some(Value::Object(rows)) = root.get("packages") {
            for (key, v) in rows {
                db.entries.insert(key.clone(), InstalledRecord::from_value(key, v)?);
            }
        }
        Ok(db)
    }

    pub fn save(&self, path: &[u8]) -> Result<()> {
        let mut out = String::from("{\n  \"version\": 1,\n  \"packages\": {");
        for (i, (key, rec)) in self.entries.iter().enumerate() {
            out.push_str(if i == 0 { "\n    " } else { ",\n    " });
            write_json_string(&mut out, key);
            out.push_str(": ");
            rec.write_json(&mut out);
        }
        out.push_str(if self.entries.is_empty() { "}\n}\n" } else { "\n  }\n}\n" });
        super::fs::write(path, out.as_bytes())
    }
}
