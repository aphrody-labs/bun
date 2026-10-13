use std::collections::VecDeque;
use std::sync::{
    Arc,
    atomic::{AtomicUsize, Ordering},
};
use std::time::Instant;

use serde_json::{Value, json};

pub(crate) struct Recorder {
    entries: VecDeque<(Value, usize)>,
    capacity: usize,
    dropped: u64,
    bytes: usize,
    active: Arc<AtomicUsize>,
}

pub(crate) struct Request {
    started: Instant,
    date: String,
    request: Value,
    active: Arc<AtomicUsize>,
}

impl Drop for Request {
    fn drop(&mut self) {
        self.active.fetch_sub(1, Ordering::Relaxed);
    }
}

impl Recorder {
    pub(crate) fn new(capacity: usize) -> Self {
        Self {
            entries: VecDeque::new(),
            capacity,
            dropped: 0,
            bytes: 0,
            active: Arc::new(AtomicUsize::new(0)),
        }
    }

    pub(crate) fn start(
        &mut self,
        method: &str,
        url: &[u8],
        headers: Vec<Value>,
    ) -> Option<Request> {
        if self.active.load(Ordering::Relaxed) >= self.capacity {
            self.dropped += 1;
            return None;
        }
        self.active.fetch_add(1, Ordering::Relaxed);
        Some(Request {
            started: Instant::now(),
            date: chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
            request: json!({ "method": method, "url": redact_url(url), "httpVersion": "",
                "cookies": [], "headers": headers, "queryString": [], "headersSize": -1,
                "bodySize": -1, "comment": "Query values and request bodies are omitted." }),
            active: self.active.clone(),
        })
    }

    pub(crate) fn finish(&mut self, request: Request, status: u16, headers: Vec<Value>) -> usize {
        let elapsed = request.started.elapsed().as_secs_f64() * 1000.0;
        let mime = headers
            .iter()
            .find(|header| {
                header["name"]
                    .as_str()
                    .is_some_and(|name| name.eq_ignore_ascii_case("content-type"))
            })
            .and_then(|header| header["value"].as_str())
            .unwrap_or("");
        let entry = json!({ "startedDateTime": &request.date, "time": elapsed,
            "request": &request.request, "response": { "status": status, "statusText": "",
                "httpVersion": "", "cookies": [], "headers": headers,
                "content": { "size": -1, "mimeType": mime, "comment": "Body capture disabled." },
                "redirectURL": "", "headersSize": -1, "bodySize": -1 },
            "cache": {}, "timings": { "send": 0, "wait": elapsed, "receive": 0 },
            "comment": "Measured through response headers. Redirect chains are represented by the final response; transport phases and body sizes are unavailable." });
        let size = entry.to_string().len();
        let allocated = json_heap_size(&entry);
        while self.entries.len() >= self.capacity || self.bytes + size > 8 * 1024 * 1024 {
            let Some((_, removed)) = self.entries.pop_front() else {
                break;
            };
            self.bytes -= removed;
            self.dropped += 1;
        }
        self.bytes += size;
        self.entries.push_back((entry, size));
        allocated
    }

    pub(crate) fn export(&self) -> String {
        json!({ "log": { "version": "1.2", "creator": { "name": "Bun", "version": env!("CARGO_PKG_VERSION") },
            "entries": self.entries.iter().map(|(entry, _)| entry).collect::<Vec<_>>(), "_droppedEntries": self.dropped } }).to_string()
    }

    pub(crate) fn clear(&mut self) {
        self.entries.clear();
        self.dropped = 0;
        self.bytes = 0;
    }

    pub(crate) fn estimated_size(&self) -> usize {
        self.entries.capacity() * std::mem::size_of::<(Value, usize)>()
            + self
                .entries
                .iter()
                .map(|(entry, _)| json_heap_size(entry))
                .sum::<usize>()
    }
}

fn json_heap_size(value: &Value) -> usize {
    match value {
        Value::String(string) => string.capacity(),
        Value::Array(values) => {
            values.capacity() * std::mem::size_of::<Value>()
                + values.iter().map(json_heap_size).sum::<usize>()
        }
        Value::Object(values) => values
            .iter()
            .map(|(key, value)| {
                key.capacity()
                    + std::mem::size_of::<(String, Value)>()
                    + 3 * std::mem::size_of::<usize>()
                    + json_heap_size(value)
            })
            .sum(),
        _ => 0,
    }
}

pub(crate) fn header(name: &[u8], value: &[u8]) -> Value {
    let name = String::from_utf8_lossy(&name[..name.len().min(256)]);
    let sensitive = !matches!(
        name.to_ascii_lowercase().as_str(),
        "accept"
            | "accept-encoding"
            | "accept-language"
            | "content-type"
            | "content-length"
            | "cache-control"
            | "date"
            | "server"
            | "user-agent"
            | "connection"
            | "transfer-encoding"
    );
    json!({ "name": name, "value": if sensitive { "[redacted]".into() } else { String::from_utf8_lossy(&value[..value.len().min(2048)]) } })
}

fn redact_url(bytes: &[u8]) -> String {
    let text = String::from_utf8_lossy(&bytes[..bytes.len().min(8192)]);
    let base = text.split(['?', '#']).next().unwrap_or("");
    match base.split_once("://") {
        Some((scheme, rest)) => {
            let (authority, path) = rest.split_once('/').unwrap_or((rest, ""));
            format!(
                "{scheme}://{}/{}",
                authority.rsplit('@').next().unwrap_or(""),
                path
            )
        }
        None => base.into(),
    }
}
