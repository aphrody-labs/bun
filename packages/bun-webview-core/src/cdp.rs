//! The CDP subset Bun.WebView's ChromeBackend.cpp sends, translated onto a [`Backend`].
//!
//! Browser level (no `sessionId`): Target.createTarget / attachToTarget / closeTarget /
//! setDiscoverTargets / setAutoAttach, Browser.getVersion / getWindowForTarget /
//! getWindowBounds / setWindowBounds / close.
//! Session level: Page.enable / navigate / reload / getNavigationHistory /
//! navigateToHistoryEntry / captureScreenshot, Runtime.enable / evaluate,
//! Input.dispatchMouseEvent / dispatchKeyEvent / insertText,
//! Emulation.setDeviceMetricsOverride, and `*.enable` / `*.disable` as no-ops.
//! Anything else goes to [`Backend::raw_cdp`] (native CDP on WebView2/CEF) or is answered
//! with JSON-RPC -32601 like Chrome.

use crate::{Backend, Bounds, CreateOptions, EvalOutcome, Events, ImageFormat, KeyEvent, KeyKind, MouseEvent, MouseKind};
use base64::Engine as _;
use serde_json::{Value, json};
use std::collections::HashMap;
use std::sync::mpsc::Sender;

/// Outbound message sink (one NUL-terminated JSON message per send). `Send + Clone`.
#[derive(Clone)]
pub struct Out(Sender<String>);

impl Out {
    pub fn new(tx: Sender<String>) -> Self {
        Self(tx)
    }

    fn send(&self, v: Value) {
        let _ = self.0.send(v.to_string());
    }

    pub fn event(&self, session: Option<&str>, method: &str, params: Value) {
        let mut m = json!({ "method": method, "params": params });
        if let Some(s) = session {
            m["sessionId"] = Value::String(s.to_owned());
        }
        self.send(m);
    }

    fn result(&self, id: &Value, session: Option<&str>, result: Value) {
        let mut m = json!({ "id": id, "result": result });
        if let Some(s) = session {
            m["sessionId"] = Value::String(s.to_owned());
        }
        self.send(m);
    }

    fn error(&self, id: &Value, session: Option<&str>, code: i64, message: &str) {
        let mut m = json!({ "id": id, "error": { "code": code, "message": message } });
        if let Some(s) = session {
            m["sessionId"] = Value::String(s.to_owned());
        }
        self.send(m);
    }
}

/// Answers one command, possibly later from a backend callback.
pub struct Reply {
    out: Out,
    id: Value,
    session: Option<String>,
}

impl Reply {
    pub fn ok(self, result: Value) {
        self.out.result(&self.id, self.session.as_deref(), result);
    }

    pub fn err(self, message: &str) {
        self.out.error(&self.id, self.session.as_deref(), -32000, message);
    }

    fn not_found(self, method: &str) {
        self.out.error(&self.id, self.session.as_deref(), -32601, &format!("'{method}' wasn't found"));
    }

    fn done(self, r: Result<Value, String>) {
        match r {
            Ok(v) => self.ok(v),
            Err(e) => self.err(&e),
        }
    }
}

struct Target {
    id: u32,
    session: String,
    target_id: String,
    width: u32,
    height: u32,
}

pub struct Server {
    backend: Box<dyn Backend>,
    out: Out,
    headless: bool,
    next: u32,
    targets: Vec<Target>,
    by_session: HashMap<String, u32>,
}

impl Server {
    pub fn new(backend: Box<dyn Backend>, out: Out, headless: bool) -> Self {
        Self { backend, out, headless, next: 1, targets: Vec::new(), by_session: HashMap::new() }
    }

    pub fn backend(&mut self) -> &mut dyn Backend {
        &mut *self.backend
    }

    fn target_by_tid(&self, tid: &str) -> Option<&Target> {
        self.targets.iter().find(|t| t.target_id == tid)
    }

    /// Parent closed the pipe (or sent garbage it cannot recover from): leave.
    pub fn shutdown(&mut self) {
        for t in std::mem::take(&mut self.targets) {
            self.backend.close(t.id);
        }
        self.backend.quit();
    }

    /// One inbound CDP message (without the NUL terminator).
    pub fn handle(&mut self, msg: &str) {
        let Ok(m) = serde_json::from_str::<Value>(msg) else {
            return;
        };
        let id = m.get("id").cloned().unwrap_or(Value::Null);
        let method = m.get("method").and_then(Value::as_str).unwrap_or("").to_owned();
        let params = m.get("params").cloned().unwrap_or_else(|| json!({}));
        let session = m.get("sessionId").and_then(Value::as_str).map(str::to_owned);
        let reply = Reply { out: self.out.clone(), id, session: session.clone() };
        match session {
            None => self.browser(&method, &params, reply),
            Some(s) => match self.by_session.get(&s).copied() {
                Some(view) => self.page(view, &method, &params, reply),
                None => reply.err(&format!("Session with given id not found: {s}")),
            },
        }
    }

    fn browser(&mut self, method: &str, p: &Value, reply: Reply) {
        match method {
            "Browser.getVersion" => reply.ok(json!({
                "protocolVersion": "1.3",
                "product": self.backend.version(),
                "revision": "",
                "userAgent": "",
                "jsVersion": "",
            })),
            "Target.setDiscoverTargets" | "Target.setAutoAttach" | "Browser.setDownloadBehavior" => reply.ok(json!({})),
            "Target.createTarget" => {
                let id = self.next;
                self.next += 1;
                let target_id = format!("{:032X}", id);
                let session = format!("{:032X}", 0x5E55_0000_u64 + u64::from(id));
                let width = p.get("width").and_then(Value::as_u64).filter(|w| *w > 0).unwrap_or(800) as u32;
                let height = p.get("height").and_then(Value::as_u64).filter(|h| *h > 0).unwrap_or(600) as u32;
                let opts = CreateOptions {
                    url: p.get("url").and_then(Value::as_str).unwrap_or("about:blank").to_owned(),
                    width,
                    height,
                    headless: self.headless,
                };
                let events = Events::new(self.out.clone(), session.clone(), target_id.clone());
                match self.backend.create(id, &opts, events) {
                    Ok(()) => {
                        self.targets.push(Target { id, session, target_id: target_id.clone(), width, height });
                        reply.ok(json!({ "targetId": target_id }));
                    }
                    Err(e) => reply.err(&e),
                }
            }
            "Target.attachToTarget" => {
                let tid = p.get("targetId").and_then(Value::as_str).unwrap_or("");
                match self.target_by_tid(tid) {
                    Some(t) => {
                        let (s, view) = (t.session.clone(), t.id);
                        self.by_session.insert(s.clone(), view);
                        self.out.event(
                            None,
                            "Target.attachedToTarget",
                            json!({ "sessionId": s, "targetInfo": { "targetId": tid, "type": "page", "title": "", "url": "", "attached": true }, "waitingForDebugger": false }),
                        );
                        reply.ok(json!({ "sessionId": s }));
                    }
                    None => reply.err(&format!("No target with given id found: {tid}")),
                }
            }
            "Target.closeTarget" => {
                let tid = p.get("targetId").and_then(Value::as_str).unwrap_or("");
                match self.targets.iter().position(|t| t.target_id == tid) {
                    Some(i) => {
                        let t = self.targets.remove(i);
                        self.by_session.remove(&t.session);
                        self.backend.close(t.id);
                        reply.ok(json!({ "success": true }));
                    }
                    None => reply.err(&format!("No target with given id found: {tid}")),
                }
            }
            "Target.getTargets" => {
                let infos: Vec<Value> = self
                    .targets
                    .iter()
                    .map(|t| json!({ "targetId": t.target_id, "type": "page", "title": "", "url": "", "attached": self.by_session.contains_key(&t.session) }))
                    .collect();
                reply.ok(json!({ "targetInfos": infos }));
            }
            "Browser.getWindowForTarget" => {
                let tid = p.get("targetId").and_then(Value::as_str);
                let view = match tid {
                    Some(tid) => self.target_by_tid(tid).map(|t| t.id),
                    None => self.targets.first().map(|t| t.id),
                };
                match view {
                    Some(v) => match self.backend.bounds(v) {
                        Ok(b) => reply.ok(json!({ "windowId": v, "bounds": bounds_json(b) })),
                        Err(e) => reply.err(&e),
                    },
                    None => reply.err("Browser window not found"),
                }
            }
            "Browser.getWindowBounds" => {
                let v = p.get("windowId").and_then(Value::as_u64).unwrap_or(0) as u32;
                match self.backend.bounds(v) {
                    Ok(b) => reply.ok(json!({ "bounds": bounds_json(b) })),
                    Err(e) => reply.err(&e),
                }
            }
            "Browser.setWindowBounds" => {
                let v = p.get("windowId").and_then(Value::as_u64).unwrap_or(0) as u32;
                let b = p.get("bounds").cloned().unwrap_or_default();
                let cur = self.backend.bounds(v);
                let r = cur.and_then(|c| {
                    let w = b.get("width").and_then(Value::as_u64).map_or(c.width, |x| x as u32);
                    let h = b.get("height").and_then(Value::as_u64).map_or(c.height, |x| x as u32);
                    self.backend.resize(v, w, h)
                });
                reply.done(r.map(|()| json!({})));
            }
            "Browser.close" => {
                reply.ok(json!({}));
                self.shutdown();
            }
            _ => reply.not_found(method),
        }
    }

    fn page(&mut self, view: u32, method: &str, p: &Value, reply: Reply) {
        let b = &mut *self.backend;
        match method {
            "Page.enable" | "Runtime.enable" | "Network.enable" | "Log.enable" | "DOM.enable" | "Page.disable" | "Runtime.disable"
            | "Network.disable" | "Log.disable" | "Page.setLifecycleEventsEnabled" | "Runtime.runIfWaitingForDebugger"
            | "Emulation.clearDeviceMetricsOverride" | "Page.bringToFront" => reply.ok(json!({})),
            "Page.navigate" => {
                let url = p.get("url").and_then(Value::as_str).unwrap_or("about:blank");
                let frame = self.targets.iter().find(|t| t.id == view).map(|t| t.target_id.clone()).unwrap_or_default();
                match b.navigate(view, url) {
                    Ok(()) => reply.ok(json!({ "frameId": frame, "loaderId": frame })),
                    Err(e) => reply.ok(json!({ "frameId": frame, "errorText": e })),
                }
            }
            "Page.reload" => reply.done(b.reload(view).map(|()| json!({}))),
            "Page.getNavigationHistory" => reply.done(b.history(view).map(|(cur, entries)| {
                let entries: Vec<Value> = entries
                    .into_iter()
                    .map(|e| json!({ "id": e.id, "url": e.url, "userTypedURL": e.url, "title": e.title, "transitionType": "link" }))
                    .collect();
                json!({ "currentIndex": cur, "entries": entries })
            })),
            "Page.navigateToHistoryEntry" => {
                let entry = p.get("entryId").and_then(Value::as_u64).unwrap_or(0) as u32;
                reply.done(b.go_to_history_entry(view, entry).map(|()| json!({})));
            }
            "Page.captureScreenshot" => {
                let format = ImageFormat::parse(p.get("format").and_then(Value::as_str).unwrap_or("png"));
                let quality = p.get("quality").and_then(Value::as_u64).unwrap_or(0).min(100) as u8;
                b.screenshot(
                    view,
                    format,
                    quality,
                    Box::new(move |r| reply.done(r.map(|bytes| json!({ "data": base64::engine::general_purpose::STANDARD.encode(bytes) })))),
                );
            }
            "Runtime.evaluate" => {
                let expr = p.get("expression").and_then(Value::as_str).unwrap_or("").to_owned();
                b.evaluate(view, &expr, Box::new(move |r| reply.done(r.map(eval_json))));
            }
            "Emulation.setDeviceMetricsOverride" => {
                let w = p.get("width").and_then(Value::as_u64).unwrap_or(0) as u32;
                let h = p.get("height").and_then(Value::as_u64).unwrap_or(0) as u32;
                let r = if w > 0 && h > 0 { b.resize(view, w, h) } else { Ok(()) };
                if r.is_ok() && w > 0 && h > 0 {
                    if let Some(t) = self.targets.iter_mut().find(|t| t.id == view) {
                        t.width = w;
                        t.height = h;
                    }
                }
                reply.done(r.map(|()| json!({})));
            }
            "Input.dispatchMouseEvent" => {
                let kind = match p.get("type").and_then(Value::as_str).unwrap_or("") {
                    "mousePressed" => MouseKind::Pressed,
                    "mouseReleased" => MouseKind::Released,
                    "mouseWheel" => MouseKind::Wheel,
                    _ => MouseKind::Moved,
                };
                let ev = MouseEvent {
                    kind,
                    x: num(p, "x"),
                    y: num(p, "y"),
                    button: p.get("button").and_then(Value::as_str).unwrap_or("none").to_owned(),
                    click_count: p.get("clickCount").and_then(Value::as_u64).unwrap_or(1) as u32,
                    modifiers: p.get("modifiers").and_then(Value::as_u64).unwrap_or(0) as u32,
                    delta_x: num(p, "deltaX"),
                    delta_y: num(p, "deltaY"),
                };
                b.mouse(view, &ev, Box::new(move |r| reply.done(r.map(|()| json!({})))));
            }
            "Input.dispatchKeyEvent" => {
                let kind = match p.get("type").and_then(Value::as_str).unwrap_or("") {
                    "keyDown" => KeyKind::Down,
                    "rawKeyDown" => KeyKind::RawDown,
                    "char" => KeyKind::Char,
                    _ => KeyKind::Up,
                };
                let s = |k: &str| p.get(k).and_then(Value::as_str).unwrap_or("").to_owned();
                let ev = KeyEvent {
                    kind,
                    key: s("key"),
                    code: s("code"),
                    text: s("text"),
                    key_code: p.get("windowsVirtualKeyCode").and_then(Value::as_u64).unwrap_or(0) as u32,
                    modifiers: p.get("modifiers").and_then(Value::as_u64).unwrap_or(0) as u32,
                };
                b.key(view, &ev, Box::new(move |r| reply.done(r.map(|()| json!({})))));
            }
            "Input.insertText" => {
                let text = p.get("text").and_then(Value::as_str).unwrap_or("").to_owned();
                b.insert_text(view, &text, Box::new(move |r| reply.done(r.map(|()| json!({})))));
            }
            "Target.closeTarget" | "Target.getTargets" | "Browser.getVersion" | "Browser.getWindowForTarget" => {
                self.browser(method, p, reply)
            }
            _ => {
                let method_owned = method.to_owned();
                if let Err(cb) = b.raw_cdp(view, method, p, Box::new(move |r| reply.done(r))) {
                    cb(Err(format!("'{method_owned}' wasn't found")));
                }
            }
        }
    }
}

fn num(p: &Value, k: &str) -> f64 {
    p.get(k).and_then(Value::as_f64).unwrap_or(0.0)
}

fn bounds_json(b: Bounds) -> Value {
    json!({ "left": b.left, "top": b.top, "width": b.width, "height": b.height, "windowState": "normal" })
}

/// [`EvalOutcome`] as a `Runtime.evaluate` result object.
pub fn eval_json(o: EvalOutcome) -> Value {
    match o {
        EvalOutcome::Undefined => json!({ "result": { "type": "undefined" } }),
        EvalOutcome::Value(v) => {
            let ty = match &v {
                Value::String(_) => "string",
                Value::Number(_) => "number",
                Value::Bool(_) => "boolean",
                _ => "object",
            };
            let mut r = json!({ "type": ty, "value": v });
            if v.is_null() {
                r["subtype"] = json!("null");
            }
            json!({ "result": r })
        }
        EvalOutcome::Exception { description, value } => {
            let mut exc = json!({ "type": "object", "subtype": "error", "className": "Error", "description": description });
            if let Some(v) = value {
                exc = json!({ "type": type_of(&v), "value": v });
            }
            json!({
                "result": exc,
                "exceptionDetails": { "exceptionId": 1, "text": "Uncaught", "lineNumber": 0, "columnNumber": 0, "exception": exc },
            })
        }
    }
}

fn type_of(v: &Value) -> &'static str {
    match v {
        Value::String(_) => "string",
        Value::Number(_) => "number",
        Value::Bool(_) => "boolean",
        _ => "object",
    }
}

/// Page-side wrapper shared by the JavaScriptCore backends: evaluates `expression` as an
/// expression, awaits it, and returns ONE JSON string `{"u":1}` | `{"r":<value>}` |
/// `{"e":"<Name: message\nstack>"}` | `{"t":<thrown non-Error>}` parsed by [`parse_wrapped`].
pub fn wrap_expression(expression: &str) -> String {
    format!(
        "return (async () => {{ let __bun_r; try {{ __bun_r = await (\n{expression}\n); }} catch (e) {{ \
         if (e instanceof Error) return JSON.stringify({{ e: e.name + ': ' + e.message + (e.stack ? '\\n' + e.stack : '') }}); \
         try {{ return JSON.stringify({{ t: e === undefined ? null : e }}); }} catch {{ return JSON.stringify({{ e: String(e) }}); }} }} \
         if (__bun_r === undefined) return '{{\"u\":1}}'; \
         try {{ const s = JSON.stringify({{ r: __bun_r }}); return s === '{{}}' ? '{{\"u\":1}}' : s; }} catch (e) {{ return JSON.stringify({{ e: 'TypeError: ' + e.message }}); }} }})()"
    )
}

pub fn parse_wrapped(s: &str) -> EvalOutcome {
    match serde_json::from_str::<Value>(s) {
        Ok(v) => {
            if let Some(r) = v.get("r") {
                EvalOutcome::Value(r.clone())
            } else if let Some(e) = v.get("e").and_then(Value::as_str) {
                EvalOutcome::Exception { description: e.to_owned(), value: None }
            } else if let Some(t) = v.get("t") {
                EvalOutcome::Exception { description: t.to_string(), value: Some(t.clone()) }
            } else {
                EvalOutcome::Undefined
            }
        }
        Err(_) => EvalOutcome::Undefined,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::backend::mock::Mock;
    use std::sync::mpsc;

    fn server() -> (Server, mpsc::Receiver<String>) {
        let (tx, rx) = mpsc::channel();
        let out = Out::new(tx);
        (Server::new(Box::new(Mock::default()), out, true), rx)
    }

    fn drain(rx: &mpsc::Receiver<String>) -> Vec<Value> {
        rx.try_iter().map(|s| serde_json::from_str(&s).unwrap()).collect()
    }

    fn by_id(msgs: &[Value], id: u64) -> Value {
        msgs.iter().find(|m| m["id"] == json!(id)).cloned().unwrap_or(Value::Null)
    }

    /// The exact chain ChromeBackend.cpp runs on the first navigate().
    #[test]
    fn chrome_backend_attach_chain() {
        let (mut s, rx) = server();
        s.handle(r#"{"id":1,"method":"Target.createTarget","params":{"url":"about:blank","newWindow":true,"width":640,"height":480}}"#);
        let m = drain(&rx);
        let tid = by_id(&m, 1)["result"]["targetId"].as_str().unwrap().to_owned();
        s.handle(&format!(r#"{{"id":2,"method":"Target.attachToTarget","params":{{"targetId":"{tid}","flatten":true}}}}"#));
        let m = drain(&rx);
        let sid = by_id(&m, 2)["result"]["sessionId"].as_str().unwrap().to_owned();
        s.handle(&format!(r#"{{"id":3,"method":"Page.enable","sessionId":"{sid}"}}"#));
        s.handle(&format!(r#"{{"id":4,"method":"Runtime.enable","sessionId":"{sid}"}}"#));
        s.handle(&format!(r#"{{"id":5,"method":"Page.navigate","params":{{"url":"https://a.test/"}},"sessionId":"{sid}"}}"#));
        let m = drain(&rx);
        assert_eq!(by_id(&m, 3)["result"], json!({}));
        assert_eq!(by_id(&m, 5)["sessionId"], json!(sid));
        let nav = m.iter().find(|x| x["method"] == "Page.frameNavigated").unwrap();
        assert_eq!(nav["params"]["frame"]["url"], "https://a.test/");
        assert_eq!(nav["sessionId"], json!(sid));
        assert!(m.iter().any(|x| x["method"] == "Page.loadEventFired"));

        s.handle(&format!(r#"{{"id":6,"method":"Runtime.evaluate","params":{{"expression":"document.title","returnByValue":true}},"sessionId":"{sid}"}}"#));
        let m = drain(&rx);
        assert_eq!(by_id(&m, 6)["result"]["result"], json!({ "type": "string", "value": "https://a.test/" }));

        s.handle(&format!(r#"{{"id":7,"method":"Page.getNavigationHistory","sessionId":"{sid}"}}"#));
        let m = drain(&rx);
        assert_eq!(by_id(&m, 7)["result"]["currentIndex"], json!(1));
        assert_eq!(by_id(&m, 7)["result"]["entries"][1]["url"], "https://a.test/");

        s.handle(&format!(r#"{{"id":8,"method":"Page.captureScreenshot","params":{{"format":"png"}},"sessionId":"{sid}"}}"#));
        let m = drain(&rx);
        let data = by_id(&m, 8)["result"]["data"].as_str().unwrap().to_owned();
        let png = base64::engine::general_purpose::STANDARD.decode(data).unwrap();
        assert_eq!(&png[..8], b"\x89PNG\r\n\x1a\n");

        s.handle(&format!(r#"{{"id":9,"method":"Browser.getWindowForTarget","params":{{"targetId":"{tid}"}}}}"#));
        let m = drain(&rx);
        assert_eq!(by_id(&m, 9)["result"]["bounds"]["width"], json!(640));

        s.handle(&format!(r#"{{"id":10,"method":"Emulation.setDeviceMetricsOverride","params":{{"width":320,"height":200,"deviceScaleFactor":1,"mobile":false}},"sessionId":"{sid}"}}"#));
        s.handle(r#"{"id":11,"method":"Browser.getWindowBounds","params":{"windowId":1}}"#);
        let m = drain(&rx);
        assert_eq!(by_id(&m, 11)["result"]["bounds"]["height"], json!(200));

        s.handle(&format!(r#"{{"id":12,"method":"Target.closeTarget","params":{{"targetId":"{tid}"}}}}"#));
        s.handle(&format!(r#"{{"id":13,"method":"Page.reload","sessionId":"{sid}"}}"#));
        let m = drain(&rx);
        assert_eq!(by_id(&m, 12)["result"]["success"], json!(true));
        assert!(by_id(&m, 13)["error"]["message"].as_str().unwrap().contains("Session"));
    }

    #[test]
    fn unknown_method_is_32601() {
        let (mut s, rx) = server();
        s.handle(r#"{"id":1,"method":"Nope.nothing"}"#);
        let m = drain(&rx);
        assert_eq!(by_id(&m, 1)["error"]["code"], json!(-32601));
    }

    #[test]
    fn exceptions_map_to_exception_details() {
        let v = eval_json(parse_wrapped(r#"{"e":"TypeError: x is not a function\n@"}"#));
        assert_eq!(v["exceptionDetails"]["exception"]["description"], "TypeError: x is not a function\n@");
        let v = eval_json(parse_wrapped(r#"{"t":"boom"}"#));
        assert_eq!(v["exceptionDetails"]["exception"]["value"], "boom");
        assert_eq!(eval_json(parse_wrapped(r#"{"u":1}"#)), json!({ "result": { "type": "undefined" } }));
        assert_eq!(eval_json(parse_wrapped(r#"{"r":[1,2]}"#))["result"]["value"], json!([1, 2]));
    }

    #[test]
    fn wrapped_expression_keeps_expression_on_its_own_lines() {
        let w = wrap_expression("1 // trailing comment");
        assert!(w.contains("(\n1 // trailing comment\n)"));
    }
}
