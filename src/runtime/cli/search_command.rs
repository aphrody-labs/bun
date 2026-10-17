//! `bun search`: the optional canonical Rust Google Search owner, before VM startup.

pub(crate) fn dispatch() -> Option<i32> {
    let args = bun_core::os_args();
    if args.get(1)?.to_str() != Some("search") {
        return None;
    }
    let program = args.first()?.to_str()?.as_bytes();
    let name = program
        .rsplit(|byte| matches!(*byte, b'/' | b'\\'))
        .next()?;
    let name = name.strip_suffix(b".exe").unwrap_or(name);
    if !super::msvc_command::is_bun_argv0(name)
        && !bun_core::env_var::feature_flag::BUN_BE_BUN::get().unwrap_or(false)
    {
        return None;
    }
    #[cfg(feature = "google_search")]
    {
        Some(bun_google::search::cli::main(
            args.into_iter().skip(2).collect(),
        ))
    }
    #[cfg(not(feature = "google_search"))]
    {
        use bun_sys::{Fd, File};

        if args
            .iter()
            .skip(2)
            .any(|arg| arg == "--help" || arg == "-h")
        {
            let _ = File::stdout().write_all(
                include_str!(
                    "../../../packages/bun-google/aphrody/crates/google/src/search/help.txt"
                )
                .as_bytes(),
            );
            let _ = File::stdout()
                .write_all(b"This build requires --google-search=on to execute searches.\n");
            Some(0)
        } else {
            let _ = File::from_fd(Fd::stderr())
                .write_all(b"bun search requires a build with --google-search=on\n");
            Some(2)
        }
    }
}
