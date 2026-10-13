//! Jev decisions through the shared Rust owner; aliases share routing and budgets.

use std::{
    io::Read,
    path::Path,
    sync::{Arc, Mutex, OnceLock},
    time::{Duration, Instant},
};

use aphrody_jev::{JevError, JevRouter, Request, decision_output, protocol};

use crate::registry::{Annotations, Args, Context, Output, Tool, ToolError};

const MAX_KEY_BYTES: u64 = 8192;
const MAX_INPUT_TOKENS: usize = aphrody_jev::EDGE_CONTEXT_TOKENS;
const MAX_WINDOW_TOKENS: usize = MAX_INPUT_TOKENS * 2;
const MAX_CALLS: usize = 20;
const MAX_JUDGMENTS: usize = 64;
const WINDOW: Duration = Duration::from_secs(60);
const AUTH_ERROR: &str = "Jev authentication or configuration is unavailable";

struct Budget {
    since: Instant,
    calls: usize,
    judgments: usize,
    tokens: usize,
    active: bool,
}

impl Default for Budget {
    fn default() -> Self {
        Self {
            since: Instant::now(),
            calls: 0,
            judgments: 0,
            tokens: 0,
            active: false,
        }
    }
}

impl Budget {
    fn reserve(&mut self, judgments: usize, tokens: usize, now: Instant) -> Result<(), ToolError> {
        if self.active {
            return Err(ToolError::Failed(
                "A Jev judgment is already running".into(),
            ));
        }
        if now.saturating_duration_since(self.since) >= WINDOW {
            *self = Self {
                since: now,
                ..Self::default()
            };
        }
        if self.calls >= MAX_CALLS
            || judgments > MAX_JUDGMENTS.saturating_sub(self.judgments)
            || tokens > MAX_WINDOW_TOKENS.saturating_sub(self.tokens)
        {
            return Err(ToolError::Failed(
                "Jev judgment budget exhausted for this minute".into(),
            ));
        }
        self.calls += 1;
        self.judgments += judgments;
        self.tokens += tokens;
        self.active = true;
        Ok(())
    }
}

#[derive(Default)]
struct JevState {
    router: Mutex<Option<Arc<JevRouter>>>,
    runtime: OnceLock<Result<tokio::runtime::Runtime, ()>>,
    budget: Mutex<Budget>,
}

struct Reservation<'a>(&'a Mutex<Budget>);

impl Drop for Reservation<'_> {
    fn drop(&mut self) {
        self.0
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .active = false;
    }
}

fn key_file(path: &str) -> Result<String, ToolError> {
    let path = Path::new(path);
    if !path.is_absolute() {
        return Err(ToolError::Failed(AUTH_ERROR.into()));
    }
    let file = std::fs::File::open(path).map_err(|_| ToolError::Failed(AUTH_ERROR.into()))?;
    if !file
        .metadata()
        .map_err(|_| ToolError::Failed(AUTH_ERROR.into()))?
        .is_file()
    {
        return Err(ToolError::Failed(AUTH_ERROR.into()));
    }
    let mut bytes = Vec::new();
    file.take(MAX_KEY_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| ToolError::Failed(AUTH_ERROR.into()))?;
    if bytes.len() > MAX_KEY_BYTES as usize {
        return Err(ToolError::Failed(AUTH_ERROR.into()));
    }
    let key = String::from_utf8(bytes).map_err(|_| ToolError::Failed(AUTH_ERROR.into()))?;
    let key = key.trim();
    if key.is_empty() || key.chars().any(char::is_whitespace) {
        return Err(ToolError::Failed(AUTH_ERROR.into()));
    }
    Ok(key.to_owned())
}

fn configured_router(
    settings: impl Fn(&str) -> Option<String>,
    read_key: impl Fn(&str) -> Result<String, ToolError>,
) -> Result<JevRouter, ToolError> {
    let key = match settings("TYPESAFE_API_KEY") {
        Some(key) => Some(key),
        None => settings("TYPESAFE_API_KEY_FILE")
            .as_deref()
            .map(read_key)
            .transpose()?,
    };
    JevRouter::from_settings(
        |name| {
            if name == "TYPESAFE_API_KEY" {
                key.clone()
            } else {
                settings(name)
            }
        },
        None,
    )
    .map_err(provider_error)
}

fn provider_error(error: JevError) -> ToolError {
    match error {
        JevError::InvalidRequest(_) => ToolError::InvalidArgs("Invalid Jev request".into()),
        JevError::NoBackend
        | JevError::Config(_)
        | JevError::Rejected {
            status: 401 | 403, ..
        } => ToolError::Failed(AUTH_ERROR.into()),
        JevError::Rejected { status, .. } => {
            ToolError::Failed(format!("Jev backend rejected the request (HTTP {status})"))
        }
        JevError::TooLarge { .. } => {
            ToolError::InvalidArgs("Jev request exceeds the backend context limit".into())
        }
        JevError::Format(_) => {
            ToolError::Failed("Jev backend returned a nonconforming response".into())
        }
        JevError::Unavailable(_) => ToolError::Failed("Jev backend is unavailable".into()),
    }
}

fn arguments(args: &Args<'_>) -> Result<(Request, Option<f64>), ToolError> {
    let mut fields = args.0.clone();
    fields.remove("cursor");
    fields.remove("max_tokens");
    let minimum_confidence = fields
        .remove("minimum_confidence")
        .map(serde_json::from_value::<Option<f64>>)
        .transpose()
        .map_err(|_| {
            ToolError::InvalidArgs("minimum_confidence must be a number from 0 to 1".into())
        })?
        .flatten();
    if let Some(threshold) = minimum_confidence {
        aphrody_jev::validate_confidence_threshold(threshold).map_err(provider_error)?;
    }
    let encoded = serde_json::to_vec(&fields)
        .map_err(|_| ToolError::InvalidArgs("Invalid Jev request".into()))?;
    let value = protocol::parse(&encoded)
        .map_err(|_| ToolError::InvalidArgs("Invalid or oversized Jev request".into()))?;
    protocol::request(&value).map_err(|_| ToolError::InvalidArgs("Invalid Jev request".into()))?;
    let request: Request = serde_json::from_value(value)
        .map_err(|_| ToolError::InvalidArgs("Invalid Jev request".into()))?;
    if request.estimated_tokens() > MAX_INPUT_TOKENS {
        return Err(ToolError::InvalidArgs(
            "Jev request exceeds 32000 estimated input tokens".into(),
        ));
    }
    Ok((request, minimum_confidence))
}

fn decide_with(
    state: &JevState,
    args: &Args<'_>,
    build: impl FnOnce() -> Result<JevRouter, ToolError>,
) -> Result<Output, ToolError> {
    let (request, minimum_confidence) = arguments(args)?;
    let router = {
        let mut router = state
            .router
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        if router.is_none() {
            *router = Some(Arc::new(build()?));
        }
        Arc::clone(
            router
                .as_ref()
                .ok_or_else(|| ToolError::Failed(AUTH_ERROR.into()))?,
        )
    };
    state
        .budget
        .lock()
        .unwrap_or_else(|error| error.into_inner())
        .reserve(
            request.questions.len(),
            request.estimated_tokens(),
            Instant::now(),
        )?;
    let _reservation = Reservation(&state.budget);
    // MCP runs before JSC, on blocking stdio/HTTP worker threads. One executor
    // drives the existing async endpoint owner; the reservation excludes overlap.
    let runtime = state
        .runtime
        .get_or_init(|| {
            tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .map_err(|_| ())
        })
        .as_ref()
        .map_err(|()| ToolError::Failed("Jev executor is unavailable".into()))?;
    let decision = runtime
        .block_on(router.decide(&request))
        .map_err(provider_error)?;
    let output =
        decision_output(&request, &decision, minimum_confidence).map_err(provider_error)?;
    Ok(Output::text(output.to_string()))
}

fn decide(ctx: &Context, args: &Args<'_>) -> Result<Output, ToolError> {
    decide_with(ctx.state::<JevState>(), args, || {
        configured_router(
            |name| {
                std::env::var(name)
                    .ok()
                    .filter(|value| !value.trim().is_empty())
            },
            key_file,
        )
    })
}

const SCHEMA: &str = r#"{"type":"object","properties":{"state":{"type":["string","object","array","null"]},"model":{"type":"string","minLength":1,"maxLength":256,"default":"jev-latest"},"questions":{"type":"object","minProperties":1,"maxProperties":64,"propertyNames":{"minLength":1,"maxLength":128},"additionalProperties":{"type":"object","properties":{"type":{"enum":["noul","choice","score"]},"instructions":{"type":["string","object","array","null"]},"criteria":{"type":["object","array","null"]}},"required":["type"],"additionalProperties":false}},"minimum_confidence":{"type":["number","null"],"minimum":0,"maximum":1}},"required":["state","questions"],"additionalProperties":false}"#;
const ANNOTATIONS: Annotations = Annotations {
    read_only: true,
    destructive: false,
    idempotent: false,
    open_world: true,
};

pub(crate) const TOOLS: &[Tool] = &[
    Tool {
        name: "yolo_decide",
        title: "Jev System One decision",
        description: "Judge supplied state with Jev Noul, Choice or Score through Bun's shared Rust owner. Optional minimum_confidence adds candidate selections with null abstention; raw answers/distributions remain. Does not execute or authorize actions. Uses server-configured TYPESAFE_API_KEY or an explicit protected TYPESAFE_API_KEY_FILE; no credential arguments. At most 64 questions, 32000 estimated input tokens; shared process budget of 20 calls, 64 judgments and 64000 estimated tokens per minute, one call at a time.",
        input_schema: SCHEMA,
        annotations: ANNOTATIONS,
        call: decide,
    },
    Tool {
        name: "jev_decide",
        title: "Jev System One decision (alias)",
        description: "Alias of yolo_decide with identical shared validation, routing, abstention and process budgets. Produces decision evidence only; does not execute or authorize actions.",
        input_schema: SCHEMA,
        annotations: ANNOTATIONS,
        call: decide,
    },
];

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{Value, json};
    use std::{cell::Cell, net::TcpListener, thread};
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    fn args() -> serde_json::Map<String, Value> {
        json!({"state":null,"questions":{"tool":{"type":"choice","criteria":{"read":null,"search":{"kind":"web"}}}},"minimum_confidence":0.8}).as_object().unwrap().clone()
    }

    fn fixture(status: &str, response: Value) -> (JevRouter, thread::JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        listener.set_nonblocking(true).unwrap();
        let status = status.to_owned();
        let task = thread::spawn(move || {
            tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap()
                .block_on(async move {
                    tokio::time::timeout(Duration::from_secs(5), async move {
                        let listener = tokio::net::TcpListener::from_std(listener).unwrap();
                        let (mut stream, _) = listener.accept().await.unwrap();
                        let mut request = Vec::new();
                        let mut complete = false;
                        for _ in 0..16 {
                            let mut bytes = [0u8; 1024];
                            let size = stream.read(&mut bytes).await.unwrap();
                            if size == 0 { break; }
                            request.extend_from_slice(&bytes[..size]);
                            if let Some(end) = request.windows(4).position(|value| value == b"\r\n\r\n") {
                                let headers = std::str::from_utf8(&request[..end]).unwrap();
                                let length = headers.lines().find_map(|line| {
                                    let (name, value) = line.split_once(':')?;
                                    name.eq_ignore_ascii_case("content-length").then(|| value.trim().parse::<usize>().unwrap())
                                }).unwrap();
                                if request.len() >= end + 4 + length { complete = true; break; }
                            }
                        }
                        assert!(complete);
                        let request = String::from_utf8_lossy(&request);
                        assert!(request.starts_with("POST /v1/systemone "));
                        assert!(request.to_ascii_lowercase().contains("authorization: bearer fixture-key"));
                        let body = response.to_string();
                        let reply = format!("HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len());
                        stream.write_all(reply.as_bytes()).await.unwrap();
                        stream.shutdown().await.unwrap();
                    }).await.unwrap();
                });
        });
        let router = JevRouter::from_settings(
            |name| match name {
                "TYPESAFE_API_KEY" => Some("fixture-key".into()),
                "TYPESAFE_BASE_URL" => Some(base.clone()),
                _ => None,
            },
            None,
        )
        .unwrap();
        (router, task)
    }

    #[test]
    fn aliases_share_one_callback_and_expose_bounded_arguments() {
        assert!(std::ptr::fn_addr_eq(TOOLS[0].call, TOOLS[1].call));
        assert_eq!(TOOLS[0].input_schema, TOOLS[1].input_schema);
        let schema: Value = serde_json::from_str(SCHEMA).unwrap();
        assert_eq!(schema["properties"]["questions"]["maxProperties"], 64);
        assert_eq!(schema["properties"]["minimum_confidence"]["maximum"], 1);
        assert!(
            TOOLS
                .iter()
                .all(|tool| tool.annotations.read_only && tool.annotations.open_world)
        );
    }

    #[test]
    fn invalid_guards_fail_before_credentials_or_provider_initialization() {
        let builds = Cell::new(0);
        for invalid in [
            {
                let mut value = args();
                value.insert("minimum_confidence".into(), json!(1.1));
                value
            },
            {
                let mut value = args();
                value.insert("minimum_confidence".into(), json!("0.8"));
                value
            },
            {
                let mut value = args();
                value.insert("model".into(), json!("x".repeat(257)));
                value
            },
            {
                let mut value = args();
                value.insert("state".into(), json!(true));
                value
            },
            {
                let mut value = args();
                value.insert("state".into(), json!("x".repeat(MAX_INPUT_TOKENS * 4)));
                value
            },
            {
                let mut value = args();
                value.insert("unexpected".into(), Value::Null);
                value
            },
        ] {
            assert!(matches!(
                decide_with(&JevState::default(), &Args(&invalid), || {
                    builds.set(builds.get() + 1);
                    Err(ToolError::Failed(AUTH_ERROR.into()))
                }),
                Err(ToolError::InvalidArgs(_))
            ));
        }
        assert_eq!(builds.get(), 0);
    }

    #[test]
    fn missing_auth_and_file_failures_are_generic_and_do_not_poison_the_cache() {
        let reads = Cell::new(0);
        let missing = configured_router(
            |_| None,
            |_| {
                reads.set(reads.get() + 1);
                unreachable!()
            },
        );
        assert!(matches!(missing, Err(ToolError::Failed(message)) if message == AUTH_ERROR));
        assert_eq!(reads.get(), 0);
        assert!(
            matches!(key_file("relative.fixture"), Err(ToolError::Failed(message)) if message == AUTH_ERROR)
        );
        let state = JevState::default();
        assert!(
            decide_with(&state, &Args(&args()), || Err(ToolError::Failed(
                AUTH_ERROR.into()
            )))
            .is_err()
        );
        assert!(state.router.lock().unwrap().is_none());
        assert_eq!(state.budget.lock().unwrap().calls, 0);
    }

    #[test]
    fn an_explicit_key_reference_is_read_once_and_environment_credentials_win() {
        let reads = Cell::new(0);
        let router = configured_router(
            |name| match name {
                "TYPESAFE_API_KEY_FILE" => Some("explicit-protected-reference".into()),
                _ => None,
            },
            |path| {
                assert_eq!(path, "explicit-protected-reference");
                reads.set(reads.get() + 1);
                Ok("fixture-key".into())
            },
        );
        assert!(router.is_ok());
        assert_eq!(reads.get(), 1);
        let router = configured_router(
            |name| match name {
                "TYPESAFE_API_KEY" => Some("fixture-key".into()),
                "TYPESAFE_API_KEY_FILE" => Some("must-not-read".into()),
                _ => None,
            },
            |_| unreachable!(),
        );
        assert!(router.is_ok());
    }

    #[test]
    fn local_provider_retains_distributions_and_abstains_below_threshold() {
        let (router, task) = fixture(
            "200 OK",
            json!({"model":"fixture","usage":null,"answers":{"tool":{"type":"choice","choice":"read","confidence":0.7,"probabilities":{"read":0.7,"search":0.3}}}}),
        );
        let state = JevState::default();
        let output = decide_with(&state, &Args(&args()), || Ok(router)).unwrap();
        let value: Value = serde_json::from_str(&output.text).unwrap();
        assert_eq!(value["selections"]["tool"], Value::Null);
        assert_eq!(value["answers"]["tool"]["choice"], "read");
        assert_eq!(
            value["answers"]["tool"]["probabilities"],
            json!({"read":0.7,"search":0.3})
        );
        assert_eq!(state.budget.lock().unwrap().judgments, 1);
        assert!(!state.budget.lock().unwrap().active);
        task.join().unwrap();
    }

    #[test]
    fn provider_authentication_errors_do_not_expose_body_credentials_or_url() {
        let (router, task) = fixture(
            "401 Unauthorized",
            json!({"detail":"fixture-key https://credential.example.invalid"}),
        );
        let output = decide_with(&JevState::default(), &Args(&args()), || Ok(router));
        assert!(matches!(output, Err(ToolError::Failed(message)) if message == AUTH_ERROR));
        task.join().unwrap();
    }

    #[test]
    fn process_rate_question_and_token_budgets_reject_before_judgment() {
        let mut budget = Budget::default();
        let now = budget.since;
        budget.reserve(1, 1, now).unwrap();
        assert!(budget.reserve(1, 1, now).is_err());
        budget.active = false;
        budget.calls = MAX_CALLS;
        assert!(budget.reserve(1, 1, now).is_err());
        budget.calls = 0;
        budget.judgments = MAX_JUDGMENTS;
        assert!(budget.reserve(1, 1, now).is_err());
        budget.judgments = 0;
        budget.tokens = MAX_WINDOW_TOKENS;
        assert!(budget.reserve(1, 1, now).is_err());
        budget.reserve(1, 1, now + WINDOW).unwrap();
        assert_eq!(budget.calls, 1);
    }
}
