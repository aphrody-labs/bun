//! cmd.exe commands in Bun Shell: `dir`, `copy`, `del`/`erase`, `set`, `where` and `start`, used
//! when the name is neither a builtin nor found on PATH, run as the equivalent shell command.
//! PowerShell scripts (`.ps1`) run through `pwsh`, else Windows PowerShell.

use bun_core::strings;

/// Rewrites a cmd.exe command line in place (`args[0]` is the command; words may end in NUL).
/// Returns `false`, leaving `args` untouched, when `args[0]` is not one of these commands.
pub(crate) fn rewrite(args: &mut Vec<Vec<u8>>) -> bool {
    let Some(first) = args.first() else {
        return false;
    };
    let name = word(first).to_ascii_lowercase();
    let program: &[&[u8]] = match &name[..] {
        b"dir" => &[b"ls"],
        b"copy" => &[b"cp"],
        b"del" | b"erase" => &[b"rm"],
        b"set" => &[b"export"],
        b"where" => &[b"which"],
        b"start" => OPENER,
        _ => return false,
    };
    let mut flags: Vec<Vec<u8>> = Vec::new();
    let mut operands: Vec<Vec<u8>> = Vec::new();
    for arg in args.drain(1..) {
        let w = word(&arg);
        if !is_switch(w) {
            operands.push(arg);
            continue;
        }
        let flag: &[u8] = match (&name[..], w[1].to_ascii_lowercase()) {
            (b"dir", b's') => b"-R",
            (b"dir", b'a') => b"-a",
            (b"del" | b"erase", b'f') => b"-f",
            _ => continue,
        };
        if !flags.iter().any(|f| word(f) == flag) {
            flags.push(flag.to_vec());
        }
    }
    args.clear();
    args.extend(program.iter().map(|w| w.to_vec()));
    args.extend(flags);
    args.extend(operands);
    true
}

/// The PowerShell hosts tried, in order, to run a `.ps1` script.
pub(crate) const POWERSHELL_HOSTS: [&[u8]; 2] = [b"pwsh", b"powershell"];

/// Arguments put between the PowerShell host and the script path.
pub(crate) const POWERSHELL_ARGS: [&[u8]; 5] = [b"-NoLogo", b"-NoProfile", b"-ExecutionPolicy", b"Bypass", b"-File"];

pub(crate) fn is_powershell_script(path: &[u8]) -> bool {
    path.len() > 4 && strings::eql_case_insensitive_asciii_check_length(&path[path.len() - 4..], b".ps1")
}

fn word(arg: &[u8]) -> &[u8] {
    arg.strip_suffix(b"\0").unwrap_or(arg)
}

/// `/q`, `/-y`, `/a:h`: cmd.exe switches, never paths (`/tmp` has more than one letter).
fn is_switch(w: &[u8]) -> bool {
    match w {
        [b'/', c] => c.is_ascii_alphabetic() || *c == b'?',
        [b'/', b'-', c] => c.is_ascii_alphabetic(),
        [b'/', c, b':', ..] => c.is_ascii_alphabetic(),
        _ => false,
    }
}

/// Opens a file, folder or URL with its default handler, like `start <target>`.
const OPENER: &[&[u8]] = if cfg!(windows) {
    &[b"rundll32.exe", b"url.dll,FileProtocolHandler"]
} else if cfg!(target_os = "macos") {
    &[b"open"]
} else {
    &[b"xdg-open"]
};

#[cfg(test)]
mod tests {
    use super::*;

    fn run(line: &[&str]) -> Option<Vec<String>> {
        let mut args: Vec<Vec<u8>> = line.iter().map(|w| format!("{w}\0").into_bytes()).collect();
        rewrite(&mut args).then(|| {
            args.iter()
                .map(|a| String::from_utf8(word(a).to_vec()).unwrap())
                .collect()
        })
    }

    #[test]
    fn rewrites() {
        assert_eq!(run(&["DIR", "/s", "/a:h", "/b", "src"]).unwrap(), ["ls", "-R", "-a", "src"]);
        assert_eq!(run(&["copy", "/y", "a", "/tmp/b"]).unwrap(), ["cp", "a", "/tmp/b"]);
        assert_eq!(run(&["del", "/q", "/f", "x"]).unwrap(), ["rm", "-f", "x"]);
        assert_eq!(run(&["set", "A=1"]).unwrap(), ["export", "A=1"]);
        assert_eq!(run(&["where", "bun"]).unwrap(), ["which", "bun"]);
        assert_eq!(run(&["ls", "/s"]), None);
        assert!(is_powershell_script(b"C:\\x\\Run.PS1"));
        assert!(!is_powershell_script(b"ps1"));
    }
}
