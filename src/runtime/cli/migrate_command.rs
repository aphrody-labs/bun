//! `bun migrate`: reads a repository that uses Node.js and another package manager, reports what Bun does differently
//! and rewrites what it can. The engine is `bun_migrate`; this file lists, reads and writes files for it, and prints
//! its report.

use bstr::BStr;

use bun_core::{Global, Output, ZStr, strings};
use bun_migrate::{Files, Format, Options, Severity, Target};
use bun_paths::OSPathSlice;
use bun_sys::{Dir, Fd, File};

pub(crate) struct MigrateCommand;

// Folders that hold what other tools generate or install, wherever they are.
#[cfg(not(windows))]
const SKIP_DIRS: &[&OSPathSlice] = &[b"node_modules", b".git", b".turbo", b".next", b".yarn", b".pnpm-store", b"dist", b"coverage"];
#[cfg(windows)]
const SKIP_DIRS: &[&OSPathSlice] = &[
    bun_core::w!("node_modules"),
    bun_core::w!(".git"),
    bun_core::w!(".turbo"),
    bun_core::w!(".next"),
    bun_core::w!(".yarn"),
    bun_core::w!(".pnpm-store"),
    bun_core::w!("dist"),
    bun_core::w!("coverage"),
];

/// The files below the working directory.
struct WorkingDirectory;

impl Files for WorkingDirectory {
    fn list(&self) -> Vec<Vec<u8>> {
        let mut paths = Vec::new();
        let Ok(dir) = Dir::open(b".") else { return paths };
        let Ok(mut walker) = bun_sys::walker_skippable::walk_owned(dir, &[], SKIP_DIRS) else { return paths };
        while let Ok(Some(entry)) = walker.next() {
            if entry.kind != bun_sys::FileKind::File {
                continue;
            }
            #[cfg(windows)]
            let mut path: Vec<u8> = strings::to_utf8_alloc(entry.path);
            #[cfg(not(windows))]
            let mut path: Vec<u8> = entry.path.as_bytes().to_vec();
            if cfg!(windows) {
                path.iter_mut().for_each(|byte| *byte = if *byte == b'\\' { b'/' } else { *byte });
            }
            paths.push(path);
        }
        paths
    }

    fn read(&self, path: &[u8]) -> Option<Vec<u8>> {
        File::read_from(Fd::cwd(), path).ok()
    }

    fn write(&mut self, path: &[u8], data: &[u8]) -> bool {
        File::write_file(Fd::cwd(), &bun_core::ZBox::from_vec(path.to_vec()), data).is_ok()
    }
}

struct Command {
    options: Options,
    path: Option<&'static [u8]>,
    check: bool,
}

fn usage_error(message: core::fmt::Arguments<'_>) -> ! {
    Output::err_generic("{}", (message,));
    bun_core::note!("run 'bun migrate --help' for more information");
    Global::exit(2);
}

/// The value of `--name value` or `--name=value`.
fn value_of<'a>(flag: &[u8], inline: Option<&'static [u8]>, rest: &mut impl Iterator<Item = &'a &'static ZStr>) -> &'static [u8] {
    match inline.or_else(|| rest.next().map(|next| next.as_bytes())) {
        Some(value) => value,
        None => usage_error(format_args!("{} needs a value", BStr::new(flag))),
    }
}

/// `args` is everything after `migrate`.
fn parse(args: &[&'static ZStr]) -> Command {
    let mut command = Command {
        options: Options {
            write: false,
            aggressive: false,
            replace_packages: false,
            target: Target::Bun,
            format: Format::Text,
            registries: Vec::new(),
            rules: Vec::new(),
            ignore: Vec::new(),
        },
        path: None,
        check: false,
    };
    let mut rest = args.iter();
    while let Some(arg) = rest.next() {
        let arg = arg.as_bytes();
        let (flag, inline) = match strings::split_once_char(arg, b'=') {
            Some((flag, value)) if arg.starts_with(b"--") => (flag, Some(value)),
            _ => (arg, None),
        };
        match flag {
            b"-h" | b"--help" => {
                print_help();
                Global::exit(0);
            }
            b"--write" => command.options.write = true,
            b"--aggressive" => command.options.aggressive = true,
            b"--replace-packages" => command.options.replace_packages = true,
            b"--check" => command.check = true,
            b"--target" => {
                command.options.target = match value_of(flag, inline, &mut rest) {
                    b"bun" => Target::Bun,
                    b"rust" => Target::Rust,
                    other => usage_error(format_args!("--target must be bun or rust, not \"{}\"", BStr::new(other))),
                }
            }
            b"--format" => {
                let name = value_of(flag, inline, &mut rest);
                match Format::parse(name) {
                    Some(format) => command.options.format = format,
                    None => usage_error(format_args!("--format must be one of: text, json, jsonl, markdown, sarif, not \"{}\"", BStr::new(name))),
                }
            }
            b"--ignore" => command.options.ignore.push(value_of(flag, inline, &mut rest).to_vec()),
            b"--registry" => {
                let path = value_of(flag, inline, &mut rest);
                match File::read_from(Fd::cwd(), path) {
                    Ok(contents) => command.options.registries.push((String::from_utf8_lossy(path).into_owned(), contents)),
                    Err(err) => {
                        Output::err(err, "Could not read the registry \"{}\"", (BStr::new(path),));
                        Global::exit(2);
                    }
                }
            }
            b"--rule" => {
                let setting = value_of(flag, inline, &mut rest);
                let Some((id, level)) = strings::split_once_char(setting, b'=') else {
                    usage_error(format_args!("--rule takes <id>=<off|info|warn|error>, not \"{}\"", BStr::new(setting)));
                };
                let level = match level {
                    b"off" => None,
                    other => match Severity::parse(other) {
                        Some(severity) => Some(severity),
                        None => usage_error(format_args!("--rule takes <id>=<off|info|warn|error>, not \"{}\"", BStr::new(setting))),
                    },
                };
                command.options.rules.push((id.to_vec(), level));
            }
            _ if flag.starts_with(b"-") => usage_error(format_args!("Unknown flag \"{}\"", BStr::new(flag))),
            _ if command.path.is_some() => usage_error(format_args!("bun migrate takes one directory")),
            _ => command.path = Some(arg),
        }
    }
    if command.check && (command.options.write || command.options.aggressive) {
        usage_error(format_args!("--check does not write: drop --write and --aggressive"));
    }
    command.options.write |= command.options.aggressive;
    command
}

impl MigrateCommand {
    /// `args` is everything after `migrate`.
    pub(crate) fn exec(args: &[&'static ZStr]) -> crate::Result<()> {
        let command = parse(args);
        if let Some(path) = command.path {
            if let bun_sys::Result::Err(err) = bun_sys::chdir(&bun_core::ZBox::from_vec(path.to_vec())) {
                Output::err(err, "Could not change directory to \"{}\"", (BStr::new(path),));
                Global::exit(2);
            }
        }
        let outcome = match bun_migrate::run(&mut WorkingDirectory, &command.options) {
            Ok(outcome) => outcome,
            Err(error) => {
                Output::err_generic("{}: line {}: {}", (BStr::new(error.file.as_bytes()), error.line, BStr::new(error.message.as_bytes())));
                Global::exit(2);
            }
        };
        let report = outcome.report.render(command.options.format);
        let written = bun_sys::write_all_to_stdio(bun_core::Fd::stdout(), &report);
        let reader_is_gone = |error: &bun_sys::Error| matches!(error.get_errno(), bun_sys::E::EPIPE | bun_sys::E::ENOTCONN | bun_sys::E::ECONNRESET);
        if let Err(error) = written {
            if !reader_is_gone(&error) {
                Output::err_generic("Cannot write standard output: {}", (BStr::new(error.name()),));
                Global::exit(2);
            }
        }
        Output::flush();
        Global::exit(u32::from(command.check && outcome.remaining > 0));
    }
}

pub(crate) fn print_help() {
    bun_core::pretty!(
        "\
<b>Usage<r>: <b><green>bun migrate<r> <cyan>[flags]<r> <blue>[\\<directory\\>]<r>
  Report what a Node.js repository needs to run on Bun, and rewrite what can be rewritten.

  Reads package.json files, scripts, CI files, Dockerfiles, Husky hooks and JavaScript sources. The lockfile of npm,
  Yarn or pnpm is read by <b>bun install<r>, which writes bun.lock.

<b>Flags<r>:
      <cyan>--write<r>               Apply the safe rewrites
      <cyan>--aggressive<r>          Also apply rewrites that change behavior, such as node to bun (implies --write)
      <cyan>--replace-packages<r>    Replace execa, glob, rimraf, dotenv, node-fetch, ws and del with what Bun has, and remove
                               the dependencies that no use is left of
      <cyan>--check<r>               Exit with 1 if warnings or errors remain, and write nothing
      <cyan>--target<r> <blue>\\<bun|rust\\><r>  <d>(default: bun)<r> With rust, also plan which packages become Rust crates
      <cyan>--format<r> <blue>\\<name\\><r>    <d>(default: text)<r> text, json, jsonl, markdown or sarif
      <cyan>--ignore<r> <blue>\\<path\\><r>    Skip a directory or a glob of file names. Can be repeated
      <cyan>--registry<r> <blue>\\<file\\><r>  Read more rules from a TOML file. Can be repeated
      <cyan>--rule<r> <blue>\\<id\\>=\\<level\\><r> Set a rule to off, info, warn or error. Can be repeated
  <cyan>-h, --help<r>                Print this menu

<b>Examples<r>:
  <d>See what a repository needs<r>
  <b><green>bun migrate<r>

  <d>Apply the safe rewrites, then install<r>
  <b><green>bun migrate<r> <cyan>--write<r> <blue>path/to/repo<r>
  <b><green>bun install<r>

  <d>Fail a CI job while something is left<r>
  <b><green>bun migrate<r> <cyan>--check<r> <cyan>--format<r> <blue>sarif<r>
"
    );
    Output::flush();
}
