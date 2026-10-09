// SPDX-License-Identifier: Apache-2.0
//! In-process SSH client on `russh`, moved from aphrody's `crates/infra/ssh/src/in_process.rs`
//! (`InProcessSshSession`, `SftpDriver`). Additions: host key verification, agent and encrypted
//! keys (see `auth`), `ProxyJump` chains over `direct-tcpip`, streamed exec with stdin, PTY shells,
//! keepalive and connect timeouts.

use std::borrow::Cow;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use russh::client::{self, Handle, Msg};
use russh::keys::PublicKeyOrCertificate;
use russh::{Channel, ChannelMsg};
use russh_sftp::client::SftpSession;
use russh_sftp::protocol::OpenFlags;
use serde::{Deserialize, Serialize};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::sync::mpsc;

use crate::config::{Destination, HostConfig, Overrides};
use crate::rsync::{self, DifferentialSummary, RsyncOptions};
use crate::{Error, Result, known_hosts};

/// A connection opened by the server for a remote (`-R`) forward.
pub struct ForwardedConnection {
    pub channel: Channel<Msg>,
    pub connected_address: String,
    pub connected_port: u32,
}

pub struct ClientHandler {
    config: HostConfig,
    host_key_error: Arc<Mutex<Option<Error>>>,
    forwarded: Option<mpsc::UnboundedSender<ForwardedConnection>>,
}

impl client::Handler for ClientHandler {
    type Error = russh::Error;

    async fn check_server_key(&mut self, key: &PublicKeyOrCertificate) -> Result<bool, Self::Error> {
        let PublicKeyOrCertificate::PublicKey { key, .. } = key else {
            *self.host_key_error.lock().unwrap_or_else(|e| e.into_inner()) = Some(Error::HostKey {
                host: self.config.hostname.clone(),
                reason: "host certificates are not supported by the in-process client".into(),
            });
            return Ok(false);
        };
        match known_hosts::verify(&self.config, key) {
            Ok(()) => Ok(true),
            Err(err) => {
                *self.host_key_error.lock().unwrap_or_else(|e| e.into_inner()) = Some(err);
                Ok(false)
            },
        }
    }

    async fn server_channel_open_forwarded_tcpip(
        &mut self,
        channel: Channel<Msg>,
        connected_address: &str,
        connected_port: u32,
        _originator_address: &str,
        _originator_port: u32,
        reply: client::ChannelOpenHandle,
        _session: &mut client::Session,
    ) -> Result<(), Self::Error> {
        match &self.forwarded {
            Some(sender) => {
                reply.accept().await;
                let _ = sender.send(ForwardedConnection {
                    channel,
                    connected_address: connected_address.to_owned(),
                    connected_port,
                });
            },
            None => drop(reply),
        }
        Ok(())
    }
}

fn client_config(config: &HostConfig) -> client::Config {
    client::Config {
        inactivity_timeout: None,
        keepalive_interval: config.server_alive_interval.map(Duration::from_secs),
        keepalive_max: config.server_alive_count_max.max(1) as usize,
        preferred: russh::Preferred { kex: Cow::Owned(russh::Preferred::default().kex.to_vec()), ..Default::default() },
        ..Default::default()
    }
}

/// An authenticated SSH connection. Jump hosts stay connected for its lifetime.
pub struct Session {
    pub handle: Handle<ClientHandler>,
    pub config: HostConfig,
    _jumps: Vec<Session>,
    forwarded: Option<mpsc::UnboundedReceiver<ForwardedConnection>>,
}

impl Session {
    /// Resolves `destination` and connects.
    pub async fn open(destination: &str, overrides: &Overrides) -> Result<Self> {
        let destination = Destination::parse(destination)?;
        let config = HostConfig::resolve(&destination, overrides)?;
        Self::connect(&config).await
    }

    pub async fn connect(config: &HostConfig) -> Result<Self> {
        let timeout = config.connect_timeout.unwrap_or(30);
        match tokio::time::timeout(Duration::from_secs(timeout), Self::connect_inner(config)).await {
            Ok(result) => result,
            Err(_) => Err(Error::Timeout(timeout)),
        }
    }

    async fn connect_inner(config: &HostConfig) -> Result<Self> {
        let host_key_error = Arc::new(Mutex::new(None));
        let (forward_tx, forward_rx) = mpsc::unbounded_channel();
        let handler = ClientHandler {
            config: config.clone(),
            host_key_error: Arc::clone(&host_key_error),
            forwarded: Some(forward_tx),
        };
        let russh_config = Arc::new(client_config(config));
        let mut jumps = Vec::new();
        let connected = match &config.proxy_jump {
            Some(chain) => {
                let mut hops: Vec<&str> = chain.split(',').map(str::trim).filter(|h| !h.is_empty()).collect();
                let last = hops.pop().ok_or_else(|| Error::InvalidInput("empty ProxyJump".into()))?;
                let overrides = Overrides {
                    proxy_jump: (!hops.is_empty()).then(|| hops.join(",")),
                    ..Overrides::default()
                };
                let jump_config = HostConfig::resolve(&Destination::parse(last)?, &overrides)?;
                let jump = Box::pin(Self::connect(&jump_config)).await?;
                let channel = jump
                    .handle
                    .channel_open_direct_tcpip(config.hostname.clone(), u32::from(config.port), "127.0.0.1", 0)
                    .await?;
                jumps.push(jump);
                client::connect_stream(russh_config, channel.into_stream(), handler).await
            },
            None => client::connect(russh_config, (config.hostname.as_str(), config.port), handler).await,
        };
        let mut handle = match connected {
            Ok(handle) => handle,
            Err(err) => {
                if let Some(host_error) = host_key_error.lock().unwrap_or_else(|e| e.into_inner()).take() {
                    return Err(host_error);
                }
                return Err(err.into());
            },
        };
        crate::auth::authenticate(&mut handle, config).await?;
        Ok(Self { handle, config: config.clone(), _jumps: jumps, forwarded: Some(forward_rx) })
    }

    /// Connections opened by the server for `tcpip_forward` requests. Can be taken once.
    pub fn take_forwarded(&mut self) -> Option<mpsc::UnboundedReceiver<ForwardedConnection>> {
        self.forwarded.take()
    }

    /// Runs `command` and collects its output (aphrody's `InProcessSshSession::exec`).
    pub async fn exec_collect(&self, command: &str, stdin: Option<&[u8]>) -> Result<(i32, Vec<u8>, Vec<u8>)> {
        let mut channel = self.handle.channel_open_session().await?;
        channel.exec(true, command).await?;
        if let Some(input) = stdin {
            channel.data_bytes(input.to_vec()).await?;
        }
        channel.eof().await?;
        let mut stdout = Vec::new();
        let mut stderr = Vec::new();
        let mut code = None;
        while let Some(msg) = channel.wait().await {
            match msg {
                ChannelMsg::Data { data } => stdout.extend_from_slice(&data),
                ChannelMsg::ExtendedData { data, .. } => stderr.extend_from_slice(&data),
                ChannelMsg::ExitStatus { exit_status } => code = Some(exit_status as i32),
                ChannelMsg::ExitSignal { .. } => code = code.or(Some(255)),
                _ => {},
            }
        }
        Ok((code.unwrap_or(255), stdout, stderr))
    }

    /// Runs `command` (or a login shell when `None`) streaming stdin, stdout and stderr.
    /// With `pty`, the local terminal is switched to raw mode and resizes are forwarded.
    pub async fn run_interactive(&self, command: Option<&str>, pty: bool, forward_stdin: bool) -> Result<i32> {
        let channel = self.handle.channel_open_session().await?;
        let _raw = if pty {
            let (cols, rows) = crate::term::size().unwrap_or((80, 24));
            let term = std::env::var("TERM").ok().filter(|t| !t.is_empty()).unwrap_or_else(|| "xterm-256color".into());
            channel.request_pty(true, &term, u32::from(cols), u32::from(rows), 0, 0, &[]).await?;
            crate::term::RawMode::enable()
        } else {
            None
        };
        match command {
            Some(command) => channel.exec(true, command).await?,
            None => channel.request_shell(true).await?,
        }
        let (mut read, write) = channel.split();
        let write = Arc::new(write);
        if forward_stdin {
            let writer = Arc::clone(&write);
            let mut chunks = crate::stdin_chunks();
            tokio::spawn(async move {
                while let Some(Some(chunk)) = chunks.recv().await {
                    if writer.data_bytes(chunk).await.is_err() {
                        return;
                    }
                }
                let _ = writer.eof().await;
            });
        } else {
            write.eof().await?;
        }
        if pty {
            let writer = Arc::clone(&write);
            tokio::spawn(async move {
                let mut last = crate::term::size();
                loop {
                    tokio::time::sleep(Duration::from_millis(250)).await;
                    let now = crate::term::size();
                    if now != last {
                        if let Some((cols, rows)) = now {
                            if writer.window_change(u32::from(cols), u32::from(rows), 0, 0).await.is_err() {
                                return;
                            }
                        }
                        last = now;
                    }
                }
            });
        }
        let mut code = None;
        while let Some(msg) = read.wait().await {
            match msg {
                ChannelMsg::Data { data } => crate::write_stdout(&data),
                ChannelMsg::ExtendedData { data, .. } => crate::write_stderr(&data),
                ChannelMsg::ExitStatus { exit_status } => code = Some(exit_status as i32),
                ChannelMsg::ExitSignal { signal_name, .. } => {
                    crate::write_stderr(format!("remote command killed by signal {signal_name:?}\n").as_bytes());
                    code = code.or(Some(255));
                },
                _ => {},
            }
        }
        Ok(code.unwrap_or(255))
    }

    /// Opens an SFTP session on a new channel.
    pub async fn sftp(&self) -> Result<SftpSession> {
        let channel = self.handle.channel_open_session().await?;
        channel.request_subsystem(true, "sftp").await?;
        Ok(SftpSession::new(channel.into_stream()).await?)
    }

    pub async fn close(&self) {
        let _ = self.handle.disconnect(russh::Disconnect::ByApplication, "", "en").await;
    }
}

/// File or directory metadata from SFTP.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SftpFileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub is_symlink: bool,
    pub size: u64,
    pub permissions: u32,
    pub modified_time: u32,
}

/// Recursive remote tree.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SftpTreeNode {
    pub entry: SftpFileEntry,
    pub children: Vec<SftpTreeNode>,
}

fn join_remote(dir: &str, name: &str) -> String {
    if dir.ends_with('/') { format!("{dir}{name}") } else { format!("{dir}/{name}") }
}

/// SFTP operations.
pub struct SftpDriver;

impl SftpDriver {
    pub async fn stat(sftp: &SftpSession, remote_path: &str) -> Result<SftpFileEntry> {
        let attrs = sftp.metadata(remote_path).await?;
        let mode = attrs.permissions.unwrap_or(0);
        let name = remote_path.trim_end_matches('/').rsplit('/').next().unwrap_or(remote_path).to_owned();
        Ok(SftpFileEntry {
            name,
            path: remote_path.to_owned(),
            is_dir: (mode & 0o170000) == 0o040000,
            is_symlink: (mode & 0o170000) == 0o120000,
            size: attrs.size.unwrap_or(0),
            permissions: mode,
            modified_time: attrs.mtime.unwrap_or(0),
        })
    }

    pub async fn read_dir(sftp: &SftpSession, remote_path: &str) -> Result<Vec<SftpFileEntry>> {
        let mut results = Vec::new();
        for entry in sftp.read_dir(remote_path).await? {
            let name = entry.file_name();
            if name == "." || name == ".." {
                continue;
            }
            let attrs = entry.metadata();
            let mode = attrs.permissions.unwrap_or(0);
            results.push(SftpFileEntry {
                path: join_remote(remote_path, &name),
                name,
                is_dir: (mode & 0o170000) == 0o040000,
                is_symlink: (mode & 0o170000) == 0o120000,
                size: attrs.size.unwrap_or(0),
                permissions: mode,
                modified_time: attrs.mtime.unwrap_or(0),
            });
        }
        results.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then_with(|| a.name.cmp(&b.name)));
        Ok(results)
    }

    pub async fn tree(sftp: &SftpSession, remote_path: &str, max_depth: usize) -> Result<SftpTreeNode> {
        let mut root = SftpTreeNode { entry: Self::stat(sftp, remote_path).await?, children: Vec::new() };
        if root.entry.is_dir && max_depth > 0 {
            Self::build_tree(sftp, &mut root, max_depth - 1).await?;
        }
        Ok(root)
    }

    async fn build_tree(sftp: &SftpSession, parent: &mut SftpTreeNode, depth_left: usize) -> Result<()> {
        for entry in Self::read_dir(sftp, &parent.entry.path).await? {
            let is_dir = entry.is_dir;
            let mut child = SftpTreeNode { entry, children: Vec::new() };
            if is_dir && depth_left > 0 {
                Box::pin(Self::build_tree(sftp, &mut child, depth_left - 1)).await?;
            }
            parent.children.push(child);
        }
        Ok(())
    }

    pub async fn read_file(sftp: &SftpSession, remote_path: &str) -> Result<Vec<u8>> {
        let mut file = sftp.open_with_flags(remote_path, OpenFlags::READ).await?;
        let mut content = Vec::new();
        file.read_to_end(&mut content).await?;
        Ok(content)
    }

    pub async fn write_file(sftp: &SftpSession, remote_path: &str, content: &[u8]) -> Result<()> {
        let mut file = sftp
            .open_with_flags(remote_path, OpenFlags::CREATE | OpenFlags::TRUNCATE | OpenFlags::WRITE)
            .await?;
        file.write_all(content).await?;
        file.shutdown().await?;
        Ok(())
    }

    /// Creates `remote_path` and its missing parents.
    pub async fn mkdir_all(sftp: &SftpSession, remote_path: &str) -> Result<()> {
        let mut current = String::new();
        for part in remote_path.split('/') {
            if part.is_empty() {
                if current.is_empty() {
                    current.push('/');
                }
                continue;
            }
            current = if current.is_empty() || current == "/" { format!("{current}{part}") } else { format!("{current}/{part}") };
            if sftp.metadata(&current).await.is_err() {
                sftp.create_dir(&current).await?;
            }
        }
        Ok(())
    }

    /// Uploads `local_content` unless the remote file already holds it. When it differs, the
    /// rsync delta against the remote copy is reported; SFTP has no partial-patch primitive, so
    /// the bytes written are still the whole file (true delta transfer needs `rsync` or a remote
    /// bun, see `crate::rsync`).
    pub async fn upload_differential(sftp: &SftpSession, local_content: &[u8], remote_path: &str) -> Result<DifferentialSummary> {
        if sftp.metadata(remote_path).await.is_ok() {
            let remote_base = Self::read_file(sftp, remote_path).await?;
            let (_, summary) = rsync::compute_delta_from_buffers(&remote_base, local_content, RsyncOptions::default())?;
            if remote_base != local_content {
                Self::write_file(sftp, remote_path, local_content).await?;
            }
            Ok(summary)
        } else {
            Self::write_file(sftp, remote_path, local_content).await?;
            Ok(DifferentialSummary {
                original_size: 0,
                modified_size: local_content.len() as u64,
                signature_size: 0,
                delta_size: local_content.len(),
                savings_percentage: 0,
            })
        }
    }
}

struct KeyProbe(Arc<Mutex<Option<russh::keys::PublicKey>>>);

impl client::Handler for KeyProbe {
    type Error = russh::Error;

    async fn check_server_key(&mut self, key: &PublicKeyOrCertificate) -> Result<bool, Self::Error> {
        if let PublicKeyOrCertificate::PublicKey { key, .. } = key {
            *self.0.lock().unwrap_or_else(|e| e.into_inner()) = Some(key.clone());
        }
        Ok(false)
    }
}

/// Fetches the host key `config` would be offered, without authenticating (like `ssh-keyscan`).
pub async fn fetch_host_key(config: &HostConfig) -> Result<russh::keys::PublicKey> {
    let slot = Arc::new(Mutex::new(None));
    let timeout = Duration::from_secs(config.connect_timeout.unwrap_or(30));
    let connect = client::connect(Arc::new(client_config(config)), (config.hostname.as_str(), config.port), KeyProbe(Arc::clone(&slot)));
    let _ = tokio::time::timeout(timeout, connect).await;
    let key = slot.lock().unwrap_or_else(|e| e.into_inner()).take();
    key.ok_or_else(|| crate::other(format!("no host key received from {}:{}", config.hostname, config.port)))
}
