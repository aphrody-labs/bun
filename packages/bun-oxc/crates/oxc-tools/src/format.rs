//! oxfmt's native formatters through its core API (made public on the `aphrody` branch).

use std::{path::PathBuf, sync::Arc};

use oxfmt::core::{
    ConfigScopes, FormatResult, ResolveOutcome, SourceFormatter, classify_file_kind, resolve_for_api,
};
use serde_json::Value;

use crate::{Error, absolute, input_error, syntax_error};

/// Options of [`format`].
#[derive(Clone, Debug, Default)]
pub struct FormatOptions {
    /// Base for relative file names and config discovery. Defaults to the process directory.
    pub cwd: Option<PathBuf>,
    /// Inline `.oxfmtrc.json` options (`printWidth`, `singleQuote`, `semi`, `sortImports`...).
    /// Takes precedence over config files.
    pub config: Option<Value>,
    /// Explicit `.oxfmtrc.json(c)`.
    pub config_path: Option<PathBuf>,
    /// Use `.oxfmtrc.json(c)` and `.editorconfig` found from `cwd` (nested configs included) when
    /// no inline config is given. Off: oxfmt defaults.
    pub discover_config: bool,
}

/// Formats `source` as `filename`; the extension (or file name, for `package.json` and dotfiles)
/// selects the formatter.
pub fn format(source: &str, filename: &str, options: &FormatOptions) -> Result<String, Error> {
    let path = absolute(options.cwd.as_deref(), filename);
    let cwd = options
        .cwd
        .clone()
        .or_else(|| path.parent().map(std::path::Path::to_path_buf))
        .unwrap_or_default();
    let kind = classify_file_kind(Arc::from(path.as_path()))
        .ok_or_else(|| input_error(format!("oxfmt does not support {filename}")))?;

    let resolved = if let Some(config) = &options.config {
        resolve_for_api(config.clone(), kind, &cwd)
    } else if options.discover_config || options.config_path.is_some() {
        let explicit = options
            .config_path
            .as_ref()
            .map(|config| absolute(Some(&cwd), &config.to_string_lossy()));
        ConfigScopes::load(&cwd, explicit.as_deref(), true)
            .and_then(|scopes| scopes.resolve(&path))
            .and_then(|resolver| resolver.resolve(kind))
    } else {
        resolve_for_api(Value::Object(serde_json::Map::new()), kind, &cwd)
    };
    let outcome = resolved.map_err(input_error)?;

    let strategy = match outcome {
        ResolveOutcome::Format(strategy) => strategy,
        ResolveOutcome::MissingPlugin(key) => {
            return Err(input_error(format!(
                "formatting {filename} needs the `{key}` option in the oxfmt config"
            )));
        },
    };
    match SourceFormatter::new(1).format(source, strategy) {
        FormatResult::Success { code, .. } => Ok(code),
        FormatResult::Error(diagnostics) => Err(syntax_error(
            diagnostics.iter().map(ToString::to_string).collect::<Vec<_>>().join("; "),
        )),
    }
}
