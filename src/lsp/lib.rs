//! `bun lsp`: one Language Server Protocol endpoint for TypeScript/JavaScript, Python, Rust and
//! C/C++, in front of the servers of those languages.
//!
//! - TypeScript and JavaScript: `tsgo` (typescript-go), else `typescript-language-server`, else
//!   `bun x @typescript/native-preview`. Diagnostics come from Bun's own checker (`bun check`, the
//!   `bun_sema` port of typescript-go) when the caller provides it as a [`NativeChecker`].
//! - Python: `ty`, else `basedpyright`, else `pyright`, else `ty` through the `uv` built into Bun;
//!   `ruff server` adds its diagnostics.
//! - Rust: `rust-analyzer`.
//! - C and C++: `clangd`, with the `compile_commands.json` of the project (written with
//!   `ninja -t compdb` or the Linux kernel's `gen_compile_commands.py` when there is none).
//!
//! Servers start on first use, one per language and project root, and stop when idle.
//!
//! # Reuse
//!
//! Another command (`bun mcp`) answers the same questions with:
//! - [`client::query`]: through the daemon of the workspace of the file, started if needed. Its
//!   servers stay warm between calls, so a call after the first takes milliseconds.
//! - [`Service::query`]: in this process, for a caller that lives long enough to keep the servers.
//!
//! ```no_run
//! use bun_lsp::{Options, Query, QueryKind, client};
//! let query = Query::at(QueryKind::Hover, "src/app.ts".into(), 3, 7);
//! let answer = client::query(&query, &Options::from_env()).unwrap();
//! println!("{}", answer.render(std::path::Path::new(".")));
//! ```

// It runs language servers and reads their pipes and small files, on no hot path. With `std`
// alone it links and runs its tests without Bun's C++ objects, like `bun_vfs`.
#![allow(clippy::disallowed_methods, clippy::disallowed_types)]

pub mod backend;
pub mod cli;
pub mod client;
pub mod ai;
pub mod daemon;
#[cfg(feature = "graph")]
pub mod graph;
#[cfg(not(feature = "graph"))]
#[path = "graph_off.rs"]
pub mod graph;
pub mod links;
pub mod language;
pub mod pool;
pub mod protocol;
pub mod proxy;
pub mod service;

use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

pub use language::Language;
pub use service::{Answer, Item, Query, QueryKind, Service};

/// The diagnostics of Bun's own type checker, which `bun_runtime` provides: this crate does not
/// depend on the checker.
pub trait NativeChecker: Send + Sync {
    /// Type checks `files` in the project of `root`. `texts` are read in place of the disk.
    fn check(&self, root: &Path, files: &[PathBuf], texts: &[(PathBuf, String)]) -> Result<Vec<NativeDiagnostic>, String>;
}

/// A diagnostic of a [`NativeChecker`]. Lines are 0-based and columns count UTF-16 code units, as
/// in LSP.
#[derive(Clone, Debug)]
pub struct NativeDiagnostic {
    pub path: PathBuf,
    pub start: (u32, u32),
    pub end: (u32, u32),
    /// LSP `DiagnosticSeverity`: 1 error, 2 warning, 3 information, 4 hint.
    pub severity: u8,
    pub code: Option<String>,
    pub message: String,
}

/// Where TypeScript diagnostics come from.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TypeScriptDiagnostics {
    /// The [`NativeChecker`] if there is one, else the server.
    Native,
    /// The language server.
    Server,
}

/// Settings of [`Service`], [`client`], [`daemon`] and [`proxy`].
#[derive(Clone)]
pub struct Options {
    /// The Bun executable: for `bun x`, `bun uv`, `bun msvc` and the daemon.
    pub bun: Option<PathBuf>,
    /// Never start a server that has to be downloaded first (`BUN_LSP_OFFLINE=1`).
    pub offline: bool,
    /// The most items in an answer (`BUN_LSP_LIMIT`, 100); `clangd --limit-results`.
    pub limit: usize,
    /// Threads of each server that takes a number (`BUN_LSP_JOBS`; half the cores, at most 4).
    pub jobs: usize,
    /// The most servers that run at once (`BUN_LSP_MAX_SERVERS`, 6). The least recently used
    /// stops when another starts.
    pub max_servers: usize,
    /// A server that nothing used for this long stops (`BUN_LSP_SERVER_IDLE_MS`, 15 minutes).
    pub server_idle: Duration,
    /// The daemon exits after this long without a request (`BUN_LSP_IDLE_MS`, 30 minutes).
    pub daemon_idle: Duration,
    /// How long a request may take (`BUN_LSP_TIMEOUT_MS`, 30 seconds).
    pub timeout: Duration,
    /// `BUN_LSP_TS_DIAGNOSTICS=native|server`.
    pub typescript_diagnostics: TypeScriptDiagnostics,
    pub native: Option<Arc<dyn NativeChecker>>,
    /// Add the code graph of the workspace to answers (`BUN_LSP_GRAPH`, on unless `0`).
    pub graph: bool,
    /// The most files in a graph (`BUN_LSP_GRAPH_FILES`, 20000).
    pub graph_files: usize,
    /// The command that answers a prompt on stdin, for fixes (`BUN_LSP_AI`, such as `claude -p`).
    pub ai: Option<Vec<String>>,
}

/// A command line: a JSON array, or words separated by spaces.
pub fn command_words(value: &str) -> Option<Vec<String>> {
    let words: Vec<String> = match serde_json::from_str::<Vec<String>>(value) {
        Ok(words) => words,
        Err(_) => value.split_whitespace().map(str::to_owned).collect(),
    };
    (!words.is_empty()).then_some(words)
}

fn env_number(name: &str) -> Option<u64> {
    std::env::var(name).ok()?.trim().parse().ok()
}

impl Options {
    /// The defaults, overridden by the `BUN_LSP_*` environment variables.
    pub fn from_env() -> Options {
        let cores = std::thread::available_parallelism().map_or(2, usize::from);
        let flag = |name: &str| std::env::var(name).is_ok_and(|it| matches!(it.as_str(), "1" | "true" | "yes"));
        let millis = |name: &str, default: u64| Duration::from_millis(env_number(name).unwrap_or(default).max(1));
        Options {
            bun: std::env::current_exe().ok(),
            offline: flag("BUN_LSP_OFFLINE"),
            limit: env_number("BUN_LSP_LIMIT").map_or(100, |it| it.clamp(1, 100_000) as usize),
            jobs: env_number("BUN_LSP_JOBS").map_or_else(|| (cores / 2).clamp(1, 4), |it| it.clamp(1, 256) as usize),
            max_servers: env_number("BUN_LSP_MAX_SERVERS").map_or(6, |it| it.clamp(1, 64) as usize),
            server_idle: millis("BUN_LSP_SERVER_IDLE_MS", 15 * 60 * 1000),
            daemon_idle: millis("BUN_LSP_IDLE_MS", 30 * 60 * 1000),
            timeout: millis("BUN_LSP_TIMEOUT_MS", 30 * 1000),
            typescript_diagnostics: match std::env::var("BUN_LSP_TS_DIAGNOSTICS").as_deref() {
                Ok("server") => TypeScriptDiagnostics::Server,
                _ => TypeScriptDiagnostics::Native,
            },
            native: None,
            graph: !std::env::var("BUN_LSP_GRAPH").is_ok_and(|it| matches!(it.as_str(), "0" | "false" | "no")),
            graph_files: env_number("BUN_LSP_GRAPH_FILES").map_or(20_000, |it| it.clamp(1, 1_000_000) as usize),
            ai: std::env::var("BUN_LSP_AI").ok().and_then(|it| command_words(&it)),
        }
    }

    pub fn with_native(mut self, native: Option<Arc<dyn NativeChecker>>) -> Options {
        self.native = native;
        self
    }
}
