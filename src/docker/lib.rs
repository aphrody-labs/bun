// SPDX-License-Identifier: Apache-2.0
//! Docker Engine HTTP client. No Docker executable or Aphrody service is invoked.

#![allow(
    clippy::disallowed_methods,
    clippy::disallowed_types,
    clippy::disallowed_macros
)]

pub mod cli;
mod transport;

use bytes::Bytes;
use http_body_util::{BodyExt, Empty, Limited};
use hyper::{Method, Request};
use hyper_util::rt::TokioIo;
use serde_json::{Value, json};
use std::time::Duration;

pub type Error = Box<dyn std::error::Error + Send + Sync>;
pub type Result<T> = std::result::Result<T, Error>;

const MAX_RESPONSE: usize = 8 * 1024 * 1024;
const TIMEOUT: Duration = Duration::from_secs(30);

fn invalid(message: impl Into<String>) -> Error {
    std::io::Error::new(std::io::ErrorKind::InvalidInput, message.into()).into()
}

struct Driver(tokio::task::JoinHandle<std::result::Result<(), hyper::Error>>);

impl Drop for Driver {
    fn drop(&mut self) {
        self.0.abort();
    }
}

pub struct Client {
    endpoint: transport::Endpoint,
    timeout: Duration,
}

impl Client {
    pub fn new(host: &str) -> Result<Self> {
        Ok(Self {
            endpoint: transport::Endpoint::parse(host)?,
            timeout: TIMEOUT,
        })
    }

    async fn request(&self, method: Method, path: &str) -> Result<Value> {
        tokio::time::timeout(self.timeout, async {
            let connection = self.endpoint.connect().await?;
            let (mut sender, driver) =
                hyper::client::conn::http1::handshake(TokioIo::new(connection.stream)).await?;
            let _driver = Driver(tokio::spawn(driver));
            // The SSH session must outlive the HTTP channel, including response collection.
            let _session = connection.session;
            let request = Request::builder()
                .method(method)
                .uri(path)
                .header("Host", "docker")
                .body(Empty::<Bytes>::new())?;
            let response = sender.send_request(request).await?;
            let status = response.status();
            let body = Limited::new(response.into_body(), MAX_RESPONSE)
                .collect()
                .await?
                .to_bytes();
            if !status.is_success() {
                return Err(invalid(format!(
                    "Docker Engine returned HTTP {} for {path}",
                    status.as_u16()
                )));
            }
            if body.is_empty() {
                return Ok(Value::Null);
            }
            serde_json::from_slice(&body)
                .map_err(|_| invalid("Docker Engine returned invalid JSON"))
        })
        .await
        .map_err(|_| invalid("Docker Engine request timed out"))?
    }

    async fn version(&self) -> Result<(Value, String)> {
        let data = self.request(Method::GET, "/version").await?;
        let remote = api_version(
            data["ApiVersion"]
                .as_str()
                .ok_or_else(|| invalid("Missing Docker ApiVersion"))?,
        )?;
        let selected = remote.min((1, 51));
        let minimum = data["MinAPIVersion"]
            .as_str()
            .map(api_version)
            .transpose()?
            .unwrap_or((1, 24));
        if selected < minimum || selected < (1, 24) {
            return Err(invalid(
                "Docker Engine API has no supported version in 1.24..1.51",
            ));
        }
        Ok((data, format!("v{}.{}", selected.0, selected.1)))
    }

    pub async fn execute(&self, command: &Command) -> Result<Value> {
        let (version, prefix) = self.version().await?;
        let path = match command {
            Command::Version => return Ok(version),
            Command::Info => "/info",
            Command::Ps { all } => {
                if *all {
                    "/containers/json?all=1"
                } else {
                    "/containers/json"
                }
            }
            Command::Images => "/images/json",
            Command::Start { container, apply } | Command::Stop { container, apply } => {
                validate_container(container)?;
                let inspect = self
                    .request(
                        Method::GET,
                        &format!("/{prefix}/containers/{container}/json"),
                    )
                    .await?;
                let id = inspect["Id"]
                    .as_str()
                    .ok_or_else(|| invalid("Missing inspected container ID"))?;
                if id.len() != 64 || !id.bytes().all(|b| b.is_ascii_hexdigit()) {
                    return Err(invalid("Invalid inspected container ID"));
                }
                let action = if matches!(command, Command::Start { .. }) {
                    "start"
                } else {
                    "stop"
                };
                let endpoint = format!("/{prefix}/containers/{id}/{action}");
                let mut plan = json!({"host": self.endpoint.label(), "method": "POST", "path": endpoint, "containerId": id, "apply": apply});
                if *apply {
                    self.request(Method::POST, &endpoint).await?;
                    plan["applied"] = Value::Bool(true);
                }
                return Ok(plan);
            }
        };
        self.request(Method::GET, &format!("/{prefix}{path}")).await
    }
}

#[derive(Debug)]
pub enum Command {
    Version,
    Info,
    Ps { all: bool },
    Images,
    Start { container: String, apply: bool },
    Stop { container: String, apply: bool },
}

fn api_version(value: &str) -> Result<(u16, u16)> {
    let (major, minor) = value
        .split_once('.')
        .ok_or_else(|| invalid("Invalid Docker API version"))?;
    Ok((
        major
            .parse()
            .map_err(|_| invalid("Invalid Docker API major"))?,
        minor
            .parse()
            .map_err(|_| invalid("Invalid Docker API minor"))?,
    ))
}

fn validate_container(value: &str) -> Result<()> {
    if value.is_empty()
        || value.len() > 256
        || !value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"_.-".contains(&b))
    {
        return Err(invalid("Container must be an ID or a plain Docker name"));
    }
    Ok(())
}

#[cfg(test)]
mod tests;
