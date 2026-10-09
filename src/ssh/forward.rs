// SPDX-License-Identifier: Apache-2.0
//! Port forwards over the in-process client: local (`-L`), remote (`-R`) and dynamic SOCKS5
//! (`-D`). aphrody's service tunnels (`crates/infra/ssh/src/tunnel.rs`) map onto `-L` specs.

use std::sync::Arc;

use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};

use crate::native::Session;
use crate::{Error, Result};

/// A parsed `-L`/`-R` (`[bind:]port:host:hostport`) or `-D` (`[bind:]port`) argument.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Spec {
    pub bind_address: String,
    pub bind_port: u16,
    /// `None` for `-D`.
    pub target: Option<(String, u16)>,
}

fn split_spec(spec: &str) -> Vec<String> {
    // Bracketed IPv6 addresses keep their colons.
    let mut parts = Vec::new();
    let mut current = String::new();
    let mut depth = 0;
    for c in spec.chars() {
        match c {
            '[' => depth += 1,
            ']' => depth -= 1,
            ':' if depth == 0 => {
                parts.push(std::mem::take(&mut current));
                continue;
            },
            _ => {},
        }
        if c != '[' && c != ']' {
            current.push(c);
        }
    }
    parts.push(current);
    parts
}

fn port(value: &str, spec: &str) -> Result<u16> {
    value.parse().map_err(|_| Error::InvalidInput(format!("invalid port in forward `{spec}`")))
}

impl Spec {
    pub fn parse(spec: &str, dynamic: bool) -> Result<Self> {
        let parts = split_spec(spec);
        let bad = || Error::InvalidInput(format!("invalid forward `{spec}`"));
        let (bind_address, rest) = match (dynamic, parts.len()) {
            (true, 1) | (false, 3) => ("127.0.0.1".to_owned(), &parts[..]),
            (true, 2) | (false, 4) => {
                let bind = match parts[0].as_str() {
                    "" | "*" => "0.0.0.0".to_owned(),
                    "localhost" => "127.0.0.1".to_owned(),
                    other => other.to_owned(),
                };
                (bind, &parts[1..])
            },
            _ => return Err(bad()),
        };
        let bind_port = port(&rest[0], spec)?;
        let target = if dynamic { None } else { Some((rest[1].clone(), port(&rest[2], spec)?)) };
        Ok(Self { bind_address, bind_port, target })
    }
}

async fn pipe(session: &Session, mut socket: TcpStream, host: &str, port: u16) -> Result<()> {
    let origin = socket.peer_addr().ok();
    let channel = session
        .handle
        .channel_open_direct_tcpip(
            host.to_owned(),
            u32::from(port),
            origin.map(|a| a.ip().to_string()).unwrap_or_else(|| "127.0.0.1".into()),
            origin.map(|a| u32::from(a.port())).unwrap_or(0),
        )
        .await?;
    let mut stream = channel.into_stream();
    tokio::io::copy_bidirectional(&mut socket, &mut stream).await?;
    Ok(())
}

/// Serves a local forward until the session ends. Returns the bound port through `on_bound`.
pub async fn local(session: Arc<Session>, spec: &Spec, on_bound: impl FnOnce(u16)) -> Result<()> {
    let (host, port) = spec.target.clone().ok_or_else(|| Error::InvalidInput("missing forward target".into()))?;
    let listener = TcpListener::bind((spec.bind_address.as_str(), spec.bind_port)).await?;
    on_bound(listener.local_addr()?.port());
    loop {
        let (socket, _) = listener.accept().await?;
        let session = Arc::clone(&session);
        let host = host.clone();
        tokio::spawn(async move {
            let _ = pipe(&session, socket, &host, port).await;
        });
    }
}

/// Asks the server to listen on `spec.bind_address:spec.bind_port` and connects every incoming
/// connection to the local target.
pub async fn remote(mut session: Session, spec: &Spec, on_bound: impl FnOnce(u16)) -> Result<()> {
    let (host, port) = spec.target.clone().ok_or_else(|| Error::InvalidInput("missing forward target".into()))?;
    let mut incoming = session.take_forwarded().ok_or_else(|| crate::other("remote forwards already taken"))?;
    let bound = session.handle.tcpip_forward(spec.bind_address.clone(), u32::from(spec.bind_port)).await?;
    let bound = if spec.bind_port == 0 { bound } else { u32::from(spec.bind_port) };
    on_bound(u16::try_from(bound).unwrap_or(spec.bind_port));
    let _session = session;
    while let Some(connection) = incoming.recv().await {
        let host = host.clone();
        tokio::spawn(async move {
            if let Ok(mut socket) = TcpStream::connect((host.as_str(), port)).await {
                let mut stream = connection.channel.into_stream();
                let _ = tokio::io::copy_bidirectional(&mut socket, &mut stream).await;
            }
        });
    }
    Ok(())
}

async fn socks5(session: &Session, mut socket: TcpStream) -> Result<()> {
    let mut head = [0u8; 2];
    socket.read_exact(&mut head).await?;
    if head[0] != 5 {
        return Err(crate::other("only SOCKS5 is supported"));
    }
    let mut methods = vec![0u8; usize::from(head[1])];
    socket.read_exact(&mut methods).await?;
    socket.write_all(&[5, 0]).await?;
    let mut request = [0u8; 4];
    socket.read_exact(&mut request).await?;
    if request[1] != 1 {
        socket.write_all(&[5, 7, 0, 1, 0, 0, 0, 0, 0, 0]).await?;
        return Err(crate::other("only SOCKS5 CONNECT is supported"));
    }
    let host = match request[3] {
        1 => {
            let mut ip = [0u8; 4];
            socket.read_exact(&mut ip).await?;
            std::net::Ipv4Addr::from(ip).to_string()
        },
        3 => {
            let len = socket.read_u8().await?;
            let mut name = vec![0u8; usize::from(len)];
            socket.read_exact(&mut name).await?;
            String::from_utf8(name).map_err(|_| crate::other("invalid SOCKS host name"))?
        },
        4 => {
            let mut ip = [0u8; 16];
            socket.read_exact(&mut ip).await?;
            std::net::Ipv6Addr::from(ip).to_string()
        },
        _ => return Err(crate::other("invalid SOCKS address type")),
    };
    let port = socket.read_u16().await?;
    match session.handle.channel_open_direct_tcpip(host, u32::from(port), "127.0.0.1", 0).await {
        Ok(channel) => {
            socket.write_all(&[5, 0, 0, 1, 0, 0, 0, 0, 0, 0]).await?;
            let mut stream = channel.into_stream();
            tokio::io::copy_bidirectional(&mut socket, &mut stream).await?;
            Ok(())
        },
        Err(err) => {
            socket.write_all(&[5, 5, 0, 1, 0, 0, 0, 0, 0, 0]).await?;
            Err(err.into())
        },
    }
}

/// Serves a SOCKS5 proxy (`-D`) until the session ends.
pub async fn dynamic(session: Arc<Session>, spec: &Spec, on_bound: impl FnOnce(u16)) -> Result<()> {
    let listener = TcpListener::bind((spec.bind_address.as_str(), spec.bind_port)).await?;
    on_bound(listener.local_addr()?.port());
    loop {
        let (socket, _) = listener.accept().await?;
        let session = Arc::clone(&session);
        tokio::spawn(async move {
            let _ = socks5(&session, socket).await;
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_specs() {
        let spec = Spec::parse("8080:localhost:80", false).unwrap();
        assert_eq!(spec.bind_address, "127.0.0.1");
        assert_eq!(spec.bind_port, 8080);
        assert_eq!(spec.target, Some(("localhost".into(), 80)));
        let spec = Spec::parse("*:0:[::1]:5432", false).unwrap();
        assert_eq!(spec.bind_address, "0.0.0.0");
        assert_eq!(spec.target, Some(("::1".into(), 5432)));
        let spec = Spec::parse("1080", true).unwrap();
        assert_eq!((spec.bind_port, spec.target), (1080, None));
        assert!(Spec::parse("a:b", false).is_err());
    }
}
