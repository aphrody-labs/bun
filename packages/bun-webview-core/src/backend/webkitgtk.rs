//! WebKitGTK on GTK4 (webkitgtk-6.0, crate webkit6). No GTK3 anywhere in this build.
//!
//! One `gtk::Window` + `webkit6::WebView` per target, one `NetworkSession` per process
//! (persistent in `--user-data-dir`, ephemeral otherwise). The pipe reader thread hands each
//! message to the GLib main context with `MainContext::invoke`; the server lives in a
//! thread-local on the GTK thread. A display is required (X11, Wayland, Xvfb, WSLg, weston
//! headless); `headless` only drops decorations.

use crate::cdp::{self, Out, Server};
use crate::pipe::{self, Inbound};
use crate::{Backend, BackendKind, Bounds, Callback, CreateOptions, EvalOutcome, Events, HistoryEntry, HostConfig, ImageFormat};
use std::cell::RefCell;
use std::collections::HashMap;
use std::io::Read;
use std::rc::Rc;
use webkit6::prelude::*;
use webkit6::{
    HardwareAccelerationPolicy, LoadEvent, NetworkSession, Settings, SnapshotOptions, SnapshotRegion, UserContentInjectedFrames,
    UserContentManager, UserScript, UserScriptInjectionTime, WebView, gdk, gio, glib, gtk,
};

const CONSOLE_JS: &str = include_str!("console.js");
const CONSOLE_HANDLER: &str = "__bunConsole";

thread_local! {
    static SERVER: RefCell<Option<Server>> = const { RefCell::new(None) };
}

struct View {
    window: gtk::Window,
    webview: WebView,
}

pub struct WebKitGtk {
    views: Rc<RefCell<HashMap<u32, View>>>,
    session: NetworkSession,
    cfg: HostConfig,
    main_loop: glib::MainLoop,
}

pub fn run(cfg: HostConfig, input: Box<dyn Read + Send>, out: Out) -> Result<i32, String> {
    gtk::init().map_err(|e| format!("GTK 4 init failed (no DISPLAY / WAYLAND_DISPLAY?): {e}"))?;
    let main_loop = glib::MainLoop::new(None, false);
    let session = match &cfg.user_data_dir {
        Some(dir) => {
            let data = dir.join("webkitgtk").to_string_lossy().into_owned();
            let cache = dir.join("webkitgtk-cache").to_string_lossy().into_owned();
            NetworkSession::new(Some(&data), Some(&cache))
        }
        None => NetworkSession::new_ephemeral(),
    };
    let headless = cfg.headless;
    let backend = WebKitGtk { views: Rc::default(), session, cfg, main_loop: main_loop.clone() };
    SERVER.with(|s| *s.borrow_mut() = Some(Server::new(Box::new(backend), out, headless)));

    let ctx = glib::MainContext::default();
    pipe::spawn_reader(input, move |m| ctx.invoke(move || dispatch(m)));
    main_loop.run();
    SERVER.with(|s| s.borrow_mut().take());
    Ok(0)
}

fn dispatch(m: Inbound) {
    SERVER.with(|s| {
        let mut s = s.borrow_mut();
        let Some(server) = s.as_mut() else { return };
        match m {
            Inbound::Message(text) => server.handle(&text),
            Inbound::Eof => server.shutdown(),
        }
    });
}

impl WebKitGtk {
    fn with<T>(&self, id: u32, f: impl FnOnce(&View) -> Result<T, String>) -> Result<T, String> {
        match self.views.borrow().get(&id) {
            Some(v) => f(v),
            None => Err(format!("No target {id}")),
        }
    }

    fn webview(&self, id: u32) -> Result<WebView, String> {
        self.with(id, |v| Ok(v.webview.clone()))
    }
}

impl Backend for WebKitGtk {
    fn kind(&self) -> BackendKind {
        BackendKind::WebKitGtk
    }

    fn version(&self) -> String {
        format!(
            "bun-webview-host/webkitgtk WebKitGTK/{}.{}.{} GTK/{}.{}.{}",
            webkit6::functions::major_version(),
            webkit6::functions::minor_version(),
            webkit6::functions::micro_version(),
            gtk::major_version(),
            gtk::minor_version(),
            gtk::micro_version()
        )
    }

    fn create(&mut self, id: u32, o: &CreateOptions, events: Events) -> Result<(), String> {
        let ucm = UserContentManager::new();
        ucm.register_script_message_handler(CONSOLE_HANDLER, None);
        {
            let events = events.clone();
            ucm.connect_script_message_received(Some(CONSOLE_HANDLER), move |_, value| {
                let Ok(msg) = serde_json::from_str::<serde_json::Value>(&value.to_str()) else { return };
                let kind = msg.get("type").and_then(|t| t.as_str()).unwrap_or("log").to_owned();
                events.console(&kind, msg.get("args").cloned().unwrap_or_else(|| serde_json::json!([])));
            });
        }
        ucm.add_script(&UserScript::new(CONSOLE_JS, UserContentInjectedFrames::TopFrame, UserScriptInjectionTime::Start, &[], &[]));

        let settings = Settings::new();
        settings.set_enable_developer_extras(true);
        settings.set_javascript_can_access_clipboard(true);
        if self.cfg.disable_gpu {
            settings.set_hardware_acceleration_policy(HardwareAccelerationPolicy::Never);
        }

        let webview = WebView::builder().network_session(&self.session).user_content_manager(&ucm).settings(&settings).build();
        let window = gtk::Window::builder()
            .title("Bun")
            .default_width(o.width as i32)
            .default_height(o.height as i32)
            .decorated(!o.headless)
            .child(&webview)
            .build();

        {
            let events = events.clone();
            webview.connect_load_changed(move |wv, ev| match ev {
                LoadEvent::Committed => events.frame_navigated(&wv.uri().map(|u| u.to_string()).unwrap_or_default()),
                LoadEvent::Finished => events.load_event_fired(),
                _ => {}
            });
        }
        {
            let window = window.downgrade();
            webview.connect_close(move |_| {
                if let Some(w) = window.upgrade() {
                    w.close();
                }
            });
        }
        {
            let events = events.clone();
            let views = Rc::downgrade(&self.views);
            webview.connect_web_process_terminated(move |_, _| {
                if let Some(views) = views.upgrade() {
                    if let Some(v) = views.borrow_mut().remove(&id) {
                        v.window.destroy();
                    }
                }
                events.closed();
            });
        }
        {
            let views = Rc::downgrade(&self.views);
            window.connect_close_request(move |_| {
                if let Some(views) = views.upgrade() {
                    views.borrow_mut().remove(&id);
                }
                events.closed();
                glib::Propagation::Proceed
            });
        }

        window.present();
        if o.url != "about:blank" && !o.url.is_empty() {
            webview.load_uri(&o.url);
        }
        self.views.borrow_mut().insert(id, View { window, webview });
        Ok(())
    }

    fn close(&mut self, id: u32) {
        let v = self.views.borrow_mut().remove(&id);
        if let Some(v) = v {
            v.window.destroy();
        }
    }

    fn navigate(&mut self, id: u32, url: &str) -> Result<(), String> {
        self.webview(id)?.load_uri(url);
        Ok(())
    }

    fn reload(&mut self, id: u32) -> Result<(), String> {
        self.webview(id)?.reload();
        Ok(())
    }

    fn history(&mut self, id: u32) -> Result<(usize, Vec<HistoryEntry>), String> {
        let wv = self.webview(id)?;
        let list = wv.back_forward_list().ok_or("no back/forward list")?;
        let back = list.back_list().len() as i32;
        let fwd = list.forward_list().len() as i32;
        if list.current_item().is_none() {
            let url = wv.uri().map(|u| u.to_string()).unwrap_or_else(|| "about:blank".into());
            return Ok((0, vec![HistoryEntry { id: 0, url, title: String::new() }]));
        }
        let entries = (-back..=fwd)
            .filter_map(|i| {
                list.nth_item(i).map(|item| HistoryEntry {
                    id: (i + back) as u32,
                    url: item.uri().map(|u| u.to_string()).unwrap_or_default(),
                    title: item.title().map(|t| t.to_string()).unwrap_or_default(),
                })
            })
            .collect();
        Ok((back as usize, entries))
    }

    fn go_to_history_entry(&mut self, id: u32, entry_id: u32) -> Result<(), String> {
        let wv = self.webview(id)?;
        let list = wv.back_forward_list().ok_or("no back/forward list")?;
        let back = list.back_list().len() as i32;
        let item = list.nth_item(entry_id as i32 - back).ok_or("No entry with passed id")?;
        wv.go_to_back_forward_list_item(&item);
        Ok(())
    }

    fn evaluate(&mut self, id: u32, expression: &str, cb: Callback<EvalOutcome>) {
        let wv = match self.webview(id) {
            Ok(wv) => wv,
            Err(e) => return cb(Err(e)),
        };
        let body = cdp::wrap_expression(expression);
        wv.call_async_javascript_function(&body, None, None, None, None::<&gio::Cancellable>, move |r| {
            cb(Ok(match r {
                Ok(v) => cdp::parse_wrapped(&v.to_str()),
                // Syntax errors in the expression surface here, before the page-side try/catch exists.
                Err(e) => EvalOutcome::Exception { description: e.message().to_owned(), value: None },
            }))
        });
    }

    fn screenshot(&mut self, id: u32, format: ImageFormat, quality: u8, cb: Callback<Vec<u8>>) {
        let wv = match self.webview(id) {
            Ok(wv) => wv,
            Err(e) => return cb(Err(e)),
        };
        wv.snapshot(SnapshotRegion::Visible, SnapshotOptions::NONE, None::<&gio::Cancellable>, move |r| {
            cb(r.map_err(|e| e.message().to_owned()).and_then(|tex| encode_texture(&tex, format, quality)))
        });
    }

    fn resize(&mut self, id: u32, width: u32, height: u32) -> Result<(), String> {
        self.with(id, |v| {
            v.window.set_default_size(width as i32, height as i32);
            Ok(())
        })
    }

    fn bounds(&mut self, id: u32) -> Result<Bounds, String> {
        self.with(id, |v| {
            let (dw, dh) = v.window.default_size();
            let (w, h) = (v.window.width(), v.window.height());
            Ok(Bounds {
                left: 0,
                top: 0,
                width: if w > 0 { w } else { dw }.max(0) as u32,
                height: if h > 0 { h } else { dh }.max(0) as u32,
            })
        })
    }

    fn quit(&mut self) {
        for (_, v) in self.views.borrow_mut().drain() {
            v.window.destroy();
        }
        self.main_loop.quit();
    }
}

fn encode_texture(tex: &gdk::Texture, format: ImageFormat, quality: u8) -> Result<Vec<u8>, String> {
    if format == ImageFormat::Png {
        return Ok(tex.save_to_png_bytes().to_vec());
    }
    let (w, h) = (tex.width().max(0) as usize, tex.height().max(0) as usize);
    let stride = w * 4;
    let mut bgra = vec![0u8; stride * h];
    // CAIRO_FORMAT_ARGB32: native-endian premultiplied ARGB = BGRA bytes on little endian.
    tex.download(&mut bgra, stride);
    let mut rgba = Vec::with_capacity(bgra.len());
    for p in bgra.chunks_exact(4) {
        let a = p[3];
        let un = |c: u8| if a == 0 || a == 255 { c } else { ((u32::from(c) * 255 + u32::from(a) / 2) / u32::from(a)).min(255) as u8 };
        if cfg!(target_endian = "little") {
            rgba.extend_from_slice(&[un(p[2]), un(p[1]), un(p[0]), a]);
        } else {
            rgba.extend_from_slice(&[un(p[1]), un(p[2]), un(p[3]), p[0]]);
        }
    }
    crate::encode_rgba(rgba, w as u32, h as u32, format, quality)
}
