//! `bun dotnet setup|env|sync|info|resolve`: .NET install management without the SDK, a
//! script or a child process. Discovery and selection live in `bun-dotnet-host`
//! (`inventory`, `select`, `env`, `info`, `releases`); downloads, SHA-512 and extraction use
//! Bun's HTTP client, BoringSSL and libarchive.

use std::path::{Path, PathBuf};

use bun_dotnet_host::releases::{self, Asset, Product};
use bun_dotnet_host::{env, info, inventory, select};
use bun_dotnet_host::serde_json;
use bun_install::system::{archive, fs as sysfs, hex, join, net};

pub(crate) const COMMANDS: [&str; 5] = ["setup", "env", "sync", "info", "resolve"];

const USAGE: &str = "\
Usage:
  bun dotnet setup [--channel <A.B|A.B.Cxx|LTS|STS|latest>] [--version <x.y.z>]
                   [--runtime <dotnet|aspnetcore|windowsdesktop>] [--install-dir <dir>]
                   [--arch <x64|x86|arm64>] [--force] [--dry-run] [--json]
  bun dotnet env   [--shell <cmd|ps1|sh|json>] [--refresh]
  bun dotnet sync  [--json]
  bun dotnet info  [--json]
  bun dotnet resolve [<app>.runtimeconfig.json] [--json]
";

struct Args {
    flags: Vec<(String, Option<String>)>,
    positional: Vec<String>,
}

const VALUED: [&str; 7] = ["--channel", "--version", "--runtime", "--install-dir", "--arch", "--shell", "--feed"];

impl Args {
    fn parse(args: &[String]) -> Result<Self, String> {
        let mut flags = Vec::new();
        let mut positional = Vec::new();
        let mut iter = args.iter();
        while let Some(arg) = iter.next() {
            let equals = bun_core::strings::index_of_char_usize(arg.as_bytes(), b'=').filter(|_| arg.starts_with("--"));
            if let Some(index) = equals {
                flags.push((arg[..index].to_owned(), Some(arg[index + 1..].to_owned())));
            } else if VALUED.contains(&arg.as_str()) {
                let value = iter.next().ok_or_else(|| format!("{arg} needs a value"))?;
                flags.push((arg.clone(), Some(value.clone())));
            } else if arg.starts_with('-') {
                flags.push((arg.clone(), None));
            } else {
                positional.push(arg.clone());
            }
        }
        Ok(Self { flags, positional })
    }

    fn has(&self, name: &str) -> bool {
        self.flags.iter().any(|(flag, _)| flag == name)
    }

    fn value(&self, name: &str) -> Option<&str> {
        self.flags.iter().rev().find(|(flag, _)| flag == name).and_then(|(_, value)| value.as_deref())
    }
}

fn cwd() -> PathBuf {
    std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
}

fn out(text: &str) {
    bun_core::Output::print(format_args!("{text}"));
    bun_core::Output::flush();
}

/// Runs `bun dotnet <command> <args>` and returns the exit code.
pub(crate) fn run(command: &str, args: &[String]) -> i32 {
    let args = match Args::parse(args) {
        Ok(args) => args,
        Err(message) => return fail(&message),
    };
    if args.has("--help") || args.has("-h") {
        out(USAGE);
        return 0;
    }
    let result = match command {
        "setup" => setup(&args),
        "env" => env_command(&args),
        "sync" => sync(&args),
        "info" => {
            let info = info::collect(&cwd());
            out(&if args.has("--json") { format!("{:#}\n", info.to_json()) } else { info.to_text() });
            Ok(())
        }
        "resolve" => resolve(&args),
        _ => Err(USAGE.to_owned()),
    };
    match result {
        Ok(()) => 0,
        Err(message) => fail(&message),
    }
}

fn fail(message: &str) -> i32 {
    bun_core::pretty_errorln!("<r><red>error<r>: bun dotnet: {}", message);
    1
}

fn env_command(args: &Args) -> Result<(), String> {
    let shell = match args.value("--shell") {
        Some(name) => env::Shell::parse(name).ok_or_else(|| format!("unknown shell '{name}' (cmd, ps1, sh, json)"))?,
        None => env::Shell::default_for_platform(),
    };
    let (snapshot, _) = env::load(&cwd(), args.has("--refresh")).map_err(|err| err.message)?;
    out(&env::render(&snapshot, shell));
    Ok(())
}

fn sync(args: &Args) -> Result<(), String> {
    let (snapshot, _) = env::load(&cwd(), true).map_err(|err| err.message)?;
    if args.has("--json") {
        out(&env::render(&snapshot, env::Shell::Json));
        return Ok(());
    }
    let sdk = match (&snapshot.sdk, &snapshot.sdk_error) {
        (Some((version, _)), _) => version.clone(),
        (None, Some(error)) => format!("none ({error})"),
        (None, None) => "none".to_owned(),
    };
    out(&format!(
        "DOTNET_ROOT {} ({})\nSDK         {sdk}\ncache       {}\n",
        snapshot.dotnet_root.display(),
        snapshot.source,
        env::cache_dir().map_or_else(|| "disabled".to_owned(), |dir| dir.display().to_string()),
    ));
    Ok(())
}

/// The SDK `cwd` selects, or with `runtimeconfig` the frameworks an app binds to, as JSON.
pub(crate) fn resolve_json(runtimeconfig: Option<&Path>, cwd: &Path) -> Result<serde_json::Value, String> {
    let location = bun_dotnet_host::locate(None).map_err(|err| err.message)?;
    let root = inventory::canonical(&location.dotnet_root).unwrap_or(location.dotnet_root);
    let install = inventory::scan_root(&root, location.source.as_str().to_owned())
        .ok_or_else(|| format!("{} holds no .NET install", root.display()))?;
    Ok(match runtimeconfig {
        Some(config) => select::resolve_app(&install, config, &select::RollForwardEnv::from_process())?,
        None => {
            let resolution = select::resolve_sdk(&install.root, cwd);
            serde_json::json!({
                "dotnetRoot": install.root,
                "globalJson": resolution.request.global_json,
                "sdk": resolution.selected.as_ref().map(|c| serde_json::json!({ "version": c.version.as_str(), "path": c.path })),
                "error": resolution.error,
            })
        }
    })
}

fn resolve(args: &Args) -> Result<(), String> {
    let value = resolve_json(args.positional.first().map(Path::new), &cwd())?;
    if args.has("--json") {
        out(&format!("{value:#}\n"));
        return Ok(());
    }
    if let Some(frameworks) = value.get("frameworks").and_then(serde_json::Value::as_array) {
        let mut missing = false;
        for framework in frameworks {
            let text = |key: &str| framework.get(key).and_then(serde_json::Value::as_str).unwrap_or("").to_owned();
            match framework.pointer("/resolved/version").and_then(serde_json::Value::as_str) {
                Some(version) => out(&format!("{} {} -> {version}\n", text("name"), text("requested"))),
                None => {
                    missing = true;
                    out(&format!("{} {} -> not found (rollForward {})\n", text("name"), text("requested"), text("rollForward")));
                }
            }
        }
        return if missing { Err("a framework is missing; install it with `bun dotnet setup --runtime …`".into()) } else { Ok(()) };
    }
    match value.pointer("/sdk/version").and_then(serde_json::Value::as_str) {
        Some(version) => {
            out(&format!("{version}\n"));
            Ok(())
        }
        None => Err(value.get("error").and_then(serde_json::Value::as_str).unwrap_or("no .NET SDK found").to_owned()),
    }
}

fn sha512_hex(bytes: &[u8]) -> String {
    use bun_sha_hmac::sha;
    let mut hasher = sha::SHA512::init();
    hasher.update(bytes);
    let mut digest = [0u8; sha::SHA512::DIGEST];
    hasher.r#final(&mut digest);
    hex(&digest)
}

fn asset_json(asset: &Asset, install_dir: &Path, status: &str) -> serde_json::Value {
    serde_json::json!({
        "product": asset.product.as_str(),
        "version": asset.version,
        "rid": asset.rid,
        "name": asset.name,
        "url": asset.url,
        "sha512": asset.hash,
        "installDir": install_dir,
        "status": status,
    })
}

fn setup(args: &Args) -> Result<(), String> {
    let product = Product::parse_runtime(args.value("--runtime"))
        .ok_or_else(|| format!("unknown --runtime '{}' (dotnet, aspnetcore, windowsdesktop)", args.value("--runtime").unwrap_or("")))?;
    let rid = match args.value("--arch") {
        Some(arch) => releases::rid_for(arch),
        None => releases::host_rid(),
    };
    let install_dir = match args.value("--install-dir") {
        Some(dir) => std::path::absolute(dir).map_err(|error| format!("{dir}: {error}"))?,
        None => inventory::default_install_dir().ok_or("no default install directory; pass --install-dir")?,
    };
    let mut loader = bun_dotenv::Loader::init();
    loader.quiet = true;
    loader.load_process().map_err(|_| "out of memory".to_owned())?;
    let feed = match (args.value("--feed"), loader.get(b"BUN_DOTNET_FEED").filter(|feed| !feed.is_empty())) {
        (Some(feed), _) => feed.to_owned(),
        (None, Some(feed)) => bstr::BStr::new(feed).to_string(),
        (None, None) => releases::DEFAULT_FEED.to_owned(),
    };
    let mut fetch = |url: &str| net::get(&loader, url).map_err(|err| err.to_string());
    let asset = releases::resolve_asset(&feed, args.value("--channel"), args.value("--version"), product, &rid, &mut fetch)?;
    let json = args.has("--json");
    let report = |status: &str| {
        if json {
            out(&format!("{:#}\n", asset_json(&asset, &install_dir, status)));
        } else {
            out(&format!(
                "{status}: .NET {} {} ({}) in {}\n",
                asset.product.as_str(),
                asset.version,
                asset.rid,
                install_dir.display()
            ));
        }
    };
    if args.has("--dry-run") {
        report("planned");
        return Ok(());
    }
    if install_dir.join(product.installed_dir(&asset.version)).is_dir() && !args.has("--force") {
        report("already installed");
        return Ok(());
    }
    if asset.url.is_empty() || asset.hash.is_empty() {
        return Err(format!("{} has no url or hash in the release metadata", asset.name));
    }
    if !json {
        out(&format!("Downloading {}\n", asset.url));
    }
    let bytes = net::get(&loader, &asset.url).map_err(|err| err.to_string())?;
    let actual = sha512_hex(&bytes);
    if actual != asset.hash {
        return Err(format!("integrity check failed for {}: expected sha512 {}, got {actual}", asset.name, asset.hash));
    }
    extract(&bytes, &asset.name, &install_dir, args.has("--force"))?;
    report("installed");
    Ok(())
}

/// Extracts every entry under `dir`. Existing files are kept unless `force` (shared files such
/// as `dotnet.exe` and `host/fxr` come in every archive; `dotnet-install` keeps them too).
fn extract(bytes: &[u8], what: &str, dir: &Path, force: bool) -> Result<(), String> {
    let base = dir.to_string_lossy().into_owned().into_bytes();
    sysfs::mkdir_p(&base).map_err(|err| err.to_string())?;
    archive::for_each(bytes, what, &mut |item| {
        let Some(relative) = archive::safe_relative(item.path) else {
            if item.is_dir {
                return Ok(true);
            }
            return Err(bun_install::system::Error::Parse(format!(
                "{what}: unsafe entry path \"{}\"",
                bstr::BStr::new(item.path)
            )));
        };
        let path = join(&base, &[&relative]);
        if item.is_dir {
            sysfs::mkdir_p(&path)?;
            return Ok(true);
        }
        if !force && bun_sys::exists(&path) {
            return Ok(true);
        }
        sysfs::write(&path, &item.data)?;
        #[cfg(unix)]
        if is_executable(&item.data) {
            let z = sysfs::zpath(&path);
            let _ = bun_sys::chmod(bun_core::ZStr::from_buf(&z, path.len()), 0o755);
        }
        Ok(true)
    })
    .map_err(|err| err.to_string())
}

#[cfg(unix)]
fn is_executable(data: &[u8]) -> bool {
    data.starts_with(b"\x7fELF")
        || data.starts_with(b"#!")
        || data.starts_with(&[0xcf, 0xfa, 0xed, 0xfe])
        || data.starts_with(&[0xca, 0xfe, 0xba, 0xbe])
}
