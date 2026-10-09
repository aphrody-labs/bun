//! One native webview layer for every Bun/Aphrody consumer.
//!
//! - [`Backend`] is the whole surface a native engine implements: create a window + webview,
//!   navigate, evaluate, history, capture, resize, input, console/IPC events, close.
//! - [`cdp::Server`] exposes any [`Backend`] as the Chrome DevTools Protocol subset that
//!   Bun.WebView's ChromeBackend.cpp speaks, over the `--remote-debugging-pipe` transport
//!   ([`pipe`]). `bun-webview-host` (src/main.rs) is that server as an executable.
//! - Engines: [`backend::webkitgtk`] (GTK4, webkitgtk-6.0), `wry` (WebView2 / WKWebView /
//!   WebKitGTK-GTK3, aphrody-labs/wry fork), [`backend::mock`] (no display, for tests).

#[cfg(all(target_os = "linux", feature = "gtk4", feature = "gtk3"))]
compile_error!("features `gtk4` and `gtk3` are exclusive: one GTK major per build");

pub mod backend;
pub mod cdp;
pub mod input;
pub mod pipe;

use serde_json::Value;

/// Engine selected with `--backend=<name>` / `Bun.WebView({ backend })`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BackendKind {
    /// WebKitGTK. GTK4 + webkitgtk-6.0 by default, GTK3 + webkit2gtk-4.1 with the `gtk3` feature.
    WebKitGtk,
    /// Microsoft Edge WebView2 (Windows).
    WebView2,
    /// WKWebView (macOS).
    WkWebView,
    /// Chromium Embedded Framework.
    Cef,
    /// In-process fake engine: no display, deterministic. Tests only.
    Mock,
}

impl BackendKind {
    pub fn parse(name: &str) -> Option<Self> {
        Some(match name {
            "webkitgtk" | "gtk" | "gtk4" | "gtk3" => Self::WebKitGtk,
            "webview2" | "edge" => Self::WebView2,
            "wkwebview" | "webkit" => Self::WkWebView,
            "cef" => Self::Cef,
            "mock" => Self::Mock,
            _ => return None,
        })
    }

    pub fn name(self) -> &'static str {
        match self {
            Self::WebKitGtk => "webkitgtk",
            Self::WebView2 => "webview2",
            Self::WkWebView => "wkwebview",
            Self::Cef => "cef",
            Self::Mock => "mock",
        }
    }

    /// The system engine of the target OS.
    pub fn platform_default() -> Self {
        if cfg!(windows) {
            Self::WebView2
        } else if cfg!(target_os = "macos") {
            Self::WkWebView
        } else {
            Self::WebKitGtk
        }
    }
}

/// Process-wide options, from the host's argv (Chrome switch syntax, unknown switches ignored).
#[derive(Clone, Debug, Default)]
pub struct HostConfig {
    pub user_data_dir: Option<std::path::PathBuf>,
    pub headless: bool,
    pub disable_gpu: bool,
    pub no_sandbox: bool,
}

/// One webview (one CDP target).
#[derive(Clone, Debug)]
pub struct CreateOptions {
    pub url: String,
    pub width: u32,
    pub height: u32,
    pub headless: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ImageFormat {
    Png,
    Jpeg,
    Webp,
}

impl ImageFormat {
    pub fn parse(s: &str) -> Self {
        match s {
            "jpeg" | "jpg" => Self::Jpeg,
            "webp" => Self::Webp,
            _ => Self::Png,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MouseKind {
    Pressed,
    Released,
    Moved,
    Wheel,
}

#[derive(Clone, Debug)]
pub struct MouseEvent {
    pub kind: MouseKind,
    pub x: f64,
    pub y: f64,
    /// "left" | "right" | "middle" | "none".
    pub button: String,
    pub click_count: u32,
    /// CDP bits: 1 Alt, 2 Ctrl, 4 Meta, 8 Shift.
    pub modifiers: u32,
    pub delta_x: f64,
    pub delta_y: f64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum KeyKind {
    Down,
    RawDown,
    Up,
    Char,
}

#[derive(Clone, Debug)]
pub struct KeyEvent {
    pub kind: KeyKind,
    pub key: String,
    pub code: String,
    pub text: String,
    pub key_code: u32,
    pub modifiers: u32,
}

#[derive(Clone, Debug, PartialEq)]
pub struct HistoryEntry {
    pub id: u32,
    pub url: String,
    pub title: String,
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Bounds {
    pub left: i32,
    pub top: i32,
    pub width: u32,
    pub height: u32,
}

/// Result of a page-side evaluation (`Runtime.evaluate` with `returnByValue` + `awaitPromise`).
#[derive(Clone, Debug, PartialEq)]
pub enum EvalOutcome {
    Undefined,
    /// JSON-serializable return value.
    Value(Value),
    /// The script threw. `description` is `Name: message\nstack`; `value` is set for non-Error throws.
    Exception { description: String, value: Option<Value> },
}

/// Completion callback, always invoked on the backend's UI thread.
pub type Callback<T> = Box<dyn FnOnce(Result<T, String>)>;

/// Everything a native engine provides. All methods run on the engine's UI thread.
pub trait Backend {
    fn kind(&self) -> BackendKind;
    /// Product string for `Browser.getVersion`.
    fn version(&self) -> String {
        format!("bun-webview-host/{} {}", self.kind().name(), env!("CARGO_PKG_VERSION"))
    }
    fn create(&mut self, id: u32, opts: &CreateOptions, events: Events) -> Result<(), String>;
    fn close(&mut self, id: u32);
    fn navigate(&mut self, id: u32, url: &str) -> Result<(), String>;
    fn reload(&mut self, id: u32) -> Result<(), String>;
    /// `(current index, entries)`; entry ids are stable until the next navigation.
    fn history(&mut self, id: u32) -> Result<(usize, Vec<HistoryEntry>), String>;
    fn go_to_history_entry(&mut self, id: u32, entry_id: u32) -> Result<(), String>;
    fn evaluate(&mut self, id: u32, expression: &str, cb: Callback<EvalOutcome>);
    fn screenshot(&mut self, id: u32, format: ImageFormat, quality: u8, cb: Callback<Vec<u8>>);
    fn resize(&mut self, id: u32, width: u32, height: u32) -> Result<(), String>;
    fn bounds(&mut self, id: u32) -> Result<Bounds, String>;
    /// Default: page-side synthesis ([`input`]) through [`Backend::evaluate`].
    fn mouse(&mut self, id: u32, ev: &MouseEvent, cb: Callback<()>) {
        let script = input::mouse_script(ev);
        self.evaluate(id, &script, Box::new(move |r| cb(r.map(|_| ()))));
    }
    fn key(&mut self, id: u32, ev: &KeyEvent, cb: Callback<()>) {
        let script = input::key_script(ev);
        self.evaluate(id, &script, Box::new(move |r| cb(r.map(|_| ()))));
    }
    fn insert_text(&mut self, id: u32, text: &str, cb: Callback<()>) {
        let script = input::insert_text_script(text);
        self.evaluate(id, &script, Box::new(move |r| cb(r.map(|_| ()))));
    }
    /// Native CDP passthrough (WebView2, CEF) for methods the server does not translate.
    /// `Err(cb)` hands the callback back: not handled, the server answers "method not found".
    fn raw_cdp(&mut self, _id: u32, _method: &str, _params: &Value, cb: Callback<Value>) -> Result<(), Callback<Value>> {
        Err(cb)
    }
    /// Stop the UI loop; the host exits.
    fn quit(&mut self);
}

/// Event sink of one target, handed to [`Backend::create`]. `Send`: engines may emit from any thread.
#[derive(Clone)]
pub struct Events {
    out: cdp::Out,
    session: String,
    target: String,
}

impl Events {
    pub fn new(out: cdp::Out, session: String, target: String) -> Self {
        Self { out, session, target }
    }

    pub fn emit(&self, method: &str, params: Value) {
        self.out.event(Some(&self.session), method, params);
    }

    /// Commit of a main-frame navigation.
    pub fn frame_navigated(&self, url: &str) {
        self.emit(
            "Page.frameNavigated",
            serde_json::json!({ "frame": { "id": self.target, "loaderId": self.target, "url": url, "mimeType": "text/html" }, "type": "Navigation" }),
        );
    }

    pub fn load_event_fired(&self) {
        self.emit("Page.loadEventFired", serde_json::json!({ "timestamp": now_seconds() }));
    }

    /// `kind` is the CDP console type (log, info, warning, error, debug…); `args` are RemoteObjects.
    pub fn console(&self, kind: &str, args: Value) {
        self.emit(
            "Runtime.consoleAPICalled",
            serde_json::json!({ "type": kind, "args": args, "executionContextId": 1, "timestamp": now_seconds() * 1000.0 }),
        );
    }

    /// The user (or `window.close()`) closed the window: the session is gone.
    pub fn closed(&self) {
        self.out.event(
            None,
            "Target.detachedFromTarget",
            serde_json::json!({ "sessionId": self.session, "targetId": self.target }),
        );
        self.out.event(None, "Target.targetDestroyed", serde_json::json!({ "targetId": self.target }));
    }
}

fn now_seconds() -> f64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs_f64())
        .unwrap_or(0.0)
}

/// Encode an RGBA8 frame. PNG ignores `quality`; WebP is lossless.
pub fn encode_rgba(rgba: Vec<u8>, width: u32, height: u32, format: ImageFormat, quality: u8) -> Result<Vec<u8>, String> {
    use image::ImageEncoder;
    let mut out = Vec::new();
    let r = match format {
        ImageFormat::Png => image::codecs::png::PngEncoder::new(&mut out).write_image(&rgba, width, height, image::ExtendedColorType::Rgba8),
        ImageFormat::Webp => image::codecs::webp::WebPEncoder::new_lossless(&mut out).write_image(&rgba, width, height, image::ExtendedColorType::Rgba8),
        ImageFormat::Jpeg => {
            let rgb: Vec<u8> = rgba.chunks_exact(4).flat_map(|p| [p[0], p[1], p[2]]).collect();
            let q = if quality == 0 { 80 } else { quality.min(100) };
            image::codecs::jpeg::JpegEncoder::new_with_quality(&mut out, q).write_image(&rgb, width, height, image::ExtendedColorType::Rgb8)
        }
    };
    r.map_err(|e| e.to_string())?;
    Ok(out)
}
