// SPDX-License-Identifier: Apache-2.0
//! Key generation, fingerprints and agent listing, on the `ssh-key` crate that `russh` re-exports.
//! Generation stays in process so a passphrase never reaches the argv of `ssh-keygen -N`.

use std::path::Path;

use russh::keys::ssh_key::LineEnding;
use russh::keys::{Algorithm, HashAlg, PrivateKey, PublicKey};
use serde::Serialize;

use crate::{Error, Result};

#[derive(Debug, Serialize)]
pub struct KeyInfo {
    pub algorithm: String,
    pub fingerprint: String,
    pub comment: String,
}

fn info(key: &PublicKey) -> KeyInfo {
    KeyInfo {
        algorithm: key.algorithm().to_string(),
        fingerprint: key.fingerprint(HashAlg::Sha256).to_string(),
        comment: key.comment().to_string(),
    }
}

/// Public key of `path` (a `.pub` file, a private key, or the private key next to `path.pub`).
pub fn public_key(path: &Path) -> Result<PublicKey> {
    if let Ok(key) = russh::keys::load_public_key(path) {
        return Ok(key);
    }
    let mut pub_path = path.as_os_str().to_owned();
    pub_path.push(".pub");
    if let Ok(key) = russh::keys::load_public_key(&pub_path) {
        return Ok(key);
    }
    Ok(crate::auth::load_identity(path, false)?.public_key().clone())
}

pub fn fingerprint(path: &Path) -> Result<KeyInfo> {
    Ok(info(&public_key(path)?))
}

/// Writes a new key pair to `path` and `path.pub`. `kind` is `ed25519` or `rsa`.
pub fn generate(path: &Path, kind: &str, bits: Option<usize>, comment: &str, passphrase: Option<&str>) -> Result<KeyInfo> {
    if path.exists() {
        return Err(Error::InvalidInput(format!("{} already exists", path.display())));
    }
    let mut rng = rand::rng();
    let mut key = match kind {
        "ed25519" => PrivateKey::random(&mut rng, Algorithm::Ed25519).map_err(russh::keys::Error::from)?,
        "rsa" => {
            let bits = bits.unwrap_or(4096);
            if bits < 2048 {
                return Err(Error::InvalidInput("RSA keys need at least 2048 bits".into()));
            }
            let keypair = russh::keys::ssh_key::private::RsaKeypair::random(&mut rng, bits).map_err(russh::keys::Error::from)?;
            PrivateKey::from(keypair)
        },
        other => return Err(Error::InvalidInput(format!("unsupported key type `{other}` (ed25519, rsa)"))),
    };
    key.set_comment(comment);
    let public = key.public_key().clone();
    if let Some(passphrase) = passphrase.filter(|p| !p.is_empty()) {
        key = key.encrypt(&mut rng, passphrase).map_err(russh::keys::Error::from)?;
    }
    if let Some(parent) = path.parent().filter(|p| !p.as_os_str().is_empty()) {
        std::fs::create_dir_all(parent)?;
    }
    let pem = key.to_openssh(LineEnding::LF).map_err(russh::keys::Error::from)?;
    write_private(path, pem.as_bytes())?;
    let mut pub_path = path.as_os_str().to_owned();
    pub_path.push(".pub");
    let line = public.to_openssh().map_err(russh::keys::Error::from)?;
    std::fs::write(pub_path, format!("{line}\n"))?;
    Ok(info(&public))
}

fn write_private(path: &Path, bytes: &[u8]) -> Result<()> {
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    use std::io::Write;
    options.open(path)?.write_all(bytes)?;
    Ok(())
}

/// Identities held by the running agent.
pub async fn agent_identities(identity_agent: Option<&str>) -> Result<Vec<KeyInfo>> {
    let mut agent = crate::auth::connect_agent(identity_agent)
        .await
        .ok_or_else(|| crate::other("no ssh-agent is running (SSH_AUTH_SOCK, the OpenSSH agent pipe or Pageant)"))?;
    let identities = agent.request_identities().await?;
    Ok(identities.iter().map(|identity| info(identity.public_key().as_ref())).collect())
}

/// Adds the private key at `path` to the agent.
pub async fn agent_add(path: &Path, identity_agent: Option<&str>) -> Result<KeyInfo> {
    let key = crate::auth::load_identity(path, false)?;
    let mut agent = crate::auth::connect_agent(identity_agent)
        .await
        .ok_or_else(|| crate::other("no ssh-agent is running"))?;
    agent.add_identity(&key, &[]).await?;
    Ok(info(key.public_key()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generates_and_reads_back_encrypted_key() {
        let dir = std::env::temp_dir().join(format!("bun-ssh-keys-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let path = dir.join("id_ed25519");
        let made = generate(&path, "ed25519", None, "test@bun", Some("secret")).unwrap();
        assert!(matches!(russh::keys::load_secret_key(&path, None), Err(russh::keys::Error::KeyIsEncrypted)));
        assert!(russh::keys::load_secret_key(&path, Some("secret")).is_ok());
        assert_eq!(fingerprint(&path).unwrap().fingerprint, made.fingerprint);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
