//! oxlint through `oxc_linter`'s `LintRunner::run_source`, the entry point of oxlint's language server.

use std::{
    ffi::OsStr,
    path::{Path, PathBuf},
    sync::Arc,
};

use oxc_allocator::Allocator;
use oxc_linter::{
    ConfigStore, ConfigStoreBuilder, ExternalPluginStore, FixKind, Fixer, LintOptions as OxcLintOptions,
    LintRunnerBuilder, LintServiceOptions, Linter, Message, Oxlintrc, PossibleFixes,
    RuntimeFileSystem, read_to_arena_str, table::RuleTable,
};
use rustc_hash::FxHashMap;
use serde_json::Value;

use crate::{Error, absolute, input_error, tool_error};

/// Which fixes [`lint`] applies.
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub enum FixMode {
    /// Report only.
    #[default]
    None,
    /// `--fix`: safe fixes.
    Safe,
    /// `--fix-suggestions`: safe fixes and suggestions.
    Suggestions,
    /// `--fix-dangerously`: every fix and suggestion, including dangerous ones.
    Dangerous,
}

impl FixMode {
    fn kind(self) -> FixKind {
        match self {
            Self::None => FixKind::None,
            Self::Safe => FixKind::SafeFix,
            Self::Suggestions => FixKind::SafeFixOrSuggestion,
            Self::Dangerous => FixKind::All,
        }
    }
}

/// Options of [`lint`].
#[derive(Clone, Debug, Default)]
pub struct LintOptions {
    /// Base for relative file names and config discovery. Defaults to the process directory.
    pub cwd: Option<PathBuf>,
    /// Inline `.oxlintrc.json` content. Takes precedence over `config_path` and discovery.
    pub config: Option<Value>,
    /// Explicit `.oxlintrc.json` / `.oxlintrc.jsonc`.
    pub config_path: Option<PathBuf>,
    /// Look for `.oxlintrc.json(c)` from the file's directory upwards when no config is given.
    pub discover_config: bool,
    pub fix: FixMode,
}

/// Result of [`lint`].
#[derive(Clone, Debug)]
pub struct LintReport {
    /// Remaining diagnostics in the JSON shape of `aphrody_oxc_bridge::check`, plus `fixable`.
    pub diagnostics: Vec<Value>,
    /// Fixed source when fixes were requested and at least one applied.
    pub fixed: Option<String>,
    pub error_count: usize,
    pub warning_count: usize,
}

/// Serves the linted file from memory; other files (cross-module rules) come from disk.
struct SourceFileSystem {
    path: PathBuf,
    source: Arc<str>,
}

impl RuntimeFileSystem for SourceFileSystem {
    fn read_to_arena_str<'a>(
        &self,
        path: &Path,
        allocator: &'a Allocator,
    ) -> Result<&'a str, std::io::Error> {
        if path == self.path {
            Ok(allocator.alloc_str(&self.source))
        } else {
            read_to_arena_str(path, allocator)
        }
    }

    fn write_file(&self, _path: &Path, _content: &str) -> Result<(), std::io::Error> {
        Ok(())
    }
}

const CONFIG_FILE_NAMES: [&str; 2] = [".oxlintrc.json", ".oxlintrc.jsonc"];

fn discover(start: &Path) -> Option<PathBuf> {
    start.ancestors().find_map(|dir| {
        CONFIG_FILE_NAMES.iter().map(|name| dir.join(name)).find(|candidate| candidate.is_file())
    })
}

fn load_oxlintrc(options: &LintOptions, file: &Path) -> Result<Oxlintrc, Error> {
    let mut oxlintrc = if let Some(config) = &options.config {
        Oxlintrc::from_string(&config.to_string()).map_err(|error| input_error(error.to_string()))?
    } else if let Some(path) = options
        .config_path
        .clone()
        .map(|path| absolute(options.cwd.as_deref(), &path.to_string_lossy()))
        .or_else(|| options.discover_config.then(|| file.parent().and_then(discover)).flatten())
    {
        Oxlintrc::from_file(&path).map_err(|error| input_error(error.to_string()))?
    } else {
        Oxlintrc::default()
    };
    // oxlint enables its default plugins when the config does not list any.
    oxlintrc.plugins.get_or_insert_with(Default::default);
    Ok(oxlintrc)
}

fn fixable(message: &Message) -> &'static str {
    match &message.fixes {
        PossibleFixes::None => "none",
        PossibleFixes::Single(_) => "fix",
        PossibleFixes::Multiple(_) => "suggestions",
    }
}

/// Lints `source` as `filename` with oxlint. `jsPlugins` entries in the config are rejected; run
/// the oxlint CLI for those.
pub fn lint(source: &str, filename: &str, options: &LintOptions) -> Result<LintReport, Error> {
    let file = absolute(options.cwd.as_deref(), filename);
    let cwd = options
        .cwd
        .clone()
        .or_else(|| file.parent().map(Path::to_path_buf))
        .unwrap_or_default();
    let oxlintrc = load_oxlintrc(options, &file)?;

    let mut plugin_store = ExternalPluginStore::new(false);
    let builder = ConfigStoreBuilder::from_oxlintrc(false, oxlintrc, None, &mut plugin_store, None)
        .map_err(|error| input_error(error.to_string()))?;
    let config = builder.build(&mut plugin_store).map_err(|error| input_error(error.to_string()))?;
    let store = ConfigStore::new(config, FxHashMap::default(), plugin_store);

    let fix_kind = options.fix.kind();
    let linter = Linter::new(OxcLintOptions { fix: fix_kind, ..OxcLintOptions::default() }, store, None);
    let runner = LintRunnerBuilder::new(LintServiceOptions::new(cwd), linter)
        .with_fix_kind(fix_kind)
        .build()
        .map_err(tool_error)?;

    let fs = SourceFileSystem { path: file.clone(), source: Arc::from(source) };
    let messages = runner
        .run_source(&[Arc::<OsStr>::from(file.as_os_str())], &fs)
        .map_err(tool_error)?;

    let (messages, fixed) = if fix_kind == FixKind::None {
        (messages, None)
    } else {
        let result = Fixer::new(source, messages, None).fix();
        let fixed = result.fixed.then(|| result.fixed_code.into_owned());
        (result.messages, fixed)
    };

    let mut report =
        LintReport { diagnostics: Vec::with_capacity(messages.len()), fixed, error_count: 0, warning_count: 0 };
    for message in &messages {
        // Remaining messages carry offsets into the original source, before fixes.
        let mut json = aphrody_oxc_bridge::diagnostic_json(source, &message.error);
        match json["severity"].as_str() {
            Some("error") => report.error_count += 1,
            Some("warning") => report.warning_count += 1,
            _ => {},
        }
        json["fixable"] = Value::from(fixable(message));
        report.diagnostics.push(json);
    }
    Ok(report)
}

/// Every oxlint rule: `[{ name, plugin, category, default, fix, docs, version, typeAware }]`.
pub fn rules() -> Value {
    let table = RuleTable::default();
    let rows = table
        .sections
        .iter()
        .flat_map(|section| section.rows.iter())
        .map(|row| {
            serde_json::json!({
                "name": row.name,
                "plugin": row.plugin,
                "category": row.category.as_str(),
                "default": row.turned_on_by_default,
                "fix": row.autofix.to_string(),
                "fixable": row.autofix.has_fix(),
                "docs": row.documentation,
                "version": row.version,
                "typeAware": row.is_tsgolint_rule,
            })
        })
        .collect::<Vec<_>>();
    Value::Array(rows)
}
