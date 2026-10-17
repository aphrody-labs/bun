use axum::body::Body;
use axum::http::{Request, StatusCode};
use bun_edge::{byte_range, image_source, public_path, App, Config};
use tower::ServiceExt;

fn cfg(json: serde_json::Value) -> Config {
    serde_json::from_value(json).unwrap()
}

async fn get(app: &std::sync::Arc<App>, host: &str, method: &str, uri: &str) -> axum::response::Response {
    app.router()
        .oneshot(Request::builder().method(method).uri(uri).header("host", host).body(Body::empty()).unwrap())
        .await
        .unwrap()
}

#[test]
fn public_path_rules() {
    assert_eq!(public_path("/assets/a%20b.png").as_deref(), Some("/assets/a b.png"));
    assert!(public_path("/.well-known/x.json").is_some());
    for bad in ["/a/.hidden", "/_objects/x", "/a/Private/x", "/a/", "/db.sqlite", "/a/x.ENV", "/a/b.bak", "/a%5Cb", "/%2e%2e/x", "/a/%00"] {
        assert!(public_path(bad).is_none(), "{bad}");
    }
}

#[test]
fn ranges() {
    assert_eq!(byte_range("bytes=0-9", 100), Some((0, 10)));
    assert_eq!(byte_range("bytes=90-", 100), Some((90, 10)));
    assert_eq!(byte_range("bytes=-5", 100), Some((95, 5)));
    assert_eq!(byte_range("bytes=0-999", 100), Some((0, 100)));
    for bad in ["bytes=100-", "bytes=-", "bytes=5-2", "items=0-1", "bytes=-0"] {
        assert_eq!(byte_range(bad, 100), None, "{bad}");
    }
    assert_eq!(byte_range("bytes=0-1", 0), None);
}

#[test]
fn image_sources() {
    let site = "https://dragonballfr.com/";
    assert!(image_source("/a/b.png", site).is_some());
    assert!(image_source("https://cdn.example.org/a.png", site).is_some());
    assert!(image_source("http://comic.dragonballcn.com/a.png", site).is_some());
    for bad in ["http://example.org/a.png", "https://localhost/a", "https://127.0.0.1/a", "https://u:p@e.org/a", "https://e.org:8080/a", "ftp://e.org/a", "javascript:1"] {
        assert!(image_source(bad, site).is_none(), "{bad}");
    }
}

#[tokio::test]
async fn fixed_routes_and_methods() {
    let app = App::load(cfg(serde_json::json!({"hostname":"127.0.0.1","port":0,"dynamicUpstream":"http://127.0.0.1:1"}))).unwrap();
    assert_eq!(get(&app, "cdn.example", "GET", "/health").await.status(), StatusCode::OK);
    let r = get(&app, "cdn.example", "GET", "/").await;
    assert_eq!(r.status(), StatusCode::FOUND);
    assert_eq!(r.headers()["location"], "https://dragonballfr.com/");
    assert_eq!(get(&app, "cdn.example", "POST", "/health").await.status(), StatusCode::METHOD_NOT_ALLOWED);
    assert_eq!(get(&app, "cdn.example", "GET", "/api/health").await.status(), StatusCode::SERVICE_UNAVAILABLE);
    assert_eq!(get(&app, "cdn.example", "GET", "/_next/image?x=1").await.status(), StatusCode::BAD_REQUEST);
    let r = get(&app, "cdn.example", "GET", "/_next/image?url=%2Fa.png&w=64&q=75").await;
    assert_eq!(r.status(), StatusCode::FOUND, "image falls back to its source");
    assert_eq!(get(&app, "cdn.example", "GET", "/assets/x.png").await.status(), StatusCode::NOT_FOUND);
    let r = get(&app, "cdn.example", "GET", "/.well-known/shenron-cdn-origin.json").await;
    assert_eq!(r.status(), StatusCode::OK);
}

#[tokio::test]
async fn static_root_headers() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(dir.path().join("_next/static")).unwrap();
    std::fs::write(dir.path().join("_next/static/a.js"), "x").unwrap();
    std::fs::write(dir.path().join("index.html"), "<p>").unwrap();
    let app = App::load(cfg(serde_json::json!({"hostname":"127.0.0.1","port":0,
        "roots":[{"host":"source.example","root":dir.path(),"cacheControl":"public, max-age=60"}]}))).unwrap();
    let r = get(&app, "source.example:443", "GET", "/_next/static/a.js").await;
    assert_eq!(r.status(), StatusCode::OK);
    assert_eq!(r.headers()["cache-control"], "public, max-age=31536000, immutable");
    assert_eq!(r.headers()["access-control-allow-origin"], "*");
    let r = get(&app, "source.example", "GET", "/").await;
    assert_eq!(r.headers()["cache-control"], "public, max-age=60");
    assert_eq!(get(&app, "source.example", "GET", "/nope").await.status(), StatusCode::NOT_FOUND);
    assert_eq!(get(&app, "source.example", "PUT", "/").await.status(), StatusCode::METHOD_NOT_ALLOWED);
}
