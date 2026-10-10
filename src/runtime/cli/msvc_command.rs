//! `bun msvc`: resolve, set up and cache the native Windows toolchain (every Visual Studio /
//! Build Tools instance, MSVC toolset, Windows SDK, UCRT, .NET Framework SDK, LLVM, the developer
//! scripts and the vcvarsall environment) without vswhere.exe or any `.bat`. Dispatched before the
//! runtime starts, like `bun uv`. The command line itself is `find_msvc_tools::cli`, shared with
//! the crate's `bun-msvc` binary that `scripts/build.ts` falls back to.
//!
//! On Linux and macOS, `bun msvc` is `find_msvc_tools::cross`: the MSVC CRT and Windows SDK
//! sysroot and the cargo/cc-rs environment for `*-pc-windows-msvc` (`bun msvc cross` on Windows).
//! Its downloads go through bun's HTTP client (proxy and TLS settings included).

use bun_core::Global;

#[derive(Clone, Copy)]
pub(crate) enum Invocation {
    Bun,
    Msvc,
}

impl Invocation {
    #[inline]
    pub(crate) fn from_argv(argv0: &[u8], first_arg: Option<&[u8]>) -> Option<Self> {
        let name = bun_paths::resolve_path::basename(argv0);
        let name = name.strip_suffix(b".exe").unwrap_or(name);
        match name {
            b"msvc" => Some(Self::Msvc),
            _ if first_arg == Some(b"msvc") && is_bun_argv0(name) => Some(Self::Bun),
            _ => None,
        }
    }
}

/// `argv0` basename (without `.exe`) of a bun binary, so `bun <subcommand>` dispatches early.
pub(crate) fn is_bun_argv0(name: &[u8]) -> bool {
    matches!(
        name,
        b"bun"
            | b"bun-debug"
            | b"bun-profile"
            | b"bun-asan"
            | b"bun-valgrind"
            | b"bun-asan-valgrind"
            | b"bun-assertions"
    )
}

pub(crate) fn fail(message: core::fmt::Arguments<'_>) -> ! {
    use std::io::Write;
    let _ = writeln!(bun_sys::FileWriter(bun_sys::Fd::stderr()), "error: {message}");
    Global::exit(1);
}

pub(crate) fn out(bytes: &[u8]) {
    use std::io::Write;
    let _ = bun_sys::FileWriter(bun_sys::Fd::stdout()).write_all(bytes);
}

#[cold]
pub(crate) fn exec(invocation: Invocation) -> ! {
    let (skip, self_args): (usize, &[&str]) = match invocation {
        Invocation::Bun => (2, &["msvc"]),
        Invocation::Msvc => (1, &[]),
    };
    let args = bun_core::os_args().into_iter().skip(skip).collect();
    #[cfg(windows)]
    let code = find_msvc_tools::cli::main_with(args, self_args, &BunFetch::new());
    #[cfg(not(windows))]
    let code = {
        let prog = if self_args.is_empty() { "msvc" } else { "bun msvc" };
        find_msvc_tools::cross::cli::main(args, prog, &BunFetch::new())
    };
    Global::exit(code as u32);
}

/// `https://` and `http://` through bun's HTTP client; paths and `file://` read from disk.
struct BunFetch {
    env: std::cell::OnceCell<bun_dotenv::Loader>,
}

impl BunFetch {
    fn new() -> Self {
        Self { env: std::cell::OnceCell::new() }
    }

    fn env(&self) -> &bun_dotenv::Loader {
        self.env.get_or_init(|| {
            bun_http::http_thread::init(&Default::default());
            let mut env = bun_dotenv::Loader::init();
            let _ = env.load_process();
            env
        })
    }
}

impl find_msvc_tools::cross::Fetch for BunFetch {
    fn get(&self, url: &str) -> Result<Vec<u8>, String> {
        if !url.starts_with("https://") && !url.starts_with("http://") {
            return find_msvc_tools::cross::StdFetch.get(url);
        }
        let env = self.env();
        let parsed = bun_url::URL::parse(url.as_bytes());
        let proxy = env.get_http_proxy_for(&parsed);
        let mut body = bun_core::MutableString::init(64 * 1024).map_err(|_| "out of memory".to_owned())?;
        let mut request = bun_http::AsyncHTTP::init_sync(
            bun_http::Method::GET,
            parsed,
            bun_http::headers::EntryList::default(),
            b"",
            b"",
            proxy,
            bun_http::FetchRedirect::Follow,
        );
        request.client.flags.reject_unauthorized = env.get_tls_reject_unauthorized();
        let response = request.send_sync(&mut body).map_err(|e| format!("GET {url}: {}", e.name()))?;
        match response.status_code() {
            200..=299 => Ok(core::mem::take(&mut body.list)),
            code => Err(format!("GET {url}: HTTP {code}")),
        }
    }
}
