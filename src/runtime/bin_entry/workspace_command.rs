use std::sync::{Arc, atomic::AtomicBool};

pub(super) fn dispatch() {
    let argv = bun_core::argv();
    if argv.get(1).map(bun_core::ZStr::as_bytes) != Some(b"workspace") {
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
    exec();
}

#[cold]
fn exec() -> ! {
    let args = bun_core::os_args()
        .into_iter()
        .skip(2)
        .map(|arg| {
            arg.into_string()
                .unwrap_or_else(|_| fail("workspace arguments must be valid UTF-8"))
        })
        .collect::<Vec<_>>();
    if args.is_empty() || args.iter().any(|arg| arg == "--help" || arg == "-h") {
        crate::cli::msvc_command::out(bun_workspace::cli::HELP.as_bytes());
        bun_core::Global::exit(0);
    }
    let cwd = std::env::current_dir().unwrap_or_else(|error| fail(&error.to_string()));
    if let Some(rename) = bun_workspace::cli::rename_args(&args, &cwd)
        .unwrap_or_else(|error| fail(&error.to_string()))
    {
        let executable = std::env::current_exe().unwrap_or_else(|error| fail(&error.to_string()));
        let mut child = std::process::Command::new(executable);
        child.arg("rename").args(rename).env("BUN_BE_BUN", "1");
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            child.creation_flags(0x08000000);
        }
        let status = child
            .status()
            .unwrap_or_else(|error| fail(&error.to_string()));
        bun_core::Global::exit(u32::try_from(status.code().unwrap_or(1)).unwrap_or(1));
    }
    let runtime = tokio::runtime::Builder::new_current_thread()
        .build()
        .unwrap_or_else(|error| fail(&error.to_string()));
    let result = runtime
        .block_on(bun_workspace::cli::execute(
            &args,
            &cwd,
            Arc::new(AtomicBool::new(false)),
        ))
        .unwrap_or_else(|error| fail(&error.to_string()));
    let mut output = serde_json::to_vec(&result).unwrap_or_else(|error| fail(&error.to_string()));
    output.push(b'\n');
    crate::cli::msvc_command::out(&output);
    drop(runtime);
    bun_core::Global::exit(0);
}

fn fail(message: &str) -> ! {
    crate::cli::msvc_command::fail(format_args!("{message}"))
}
