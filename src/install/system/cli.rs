//! `bun pm apk|deb|pacman <command>`: the system package managers on an
//! explicit root, without their binaries.
//!
//! ```text
//! bun pm apk [--root DIR] [--initdb] [-X URL]... [--arch A] [--keys-dir DIR]
//!            [--allow-untrusted] [--no-scripts] [-U] [-u] [--force-overwrite] [-q]
//!            add|del|upgrade|update|search|info|list|fix|audit [args]
//! ```

use super::apk::{Engine, Settings};
use super::{Ctx, Error, Result, join, lossy};
use bun_core::strings;

const USAGE: &str = "usage: bun pm apk [--root DIR] [--initdb] [-X|--repository URL]... [--arch ARCH] [--keys-dir DIR]
                  [--allow-untrusted] [--no-scripts] [-U|--update-cache] [-u|--upgrade] [--force-overwrite] [-q]
                  <add|del|upgrade|update|search|info|list|fix|audit> [args]";

/// Whether `bun pm <name>` is a system package manager subcommand.
pub fn is_source_command(name: &[u8]) -> bool {
    matches!(name, b"apk" | b"deb" | b"apt" | b"pacman")
}

/// Runs `bun pm <source> <args…>` and returns the process exit code.
pub fn run(source: &[u8], args: &[&[u8]]) -> i32 {
    let code = match source {
        b"apk" => run_apk(args),
        b"deb" | b"apt" | b"pacman" => Err(Error::Unsupported(format!(
            "bun pm {}: not implemented yet",
            lossy(source)
        ))),
        _ => Err(Error::Unsupported(format!("unknown system source \"{}\"", lossy(source)))),
    };
    let code = match code {
        Ok(code) => code,
        Err(err) => {
            bun_core::pretty_errorln!("<r><red>error<r>: {}", err);
            1
        }
    };
    bun_core::output::flush();
    code
}

fn install_cache_dir(env: &bun_dotenv::Loader) -> Vec<u8> {
    let get = |k: &[u8]| env.get(k).filter(|v| !v.is_empty()).map(<[u8]>::to_vec);
    if let Some(dir) = get(b"BUN_INSTALL_CACHE_DIR") {
        return dir;
    }
    if let Some(dir) = get(b"BUN_INSTALL") {
        return join(&dir, &[b"install", b"cache"]);
    }
    if let Some(dir) = get(b"XDG_CACHE_HOME") {
        return join(&dir, &[b".bun", b"install", b"cache"]);
    }
    let home = get(b"HOME").or_else(|| get(b"USERPROFILE")).unwrap_or_else(|| b".".to_vec());
    join(&home, &[b".bun", b"install", b"cache"])
}

fn absolute(path: &[u8]) -> Vec<u8> {
    let is_abs = path.first().is_some_and(|&c| c == b'/' || c == b'\\')
        || (path.len() > 2 && path[1] == b':' && path[0].is_ascii_alphabetic());
    if is_abs {
        return path.to_vec();
    }
    match bun_sys::getcwd_alloc() {
        Ok(cwd) => join(cwd.as_bytes(), &[path]),
        Err(_) => path.to_vec(),
    }
}

fn out(line: &str) {
    bun_core::prettyln!("{}", line);
}

fn run_apk(args: &[&[u8]]) -> Result<i32> {
    let mut s = Settings { root: b"/".to_vec(), ..Settings::default() };
    let mut verbose = false;
    let mut command: Option<String> = None;
    let mut rest: Vec<String> = Vec::new();
    let mut flags: Vec<String> = Vec::new();
    let mut i = 0;
    let value = |i: &mut usize, name: &str| -> Result<String> {
        *i += 1;
        args.get(*i).map(|v| lossy(v)).ok_or_else(|| Error::Parse(format!("{name} needs a value\n{USAGE}")))
    };
    while i < args.len() {
        let raw = lossy(args[i]);
        let (flag, inline) = match strings::index_of_char(raw.as_bytes(), b'=') {
            Some(eq) if raw.starts_with("--") => (raw[..eq as usize].to_owned(), Some(raw[eq as usize + 1..].to_owned())),
            _ => (raw.clone(), None),
        };
        let take = |i: &mut usize, name: &str| -> Result<String> {
            match &inline {
                Some(v) => Ok(v.clone()),
                None => value(i, name),
            }
        };
        match flag.as_str() {
            "--root" | "-p" => s.root = absolute(take(&mut i, "--root")?.as_bytes()),
            "--initdb" => s.initdb = true,
            "--repository" | "--repo" | "-X" => s.repositories.push(take(&mut i, "--repository")?),
            "--arch" => s.arch = Some(take(&mut i, "--arch")?),
            "--keys-dir" => s.keys_dir = Some(absolute(take(&mut i, "--keys-dir")?.as_bytes())),
            "--allow-untrusted" => s.allow_untrusted = true,
            "--no-scripts" => s.no_scripts = true,
            "--update-cache" | "-U" => s.update_cache = true,
            "--upgrade" | "-u" => s.upgrade = true,
            "--force-overwrite" => s.force_overwrite = true,
            "--no-network" => {}
            "--quiet" | "-q" => s.quiet = true,
            "--verbose" | "-v" => verbose = true,
            "--help" | "-h" => {
                out(USAGE);
                return Ok(0);
            }
            _ if raw.starts_with('-') && command.is_some() => flags.push(raw),
            _ if raw.starts_with('-') => return Err(Error::Parse(format!("unknown option {raw}\n{USAGE}"))),
            _ if command.is_none() => command = Some(raw),
            _ => rest.push(raw),
        }
        i += 1;
    }
    let Some(command) = command else {
        out(USAGE);
        return Ok(1);
    };
    let has = |names: &[&str]| flags.iter().any(|f| names.contains(&f.as_str()));

    let mut env = bun_dotenv::Loader::init();
    env.quiet = true;
    env.load_process().map_err(|_| Error::Io("out of memory".to_owned()))?;
    let cache = install_cache_dir(&env);
    let mut ctx = Ctx::new(&env, &cache, verbose);
    if s.update_cache {
        ctx.options.refresh = true;
    }
    if s.arch.is_none() {
        s.arch.clone_from(&ctx.options.arch);
    }
    let read_only = matches!(command.as_str(), "search" | "info" | "list" | "audit");
    if read_only {
        s.initdb = false;
    }
    let mut engine = Engine::open(&ctx, s)?;
    match command.as_str() {
        "add" => {
            if rest.is_empty() {
                return Err(Error::Parse(format!("add: no packages given\n{USAGE}")));
            }
            engine.add(&rest)?;
        }
        "del" | "delete" | "remove" => engine.del(&rest)?,
        "upgrade" => engine.upgrade()?,
        "update" => {
            let n = engine.update()?;
            out(&format!("OK: {n} distinct packages available"));
        }
        "fix" => engine.fix(&rest)?,
        "search" => {
            let descriptions = has(&["-d", "--description"]);
            for p in engine.search(&rest, descriptions)? {
                if verbose || descriptions {
                    out(&format!("{} - {}", p.name_version(), p.description));
                } else {
                    out(&p.name_version());
                }
            }
        }
        "list" => {
            let installed_only = has(&["-I", "--installed"]);
            let mut rows: Vec<String> = engine
                .db
                .installed
                .iter()
                .map(|p| format!("{} {} {{{}}} ({}) [installed]", p.name_version(), p.arch, p.origin, p.license))
                .collect();
            if !installed_only {
                let names: Vec<String> = engine.db.installed.iter().map(|p| p.name.clone()).collect();
                for p in engine.search(&rest, false)? {
                    if !names.contains(&p.name) {
                        rows.push(format!("{} {} {{{}}} ({})", p.name_version(), p.arch, p.origin, p.license));
                    }
                }
            }
            rows.sort();
            for r in rows {
                out(&r);
            }
        }
        "info" => info(&mut engine, &rest, has(&["-L", "--contents"]))?,
        "audit" => {
            for (code, path) in engine.audit() {
                out(&format!("{code} {path}"));
            }
        }
        other => return Err(Error::Parse(format!("unknown command \"{other}\"\n{USAGE}"))),
    }
    Ok(0)
}

fn info(engine: &mut Engine<'_, '_>, names: &[String], contents: bool) -> Result<()> {
    if names.is_empty() {
        let mut list: Vec<&str> = engine.db.installed.iter().map(|p| p.name.as_str()).collect();
        list.sort_unstable();
        for name in list {
            out(name);
        }
        return Ok(());
    }
    for name in names {
        let pkg = match engine.db.installed_by_name(name) {
            Some(p) => p.clone(),
            None => {
                let found = engine.search(&[], false)?.into_iter().find(|p| p.name == *name);
                found.ok_or_else(|| Error::NotFound(format!("apk package \"{name}\"")))?
            }
        };
        let nv = pkg.name_version();
        if contents {
            out(&format!("{nv} contains:"));
            for path in pkg.file_paths() {
                out(&path);
            }
            out("");
            continue;
        }
        out(&format!("{nv} description:\n{}\n", pkg.description));
        out(&format!("{nv} webpage:\n{}\n", pkg.url));
        out(&format!("{nv} installed size:\n{}\n", human_size(pkg.installed_size)));
    }
    Ok(())
}

fn human_size(bytes: u64) -> String {
    const UNITS: [&str; 4] = ["B", "KiB", "MiB", "GiB"];
    let mut v = bytes;
    let mut u = 0;
    while v >= 10 * 1024 && u + 1 < UNITS.len() {
        v /= 1024;
        u += 1;
    }
    format!("{v} {}", UNITS[u])
}
