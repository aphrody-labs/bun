//! The daemon of one workspace: a [`Service`] behind a named pipe (Windows) or a Unix socket,
//! named by the workspace root and the Bun executable. `bun lsp query` starts it on first use.
//!
//! Each line that a client writes is a JSON request, and each line that the daemon writes back
//! is its answer:
//! - `{"op":"query","query":Query}` → `{"ok":true,"answer":Answer}`
//! - `{"op":"warm","languages":["typescript"]}` → `{"ok":true,"warmed":[…]}`
//! - `{"op":"status"}` → `{"ok":true,"status":…}`
//! - `{"op":"stop"}` → `{"ok":true}`, then the daemon stops its servers and exits.
//!
//! An error is `{"ok":false,"error":"…"}`.

use std::io::{self, BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde_json::{Value, json};

use crate::language::Language;
use crate::protocol::path_key;
use crate::service::{Query, Service};
use crate::Options;

/// Changes when the requests of a client and the answers of a daemon stop matching.
const PROTOCOL_VERSION: u32 = 1;

fn fnv1a(bytes: &[u8]) -> u64 {
    bytes.iter().fold(0xcbf2_9ce4_8422_2325u64, |hash, byte| (hash ^ u64::from(*byte)).wrapping_mul(0x0100_0000_01b3))
}

/// The name of the endpoint of the daemon of `root` started by `bun`.
pub fn endpoint_name(root: &Path, bun: Option<&Path>) -> String {
    let mut key = path_key(root).into_bytes();
    key.push(0);
    key.extend(bun.map(|it| path_key(it).into_bytes()).unwrap_or_default());
    format!("bun-lsp-{PROTOCOL_VERSION}-{:016x}", fnv1a(&key))
}

/// A connection to a daemon.
pub struct Stream {
    #[cfg(windows)]
    inner: std::fs::File,
    #[cfg(unix)]
    inner: std::os::unix::net::UnixStream,
}

impl Stream {
    pub fn try_clone(&self) -> io::Result<Stream> {
        Ok(Stream { inner: self.inner.try_clone()? })
    }
}

impl io::Read for Stream {
    fn read(&mut self, buffer: &mut [u8]) -> io::Result<usize> {
        self.inner.read(buffer)
    }
}

impl io::Write for Stream {
    fn write(&mut self, buffer: &[u8]) -> io::Result<usize> {
        self.inner.write(buffer)
    }
    fn flush(&mut self) -> io::Result<()> {
        self.inner.flush()
    }
}

#[cfg(windows)]
mod endpoint {
    use std::io;
    use std::os::windows::ffi::OsStrExt;
    use std::os::windows::io::{AsRawHandle, FromRawHandle};

    use bun_windows_sys as win;

    use super::Stream;

    fn pipe_path(name: &str) -> String {
        format!(r"\\.\pipe\{name}")
    }

    pub(super) fn connect(name: &str) -> io::Result<Stream> {
        const ERROR_PIPE_BUSY: i32 = 231;
        let path = pipe_path(name);
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(2);
        loop {
            match std::fs::OpenOptions::new().read(true).write(true).open(&path) {
                Ok(inner) => return Ok(Stream { inner }),
                Err(err) if err.raw_os_error() == Some(ERROR_PIPE_BUSY) && std::time::Instant::now() < deadline => {
                    std::thread::sleep(std::time::Duration::from_millis(5));
                }
                Err(err) => return Err(err),
            }
        }
    }

    pub(super) struct Listener {
        name: Vec<u16>,
        next: Option<std::fs::File>,
    }

    fn instance(name: &[u16], first: bool) -> io::Result<std::fs::File> {
        let first = if first { win::FILE_FLAG_FIRST_PIPE_INSTANCE } else { 0 };
        // SAFETY: `name` is NUL-terminated; a null security descriptor is the default one, which
        // grants the pipe to its creator.
        let handle = unsafe {
            win::kernel32::CreateNamedPipeW(
                name.as_ptr(),
                win::PIPE_ACCESS_DUPLEX | first,
                win::PIPE_TYPE_BYTE | win::PIPE_READMODE_BYTE | win::PIPE_WAIT | win::PIPE_REJECT_REMOTE_CLIENTS,
                win::PIPE_UNLIMITED_INSTANCES,
                64 * 1024,
                64 * 1024,
                0,
                core::ptr::null_mut(),
            )
        };
        if handle == win::INVALID_HANDLE_VALUE {
            let err = io::Error::last_os_error();
            // `FILE_FLAG_FIRST_PIPE_INSTANCE` with an existing pipe of that name.
            return Err(match err.kind() {
                io::ErrorKind::PermissionDenied => io::Error::new(io::ErrorKind::AddrInUse, err),
                _ => err,
            });
        }
        // SAFETY: `handle` is a valid pipe handle that nothing else owns.
        Ok(unsafe { std::fs::File::from_raw_handle(handle.cast()) })
    }

    impl Listener {
        pub(super) fn bind(name: &str) -> io::Result<Listener> {
            let name: Vec<u16> = std::ffi::OsStr::new(&pipe_path(name)).encode_wide().chain(Some(0)).collect();
            let next = instance(&name, true)?;
            Ok(Listener { name, next: Some(next) })
        }

        pub(super) fn accept(&mut self) -> io::Result<Stream> {
            let pipe = match self.next.take() {
                Some(pipe) => pipe,
                None => instance(&self.name, false)?,
            };
            // SAFETY: `pipe` is a pipe handle made without `FILE_FLAG_OVERLAPPED`.
            let connected = unsafe { win::kernel32::ConnectNamedPipe(pipe.as_raw_handle().cast(), core::ptr::null_mut()) };
            if connected == 0 && win::GetLastError() != win::ERROR_PIPE_CONNECTED {
                return Err(io::Error::last_os_error());
            }
            self.next = Some(instance(&self.name, false)?);
            Ok(Stream { inner: pipe })
        }
    }
}

#[cfg(unix)]
mod endpoint {
    use std::io;
    use std::os::unix::fs::{DirBuilderExt, PermissionsExt};
    use std::os::unix::net::{UnixListener, UnixStream};
    use std::path::PathBuf;

    use super::Stream;

    fn socket_path(name: &str) -> PathBuf {
        let base = match std::env::var_os("XDG_RUNTIME_DIR") {
            Some(dir) if !dir.is_empty() => PathBuf::from(dir).join("bun-lsp"),
            // SAFETY: `getuid` has no preconditions.
            _ => std::env::temp_dir().join(format!("bun-lsp-{}", unsafe { libc::getuid() })),
        };
        base.join(format!("{name}.sock"))
    }

    pub(super) fn connect(name: &str) -> io::Result<Stream> {
        Ok(Stream { inner: UnixStream::connect(socket_path(name))? })
    }

    pub(super) struct Listener(UnixListener);

    impl Listener {
        pub(super) fn bind(name: &str) -> io::Result<Listener> {
            let path = socket_path(name);
            if let Some(dir) = path.parent() {
                std::fs::DirBuilder::new().recursive(true).mode(0o700).create(dir)?;
                let mode = std::fs::metadata(dir)?.permissions().mode();
                if mode & 0o077 != 0 {
                    return Err(io::Error::new(
                        io::ErrorKind::PermissionDenied,
                        format!("{} is open to other users (mode {:o})", dir.display(), mode & 0o777),
                    ));
                }
            }
            match UnixListener::bind(&path) {
                Ok(listener) => Ok(Listener(listener)),
                Err(err) if err.kind() == io::ErrorKind::AddrInUse => {
                    if UnixStream::connect(&path).is_ok() {
                        return Err(err);
                    }
                    // A daemon that died left its socket.
                    std::fs::remove_file(&path)?;
                    Ok(Listener(UnixListener::bind(&path)?))
                }
                Err(err) => Err(err),
            }
        }

        pub(super) fn accept(&mut self) -> io::Result<Stream> {
            Ok(Stream { inner: self.0.accept()?.0 })
        }
    }
}

/// Connects to the daemon named `name`.
pub fn connect(name: &str) -> io::Result<Stream> {
    endpoint::connect(name)
}

fn answer(service: &Service, request: &Value, stopping: &AtomicBool) -> Value {
    let op = request.get("op").and_then(Value::as_str).unwrap_or("");
    let result: Result<Value, String> = match op {
        "query" => serde_json::from_value::<Query>(request.get("query").cloned().unwrap_or(Value::Null))
            .map_err(|err| format!("invalid query: {err}"))
            .and_then(|query| service.query(&query, None))
            .map(|answer| json!({ "answer": answer })),
        "warm" => {
            let root = request.get("root").and_then(Value::as_str).map(PathBuf::from).unwrap_or_default();
            let languages: Vec<Language> = (request.get("languages").and_then(Value::as_array).into_iter().flatten())
                .filter_map(|it| Language::from_name(it.as_str()?))
                .collect();
            let warmed: Vec<Value> = (service.warm(&root, &languages).into_iter())
                .map(|(language, result)| match result {
                    Ok(servers) => json!({ "language": language, "servers": servers }),
                    Err(error) => json!({ "language": language, "error": error }),
                })
                .collect();
            Ok(json!({ "warmed": warmed }))
        }
        "status" => Ok(json!({ "status": service.status() })),
        "stop" => {
            stopping.store(true, Ordering::Release);
            Ok(json!({}))
        }
        "ping" => Ok(json!({ "pid": std::process::id() })),
        _ => Err(format!("unknown op {op:?}")),
    };
    match result {
        Ok(mut value) => {
            value["ok"] = json!(true);
            value
        }
        Err(error) => json!({ "ok": false, "error": error }),
    }
}

fn serve_connection(stream: Stream, service: &Service, stopping: &AtomicBool, activity: &Mutex<Instant>) -> io::Result<()> {
    let mut writer = stream.try_clone()?;
    let mut reader = BufReader::new(stream);
    let mut line = String::new();
    loop {
        line.clear();
        if reader.read_line(&mut line)? == 0 {
            return Ok(());
        }
        *activity.lock().unwrap_or_else(std::sync::PoisonError::into_inner) = Instant::now();
        let response = match serde_json::from_str::<Value>(line.trim()) {
            Ok(request) => answer(service, &request, stopping),
            Err(err) => json!({ "ok": false, "error": format!("invalid request: {err}") }),
        };
        let mut text = serde_json::to_string(&response).map_err(io::Error::other)?;
        text.push('\n');
        writer.write_all(text.as_bytes())?;
        writer.flush()?;
        *activity.lock().unwrap_or_else(std::sync::PoisonError::into_inner) = Instant::now();
        if stopping.load(Ordering::Acquire) {
            return Ok(());
        }
    }
}

/// Runs the daemon of `root` until `stop` or `Options::daemon_idle` without a request. Returns
/// the exit code: 0 also when another daemon already serves `root`.
pub fn serve(root: &Path, options: Options, warm: bool) -> i32 {
    let name = endpoint_name(root, options.bun.as_deref());
    let mut listener = match endpoint::Listener::bind(&name) {
        Ok(listener) => listener,
        Err(err) if err.kind() == io::ErrorKind::AddrInUse => return 0,
        Err(_) => return 1,
    };
    let daemon_idle = options.daemon_idle;
    let service = Arc::new(Service::new(options));
    let stopping = Arc::new(AtomicBool::new(false));
    let activity = Arc::new(Mutex::new(Instant::now()));
    let connections = Arc::new(AtomicUsize::new(0));
    if warm {
        let (service, root) = (Arc::clone(&service), root.to_path_buf());
        let _ = std::thread::Builder::new().name("lsp-warm".into()).spawn(move || drop(service.warm(&root, &[])));
    }
    {
        let (service, stopping, activity, connections, name) =
            (Arc::clone(&service), Arc::clone(&stopping), Arc::clone(&activity), Arc::clone(&connections), name.clone());
        let _ = std::thread::Builder::new().name("lsp-reaper".into()).spawn(move || {
            loop {
                std::thread::sleep(Duration::from_secs(5).min(daemon_idle));
                service.reap();
                let idle = activity.lock().unwrap_or_else(std::sync::PoisonError::into_inner).elapsed();
                if idle >= daemon_idle && connections.load(Ordering::Acquire) == 0 {
                    stopping.store(true, Ordering::Release);
                }
                if stopping.load(Ordering::Acquire) {
                    // Wakes the accept loop.
                    let _ = connect(&name);
                    return;
                }
            }
        });
    }
    while !stopping.load(Ordering::Acquire) {
        let Ok(stream) = listener.accept() else { continue };
        if stopping.load(Ordering::Acquire) {
            break;
        }
        let (service, stopping, activity, connections, name) =
            (Arc::clone(&service), Arc::clone(&stopping), Arc::clone(&activity), Arc::clone(&connections), name.clone());
        connections.fetch_add(1, Ordering::AcqRel);
        let _ = std::thread::Builder::new().name("lsp-connection".into()).spawn(move || {
            let _ = serve_connection(stream, &service, &stopping, &activity);
            connections.fetch_sub(1, Ordering::AcqRel);
            if stopping.load(Ordering::Acquire) {
                let _ = connect(&name);
            }
        });
    }
    drop(listener);
    service.shutdown();
    0
}
