//! Command line of `bun mcp`.

use std::ffi::OsString;
use std::io::{BufRead, Write};
use std::path::PathBuf;
use std::sync::Arc;

use serde_json::{Value, json};

use crate::profile::Profile;
use crate::registry::{Context, Registry, Tool};
use crate::server::Server;
use crate::util::env;

const HELP: &str = "\
Usage: bun mcp [options]
       bun mcp install [claude|codex|agy|all] [--project]
       bun mcp uninstall [claude|codex|agy|all] [--project]
       bun mcp tools [--json|--markdown]

Model Context Protocol server built into Bun: Bun docs, agent skills, memory, code graph,
workspace search/edit and bounded run/test, for coding agents.

Options:
  --http <port>        Serve streamable HTTP on 127.0.0.1:<port>/mcp instead of stdio (0: any port)
  --max-tokens <n>     Token budget of one tool result (default per agent: 6000-8000)
  --page-size <n>      Tools per tools/list page (default 100)
  --profile <agent>    claude, codex, agy or generic (default: detected from the environment)
  --cwd <dir>          Working directory of the tools
  -h, --help           Print this help

Environment: BUN_MCP_PROFILE, BUN_MCP_MAX_TOKENS, BUN_MCP_PAGE_SIZE, BUN_MCP_MEMORY_DB,
BUN_MCP_SKILLS_PATH, REDIS_URL / VALKEY_URL (shared cache).
";

/// Version reported in `serverInfo` and the manifest.
pub(crate) fn version() -> &'static str {
    bun_core::Global::package_json_version_with_sha
}

struct Options {
    http: Option<u16>,
    max_tokens: Option<usize>,
    page_size: usize,
    profile: Option<String>,
    cwd: Option<PathBuf>,
}

fn usage_error(msg: &str) -> i32 {
    eprintln!("error: {msg}\n\n{HELP}");
    2
}

fn registry(extra: &[&'static [Tool]]) -> Registry {
    let mut registry = Registry::builtin();
    for tools in extra {
        registry.register_all(tools);
    }
    registry
}

/// Entry point of `bun mcp`: `args` are the arguments after `mcp`; `extra` adds tool slices
/// after the built-in ones (same name: replaces). Returns the exit code.
pub fn main(args: Vec<OsString>, extra: &[&'static [Tool]]) -> i32 {
    let args: Vec<String> = args
        .into_iter()
        .map(|a| a.to_string_lossy().into_owned())
        .collect();
    let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    match args.first().map(String::as_str) {
        Some("install") => return crate::install::run(&registry(extra), true, &args[1..], &cwd),
        Some("uninstall") => return crate::install::run(&registry(extra), false, &args[1..], &cwd),
        Some("tools") => return print_tools(&registry(extra), &args[1..]),
        Some("help" | "-h" | "--help") => {
            print!("{HELP}");
            return 0;
        }
        _ => {}
    }

    let mut opts = Options {
        http: None,
        max_tokens: None,
        page_size: env("BUN_MCP_PAGE_SIZE")
            .and_then(|v| v.parse().ok())
            .unwrap_or(100),
        profile: None,
        cwd: None,
    };
    let mut it = args.iter();
    while let Some(arg) = it.next() {
        let (flag, inline) = match arg.split_once('=') {
            Some((f, v)) if f.starts_with("--") => (f, Some(v.to_owned())),
            _ => (arg.as_str(), None),
        };
        let mut value = || inline.clone().or_else(|| it.next().cloned());
        match flag {
            "--http" => match value().and_then(|v| v.parse().ok()) {
                Some(p) => opts.http = Some(p),
                None => return usage_error("--http expects a port"),
            },
            "--max-tokens" => match value().and_then(|v| v.parse().ok()) {
                Some(n) => opts.max_tokens = Some(n),
                None => return usage_error("--max-tokens expects a number"),
            },
            "--page-size" => match value().and_then(|v| v.parse().ok()) {
                Some(n) => opts.page_size = n,
                None => return usage_error("--page-size expects a number"),
            },
            "--profile" => match value() {
                Some(p) => opts.profile = Some(p),
                None => return usage_error("--profile expects an agent name"),
            },
            "--cwd" => match value() {
                Some(d) => opts.cwd = Some(cwd.join(d)),
                None => return usage_error("--cwd expects a directory"),
            },
            "--stdio" => {}
            other => return usage_error(&format!("unknown argument \"{other}\"")),
        }
    }

    let cwd = opts.cwd.unwrap_or(cwd);
    let profile = Profile::detect(opts.profile.as_deref(), opts.max_tokens);
    let server = Arc::new(Server::new(
        registry(extra),
        Context::new(cwd, profile),
        opts.page_size,
    ));
    {
        let server = Arc::clone(&server);
        std::thread::spawn(move || {
            crate::install::refresh_if_stale(&server.registry, &server.ctx.cwd)
        });
    }
    match opts.http {
        Some(port) => match crate::http::serve(&server, port) {
            Ok(()) => 0,
            Err(e) => {
                eprintln!("error: bun mcp --http {port}: {e}");
                1
            }
        },
        None => stdio(&server),
    }
}

fn stdio(server: &Server) -> i32 {
    let stdin = std::io::stdin();
    let mut input = stdin.lock();
    let mut line = String::new();
    loop {
        line.clear();
        match input.read_line(&mut line) {
            Ok(0) => return 0,
            Ok(_) => {}
            Err(e) => {
                eprintln!("error: bun mcp: stdin: {e}");
                return 1;
            }
        }
        let text = line.trim();
        if text.is_empty() {
            continue;
        }
        let reply = match serde_json::from_str::<Value>(text) {
            Ok(msg) => server.handle(msg),
            Err(e) => Some(
                json!({"jsonrpc": "2.0", "id": Value::Null, "error": {"code": -32700, "message": format!("parse error: {e}")}}),
            ),
        };
        if let Some(reply) = reply {
            let mut out = std::io::stdout().lock();
            let mut bytes = reply.to_string().into_bytes();
            bytes.push(b'\n');
            if out.write_all(&bytes).and_then(|()| out.flush()).is_err() {
                return 0;
            }
        }
    }
}

fn print_tools(registry: &Registry, args: &[String]) -> i32 {
    let descriptors = registry.descriptors();
    if args.iter().any(|a| a == "--markdown") {
        print!("{}", markdown(descriptors));
    } else if args.iter().any(|a| a == "--json") {
        println!(
            "{}",
            serde_json::to_string_pretty(descriptors).unwrap_or_default()
        );
    } else {
        for d in descriptors {
            let name = d["name"].as_str().unwrap_or("");
            let desc = d["description"].as_str().unwrap_or("");
            let first = desc
                .split(". ")
                .next()
                .unwrap_or(desc)
                .trim_end_matches('.');
            println!("{name:<16} {first}");
        }
    }
    0
}

/// The tool table of `docs/runtime/mcp.mdx`.
fn markdown(descriptors: &[Value]) -> String {
    let mut out =
        String::from("| Tool | Description | Arguments | Kind |\n| --- | --- | --- | --- |\n");
    for d in descriptors {
        let mut args: Vec<String> = Vec::new();
        let required: Vec<&str> = d
            .pointer("/inputSchema/required")
            .and_then(Value::as_array)
            .map(|r| r.iter().filter_map(Value::as_str).collect())
            .unwrap_or_default();
        if let Some(props) = d
            .pointer("/inputSchema/properties")
            .and_then(Value::as_object)
        {
            for name in props.keys() {
                if name == "cursor" || name == "max_tokens" {
                    continue;
                }
                args.push(if required.contains(&name.as_str()) {
                    format!("`{name}`")
                } else {
                    format!("`{name}?`")
                });
            }
        }
        let kind = if d.pointer("/annotations/readOnlyHint") == Some(&Value::Bool(true)) {
            "read-only"
        } else if d.pointer("/annotations/destructiveHint") == Some(&Value::Bool(true)) {
            "destructive"
        } else {
            "write"
        };
        out.push_str(&format!(
            "| `{}` | {} | {} | {} |\n",
            d["name"].as_str().unwrap_or(""),
            d["description"].as_str().unwrap_or("").replace('|', "\\|"),
            args.join(", "),
            kind
        ));
    }
    out
}
