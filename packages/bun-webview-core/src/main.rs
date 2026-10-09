//! `bun-webview-host`: a native webview engine behind Chrome's `--remote-debugging-pipe`
//! protocol. Bun.WebView spawns it like Chrome (`backend: "webkitgtk" | "webview2" | "cef" |
//! "wkwebview"`) and drives it with ChromeBackend.cpp unchanged.
//!
//! Switches: `--backend=<webkitgtk|webview2|wkwebview|cef|mock>` (default: the OS engine),
//! `--user-data-dir=<dir>`, `--headless`, `--disable-gpu`, `--no-sandbox`, `--stdio` (CDP on
//! stdin/stdout instead of fd 3/4), `--list-backends`, `--version`. Every other Chrome switch
//! Bun passes (`--remote-debugging-pipe`, `--no-first-run`, …) is accepted and ignored.

use bun_webview_core::{BackendKind, HostConfig, backend, pipe};

fn main() {
    let mut kind = std::env::var("BUN_WEBVIEW_BACKEND").ok().and_then(|b| BackendKind::parse(&b)).unwrap_or_else(BackendKind::platform_default);
    let mut cfg = HostConfig::default();
    let mut stdio = false;
    for arg in std::env::args().skip(1) {
        let (k, v) = match arg.split_once('=') {
            Some((k, v)) => (k.to_owned(), Some(v.to_owned())),
            None => (arg.clone(), None),
        };
        match (k.as_str(), v) {
            ("--backend", Some(v)) => match BackendKind::parse(&v) {
                Some(b) => kind = b,
                None => fail(&format!("unknown backend \"{v}\" (webkitgtk, webview2, wkwebview, cef, mock)")),
            },
            ("--user-data-dir", Some(v)) => cfg.user_data_dir = Some(v.into()),
            ("--headless", _) => cfg.headless = true,
            ("--disable-gpu", _) => cfg.disable_gpu = true,
            ("--no-sandbox", _) => cfg.no_sandbox = true,
            ("--stdio", _) => stdio = true,
            ("--list-backends", _) => {
                for b in backend::available() {
                    println!("{}", b.name());
                }
                return;
            }
            ("--version", _) => {
                println!("bun-webview-host {}", env!("CARGO_PKG_VERSION"));
                return;
            }
            _ => {}
        }
    }
    if cfg.no_sandbox {
        // SAFETY: single-threaded here, before any engine or pipe thread starts.
        unsafe { std::env::set_var("WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS", "1") };
    }
    let (input, output) = match pipe::open(stdio) {
        Ok(p) => p,
        Err(e) => fail(&e.to_string()),
    };
    match backend::run(kind, cfg, input, output) {
        Ok(code) => std::process::exit(code),
        Err(e) => fail(&e),
    }
}

fn fail(msg: &str) -> ! {
    eprintln!("bun-webview-host: {msg}");
    std::process::exit(1)
}
