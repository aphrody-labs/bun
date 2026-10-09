//! `bun lsp` and its subcommands.

use std::io::{BufReader, Read, Write};
use std::path::PathBuf;
use std::time::Instant;

use serde_json::{Value, json};

use crate::language::{self, Language};
use crate::service::{Query, QueryKind, Service};
use crate::{Options, client, daemon, proxy};

/// The streams of the command; `bun_runtime` makes them from its own.
pub struct Io {
    pub input: Box<dyn Read + Send>,
    pub output: Box<dyn Write + Send>,
    pub error: Box<dyn Write + Send>,
}

const HELP: &str = "\
Usage: bun lsp [--stdio]
       bun lsp query <kind> <file>[:<line>[:<column>]] [<text>] [options]
       bun lsp warm|status|stop|servers|compdb [<dir>]

One language server for TypeScript/JavaScript, Python, Rust and C/C++: it starts tsgo,
ty/basedpyright/ruff, rust-analyzer and clangd as files of their language need them, and adds
the code graph of the workspace: calls, and links across Rust, C++, Zig and TypeScript (C ABI
names, $newRustFunction and kin, .classes.ts members).

  (no command), --stdio  Serve an editor on stdin and stdout
  query                  Ask once, through a daemon of the workspace that keeps servers warm
  warm                   Start the daemon and the servers of the workspace in <dir>
  status                 Show the servers that the daemon runs
  stop                   Stop the daemon and its servers
  servers                Show the servers that each language would start
  compdb                 Write compile_commands.json (ninja -t compdb, or the kernel's script)

Query kinds:
  diagnostics <file>                 Errors and warnings
  definition <file>:<line>:<col>     Where the symbol is defined
  references <file>:<line>:<col>     Where it is used
  hover <file>:<line>:<col>          Its type and documentation
  symbols <file>                     The symbols of the file
  workspace-symbols <dir> <name>     The symbols of the workspace that match <name>
  rename <file>:<line>:<col> <name>  The edits of a rename (--apply writes them)
  context <file>:<line>:<col>        What the graph, the server and the docs know of the symbol
  callers <file>:<line>:<col>        The functions that call it, and its uses in other languages
  callees <file>:<line>:<col>        The functions it calls, and its definitions in other languages
  fix <file>[:<line>]                The lines around <line> or the first error, fixed by the
                                     model of BUN_LSP_AI (--apply writes them)

Options:
  --json             Print the answer as JSON
  --limit <n>        At most <n> items (default 100, BUN_LSP_LIMIT)
  --timeout <ms>     How long servers may take (default 30000, BUN_LSP_TIMEOUT_MS)
  --apply            rename, fix: write the edits
  --no-daemon        Answer in this process, without a daemon
  --lang <a,b>       warm: only these languages (typescript, python, rust, cpp)

Environment: BUN_LSP_<LANGUAGE>=\"<command> <args>\" picks a server; BUN_LSP_OFFLINE=1 never
downloads one; BUN_LSP_TS_DIAGNOSTICS=server takes TypeScript diagnostics from the server
rather than bun check; BUN_LSP_MAX_SERVERS, BUN_LSP_JOBS, BUN_LSP_IDLE_MS bound resources.
BUN_LSP_GRAPH=0 turns the code graph off, BUN_LSP_GRAPH_FILES bounds it (20000 files).
BUN_LSP_AI=\"claude -p\" names the command that fixes code: it reads a prompt on stdin.
";

/// Splits `file:line:column`; a Windows drive letter is part of the file.
fn split_location(text: &str) -> (PathBuf, Option<u32>, Option<u32>) {
    let mut parts: Vec<&str> = text.rsplitn(3, ':').collect();
    parts.reverse();
    let number = |it: &str| it.parse::<u32>().ok().filter(|it| *it > 0);
    match parts.as_slice() {
        [file, line, column] if number(line).is_some() && number(column).is_some() => {
            (PathBuf::from(file), number(line), number(column))
        }
        [.., last] if number(last).is_some() => {
            let file = &text[..text.len() - last.len() - 1];
            (PathBuf::from(file), number(last), None)
        }
        _ => (PathBuf::from(text), None, None),
    }
}

struct Flags {
    json: bool,
    apply: bool,
    no_daemon: bool,
    limit: Option<usize>,
    timeout: Option<u64>,
    languages: Vec<Language>,
    root: Option<PathBuf>,
    warm: bool,
    positional: Vec<String>,
}

fn parse_flags(args: &[String]) -> Result<Flags, String> {
    let mut flags = Flags {
        json: false,
        apply: false,
        no_daemon: false,
        limit: None,
        timeout: None,
        languages: Vec::new(),
        root: None,
        warm: false,
        positional: Vec::new(),
    };
    let mut args = args.iter();
    while let Some(arg) = args.next() {
        let (name, inline) = match arg.split_once('=') {
            Some((name, value)) if name.starts_with("--") => (name, Some(value.to_owned())),
            _ => (arg.as_str(), None),
        };
        let mut value = |name: &str| inline.clone().or_else(|| args.next().cloned()).ok_or_else(|| format!("{name} needs a value"));
        match name {
            "--json" => flags.json = true,
            "--apply" => flags.apply = true,
            "--no-daemon" => flags.no_daemon = true,
            "--warm" => flags.warm = true,
            "--limit" => flags.limit = Some(value(name)?.parse().map_err(|_| "--limit needs a number")?),
            "--timeout" => flags.timeout = Some(value(name)?.parse().map_err(|_| "--timeout needs milliseconds")?),
            "--root" => flags.root = Some(PathBuf::from(value(name)?)),
            "--lang" | "--languages" => {
                for name in value(name)?.split(',').filter(|it| !it.is_empty()) {
                    flags.languages.push(Language::from_name(name).ok_or_else(|| format!("unknown language {name:?}"))?);
                }
            }
            _ if name.starts_with("--") && name.len() > 2 => return Err(format!("unknown option {name}")),
            _ => flags.positional.push(arg.clone()),
        }
    }
    Ok(flags)
}

fn workspace_of(dir: Option<&String>) -> PathBuf {
    let dir = dir.map_or_else(|| PathBuf::from("."), PathBuf::from);
    let dir = std::path::absolute(&dir).unwrap_or(dir);
    language::workspace_root(&dir.join("_"))
}

fn print_json(io: &mut Io, value: &impl serde::Serialize) {
    let text = serde_json::to_string_pretty(value).unwrap_or_default();
    let _ = writeln!(io.output, "{text}");
}

fn query_command(io: &mut Io, flags: &Flags, options: &Options) -> i32 {
    let [kind, location, rest @ ..] = flags.positional.as_slice() else {
        let _ = writeln!(io.error, "usage: bun lsp query <kind> <file>[:<line>[:<column>]] [<text>]");
        return 2;
    };
    let Some(kind) = QueryKind::parse(kind) else {
        let _ = writeln!(io.error, "error: unknown query {kind:?}: diagnostics, definition, references, hover, symbols, workspace-symbols, rename, context, callers, callees, fix");
        return 2;
    };
    let (file, line, column) = split_location(location);
    let mut query = Query::new(kind, file);
    query.line = line;
    query.column = column.or_else(|| line.map(|_| 1));
    query.text = rest.first().cloned();
    query.limit = flags.limit;
    query.apply = flags.apply;
    query.timeout_ms = flags.timeout;
    let query = query.absolute();
    let answer = if flags.no_daemon {
        let service = Service::new(options.clone());
        let answer = service.query(&query, None);
        service.shutdown();
        answer
    } else {
        client::query(&query, options)
    };
    match answer {
        Ok(answer) => {
            if flags.json {
                print_json(io, &answer);
            } else {
                let cwd = std::env::current_dir().unwrap_or_default();
                let _ = write!(io.output, "{}", answer.render(&cwd));
            }
            i32::from(answer.has_errors())
        }
        Err(message) => {
            if flags.json {
                print_json(io, &json!({ "error": message }));
            } else {
                let _ = writeln!(io.error, "error: {message}");
            }
            2
        }
    }
}

fn warm_command(io: &mut Io, flags: &Flags, options: &Options) -> i32 {
    let root = workspace_of(flags.positional.first());
    let started = Instant::now();
    let request = json!({ "op": "warm", "root": root, "languages": flags.languages });
    match client::send(&root, &request, options, true) {
        Ok(response) => {
            if flags.json {
                print_json(io, &response);
                return 0;
            }
            for warmed in response["warmed"].as_array().into_iter().flatten() {
                let language = warmed["language"].as_str().unwrap_or("");
                match warmed.get("error").and_then(Value::as_str) {
                    Some(error) => drop(writeln!(io.output, "{language}: {error}")),
                    None => drop(writeln!(io.output, "{language}: {}", warmed["servers"].as_str().unwrap_or(""))),
                }
            }
            let _ = writeln!(io.output, "warm in {} ms: {}", started.elapsed().as_millis(), root.display());
            0
        }
        Err(message) => {
            let _ = writeln!(io.error, "error: {message}");
            1
        }
    }
}

fn status_command(io: &mut Io, flags: &Flags, options: &Options, stop: bool) -> i32 {
    let root = workspace_of(flags.positional.first());
    let request = json!({ "op": if stop { "stop" } else { "status" } });
    match client::send(&root, &request, options, false) {
        Ok(response) if stop => {
            let _ = writeln!(io.output, "stopped the bun lsp daemon of {}", root.display());
            drop(response);
            0
        }
        Ok(response) => {
            if flags.json {
                print_json(io, &response["status"]);
                return 0;
            }
            let status = &response["status"];
            let _ = writeln!(io.output, "daemon {} for {}", status["pid"], root.display());
            for server in status["servers"].as_array().into_iter().flatten() {
                let _ = writeln!(
                    io.output,
                    "  {} {} ({} open, idle {} s): {}",
                    server["language"].as_str().unwrap_or(""),
                    server["server"].as_str().unwrap_or(""),
                    server["openDocuments"],
                    server["idleSeconds"],
                    server["root"].as_str().unwrap_or(""),
                );
            }
            for graph in status["graphs"].as_array().into_iter().flatten() {
                let _ = writeln!(
                    io.output,
                    "  graph of {}: {} files, {} symbols, {} edges, {} links, built in {} ms",
                    graph["root"].as_str().unwrap_or(""),
                    graph["files"],
                    graph["nodes"],
                    graph["edges"],
                    graph["links"],
                    graph["buildMs"],
                );
            }
            0
        }
        Err(_) if stop => {
            let _ = writeln!(io.output, "no bun lsp daemon for {}", root.display());
            0
        }
        Err(message) => {
            if flags.json {
                print_json(io, &json!({ "running": false }));
                return 0;
            }
            let _ = writeln!(io.output, "{message}");
            0
        }
    }
}

fn servers_command(io: &mut Io, flags: &Flags, options: &Options) -> i32 {
    let root = workspace_of(flags.positional.first());
    let mut report = Vec::new();
    for language in Language::ALL {
        let project = language::project_root(language, &root.join("_"));
        let servers = language::discover(language, &project, options);
        let commands: Vec<String> = servers.primary.iter().chain(servers.secondary.iter()).map(|it| it.command_line()).collect();
        report.push(json!({ "language": language, "root": project, "servers": commands, "missing": servers.missing }));
        if !flags.json {
            match &servers.missing {
                Some(missing) => drop(writeln!(io.output, "{}: none (install {missing})", language.name())),
                None => drop(writeln!(io.output, "{}: {}", language.name(), commands.join(" + "))),
            }
        }
    }
    if flags.json {
        print_json(io, &report);
    }
    0
}

fn compdb_command(io: &mut Io, flags: &Flags, options: &Options) -> i32 {
    let dir = flags.positional.first().map_or_else(|| PathBuf::from("."), PathBuf::from);
    let dir = std::path::absolute(&dir).unwrap_or(dir);
    match language::generate_compilation_database(&dir, options) {
        Some(written) => {
            let _ = writeln!(io.output, "{}", written.join("compile_commands.json").display());
            0
        }
        None => {
            let _ = writeln!(
                io.error,
                "error: no build.ninja under {} (build first) and no scripts/clang-tools/gen_compile_commands.py",
                dir.display()
            );
            1
        }
    }
}

/// Runs `bun lsp <args>`. Returns the exit code.
pub fn main(args: &[String], mut io: Io, options: Options) -> i32 {
    let (command, rest) = match args.split_first() {
        Some((command, rest)) if !command.starts_with("--") || command == "--help" || command == "-h" => (command.as_str(), rest),
        _ => ("", args),
    };
    if matches!(command, "" | "serve") {
        if let Some(unknown) = rest.iter().find(|it| *it != "--stdio") {
            let _ = writeln!(io.error, "error: unknown option {unknown}");
            return 2;
        }
        return proxy::run(&mut BufReader::new(io.input), io.output, options);
    }
    let flags = match parse_flags(rest) {
        Ok(flags) => flags,
        Err(message) => {
            let _ = writeln!(io.error, "error: {message}");
            return 2;
        }
    };
    match command {
        "query" | "q" => query_command(&mut io, &flags, &options),
        "warm" => warm_command(&mut io, &flags, &options),
        "status" => status_command(&mut io, &flags, &options, false),
        "stop" => status_command(&mut io, &flags, &options, true),
        "servers" => servers_command(&mut io, &flags, &options),
        "compdb" => compdb_command(&mut io, &flags, &options),
        "daemon" => {
            let root = flags.root.clone().unwrap_or_else(|| workspace_of(flags.positional.first()));
            daemon::serve(&root, options, flags.warm)
        }
        "help" | "--help" | "-h" => {
            let _ = write!(io.output, "{HELP}");
            0
        }
        _ => {
            let _ = writeln!(io.error, "error: unknown command {command:?}\n\n{HELP}");
            2
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_locations() {
        assert_eq!(split_location("a.ts:3:7"), (PathBuf::from("a.ts"), Some(3), Some(7)));
        assert_eq!(split_location("a.ts:3"), (PathBuf::from("a.ts"), Some(3), None));
        assert_eq!(split_location("a.ts"), (PathBuf::from("a.ts"), None, None));
        assert_eq!(split_location(r"C:\x\a.ts:3:7"), (PathBuf::from(r"C:\x\a.ts"), Some(3), Some(7)));
        assert_eq!(split_location(r"C:\x\a.ts"), (PathBuf::from(r"C:\x\a.ts"), None, None));
    }

    #[test]
    fn parses_flags() {
        let args: Vec<String> = ["hover", "a.ts:1:2", "--json", "--limit=5", "--lang", "python,rust"].map(String::from).to_vec();
        let flags = parse_flags(&args).unwrap();
        assert!(flags.json);
        assert_eq!(flags.limit, Some(5));
        assert_eq!(flags.languages, [Language::Python, Language::Rust]);
        assert_eq!(flags.positional, ["hover", "a.ts:1:2"]);
    }
}
