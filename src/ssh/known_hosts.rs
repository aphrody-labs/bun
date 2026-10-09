// SPDX-License-Identifier: Apache-2.0
//! Host key verification against OpenSSH `known_hosts` files (hashed `|1|` entries and
//! `[host]:port` forms included), with trust on first use for `StrictHostKeyChecking accept-new`.
//! Replaces the accept-everything handler of aphrody's in-process client.

use std::path::{Path, PathBuf};

use russh::keys::{HashAlg, PublicKey};

use crate::config::{HostConfig, StrictHostKeyChecking};
use crate::{Error, Result};

/// Result of looking a key up.
#[derive(Debug, PartialEq, Eq)]
pub enum Verdict {
    Known,
    Unknown,
    Changed { file: PathBuf, line: usize },
}

fn global_files() -> Vec<PathBuf> {
    if cfg!(windows) {
        std::env::var_os("ProgramData")
            .map(|p| vec![PathBuf::from(p).join("ssh").join("ssh_known_hosts")])
            .unwrap_or_default()
    } else {
        vec![PathBuf::from("/etc/ssh/ssh_known_hosts")]
    }
}

/// Looks `key` up for `host`:`port` in `files`, then in the system-wide file.
pub fn check(host: &str, port: u16, key: &PublicKey, files: &[PathBuf]) -> Result<Verdict> {
    let mut all: Vec<PathBuf> = files.to_vec();
    all.extend(global_files());
    for file in &all {
        match russh::keys::check_known_hosts_path(host, port, key, file) {
            Ok(true) => return Ok(Verdict::Known),
            Ok(false) => {},
            Err(russh::keys::Error::KeyChanged { line }) => {
                return Ok(Verdict::Changed { file: file.clone(), line });
            },
            // An unreadable or malformed file must not let an unknown key through.
            Err(err) => return Err(err.into()),
        }
    }
    Ok(Verdict::Unknown)
}

/// Appends `key` to `file` (`host` or `[host]:port`).
pub fn learn(host: &str, port: u16, key: &PublicKey, file: &Path) -> Result<()> {
    russh::keys::known_hosts::learn_known_hosts_path(host, port, key, file)?;
    Ok(())
}

/// SHA256 fingerprint as printed by OpenSSH (`SHA256:...`).
pub fn fingerprint(key: &PublicKey) -> String {
    key.fingerprint(HashAlg::Sha256).to_string()
}

/// Applies the host's `StrictHostKeyChecking` policy to `key`.
pub fn verify(config: &HostConfig, key: &PublicKey) -> Result<()> {
    let host = config.hostname.as_str();
    let verdict = check(host, config.port, key, &config.known_hosts_files)?;
    match verdict {
        Verdict::Known => Ok(()),
        Verdict::Changed { file, line } => Err(Error::HostKey {
            host: host.to_owned(),
            reason: format!(
                "the {} key ({}) differs from the one recorded at {}:{line}; remove that line if the change is expected",
                key.algorithm(),
                fingerprint(key),
                file.display()
            ),
        }),
        Verdict::Unknown => match config.strict_host_key_checking {
            StrictHostKeyChecking::Yes => Err(Error::HostKey {
                host: host.to_owned(),
                reason: format!(
                    "unknown {} key {}; add it with `bun ssh known-hosts add {}` or use -o StrictHostKeyChecking=accept-new",
                    key.algorithm(),
                    fingerprint(key),
                    config.alias
                ),
            }),
            StrictHostKeyChecking::AcceptNew => {
                if let Some(file) = config.known_hosts_files.first() {
                    learn(host, config.port, key, file)?;
                }
                Ok(())
            },
            StrictHostKeyChecking::No => Ok(()),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const KEY: &str = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIJdD7y3aLq454yWBdwLWbieU1ebz9/cu7/QEXn9OIeZJ";
    const OTHER: &str = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIA6rWI3G1sz07DnfFlrouTcysQlj2P+jpNSOEWD9OJ3X";

    #[test]
    fn learn_then_check_and_detect_change() {
        let dir = std::env::temp_dir().join(format!("bun-ssh-kh-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let file = dir.join("known_hosts");
        let key = PublicKey::from_openssh(KEY).unwrap();
        let other = PublicKey::from_openssh(OTHER).unwrap();
        let files = vec![file.clone()];
        assert_eq!(check("example.test", 2222, &key, &files).unwrap(), Verdict::Unknown);
        learn("example.test", 2222, &key, &file).unwrap();
        assert_eq!(check("example.test", 2222, &key, &files).unwrap(), Verdict::Known);
        assert!(matches!(check("example.test", 2222, &other, &files).unwrap(), Verdict::Changed { .. }));
        assert_eq!(check("example.test", 22, &key, &files).unwrap(), Verdict::Unknown);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
