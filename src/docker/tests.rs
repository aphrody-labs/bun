use super::*;
use std::sync::{Arc, Mutex};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

struct Engine {
    host: String,
    requests: Arc<Mutex<Vec<String>>>,
    task: tokio::task::JoinHandle<()>,
}

impl Drop for Engine {
    fn drop(&mut self) {
        self.task.abort();
    }
}

impl Engine {
    async fn start(responses: Vec<Vec<u8>>) -> Self {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let host = format!("tcp://{}", listener.local_addr().unwrap());
        let requests = Arc::new(Mutex::new(Vec::new()));
        let seen = Arc::clone(&requests);
        let task = tokio::spawn(async move {
            for response in responses {
                let (mut socket, _) = listener.accept().await.unwrap();
                let mut request = Vec::new();
                let mut buffer = [0; 1024];
                while !request.windows(4).any(|s| s == b"\r\n\r\n") {
                    let length = socket.read(&mut buffer).await.unwrap();
                    assert!(length > 0 && request.len() < 8192);
                    request.extend_from_slice(&buffer[..length]);
                }
                seen.lock().unwrap().push(
                    String::from_utf8(request)
                        .unwrap()
                        .lines()
                        .next()
                        .unwrap()
                        .to_owned(),
                );
                if !response.is_empty() {
                    let _ = socket.write_all(&response).await;
                    let _ = socket.shutdown().await;
                } else {
                    std::future::pending::<()>().await;
                }
            }
        });
        Self {
            host,
            requests,
            task,
        }
    }
}

fn response(status: u16, body: &str) -> Vec<u8> {
    format!(
        "HTTP/1.1 {status} Test\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    )
    .into_bytes()
}

fn version() -> Vec<u8> {
    response(200, r#"{"ApiVersion":"1.99","MinAPIVersion":"1.24"}"#)
}

async fn read_request(stream: &mut (impl tokio::io::AsyncRead + Unpin)) -> String {
    let mut data = Vec::new();
    let mut buffer = [0; 1024];
    while !data.windows(4).any(|part| part == b"\r\n\r\n") {
        let size = stream.read(&mut buffer).await.unwrap();
        assert!(size > 0 && data.len() < 8192);
        data.extend_from_slice(&buffer[..size]);
    }
    String::from_utf8(data)
        .unwrap()
        .lines()
        .next()
        .unwrap()
        .to_owned()
}

#[tokio::test]
async fn negotiates_and_lists_containers() {
    let engine = Engine::start(vec![
        version(),
        response(200, r#"[{"Id":"123","Names":["/example"]}]"#),
    ])
    .await;
    let data = Client::new(&engine.host)
        .unwrap()
        .execute(&Command::Ps { all: true })
        .await
        .unwrap();
    assert_eq!(data[0]["Id"], "123");
    assert_eq!(
        *engine.requests.lock().unwrap(),
        [
            "GET /version HTTP/1.1",
            "GET /v1.51/containers/json?all=1 HTTP/1.1"
        ]
    );
}

#[tokio::test]
async fn respects_older_supported_api() {
    let engine = Engine::start(vec![
        response(200, r#"{"ApiVersion":"1.45","MinAPIVersion":"1.24"}"#),
        response(200, "[]"),
    ])
    .await;
    Client::new(&engine.host)
        .unwrap()
        .execute(&Command::Images)
        .await
        .unwrap();
    assert_eq!(
        engine.requests.lock().unwrap()[1],
        "GET /v1.45/images/json HTTP/1.1"
    );
}

#[tokio::test]
async fn mutation_plan_resolves_identity_without_post() {
    let id = "a".repeat(64);
    let inspect = json!({"Id":id,"Config":{"Env":["PRIVATE=value"]}}).to_string();
    let engine = Engine::start(vec![version(), response(200, &inspect)]).await;
    let plan = Client::new(&engine.host)
        .unwrap()
        .execute(&Command::Stop {
            container: "example".into(),
            apply: false,
        })
        .await
        .unwrap();
    assert_eq!(plan["method"], "POST");
    assert_eq!(plan["path"], format!("/v1.51/containers/{id}/stop"));
    assert_eq!(plan["apply"], false);
    assert!(plan.get("Config").is_none());
    assert_eq!(engine.requests.lock().unwrap().len(), 2);
    assert!(
        engine
            .requests
            .lock()
            .unwrap()
            .iter()
            .all(|r| r.starts_with("GET "))
    );
}

#[tokio::test]
async fn explicit_apply_posts_exact_resolved_id() {
    let id = "b".repeat(64);
    let engine = Engine::start(vec![
        version(),
        response(200, &json!({"Id":id}).to_string()),
        response(204, ""),
    ])
    .await;
    let result = Client::new(&engine.host)
        .unwrap()
        .execute(&Command::Start {
            container: "example".into(),
            apply: true,
        })
        .await
        .unwrap();
    assert_eq!(result["applied"], true);
    assert_eq!(
        engine.requests.lock().unwrap()[2],
        format!("POST /v1.51/containers/{id}/start HTTP/1.1")
    );
}

#[tokio::test]
async fn engine_errors_do_not_disclose_response_body() {
    let engine = Engine::start(vec![response(403, r#"{"message":"PRIVATE_TOKEN"}"#)]).await;
    let error = Client::new(&engine.host)
        .unwrap()
        .execute(&Command::Version)
        .await
        .unwrap_err()
        .to_string();
    assert!(error.contains("HTTP 403"));
    assert!(!error.contains("PRIVATE_TOKEN"));
}

#[tokio::test]
async fn rejects_truncated_or_oversized_body() {
    let truncated = Engine::start(vec![
        b"HTTP/1.1 200 OK\r\nContent-Length: 100\r\nConnection: close\r\n\r\n{}".to_vec(),
    ])
    .await;
    assert!(
        Client::new(&truncated.host)
            .unwrap()
            .execute(&Command::Version)
            .await
            .is_err()
    );
    let large = Engine::start(vec![response(200, &"a".repeat(MAX_RESPONSE + 1))]).await;
    assert!(
        Client::new(&large.host)
            .unwrap()
            .execute(&Command::Version)
            .await
            .is_err()
    );
}

#[tokio::test]
async fn accepts_chunked_engine_responses() {
    let body = r#"{"ApiVersion":"1.51"}"#;
    let raw = format!(
        "HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n{:x}\r\n{body}\r\n0\r\n\r\n",
        body.len()
    );
    let engine = Engine::start(vec![raw.into_bytes()]).await;
    assert_eq!(
        Client::new(&engine.host)
            .unwrap()
            .execute(&Command::Version)
            .await
            .unwrap()["ApiVersion"],
        "1.51"
    );
}

#[tokio::test]
async fn request_timeout_is_bounded() {
    let engine = Engine::start(vec![Vec::new()]).await;
    let mut client = Client::new(&engine.host).unwrap();
    client.timeout = Duration::from_millis(25);
    let error = client
        .execute(&Command::Version)
        .await
        .unwrap_err()
        .to_string();
    assert_eq!(error, "Docker Engine request timed out");
}

#[tokio::test]
async fn unsupported_version_fails_without_followup_request() {
    let engine = Engine::start(vec![response(
        200,
        r#"{"ApiVersion":"1.99","MinAPIVersion":"1.52"}"#,
    )])
    .await;
    assert!(
        Client::new(&engine.host)
            .unwrap()
            .execute(&Command::Info)
            .await
            .is_err()
    );
    assert_eq!(engine.requests.lock().unwrap().len(), 1);
}

#[test]
fn rejects_host_and_container_injection() {
    for host in [
        "tcp://user:password@server:2375",
        "ssh://host;rm",
        "ssh://host/path",
        "unix:///x\r\nHeader:value",
        "https://host",
    ] {
        assert!(Client::new(host).is_err(), "{host}");
    }
    for name in ["", "../other", "name?force=1", "name\r\n"] {
        assert!(validate_container(name).is_err());
    }
    for host in [
        "unix:///var/run/docker.sock",
        "npipe:////./pipe/docker_engine",
        "tcp://127.0.0.1:2375",
        "ssh://vps",
    ] {
        assert!(Client::new(host).is_ok(), "{host}");
    }
}

#[cfg(windows)]
#[tokio::test]
async fn windows_named_pipe_reads_engine_response() {
    let name = format!("\\\\.\\pipe\\bun-docker-engine-test-{}", std::process::id());
    let mut pipe = tokio::net::windows::named_pipe::ServerOptions::new()
        .first_pipe_instance(true)
        .create(&name)
        .unwrap();
    let (complete, received) = tokio::sync::oneshot::channel();
    let task = tokio::spawn(async move {
        pipe.connect().await.unwrap();
        assert_eq!(read_request(&mut pipe).await, "GET /version HTTP/1.1");
        pipe.write_all(&version()).await.unwrap();
        pipe.flush().await.unwrap();
        let _ = received.await;
    });
    let host = format!("npipe://{}", name.replace('\\', "/"));
    let value = Client::new(&host)
        .unwrap()
        .execute(&Command::Version)
        .await
        .unwrap();
    assert_eq!(value["ApiVersion"], "1.99");
    complete.send(()).unwrap();
    task.await.unwrap();
}

#[cfg(unix)]
#[tokio::test]
async fn unix_socket_reads_engine_response() {
    struct SocketPath(std::path::PathBuf);
    impl Drop for SocketPath {
        fn drop(&mut self) {
            let _ = std::fs::remove_file(&self.0);
        }
    }
    let path = std::env::temp_dir().join(format!(
        "bun-docker-engine-test-{}.sock",
        std::process::id()
    ));
    let listener = tokio::net::UnixListener::bind(&path).unwrap();
    let _path = SocketPath(path.clone());
    let task = tokio::spawn(async move {
        let (mut socket, _) = listener.accept().await.unwrap();
        assert_eq!(read_request(&mut socket).await, "GET /version HTTP/1.1");
        socket.write_all(&version()).await.unwrap();
        socket.shutdown().await.unwrap();
    });
    let host = format!("unix://{}", path.display());
    assert_eq!(
        Client::new(&host)
            .unwrap()
            .execute(&Command::Version)
            .await
            .unwrap()["ApiVersion"],
        "1.99"
    );
    task.await.unwrap();
}
