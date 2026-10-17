//! Single Axum origin behind bun:nginx. nginx terminates TLS and serves hot static files; this process holds the
//! rules nginx cannot express: the sha256-pinned manifest origin over a scoped S3 (R2) credential, the dynamic
//! proxy with its fallbacks, and host-scoped static roots.
pub mod sigv4;

use axum::body::Body;
use axum::extract::{Request, State};
use axum::http::{header, HeaderMap, HeaderName, HeaderValue, Method, StatusCode};
use axum::response::Response;
use axum::Router;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use tower::ServiceExt;
use tower_http::services::ServeDir;

pub const SERVICE_VERSION: &str = "shenron-cdn-origin/v1";
const MEDIA_BUFFER_LIMIT: u64 = 2 * 1024 * 1024;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RootConfig {
    pub host: String,
    pub root: PathBuf,
    pub cache_control: Option<String>,
}

/// Superset of the legacy `origin-cdn.json`: unknown legacy keys (`sdkModule`) are ignored.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    pub hostname: String,
    pub port: u16,
    /// Object-store manifest origin (cdn.*). Absent for a static-only edge.
    pub manifest: Option<PathBuf>,
    pub profile: Option<PathBuf>,
    pub inventory_path: Option<PathBuf>,
    pub inventory_sha256: Option<String>,
    pub manifest_prefix: Option<String>,
    /// Application upstream for `/api/health` and `/_next/image`.
    #[serde(default = "default_upstream")]
    pub dynamic_upstream: String,
    #[serde(default = "default_dynamic_host")]
    pub dynamic_host: String,
    #[serde(default = "default_public_site")]
    pub public_site: String,
    #[serde(default)]
    pub roots: Vec<RootConfig>,
}

fn default_upstream() -> String {
    "http://127.0.0.1:5011".into()
}
fn default_dynamic_host() -> String {
    "dragonballfr.com".into()
}
fn default_public_site() -> String {
    "https://dragonballfr.com/".into()
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Identity {
    account_id: String,
    bucket: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Profile {
    endpoint: String,
    bucket: String,
    permission: String,
    prefixes: Vec<String>,
    access_key_id: String,
    secret_access_key: String,
    session_token: String,
    expires_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    sha256: Option<String>,
    size: Option<u64>,
    content_type: Option<String>,
    cache_control: Option<String>,
}

struct Valid<'a> {
    sha: &'a str,
    size: u64,
    content_type: &'a str,
    cache_control: &'a str,
}

fn is_hex64(s: &str) -> bool {
    s.len() == 64 && s.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

fn valid_entry(e: &Entry) -> Option<Valid<'_>> {
    let (sha, size, ct, cc) = (e.sha256.as_deref()?, e.size?, e.content_type.as_deref()?, e.cache_control.as_deref()?);
    let mime = ct.split_once(';').map_or(ct, |(m, _)| m);
    let token = |s: &str| !s.is_empty() && s.bytes().all(|b| b.is_ascii_alphanumeric() || b"!#$&^_.+-".contains(&b));
    let ok_type = mime.split_once('/').is_some_and(|(a, b)| token(a) && token(b)) && !ct.contains(['\r', '\n']);
    (is_hex64(sha) && ok_type && !cc.is_empty() && !cc.contains(['\r', '\n']))
        .then_some(Valid { sha, size, content_type: ct, cache_control: cc })
}

/// Percent-decoded request path if it may be served publicly; mirrors the former worker's allow rules.
pub fn public_path(raw_path: &str) -> Option<String> {
    let path = percent_encoding::percent_decode_str(raw_path).decode_utf8().ok()?.into_owned();
    if !path.starts_with('/') {
        return None;
    }
    for (i, part) in path.split('/').skip(1).enumerate() {
        let lower = part.to_ascii_lowercase();
        if part.is_empty()
            || (part.starts_with('.') && !(i == 0 && part == ".well-known"))
            || lower == "_migration"
            || lower == "_objects"
            || matches!(lower.as_str(), "private" | "manifests" | "cookies" | "node_modules")
            || part.contains('\\')
            || part.chars().any(|c| (c as u32) < 32 || c as u32 == 127)
        {
            return None;
        }
    }
    const DENIED: [&str; 13] =
        [".sql", ".sqlite", ".db", ".env", ".jsonl", ".pem", ".key", ".toml", ".yaml", ".yml", ".ini", ".log", ".bak"];
    let lower = path.to_ascii_lowercase();
    if DENIED.iter().any(|e| lower.ends_with(e)) {
        return None;
    }
    Some(path)
}

/// `(offset, length)` for a single `bytes=` range, `None` when unsatisfiable or malformed.
pub fn byte_range(header: &str, size: u64) -> Option<(u64, u64)> {
    let spec = header.strip_prefix("bytes=")?;
    let (a, b) = spec.split_once('-')?;
    if (a.is_empty() && b.is_empty()) || size == 0 {
        return None;
    }
    if a.is_empty() {
        let suffix: u64 = b.parse().ok().filter(|n| *n > 0)?;
        let len = suffix.min(size);
        return Some((size - len, len));
    }
    let offset: u64 = a.parse().ok()?;
    let end = if b.is_empty() { size - 1 } else { b.parse::<u64>().ok()?.min(size - 1) };
    if offset >= size || end < offset {
        return None;
    }
    Some((offset, end - offset + 1))
}

/// Validated source URL for `/_next/image?url=`.
pub fn image_source(value: &str, public_site: &str) -> Option<url::Url> {
    if value.len() > 2048 || !(value.starts_with('/') || value.starts_with("http://") || value.starts_with("https://")) {
        return None;
    }
    let src = url::Url::parse(public_site).ok()?.join(value).ok()?;
    let host = src.host_str()?;
    if !src.username().is_empty()
        || src.password().is_some()
        || src.port().is_some()
        || src.fragment().is_some()
        || host == "localhost"
        || !host.contains('.')
        || host.bytes().all(|b| b.is_ascii_digit() || b == b'.')
        || host.contains(':')
    {
        return None;
    }
    let scheme_ok = src.scheme() == "https" || (src.scheme() == "http" && host == "comic.dragonballcn.com");
    (scheme_ok && public_path(src.path()).is_some()).then_some(src)
}

pub struct App {
    cfg: Config,
    entries: HashMap<String, Entry>,
    identity: Option<Identity>,
    http: reqwest::Client,
    code_sha256: String,
    roots: HashMap<String, (ServeDir, String)>,
}

fn sha_hex(b: &[u8]) -> String {
    hex::encode(Sha256::digest(b))
}

#[cfg(unix)]
fn root_private(p: &std::path::Path) -> std::io::Result<bool> {
    use std::os::unix::fs::MetadataExt;
    let m = std::fs::metadata(p)?;
    Ok(m.mode() & 0o077 == 0 && m.uid() == 0)
}
#[cfg(not(unix))]
fn root_private(_: &std::path::Path) -> std::io::Result<bool> {
    Ok(true)
}

struct Stored {
    status: StatusCode,
    size: u64,
    sha: String,
    resp: reqwest::Response,
}

fn stored(resp: reqwest::Response) -> Option<Stored> {
    let status = resp.status();
    let h = resp.headers();
    let size_text = if status == StatusCode::PARTIAL_CONTENT {
        h.get("content-range")?.to_str().ok()?.split('/').nth(1)?.to_string()
    } else {
        h.get("content-length")?.to_str().ok()?.to_string()
    };
    if !(status == StatusCode::OK || status == StatusCode::PARTIAL_CONTENT) {
        return None;
    }
    let size = size_text.parse::<u64>().ok()?;
    let sha = h.get("x-amz-meta-sha256").and_then(|v| v.to_str().ok()).unwrap_or("").to_string();
    Some(Stored { status, size, sha, resp })
}

fn plain(status: StatusCode, headers: &[(&str, &str)], body: Body) -> Response {
    let mut r = Response::new(body);
    *r.status_mut() = status;
    for (k, v) in headers {
        r.headers_mut().insert(HeaderName::from_bytes(k.as_bytes()).unwrap(), HeaderValue::from_str(v).unwrap_or(HeaderValue::from_static("")));
    }
    r
}

fn failure(status: StatusCode) -> Response {
    plain(status, &[("cache-control", "no-store")], Body::empty())
}

impl App {
    pub fn load(cfg: Config) -> Result<Arc<App>, String> {
        let mut entries = HashMap::new();
        let mut identity = None;
        if let (Some(manifest), Some(inv), Some(pin), Some(_)) =
            (&cfg.manifest, &cfg.inventory_path, &cfg.inventory_sha256, &cfg.profile)
        {
            let bytes = std::fs::read(inv).map_err(|e| format!("inventory: {e}"))?;
            if !is_hex64(pin) || sha_hex(&bytes) != *pin {
                return Err("Origin inventory differs".into());
            }
            let v: serde_json::Value = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
            let obj = v.get("entries").and_then(|e| e.as_object()).ok_or("inventory lacks entries")?;
            for (k, e) in obj {
                if let Ok(e) = serde_json::from_value::<Entry>(e.clone()) {
                    entries.insert(k.clone(), e);
                }
            }
            identity = Some(
                serde_json::from_slice::<Identity>(&std::fs::read(manifest).map_err(|e| e.to_string())?)
                    .map_err(|e| e.to_string())?,
            );
        }
        let mut roots = HashMap::new();
        for r in &cfg.roots {
            let cache = r.cache_control.clone().unwrap_or_else(|| "public, max-age=86400, stale-while-revalidate=604800".into());
            roots.insert(r.host.to_ascii_lowercase(), (ServeDir::new(&r.root).append_index_html_on_directories(true), cache));
        }
        let exe = std::env::current_exe().ok().and_then(|p| std::fs::read(p).ok()).unwrap_or_default();
        let http = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_secs(5))
            .build()
            .map_err(|e| e.to_string())?;
        Ok(Arc::new(App { cfg, entries, identity, http, code_sha256: sha_hex(&exe), roots }))
    }

    pub fn router(self: &Arc<Self>) -> Router {
        Router::new().fallback(handle).with_state(self.clone())
    }

    fn attestation(&self) -> String {
        serde_json::json!({
            "backend": "native-manifest-origin",
            "serviceVersion": SERVICE_VERSION,
            "codeSha256": self.code_sha256,
            "manifestPrefix": self.cfg.manifest_prefix,
            "inventorySha256": self.cfg.inventory_sha256,
        })
        .to_string()
    }

    fn profile(&self) -> Result<Profile, String> {
        let path = self.cfg.profile.as_ref().ok_or("no profile")?;
        if !root_private(path).map_err(|e| e.to_string())? {
            return Err("Origin profile permissions differ".into());
        }
        let p: Profile = serde_json::from_slice(&std::fs::read(path).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
        let id = self.identity.as_ref().ok_or("no identity")?;
        let bad = |s: &str| s.is_empty() || s.chars().any(char::is_whitespace);
        if p.endpoint != format!("https://{}.r2.cloudflarestorage.com", id.account_id)
            || p.bucket != id.bucket
            || p.permission != "object-read-write"
            || p.prefixes != ["_objects/", "_migration/"]
            || bad(&p.access_key_id)
            || bad(&p.secret_access_key)
            || bad(&p.session_token)
        {
            return Err("S3 profile scope differs".into());
        }
        let exp = time::OffsetDateTime::parse(&p.expires_at, &time::format_description::well_known::Rfc3339)
            .map_err(|e| e.to_string())?;
        if exp.unix_timestamp() < time::OffsetDateTime::now_utc().unix_timestamp() + 30 {
            return Err("Origin scoped credential expired".into());
        }
        Ok(p)
    }

    async fn signed(&self, key: &str, method: &str, range: Option<(u64, u64)>) -> Result<Stored, String> {
        if !key.strip_prefix("_objects/").is_some_and(is_hex64) {
            return Err("Origin object key differs".into());
        }
        let p = self.profile()?;
        let host = url::Url::parse(&p.endpoint).map_err(|e| e.to_string())?.host_str().ok_or("host")?.to_string();
        let path = format!("/{}/{}", p.bucket, key);
        let fmt = time::format_description::parse("[year][month][day]T[hour][minute][second]Z").map_err(|e| e.to_string())?;
        let amz = time::OffsetDateTime::now_utc().format(&fmt).map_err(|e| e.to_string())?;
        let range_h = range.map(|(o, l)| format!("bytes={}-{}", o, o + l - 1));
        let creds = sigv4::Credentials {
            access_key_id: &p.access_key_id,
            secret_access_key: &p.secret_access_key,
            session_token: &p.session_token,
        };
        let headers = sigv4::sign(method, &host, &path, range_h.as_deref(), &creds, "auto", &amz);
        let m = Method::from_bytes(method.as_bytes()).map_err(|e| e.to_string())?;
        let mut rb = self
            .http
            .request(m, format!("{}{}", p.endpoint, path))
            .timeout(Duration::from_secs(30))
            .header("accept-encoding", "identity");
        for (k, v) in headers {
            rb = rb.header(k, v);
        }
        let resp = rb.send().await.map_err(|e| e.to_string())?;
        stored(resp).ok_or_else(|| "object unavailable".to_string())
    }

    fn static_response_headers(path: &str, cache: &str, h: &mut HeaderMap) {
        let cc = if path.starts_with("/_next/static/") {
            "public, max-age=31536000, immutable"
        } else {
            cache
        };
        h.insert(header::CACHE_CONTROL, HeaderValue::from_str(cc).unwrap());
        h.insert(header::X_CONTENT_TYPE_OPTIONS, HeaderValue::from_static("nosniff"));
        h.insert(header::ACCESS_CONTROL_ALLOW_ORIGIN, HeaderValue::from_static("*"));
    }

    async fn dynamic(&self, req: &Request) -> Option<Response> {
        let url = req.uri();
        let path = url.path();
        let head = req.method() == Method::HEAD;
        let base: [(&str, &str); 2] = [("cache-control", "no-store"), ("access-control-allow-origin", "*")];
        let text = |body: &str, ty: &str, status: StatusCode| {
            let mut r = plain(status, &base, if head { Body::empty() } else { Body::from(body.to_string()) });
            r.headers_mut().insert(header::CONTENT_TYPE, HeaderValue::from_str(ty).unwrap());
            r
        };
        match path {
            "/" => {
                let mut r = plain(StatusCode::FOUND, &base, Body::empty());
                r.headers_mut().insert(header::LOCATION, HeaderValue::from_str(&self.cfg.public_site).ok()?);
                return Some(r);
            }
            "/health" => return Some(text("cdn ok\n", "text/plain; charset=utf-8", StatusCode::OK)),
            "/robots.txt" => return Some(text("User-agent: *\nAllow: /\n", "text/plain; charset=utf-8", StatusCode::OK)),
            "/api/health" | "/_next/image" => {}
            _ => return None,
        }
        let image = path == "/_next/image";
        let mut source = None;
        let mut query = String::new();
        if image {
            let pairs: Vec<(String, String)> = url::form_urlencoded::parse(url.query().unwrap_or("").as_bytes()).into_owned().collect();
            if pairs.iter().any(|(k, _)| !["url", "w", "q"].contains(&k.as_str()))
                || ["url", "w", "q"].iter().any(|k| pairs.iter().filter(|(p, _)| p == k).count() != 1)
            {
                return Some(failure(StatusCode::BAD_REQUEST));
            }
            let get = |k: &str| pairs.iter().find(|(p, _)| p == k).map(|(_, v)| v.as_str()).unwrap_or("");
            let w: Option<u32> = get("w").parse().ok().filter(|n| (1..=8192).contains(n));
            let q: Option<u32> = get("q").parse().ok().filter(|n| (1..=100).contains(n));
            source = image_source(get("url"), &self.cfg.public_site);
            if source.is_none() || w.is_none() || q.is_none() {
                return Some(failure(StatusCode::BAD_REQUEST));
            }
            query = format!("?{}", url::form_urlencoded::Serializer::new(String::new()).extend_pairs(
                [("url", get("url")), ("w", get("w")), ("q", get("q"))]).finish());
        }
        let unavailable = |source: &Option<url::Url>| -> Response {
            if let Some(s) = source {
                let mut r = plain(StatusCode::FOUND, &base, Body::empty());
                r.headers_mut().insert(header::LOCATION, HeaderValue::from_str(s.as_str()).unwrap());
                return r;
            }
            text("{\"status\":\"down\",\"cdn\":\"ok\"}\n", "application/json", StatusCode::SERVICE_UNAVAILABLE)
        };
        let accept = if image {
            req.headers().get(header::ACCEPT).and_then(|v| v.to_str().ok()).unwrap_or("image/*").to_string()
        } else {
            "application/json".to_string()
        };
        let m = if head { Method::HEAD } else { Method::GET };
        let sent = self
            .http
            .request(m, format!("{}{}{}", self.cfg.dynamic_upstream, path, query))
            .header(header::HOST, &self.cfg.dynamic_host)
            .header(header::ACCEPT, accept)
            .timeout(Duration::from_secs(if image { 30 } else { 5 }))
            .send()
            .await;
        let Ok(resp) = sent else { return Some(unavailable(&source)) };
        let status = resp.status();
        if status.as_u16() >= 500 {
            return Some(unavailable(&source));
        }
        if status.is_redirection() {
            let loc = resp.headers().get(header::LOCATION).and_then(|v| v.to_str().ok()).and_then(|l| {
                url::Url::parse(&self.cfg.public_site).ok()?.join(l).ok()
            });
            return Some(match (loc, &source) {
                (Some(l), Some(s)) if l == *s => {
                    let mut r = plain(status, &base, Body::empty());
                    r.headers_mut().insert(header::LOCATION, HeaderValue::from_str(l.as_str()).unwrap());
                    r
                }
                _ => failure(StatusCode::SERVICE_UNAVAILABLE),
            });
        }
        let mut out = plain(status, &base, Body::empty());
        for k in [header::CONTENT_TYPE, header::CONTENT_LENGTH, header::CACHE_CONTROL, header::ETAG, header::LAST_MODIFIED, header::VARY] {
            if let Some(v) = resp.headers().get(&k) {
                out.headers_mut().insert(k, v.clone());
            }
        }
        if !image {
            out.headers_mut().insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
        }
        if !head {
            *out.body_mut() = Body::from_stream(resp.bytes_stream());
        }
        Some(out)
    }

    async fn object(&self, req: &Request) -> Response {
        let head = req.method() == Method::HEAD;
        let Some(path) = public_path(req.uri().path()) else { return failure(StatusCode::NOT_FOUND) };
        let Some(raw) = self.entries.get(&path) else {
            return failure(StatusCode::NOT_FOUND);
        };
        let Some(entry) = valid_entry(raw) else { return failure(StatusCode::SERVICE_UNAVAILABLE) };
        let key = format!("_objects/{}", entry.sha);
        let verified = |s: &Stored| s.size == entry.size && s.sha == entry.sha;
        match self.signed(&key, "HEAD", None).await {
            Ok(s) if verified(&s) => {}
            _ => return failure(StatusCode::SERVICE_UNAVAILABLE),
        }
        let etag = format!("\"{}\"", entry.sha);
        let size_s = entry.size.to_string();
        let cache = if path.ends_with("/index.json") { "no-store" } else { entry.cache_control };
        let mut h = HeaderMap::new();
        let mut put = |k: &'static str, v: &str| {
            h.insert(HeaderName::from_bytes(k.as_bytes()).unwrap(), HeaderValue::from_str(v).unwrap_or(HeaderValue::from_static("")));
        };
        put("content-type", entry.content_type);
        put("cache-control", cache);
        put("content-length", &size_s);
        put("etag", &etag);
        put("x-content-sha256", entry.sha);
        put("x-content-size", &size_s);
        put("accept-ranges", "bytes");
        put("access-control-allow-origin", "*");
        put("x-content-type-options", "nosniff");
        put("access-control-expose-headers", "Content-Length, Content-Range, ETag, X-Content-SHA256, X-Content-Size");
        let rh = req.headers();
        let inm = rh.get(header::IF_NONE_MATCH).and_then(|v| v.to_str().ok());
        if let Some(inm) = inm {
            if inm.split(',').map(|e| e.trim().trim_start_matches("W/")).any(|e| e == "*" || e == etag) {
                h.remove(header::CONTENT_LENGTH);
                return build(StatusCode::NOT_MODIFIED, h, Body::empty());
            }
        }
        if head {
            return build(StatusCode::OK, h, Body::empty());
        }
        let range_h = rh.get(header::RANGE).and_then(|v| v.to_str().ok());
        let if_range = rh.get(header::IF_RANGE).and_then(|v| v.to_str().ok());
        let use_range = range_h.filter(|_| if_range.is_none_or(|i| i == etag));
        let range = use_range.and_then(|r| byte_range(r, entry.size));
        if use_range.is_some() && range.is_none() {
            h.insert(header::CONTENT_RANGE, HeaderValue::from_str(&format!("bytes */{}", entry.size)).unwrap());
            h.remove(header::CONTENT_LENGTH);
            return build(StatusCode::RANGE_NOT_SATISFIABLE, h, Body::empty());
        }
        let Ok(obj) = self.signed(&key, "GET", range).await else { return failure(StatusCode::SERVICE_UNAVAILABLE) };
        if !verified(&obj) {
            return failure(StatusCode::SERVICE_UNAVAILABLE);
        }
        let mut status = StatusCode::OK;
        if let Some((o, l)) = range {
            status = StatusCode::PARTIAL_CONTENT;
            h.insert(header::CONTENT_LENGTH, HeaderValue::from(l));
            h.insert(header::CONTENT_RANGE, HeaderValue::from_str(&format!("bytes {}-{}/{}", o, o + l - 1, entry.size)).unwrap());
            let media = entry.content_type.starts_with("video/") || entry.content_type.starts_with("audio/");
            if media && (1..=MEDIA_BUFFER_LIMIT).contains(&l) {
                return match obj.resp.bytes().await {
                    Ok(b) if b.len() as u64 == l => build(status, h, Body::from(b)),
                    _ => failure(StatusCode::BAD_GATEWAY),
                };
            }
        }
        build(status, h, Body::from_stream(obj.resp.bytes_stream()))
    }
}

fn build(status: StatusCode, headers: HeaderMap, body: Body) -> Response {
    let mut r = Response::new(body);
    *r.status_mut() = status;
    *r.headers_mut() = headers;
    r
}

async fn handle(State(app): State<Arc<App>>, req: Request) -> Response {
    let host = req
        .headers()
        .get(header::HOST)
        .and_then(|v| v.to_str().ok())
        .map(|h| h.split(':').next().unwrap_or("").to_ascii_lowercase())
        .unwrap_or_default();
    if let Some((dir, cache)) = app.roots.get(&host) {
        if req.method() != Method::GET && req.method() != Method::HEAD {
            return plain(StatusCode::METHOD_NOT_ALLOWED, &[("allow", "GET, HEAD"), ("cache-control", "no-store")], Body::empty());
        }
        let path = req.uri().path().to_string();
        let resp = match dir.clone().oneshot(req).await {
            Ok(r) => r.map(Body::new),
            Err(never) => match never {},
        };
        let (mut parts, body) = resp.into_parts();
        if parts.status.is_success() {
            App::static_response_headers(&path, cache, &mut parts.headers);
        }
        return Response::from_parts(parts, body);
    }
    if req.uri().path() == "/.well-known/shenron-cdn-origin.json" && matches!(*req.method(), Method::GET | Method::HEAD) {
        let body = if req.method() == Method::HEAD { Body::empty() } else { Body::from(app.attestation()) };
        return plain(
            StatusCode::OK,
            &[("content-type", "application/json"), ("cache-control", "no-store"), ("access-control-allow-origin", "*")],
            body,
        );
    }
    if req.method() != Method::GET && req.method() != Method::HEAD {
        return plain(StatusCode::METHOD_NOT_ALLOWED, &[("allow", "GET, HEAD"), ("cache-control", "no-store")], Body::empty());
    }
    if let Some(r) = app.dynamic(&req).await {
        return r;
    }
    app.object(&req).await
}

pub fn config_from_file(path: &std::path::Path) -> Result<Config, String> {
    let cfg: Config = serde_json::from_slice(&std::fs::read(path).map_err(|e| format!("{}: {e}", path.display()))?)
        .map_err(|e| e.to_string())?;
    // A file that points at credentials must itself be root private.
    if cfg.profile.is_some() && !root_private(path).map_err(|e| e.to_string())? {
        return Err("Origin configuration must be root private".into());
    }
    Ok(cfg)
}
