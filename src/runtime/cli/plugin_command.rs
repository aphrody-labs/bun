//! Plugins: cold fork subsystems shipped as separate executables (`bun-<name>`) instead of inside bun.
//!
//! A plugin is found next to the bun executable (local builds), else in
//! `$BUN_PLUGINS_DIR` or `$BUN_INSTALL/plugins/<name>/<version>/` (default `~/.bun/plugins`), else it is
//! downloaded once from the GitHub release of this exact bun and checked against the release's
//! `SHA256SUMS.txt`. The plugin receives the arguments bun was asked to forward and its stdio, environment
//! and exit status are bun's own.

use std::ffi::OsString;

use bun_core::{Environment, Global, MutableString, ZBox};
use bun_dotenv as DotEnv;
use bun_http as HTTP;

use super::upgrade_command::{CURRENT_RELEASE_PREFIX, UpgradeCommand, Version};

/// Every plugin the core knows how to dispatch to.
pub(crate) const PLUGINS: &[&str] = &["uv", "vpn", "ssh", "docker", "just", "winmd"];

const EXE_SUFFIX: &str = if cfg!(windows) { ".exe" } else { "" };
const ABI_SUFFIX: &str = if Environment::IS_MUSL {
    "-musl"
} else if Environment::IS_ANDROID {
    "-android"
} else {
    ""
};
/// Plugins are versioned with the exact bun that runs them.
const VERSION_DIR: &str = Global::package_json_version_with_revision;

fn fail(message: core::fmt::Arguments<'_>) -> ! {
    super::msvc_command::fail(message)
}

fn env(name: &'static bun_core::ZStr) -> Option<&'static [u8]> {
    bun_core::getenv_z(name).filter(|value| !value.is_empty())
}

fn exe_name(name: &str) -> String {
    format!("bun-{name}{EXE_SUFFIX}")
}

/// Release asset of plugin `name` for this platform, e.g. `bun-uv-windows-x64.exe`.
pub(crate) fn asset_name(name: &str) -> String {
    format!("bun-{name}-{}{ABI_SUFFIX}{EXE_SUFFIX}", Version::TRIPLET)
}

fn root() -> Vec<u8> {
    if let Some(dir) = env(bun_core::zstr!("BUN_PLUGINS_DIR")) {
        return dir.to_vec();
    }
    let mut root = match env(bun_core::zstr!("BUN_INSTALL")) {
        Some(install) => install.to_vec(),
        None => {
            let Some(home) = bun_core::env_var::HOME::get().filter(|home| !home.is_empty()) else {
                fail(format_args!(
                    "error: set BUN_INSTALL or BUN_PLUGINS_DIR: no home directory to install plugins into"
                ));
            };
            let mut dir = home.to_vec();
            dir.extend_from_slice(bun_paths::SEP_STR.as_bytes());
            dir.extend_from_slice(b".bun");
            dir
        }
    };
    root.extend_from_slice(bun_paths::SEP_STR.as_bytes());
    root.extend_from_slice(b"plugins");
    root
}

fn join(parts: &[&[u8]]) -> Vec<u8> {
    parts.join(bun_paths::SEP_STR.as_bytes())
}

fn installed_dir(name: &str) -> Vec<u8> {
    join(&[&root(), name.as_bytes(), VERSION_DIR.as_bytes()])
}

/// Where plugin `name` already is, if anywhere.
pub(crate) fn locate(name: &str) -> Option<Vec<u8>> {
    // An explicit plugin directory is the only place looked at, so a test or a sandbox is not
    // shadowed by the plugins built next to the executable.
    if env(bun_core::zstr!("BUN_PLUGINS_DIR")).is_none() {
        if let Some(dir) = bun_core::self_exe_path()
            .ok()
            .and_then(|exe| bun_paths::dirname(exe.as_bytes()))
        {
            let sibling = join(&[dir, exe_name(name).as_bytes()]);
            if bun_sys::exists(&sibling) {
                return Some(sibling);
            }
        }
    }
    let path = join(&[&installed_dir(name), exe_name(name).as_bytes()]);
    bun_sys::exists(&path).then_some(path)
}

/// Release directories to fetch from, most specific first.
fn release_bases(env_loader: &DotEnv::Loader) -> Vec<String> {
    if let Some(base) = env(bun_core::zstr!("BUN_PLUGIN_RELEASE_URL")) {
        return vec![
            String::from_utf8_lossy(base)
                .trim_end_matches('/')
                .to_owned(),
        ];
    }
    let repo = String::from_utf8_lossy(UpgradeCommand::repo(env_loader)).into_owned();
    let mut tags = vec![format!(
        "{CURRENT_RELEASE_PREFIX}{}",
        Global::display_version
    )];
    if Environment::GIT_SHA.len() >= 12 {
        tags.push(format!("main-runtime-{}", &Environment::GIT_SHA[..12]));
    }
    tags.into_iter()
        .map(|tag| format!("https://github.com/{repo}/releases/download/{tag}"))
        .collect()
}

fn get(env_loader: &DotEnv::Loader, url: &str, capacity: usize) -> Option<&'static [u8]> {
    let body: &'static mut MutableString = super::cli_arena().alloc(
        MutableString::init(capacity)
            .unwrap_or_else(|_| fail(format_args!("error: out of memory"))),
    );
    let status = UpgradeCommand::http_get(
        env_loader,
        super::cli_dupe(url.as_bytes()),
        false,
        None,
        body,
    )
    .unwrap_or_else(|error| fail(format_args!("error: GET {url}: {}", error.name())));
    match status {
        200 => Some(body.slice()),
        404 => None,
        status => fail(format_args!("error: GET {url}: HTTP {status}")),
    }
}

/// Download plugin `name` for this bun, verify it, install it and return its path.
pub(crate) fn fetch(name: &str) -> Vec<u8> {
    if env(bun_core::zstr!("BUN_PLUGIN_NO_DOWNLOAD")).is_some_and(|value| value != b"0") {
        fail(format_args!(
            "error: plugin \"{name}\" is not installed and BUN_PLUGIN_NO_DOWNLOAD is set\nnote: install it with `bun plugin install {name}`"
        ));
    }
    HTTP::http_thread::init(&Default::default());
    let mut env_loader = DotEnv::Loader::init();
    env_loader
        .load_process()
        .unwrap_or_else(|error| fail(format_args!("error: {error:?}")));
    let asset = asset_name(name);
    let mut found = None;
    for base in release_bases(&env_loader) {
        let Some(sums) = get(&env_loader, &format!("{base}/SHA256SUMS.txt"), 4096) else {
            continue;
        };
        let Some(digest) = Version::digest_from_sums(sums, asset.as_bytes()) else {
            continue;
        };
        let url = format!("{base}/{asset}");
        let Some(bytes) = get(&env_loader, &url, 1 << 20) else {
            fail(format_args!(
                "error: {url} is listed in SHA256SUMS.txt but missing"
            ));
        };
        if !digest.verify(bytes) {
            fail(format_args!(
                "error: {url} does not match its SHA256SUMS.txt entry"
            ));
        }
        found = Some(bytes);
        break;
    }
    let Some(bytes) = found else {
        fail(format_args!(
            "error: no release of bun {} provides plugin \"{name}\" ({asset})\nnote: build it from its submodule (`git submodule update --init --checkout --recursive plugins/{name}`, then `bun bd --target=plugins`) and put {} next to bun",
            Global::package_json_version_with_revision,
            exe_name(name)
        ));
    };

    // Older versions of this plugin belong to older bun builds.
    let plugin_root = join(&[&root(), name.as_bytes()]);
    let _ = bun_sys::Dir::cwd().delete_tree(&plugin_root);
    let dir = installed_dir(name);
    if let Err(error) = bun_sys::Dir::cwd().make_path(&dir) {
        fail(format_args!(
            "error: create {}: {}",
            bstr::BStr::new(&dir),
            bstr::BStr::new(error.name())
        ));
    }
    let final_path = join(&[&dir, exe_name(name).as_bytes()]);
    let mut partial = final_path.clone();
    partial.extend_from_slice(b".partial");
    let partial_z = ZBox::from_bytes(&partial);
    let final_z = ZBox::from_bytes(&final_path);
    let result = bun_sys::File::write_file(bun_sys::Fd::cwd(), partial_z.as_zstr(), bytes)
        .and_then(|()| {
            #[cfg(unix)]
            bun_sys::chmod(partial_z.as_zstr(), 0o755)?;
            Ok(())
        })
        .and_then(|()| bun_sys::rename(partial_z.as_zstr(), final_z.as_zstr()));
    if let Err(error) = result {
        fail(format_args!(
            "error: install {}: {}",
            bstr::BStr::new(&final_path),
            bstr::BStr::new(error.name())
        ));
    }
    final_path
}

/// Run plugin `name` with `args` in place of bun; never returns.
#[cold]
pub(crate) fn exec(name: &str, args: impl IntoIterator<Item = OsString>) -> ! {
    let path = locate(name).unwrap_or_else(|| fetch(name));
    let path = std::path::PathBuf::from(String::from_utf8_lossy(&path).into_owned());
    // std quotes each `OsString` for CreateProcessW and, on unix, `exec` keeps bun's pid, so signals and
    // job control reach the plugin directly.
    let mut command = std::process::Command::new(&path);
    command.args(args);
    // Plugins that run Bun again (Bun Shell recipes of `bun just`) use this bun, not one from PATH.
    if let Ok(host) = bun_core::self_exe_path() {
        command.env(
            "BUN_PLUGIN_HOST",
            String::from_utf8_lossy(host.as_bytes()).as_ref(),
        );
    }
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        let error = command.exec();
        fail(format_args!("error: run {}: {error}", path.display()));
    }
    #[cfg(not(unix))]
    {
        let status = command
            .status()
            .unwrap_or_else(|error| fail(format_args!("error: run {}: {error}", path.display())));
        Global::exit(status.code().map_or(1, |code| code as u32));
    }
}

pub(crate) struct Invocation;

impl Invocation {
    pub(crate) fn from_argv(
        argv0: &[u8],
        first_arg: Option<&[u8]>,
        be_bun: impl FnOnce() -> bool,
    ) -> Option<Self> {
        if first_arg != Some(b"plugin") {
            return None;
        }
        let name = bun_paths::resolve_path::basename(argv0);
        let name = name.strip_suffix(b".exe").unwrap_or(name);
        (super::msvc_command::is_bun_argv0(name) || be_bun()).then_some(Self)
    }
}

const HELP: &str = "Usage: bun plugin <list|install|remove> [name...]\n\n\
Plugins are parts of bun built as separate executables and fetched on first use.\n\n\
  list             Show every plugin and where it is installed\n\
  install <name>   Download the plugin matching this bun\n\
  remove <name>    Delete the downloaded plugin\n";

fn known(name: &str) -> &str {
    PLUGINS
        .iter()
        .copied()
        .find(|plugin| *plugin == name)
        .unwrap_or_else(|| {
            fail(format_args!(
                "error: unknown plugin \"{name}\" (known: {})",
                PLUGINS.join(", ")
            ))
        })
}

/// `bun plugin list|install|remove`.
#[cold]
pub(crate) fn command(_: Invocation) -> ! {
    let args: Vec<String> = bun_core::os_args()
        .into_iter()
        .skip(2)
        .map(|arg| arg.to_string_lossy().into_owned())
        .collect();
    let (action, names) = args
        .split_first()
        .map_or(("", &[][..]), |(a, rest)| (a.as_str(), rest));
    let mut out = String::new();
    match action {
        "list" | "ls" => {
            for name in PLUGINS {
                match locate(name) {
                    Some(path) => {
                        out.push_str(&format!("{name}\t{}\n", String::from_utf8_lossy(&path)))
                    }
                    None => out.push_str(&format!("{name}\tnot installed\n")),
                }
            }
        }
        "install" | "add" if !names.is_empty() => {
            for name in names {
                let name = known(name);
                let path = locate(name).unwrap_or_else(|| fetch(name));
                out.push_str(&format!("{name}\t{}\n", String::from_utf8_lossy(&path)));
            }
        }
        "remove" | "rm" if !names.is_empty() => {
            for name in names {
                let name = known(name);
                let dir = join(&[&root(), name.as_bytes()]);
                let _ = bun_sys::Dir::cwd().delete_tree(&dir);
                out.push_str(&format!("{name}\tremoved\n"));
            }
        }
        "" | "help" | "--help" | "-h" => {
            super::msvc_command::out(HELP.as_bytes());
            Global::exit(0);
        }
        _ => fail(format_args!("{HELP}")),
    }
    super::msvc_command::out(out.as_bytes());
    Global::exit(0);
}
