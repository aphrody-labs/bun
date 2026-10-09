//! Streamable HTTP transport (MCP 2025-06-18): `POST /mcp` carries one JSON-RPC message and gets
//! one `application/json` reply (202 for notifications); `GET` has no server-initiated stream
//! (405); `DELETE` ends the session. Bound to 127.0.0.1, browser origins other than localhost are
//! refused.

use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::Arc;

use serde_json::Value;

use crate::server::Server;

const MAX_BODY: usize = 8 * 1024 * 1024;

pub(crate) fn serve(server: &Arc<Server>, port: u16) -> std::io::Result<()> {
    let listener = TcpListener::bind(("127.0.0.1", port))?;
    let addr = listener.local_addr()?;
    eprintln!("bun mcp: listening on http://{addr}/mcp");
    let session = format!("{:016x}", {
        use std::hash::{BuildHasher, RandomState};
        RandomState::new().hash_one(std::process::id())
    });
    for stream in listener.incoming().flatten() {
        let server = Arc::clone(server);
        let session = session.clone();
        std::thread::spawn(move || {
            let _ = connection(&server, stream, &session);
        });
    }
    Ok(())
}

fn respond(
    stream: &mut TcpStream,
    status: &str,
    headers: &[(&str, &str)],
    body: &[u8],
) -> std::io::Result<()> {
    let mut head = format!("HTTP/1.1 {status}\r\nContent-Length: {}\r\n", body.len());
    for (k, v) in headers {
        head.push_str(&format!("{k}: {v}\r\n"));
    }
    head.push_str("\r\n");
    stream.write_all(head.as_bytes())?;
    stream.write_all(body)?;
    stream.flush()
}

fn local_origin(origin: &str) -> bool {
    let host = origin
        .split("://")
        .nth(1)
        .unwrap_or(origin)
        .split('/')
        .next()
        .unwrap_or("");
    let host = host.rsplit_once(':').map_or(host, |(h, p)| {
        if p.bytes().all(|b| b.is_ascii_digit()) {
            h
        } else {
            host
        }
    });
    matches!(host, "localhost" | "127.0.0.1" | "[::1]")
}

fn connection(server: &Server, stream: TcpStream, session: &str) -> std::io::Result<()> {
    let mut writer = stream.try_clone()?;
    let mut reader = BufReader::new(stream);
    loop {
        let mut line = String::new();
        if reader.read_line(&mut line)? == 0 {
            return Ok(());
        }
        let mut parts = line.split_whitespace();
        let method = parts.next().unwrap_or("").to_owned();
        let path = parts.next().unwrap_or("").to_owned();
        let mut length = 0usize;
        let mut close = false;
        let mut origin = None;
        loop {
            let mut h = String::new();
            if reader.read_line(&mut h)? == 0 {
                return Ok(());
            }
            let h = h.trim_end();
            if h.is_empty() {
                break;
            }
            let Some((k, v)) = h.split_once(':') else {
                continue;
            };
            let v = v.trim();
            match k.trim().to_ascii_lowercase().as_str() {
                "content-length" => length = v.parse().unwrap_or(usize::MAX),
                "connection" => close = v.eq_ignore_ascii_case("close"),
                "origin" => origin = Some(v.to_owned()),
                _ => {}
            }
        }
        if length > MAX_BODY {
            return respond(
                &mut writer,
                "413 Payload Too Large",
                &[("Connection", "close")],
                b"",
            );
        }
        let mut body = vec![0u8; length];
        reader.read_exact(&mut body)?;
        let route = path.split('?').next().unwrap_or("");
        if route != "/mcp" && route != "/" {
            respond(&mut writer, "404 Not Found", &[], b"")?;
        } else if origin.as_deref().is_some_and(|o| !local_origin(o)) {
            respond(&mut writer, "403 Forbidden", &[], b"")?;
        } else {
            match method.as_str() {
                "POST" => match serde_json::from_slice::<Value>(&body) {
                    Err(e) => {
                        let err = serde_json::json!({"jsonrpc": "2.0", "id": null, "error": {"code": -32700, "message": e.to_string()}});
                        respond(
                            &mut writer,
                            "400 Bad Request",
                            &[("Content-Type", "application/json")],
                            err.to_string().as_bytes(),
                        )?;
                    }
                    Ok(msg) => match server.handle(msg) {
                        None => respond(&mut writer, "202 Accepted", &[], b"")?,
                        Some(reply) => respond(
                            &mut writer,
                            "200 OK",
                            &[
                                ("Content-Type", "application/json"),
                                ("Mcp-Session-Id", session),
                            ],
                            reply.to_string().as_bytes(),
                        )?,
                    },
                },
                "DELETE" => respond(&mut writer, "204 No Content", &[], b"")?,
                _ => respond(
                    &mut writer,
                    "405 Method Not Allowed",
                    &[("Allow", "POST, DELETE")],
                    b"",
                )?,
            }
        }
        if close {
            return Ok(());
        }
    }
}
