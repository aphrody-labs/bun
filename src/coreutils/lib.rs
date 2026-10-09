//! GNU coreutils from uutils (MIT, vendored by `scripts/build/deps/uutils.ts`), linked into the
//! `bun` binary as a multi-call set: `bun` started under an applet name (`head`, `sort`, ...;
//! a link, a copy or `Bun.spawn({ argv0 })`) runs that utility, and Bun Shell runs an applet when
//! the command is not on PATH. Commands that Bun Shell implements as builtins (`cat`, `ls`,
//! `echo`, `test`, ...) are deliberately absent: one implementation per command.
//!
//! Nothing here runs unless argv0 names an applet; uucore is built with `lazy-startup`, so the
//! utilities register no constructor.

use std::ffi::OsString;
use std::io::Write as _;

macro_rules! applets {
    (all: [$($name:literal => $krate:ident,)*] unix: [$($uname:literal => $ukrate:ident,)*]) => {
        /// Every applet name.
        pub const APPLETS: &[&str] = &[$($name,)* $(#[cfg(unix)] $uname,)*];

        fn call(applet: &str, args: Vec<OsString>) -> i32 {
            match applet {
                $($name => $krate::uumain(args.into_iter()),)*
                $(#[cfg(unix)]
                $uname => $ukrate::uumain(args.into_iter()),)*
                _ => 127,
            }
        }
    };
}

applets! {
all: [
    "arch" => uu_arch,
    "b2sum" => uu_b2sum,
    "base32" => uu_base32,
    "base64" => uu_base64,
    "basenc" => uu_basenc,
    "cksum" => uu_cksum,
    "comm" => uu_comm,
    "csplit" => uu_csplit,
    "cut" => uu_cut,
    "date" => uu_date,
    "dd" => uu_dd,
    "df" => uu_df,
    "du" => uu_du,
    "env" => uu_env,
    "expand" => uu_expand,
    "expr" => uu_expr,
    "factor" => uu_factor,
    "fmt" => uu_fmt,
    "fold" => uu_fold,
    "head" => uu_head,
    "hostid" => uu_hostid,
    "hostname" => uu_hostname,
    "join" => uu_join,
    "link" => uu_link,
    "ln" => uu_ln,
    "md5sum" => uu_md5sum,
    "mktemp" => uu_mktemp,
    "nice" => uu_nice,
    "nl" => uu_nl,
    "nproc" => uu_nproc,
    "numfmt" => uu_numfmt,
    "od" => uu_od,
    "paste" => uu_paste,
    "pathchk" => uu_pathchk,
    "pr" => uu_pr,
    "printenv" => uu_printenv,
    "printf" => uu_printf,
    "ptx" => uu_ptx,
    "readlink" => uu_readlink,
    "realpath" => uu_realpath,
    "rmdir" => uu_rmdir,
    "sha1sum" => uu_sha1sum,
    "sha224sum" => uu_sha224sum,
    "sha256sum" => uu_sha256sum,
    "sha384sum" => uu_sha384sum,
    "sha512sum" => uu_sha512sum,
    "shred" => uu_shred,
    "shuf" => uu_shuf,
    "sleep" => uu_sleep,
    "sort" => uu_sort,
    "split" => uu_split,
    "sum" => uu_sum,
    "sync" => uu_sync,
    "tac" => uu_tac,
    "tail" => uu_tail,
    "tee" => uu_tee,
    "tr" => uu_tr,
    "truncate" => uu_truncate,
    "tsort" => uu_tsort,
    "tty" => uu_tty,
    "uname" => uu_uname,
    "unexpand" => uu_unexpand,
    "uniq" => uu_uniq,
    "unlink" => uu_unlink,
    "wc" => uu_wc,
    "whoami" => uu_whoami,
]
unix: [
    "chgrp" => uu_chgrp,
    "chmod" => uu_chmod,
    "chown" => uu_chown,
    "chroot" => uu_chroot,
    "groups" => uu_groups,
    "id" => uu_id,
    "install" => uu_install,
    "logname" => uu_logname,
    "mkfifo" => uu_mkfifo,
    "mknod" => uu_mknod,
    "stat" => uu_stat,
    "stty" => uu_stty,
    "timeout" => uu_timeout,
]
}

/// File names are case-insensitive on Windows.
fn same(name: &[u8], applet: &str) -> bool {
    if cfg!(windows) {
        name.eq_ignore_ascii_case(applet.as_bytes())
    } else {
        name == applet.as_bytes()
    }
}

/// The applet named by `argv0`: its last path component, without a trailing `.exe` on Windows.
pub fn applet_name(argv0: &[u8]) -> Option<&'static str> {
    let name = argv0
        .rsplit(|byte| *byte == b'/' || (cfg!(windows) && *byte == b'\\'))
        .next()
        .unwrap_or(argv0);
    #[cfg(windows)]
    let name = match name.len().checked_sub(4) {
        Some(stem) if name[stem..].eq_ignore_ascii_case(b".exe") => &name[..stem],
        _ => name,
    };
    APPLETS.iter().copied().find(|applet| same(name, applet))
}

/// Runs `applet` with `args` (`args[0]` is the name it reports in messages); returns the exit code.
pub fn run(applet: &str, args: &[&[u8]]) -> i32 {
    let Some(name) = APPLETS.iter().copied().find(|name| *name == applet) else {
        return 127;
    };
    uucore::panic::preserve_inherited_sigpipe();
    uucore::panic::mute_sigpipe_panic();
    if let Err(err) = uucore::locale::setup_localization(name) {
        let _ = writeln!(std::io::stderr(), "{name}: could not init the localization system: {err}");
        return 99;
    }
    let args: Vec<OsString> = args.iter().map(|arg| os_string(arg)).collect();
    let code = call(name, args);
    if let Err(err) = std::io::stdout().flush() {
        let _ = writeln!(std::io::stderr(), "{name}: error flushing stdout: {err}");
    }
    code
}

#[cfg(unix)]
fn os_string(bytes: &[u8]) -> OsString {
    std::os::unix::ffi::OsStringExt::from_vec(bytes.to_vec())
}

#[cfg(windows)]
fn os_string(bytes: &[u8]) -> OsString {
    // SAFETY: Bun's Windows argv is WTF-8 decoded from the UTF-16 command line, the encoding
    // `OsStr` uses on Windows.
    unsafe { std::ffi::OsStr::from_encoded_bytes_unchecked(bytes) }.to_os_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names() {
        assert_eq!(applet_name(b"/usr/bin/head"), Some("head"));
        assert_eq!(applet_name(b"sort"), Some("sort"));
        assert_eq!(applet_name(b"bun"), None);
        assert_eq!(applet_name(b"cat"), None);
        #[cfg(windows)]
        assert_eq!(applet_name(br"C:\x\SHA256SUM.EXE"), Some("sha256sum"));
        assert!(APPLETS.iter().all(|name| applet_name(name.as_bytes()) == Some(*name)));
    }
}
