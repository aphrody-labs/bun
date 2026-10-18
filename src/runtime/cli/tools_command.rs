use bun_core::Global;
use bun_spawn::process::sync as spawn_sync;

fn installed_tool(tool: &str) -> Option<std::path::PathBuf> {
    if tool == "git" || (cfg!(windows) && tool == "rsync") || !cfg!(target_arch = "x86_64") {
        return None;
    }
    let directory =
        std::env::var_os("BUN_TOOLS_DIR").or_else(|| std::env::var_os("APHRODY_TOOLS_DIR"));
    let directory = if let Some(directory) = directory {
        let path = std::path::PathBuf::from(directory);
        if !path.is_absolute() {
            super::msvc_command::fail(format_args!(
                "BUN_TOOLS_DIR must be an absolute installation directory"
            ));
        }
        path
    } else {
        std::env::current_exe()
            .ok()?
            .parent()?
            .join("lib")
            .join("tools")
    };
    let path = directory.join(format!("{tool}{}", std::env::consts::EXE_SUFFIX));
    match std::fs::symlink_metadata(&path) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return None,
        Err(error) => {
            super::msvc_command::fail(format_args!("Installed tool metadata failed: {error}"))
        }
        Ok(_) => {}
    }
    let name = match (tool, std::env::consts::OS) {
        ("rclone", "windows") => "rclone-windows-x64.exe",
        ("rclone", "linux") => "rclone-linux-x64",
        ("rsync", "linux") => "rsync-linux-x64-musl",
        _ => return None,
    };
    let manifest: serde_json::Value = serde_json::from_str(include_str!(
        "../../../packages/bun-tools/src/tool-assets.json"
    ))
    .unwrap_or_else(|_| {
        super::msvc_command::fail(format_args!("Installed tool manifest is invalid"))
    });
    let pin = &manifest["assets"][name];
    let bytes = pin["bytes"].as_u64().unwrap_or(0);
    let hash = pin["sha256"].as_str().unwrap_or("");
    bun_system_tools::verify_installed_tool(&path, bytes, hash)
        .unwrap_or_else(|error| super::msvc_command::fail(format_args!("bun {tool}: {error}")));
    Some(path)
}

#[cold]
pub(crate) fn dispatch() {
    let args = bun_core::os_args();
    let Some(first) = args.get(1).and_then(|arg| arg.to_str()) else {
        return;
    };
    if !matches!(first, "git" | "rclone" | "rsync") {
        return;
    }
    let name = bun_paths::resolve_path::basename(args[0].as_encoded_bytes());
    let name = name.strip_suffix(b".exe").unwrap_or(name);
    if !super::msvc_command::is_bun_argv0(name)
        && !bun_core::env_var::feature_flag::BUN_BE_BUN::get().unwrap_or(false)
    {
        return;
    }
    if first == "rsync" && args.iter().skip(2).any(|arg| arg == "--native") {
        let forwarded = std::iter::once("rsync".into()).chain(args.into_iter().skip(2));
        super::plugin_command::exec("ssh", forwarded);
    }
    let override_name = match first {
        "git" => "BUN_GIT_BIN",
        "rclone" => "BUN_RCLONE_BIN",
        _ => "BUN_RSYNC_BIN",
    };
    let configured = std::env::var_os(override_name).map(std::path::PathBuf::from);
    let path = if let Some(path) = configured {
        if !path.is_absolute() || !path.is_file() {
            super::msvc_command::fail(format_args!(
                "{override_name} must identify an existing absolute executable"
            ));
        }
        Some(path)
    } else if cfg!(windows) && first == "rsync" {
        None
    } else {
        installed_tool(first).or_else(|| bun_system_tools::find(first))
    };
    if args.get(2).is_some_and(|arg| arg == "--backend-info") {
        println!(
            "{}",
            serde_json::json!({ "tool": first, "backend": "external-executable", "available": path.is_some(), "path": path })
        );
        Global::exit(0);
    }
    let Some(path) = path else {
        if args.len() == 2 || args.get(2).is_some_and(|arg| arg == "--help") {
            println!(
                "bun {first} [backend arguments]\nBackend: configured {override_name} or installed {first}. No automatic download.\nUse --backend-info to inspect the selected executable.\nNative Windows delta transfers: bun rsync --native --remote-bun /absolute/bun source host:/target"
            );
            Global::exit(0);
        }
        super::msvc_command::fail(format_args!(
            "bun {first}: backend unavailable; install it explicitly or configure {override_name}"
        ));
    };
    if std::env::current_exe()
        .ok()
        .and_then(|p| p.canonicalize().ok())
        == path.canonicalize().ok()
    {
        super::msvc_command::fail(format_args!(
            "bun {first}: backend cannot be this Bun executable"
        ));
    }
    let mut argv = vec![Box::from(path.as_os_str().as_encoded_bytes())];
    argv.extend(
        args.iter()
            .skip(2)
            .map(|arg| Box::from(arg.as_encoded_bytes())),
    );
    let result = spawn_sync::spawn(&spawn_sync::Options {
        argv,
        stdin: spawn_sync::SyncStdio::Inherit,
        stdout: spawn_sync::SyncStdio::Inherit,
        stderr: spawn_sync::SyncStdio::Inherit,
        #[cfg(windows)]
        windows: spawn_sync::WindowsOptions {
            loop_: bun_event_loop::EventLoopHandle::init_mini(
                bun_event_loop::MiniEventLoop::init_global(None, None),
            ),
            ..Default::default()
        },
        ..Default::default()
    })
    .unwrap_or_else(|err| super::msvc_command::fail(format_args!("bun {first}: {err}")))
    .unwrap_or_else(|err| super::msvc_command::fail(format_args!("bun {first}: {err}")));
    let code = match result.status {
        bun_spawn::process::Status::Exited(status) => {
            #[cfg(windows)]
            {
                status.raw
            }
            #[cfg(not(windows))]
            {
                u32::from(status.code)
            }
        }
        _ => 1,
    };
    Global::exit(code);
}
