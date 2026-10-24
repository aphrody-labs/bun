//! `bun-winmd`, the `winmd` plugin: windows-bindgen behind `bun winmd`.
//! Generates Rust bindings (`--lang rust`, the windows-rs projection) or `bun:ffi` declarations
//! (`--lang ts` / `--lang json`) from `.winmd` metadata.
//!
//! Inputs: `--in <file.winmd|dir>`, `--in sdk` (the installed SDK's `UnionMetadata\Windows.winmd`)
//! or `--in default` / no `--in` (the `windows-default` crate's `Windows.Win32.winmd` + `Windows.winmd`).

use std::io::Write as _;
use std::process::exit;

fn out(bytes: &[u8]) {
    let _ = std::io::stdout().lock().write_all(bytes);
}

fn fail(message: core::fmt::Arguments<'_>) -> ! {
    let _ = writeln!(std::io::stderr().lock(), "error: {message}");
    exit(1);
}

const HELP: &str = "\
Usage: bun winmd --out <file> --filter <api>... [options]
       bun winmd inputs [--json]

Generate bindings from Windows metadata (.winmd) with windows-bindgen.

Options:
  --out <file>                Output file; the extension picks --lang (.rs, .ts/.mts/.js, .json)
  --filter <rule>...          Namespace, type or function to include; prefix with ! to exclude
  --filter-file <file>...     Read filter rules from files
  --in <path|sdk|win32|default>...
                              .winmd files or directories; sdk = the SDK's Windows.winmd (WinRT),
                              win32 = the Microsoft.Windows.SDK.Win32Metadata NuGet package,
                              default = the windows-default crate's metadata (flattened Windows.Win32 + WinRT)
  --lang <rust|ts|json>       Output language
  --arch <x64|arm64|x86>      Struct layouts for --lang ts|json (default: host)
  --dll <name.dll>...         Keep only functions imported from these DLLs (--lang ts|json)
  --etc <file>...             Read arguments from files

Rust only: --sys --extern --flat --package --minimal --derive --implement --compose
           --dead-code --rustfmt
";

fn sdk_winmd() -> Option<std::path::PathBuf> {
    #[cfg(windows)]
    {
        find_msvc_tools::toolchain::windows_sdk()?
            .union_metadata
            .map(|dir| dir.join("Windows.winmd"))
            .filter(|path| path.is_file())
    }
    #[cfg(not(windows))]
    None
}

fn win32_winmd() -> Option<std::path::PathBuf> {
    #[cfg(windows)]
    {
        find_msvc_tools::toolchain::win32_metadata()
    }
    #[cfg(not(windows))]
    None
}

fn path_json(path: Option<&std::path::Path>) -> String {
    let Some(path) = path else {
        return "null".into();
    };
    let mut json = String::from('"');
    for ch in path.to_string_lossy().chars() {
        match ch {
            '"' | '\\' => {
                json.push('\\');
                json.push(ch);
            }
            ch if (ch as u32) < 0x20 => json.push_str(&format!("\\u{:04x}", ch as u32)),
            ch => json.push(ch),
        }
    }
    json.push('"');
    json
}

fn inputs(json: bool) -> ! {
    let sdk = sdk_winmd();
    let win32 = win32_winmd();
    let mut text = String::new();
    if json {
        text.push_str(&format!(
            "{{\"default\":\"windows-default\",\"sdk\":{},\"win32\":{}}}\n",
            path_json(sdk.as_deref()),
            path_json(win32.as_deref())
        ));
    } else {
        text.push_str("default  windows-default crate\n");
        match &sdk {
            Some(path) => text.push_str(&format!("sdk      {}\n", path.display())),
            None => text.push_str("sdk      (no Windows SDK with UnionMetadata)\n"),
        }
        match &win32 {
            Some(path) => text.push_str(&format!("win32    {}\n", path.display())),
            None => {
                text.push_str("win32    (no Microsoft.Windows.SDK.Win32Metadata NuGet package)\n")
            }
        }
    }
    out(text.as_bytes());
    exit(0);
}

fn lang_for(out: &str) -> Option<&'static str> {
    let lower = out.to_ascii_lowercase();
    if lower.ends_with(".json") {
        Some("json")
    } else if [".ts", ".mts", ".cts", ".js", ".mjs", ".cjs"]
        .iter()
        .any(|ext| lower.ends_with(ext))
    {
        Some("ts")
    } else {
        None
    }
}

fn main() {
    let raw: Vec<String> = std::env::args_os()
        .skip(1)
        .map(|arg| arg.to_string_lossy().into_owned())
        .collect();

    match raw.first().map(String::as_str) {
        None | Some("-h" | "--help" | "help") => {
            out(HELP.as_bytes());
            exit(if raw.is_empty() { 1 } else { 0 });
        }
        Some("inputs") => inputs(raw.iter().any(|arg| arg == "--json")),
        _ => {}
    }

    let mut args = Vec::with_capacity(raw.len() + 2);
    let mut has_lang = false;
    let mut out_path = None::<String>;
    let mut previous = "";
    for arg in &raw {
        let option = if arg.starts_with('-') {
            arg.as_str()
        } else {
            previous
        };
        match (option, arg.as_str()) {
            ("--lang", "--lang") => has_lang = true,
            ("--in", "sdk") => match sdk_winmd() {
                Some(path) => {
                    args.push(path.to_string_lossy().into_owned());
                    continue;
                }
                None => fail(format_args!(
                    "--in sdk: no Windows SDK with UnionMetadata\\<version>\\Windows.winmd was found"
                )),
            },
            ("--in", "win32") => match win32_winmd() {
                Some(path) => {
                    args.push(path.to_string_lossy().into_owned());
                    continue;
                }
                None => fail(format_args!(
                    "--in win32: the Microsoft.Windows.SDK.Win32Metadata NuGet package was not found \
                     in NUGET_PACKAGES or ~/.nuget/packages"
                )),
            },
            ("--in", "default") => {}
            ("--out", value) if value != "--out" => out_path = Some(value.to_owned()),
            _ => {}
        }
        if arg.starts_with('-') {
            previous = if arg == "--etc" { "" } else { option };
        }
        args.push(arg.clone());
    }
    if !has_lang {
        if let Some(lang) = out_path.as_deref().and_then(lang_for) {
            args.push("--lang".into());
            args.push(lang.into());
        }
    }

    // windows-bindgen reports invalid arguments and metadata errors by panicking.
    std::panic::set_hook(Box::new(|info| {
        let payload = info.payload();
        let message = payload
            .downcast_ref::<&str>()
            .copied()
            .or_else(|| payload.downcast_ref::<String>().map(String::as_str))
            .unwrap_or("windows-bindgen failed");
        fail(format_args!("{message}"));
    }));
    windows_bindgen::bindgen(args);
    exit(0);
}
