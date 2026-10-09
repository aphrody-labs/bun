// SPDX-License-Identifier: Apache-2.0
//! Destinations (`[user@]host[:port]`, `ssh://user@host:port`) and their effective configuration.
//!
//! With a system OpenSSH, `ssh -G` is the source of truth (it evaluates `Include`, `Match`,
//! canonicalisation and system-wide defaults exactly as `ssh` would). Without it, the native
//! parser below reads `~/.ssh/config` with OpenSSH's "first obtained value wins" rule, `Host`
//! patterns (`*`, `?`, `!negation`), `Include` and the `%h %p %r %u %d %%` and `~` expansions.
//! The parser started as `parse_ssh_config` of aphrody's `crates/infra/ssh/src/in_process.rs`.

use std::path::{Path, PathBuf};

use crate::{Error, Result, home_dir, system};

/// `StrictHostKeyChecking` policy.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StrictHostKeyChecking {
    /// Refuse unknown and changed keys.
    Yes,
    /// Trust on first use: record unknown keys, refuse changed ones (OpenSSH `accept-new`).
    AcceptNew,
    /// Accept any key (`no`/`off`). Changed keys are still refused.
    No,
}

impl StrictHostKeyChecking {
    pub fn parse(value: &str) -> Option<Self> {
        match value.to_ascii_lowercase().as_str() {
            "yes" | "ask" | "true" => Some(Self::Yes),
            "accept-new" => Some(Self::AcceptNew),
            "no" | "off" | "false" => Some(Self::No),
            _ => None,
        }
    }
}

/// A parsed command-line destination.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Destination {
    /// The name as written by the user (alias looked up in `~/.ssh/config`).
    pub host: String,
    pub user: Option<String>,
    pub port: Option<u16>,
}

impl Destination {
    /// Parses `[user@]host[:port]`, `ssh://[user@]host[:port]` and `[user@][v6addr]:port`.
    pub fn parse(value: &str) -> Result<Self> {
        let rest = value.strip_prefix("ssh://").unwrap_or(value);
        let rest = rest.strip_suffix('/').unwrap_or(rest);
        if rest.is_empty() || rest.starts_with('-') || rest.contains(char::is_whitespace) {
            return Err(Error::InvalidInput(format!("invalid destination `{value}`")));
        }
        let (user, host_port) = match rest.rfind('@') {
            Some(at) => (Some(rest[..at].to_owned()), &rest[at + 1..]),
            None => (None, rest),
        };
        let (host, port) = if let Some(inner) = host_port.strip_prefix('[') {
            let close = inner
                .find(']')
                .ok_or_else(|| Error::InvalidInput(format!("invalid destination `{value}`")))?;
            let port = inner[close + 1..].strip_prefix(':').map(parse_port).transpose()?;
            (inner[..close].to_owned(), port)
        } else {
            match host_port.rsplit_once(':') {
                // A bare IPv6 address has several colons and no port.
                Some((h, p)) if !h.contains(':') && !p.is_empty() && p.bytes().all(|b| b.is_ascii_digit()) => {
                    (h.to_owned(), Some(parse_port(p)?))
                },
                _ => (host_port.to_owned(), None),
            }
        };
        if host.is_empty() {
            return Err(Error::InvalidInput(format!("invalid destination `{value}`")));
        }
        Ok(Self { host, user: user.filter(|u| !u.is_empty()), port })
    }
}

fn parse_port(value: &str) -> Result<u16> {
    value
        .parse::<u16>()
        .ok()
        .filter(|p| *p != 0)
        .ok_or_else(|| Error::InvalidInput(format!("invalid port `{value}`")))
}

/// Options given on the command line, applied on top of the configuration files.
#[derive(Debug, Clone, Default)]
pub struct Overrides {
    pub port: Option<u16>,
    pub user: Option<String>,
    pub identity_files: Vec<PathBuf>,
    pub proxy_jump: Option<String>,
    pub config_file: Option<PathBuf>,
    /// `-o Key=Value` pairs, in order.
    pub options: Vec<(String, String)>,
}

impl Overrides {
    /// Parses one `-o` argument (`Key=Value` or `Key Value`).
    pub fn push_option(&mut self, raw: &str) -> Result<()> {
        let (key, value) = split_key_value(raw)
            .ok_or_else(|| Error::InvalidInput(format!("invalid -o option `{raw}`")))?;
        self.options.push((key.to_owned(), value.to_owned()));
        Ok(())
    }

    fn option(&self, key: &str) -> Option<&str> {
        self.options.iter().find(|(k, _)| k.eq_ignore_ascii_case(key)).map(|(_, v)| v.as_str())
    }

    /// Arguments that reproduce these overrides for the system `ssh`/`scp`/`sftp`.
    /// `port_flag` is `-p` for ssh and `-P` for scp/sftp.
    pub fn openssh_args(&self, port_flag: &str) -> Vec<String> {
        let mut args = Vec::new();
        if let Some(file) = &self.config_file {
            args.push("-F".to_owned());
            args.push(file.to_string_lossy().into_owned());
        }
        if let Some(port) = self.port {
            args.push(port_flag.to_owned());
            args.push(port.to_string());
        }
        if let Some(user) = &self.user {
            args.push("-o".to_owned());
            args.push(format!("User={user}"));
        }
        for identity in &self.identity_files {
            args.push("-i".to_owned());
            args.push(identity.to_string_lossy().into_owned());
        }
        if let Some(jump) = &self.proxy_jump {
            args.push("-J".to_owned());
            args.push(jump.clone());
        }
        for (key, value) in &self.options {
            args.push("-o".to_owned());
            args.push(format!("{key}={value}"));
        }
        args
    }
}

/// Effective configuration of one host.
#[derive(Debug, Clone)]
pub struct HostConfig {
    /// Name as given on the command line.
    pub alias: String,
    pub hostname: String,
    pub port: u16,
    pub user: String,
    pub identity_files: Vec<PathBuf>,
    pub identities_only: bool,
    pub proxy_jump: Option<String>,
    pub known_hosts_files: Vec<PathBuf>,
    pub strict_host_key_checking: StrictHostKeyChecking,
    pub connect_timeout: Option<u64>,
    pub server_alive_interval: Option<u64>,
    pub server_alive_count_max: u32,
    pub batch_mode: bool,
    pub identity_agent: Option<String>,
}

impl HostConfig {
    /// Resolves `destination` with `ssh -G` when OpenSSH is installed, the native parser otherwise.
    pub fn resolve(destination: &Destination, overrides: &Overrides) -> Result<Self> {
        if std::env::var_os("BUN_SSH_NATIVE_CONFIG").is_none() {
            if let Some(ssh) = system::find("ssh") {
                if let Ok(config) = Self::from_ssh_g(&ssh, destination, overrides) {
                    return Ok(config);
                }
            }
        }
        Self::resolve_native(destination, overrides)
    }

    fn from_ssh_g(ssh: &Path, destination: &Destination, overrides: &Overrides) -> Result<Self> {
        let mut command = std::process::Command::new(ssh);
        command.args(overrides.openssh_args("-p"));
        if let Some(user) = &destination.user {
            command.args(["-l", user]);
        }
        if let Some(port) = destination.port.filter(|_| overrides.port.is_none()) {
            command.args(["-p", &port.to_string()]);
        }
        command.arg("-G").arg(&destination.host);
        command.stdin(std::process::Stdio::null()).stderr(std::process::Stdio::null());
        let output = command.output()?;
        if !output.status.success() {
            return Err(crate::other("ssh -G failed"));
        }
        let text = String::from_utf8_lossy(&output.stdout);
        let mut entries = Entries::default();
        for line in text.lines() {
            if let Some((key, value)) = split_key_value(line) {
                entries.push_all(key, value);
            }
        }
        Ok(entries.into_config(destination, overrides, true))
    }

    /// Native resolution from `~/.ssh/config` (or `-F file`).
    pub fn resolve_native(destination: &Destination, overrides: &Overrides) -> Result<Self> {
        let mut entries = Entries::default();
        // Command-line options come first: OpenSSH keeps the first value obtained.
        for (key, value) in &overrides.options {
            entries.push_first(key, value);
        }
        let file = match &overrides.config_file {
            Some(file) => Some(file.clone()),
            None => home_dir().map(|h| h.join(".ssh").join("config")),
        };
        if let Some(file) = file {
            if file.exists() {
                let mut depth = 0;
                parse_file(&file, &destination.host, &mut entries, &mut depth)?;
            }
        }
        Ok(entries.into_config(destination, overrides, false))
    }
}

#[derive(Default)]
struct Entries {
    values: Vec<(String, String)>,
}

impl Entries {
    /// First value wins, except for the keywords OpenSSH accumulates.
    fn push_first(&mut self, key: &str, value: &str) {
        let key = key.to_ascii_lowercase();
        let accumulates = matches!(key.as_str(), "identityfile" | "userknownhostsfile" | "localforward" | "remoteforward" | "dynamicforward");
        if accumulates || !self.values.iter().any(|(k, _)| *k == key) {
            self.values.push((key, value.to_owned()));
        }
    }

    /// `ssh -G` output already resolved precedence; keep every line.
    fn push_all(&mut self, key: &str, value: &str) {
        self.values.push((key.to_ascii_lowercase(), value.to_owned()));
    }

    fn get(&self, key: &str) -> Option<&str> {
        self.values.iter().find(|(k, _)| k == key).map(|(_, v)| v.as_str())
    }

    fn all(&self, key: &str) -> impl Iterator<Item = &str> {
        self.values.iter().filter(move |(k, _)| k == key).map(|(_, v)| v.as_str())
    }

    fn into_config(self, destination: &Destination, overrides: &Overrides, from_ssh_g: bool) -> HostConfig {
        let local_user = local_user();
        let user = overrides
            .user
            .clone()
            .or_else(|| destination.user.clone())
            .or_else(|| self.get("user").map(str::to_owned))
            .unwrap_or_else(|| local_user.clone());
        let hostname_raw = self.get("hostname").unwrap_or(&destination.host).to_owned();
        let port = overrides
            .port
            .or(destination.port)
            .or_else(|| self.get("port").and_then(|p| p.parse().ok()))
            .unwrap_or(22);
        let hostname = expand_tokens(&hostname_raw, &destination.host, &hostname_raw, port, &user, &local_user);
        let expand = |value: &str| expand_path(&expand_tokens(value, &destination.host, &hostname, port, &user, &local_user));

        let mut identity_files: Vec<PathBuf> = overrides.identity_files.clone();
        let configured: Vec<PathBuf> = self.all("identityfile").map(expand).collect();
        let explicit = !configured.is_empty() || !identity_files.is_empty();
        identity_files.extend(configured);
        if !explicit && !from_ssh_g {
            if let Some(home) = home_dir() {
                for name in ["id_ed25519", "id_ecdsa", "id_rsa"] {
                    identity_files.push(home.join(".ssh").join(name));
                }
            }
        }
        identity_files.dedup();

        let mut known_hosts_files: Vec<PathBuf> = self
            .all("userknownhostsfile")
            .flat_map(|v| v.split_whitespace().map(str::to_owned).collect::<Vec<_>>())
            .filter(|v| v != "none")
            .map(|v| expand(&v))
            .collect();
        if known_hosts_files.is_empty() {
            if let Some(home) = home_dir() {
                known_hosts_files.push(home.join(".ssh").join("known_hosts"));
            }
        }
        if let Some(file) = std::env::var_os("BUN_SSH_KNOWN_HOSTS").filter(|v| !v.is_empty()) {
            known_hosts_files.insert(0, PathBuf::from(file));
        }

        let strict = overrides
            .option("StrictHostKeyChecking")
            .or_else(|| self.get("stricthostkeychecking"))
            .and_then(StrictHostKeyChecking::parse)
            .unwrap_or(if from_ssh_g { StrictHostKeyChecking::Yes } else { StrictHostKeyChecking::AcceptNew });
        // `ssh -G` prints `stricthostkeychecking ask` by default; interactive prompts do not
        // exist in the in-process client, so the default becomes trust-on-first-use.
        let strict = match (from_ssh_g, self.get("stricthostkeychecking")) {
            (true, Some("ask")) if overrides.option("StrictHostKeyChecking").is_none() => StrictHostKeyChecking::AcceptNew,
            _ => strict,
        };

        let proxy_jump = overrides
            .proxy_jump
            .clone()
            .or_else(|| self.get("proxyjump").map(str::to_owned))
            .filter(|v| !v.eq_ignore_ascii_case("none"));
        let number = |key: &str| self.get(key).and_then(|v| v.parse::<u64>().ok()).filter(|v| *v > 0);
        HostConfig {
            alias: destination.host.clone(),
            hostname,
            port,
            user,
            identity_files,
            identities_only: self.get("identitiesonly").is_some_and(is_yes),
            proxy_jump,
            known_hosts_files,
            strict_host_key_checking: strict,
            connect_timeout: number("connecttimeout"),
            server_alive_interval: number("serveraliveinterval"),
            server_alive_count_max: self.get("serveralivecountmax").and_then(|v| v.parse().ok()).unwrap_or(3),
            batch_mode: self.get("batchmode").is_some_and(is_yes),
            identity_agent: self.get("identityagent").map(str::to_owned),
        }
    }
}

fn is_yes(value: &str) -> bool {
    matches!(value.to_ascii_lowercase().as_str(), "yes" | "true")
}

fn local_user() -> String {
    std::env::var("USER")
        .or_else(|_| std::env::var("USERNAME"))
        .unwrap_or_else(|_| "root".to_owned())
}

/// `Key Value`, `Key=Value` or `Key = "Value"`.
fn split_key_value(line: &str) -> Option<(&str, &str)> {
    let line = line.trim();
    if line.is_empty() || line.starts_with('#') {
        return None;
    }
    let split = line.find(|c: char| c.is_whitespace() || c == '=')?;
    let key = &line[..split];
    let rest = line[split..].trim_start_matches(|c: char| c.is_whitespace() || c == '=').trim_end();
    let rest = rest.strip_prefix('"').and_then(|r| r.strip_suffix('"')).unwrap_or(rest);
    Some((key, rest))
}

fn parse_file(path: &Path, host: &str, entries: &mut Entries, depth: &mut u32) -> Result<()> {
    *depth += 1;
    if *depth > 16 {
        return Err(Error::InvalidInput("ssh config Include nesting too deep".into()));
    }
    let text = std::fs::read_to_string(path)?;
    let mut active = true;
    for line in text.lines() {
        let Some((key, value)) = split_key_value(line) else { continue };
        if key.eq_ignore_ascii_case("host") {
            active = host_matches(value, host);
            continue;
        }
        if key.eq_ignore_ascii_case("match") {
            // `Match all` applies everywhere; other criteria need ssh itself (`ssh -G`).
            active = value.trim().eq_ignore_ascii_case("all");
            continue;
        }
        if !active {
            continue;
        }
        if key.eq_ignore_ascii_case("include") {
            for pattern in value.split_whitespace() {
                for include in expand_include(pattern) {
                    if include.is_file() {
                        parse_file(&include, host, entries, depth)?;
                    }
                }
            }
            continue;
        }
        entries.push_first(key, value);
    }
    *depth -= 1;
    Ok(())
}

fn expand_include(pattern: &str) -> Vec<PathBuf> {
    let path = expand_path(pattern);
    let path = if path.is_relative() {
        home_dir().map(|h| h.join(".ssh").join(&path)).unwrap_or(path)
    } else {
        path
    };
    let Some(name) = path.file_name().and_then(|n| n.to_str()) else { return vec![path] };
    if !name.contains(['*', '?']) {
        return vec![path];
    }
    let Some(parent) = path.parent() else { return Vec::new() };
    let Ok(read) = std::fs::read_dir(parent) else { return Vec::new() };
    let mut out: Vec<PathBuf> = read
        .flatten()
        .filter(|e| e.file_name().to_str().is_some_and(|n| wildcard(name, n)))
        .map(|e| e.path())
        .collect();
    out.sort();
    out
}

/// `Host` pattern list: any positive match and no negated match.
pub fn host_matches(patterns: &str, host: &str) -> bool {
    let host = host.to_ascii_lowercase();
    let mut matched = false;
    for pattern in patterns.split(|c: char| c.is_whitespace() || c == ',').filter(|p| !p.is_empty()) {
        let pattern = pattern.to_ascii_lowercase();
        if let Some(negated) = pattern.strip_prefix('!') {
            if wildcard(negated, &host) {
                return false;
            }
        } else if wildcard(&pattern, &host) {
            matched = true;
        }
    }
    matched
}

/// `*` and `?` glob match.
pub fn wildcard(pattern: &str, text: &str) -> bool {
    let (p, t) = (pattern.as_bytes(), text.as_bytes());
    let (mut pi, mut ti, mut star, mut mark) = (0usize, 0usize, None::<usize>, 0usize);
    while ti < t.len() {
        if pi < p.len() && (p[pi] == b'?' || p[pi] == t[ti]) {
            pi += 1;
            ti += 1;
        } else if pi < p.len() && p[pi] == b'*' {
            star = Some(pi);
            mark = ti;
            pi += 1;
        } else if let Some(s) = star {
            pi = s + 1;
            mark += 1;
            ti = mark;
        } else {
            return false;
        }
    }
    while pi < p.len() && p[pi] == b'*' {
        pi += 1;
    }
    pi == p.len()
}

fn expand_tokens(value: &str, alias: &str, hostname: &str, port: u16, user: &str, local_user: &str) -> String {
    if !value.contains('%') {
        return value.to_owned();
    }
    let mut out = String::with_capacity(value.len());
    let mut chars = value.chars();
    while let Some(c) = chars.next() {
        if c != '%' {
            out.push(c);
            continue;
        }
        match chars.next() {
            Some('h') => out.push_str(hostname),
            Some('n') => out.push_str(alias),
            Some('p') => out.push_str(&port.to_string()),
            Some('r') => out.push_str(user),
            Some('u') => out.push_str(local_user),
            Some('d') => out.push_str(&home_dir().map(|h| h.to_string_lossy().into_owned()).unwrap_or_default()),
            Some('%') => out.push('%'),
            Some(other) => {
                out.push('%');
                out.push(other);
            },
            None => out.push('%'),
        }
    }
    out
}

/// `~` and `~/…` expansion.
pub fn expand_path(value: &str) -> PathBuf {
    if value == "~" {
        return home_dir().unwrap_or_else(|| PathBuf::from(value));
    }
    if let Some(rest) = value.strip_prefix("~/").or_else(|| value.strip_prefix("~\\")) {
        if let Some(home) = home_dir() {
            return home.join(rest);
        }
    }
    PathBuf::from(value)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn destinations() {
        let d = Destination::parse("ubuntu@vps:2222").unwrap();
        assert_eq!((d.user.as_deref(), d.host.as_str(), d.port), (Some("ubuntu"), "vps", Some(2222)));
        let d = Destination::parse("ssh://git@github.com").unwrap();
        assert_eq!((d.user.as_deref(), d.host.as_str(), d.port), (Some("git"), "github.com", None));
        let d = Destination::parse("[::1]:22").unwrap();
        assert_eq!((d.host.as_str(), d.port), ("::1", Some(22)));
        let d = Destination::parse("fe80::1").unwrap();
        assert_eq!((d.host.as_str(), d.port), ("fe80::1", None));
        assert!(Destination::parse("-oProxyCommand=x").is_err());
        assert!(Destination::parse("").is_err());
    }

    #[test]
    fn patterns() {
        assert!(host_matches("vps dbfr", "dbfr"));
        assert!(host_matches("*.example.com", "a.example.com"));
        assert!(!host_matches("* !bastion", "bastion"));
        assert!(host_matches("db?r", "dbfr"));
        assert!(!host_matches("db?r", "dbffr"));
    }

    #[test]
    fn native_parser_first_value_wins() {
        let dir = std::env::temp_dir().join(format!("bun-ssh-config-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("config");
        std::fs::write(
            &file,
            "Host vps\n  HostName 10.0.0.1\n  User ubuntu\n  Port 2222\n  IdentityFile ~/.ssh/ovh_vps\n  ProxyJump jump\nHost *\n  User other\n  ServerAliveInterval 15\n",
        )
        .unwrap();
        let overrides = Overrides { config_file: Some(file), ..Default::default() };
        let config = HostConfig::resolve_native(&Destination::parse("vps").unwrap(), &overrides).unwrap();
        assert_eq!(config.hostname, "10.0.0.1");
        assert_eq!(config.user, "ubuntu");
        assert_eq!(config.port, 2222);
        assert_eq!(config.proxy_jump.as_deref(), Some("jump"));
        assert_eq!(config.server_alive_interval, Some(15));
        assert!(config.identity_files[0].ends_with("ovh_vps"));
        let _ = std::fs::remove_dir_all(dir);
    }
}
