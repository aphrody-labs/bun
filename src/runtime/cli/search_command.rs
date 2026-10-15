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
        Some(aphrody_google::search::cli::main(
            args.into_iter().skip(2).collect(),
        ))
    }
    #[cfg(not(feature = "google_search"))]
    {
        if args
            .iter()
            .skip(2)
            .any(|arg| arg == "--help" || arg == "-h")
        {
            print!(
                "{}",
                include_str!(
                    "../../../packages/bun-google/aphrody/crates/google/src/search/help.txt"
                )
            );
            println!("This build requires --google-search=on to execute searches.");
            Some(0)
        } else {
            eprintln!("bun search requires a build with --google-search=on");
            Some(2)
        }
    }
}
