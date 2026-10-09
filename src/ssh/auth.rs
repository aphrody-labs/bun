// SPDX-License-Identifier: Apache-2.0
//! Client authentication for the in-process backend, in OpenSSH's order: ssh-agent (Unix socket,
//! the Windows OpenSSH agent pipe, Pageant), identity files (ed25519, ecdsa, rsa, encrypted ones
//! included), then password. Secrets come from `BUN_SSH_PASSPHRASE`, `BUN_SSH_PASSWORD` or
//! `SSH_ASKPASS`; they are never logged nor passed on a command line.

use std::path::Path;
use std::sync::Arc;

use russh::client::{Handle, Handler};
use russh::keys::agent::AgentIdentity;
use russh::keys::agent::client::{AgentClient, AgentStream};
use russh::keys::{PrivateKey, PrivateKeyWithHashAlg, PublicKey};

use crate::config::HostConfig;
use crate::{Error, Result};

type DynAgent = AgentClient<Box<dyn AgentStream + Send + Unpin + 'static>>;

/// Connects to the running ssh-agent, if any.
pub async fn connect_agent(identity_agent: Option<&str>) -> Option<DynAgent> {
    if identity_agent.is_some_and(|a| a.eq_ignore_ascii_case("none")) {
        return None;
    }
    let explicit = identity_agent
        .filter(|a| !a.eq_ignore_ascii_case("SSH_AUTH_SOCK"))
        .map(|a| crate::config::expand_path(a.trim_matches('"')).into_os_string())
        .or_else(|| std::env::var_os("SSH_AUTH_SOCK").filter(|v| !v.is_empty()));
    #[cfg(unix)]
    {
        let path = explicit?;
        AgentClient::connect_uds(path).await.ok().map(AgentClient::dynamic)
    }
    #[cfg(windows)]
    {
        let pipe = explicit.unwrap_or_else(|| r"\\.\pipe\openssh-ssh-agent".into());
        if let Ok(agent) = AgentClient::connect_named_pipe(&pipe).await {
            return Some(agent.dynamic());
        }
        AgentClient::connect_pageant().await.ok().map(AgentClient::dynamic)
    }
}

/// Runs `SSH_ASKPASS` with `prompt` and returns the first line it prints.
pub fn askpass(prompt: &str) -> Option<String> {
    let program = std::env::var_os("SSH_ASKPASS").filter(|v| !v.is_empty())?;
    let output = std::process::Command::new(program)
        .arg(prompt)
        .stdin(std::process::Stdio::null())
        .stderr(std::process::Stdio::inherit())
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8(output.stdout).ok()?;
    Some(text.lines().next().unwrap_or_default().to_owned())
}

fn env_secret(name: &str) -> Option<String> {
    std::env::var(name).ok().filter(|v| !v.is_empty())
}

/// Loads a private key, asking for its passphrase only if it is encrypted.
pub fn load_identity(path: &Path, batch_mode: bool) -> Result<PrivateKey> {
    match russh::keys::load_secret_key(path, None) {
        Ok(key) => Ok(key),
        Err(russh::keys::Error::KeyIsEncrypted) => {
            let passphrase = env_secret("BUN_SSH_PASSPHRASE")
                .or_else(|| (!batch_mode).then(|| askpass(&format!("Enter passphrase for key '{}': ", path.display()))).flatten())
                .ok_or_else(|| Error::InvalidInput(format!("{} is encrypted; set BUN_SSH_PASSPHRASE or SSH_ASKPASS", path.display())))?;
            Ok(russh::keys::load_secret_key(path, Some(&passphrase))?)
        },
        Err(err) => Err(err.into()),
    }
}

fn identity_public_keys(config: &HostConfig) -> Vec<PublicKey> {
    config
        .identity_files
        .iter()
        .filter_map(|path| {
            let mut pub_path = path.clone().into_os_string();
            pub_path.push(".pub");
            russh::keys::load_public_key(pub_path).ok()
        })
        .collect()
}

/// Authenticates `handle` as `config.user`.
pub async fn authenticate<H: Handler>(handle: &mut Handle<H>, config: &HostConfig) -> Result<()> {
    let rsa_hash = handle.best_supported_rsa_hash().await?.flatten();

    if let Some(mut agent) = connect_agent(config.identity_agent.as_deref()).await {
        let allowed = identity_public_keys(config);
        if let Ok(identities) = agent.request_identities().await {
            for identity in identities {
                let AgentIdentity::PublicKey { key, .. } = identity else { continue };
                if config.identities_only && !allowed.iter().any(|k| k.key_data() == key.key_data()) {
                    continue;
                }
                let hash = if matches!(key.algorithm(), russh::keys::Algorithm::Rsa { .. }) { rsa_hash } else { None };
                if let Ok(result) = handle.authenticate_publickey_with(&config.user, key, hash, &mut agent).await {
                    if result.success() {
                        return Ok(());
                    }
                }
            }
        }
    }

    for path in &config.identity_files {
        if !path.is_file() {
            continue;
        }
        let key = match load_identity(path, config.batch_mode) {
            Ok(key) => key,
            Err(Error::InvalidInput(message)) => return Err(Error::InvalidInput(message)),
            Err(_) => continue,
        };
        let hash = if matches!(key.algorithm(), russh::keys::Algorithm::Rsa { .. }) { rsa_hash } else { None };
        let result = handle
            .authenticate_publickey(&config.user, PrivateKeyWithHashAlg::new(Arc::new(key), hash))
            .await?;
        if result.success() {
            return Ok(());
        }
    }

    let password = env_secret("BUN_SSH_PASSWORD").or_else(|| {
        (!config.batch_mode)
            .then(|| askpass(&format!("{}@{}'s password: ", config.user, config.hostname)))
            .flatten()
    });
    if let Some(password) = password {
        if handle.authenticate_password(&config.user, password).await?.success() {
            return Ok(());
        }
    }
    Err(Error::Auth { user: config.user.clone(), host: config.hostname.clone() })
}
