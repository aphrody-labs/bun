//! In-process oxlint and oxfmt on the `aphrody` branch of aphrody-labs/oxc.
//!
//! [`lint`] runs every oxlint rule (all built-in plugins: eslint, typescript, unicorn, react, jsx-a11y,
//! import, jest, vitest, promise, node, jsdoc, nextjs, vue, regexp, oxc) under an `.oxlintrc.json`
//! (inline, explicit path, or discovered upwards from the file) and can apply safe, suggested or
//! dangerous fixes. [`rules`] lists the rule table. [`format`] runs oxfmt's native formatters (JS/TS,
//! JSON, CSS, GraphQL, Markdown, YAML, TOML, `package.json` sorting) under `.oxfmtrc.json` or inline
//! options. JS-only features (oxlint `jsPlugins`, oxfmt JS configs and Prettier-backed embedded
//! formatting) need the oxlint/oxfmt npm CLIs and are not available here.

mod format;
mod lint;

pub use aphrody_oxc_bridge::{Error, ErrorKind};
pub use format::{FormatOptions, format};
pub use lint::{FixMode, LintOptions, LintReport, lint, rules};

pub(crate) fn tool_error(message: impl Into<String>) -> Error {
    Error { kind: ErrorKind::Tool, message: message.into() }
}

pub(crate) fn input_error(message: impl Into<String>) -> Error {
    Error { kind: ErrorKind::Input, message: message.into() }
}

pub(crate) fn syntax_error(message: impl Into<String>) -> Error {
    Error { kind: ErrorKind::Syntax, message: message.into() }
}

/// `filename` made absolute against `cwd` (or the process directory).
pub(crate) fn absolute(cwd: Option<&std::path::Path>, filename: &str) -> std::path::PathBuf {
    let path = std::path::Path::new(filename);
    if path.is_absolute() {
        return path.to_path_buf();
    }
    let base = cwd
        .map(std::path::Path::to_path_buf)
        .or_else(|| std::env::current_dir().ok())
        .unwrap_or_default();
    base.join(path)
}
