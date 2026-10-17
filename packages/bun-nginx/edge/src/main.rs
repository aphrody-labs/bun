use std::path::PathBuf;

#[tokio::main]
async fn main() {
    let path = std::env::args().nth(1).unwrap_or_else(|| "/etc/aphrody/cloudflare/origin-cdn.json".into());
    let cfg = bun_edge::config_from_file(&PathBuf::from(&path)).unwrap_or_else(|e| fatal(&e));
    let addr = format!("{}:{}", cfg.hostname, cfg.port);
    let app = bun_edge::App::load(cfg).unwrap_or_else(|e| fatal(&e));
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap_or_else(|e| fatal(&format!("{addr}: {e}")));
    axum::serve(listener, app.router())
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
        })
        .await
        .unwrap_or_else(|e| fatal(&e.to_string()));
}

fn fatal(message: &str) -> ! {
    eprintln!("bun-edge: {message}");
    std::process::exit(1)
}
