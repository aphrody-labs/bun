// SPDX-License-Identifier: Apache-2.0
//! `bun ssh` command line. `bun ssh [options] <destination> [command]` behaves like `ssh`; the
//! subcommands add transfers, forwards, keys, host keys, server management and diagnostics.
//!
//! Backend: the system OpenSSH by default (with ControlMaster multiplexing on Unix), the
//! in-process client with `--native`, `BUN_SSH_BACKEND=native`, or when no `ssh` is installed.

use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::process::Command;

use clap::{Args, Parser, Subcommand};

use crate::config::{Destination, HostConfig, Overrides};
use crate::native::{Session, SftpDriver};
use crate::{Error, Result, system, write_stderr, write_stdout};

#[derive(Args, Debug, Clone, Default)]
struct Conn {
    /// Remote port.
    #[arg(short = 'p', long = "port")]
    port: Option<u16>,
    /// Identity (private key) file.
    #[arg(short = 'i', long = "identity")]
    identity: Vec<PathBuf>,
    /// Remote user.
    #[arg(short = 'l', long = "login")]
    login: Option<String>,
    /// OpenSSH option (`Key=Value`).
    #[arg(short = 'o')]
    option: Vec<String>,
    /// Jump hosts (`ProxyJump`).
    #[arg(short = 'J', long = "jump")]
    jump: Option<String>,
    /// Configuration file instead of `~/.ssh/config`.
    #[arg(short = 'F')]
    config: Option<PathBuf>,
    /// Use the in-process client.
    #[arg(long, conflicts_with = "system")]
    native: bool,
    /// Use the system OpenSSH (default when installed).
    #[arg(long)]
    system: bool,
}

impl Conn {
    fn overrides(&self) -> Result<Overrides> {
        let mut overrides = Overrides {
            port: self.port,
            user: self.login.clone(),
            identity_files: self.identity.clone(),
            proxy_jump: self.jump.clone(),
            config_file: self.config.clone(),
            options: Vec::new(),
        };
        for option in &self.option {
            overrides.push_option(option)?;
        }
        Ok(overrides)
    }

    /// The system `ssh` to drive, or `None` for the in-process client.
    fn system_ssh(&self) -> Option<PathBuf> {
        let env_native = std::env::var("BUN_SSH_BACKEND").is_ok_and(|v| v.eq_ignore_ascii_case("native"));
        if self.native || (env_native && !self.system) {
            return None;
        }
        system::find("ssh")
    }
}

#[derive(Parser, Debug)]
#[command(name = "bun ssh", disable_help_subcommand = true, about = "SSH client, transfers, forwards and server")]
struct Cli {
    #[command(subcommand)]
    command: Cmd,
}

#[derive(Subcommand, Debug)]
enum Cmd {
    /// Run a command (streamed); `--json` collects {code, stdout, stderr}.
    Exec {
        #[command(flatten)]
        conn: Conn,
        /// Collect the output and print one JSON object (in-process client).
        #[arg(long)]
        json: bool,
        /// Do not forward stdin.
        #[arg(short = 'n')]
        no_stdin: bool,
        /// Force a pseudo-terminal.
        #[arg(short = 't')]
        tty: bool,
        destination: String,
        #[arg(trailing_var_arg = true, allow_hyphen_values = true, required = true)]
        command: Vec<String>,
    },
    /// Interactive login shell with a pseudo-terminal.
    Shell {
        #[command(flatten)]
        conn: Conn,
        destination: String,
    },
    /// Copy files (`[user@]host:path` for remote ends), like scp. `--delta` uses rsync.
    Cp {
        #[command(flatten)]
        conn: Conn,
        #[arg(short = 'r', long)]
        recursive: bool,
        /// Only send differences (system rsync when available, else skip unchanged files).
        #[arg(long)]
        delta: bool,
        source: String,
        target: String,
    },
    /// SFTP operations with JSON output.
    Sftp {
        #[command(flatten)]
        conn: Conn,
        /// ls, stat, tree, cat, get, put, rm, mkdir.
        op: String,
        destination: String,
        path: String,
        /// Local file for get/put; depth for tree.
        extra: Option<String>,
    },
    /// Port forwards: -L [bind:]port:host:hostport, -R ..., -D [bind:]port.
    Forward {
        #[command(flatten)]
        conn: Conn,
        #[arg(short = 'L')]
        local: Vec<String>,
        #[arg(short = 'R')]
        remote: Vec<String>,
        #[arg(short = 'D')]
        dynamic: Vec<String>,
        destination: String,
    },
    /// Print the effective configuration of a destination as JSON.
    Config {
        #[command(flatten)]
        conn: Conn,
        destination: String,
    },
    /// ssh-agent identities and key fingerprints.
    Keys {
        /// list, add <file>, fingerprint <file>.
        op: String,
        file: Option<PathBuf>,
    },
    /// Generate a key pair (passphrase from BUN_SSH_NEW_PASSPHRASE).
    Keygen {
        #[arg(short = 't', default_value = "ed25519")]
        kind: String,
        #[arg(short = 'b')]
        bits: Option<usize>,
        #[arg(short = 'C', default_value = "")]
        comment: String,
        #[arg(short = 'f')]
        file: PathBuf,
    },
    /// Check or record a host key: check|add <destination>.
    KnownHosts {
        #[command(flatten)]
        conn: Conn,
        op: String,
        destination: String,
    },
    /// System sshd (status, install, start, stop, enable) or `--embedded` server.
    Server {
        action: Option<String>,
        /// Run the embedded server (prints {"port","hostKey","fingerprint"} then serves).
        #[arg(long)]
        embedded: bool,
        #[arg(long, default_value = "127.0.0.1")]
        listen: String,
        #[arg(long, default_value_t = 0)]
        port: u16,
        #[arg(long)]
        authorized_keys: Option<PathBuf>,
        /// Environment variable holding the accepted password.
        #[arg(long)]
        password_env: Option<String>,
        #[arg(long)]
        host_key: Option<PathBuf>,
    },
    /// Detected OpenSSH, rsync, git and gh.
    Doctor,
}

const SUBCOMMANDS: &[&str] = &[
    "exec", "shell", "cp", "sftp", "forward", "config", "keys", "keygen", "known-hosts", "server", "doctor", "help", "--help", "-h",
];

/// Entry point. `args` excludes the program name and `ssh`.
pub fn main(args: Vec<OsString>, prog: &str) -> i32 {
    let first = args.first().and_then(|a| a.to_str()).unwrap_or("");
    let mut argv: Vec<OsString> = vec![prog.into()];
    if args.is_empty() {
        argv.push("--help".into());
    } else if !SUBCOMMANDS.contains(&first) {
        // `bun ssh [opts] host [cmd...]`: ssh compatibility.
        return ssh_compat(args);
    }
    argv.extend(args);
    let cli = match Cli::try_parse_from(argv) {
        Ok(cli) => cli,
        Err(err) => {
            let text = err.render().ansi().to_string();
            if err.use_stderr() { write_stderr(text.as_bytes()) } else { write_stdout(text.as_bytes()) }
            return err.exit_code();
        },
    };
    match run(cli.command) {
        Ok(code) => code,
        Err(err) => {
            write_stderr(format!("bun ssh: {err}\n").as_bytes());
            255
        },
    }
}

/// `bun ssh <ssh args>`: hands the arguments to the system ssh untouched, or runs an exec/shell
/// with the in-process client when none is installed.
fn ssh_compat(args: Vec<OsString>) -> i32 {
    if let Some(ssh) = (!std::env::var("BUN_SSH_BACKEND").is_ok_and(|v| v.eq_ignore_ascii_case("native"))).then(|| system::find("ssh")).flatten() {
        let mut command = Command::new(ssh);
        command.args(multiplex_args()).args(args);
        return status_code(command);
    }
    let strings: Vec<String> = args.iter().map(|a| a.to_string_lossy().into_owned()).collect();
    let mut conn = Conn { native: true, ..Conn::default() };
    let mut rest = strings.iter();
    let mut destination = None;
    while let Some(arg) = rest.next() {
        let mut value = || rest.next().cloned().ok_or_else(|| Error::InvalidInput(format!("{arg} needs a value")));
        let result: Result<()> = (|| {
            match arg.as_str() {
                "-p" => conn.port = Some(value()?.parse().map_err(|_| Error::InvalidInput("invalid port".into()))?),
                "-i" => conn.identity.push(PathBuf::from(value()?)),
                "-l" => conn.login = Some(value()?),
                "-o" => conn.option.push(value()?),
                "-J" => conn.jump = Some(value()?),
                "-F" => conn.config = Some(PathBuf::from(value()?)),
                "-t" | "-T" | "-q" | "-n" | "-4" | "-6" | "-A" | "-a" | "-x" | "-X" | "-C" | "-v" => {},
                other if other.starts_with('-') => return Err(Error::InvalidInput(format!("option {other} needs the system ssh"))),
                other => destination = Some(other.to_owned()),
            }
            Ok(())
        })();
        if let Err(err) = result {
            write_stderr(format!("bun ssh: {err}\n").as_bytes());
            return 255;
        }
        if destination.is_some() {
            break;
        }
    }
    let Some(destination) = destination else {
        write_stderr(b"bun ssh: missing destination\n");
        return 255;
    };
    let command: Vec<String> = rest.cloned().collect();
    let cmd = if command.is_empty() {
        Cmd::Shell { conn, destination }
    } else {
        Cmd::Exec { conn, json: false, no_stdin: false, tty: false, destination, command }
    };
    match run(cmd) {
        Ok(code) => code,
        Err(err) => {
            write_stderr(format!("bun ssh: {err}\n").as_bytes());
            255
        },
    }
}

/// Connection sharing for the system ssh on Unix (Windows OpenSSH has no ControlMaster).
fn multiplex_args() -> Vec<String> {
    let Some(ssh) = system::find("ssh") else { return Vec::new() };
    if !system::supports_control_master(&ssh) || std::env::var_os("BUN_SSH_NO_MULTIPLEX").is_some() {
        return Vec::new();
    }
    let Ok(dir) = crate::state_dir() else { return Vec::new() };
    vec![
        "-o".into(),
        "ControlMaster=auto".into(),
        "-o".into(),
        format!("ControlPath={}", dir.join("cm-%C").display()),
        "-o".into(),
        "ControlPersist=600".into(),
    ]
}

fn status_code(mut command: Command) -> i32 {
    match command.status() {
        Ok(status) => status.code().unwrap_or(255),
        Err(err) => {
            write_stderr(format!("bun ssh: {err}\n").as_bytes());
            255
        },
    }
}

fn shell_quote(arg: &str) -> String {
    if !arg.is_empty() && arg.bytes().all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b'/' | b'=' | b':' | b',' | b'@' | b'%' | b'+')) {
        arg.to_owned()
    } else {
        format!("'{}'", arg.replace('\'', r"'\''"))
    }
}

fn remote_command(words: &[String]) -> String {
    if words.len() == 1 { words[0].clone() } else { words.iter().map(|w| shell_quote(w)).collect::<Vec<_>>().join(" ") }
}

fn resolve(conn: &Conn, destination: &str) -> Result<HostConfig> {
    HostConfig::resolve(&Destination::parse(destination)?, &conn.overrides()?)
}

fn connect(conn: &Conn, destination: &str) -> Result<(tokio::runtime::Runtime, Session)> {
    let config = resolve(conn, destination)?;
    let runtime = crate::runtime()?;
    let session = runtime.block_on(Session::connect(&config))?;
    Ok((runtime, session))
}

fn system_ssh_command(ssh: &Path, conn: &Conn) -> Result<Command> {
    let mut command = Command::new(ssh);
    command.args(multiplex_args()).args(conn.overrides()?.openssh_args("-p"));
    Ok(command)
}

fn json(value: &serde_json::Value) {
    write_stdout(format!("{value}\n").as_bytes());
}

/// A `host:path` operand of `cp`. A single-letter prefix is a Windows drive.
fn split_remote(spec: &str) -> Option<(&str, &str)> {
    let (host, path) = spec.split_once(':')?;
    if host.is_empty() || host.contains(['/', '\\']) || (host.len() == 1 && host.as_bytes()[0].is_ascii_alphabetic()) {
        return None;
    }
    Some((host, if path.is_empty() { "." } else { path }))
}

fn run(command: Cmd) -> Result<i32> {
    match command {
        Cmd::Exec { conn, json: as_json, no_stdin, tty, destination, command } => {
            let remote = remote_command(&command);
            if !as_json {
                if let Some(ssh) = conn.system_ssh() {
                    let mut cmd = system_ssh_command(&ssh, &conn)?;
                    if no_stdin {
                        cmd.arg("-n");
                    }
                    cmd.arg(if tty { "-t" } else { "-T" }).arg("--").arg(&destination).arg(&remote);
                    return Ok(status_code(cmd));
                }
            }
            let (runtime, session) = connect(&conn, &destination)?;
            let code = if as_json {
                let (code, stdout, stderr) = runtime.block_on(session.exec_collect(&remote, None))?;
                json(&serde_json::json!({
                    "code": code,
                    "stdout": String::from_utf8_lossy(&stdout),
                    "stderr": String::from_utf8_lossy(&stderr),
                }));
                code
            } else {
                runtime.block_on(session.run_interactive(Some(&remote), tty, !no_stdin))?
            };
            runtime.block_on(session.close());
            Ok(code)
        },
        Cmd::Shell { conn, destination } => {
            if let Some(ssh) = conn.system_ssh() {
                let mut cmd = system_ssh_command(&ssh, &conn)?;
                cmd.arg("-t").arg("--").arg(&destination);
                return Ok(status_code(cmd));
            }
            let (runtime, session) = connect(&conn, &destination)?;
            let code = runtime.block_on(session.run_interactive(None, true, true))?;
            runtime.block_on(session.close());
            Ok(code)
        },
        Cmd::Cp { conn, recursive, delta, source, target } => copy(&conn, recursive, delta, &source, &target),
        Cmd::Sftp { conn, op, destination, path, extra } => sftp(&conn, &op, &destination, &path, extra.as_deref()),
        Cmd::Forward { conn, local, remote, dynamic, destination } => forward(&conn, &local, &remote, &dynamic, &destination),
        Cmd::Config { conn, destination } => {
            let config = resolve(&conn, &destination)?;
            json(&serde_json::json!({
                "alias": config.alias,
                "hostname": config.hostname,
                "port": config.port,
                "user": config.user,
                "identityFiles": config.identity_files,
                "proxyJump": config.proxy_jump,
                "knownHostsFiles": config.known_hosts_files,
                "strictHostKeyChecking": format!("{:?}", config.strict_host_key_checking),
                "connectTimeout": config.connect_timeout,
                "serverAliveInterval": config.server_alive_interval,
                "batchMode": config.batch_mode,
            }));
            Ok(0)
        },
        Cmd::Keys { op, file } => {
            let runtime = crate::runtime()?;
            let value = match (op.as_str(), file) {
                ("list", _) => serde_json::to_value(runtime.block_on(crate::keys::agent_identities(None))?),
                ("add", Some(file)) => serde_json::to_value(runtime.block_on(crate::keys::agent_add(&file, None))?),
                ("fingerprint", Some(file)) => serde_json::to_value(crate::keys::fingerprint(&file)?),
                _ => return Err(Error::InvalidInput("usage: bun ssh keys list | add <file> | fingerprint <file>".into())),
            };
            json(&value.map_err(|e| crate::other(e.to_string()))?);
            Ok(0)
        },
        Cmd::Keygen { kind, bits, comment, file } => {
            let passphrase = std::env::var("BUN_SSH_NEW_PASSPHRASE").ok();
            let info = crate::keys::generate(&file, &kind, bits, &comment, passphrase.as_deref())?;
            json(&serde_json::to_value(info).map_err(|e| crate::other(e.to_string()))?);
            Ok(0)
        },
        Cmd::KnownHosts { conn, op, destination } => {
            let config = resolve(&conn, &destination)?;
            let runtime = crate::runtime()?;
            let key = runtime.block_on(crate::native::fetch_host_key(&config))?;
            let verdict = crate::known_hosts::check(&config.hostname, config.port, &key, &config.known_hosts_files)?;
            let state = match &verdict {
                crate::known_hosts::Verdict::Known => "known",
                crate::known_hosts::Verdict::Unknown => "unknown",
                crate::known_hosts::Verdict::Changed { .. } => "changed",
            };
            let added = match (op.as_str(), &verdict) {
                ("add", crate::known_hosts::Verdict::Unknown) => {
                    let file = config.known_hosts_files.first().ok_or_else(|| crate::other("no known_hosts file"))?;
                    crate::known_hosts::learn(&config.hostname, config.port, &key, file)?;
                    true
                },
                ("add" | "check", _) => false,
                _ => return Err(Error::InvalidInput("usage: bun ssh known-hosts check|add <destination>".into())),
            };
            json(&serde_json::json!({
                "host": config.hostname,
                "port": config.port,
                "algorithm": key.algorithm().to_string(),
                "fingerprint": crate::known_hosts::fingerprint(&key),
                "state": state,
                "added": added,
            }));
            Ok(if state == "changed" { 1 } else { 0 })
        },
        Cmd::Server { action, embedded, listen, port, authorized_keys, password_env, host_key } => {
            if !embedded {
                return crate::server::manage_system(action.as_deref().unwrap_or("status"));
            }
            let authorized = match &authorized_keys {
                Some(path) => crate::server::read_authorized_keys(path)?,
                None => Vec::new(),
            };
            let password = password_env.and_then(|name| std::env::var(name).ok()).filter(|p| !p.is_empty());
            if authorized.is_empty() && password.is_none() {
                return Err(Error::InvalidInput("the embedded server needs --authorized-keys or --password-env".into()));
            }
            let runtime = crate::runtime()?;
            runtime.block_on(async {
                let options = crate::server::EmbeddedOptions { listen, port, authorized_keys: authorized, password, host_key };
                let (port, key, serve) = crate::server::bind_embedded(options).await?;
                json(&serde_json::json!({
                    "port": port,
                    "hostKey": key.to_openssh().map_err(russh::keys::Error::from)?,
                    "fingerprint": crate::known_hosts::fingerprint(&key),
                }));
                serve.await
            })?;
            Ok(0)
        },
        Cmd::Doctor => {
            let tool = |name: &str, flag: &str| match system::find(name) {
                Some(path) => serde_json::json!({
                    "path": path,
                    "origin": system::describe(&path),
                    "version": system::version(&path, flag),
                }),
                None => serde_json::Value::Null,
            };
            json(&serde_json::json!({
                "ssh": tool("ssh", "-V"),
                "scp": tool("scp", "-V").get("path").cloned(),
                "sftp": system::find("sftp"),
                "sshd": system::find("sshd"),
                "sshKeygen": system::find("ssh-keygen"),
                "rsync": tool("rsync", "--version"),
                "git": tool("git", "--version"),
                "gh": tool("gh", "--version"),
                "agent": crate::runtime()?.block_on(crate::auth::connect_agent(None)).is_some(),
                "backend": if system::find("ssh").is_some() { "system" } else { "native" },
            }));
            Ok(0)
        },
    }
}

fn copy(conn: &Conn, recursive: bool, delta: bool, source: &str, target: &str) -> Result<i32> {
    let (src_remote, dst_remote) = (split_remote(source), split_remote(target));
    if src_remote.is_some() && dst_remote.is_some() {
        return Err(Error::InvalidInput("copying between two remote hosts is not supported".into()));
    }
    if src_remote.is_none() && dst_remote.is_none() {
        return Err(Error::InvalidInput("one of source or target must be host:path".into()));
    }
    if let Some(ssh) = conn.system_ssh() {
        let overrides = conn.overrides()?;
        if delta {
            if let Some(rsync) = system::find("rsync") {
                let mut transport = vec![ssh.to_string_lossy().into_owned()];
                transport.extend(multiplex_args());
                transport.extend(overrides.openssh_args("-p"));
                let mut cmd = Command::new(rsync);
                cmd.arg(if recursive { "-az" } else { "-z" }).arg("-e").arg(transport.iter().map(|a| shell_quote(a)).collect::<Vec<_>>().join(" "));
                cmd.arg(source).arg(target);
                return Ok(status_code(cmd));
            }
        }
        if let Some(scp) = system::find("scp") {
            let mut cmd = Command::new(scp);
            cmd.args(multiplex_args()).args(overrides.openssh_args("-P"));
            if recursive {
                cmd.arg("-r");
            }
            cmd.arg(source).arg(target);
            return Ok(status_code(cmd));
        }
    }
    let (host, remote_path, local, upload) = match (src_remote, dst_remote) {
        (Some((host, path)), None) => (host, path, target, false),
        (None, Some((host, path))) => (host, path, source, true),
        _ => unreachable!(),
    };
    let (runtime, session) = connect(conn, host)?;
    let result = runtime.block_on(async {
        let sftp = session.sftp().await?;
        if upload {
            upload_path(&sftp, Path::new(local), remote_path, recursive, delta).await
        } else {
            download_path(&sftp, remote_path, Path::new(local), recursive).await
        }
    });
    runtime.block_on(session.close());
    result.map(|()| 0)
}

async fn upload_path(sftp: &russh_sftp::client::SftpSession, local: &Path, remote: &str, recursive: bool, delta: bool) -> Result<()> {
    let meta = std::fs::metadata(local)?;
    let remote_is_dir = SftpDriver::stat(sftp, remote).await.is_ok_and(|e| e.is_dir);
    let name = local.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    let destination = if remote_is_dir { format!("{}/{name}", remote.trim_end_matches('/')) } else { remote.to_owned() };
    if meta.is_dir() {
        if !recursive {
            return Err(Error::InvalidInput(format!("{} is a directory (use -r)", local.display())));
        }
        SftpDriver::mkdir_all(sftp, &destination).await?;
        for entry in std::fs::read_dir(local)? {
            let entry = entry?;
            Box::pin(upload_path(sftp, &entry.path(), &destination, true, delta)).await?;
        }
        return Ok(());
    }
    let content = std::fs::read(local)?;
    if delta {
        SftpDriver::upload_differential(sftp, &content, &destination).await?;
    } else {
        SftpDriver::write_file(sftp, &destination, &content).await?;
    }
    Ok(())
}

async fn download_path(sftp: &russh_sftp::client::SftpSession, remote: &str, local: &Path, recursive: bool) -> Result<()> {
    let entry = SftpDriver::stat(sftp, remote).await?;
    let destination = if local.is_dir() { local.join(&entry.name) } else { local.to_path_buf() };
    if entry.is_dir {
        if !recursive {
            return Err(Error::InvalidInput(format!("{remote} is a directory (use -r)")));
        }
        std::fs::create_dir_all(&destination)?;
        for child in SftpDriver::read_dir(sftp, remote).await? {
            Box::pin(download_path(sftp, &child.path, &destination.join(&child.name), true)).await?;
        }
        return Ok(());
    }
    std::fs::write(&destination, SftpDriver::read_file(sftp, remote).await?)?;
    Ok(())
}

fn sftp(conn: &Conn, op: &str, destination: &str, path: &str, extra: Option<&str>) -> Result<i32> {
    let (runtime, session) = connect(conn, destination)?;
    let result: Result<Option<serde_json::Value>> = runtime.block_on(async {
        let sftp = session.sftp().await?;
        let to_json = |v: &dyn erased::Ser| v.value();
        Ok(match op {
            "ls" => Some(to_json(&SftpDriver::read_dir(&sftp, path).await?)),
            "stat" => Some(to_json(&SftpDriver::stat(&sftp, path).await?)),
            "tree" => {
                let depth = extra.and_then(|d| d.parse().ok()).unwrap_or(3);
                Some(to_json(&SftpDriver::tree(&sftp, path, depth).await?))
            },
            "cat" => {
                write_stdout(&SftpDriver::read_file(&sftp, path).await?);
                None
            },
            "get" => {
                let local = extra.ok_or_else(|| Error::InvalidInput("get needs a local path".into()))?;
                std::fs::write(local, SftpDriver::read_file(&sftp, path).await?)?;
                None
            },
            "put" => {
                let local = extra.ok_or_else(|| Error::InvalidInput("put needs a local path".into()))?;
                SftpDriver::write_file(&sftp, path, &std::fs::read(local)?).await?;
                None
            },
            "rm" => {
                sftp.remove_file(path).await?;
                None
            },
            "mkdir" => {
                SftpDriver::mkdir_all(&sftp, path).await?;
                None
            },
            other => return Err(Error::InvalidInput(format!("unknown sftp operation `{other}`"))),
        })
    });
    runtime.block_on(session.close());
    if let Some(value) = result? {
        json(&value);
    }
    Ok(0)
}

mod erased {
    pub(super) trait Ser {
        fn value(&self) -> serde_json::Value;
    }
    impl<T: serde::Serialize> Ser for T {
        fn value(&self) -> serde_json::Value {
            serde_json::to_value(self).unwrap_or(serde_json::Value::Null)
        }
    }
}

fn forward(conn: &Conn, local: &[String], remote: &[String], dynamic: &[String], destination: &str) -> Result<i32> {
    if local.is_empty() && remote.is_empty() && dynamic.is_empty() {
        return Err(Error::InvalidInput("give at least one of -L, -R, -D".into()));
    }
    if let Some(ssh) = conn.system_ssh() {
        let mut cmd = system_ssh_command(&ssh, conn)?;
        cmd.args(["-N", "-o", "ExitOnForwardFailure=yes"]);
        for spec in local {
            cmd.arg("-L").arg(spec);
        }
        for spec in remote {
            cmd.arg("-R").arg(spec);
        }
        for spec in dynamic {
            cmd.arg("-D").arg(spec);
        }
        cmd.arg("--").arg(destination);
        return Ok(status_code(cmd));
    }
    let config = resolve(conn, destination)?;
    let runtime = crate::runtime()?;
    runtime.block_on(async move {
        let mut tasks = tokio::task::JoinSet::new();
        for spec in remote {
            let spec = crate::forward::Spec::parse(spec, false)?;
            let session = Session::connect(&config).await?;
            tasks.spawn(async move {
                crate::forward::remote(session, &spec, |port| json(&serde_json::json!({ "remote": port }))).await
            });
        }
        let session = std::sync::Arc::new(Session::connect(&config).await?);
        for spec in local {
            let spec = crate::forward::Spec::parse(spec, false)?;
            let session = std::sync::Arc::clone(&session);
            tasks.spawn(async move { crate::forward::local(session, &spec, |port| json(&serde_json::json!({ "local": port }))).await });
        }
        for spec in dynamic {
            let spec = crate::forward::Spec::parse(spec, true)?;
            let session = std::sync::Arc::clone(&session);
            tasks.spawn(async move { crate::forward::dynamic(session, &spec, |port| json(&serde_json::json!({ "dynamic": port }))).await });
        }
        while let Some(result) = tasks.join_next().await {
            result.map_err(|e| crate::other(e.to_string()))??;
        }
        Ok::<_, Error>(())
    })?;
    Ok(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn remote_operands() {
        assert_eq!(split_remote("vps:/srv/app"), Some(("vps", "/srv/app")));
        assert_eq!(split_remote("user@host:"), Some(("user@host", ".")));
        assert_eq!(split_remote(r"C:\Users\x"), None);
        assert_eq!(split_remote("./a:b"), None);
        assert_eq!(shell_quote("a b"), "'a b'");
        assert_eq!(remote_command(&["echo".into(), "it's".into()]), r"echo 'it'\''s'");
    }
}
