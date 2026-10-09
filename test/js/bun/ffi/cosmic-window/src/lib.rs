//! A libcosmic (iced + winit) window exported as a C function for `bun:ffi`.
//!
//! `bun_cosmic_window_run` owns the calling thread until the window closes, exactly like
//! `g_application_run` or `QApplication::exec`. `on_created` is a `JSCallback`, so it is only
//! called on the thread that entered `bun_cosmic_window_run`; if iced boots the application on
//! another thread the call is deferred until the event loop returns.

use std::ffi::{CStr, c_char};
use std::panic::AssertUnwindSafe;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, AtomicI32, Ordering};
use std::thread::ThreadId;
use std::time::Duration;

use cosmic::app::{Core, Settings, Task};
use cosmic::iced::{Length, Size, Subscription};
use cosmic::{ApplicationExt as _, Element, executor, widget};

type OnCreated = extern "C" fn(u32, u32);

struct Flags {
    title: String,
    width: u32,
    height: u32,
    timeout_ms: u32,
    on_created: Option<OnCreated>,
    caller: ThreadId,
}

static DEFERRED_CREATED: AtomicBool = AtomicBool::new(false);
static CLOSED_BY: AtomicI32 = AtomicI32::new(0);
static RUNNING: Mutex<()> = Mutex::new(());

#[derive(Clone, Debug)]
enum Message {
    Timeout,
}

struct Window {
    core: Core,
    flags: Flags,
}

impl cosmic::Application for Window {
    type Executor = executor::Default;
    type Flags = Flags;
    type Message = Message;

    const APP_ID: &'static str = "sh.bun.FfiCosmicWindow";

    fn core(&self) -> &Core {
        &self.core
    }

    fn core_mut(&mut self) -> &mut Core {
        &mut self.core
    }

    fn init(core: Core, flags: Flags) -> (Self, Task<Message>) {
        let mut app = Window { core, flags };
        let title = app.flags.title.clone();
        app.set_header_title(title.clone());
        let task = match app.core.main_window_id() {
            Some(id) => app.set_window_title(title, id),
            None => Task::none(),
        };
        if let Some(on_created) = app.flags.on_created {
            if std::thread::current().id() == app.flags.caller {
                on_created(app.flags.width, app.flags.height);
            } else {
                DEFERRED_CREATED.store(true, Ordering::SeqCst);
            }
        }
        (app, task)
    }

    fn update(&mut self, message: Message) -> Task<Message> {
        match message {
            Message::Timeout => {
                CLOSED_BY.store(1, Ordering::SeqCst);
                cosmic::iced::exit()
            }
        }
    }

    fn subscription(&self) -> Subscription<Message> {
        if self.flags.timeout_ms == 0 {
            return Subscription::none();
        }
        cosmic::iced::time::every(Duration::from_millis(u64::from(self.flags.timeout_ms)))
            .map(|_| Message::Timeout)
    }

    fn view(&self) -> Element<'_, Message> {
        let body = concat!(
            "bun:ffi + libcosmic ",
            env!("CARGO_PKG_VERSION"),
            "\nPress the close button to exit."
        );
        widget::container(widget::text::body(body))
            .padding(24)
            .width(Length::Fill)
            .height(Length::Fill)
            .into()
    }
}

/// Opens a libcosmic window and runs its event loop on the calling thread.
///
/// Returns 0 once the window closed (close button or `timeout_ms`), 1 if libcosmic failed to
/// start or panicked, 2 for invalid arguments and 3 if a window is already running in this
/// process.
/// `closed_by` (nullable) receives 0 for the close button and 1 for `timeout_ms`.
///
/// # Safety
/// `title` must be a valid NUL-terminated UTF-8 string or null; `closed_by` must be null or
/// point to a writable `i32`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn bun_cosmic_window_run(
    title: *const c_char,
    width: u32,
    height: u32,
    timeout_ms: u32,
    on_created: Option<OnCreated>,
    closed_by: *mut i32,
) -> i32 {
    let Ok(_guard) = RUNNING.try_lock() else {
        return 3;
    };
    let title = if title.is_null() {
        "Bun".to_owned()
    } else {
        // SAFETY: the caller passes a NUL-terminated string.
        match unsafe { CStr::from_ptr(title) }.to_str() {
            Ok(s) => s.to_owned(),
            Err(_) => return 2,
        }
    };
    if width == 0 || height == 0 {
        return 2;
    }
    DEFERRED_CREATED.store(false, Ordering::SeqCst);
    CLOSED_BY.store(0, Ordering::SeqCst);
    let flags = Flags {
        title,
        width,
        height,
        timeout_ms,
        on_created,
        caller: std::thread::current().id(),
    };
    // An opaque window keeps softbuffer (tiny-skia) on a depth-24 visual; Xvfb's ARGB visual is
    // rejected with "does not use softbuffer's pixel format".
    let settings = Settings::default()
        .size(Size::new(width as f32, height as f32))
        .transparent(false);
    // A panic must not unwind into the JIT frames of the bun:ffi caller, which have no unwind info.
    let status = match std::panic::catch_unwind(AssertUnwindSafe(|| {
        cosmic::app::run::<Window>(settings, flags)
    })) {
        Ok(Ok(())) => 0,
        Ok(Err(e)) => {
            eprintln!("bun_cosmic_window_run: {e}");
            1
        }
        Err(_) => 1,
    };
    if DEFERRED_CREATED.swap(false, Ordering::SeqCst) {
        if let Some(on_created) = on_created {
            on_created(width, height);
        }
    }
    if !closed_by.is_null() {
        // SAFETY: the caller passes null or a writable i32.
        unsafe { *closed_by = CLOSED_BY.load(Ordering::SeqCst) };
    }
    status
}
