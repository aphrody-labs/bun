//! `bun msvc` on Linux and macOS (`bun msvc cross` on Windows): the cross-compilation sysroot.

use std::ffi::OsString;
use std::io::Write;
use std::path::PathBuf;

use super::env::{self, Tools};
use super::manifest::{self, Selection, DEFAULT_CHANNEL};
use super::{Fetch, Installer, Sysroot};
use crate::json::Writer;

pub const HELP: &str = "\
Usage: {prog} <command> [options]

Cross-compile for Windows (x86_64/aarch64/i686-pc-windows-msvc) with clang-cl, lld-link and
llvm-lib: download the MSVC CRT and the Windows SDK from the official Visual Studio manifests
(sha256 verified), lay them out as a sysroot with case aliases, and export the cargo/cc-rs
environment.

Commands:
  doctor                      Check the sysroot, the LLVM tools and the rustup targets (default)
  setup [--dry-run]           Download and lay out the sysroot (requires --accept-license)
  sync [--check]              Set up the sysroot when it is missing and rewrite env.sh/env.json;
                              prints the sysroot directory
  env [--shell <f>]           The environment: sh (default), json, pwsh, cmd, github
                              (eval \"$({prog} env)\")
  which <tool>...             Path of clang-cl, lld-link, llvm-lib, llvm-rc, llvm-mt, llvm-dlltool
  list [--json]               Installed sysroots
  info                        Everything as JSON

Options:
  --arch <arch>               x64, arm64, x86; repeatable or comma separated (default: x64,arm64)
  --toolset <v>               MSVC CRT version or prefix (14.44, 14.44.17.14, 14.44.35207)
  --sdk <v>                   Windows SDK version or prefix (10.0.26100)
  --spectre                   Also the Spectre-mitigated CRT libraries
  --manifest <url|path>       Visual Studio channel or installer manifest
                              (default: https://aka.ms/vs/17/release/channel)
  --cache-dir <dir>           Downloads and sysroots (default: $XDG_CACHE_HOME/bun/msvc)
  --accept-license            Accept the Microsoft Visual Studio and Windows SDK licenses
                              (or BUN_MSVC_ACCEPT_LICENSE=1)
  --force                     Download and lay out again
  --json                      JSON output
";

#[derive(Default)]
struct Args {
    command: String,
    archs: Vec<&'static str>,
    toolset: Option<String>,
    sdk: Option<String>,
    spectre: bool,
    manifest: Option<String>,
    cache_dir: Option<PathBuf>,
    accept_license: bool,
    dry_run: bool,
    force: bool,
    check: bool,
    json: bool,
    format: Option<String>,
    rest: Vec<String>,
}

fn parse(args: Vec<OsString>) -> Result<Args, String> {
    let mut parsed = Args::default();
    let mut iter = args.into_iter().map(|a| a.to_string_lossy().into_owned());
    while let Some(arg) = iter.next() {
        let (flag, inline) = match arg.split_once('=') {
            Some((flag, value)) if flag.starts_with("--") => (flag.to_owned(), Some(value.to_owned())),
            _ => (arg.clone(), None),
        };
        let mut value = |name: &str| -> Result<String, String> {
            inline.clone().or_else(|| iter.next()).ok_or_else(|| format!("{name} needs a value"))
        };
        match flag.as_str() {
            "--arch" => {
                for arch in value("--arch")?.split(',').filter(|a| !a.is_empty()) {
                    let arch = manifest::ms_arch(arch).ok_or_else(|| format!("unknown architecture: {arch}"))?;
                    if !parsed.archs.contains(&arch) {
                        parsed.archs.push(arch);
                    }
                }
            }
            "--toolset" | "--vcvars-ver" => parsed.toolset = Some(value(&flag)?),
            "--sdk" => parsed.sdk = Some(value(&flag)?),
            "--manifest" => parsed.manifest = Some(value(&flag)?),
            "--cache-dir" => parsed.cache_dir = Some(PathBuf::from(value(&flag)?)),
            "--format" | "--shell" => parsed.format = Some(value(&flag)?),
            "--spectre" => parsed.spectre = true,
            "--accept-license" => parsed.accept_license = true,
            "--dry-run" => parsed.dry_run = true,
            "--force" => parsed.force = true,
            "--check" => parsed.check = true,
            "--json" => parsed.json = true,
            "-h" | "--help" => parsed.command = "help".into(),
            _ if arg.starts_with("--") => return Err(format!("unknown option: {arg}")),
            _ if parsed.command.is_empty() => parsed.command = arg,
            _ => parsed.rest.push(arg),
        }
    }
    if std::env::var("BUN_MSVC_ACCEPT_LICENSE").is_ok_and(|v| v == "1" || v.eq_ignore_ascii_case("true")) {
        parsed.accept_license = true;
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

struct Context<'a> {
    args: Args,
    prog: &'a str,
    fetch: &'a dyn Fetch,
    cache_dir: PathBuf,
}

/// Runs `<prog> <args>`; `prog` is `bun msvc` or `bun msvc cross`, for messages.
pub fn main(args: Vec<OsString>, prog: &str, fetch: &dyn Fetch) -> i32 {
    let args = match parse(args) {
        Ok(args) => args,
        Err(message) => return fail(&message),
    };
    let cache_dir = args.cache_dir.clone().unwrap_or_else(super::default_cache_dir);
    let cx = Context { args, prog, fetch, cache_dir };
    match cx.args.command.as_str() {
        "help" => {
            out(&HELP.replace("{prog}", prog));
            0
        }
        "" | "doctor" => doctor(&cx),
        "setup" | "install" => setup(&cx),
        "sync" => sync(&cx),
        "env" => with_sysroot(&cx, |s| env_command(&cx, s)),
        "which" => which(&cx),
        "list" | "ls" => list(&cx),
        "info" => info(&cx),
        other => {
            out(&HELP.replace("{prog}", prog));
            fail(&format!("unknown command: {other}"))
        }
    }
}

impl Context<'_> {
    fn find(&self) -> Option<Sysroot> {
        super::find(&self.cache_dir, self.args.toolset.as_deref(), self.args.sdk.as_deref(), &self.args.archs)
    }

    fn missing(&self) -> String {
        format!("no MSVC sysroot in {} (run `{} setup --accept-license`)", self.cache_dir.display(), self.prog)
    }

    fn selection(&self) -> Selection {
        let archs = if self.args.archs.is_empty() { vec!["x64", "arm64"] } else { self.args.archs.clone() };
        Selection { archs, toolset: self.args.toolset.clone(), sdk: self.args.sdk.clone(), spectre: self.args.spectre }
    }

    fn manifest(&self) -> String {
        self.args.manifest.clone().unwrap_or_else(|| DEFAULT_CHANNEL.to_owned())
    }

    fn install(&self) -> Result<Sysroot, String> {
        if !self.args.accept_license {
            return Err(format!(
                "the MSVC CRT and the Windows SDK are licensed by Microsoft: pass --accept-license (or set \
                 BUN_MSVC_ACCEPT_LICENSE=1) to accept https://go.microsoft.com/fwlink/?LinkId=2179911 and \
                 https://go.microsoft.com/fwlink/?linkid=2086245 (`{} setup --dry-run` lists the downloads)",
                self.prog
            ));
        }
        let manifest = self.manifest();
        let mut selection = self.selection();
        let packages = super::load_packages(self.fetch, &manifest)?;
        let mut plan = manifest::plan(&packages, &selection)?;
        // Adding an architecture to an installed sysroot keeps the ones it has.
        let id = format!("{}-{}", plan.crt_version, plan.sdk);
        if let Some(existing) = Sysroot::read(&self.cache_dir.join("sysroot").join(id)).filter(|_| !self.args.force) {
            let before = selection.archs.len();
            for arch in existing.archs.iter().filter_map(|a| manifest::ms_arch(a)) {
                if !selection.archs.contains(&arch) {
                    selection.archs.push(arch);
                }
            }
            selection.spectre |= existing.spectre;
            if selection.archs.len() != before || selection.spectre != self.args.spectre {
                plan = manifest::plan(&packages, &selection)?;
            }
        }
        let log = |line: &str| err(line);
        let installer = Installer { fetch: self.fetch, cache_dir: self.cache_dir.clone(), manifest, log: &log };
        let sysroot = installer.install(&plan, selection.spectre, self.args.force)?;
        write_env(&sysroot)?;
        Ok(sysroot)
    }
}

fn with_sysroot(cx: &Context, run: impl FnOnce(&Sysroot) -> i32) -> i32 {
    match cx.find() {
        Some(sysroot) => run(&sysroot),
        None => fail(&cx.missing()),
    }
}

/// `env.sh` and `env.json` next to `sysroot.json`; returns whether they changed.
fn write_env(sysroot: &Sysroot) -> Result<bool, String> {
    let vars = env::vars(sysroot, &Tools::discover());
    let mut changed = false;
    for (file, format) in [("env.sh", "sh"), ("env.json", "json")] {
        let text = env::format(&vars, format)?;
        let path = sysroot.root.join(file);
        if std::fs::read_to_string(&path).ok().as_deref() != Some(text.as_str()) {
            std::fs::write(&path, text).map_err(|e| format!("{}: {e}", path.display()))?;
            changed = true;
        }
    }
    Ok(changed)
}

fn env_is_fresh(sysroot: &Sysroot) -> bool {
    let vars = env::vars(sysroot, &Tools::discover());
    [("env.sh", "sh"), ("env.json", "json")].iter().all(|(file, format)| {
        let text = env::format(&vars, format).unwrap_or_default();
        std::fs::read_to_string(sysroot.root.join(file)).ok().as_deref() == Some(text.as_str())
    })
}

fn print_sysroot(cx: &Context, sysroot: &Sysroot) {
    if cx.args.json {
        let mut w = Writer::new();
        sysroot.to_json(&mut w);
        out(&(w.finish() + "\n"));
    } else {
        out(&format!("{}\n", sysroot.root.display()));
    }
}

fn setup(cx: &Context) -> i32 {
    if cx.args.dry_run {
        let selection = cx.selection();
        let plan = match super::plan(cx.fetch, &cx.manifest(), &selection) {
            Ok(plan) => plan,
            Err(message) => return fail(&message),
        };
        if cx.args.json {
            let mut w = Writer::new();
            w.begin_object()
                .field("crt", &plan.crt)
                .field("crtVersion", &plan.crt_version)
                .field("sdk", &plan.sdk)
                .key("archs")
                .begin_array();
            for arch in &plan.archs {
                w.str(arch);
            }
            w.end_array().key("downloads").begin_array();
            for (id, payload) in &plan.vsix {
                w.begin_object().field("package", id).field("url", &payload.url).field("sha256", &payload.sha256);
                w.key("size").num(payload.size).end_object();
            }
            for payload in &plan.msis {
                w.begin_object().field("package", &payload.file_name).field("url", &payload.url).field("sha256", &payload.sha256);
                w.key("size").num(payload.size).end_object();
            }
            w.end_array().key("downloadSize").num(plan.download_size()).end_object();
            out(&(w.finish() + "\n"));
        } else {
            let mut text = format!(
                "MSVC CRT {} ({}), Windows SDK {}, {}\n",
                plan.crt,
                plan.crt_version,
                plan.sdk,
                plan.archs.join(", ")
            );
            for (id, payload) in &plan.vsix {
                text.push_str(&format!("  {id} {}\n", payload.url));
            }
            for payload in &plan.msis {
                text.push_str(&format!("  {} {}\n", payload.file_name, payload.url));
            }
            text.push_str(&format!(
                "  + the cabinets these installers reference; {:.0} MB before cabinets\n",
                plan.download_size() as f64 / 1e6
            ));
            out(&text);
        }
        return 0;
    }
    match cx.install() {
        Ok(sysroot) => {
            print_sysroot(cx, &sysroot);
            0
        }
        Err(message) => fail(&message),
    }
}

fn sync(cx: &Context) -> i32 {
    match cx.find() {
        Some(sysroot) if !cx.args.force => {
            if cx.args.check {
                if !env_is_fresh(&sysroot) {
                    return fail(&format!("{} is stale (run `{} sync`)", sysroot.root.display(), cx.prog));
                }
            } else if let Err(message) = write_env(&sysroot) {
                return fail(&message);
            }
            print_sysroot(cx, &sysroot);
            0
        }
        _ if cx.args.check => fail(&cx.missing()),
        _ => setup(cx),
    }
}

fn env_command(cx: &Context, sysroot: &Sysroot) -> i32 {
    let format = cx.args.format.as_deref().unwrap_or(if cx.args.json { "json" } else { "sh" });
    match env::format(&env::vars(sysroot, &Tools::discover()), format) {
        Ok(text) => {
            out(&text);
            0
        }
        Err(message) => fail(&message),
    }
}

fn which(cx: &Context) -> i32 {
    if cx.args.rest.is_empty() {
        return fail("which needs a tool name");
    }
    let mut code = 0;
    for name in &cx.args.rest {
        let name = name.strip_suffix(".exe").unwrap_or(name);
        match env::find_tool(name) {
            Some(path) => out(&format!("{}\n", path.display())),
            None => code = fail(&format!("{name} not found")),
        }
    }
    code
}

fn list(cx: &Context) -> i32 {
    let sysroots = super::installed(&cx.cache_dir);
    if cx.args.json {
        let mut w = Writer::new();
        w.begin_array();
        for sysroot in &sysroots {
            sysroot.to_json(&mut w);
        }
        w.end_array();
        out(&(w.finish() + "\n"));
        return 0;
    }
    if sysroots.is_empty() {
        out(&format!("{}\n", cx.missing()));
    }
    for sysroot in &sysroots {
        out(&format!(
            "MSVC {} ({}), Windows SDK {}, {}: {}\n",
            sysroot.msvc_version,
            sysroot.crt,
            sysroot.sdk_version,
            sysroot.archs.join(", "),
            sysroot.root.display()
        ));
    }
    0
}

fn info(cx: &Context) -> i32 {
    let tools = Tools::discover();
    let mut w = Writer::new();
    w.begin_object().field("cacheDir", &cx.cache_dir.to_string_lossy()).key("sysroots").begin_array();
    for sysroot in super::installed(&cx.cache_dir) {
        sysroot.to_json(&mut w);
    }
    w.end_array().key("tools").begin_object();
    for (name, path) in &tools.found {
        w.key(name).opt_str(path.as_ref().map(|p| p.to_string_lossy()).as_deref());
    }
    w.end_object().key("env");
    match cx.find() {
        Some(sysroot) => {
            w.begin_object();
            for (key, value) in env::vars(&sysroot, &tools) {
                w.field(&key, &value);
            }
            w.end_object();
        }
        None => {
            w.null();
        }
    }
    w.end_object();
    out(&(w.finish() + "\n"));
    0
}

/// `<rustc sysroot>/lib/rustlib/<triple>` exists when `rustup target add <triple>` ran.
fn rust_target_installed(triple: &str) -> Option<bool> {
    let output = std::process::Command::new("rustc").args(["--print", "sysroot"]).output().ok()?;
    let sysroot = String::from_utf8_lossy(&output.stdout).trim().to_owned();
    (!sysroot.is_empty()).then(|| PathBuf::from(sysroot).join("lib").join("rustlib").join(triple).is_dir())
}

fn doctor(cx: &Context) -> i32 {
    let mut report = format!("{} doctor: cache {}\n", cx.prog, cx.cache_dir.display());
    let mut ok = true;
    let mut line = |status: &str, label: &str, detail: String| {
        report.push_str(&format!("  {status:<8}{label:<40}{detail}\n"));
    };
    let sysroot = cx.find();
    match &sysroot {
        Some(s) => line(
            "ok",
            "sysroot",
            format!("MSVC {}, SDK {}, {}: {}", s.msvc_version, s.sdk_version, s.archs.join(", "), s.root.display()),
        ),
        None => {
            ok = false;
            line("missing", "sysroot", format!("run `{} setup --accept-license`", cx.prog));
        }
    }
    let tools = Tools::discover();
    for (name, path) in &tools.found {
        let required = matches!(*name, "clang-cl" | "lld-link" | "llvm-lib");
        match path {
            Some(path) => line("ok", name, path.display().to_string()),
            None if required => {
                ok = false;
                line("missing", name, "install clang, lld and llvm (apt install clang lld llvm, apk add clang lld llvm)".into());
            }
            None => line("optional", name, "not found".into()),
        }
    }
    let archs: Vec<String> = sysroot.as_ref().map_or_else(|| vec!["x64".into(), "arm64".into()], |s| s.archs.clone());
    for arch in &archs {
        let triple = manifest::rust_triple(arch);
        match rust_target_installed(triple) {
            Some(true) => line("ok", &format!("rust target {triple}"), "installed".into()),
            Some(false) => line("missing", &format!("rust target {triple}"), format!("rustup target add {triple}")),
            None => line("optional", &format!("rust target {triple}"), "rustc not found".into()),
        }
    }
    out(&report);
    if ok {
        0
    } else {
        1
    }
}
