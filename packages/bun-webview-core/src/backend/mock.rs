//! Display-less engine with deterministic behaviour, for protocol tests: navigation commits and
//! loads synchronously, `document.title` evaluates to the current URL, screenshots are a
//! width×height white frame.

use crate::{Backend, BackendKind, Bounds, Callback, CreateOptions, EvalOutcome, Events, HistoryEntry, ImageFormat};
use std::collections::HashMap;

struct View {
    events: Events,
    history: Vec<String>,
    index: usize,
    width: u32,
    height: u32,
}

#[derive(Default)]
pub struct Mock {
    views: HashMap<u32, View>,
}

impl Mock {
    fn view(&mut self, id: u32) -> Result<&mut View, String> {
        self.views.get_mut(&id).ok_or_else(|| format!("No target {id}"))
    }

    fn commit(v: &View) {
        let url = &v.history[v.index];
        v.events.frame_navigated(url);
        v.events.load_event_fired();
    }
}

impl Backend for Mock {
    fn kind(&self) -> BackendKind {
        BackendKind::Mock
    }

    fn create(&mut self, id: u32, o: &CreateOptions, events: Events) -> Result<(), String> {
        self.views.insert(id, View { events, history: vec![o.url.clone()], index: 0, width: o.width, height: o.height });
        Ok(())
    }

    fn close(&mut self, id: u32) {
        self.views.remove(&id);
    }

    fn navigate(&mut self, id: u32, url: &str) -> Result<(), String> {
        let v = self.view(id)?;
        v.history.truncate(v.index + 1);
        v.history.push(url.to_owned());
        v.index += 1;
        Self::commit(v);
        Ok(())
    }

    fn reload(&mut self, id: u32) -> Result<(), String> {
        Self::commit(self.view(id)?);
        Ok(())
    }

    fn history(&mut self, id: u32) -> Result<(usize, Vec<HistoryEntry>), String> {
        let v = self.view(id)?;
        let entries = v.history.iter().enumerate().map(|(i, u)| HistoryEntry { id: i as u32, url: u.clone(), title: String::new() }).collect();
        Ok((v.index, entries))
    }

    fn go_to_history_entry(&mut self, id: u32, entry_id: u32) -> Result<(), String> {
        let v = self.view(id)?;
        if entry_id as usize >= v.history.len() {
            return Err("No entry with passed id".into());
        }
        v.index = entry_id as usize;
        Self::commit(v);
        Ok(())
    }

    fn evaluate(&mut self, id: u32, expression: &str, cb: Callback<EvalOutcome>) {
        let r = self.view(id).map(|v| {
            if expression.trim() == "document.title" {
                EvalOutcome::Value(serde_json::Value::String(v.history[v.index].clone()))
            } else {
                EvalOutcome::Undefined
            }
        });
        cb(r);
    }

    fn screenshot(&mut self, id: u32, format: ImageFormat, quality: u8, cb: Callback<Vec<u8>>) {
        let r = self.view(id).and_then(|v| {
            let (w, h) = (v.width.max(1), v.height.max(1));
            crate::encode_rgba(vec![255; (w * h * 4) as usize], w, h, format, quality)
        });
        cb(r);
    }

    fn resize(&mut self, id: u32, width: u32, height: u32) -> Result<(), String> {
        let v = self.view(id)?;
        v.width = width;
        v.height = height;
        Ok(())
    }

    fn bounds(&mut self, id: u32) -> Result<Bounds, String> {
        let v = self.view(id)?;
        Ok(Bounds { left: 0, top: 0, width: v.width, height: v.height })
    }

    fn quit(&mut self) {}
}
