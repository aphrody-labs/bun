use std::fmt;

/// Why an operation failed.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ErrorKind {
    /// Invalid arguments: unknown extension, non-UTF-8 text, bad option.
    Input,
    /// The source did not parse, or failed semantic checks.
    Syntax,
    /// The formatter or linter could not complete the operation.
    Tool,
    /// The transformer reported an error.
    Transform,
    /// The resolver could not resolve the specifier.
    Resolve,
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
            Self::Resolve => "resolve",
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
    pub fn new(kind: ErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
        }
    }

    pub fn input(message: impl Into<String>) -> Self {
        Self::new(ErrorKind::Input, message)
    }

    pub fn syntax(message: impl Into<String>) -> Self {
        Self::new(ErrorKind::Syntax, message)
    }

    pub fn tool(message: impl Into<String>) -> Self {
        Self::new(ErrorKind::Tool, message)
    }

    pub fn resolve(message: impl Into<String>) -> Self {
        Self::new(ErrorKind::Resolve, message)
    }
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for Error {}
