pub(super) fn dispatch() {
    let argv = bun_core::argv();
    if argv.get(1).map(bun_core::ZStr::as_bytes) != Some(b"crawl") {
        return;
    }
    let Some(executable) = argv.get(0) else {
        return;
    };
    let name = bun_paths::resolve_path::basename(executable.as_bytes());
    let name = name.strip_suffix(b".exe").unwrap_or(name);
    if !crate::cli::msvc_command::is_bun_argv0(name)
        && !bun_core::env_var::feature_flag::BUN_BE_BUN::get().unwrap_or(false)
    {
        return;
    }
    #[cfg(feature = "browser_crawl")]
    exec();
    #[cfg(not(feature = "browser_crawl"))]
    crate::cli::msvc_command::fail(format_args!(
        "Native crawl requires a runtime built with browser_crawl"
    ));
}

#[cfg(feature = "browser_crawl")]
#[cold]
fn exec() -> ! {
    let args = bun_core::os_args()
        .into_iter()
        .skip(2)
        .map(|arg| {
            arg.into_string()
                .unwrap_or_else(|_| fail("Native crawl arguments must be UTF-8"))
        })
        .collect::<Vec<_>>();
    if args.is_empty() || args.iter().any(|arg| arg == "--help" || arg == "-h") {
        crate::cli::msvc_command::out(bun_browser_crawl::cli::HELP.as_bytes());
        bun_core::Global::exit(0);
    }
    let cwd = std::env::current_dir().unwrap_or_else(|error| fail(&error.to_string()));
    let options = bun_browser_crawl::cli::parse(&args, &cwd).unwrap_or_else(|error| fail(&error));
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap_or_else(|error| fail(&error.to_string()));
    let result = runtime
        .block_on(bun_browser_crawl::cli::execute(&options))
        .unwrap_or_else(|error| fail(&error));
    let mut bytes = serde_json::to_vec(&result).unwrap_or_else(|error| fail(&error.to_string()));
    bytes.push(b'\n');
    crate::cli::msvc_command::out(&bytes);
    drop(runtime);
    bun_core::Global::exit(0);
}

#[cfg(feature = "browser_crawl")]
fn fail(message: &str) -> ! {
    crate::cli::msvc_command::fail(format_args!("{message}"))
}
