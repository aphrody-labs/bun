// SPDX-License-Identifier: Apache-2.0
use crate::{Result, invalid};
use bun_ssh::{config::Overrides, native::Session};
use tokio::io::{AsyncRead, AsyncWrite};

pub(crate) trait Io: AsyncRead + AsyncWrite + Unpin + Send {}
impl<T: AsyncRead + AsyncWrite + Unpin + Send> Io for T {}

pub(crate) struct Connection {
    pub(crate) stream: Box<dyn Io>,
    pub(crate) session: Option<Session>,
}

pub(crate) struct Endpoint {
    host: String,
}

impl Endpoint {
    pub(crate) fn parse(host: &str) -> Result<Self> {
        if host.bytes().any(|b| b.is_ascii_control()) || host.contains(['?', '#']) {
            return Err(invalid("Invalid Docker host"));
        }
        let valid = if let Some(path) = host.strip_prefix("unix://") {
            path.starts_with('/') && path.len() > 1
        } else if let Some(pipe) = host.strip_prefix("npipe://") {
            pipe.starts_with("//./pipe/") && pipe.len() > 9
        } else if let Some(address) = host.strip_prefix("tcp://") {
            !address.contains(['/', '@'])
                && address.rsplit_once(':').is_some_and(|(name, port)| {
                    !name.is_empty() && port.parse::<u16>().is_ok_and(|p| p > 0)
                })
        } else if let Some(destination) = host.strip_prefix("ssh://") {
            !destination.is_empty()
                && destination
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b"@_.-".contains(&b))
        } else {
            false
        };
        if !valid {
            return Err(invalid(
                "Supported Docker hosts: unix://, npipe://, tcp://host:port, ssh://SSH-alias",
            ));
        }
        Ok(Self {
            host: host.to_owned(),
        })
    }

    pub(crate) fn label(&self) -> &str {
        &self.host
    }

    pub(crate) async fn connect(&self) -> Result<Connection> {
        let stream: Box<dyn Io>;
        if let Some(address) = self.host.strip_prefix("tcp://") {
            stream = Box::new(tokio::net::TcpStream::connect(address).await?);
        } else if let Some(destination) = self.host.strip_prefix("ssh://") {
            let session = Session::open(destination, &Overrides::default()).await?;
            let channel = session
                .handle
                .channel_open_direct_streamlocal("/var/run/docker.sock")
                .await?;
            return Ok(Connection {
                stream: Box::new(channel.into_stream()),
                session: Some(session),
            });
        } else if let Some(path) = self.host.strip_prefix("unix://") {
            #[cfg(unix)]
            {
                stream = Box::new(tokio::net::UnixStream::connect(path).await?);
            }
            #[cfg(not(unix))]
            {
                let _ = path;
                return Err(invalid("Unix Docker socket is unavailable on this target"));
            }
        } else {
            #[cfg(windows)]
            {
                let pipe = self
                    .host
                    .strip_prefix("npipe://")
                    .ok_or_else(|| invalid("Invalid pipe host"))?
                    .replace('/', "\\");
                stream =
                    Box::new(tokio::net::windows::named_pipe::ClientOptions::new().open(pipe)?);
            }
            #[cfg(not(windows))]
            {
                return Err(invalid(
                    "Windows Docker named pipe is unavailable on this target",
                ));
            }
        }
        Ok(Connection {
            stream,
            session: None,
        })
    }
}
