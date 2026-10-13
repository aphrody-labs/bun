//! Optional Windows WebView2 host. The UI loop and native windows belong to the
//! existing Tauri winit owner; the CDP server remains shared with the GTK host.

use crate::cdp::{Out, Server};
use crate::pipe::{self, Inbound};
use crate::{Backend, BackendKind, Bounds, Callback, CreateOptions, EvalOutcome, Events, HistoryEntry, HostConfig, ImageFormat};
use serde_json::{Value, json};
use base64::Engine as _;
use webview2_com::CallDevToolsProtocolMethodCompletedHandler;
use windows_core::HSTRING;
use std::cell::{Cell, RefCell};
use std::collections::HashMap;
use std::io::Read;
use std::rc::Rc;
use std::sync::mpsc::{self, Receiver};
use winit::application::ApplicationHandler;
use winit::event::WindowEvent;
use winit::event_loop::{ActiveEventLoop, EventLoop};
use winit::window::{Window, WindowAttributes, WindowId};
use ::wry::{PageLoadEvent, Rect, WebContext, WebView, WebViewBuilder, WebViewBuilderExtWindows, WebViewExtWindows};

type Pending<T = EvalOutcome> = Rc<RefCell<HashMap<u64, (u32, Callback<T>)>>>;

struct View {
    webview: WebView,
    window: Box<dyn Window>,
    events: Events,
}

struct Native {
    views: Rc<RefCell<HashMap<u32, View>>>,
    pending_window: Rc<RefCell<Option<Result<Box<dyn Window>, String>>>>,
    pending: Pending,
    native_pending: Pending<Value>,
    next_evaluation: u64,
    context: WebContext,
    cfg: HostConfig,
    quitting: Rc<Cell<bool>>,
}

struct App {
    server: Server,
    messages: Receiver<Inbound>,
    views: Rc<RefCell<HashMap<u32, View>>>,
    pending_window: Rc<RefCell<Option<Result<Box<dyn Window>, String>>>>,
    pending: Pending,
    native_pending: Pending<Value>,
    quitting: Rc<Cell<bool>>,
}

pub fn run(cfg: HostConfig, input: Box<dyn Read + Send>, out: Out) -> Result<i32, String> {
    if cfg.no_sandbox {
        return Err("WebView2 does not support disabling its sandbox through this host".into());
    }
    let event_loop = EventLoop::new().map_err(|error| error.to_string())?;
    let proxy = event_loop.create_proxy();
    let (tx, messages) = mpsc::channel();
    let views = Rc::default();
    let pending_window = Rc::default();
    let pending = Rc::default();
    let native_pending = Rc::default();
    let quitting = Rc::new(Cell::new(false));
    let headless = cfg.headless;
    let backend = Native {
        views: Rc::clone(&views),
        pending_window: Rc::clone(&pending_window),
        pending: Rc::clone(&pending),
        native_pending: Rc::clone(&native_pending),
        next_evaluation: 0,
        context: WebContext::new(cfg.user_data_dir.clone()),
        cfg,
        quitting: Rc::clone(&quitting),
    };
    pipe::spawn_reader(input, move |message| {
        if tx.send(message).is_ok() {
            proxy.wake_up();
        }
    });
    event_loop.run_app(App {
        server: Server::new(Box::new(backend), out, headless),
        messages,
        views,
        pending_window,
        pending,
        native_pending,
        quitting,
    }).map_err(|error| error.to_string())?;
    Ok(0)
}

impl App {
    fn dispatch(&mut self, event_loop: &dyn ActiveEventLoop) {
        while let Ok(message) = self.messages.try_recv() {
            match message {
                Inbound::Message(text) => {
                    let create = serde_json::from_str::<Value>(&text).ok()
                        .is_some_and(|message| message["method"] == "Target.createTarget");
                    if create {
                        *self.pending_window.borrow_mut() = Some(event_loop.create_window(
                            WindowAttributes::default().with_title("Bun").with_visible(false),
                        ).map_err(|error| error.to_string()));
                    }
                    self.server.handle(&text);
                    self.pending_window.borrow_mut().take();
                }
                Inbound::Eof => self.server.shutdown(),
            }
            if self.quitting.get() {
                event_loop.exit();
                break;
            }
        }
    }
}

impl ApplicationHandler for App {
    fn can_create_surfaces(&mut self, event_loop: &dyn ActiveEventLoop) {
        self.dispatch(event_loop);
    }

    fn proxy_wake_up(&mut self, event_loop: &dyn ActiveEventLoop) {
        self.dispatch(event_loop);
    }

    fn window_event(&mut self, _event_loop: &dyn ActiveEventLoop, window_id: WindowId, event: WindowEvent) {
        let id = self.views.borrow().iter()
            .find_map(|(id, view)| (view.window.id() == window_id).then_some(*id));
        let Some(id) = id else { return };
        match event {
            WindowEvent::CloseRequested => {
                if let Some(view) = self.views.borrow_mut().remove(&id) {
                    view.events.closed();
                }
                cancel(&self.pending, id);
                cancel(&self.native_pending, id);
            }
            WindowEvent::SurfaceResized(size) => {
                if let Some(view) = self.views.borrow().get(&id) {
                    if let Err(error) = view.webview.set_bounds(physical_rect(size.width, size.height)) {
                        view.events.emit("Runtime.exceptionThrown", json!({
                            "exceptionDetails": { "text": error.to_string() }
                        }));
                    }
                }
            }
            _ => {}
        }
    }
}

fn rect(width: u32, height: u32) -> Rect {
    Rect {
        position: ::wry::dpi::LogicalPosition::new(0.0, 0.0).into(),
        size: ::wry::dpi::LogicalSize::new(f64::from(width), f64::from(height)).into(),
    }
}

fn physical_rect(width: u32, height: u32) -> Rect {
    Rect {
        position: ::wry::dpi::PhysicalPosition::new(0, 0).into(),
        size: ::wry::dpi::PhysicalSize::new(width, height).into(),
    }
}

fn cancel<T>(pending: &Pending<T>, id: u32) {
    let keys: Vec<_> = pending.borrow().iter()
        .filter_map(|(key, (target, _))| (*target == id).then_some(*key)).collect();
    let callbacks: Vec<_> = keys.into_iter()
        .filter_map(|key| pending.borrow_mut().remove(&key)).collect();
    for (_, callback) in callbacks {
        callback(Err("WebView target closed or navigated during evaluation".into()));
    }
}

impl Native {
    fn with<T>(&self, id: u32, call: impl FnOnce(&View) -> Result<T, String>) -> Result<T, String> {
        let views = self.views.borrow();
        call(views.get(&id).ok_or_else(|| format!("No target {id}"))?)
    }

    fn cdp(&mut self, id: u32, method: &str, params: &Value, callback: Callback<Value>) {
        self.next_evaluation += 1;
        let key = self.next_evaluation;
        self.native_pending.borrow_mut().insert(key, (id, callback));
        let pending = Rc::clone(&self.native_pending);
        let handler = CallDevToolsProtocolMethodCompletedHandler::create(Box::new(move |status, text| {
            let callback = pending.borrow_mut().remove(&key).map(|(_, callback)| callback);
            if let Some(callback) = callback {
                callback(status.map_err(|error| error.to_string())
                    .and_then(|()| serde_json::from_str(&text).map_err(|error| error.to_string())));
            }
            Ok(())
        }));
        let method = HSTRING::from(method);
        let params = HSTRING::from(params.to_string());
        let result = self.with(id, |view| {
            // The controller belongs to this UI thread; COM retains its completion
            // handler until delivery. Closing the target cancels the owned callback.
            unsafe { view.webview.webview().CallDevToolsProtocolMethod(&method, &params, &handler) }
                .map_err(|error| error.to_string())
        });
        if let Err(error) = result {
            let callback = self.native_pending.borrow_mut().remove(&key).map(|(_, callback)| callback);
            if let Some(callback) = callback { callback(Err(error)); }
        }
    }
}

impl Backend for Native {
    fn kind(&self) -> BackendKind { BackendKind::WebView2 }

    fn create(&mut self, id: u32, options: &CreateOptions, events: Events) -> Result<(), String> {
        let window = self.pending_window.borrow_mut().take()
            .ok_or("Native window creation requires the active UI loop")??;
        let pending = Rc::clone(&self.pending);
        let ipc_events = events.clone();
        let load_events = events.clone();
        let load_pending = Rc::clone(&self.pending);
        let mut builder = WebViewBuilder::new_with_web_context(&mut self.context)
            .with_incognito(self.cfg.user_data_dir.is_none())
            .with_url(&options.url)
            .with_bounds(rect(options.width, options.height))
            .with_initialization_script(
                "globalThis.webkit={messageHandlers:{__bunConsole:{postMessage:v=>window.ipc.postMessage(JSON.stringify({console:v}))}}};",
            )
            .with_initialization_script(include_str!("console.js"))
            .with_ipc_handler(move |request| {
                let Ok(message) = serde_json::from_str::<Value>(request.body()) else { return };
                if let Some(console) = message.get("console") {
                    ipc_events.console(console["type"].as_str().unwrap_or("log"),
                        console.get("args").cloned().unwrap_or_else(|| json!([])));
                }
                let Some(key) = message["evaluation"].as_u64() else { return };
                if !pending.borrow().get(&key).is_some_and(|(target, _)| *target == id) { return }
                let callback = pending.borrow_mut().remove(&key).map(|(_, callback)| callback);
                if let Some(callback) = callback {
                    let outcome = message["result"].as_str().map(crate::cdp::parse_wrapped)
                        .ok_or_else(|| "Malformed WebView2 evaluation result".into());
                    callback(outcome);
                }
            })
            .with_on_page_load_handler(move |event, url| match event {
                PageLoadEvent::Started => cancel(&load_pending, id),
                PageLoadEvent::Finished => {
                    load_events.frame_navigated(&url);
                    load_events.load_event_fired();
                }
            });
        if self.cfg.disable_gpu {
            builder = builder.with_additional_browser_args("--disable-gpu");
        }
        let webview = builder.build_as_child(&window).map_err(|error| error.to_string())?;
        window.request_surface_size(winit::dpi::LogicalSize::new(f64::from(options.width), f64::from(options.height)).into());
        window.set_visible(!options.headless);
        self.views.borrow_mut().insert(id, View { webview, window, events });
        Ok(())
    }

    fn close(&mut self, id: u32) {
        self.views.borrow_mut().remove(&id);
        cancel(&self.pending, id);
        cancel(&self.native_pending, id);
    }

    fn navigate(&mut self, id: u32, url: &str) -> Result<(), String> {
        cancel(&self.pending, id);
        self.with(id, |view| view.webview.load_url(url).map_err(|error| error.to_string()))
    }

    fn navigate_async(&mut self, id: u32, url: &str, callback: Callback<()>) {
        cancel(&self.pending, id);
        self.cdp(id, "Page.navigate", &json!({"url":url}), Box::new(move |result| {
            callback(result.and_then(|result| {
                match result.get("errorText").and_then(Value::as_str) {
                    Some(error) => Err(error.to_owned()),
                    None => Ok(()),
                }
            }));
        }));
    }

    fn reload(&mut self, id: u32) -> Result<(), String> {
        cancel(&self.pending, id);
        self.with(id, |view| view.webview.reload().map_err(|error| error.to_string()))
    }

    fn history(&mut self, _id: u32) -> Result<(usize, Vec<HistoryEntry>), String> {
        Err("WebView2 history is asynchronous; use history_async".into())
    }

    fn go_to_history_entry(&mut self, _id: u32, _entry: u32) -> Result<(), String> {
        Err("WebView2 history navigation is asynchronous; use go_to_history_entry_async".into())
    }

    fn history_async(&mut self, id: u32, callback: Callback<(usize, Vec<HistoryEntry>)>) {
        self.cdp(id, "Page.getNavigationHistory", &json!({}), Box::new(move |result| {
            callback(result.and_then(|result| {
                let current = result["currentIndex"].as_u64().ok_or("WebView2 history has no current index")? as usize;
                let entries = result["entries"].as_array().ok_or("WebView2 history entries missing")?
                    .iter().map(|entry| {
                        Ok(HistoryEntry {
                            id: u32::try_from(entry["id"].as_u64().ok_or("WebView2 history entry id missing")?)
                                .map_err(|_| "WebView2 history entry id out of range")?,
                            url: entry["url"].as_str().ok_or("WebView2 history entry URL missing")?.to_owned(),
                            title: entry["title"].as_str().ok_or("WebView2 history entry title missing")?.to_owned(),
                        })
                    }).collect::<Result<Vec<_>, String>>()?;
                Ok((current, entries))
            }));
        }));
    }

    fn go_to_history_entry_async(&mut self, id: u32, entry_id: u32, callback: Callback<()>) {
        cancel(&self.pending, id);
        self.cdp(id, "Page.navigateToHistoryEntry", &json!({"entryId":entry_id}),
            Box::new(move |result| callback(result.map(|_| ()))));
    }

    fn evaluate(&mut self, id: u32, expression: &str, callback: Callback<EvalOutcome>) {
        self.next_evaluation += 1;
        let key = self.next_evaluation;
        self.pending.borrow_mut().insert(key, (id, callback));
        let expression = serde_json::to_string(expression).expect("string serialization");
        let wrapped = crate::cdp::wrap_expression(&format!("(0,eval)({expression})"));
        let script = format!(r#"(() => {{
            (function(){{{wrapped}}})().then(result =>
                window.ipc.postMessage(JSON.stringify({{evaluation:{key},result}})));
        }})()"#);
        if let Err(error) = self.with(id, |view| view.webview.evaluate_script(&script).map_err(|error| error.to_string())) {
            let callback = self.pending.borrow_mut().remove(&key).map(|(_, callback)| callback);
            if let Some(callback) = callback { callback(Err(error)); }
        }
    }

    fn screenshot(&mut self, id: u32, format: ImageFormat, quality: u8, callback: Callback<Vec<u8>>) {
        let format = match format { ImageFormat::Png => "png", ImageFormat::Jpeg => "jpeg", ImageFormat::Webp => "webp" };
        let mut params = json!({"format":format});
        if format != "png" { params["quality"] = json!(if quality == 0 { 80 } else { quality }); }
        self.cdp(id, "Page.captureScreenshot", &params, Box::new(move |result| {
            callback(result.and_then(|result| {
                let data = result["data"].as_str().ok_or("WebView2 screenshot data missing")?;
                base64::engine::general_purpose::STANDARD.decode(data).map_err(|error| error.to_string())
            }));
        }));
    }

    fn raw_cdp(&mut self, id: u32, method: &str, params: &Value, callback: Callback<Value>) -> Result<(), Callback<Value>> {
        self.cdp(id, method, params, callback);
        Ok(())
    }

    fn resize(&mut self, id: u32, width: u32, height: u32) -> Result<(), String> {
        self.with(id, |view| {
            view.window.request_surface_size(winit::dpi::LogicalSize::new(f64::from(width), f64::from(height)).into());
            view.webview.set_bounds(rect(width, height)).map_err(|error| error.to_string())
        })
    }

    fn bounds(&mut self, id: u32) -> Result<Bounds, String> {
        self.with(id, |view| {
            let scale = view.window.scale_factor();
            let size = view.window.surface_size().to_logical::<f64>(scale);
            let position = view.window.surface_position().to_logical::<f64>(scale);
            Ok(Bounds {
                left: position.x.round() as i32,
                top: position.y.round() as i32,
                width: size.width.round() as u32,
                height: size.height.round() as u32,
            })
        })
    }

    fn quit(&mut self) {
        let ids: Vec<_> = self.views.borrow().keys().copied().collect();
        for id in ids { self.close(id); }
        self.quitting.set(true);
    }
}
