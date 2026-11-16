//! `sh` and `bash`: the rubash engine (GNU Bash 5.3 in Rust) driven through its Session API. The command line is parsed by
//! the engine's own `ShellInvocation`, so `$-`, `-e`, `-o pipefail` and `--posix` behave as in bash.

use rubash::api::{RunOptions, Session};
use rubash::invocation::ShellInvocation;
use std::ffi::OsString;

enum Source {
    Command(String),
    File(String),
    Stdin,
}

/// Runs `name [OPTIONS] -c COMMAND [NAME [ARGS...]] | name [OPTIONS] FILE [ARGS...] | name [OPTIONS]` (stdin) and returns the
/// shell's exit status. `name` is `$0` for a command read from stdin or given with `-c` and no NAME operand.
pub fn run(name: &str, args: &[OsString]) -> i32 {
    let args: Vec<String> = args.iter().map(|a| a.to_string_lossy().into_owned()).collect();
    let inv = match ShellInvocation::parse(&args) {
        Ok(inv) => inv,
        Err(e) => {
            eprintln!("{name}: {e}");
            return 2;
        }
    };
    if inv.interactive {
        eprintln!("{name}: the embedded engine runs commands and scripts, not an interactive prompt");
        return 2;
    }
    let source = if let Some(text) = inv.command.clone() {
        Source::Command(text)
    } else if let Some(path) = inv.script.clone() {
        Source::File(path)
    } else {
        Source::Stdin
    };
    let argv0 = match &source {
        Source::Command(_) => inv.command_name.clone().unwrap_or_else(|| name.to_string()),
        Source::File(path) => path.clone(),
        Source::Stdin => name.to_string(),
    };
    let mut builder = Session::builder().argv0(argv0).process_exit_role(true);
    if let Source::Command(text) = &source {
        builder = builder.env("BASH_EXECUTION_STRING", text.clone());
    }
    let mut session = match builder.build() {
        Ok(s) => s,
        Err(e) => {
            eprintln!("{name}: cannot start the engine: {e:?}");
            return 2;
        }
    };
    if let Err(e) = session.apply_invocation_before_startup(&inv) {
        eprintln!("{name}: {e}");
        return 2;
    }
    session.set_positional(inv.positional_params.clone());
    let outcome = match source {
        Source::Command(text) => {
            let mut opts = RunOptions::new();
            opts.source_name = Some("-c".to_string());
            session.set_command_string_mode(true);
            let outcome = session.run(&text, &opts);
            session.set_command_string_mode(false);
            outcome
        }
        Source::File(path) => match std::fs::read(&path) {
            Ok(bytes) => {
                let mut opts = RunOptions::new();
                opts.source_name = Some(path);
                session.run(&String::from_utf8_lossy(&bytes), &opts)
            }
            Err(e) => {
                eprintln!("{name}: {path}: {e}");
                return 127;
            }
        },
        Source::Stdin => session.run_stdin(),
    };
    match outcome {
        Ok(_) => session.close(),
        Err(e) => {
            eprintln!("{name}: {e:?}");
            2
        }
    }
}
