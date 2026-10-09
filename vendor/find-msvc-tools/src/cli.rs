//! Bun addition: the `bun msvc` command line, shared by bun (`bun msvc ...`) and the `bun-msvc`
//! binary of this crate (which `scripts/build.ts` runs when the bun building Bun has no `msvc`).

use std::ffi::OsString;
use std::io::Write;
use std::path::PathBuf;

use crate::json::{Value, Writer};
use crate::setup::{self, Outcome, SetupOptions};
use crate::sync;
use crate::toolchain::{self, Options, Toolchain};

pub const HELP: &str = "\
Usage: bun msvc <command> [options]

Resolve, set up and cache the native Windows toolchain: every Visual Studio 2017+ / Build Tools
instance (Setup Configuration COM, installer records, registry, environment, default folders),
every MSVC toolset, Windows SDK, Universal CRT and .NET Framework SDK, the developer scripts and
the vcvarsall environment, computed without vswhere.exe or any .bat file.

Commands:
  doctor                      Check the toolchain (default); exit code 1 if cl, link or the SDK is missing
  info                        Everything as JSON (instances, toolsets, sdks, msvc, sdk, ucrt, netfx, llvm,
                              scripts, tools, env, paths)
  list [--json]               Instances with their toolsets, Windows SDKs, .NET Framework SDKs
  env [--format <f>]          The vcvarsall environment: json (default), pwsh, cmd, sh, github
  which <tool>...             Path of cl, link, lib, dumpbin, rc, midl, mt, clang-cl, cmake, ninja, ...
  exec [--] <tool> [args...]  Run a tool with the computed environment
  sync [--check] [--force]    Cache env.json/env.cmd/env.ps1/env.sh, rewritten when an instance,
                              toolset or SDK changes; prints the cache directory
  setup [--dry-run]           Install or complete the C++ tools, the SDK and the requested toolset
                              (Visual Studio Installer, or winget when nothing is installed)
  msi [--fix]                 Orphaned Windows Installer products (cached .msi gone: errors 1714/1612)

Selection:
  --arch <arch>               Target: x64, x86, arm64, arm64ec, arm (default: host)
  --host <arch>               Host architecture of the tools (default: native)
  --instance <q>              Instance id, path, product (BuildTools), year (2026) or version (17.14)
  --toolset <v>               MSVC toolset: exact, prefix (14.44) or alias (v143); alias --vcvars-ver
  --sdk <v>                   Windows SDK version or prefix (10.0.26100)
  --spectre                   Spectre-mitigated libraries

Setup:
  --repair                    Repair the instance
  --update                    Update the instance
  --add <component>           Add an installer component or workload (repeatable)
  --product <p>               Product to install when none is: buildtools (default), community, ...
  --fix-msi-orphans           Remove orphaned MSI registrations before running the installer
  --dry-run                   Print the commands instead of running them

Sync and msi:
  --cache-dir <dir>           Cache root (default: %LOCALAPPDATA%\\bun\\msvc)
  --check                     Exit code 1 when the cache is missing or stale, without writing
  --force                     Rewrite the cache even when it is fresh
  --fix                       Remove the orphaned registrations (backed up with reg.exe export)
  --json                      JSON output
";

#[derive(Default)]
struct Args {
    command: String,
    options: Options,
    format: Option<String>,
    json: bool,
    dry_run: bool,
    repair: bool,
    update: bool,
    add: Vec<String>,
    product: Option<String>,
    fix: bool,
    fix_orphans: bool,
    check: bool,
    force: bool,
    cache_dir: Option<PathBuf>,
    backup_dir: Option<PathBuf>,
    rest: Vec<OsString>,
}

fn parse(args: Vec<OsString>) -> Result<Args, String> {
    let mut parsed = Args::default();
    let mut iter = args.into_iter();
    while let Some(arg) = iter.next() {
        // `exec` and `which`: the first positional and everything after it are the command.
        if parsed.command == "exec" && !parsed.rest.is_empty() {
            parsed.rest.push(arg);
            continue;
        }
        let text = arg.to_string_lossy().into_owned();
        let (flag, inline) = match text.split_once('=') {
            Some((flag, value)) if flag.starts_with("--") => (flag.to_owned(), Some(value.to_owned())),
            _ => (text.clone(), None),
        };
        let mut value = |name: &str| -> Result<String, String> {
            match inline.clone() {
                Some(value) => Ok(value),
                None => iter
                    .next()
                    .map(|v| v.to_string_lossy().into_owned())
                    .ok_or_else(|| format!("{name} needs a value")),
            }
        };
        match flag.as_str() {
            "--" => {
                parsed.rest.extend(iter.by_ref());
                break;
            }
            "--arch" => parsed.options.arch = Some(value("--arch")?),
            "--host" => parsed.options.host = Some(value("--host")?),
            "--instance" => parsed.options.instance = Some(value("--instance")?),
            "--toolset" | "--vcvars-ver" | "--vcvars_ver" | "-vcvars_ver" => {
                parsed.options.toolset = Some(value("--toolset")?)
            }
            "--sdk" => parsed.options.sdk = Some(value("--sdk")?),
            "--spectre" => parsed.options.spectre = true,
            "--format" => parsed.format = Some(value("--format")?),
            "--json" => parsed.json = true,
            "--dry-run" => parsed.dry_run = true,
            "--repair" => parsed.repair = true,
            "--update" => parsed.update = true,
            "--add" => parsed.add.push(value("--add")?),
            "--product" => parsed.product = Some(value("--product")?),
            "--fix" => parsed.fix = true,
            "--fix-msi-orphans" => parsed.fix_orphans = true,
            "--check" => parsed.check = true,
            "--force" => parsed.force = true,
            "--cache-dir" => parsed.cache_dir = Some(PathBuf::from(value("--cache-dir")?)),
            "--backup-dir" => parsed.backup_dir = Some(PathBuf::from(value("--backup-dir")?)),
            "-h" | "--help" => parsed.command = "help".into(),
            _ if flag.starts_with("--") => return Err(format!("unknown option: {flag}")),
            _ if parsed.command.is_empty() => parsed.command = text,
            _ => parsed.rest.push(arg),
        }
    }
    if parsed.json && parsed.format.is_none() {
        parsed.format = Some("json".into());
    }
    Ok(parsed)
}

fn out(text: &str) {
    let mut stdout = std::io::stdout().lock();
    let _ = stdout.write_all(text.as_bytes());
    let _ = stdout.flush();
}

fn err(text: &str) {
    let _ = writeln!(std::io::stderr().lock(), "{text}");
}

fn fail(message: &str) -> i32 {
    err(&format!("error: {message}"));
    1
}

/// Runs `bun msvc <args>`; returns the exit code. `self_args` re-invokes this command
/// (`["msvc"]` for bun, `[]` for `bun-msvc`) when `msi --fix` needs to elevate.
pub fn main(args: Vec<OsString>, self_args: &[&str]) -> i32 {
    let args = match parse(args) {
        Ok(args) => args,
        Err(message) => return fail(&message),
    };
    match args.command.as_str() {
        "help" => {
            out(HELP);
            0
        }
        "" | "doctor" => doctor(&args),
        "info" => {
            out(&format!("{}\n", toolchain::report(&args.options)));
            0
        }
        "list" | "ls" => list(&args),
        "env" => with_toolchain(&args, |t| env(t, args.format.as_deref().unwrap_or("json"))),
        "which" => with_toolchain(&args, |t| which(t, &args.rest)),
        "exec" => with_toolchain(&args, |t| exec(t, &args.rest)),
        "sync" => sync_command(&args),
        "setup" | "install" => setup_command(&args),
        "msi" => msi_command(&args, self_args),
        other => {
            out(HELP);
            fail(&format!("unknown command: {other}"))
        }
    }
}

fn with_toolchain(args: &Args, run: impl FnOnce(&Toolchain) -> i32) -> i32 {
    match toolchain::resolve(&args.options) {
        Ok(toolchain) => run(&toolchain),
        Err(message) => fail(&format!("{message} (run `bun msvc setup`)")),
    }
}

fn toolset_label(toolset: &toolchain::Toolset) -> String {
    let mut tags: Vec<String> = Vec::new();
    if toolset.default {
        tags.push("default".into());
    }
    tags.extend(toolset.aliases.iter().filter(|a| a.as_str() != "default").cloned());
    if tags.is_empty() {
        toolset.version.clone()
    } else {
        format!("{} ({})", toolset.version, tags.join(", "))
    }
}

fn instance_label(instance: &toolchain::Instance) -> String {
    let title = instance
        .title
        .clone()
        .unwrap_or_else(|| format!("{} {}", instance.product(), instance.year().map_or(String::new(), |y| y.to_string())));
    let version = match &instance.display_version {
        Some(display) => format!("{display} ({})", instance.version),
        None => instance.version.clone(),
    };
    format!("{} {version}", title.trim())
}

fn doctor(args: &Args) -> i32 {
    let native = toolchain::host().unwrap_or("x64");
    let resolved = toolchain::resolve(&args.options);
    let arch = match &resolved {
        Ok(t) => t.arch,
        Err(_) => args.options.arch.as_deref().and_then(toolchain::normalize_arch).unwrap_or(native),
    };
    let mut report = format!("bun msvc doctor: target {arch}, host {native}\n");
    let mut ok = true;
    let mut line = |status: &str, label: &str, detail: String| {
        report.push_str(&format!("  {status:<8}{label:<16}{detail}\n"));
    };
    let instances = toolchain::instances();
    if instances.is_empty() {
        line("missing", "Visual Studio", "no instance (run `bun msvc setup`)".into());
    }
    for instance in &instances {
        line(
            "found",
            "Visual Studio",
            format!("{} at {} [{}]", instance_label(instance), instance.path.display(), instance.sources.join(", ")),
        );
        if instance.reboot_required == Some(true) {
            line("warn", "", "a restart is pending to finish its last install".into());
        } else if instance.complete == Some(false) {
            line("warn", "", "its last install did not finish (run `bun msvc setup`)".into());
        }
        let toolsets = instance.toolsets();
        if !toolsets.is_empty() {
            line("", "", format!("toolsets: {}", toolsets.iter().map(toolset_label).collect::<Vec<_>>().join(", ")));
        }
    }
    match &resolved {
        Ok(t) => {
            line(
                "ok",
                "MSVC",
                format!("{} ({}) from {}", t.toolset.version, t.vc_bin.display(), t.instance.path.display()),
            );
            for tool in ["cl", "link", "lib", "ml64", "rc", "mt", "midl", "nmake", "cmake", "ninja"] {
                let found = t.which(tool);
                let required = matches!(tool, "cl" | "link" | "lib" | "rc");
                ok &= found.is_some() || !required;
                let status = if found.is_some() {
                    "ok"
                } else if required {
                    "missing"
                } else {
                    "absent"
                };
                line(status, &format!("{tool}.exe"), found.map_or_else(String::new, |p| p.display().to_string()));
            }
            match &t.sdk {
                Some(sdk) => {
                    line(
                        if sdk.complete { "ok" } else { "warn" },
                        "Windows SDK",
                        format!("{} ({})", sdk.version, sdk.dir.display()),
                    );
                    let winmd = sdk.windows_winmd();
                    line(
                        if winmd.is_some() { "ok" } else { "absent" },
                        "Windows.winmd",
                        winmd.map_or_else(String::new, |p| p.display().to_string()),
                    );
                }
                None => {
                    ok = false;
                    line("missing", "Windows SDK", "(run `bun msvc setup`)".into());
                }
            }
            match &t.ucrt {
                Some(ucrt) => line("ok", "UCRT", format!("{} ({})", ucrt.version, ucrt.dir.display())),
                None => {
                    ok = false;
                    line("missing", "UCRT", String::new());
                }
            }
            match &t.netfx {
                Some(netfx) => line("ok", ".NET FX SDK", format!("{} ({})", netfx.version, netfx.dir.display())),
                None => line("absent", ".NET FX SDK", String::new()),
            }
            match &t.llvm {
                Some(llvm) => line(
                    "ok",
                    "LLVM",
                    format!("{} ({})", llvm.version.as_deref().unwrap_or("?"), llvm.clang_cl.display()),
                ),
                None => line("absent", "LLVM", "clang-cl is not installed with this instance".into()),
            }
            for (name, path) in t.instance.scripts() {
                if matches!(name.as_str(), "vcvarsall" | "VsDevCmd" | "Launch-VsDevShell" | "vswhere" | "setup") {
                    line("ok", &name, path.display().to_string());
                }
            }
        }
        Err(message) => {
            ok = false;
            line("missing", "MSVC", format!("{message} (run `bun msvc setup`)"));
        }
    }
    let sdks = toolchain::windows_sdks();
    if sdks.len() > 1 {
        line(
            "",
            "Windows SDKs",
            sdks.iter()
                .map(|s| if s.complete { s.version.clone() } else { format!("{} (incomplete)", s.version) })
                .collect::<Vec<_>>()
                .join(", "),
        );
    }
    let orphans = setup::msi_orphans();
    if orphans.is_empty() {
        line("ok", "MSI cache", "no orphaned toolchain product".into());
    } else {
        line(
            "warn",
            "MSI cache",
            format!(
                "{} orphaned product(s), the installer may fail with 1714/1612 (run `bun msvc msi --fix`): {}",
                orphans.len(),
                orphans.iter().map(|o| o.name.as_str()).collect::<Vec<_>>().join("; ")
            ),
        );
    }
    out(&report);
    if ok {
        0
    } else {
        1
    }
}

fn list(args: &Args) -> i32 {
    if args.format.as_deref() == Some("json") {
        let report = toolchain::report(&args.options);
        let Some(value) = Value::parse(&report) else {
            return fail("internal error: invalid report");
        };
        let mut w = Writer::new();
        w.begin_object();
        for key in ["instances", "sdks", "netfxSdks"] {
            w.key(key);
            value.get(key).unwrap_or(&Value::Null).write(&mut w);
        }
        w.end_object();
        out(&format!("{}\n", w.finish()));
        return 0;
    }
    let mut text = String::new();
    for instance in toolchain::instances() {
        text.push_str(&format!(
            "{}\n  path     {}\n  id       {} [{}]\n",
            instance_label(&instance),
            instance.path.display(),
            instance.id,
            instance.sources.join(", ")
        ));
        for toolset in instance.toolsets() {
            let hosts = toolset
                .hosts()
                .into_iter()
                .map(|(host, targets)| format!("{host}->{}", targets.join("/")))
                .collect::<Vec<_>>()
                .join(" ");
            text.push_str(&format!("  toolset  {}  {hosts}\n", toolset_label(&toolset)));
        }
        if let Some(llvm) = instance.llvm(toolchain::host().unwrap_or("x64")) {
            text.push_str(&format!("  llvm     {} {}\n", llvm.version.as_deref().unwrap_or("?"), llvm.bin.display()));
        }
    }
    for sdk in toolchain::windows_sdks() {
        text.push_str(&format!(
            "Windows SDK {}{}  {}\n",
            sdk.version,
            if sdk.complete { "" } else { " (incomplete)" },
            sdk.dir.display()
        ));
    }
    for netfx in toolchain::netfx_sdks() {
        text.push_str(&format!(".NET Framework SDK {}  {}\n", netfx.version, netfx.dir.display()));
    }
    if text.is_empty() {
        text.push_str("no Visual Studio instance, Windows SDK or .NET Framework SDK (run `bun msvc setup`)\n");
    }
    out(&text);
    0
}

fn sh_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

fn env(toolchain: &Toolchain, format: &str) -> i32 {
    let vars = toolchain.env();
    let mut text = String::new();
    match format {
        "json" => {
            let mut w = Writer::new();
            w.begin_object();
            for (name, value) in &vars {
                w.field(name, &value.to_string_lossy());
            }
            w.end_object();
            text = w.finish();
            text.push('\n');
        }
        "pwsh" | "powershell" | "ps1" => {
            for (name, value) in &vars {
                text.push_str(&format!("$env:{name} = '{}'\n", value.to_string_lossy().replace('\'', "''")));
            }
        }
        "cmd" | "bat" => {
            for (name, value) in &vars {
                text.push_str(&format!("set \"{name}={}\"\n", value.to_string_lossy()));
            }
        }
        "sh" | "bash" => {
            for (name, value) in &vars {
                let value = value.to_string_lossy();
                let value = if *name == "PATH" {
                    std::env::split_paths(value.as_ref())
                        .map(|p| sync::msys_path(&p.to_string_lossy()))
                        .collect::<Vec<_>>()
                        .join(":")
                } else {
                    value.into_owned()
                };
                text.push_str(&format!("export {name}={}\n", sh_quote(&value)));
            }
        }
        "github" => {
            for (name, value) in &vars {
                text.push_str(&format!("{name}={}\n", value.to_string_lossy()));
            }
        }
        other => return fail(&format!("unknown format: {other} (json, pwsh, cmd, sh, github)")),
    }
    out(&text);
    0
}

fn which(toolchain: &Toolchain, tools: &[OsString]) -> i32 {
    if tools.is_empty() {
        return fail("usage: bun msvc which <tool>...");
    }
    let mut code = 0;
    for tool in tools {
        let tool = tool.to_string_lossy();
        match toolchain.which(&tool) {
            Some(path) => out(&format!("{}\n", path.display())),
            None => code = fail(&format!("{tool} was not found in the {} toolchain", toolchain.arch)),
        }
    }
    code
}

fn exec(toolchain: &Toolchain, rest: &[OsString]) -> i32 {
    let Some((tool, args)) = rest.split_first() else {
        return fail("usage: bun msvc exec [--] <tool> [args...]");
    };
    let name = tool.to_string_lossy();
    let program = match (!name.contains(['\\', '/'])).then(|| toolchain.which(&name)).flatten() {
        Some(path) => path.into_os_string(),
        None => tool.clone(),
    };
    match std::process::Command::new(&program).args(args).envs(toolchain.env()).status() {
        Ok(status) => status.code().unwrap_or(1),
        Err(e) => fail(&format!("{}: {e}", PathBuf::from(&program).display())),
    }
}

fn sync_command(args: &Args) -> i32 {
    let root = args.cache_dir.clone().unwrap_or_else(sync::default_cache_root);
    let dir = root.join(sync::cache_key(&args.options));
    if args.check {
        let fresh = sync::is_fresh(&dir);
        out(&format!("{}\n", dir.display()));
        return if fresh { 0 } else { 1 };
    }
    match sync::sync(&args.options, &root, args.force) {
        Ok(synced) => {
            if args.format.as_deref() == Some("json") {
                let mut w = Writer::new();
                w.begin_object()
                    .field("dir", &synced.dir.display().to_string())
                    .key("hit")
                    .bool(synced.hit);
                w.key("files").begin_object();
                for name in ["json", "cmd", "ps1", "sh"] {
                    w.field(name, &synced.dir.join(format!("env.{name}")).display().to_string());
                }
                w.end_object().end_object();
                out(&format!("{}\n", w.finish()));
            } else {
                err(&format!(
                    "bun msvc sync: {} {}",
                    if synced.hit { "up to date" } else { "wrote" },
                    synced.dir.display()
                ));
                out(&format!("{}\n", synced.dir.display()));
            }
            0
        }
        Err(message) => fail(&format!("{message} (run `bun msvc setup`)")),
    }
}

fn backup_dir(args: &Args) -> PathBuf {
    args.backup_dir.clone().unwrap_or_else(|| {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_or(0, |d| d.as_secs());
        sync::default_cache_root().join("msi-backup").join(stamp.to_string())
    })
}

/// Removes the orphaned registrations, elevating when needed; returns the exit code.
fn fix_orphans(args: &Args, self_args: &[&str], orphans: &[setup::MsiProduct]) -> i32 {
    let backup = backup_dir(args);
    if !setup::is_elevated() {
        let Ok(exe) = std::env::current_exe() else {
            return fail("cannot find the running executable to elevate");
        };
        let mut elevated: Vec<String> = self_args.iter().map(|s| s.to_string()).collect();
        elevated.extend(["msi".into(), "--fix".into(), "--backup-dir".into(), backup.display().to_string()]);
        err("bun msvc msi: administrator rights are needed, asking through UAC");
        return match setup::run_elevated(&exe, &elevated) {
            Ok(code) => {
                let left = setup::msi_orphans().len();
                err(&format!(
                    "bun msvc msi: {} of {} orphaned registration(s) removed, backups in {}",
                    orphans.len().saturating_sub(left),
                    orphans.len(),
                    backup.display()
                ));
                if left == 0 {
                    0
                } else {
                    code.max(1)
                }
            }
            Err(message) => fail(&message),
        };
    }
    let mut code = 0;
    for orphan in orphans {
        match setup::remove_registration(orphan, &backup) {
            Ok(keys) => err(&format!("removed {} {} ({} keys)", orphan.name, orphan.product_code, keys.len())),
            Err(message) => code = fail(&format!("{}: {message}", orphan.name)),
        }
    }
    err(&format!("backups in {}", backup.display()));
    code
}

fn msi_command(args: &Args, self_args: &[&str]) -> i32 {
    let orphans = setup::msi_orphans();
    if args.format.as_deref() == Some("json") && !args.fix {
        let mut w = Writer::new();
        w.begin_object().key("orphans").begin_array();
        for orphan in &orphans {
            w.begin_object()
                .field("name", &orphan.name)
                .field("version", &orphan.version)
                .field("productCode", &orphan.product_code)
                .field("packed", &orphan.packed)
                .key("localPackage")
                .opt_str(orphan.local_package.as_deref())
                .end_object();
        }
        w.end_array().end_object();
        out(&format!("{}\n", w.finish()));
        return 0;
    }
    if orphans.is_empty() {
        out("no orphaned Visual Studio / Windows SDK MSI product\n");
        return 0;
    }
    let mut text = String::new();
    for orphan in &orphans {
        text.push_str(&format!(
            "{} {} {} (cached package: {})\n",
            orphan.product_code,
            orphan.name,
            orphan.version,
            orphan.local_package.as_deref().unwrap_or("none")
        ));
    }
    out(&text);
    if !args.fix {
        err("run `bun msvc msi --fix` to remove these registrations so the installers can reinstall them");
        return 0;
    }
    fix_orphans(args, self_args, &orphans)
}

fn setup_command(args: &Args) -> i32 {
    let instances = toolchain::instances();
    let options = SetupOptions {
        arch: args.options.arch.clone(),
        toolset: args.options.toolset.clone(),
        sdk: args.options.sdk.clone(),
        add: args.add.clone(),
        instance: args.options.instance.clone(),
        repair: args.repair,
        update: args.update,
        product: args.product.clone(),
    };
    let steps = match setup::plan(&options, &instances) {
        Ok(steps) => steps,
        Err(message) => return fail(&message),
    };
    let orphans = setup::msi_orphans();
    if !orphans.is_empty() {
        err(&format!(
            "warning: {} orphaned MSI product(s) can make the installer fail with 1714/1612: {}{}",
            orphans.len(),
            orphans.iter().map(|o| o.name.as_str()).collect::<Vec<_>>().join("; "),
            if args.fix_orphans { "" } else { " (add --fix-msi-orphans)" }
        ));
    }
    if args.dry_run {
        if args.fix_orphans && !orphans.is_empty() {
            out(&format!("# remove {} orphaned MSI registration(s)\n", orphans.len()));
        }
        for step in &steps {
            out(&format!("# {}\n{}\n", step.reason, step.display()));
        }
        if steps.is_empty() {
            out("# nothing to do\n");
        }
        return 0;
    }
    if args.fix_orphans && !orphans.is_empty() {
        let code = fix_orphans(args, &[], &orphans);
        if code != 0 {
            return code;
        }
    }
    if steps.is_empty() {
        err("bun msvc setup: everything requested is installed");
    }
    let mut reboot = false;
    for step in &steps {
        err(&format!("bun msvc setup: {}\n  {}", step.reason, step.display()));
        match setup::run(step) {
            Ok(Outcome::Done) => {}
            Ok(Outcome::RebootRequired) => reboot = true,
            Ok(Outcome::Failed(code, why)) => return fail(&format!("installer exit code {code}: {why}")),
            Err(message) => return fail(&message),
        }
    }
    if reboot {
        err("bun msvc setup: done; restart Windows to finish the install");
    }
    let root = args.cache_dir.clone().unwrap_or_else(sync::default_cache_root);
    match sync::sync(&args.options, &root, true) {
        Ok(synced) => {
            err(&format!("bun msvc setup: environment cached in {}", synced.dir.display()));
            0
        }
        Err(message) => fail(&message),
    }
}
