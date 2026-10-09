//! `bun-cosmic`: the process `bun:cosmic` spawns for what must not run on Bun's JavaScript thread.
//!
//! A libcosmic (iced + winit) application owns the main thread of its process for as long as its
//! window is open, so each window is its own process; Bun reads its events from stdout without
//! blocking the event loop, and a crash in the GUI stack cannot take Bun down.
//!
//! ```text
//! bun-cosmic window --title T [--body B] [--button LABEL]... [--width W] [--height H]
//! bun-cosmic notify --summary S [--body B] [--icon I] [--app-name A] [--timeout MS]
//!                   [--urgency low|normal|critical] [--action ID=LABEL]... [--wait]
//! bun-cosmic --version
//! ```
//!
//! Every event is one JSON object per line on stdout:
//! `{"event":"ready"}`, `{"event":"button","index":0,"label":"OK"}`, `{"event":"closed"}`,
//! `{"event":"shown","id":3}`, `{"event":"action","action":"open"}`, `{"event":"error","message":"…"}`.

use std::io::Write as _;
use std::process::ExitCode;

use cosmic::app::{Core, Settings, Task};
use cosmic::iced::{Alignment, Length, Size};
use cosmic::{ApplicationExt as _, Element, executor, widget};
use serde_json::{Value, json};

fn emit(event: &Value) {
    let mut out = std::io::stdout().lock();
    let _ = writeln!(out, "{event}");
    let _ = out.flush();
}

fn fail(message: &str) -> ExitCode {
    emit(&json!({ "event": "error", "message": message }));
    ExitCode::from(2)
}

/// `--name=value` pairs (repeated names keep every value in order) and `--flag`s. `--name value`
/// is accepted too, unless the value itself starts with `--`; bun:cosmic always sends `=`.
struct Args(Vec<(String, String)>, Vec<String>);

impl Args {
    fn parse(raw: impl Iterator<Item = String>) -> Result<Self, String> {
        let mut pairs = Vec::new();
        let mut flags = Vec::new();
        let mut raw = raw.peekable();
        while let Some(arg) = raw.next() {
            let Some(name) = arg.strip_prefix("--") else {
                return Err(format!("unexpected argument {arg}"));
            };
            if let Some((name, value)) = name.split_once('=') {
                pairs.push((name.to_owned(), value.to_owned()));
                continue;
            }
            match raw.peek() {
                Some(next) if !next.starts_with("--") => {
                    let value = raw.next().unwrap_or_default();
                    pairs.push((name.to_owned(), value));
                }
                _ => flags.push(name.to_owned()),
            }
        }
        Ok(Self(pairs, flags))
    }

    fn get(&self, name: &str) -> Option<&str> {
        self.0
            .iter()
            .find(|(n, _)| n == name)
            .map(|(_, v)| v.as_str())
    }

    fn all(&self, name: &str) -> impl Iterator<Item = &str> {
        self.0
            .iter()
            .filter(move |(n, _)| n == name)
            .map(|(_, v)| v.as_str())
    }

    fn flag(&self, name: &str) -> bool {
        self.1.iter().any(|f| f == name)
    }

    fn number(&self, name: &str) -> Result<Option<f32>, String> {
        match self.get(name) {
            None => Ok(None),
            Some(v) => v
                .parse::<f32>()
                .ok()
                .filter(|n| n.is_finite() && *n > 0.0)
                .map(Some)
                .ok_or_else(|| format!("--{name} must be a positive number")),
        }
    }
}

struct WindowFlags {
    title: String,
    body: String,
    buttons: Vec<String>,
}

#[derive(Clone, Debug)]
enum Message {
    Button(usize),
}

struct Window {
    core: Core,
    flags: WindowFlags,
}

impl cosmic::Application for Window {
    type Executor = executor::Default;
    type Flags = WindowFlags;
    type Message = Message;

    const APP_ID: &'static str = "sh.bun.Cosmic";

    fn core(&self) -> &Core {
        &self.core
    }

    fn core_mut(&mut self) -> &mut Core {
        &mut self.core
    }

    fn init(core: Core, flags: WindowFlags) -> (Self, Task<Message>) {
        let mut app = Window { core, flags };
        let title = app.flags.title.clone();
        app.set_header_title(title.clone());
        let task = match app.core.main_window_id() {
            Some(id) => app.set_window_title(title, id),
            None => Task::none(),
        };
        emit(&json!({ "event": "ready" }));
        (app, task)
    }

    fn update(&mut self, message: Message) -> Task<Message> {
        match message {
            Message::Button(index) => {
                let label = self.flags.buttons.get(index).cloned().unwrap_or_default();
                emit(&json!({ "event": "button", "index": index, "label": label }));
                std::process::exit(0);
            }
        }
    }

    fn view(&self) -> Element<'_, Message> {
        let mut buttons = widget::Row::with_capacity(self.flags.buttons.len()).spacing(8);
        for (index, label) in self.flags.buttons.iter().enumerate() {
            let button = if index == 0 {
                widget::button::suggested(label.as_str())
            } else {
                widget::button::standard(label.as_str())
            };
            buttons = buttons.push(button.on_press(Message::Button(index)));
        }
        let content = widget::Column::with_capacity(2)
            .spacing(16)
            .push(widget::text::body(self.flags.body.as_str()))
            .push(buttons);
        widget::container(content)
            .padding(24)
            .width(Length::Fill)
            .height(Length::Fill)
            .align_x(Alignment::Start)
            .into()
    }
}

fn window(args: &Args) -> ExitCode {
    let width = match args.number("width") {
        Ok(v) => v.unwrap_or(480.0),
        Err(e) => return fail(&e),
    };
    let height = match args.number("height") {
        Ok(v) => v.unwrap_or(240.0),
        Err(e) => return fail(&e),
    };
    let flags = WindowFlags {
        title: args.get("title").unwrap_or("Bun").to_owned(),
        body: args.get("body").unwrap_or_default().to_owned(),
        buttons: args.all("button").map(str::to_owned).collect(),
    };
    let settings = Settings::default().size(Size::new(width, height));
    match cosmic::app::run::<Window>(settings, flags) {
        Ok(()) => {
            emit(&json!({ "event": "closed" }));
            ExitCode::SUCCESS
        }
        Err(e) => fail(&e.to_string()),
    }
}

#[cfg(not(unix))]
fn notify(_args: &Args) -> ExitCode {
    fail("notifications go through bun:windows on Windows")
}

#[cfg(unix)]
fn notify(args: &Args) -> ExitCode {
    let Some(summary) = args.get("summary") else {
        return fail("--summary is required");
    };
    let mut n = notify_rust::Notification::new();
    n.summary(summary);
    if let Some(body) = args.get("body") {
        n.body(body);
    }
    if let Some(icon) = args.get("icon") {
        n.icon(icon);
    }
    n.appname(args.get("app-name").unwrap_or("Bun"));
    if let Some(ms) = args.get("timeout") {
        match ms.parse::<i32>() {
            Ok(ms) => {
                n.timeout(ms);
            }
            Err(_) => return fail("--timeout must be an integer number of milliseconds"),
        }
    }
    match args.get("urgency") {
        None => {}
        Some("low") => {
            n.urgency(notify_rust::Urgency::Low);
        }
        Some("normal") => {
            n.urgency(notify_rust::Urgency::Normal);
        }
        Some("critical") => {
            n.urgency(notify_rust::Urgency::Critical);
        }
        Some(_) => return fail("--urgency must be low, normal or critical"),
    }
    let mut has_actions = false;
    for action in args.all("action") {
        let (id, label) = action.split_once('=').unwrap_or((action, action));
        n.action(id, label);
        has_actions = true;
    }
    let handle = match n.show() {
        Ok(handle) => handle,
        Err(e) => return fail(&e.to_string()),
    };
    emit(&json!({ "event": "shown", "id": handle.id() }));
    if has_actions || args.flag("wait") {
        handle.wait_for_action(|action| {
            if action == "__closed" {
                emit(&json!({ "event": "closed" }));
            } else {
                emit(&json!({ "event": "action", "action": action }));
            }
        });
    }
    ExitCode::SUCCESS
}

fn main() -> ExitCode {
    let mut raw = std::env::args().skip(1);
    let command = raw.next().unwrap_or_default();
    if command == "--version" {
        println!("bun-cosmic {}", env!("CARGO_PKG_VERSION"));
        return ExitCode::SUCCESS;
    }
    let args = match Args::parse(raw) {
        Ok(args) => args,
        Err(e) => return fail(&e),
    };
    match command.as_str() {
        "window" => window(&args),
        "notify" => notify(&args),
        _ => fail("usage: bun-cosmic window|notify [--name value]..."),
    }
}
