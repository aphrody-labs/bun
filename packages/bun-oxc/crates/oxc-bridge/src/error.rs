use std::fmt;

/// Why an operation failed.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ErrorKind {
    /// Invalid arguments: unknown extension, non-UTF-8 text, bad option.
    Input,
    /// The source did not parse, or failed semantic checks.
    Syntax,
    /// An external tool (`oxfmt`, `oxlint`) is missing or failed.
    Tool,
    /// The transformer reported an error.
    Transform,
    /// An internal panic, caught at the C boundary.
    Panic,
}

impl ErrorKind {
    /// Stable lowercase name, as written in the C ABI's JSON `kind` field.
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Input => "input",
            Self::Syntax => "syntax",
            Self::Tool => "tool",
            Self::Transform => "transform",
            Self::Panic => "panic",
        }
    }
}

/// Error returned by every operation of this crate.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Error {
    pub kind: ErrorKind,
    pub message: String,
}

impl Error {
    pub(crate) fn new(kind: ErrorKind, message: impl Into<String>) -> Self {
        Self { kind, message: message.into() }
    }

    pub(crate) fn input(message: impl Into<String>) -> Self {
        Self::new(ErrorKind::Input, message)
    }

    pub(crate) fn syntax(message: impl Into<String>) -> Self {
        Self::new(ErrorKind::Syntax, message)
    }

    pub(crate) fn tool(message: impl Into<String>) -> Self {
        Self::new(ErrorKind::Tool, message)
    }
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for Error {}
