//! `bun lsp`: the language server of `bun_lsp`, with TypeScript diagnostics from `bun check`.
//! Dispatched before the runtime starts, like `bun msvc`.

use std::path::{Path, PathBuf};
use std::sync::Arc;

use bstr::BStr;
use bun_core::Global;
use bun_lsp::{NativeChecker, NativeDiagnostic};
use bun_sema_driver::Category;

/// `bun check` for `bun lsp`. One check at a time: each one uses every core.
struct BunCheck {
    turn: bun_threading::Guarded<()>,
}

fn native_bytes(path: &Path) -> Vec<u8> {
    path.to_string_lossy().into_owned().into_bytes()
}

fn path_of(bytes: &[u8]) -> PathBuf {
    PathBuf::from(BStr::new(bytes).to_string())
}

impl NativeChecker for BunCheck {
    fn check(&self, root: &Path, files: &[PathBuf], texts: &[(PathBuf, String)]) -> Result<Vec<NativeDiagnostic>, String> {
        let _turn = self.turn.lock();
        let cwd = native_bytes(root);
        let paths: Vec<Vec<u8>> = files.iter().map(|it| native_bytes(it)).collect();
        let texts: Vec<(Vec<u8>, Vec<u8>)> = (texts.iter())
            .map(|(path, text)| (native_bytes(path), text.as_bytes().to_vec()))
            .collect();
        let report = super::check_command::check_for_language_server(&cwd, &paths, &texts);
        let wanted: Vec<String> = files.iter().map(|it| bun_lsp::protocol::path_key(it)).collect();
        let mut diagnostics = Vec::new();
        for diagnostic in &report.diagnostics {
            let path = match diagnostic.path.is_empty() {
                // A configuration error: shown on the first file.
                true => files.first().cloned().unwrap_or_default(),
                false => path_of(bun_sema_driver::host::to_native(&diagnostic.path)),
            };
            if !wanted.contains(&bun_lsp::protocol::path_key(&path)) {
                continue;
            }
            let severity = match diagnostic.category {
                Category::Error => 1,
                Category::Warning => 2,
                Category::Message => 3,
                Category::Suggestion => 4,
            };
            let position = |line: u32, column: u32| (line.saturating_sub(1), column.saturating_sub(1));
            diagnostics.push(NativeDiagnostic {
                path,
                start: position(diagnostic.line, diagnostic.column),
                end: position(diagnostic.end_line.max(diagnostic.line), diagnostic.end_column),
                severity,
                code: (diagnostic.code != 0).then(|| diagnostic.code.to_string()),
                message: BStr::new(&diagnostic.text).to_string(),
            });
        }
        Ok(diagnostics)
    }
}

struct Stdin;

impl std::io::Read for Stdin {
    fn read(&mut self, buffer: &mut [u8]) -> std::io::Result<usize> {
        bun_sys::read(bun_sys::Fd::stdin(), buffer).map_err(|err| std::io::Error::from_raw_os_error(err.errno as i32))
    }
}

/// Whether `argv0` is a Bun executable, for `bun lsp`.
pub(crate) fn is_bun(argv0: &[u8]) -> bool {
    let name = bun_paths::resolve_path::basename(argv0);
    super::msvc_command::is_bun_argv0(name.strip_suffix(b".exe").unwrap_or(name))
}

#[cold]
pub(crate) fn exec() -> ! {
    let args: Vec<String> = bun_core::os_args()
        .into_iter()
        .skip(2)
        .map(|it| it.to_string_lossy().into_owned())
        .collect();
    let native: Arc<dyn NativeChecker> = Arc::new(BunCheck {
        turn: bun_threading::Guarded::new(()),
    });
    let options = bun_lsp::Options::from_env().with_native(Some(native));
    let io = bun_lsp::cli::Io {
        input: Box::new(Stdin),
        output: Box::new(bun_sys::FileWriter(bun_sys::Fd::stdout())),
        error: Box::new(bun_sys::FileWriter(bun_sys::Fd::stderr())),
    };
    let code = bun_lsp::cli::main(&args, io, options);
    Global::exit(code as u32);
}
