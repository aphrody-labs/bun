//! Native NGINX process ownership. NGINX retains its configuration and HTTP engine.

pub(crate) mod bindings;

use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::{
    Arc, Mutex, OnceLock,
    atomic::{AtomicBool, AtomicU64, Ordering},
};
use std::time::Duration;

use bun_sys::{Fd, File, O};
use serde::Deserialize;
use serde_json::{Value, json};
use tokio::io::{AsyncRead, AsyncReadExt};
use tokio::process::{Child, Command};
use tokio::runtime::Runtime;

// One VM-free I/O executor. Controllers and completion jobs own only OS processes.
pub(super) fn executor() -> Result<&'static Runtime> {
    static EXECUTOR: OnceLock<std::result::Result<Runtime, String>> = OnceLock::new();
    EXECUTOR
        .get_or_init(|| {
            tokio::runtime::Builder::new_multi_thread()
                .worker_threads(1)
                .thread_name("bun-nginx-io")
                .enable_all()
                .build()
                .map_err(|error| error.to_string())
        })
        .as_ref()
        .map_err(native)
}

const DEFAULT_TIMEOUT_MS: u64 = 10_000;
const MAX_TIMEOUT_MS: u64 = 30_000;
const DEFAULT_OUTPUT_BYTES: usize = 256 << 10;
const MAX_OUTPUT_BYTES: usize = 1 << 20;
const OWNER_FILE: &str = ".bun-nginx-owner";
const PID_FILE: &str = "bun-nginx.pid";

#[derive(Debug)]
pub(super) struct Error {
    pub code: &'static str,
    pub message: String,
}
pub(super) type Result<T> = std::result::Result<T, Error>;
fn fail(code: &'static str, message: impl Into<String>) -> Error {
    Error {
        code,
        message: message.into(),
    }
}
fn native(error: impl std::fmt::Display) -> Error {
    fail("ERR_NGINX_NATIVE", error.to_string())
}
fn invalid(message: impl Into<String>) -> Error {
    fail("ERR_INVALID_ARG_VALUE", message)
}

#[derive(Default)]
pub(super) struct Cancel {
    pub flag: AtomicBool,
    pub event: tokio::sync::Notify,
}

#[derive(Clone, Deserialize)]
#[serde(default, rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct ProviderOptions {
    pub binary: String,
    pub binary_arguments: Vec<String>,
    pub timeout_ms: u64,
    pub max_output_bytes: usize,
}
impl Default for ProviderOptions {
    fn default() -> Self {
        Self {
            binary: "nginx".into(),
            binary_arguments: Vec::new(),
            timeout_ms: DEFAULT_TIMEOUT_MS,
            max_output_bytes: DEFAULT_OUTPUT_BYTES,
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Options {
    pub prefix: String,
    pub config_file: String,
    #[serde(default = "default_binary")]
    pub binary: String,
    #[serde(default)]
    pub binary_arguments: Vec<String>,
    #[serde(default = "default_timeout")]
    pub timeout_ms: u64,
    #[serde(default = "default_output")]
    pub max_output_bytes: usize,
}
fn default_binary() -> String {
    "nginx".into()
}
fn default_timeout() -> u64 {
    DEFAULT_TIMEOUT_MS
}
fn default_output() -> usize {
    DEFAULT_OUTPUT_BYTES
}

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct OperationOptions {
    pub timeout_ms: Option<u64>,
}

fn checked_text(value: &str, label: &str) -> Result<()> {
    if value.is_empty() || value.len() > 4096 || value.contains(['\0', '\r', '\n']) {
        return Err(invalid(format!(
            "{label} must be a non-empty path without NUL or line breaks, at most 4096 UTF-8 bytes"
        )));
    }
    Ok(())
}
fn timeout(value: u64) -> Result<Duration> {
    if !(1..=MAX_TIMEOUT_MS).contains(&value) {
        return Err(invalid(format!(
            "timeoutMs must be an integer between 1 and {MAX_TIMEOUT_MS}"
        )));
    }
    Ok(Duration::from_millis(value))
}
impl ProviderOptions {
    pub(super) fn check(&self) -> Result<()> {
        checked_text(&self.binary, "binary")?;
        timeout(self.timeout_ms)?;
        if !(1..=MAX_OUTPUT_BYTES).contains(&self.max_output_bytes) {
            return Err(invalid(format!(
                "maxOutputBytes must be an integer between 1 and {MAX_OUTPUT_BYTES}"
            )));
        }
        if self.binary_arguments.len() > 16 {
            return Err(invalid("binaryArguments must contain at most 16 arguments"));
        }
        for argument in &self.binary_arguments {
            checked_text(argument, "binaryArguments item")?;
        }
        Ok(())
    }
    fn command(&self) -> Command {
        let mut command = Command::new(&self.binary);
        command
            .args(&self.binary_arguments)
            .kill_on_drop(true)
            .stdin(Stdio::null());
        #[cfg(windows)]
        command.creation_flags(bun_no_window::creation_flags());
        #[cfg(unix)]
        command.process_group(0);
        command
    }
}

fn canonical(path: &Path) -> Result<PathBuf> {
    let text = path
        .to_str()
        .ok_or_else(|| invalid("NGINX paths must be valid UTF-8"))?;
    checked_text(text, "path")?;
    let mut terminated = text.as_bytes().to_vec();
    terminated.push(0);
    let mut buffer = bun_core::PathBuffer::ZEROED;
    let resolved = bun_sys::realpath(
        bun_core::ZStr::from_slice_with_nul(&terminated),
        &mut buffer,
    )
    .map_err(native)?;
    Ok(PathBuf::from(
        String::from_utf8(resolved.to_vec()).map_err(native)?,
    ))
}
fn path_bytes(path: &Path) -> Result<&[u8]> {
    Ok(path
        .to_str()
        .ok_or_else(|| invalid("NGINX paths must be valid UTF-8"))?
        .as_bytes())
}
fn quote_path(path: &Path) -> Result<String> {
    let text = path
        .to_str()
        .ok_or_else(|| invalid("NGINX paths must be valid UTF-8"))?;
    checked_text(text, "pid path")?;
    // NGINX config paths on Windows use forward slashes; escape config interpolation.
    Ok(format!(
        "\"{}\"",
        text.replace('\\', "/")
            .replace('"', "\\\"")
            .replace('$', "\\$")
    ))
}
fn read_small(path: &Path, capacity: usize) -> Result<Vec<u8>> {
    let file =
        File::openat(Fd::cwd(), path_bytes(path)?, O::RDONLY | O::NOFOLLOW, 0).map_err(native)?;
    let mut bytes = vec![0; capacity + 1];
    let count = file.read_all(&mut bytes).map_err(native)?;
    if count > capacity {
        return Err(fail(
            "ERR_NGINX_OWNER",
            "NGINX ownership file exceeds its bound",
        ));
    }
    bytes.truncate(count);
    Ok(bytes)
}

struct ProcessTree {
    active: AtomicBool,
    #[cfg(windows)]
    job: u32,
    #[cfg(unix)]
    pid: i32,
}
impl ProcessTree {
    fn attach(child: &Child) -> Result<Self> {
        let pid = child
            .id()
            .ok_or_else(|| native("NGINX child exited before ownership was attached"))?;
        #[cfg(windows)]
        {
            use crate::windows::sys::jobs;
            let job = jobs::create(None)
                .map_err(|error| native(format!("Create NGINX job: {error:?}")))?;
            let result = jobs::set_limits(
                job,
                &jobs::Limits {
                    kill_on_close: true,
                    process_memory: None,
                    job_memory: None,
                    active_processes: None,
                    cpu_rate: None,
                },
            )
            .and_then(|_| jobs::assign(job, pid));
            if let Err(error) = result {
                jobs::close(job);
                return Err(native(format!("Assign NGINX job: {error:?}")));
            }
            Ok(Self {
                job,
                active: AtomicBool::new(true),
            })
        }
        #[cfg(unix)]
        {
            Ok(Self {
                pid: i32::try_from(pid).map_err(native)?,
                active: AtomicBool::new(true),
            })
        }
    }
    fn terminate(&self) -> Result<()> {
        if !self.active.swap(false, Ordering::AcqRel) {
            return Ok(());
        }
        #[cfg(windows)]
        {
            crate::windows::sys::jobs::terminate(self.job, 1)
                .map_err(|error| native(format!("Terminate owned NGINX job: {error:?}")))
        }
        #[cfg(unix)]
        {
            match bun_sys::kill_process_group(self.pid) {
                Err(error) if error.get_errno() == bun_sys::E::ESRCH => Ok(()),
                result => result.map_err(native),
            }
        }
    }
}
impl Drop for ProcessTree {
    fn drop(&mut self) {
        if self.active.load(Ordering::Acquire) {
            let _ = self.terminate();
        }
        #[cfg(windows)]
        crate::windows::sys::jobs::close(self.job);
    }
}
pub(super) struct Running {
    child: Mutex<Option<Child>>,
    tree: ProcessTree,
    pid: u32,
    pid_file: PathBuf,
    exit: Mutex<Option<std::result::Result<std::process::ExitStatus, String>>>,
    exited: tokio::sync::Notify,
    monitoring: AtomicBool,
}
impl Running {
    pub(super) fn terminate(&self) -> Result<()> {
        self.tree.terminate()
    }
    fn take_child(&self) -> Option<Child> {
        self.child
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .take()
    }
    fn finish(&self, result: std::io::Result<std::process::ExitStatus>) {
        // A dead master can leave workers behind. Stop its owned group before unref.
        let _ = self.terminate();
        let _ = remove_owned_pid(&self.pid_file, self.pid);
        *self.exit.lock().unwrap_or_else(|error| error.into_inner()) =
            Some(result.map_err(|error| error.to_string()));
        self.exited.notify_waiters();
    }
    fn exit_code(&self) -> Result<Option<Option<i32>>> {
        self.exit
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .as_ref()
            .map(|result| result.as_ref().map(|status| status.code()).map_err(native))
            .transpose()
    }
    async fn wait(&self) -> Result<Option<i32>> {
        loop {
            let notified = self.exited.notified();
            // Register before checking state, so a completed child cannot lose its wakeup.
            tokio::pin!(notified);
            notified.as_mut().enable();
            if let Some(code) = self.exit_code()? {
                return Ok(code);
            }
            notified.await;
        }
    }
    pub(super) async fn monitor(self: Arc<Self>, cancel: Arc<Cancel>) {
        if let Some(mut child) = self.take_child() {
            let result = tokio::select! {
                biased;
                _ = async {
                    if !cancel.flag.load(Ordering::Acquire) { cancel.event.notified().await; }
                } => {
                    let _ = self.terminate();
                    let _ = child.start_kill();
                    tokio::time::timeout(Duration::from_secs(1), child.wait()).await
                        .unwrap_or_else(|_| Err(std::io::Error::new(std::io::ErrorKind::TimedOut, "Owned NGINX child did not exit after VM cancellation")))
                },
                result = child.wait() => result,
            };
            self.finish(result);
        }
    }
    pub(super) fn reap_unmonitored(self: &Arc<Self>) {
        if let Some(mut child) = self.take_child() {
            let running = self.clone();
            // SAFETY: cleanup after cancellation before monitor startup contains no VM state.
            if let Ok(runtime) = executor() {
                runtime.spawn(async move {
                    running.finish(child.wait().await);
                });
            }
        }
    }
}

struct Ownership {
    path: PathBuf,
    file: File,
    contents: Vec<u8>,
}
impl Ownership {
    fn check(&self) -> Result<()> {
        let held = self.file.stat().map_err(native)?;
        let current = File::openat(
            Fd::cwd(),
            path_bytes(&self.path)?,
            O::RDONLY | O::NOFOLLOW,
            0,
        )
        .map_err(|_| {
            fail(
                "ERR_NGINX_OWNER",
                "NGINX prefix ownership file is missing or redirected",
            )
        })?;
        let stat = current.stat().map_err(native)?;
        if held.st_dev != stat.st_dev
            || held.st_ino != stat.st_ino
            || read_small(&self.path, 4096)? != self.contents
        {
            return Err(fail(
                "ERR_NGINX_OWNER",
                "NGINX prefix ownership changed; refusing to signal a process",
            ));
        }
        Ok(())
    }
    fn release(self) -> Result<()> {
        self.check()?;
        let path = self.path.clone();
        self.file.close().map_err(native)?;
        let bytes = path_bytes(&path)?;
        let mut terminated = bytes.to_vec();
        terminated.push(0);
        bun_sys::unlink(bun_core::ZStr::from_slice_with_nul(&terminated)).map_err(native)
    }
}

struct ValidationPid(Option<Ownership>);
impl ValidationPid {
    fn claim(prefix: &Path) -> Result<Self> {
        static NEXT_ID: AtomicU64 = AtomicU64::new(1);
        let path = prefix.join(format!(
            ".bun-nginx-validate-{}-{}.pid",
            std::process::id(),
            NEXT_ID.fetch_add(1, Ordering::Relaxed)
        ));
        let file = File::openat(
            Fd::cwd(),
            path_bytes(&path)?,
            O::RDWR | O::CREAT | O::EXCL | O::NOFOLLOW,
            0o600,
        )
        .map_err(native)?;
        Ok(Self(Some(Ownership {
            path,
            file,
            contents: Vec::new(),
        })))
    }
    fn path(&self) -> &Path {
        &self.0.as_ref().expect("live validation PID owner").path
    }
    fn release(mut self) -> Result<()> {
        self.0.take().expect("live validation PID owner").release()
    }
}
impl Drop for ValidationPid {
    fn drop(&mut self) {
        if let Some(owner) = self.0.take() {
            let _ = owner.release();
        }
    }
}

pub(super) struct Controller {
    pub runtime: &'static Runtime,
    provider: ProviderOptions,
    prefix: PathBuf,
    config: PathBuf,
    pid_file: PathBuf,
    ownership: Option<Ownership>,
    running: Option<Arc<Running>>,
    closed: bool,
    last_exit_code: Option<i32>,
}
impl Controller {
    pub(super) fn new(options: Options, runtime: &'static Runtime) -> Result<Self> {
        let provider = ProviderOptions {
            binary: options.binary,
            binary_arguments: options.binary_arguments,
            timeout_ms: options.timeout_ms,
            max_output_bytes: options.max_output_bytes,
        };
        provider.check()?;
        checked_text(&options.prefix, "prefix")?;
        checked_text(&options.config_file, "configFile")?;
        let prefix = canonical(Path::new(&options.prefix))?;
        let config = canonical(&prefix.join(&options.config_file))?;
        if config == prefix || !config.starts_with(&prefix) {
            return Err(invalid(
                "configFile must resolve to a file inside the owned NGINX prefix",
            ));
        }
        let pid_file = prefix.join(PID_FILE);
        match File::openat(
            Fd::cwd(),
            path_bytes(&pid_file)?,
            O::RDONLY | O::NOFOLLOW,
            0,
        ) {
            Ok(_) => {
                return Err(fail(
                    "ERR_NGINX_OWNER",
                    "NGINX prefix already contains bun-nginx.pid; refusing to adopt an existing process",
                ));
            }
            Err(error) if error.get_errno() == bun_sys::E::ENOENT => {}
            Err(error) => {
                return Err(fail(
                    "ERR_NGINX_OWNER",
                    format!("Cannot inspect owned NGINX pid path: {error}"),
                ));
            }
        }
        let path = prefix.join(OWNER_FILE);
        let file = File::openat(
            Fd::cwd(),
            path_bytes(&path)?,
            O::RDWR | O::CREAT | O::EXCL | O::NOFOLLOW,
            0o600,
        )
        .map_err(|error| {
            fail(
                "ERR_NGINX_OWNER",
                format!("Cannot claim NGINX prefix '{}': {error}", prefix.display()),
            )
        })?;
        let contents = serde_json::to_vec(&json!({"bunPID":std::process::id()})).map_err(native)?;
        if let Err(error) = file.write_all(&contents) {
            drop(file);
            let mut bytes = path_bytes(&path)?.to_vec();
            bytes.push(0);
            let _ = bun_sys::unlink(bun_core::ZStr::from_slice_with_nul(&bytes));
            return Err(native(error));
        }
        Ok(Self {
            runtime,
            provider,
            prefix,
            config,
            pid_file,
            ownership: Some(Ownership {
                path,
                file,
                contents,
            }),
            running: None,
            closed: false,
            last_exit_code: None,
        })
    }
    fn check_scope(&self) -> Result<()> {
        if self.closed {
            return Err(fail("ERR_INVALID_STATE", "NGINX controller is closed"));
        }
        self.ownership
            .as_ref()
            .ok_or_else(|| fail("ERR_NGINX_OWNER", "NGINX prefix is not owned"))?
            .check()?;
        if canonical(&self.prefix)? != self.prefix
            || canonical(&self.config)? != self.config
            || !self.config.starts_with(&self.prefix)
        {
            return Err(fail(
                "ERR_NGINX_OWNER",
                "NGINX prefix or configuration was redirected",
            ));
        }
        Ok(())
    }
    fn command(&self) -> Result<Command> {
        self.command_with_pid(&self.pid_file)
    }
    fn command_with_pid(&self, pid: &Path) -> Result<Command> {
        self.check_scope()?;
        let mut command = self.provider.command();
        command
            .current_dir(&self.prefix)
            .arg("-p")
            .arg(&self.prefix)
            .arg("-c")
            .arg(&self.config)
            .arg("-e")
            .arg("stderr")
            .arg("-g")
            .arg(format!("daemon off; pid {};", quote_path(pid)?));
        Ok(command)
    }
    fn verify_pid(&self) -> Result<()> {
        let running = self.running.as_ref().ok_or_else(|| {
            fail(
                "ERR_INVALID_STATE",
                "NGINX has not been started by this controller",
            )
        })?;
        let bytes = read_small(&self.pid_file, 32).map_err(|_| {
            fail(
                "ERR_NGINX_OWNER",
                "Owned NGINX pid file is missing or redirected",
            )
        })?;
        let pid = std::str::from_utf8(&bytes)
            .ok()
            .and_then(|text| text.trim().parse::<u32>().ok());
        if pid != Some(running.pid) {
            return Err(fail(
                "ERR_NGINX_OWNER",
                "NGINX pid file does not match the owned child; refusing to signal a process",
            ));
        }
        Ok(())
    }
    fn refresh(&mut self) -> Result<()> {
        if let Some(running) = &self.running {
            {
                let mut child = running
                    .child
                    .lock()
                    .unwrap_or_else(|error| error.into_inner());
                if let Some(child) = child.as_mut() {
                    if let Some(status) = child.try_wait().map_err(native)? {
                        running.finish(Ok(status));
                    }
                }
            }
            if let Some(code) = running.exit_code()? {
                self.last_exit_code = code;
                self.running.take();
            }
        }
        Ok(())
    }
    pub(super) fn take_monitor(&self) -> Option<Arc<Running>> {
        let running = self.running.as_ref()?;
        (!running.monitoring.swap(true, Ordering::AcqRel)).then(|| running.clone())
    }
    fn status(&mut self) -> Result<Value> {
        self.refresh()?;
        Ok(
            json!({"running":self.running.is_some(),"pid":self.running.as_ref().map(|item|item.pid),"prefix":self.prefix,"configFile":self.config,"pidFile":self.pid_file,"closed":self.closed,"lastExitCode":self.last_exit_code}),
        )
    }
    async fn validate(&self) -> Result<Value> {
        // NGINX -t creates an empty PID file; it must never touch the master's PID.
        let pid = ValidationPid::claim(&self.prefix)?;
        let mut command = self.command_with_pid(pid.path())?;
        command.arg("-t");
        let output = capture(command, self.provider.max_output_bytes).await?;
        pid.release()?;
        if !output.success {
            return Err(fail("ERR_NGINX_CONFIG", output.stderr));
        }
        Ok(
            json!({"valid":true,"exitCode":output.exit_code,"stdout":output.stdout,"stderr":output.stderr}),
        )
    }
    async fn start(&mut self) -> Result<Value> {
        self.refresh()?;
        if self.running.is_some() {
            return Err(fail("ERR_INVALID_STATE", "NGINX is already running"));
        }
        self.validate().await?;
        let mut command = self.command()?;
        command.stdout(Stdio::null()).stderr(Stdio::null());
        let child = command.spawn().map_err(spawn_error)?;
        let pid = child
            .id()
            .ok_or_else(|| native("NGINX child exited before startup"))?;
        let tree = ProcessTree::attach(&child)?;
        self.running = Some(Arc::new(Running {
            child: Mutex::new(Some(child)),
            tree,
            pid,
            pid_file: self.pid_file.clone(),
            exit: Mutex::new(None),
            exited: tokio::sync::Notify::new(),
            monitoring: AtomicBool::new(false),
        }));
        self.last_exit_code = None;
        let mut ready = tokio::time::interval(Duration::from_millis(10));
        loop {
            ready.tick().await;
            self.refresh()?;
            if self.running.is_none() {
                return Err(native(format!(
                    "NGINX exited during startup with code {:?}",
                    self.last_exit_code
                )));
            }
            if File::openat(
                Fd::cwd(),
                path_bytes(&self.pid_file)?,
                O::RDONLY | O::NOFOLLOW,
                0,
            )
            .is_ok()
            {
                // A real master opens/truncates its PID before writing its identity.
                if read_small(&self.pid_file, 32)?.is_empty() {
                    continue;
                }
                self.verify_pid()?;
                return self.status();
            }
        }
    }
    async fn signal(&mut self, signal: &str) -> Result<Value> {
        self.refresh()?;
        self.verify_pid()?;
        let mut command = self.command()?;
        command.arg("-s").arg(signal);
        let output = capture(command, self.provider.max_output_bytes).await?;
        if !output.success {
            return Err(native(format!("NGINX {signal} failed: {}", output.stderr)));
        }
        if signal == "quit" {
            if let Some(running) = &self.running {
                self.last_exit_code = running.wait().await?;
            }
            self.running.take();
        }
        self.status()
    }
    async fn force_owned_stop(&mut self) -> Result<()> {
        if let Some(running) = self.running.take() {
            running.terminate()?;
            if let Some(mut child) = running.take_child() {
                let result = tokio::time::timeout(Duration::from_secs(1), child.wait())
                    .await
                    .unwrap_or_else(|_| {
                        Err(std::io::Error::new(
                            std::io::ErrorKind::TimedOut,
                            "Owned NGINX child did not exit after termination",
                        ))
                    });
                running.finish(result);
            }
            self.last_exit_code = tokio::time::timeout(Duration::from_secs(1), running.wait())
                .await
                .map_err(|_| {
                    fail(
                        "ERR_NGINX_TIMEOUT",
                        "Owned NGINX process did not exit after termination",
                    )
                })??;
            remove_owned_pid(&self.pid_file, running.pid)?;
        }
        Ok(())
    }
    pub(super) async fn execute(
        &mut self,
        action: &str,
        options: OperationOptions,
        cancel: Arc<Cancel>,
    ) -> Result<Value> {
        let deadline = timeout(options.timeout_ms.unwrap_or(self.provider.timeout_ms))?;
        if cancel.flag.load(Ordering::Acquire) {
            return Err(fail("ABORT_ERR", "NGINX operation aborted"));
        }
        if self.closed {
            return match action {
                "close" => Ok(json!({"closed":true,"forced":false})),
                "status" => self.status(),
                _ => Err(fail("ERR_INVALID_STATE", "NGINX controller is closed")),
            };
        }
        self.check_scope()?;
        let operation = async {
            match action {
                "info" => probe(&self.provider).await,
                "validate" => self.validate().await,
                "start" => self.start().await,
                "reload" => {
                    self.validate().await?;
                    self.signal("reload").await
                }
                "quit" => self.signal("quit").await,
                "status" => self.status(),
                "close" => {
                    self.refresh()?;
                    if self.running.is_some() {
                        self.signal("quit").await?;
                    }
                    Ok(json!({"closed":true,"forced":false}))
                }
                _ => Err(invalid("Unknown NGINX operation")),
            }
        };
        let mut result = tokio::select! {
            biased;
            _ = cancel.event.notified() => Err(fail("ABORT_ERR", "NGINX operation aborted")),
            result = tokio::time::timeout(deadline, operation) => result.unwrap_or_else(|_| Err(fail("ERR_NGINX_TIMEOUT", "NGINX operation deadline exceeded"))),
        };
        if result.is_err() && (action == "start" || action == "close") {
            self.force_owned_stop().await?;
        }
        if action == "close"
            && (result.is_ok()
                || result
                    .as_ref()
                    .is_err_and(|error| error.code == "ERR_NGINX_TIMEOUT"))
        {
            self.ownership
                .take()
                .ok_or_else(|| fail("ERR_NGINX_OWNER", "NGINX prefix owner already released"))?
                .release()?;
            self.closed = true;
            result = Ok(json!({"closed":true,"forced":result.is_err()}));
        }
        result
    }
}
impl Drop for Controller {
    fn drop(&mut self) {
        if let Some(running) = self.running.take() {
            // GC/VM shutdown must kill synchronously, before a loop keep-alive is released.
            let _ = running.terminate();
            running.reap_unmonitored();
        }
        if let Some(ownership) = self.ownership.take() {
            let _ = ownership.release();
        }
    }
}

fn remove_owned_pid(path: &Path, expected: u32) -> Result<()> {
    let file = match File::openat(Fd::cwd(), path_bytes(path)?, O::RDONLY | O::NOFOLLOW, 0) {
        Ok(file) => file,
        Err(error) if error.get_errno() == bun_sys::E::ENOENT => return Ok(()),
        Err(error) => return Err(native(error)),
    };
    let mut buffer = [0; 33];
    let size = file.read_all(&mut buffer).map_err(native)?;
    let actual = std::str::from_utf8(&buffer[..size])
        .ok()
        .and_then(|text| text.trim().parse::<u32>().ok());
    if actual != Some(expected) {
        return Err(fail(
            "ERR_NGINX_OWNER",
            "NGINX pid file changed; refusing to remove it",
        ));
    }
    drop(file);
    let mut bytes = path_bytes(path)?.to_vec();
    bytes.push(0);
    bun_sys::unlink(bun_core::ZStr::from_slice_with_nul(&bytes)).map_err(native)
}

struct Output {
    stdout: String,
    stderr: String,
    success: bool,
    exit_code: Option<i32>,
}
fn spawn_error(error: std::io::Error) -> Error {
    if error.kind() == std::io::ErrorKind::NotFound {
        fail(
            "ERR_NGINX_PROVIDER_UNAVAILABLE",
            "NGINX executable is unavailable; select an installed native binary",
        )
    } else {
        native(error)
    }
}
async fn drain(mut input: impl AsyncRead + Unpin, limit: usize) -> Result<String> {
    let mut bytes = Vec::new();
    let mut buffer = [0; 4096];
    loop {
        let count = input.read(&mut buffer).await.map_err(native)?;
        if count == 0 {
            return Ok(String::from_utf8_lossy(&bytes).into_owned());
        }
        if count > limit.saturating_sub(bytes.len()) {
            return Err(fail(
                "ERR_NGINX_OUTPUT_LIMIT",
                "NGINX diagnostic output exceeded maxOutputBytes",
            ));
        }
        bytes.extend_from_slice(&buffer[..count]);
    }
}
async fn capture(mut command: Command, limit: usize) -> Result<Output> {
    command.stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = command.spawn().map_err(spawn_error)?;
    let tree = ProcessTree::attach(&child)?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| native("NGINX stdout was not captured"))?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| native("NGINX stderr was not captured"))?;
    let result = tokio::try_join!(drain(stdout, limit), drain(stderr, limit), async {
        child.wait().await.map_err(native)
    });
    match result {
        Ok((stdout, stderr, status)) => {
            tree.active.store(false, Ordering::Release);
            Ok(Output {
                stdout,
                stderr,
                success: status.success(),
                exit_code: status.code(),
            })
        }
        Err(error) => {
            let _ = tree.terminate();
            let _ = child.start_kill();
            let _ = tokio::time::timeout(Duration::from_secs(1), child.wait()).await;
            Err(error)
        }
    }
}

pub(super) async fn probe(options: &ProviderOptions) -> Result<Value> {
    options.check()?;
    let mut command = options.command();
    command.arg("-V");
    let output = match capture(command, options.max_output_bytes).await {
        Err(error) if error.code == "ERR_NGINX_PROVIDER_UNAVAILABLE" => {
            return Ok(
                json!({"available":false,"code":error.code,"message":error.message,"binary":options.binary,"platform":std::env::consts::OS,"arch":std::env::consts::ARCH}),
            );
        }
        result => result?,
    };
    if !output.success {
        return Err(native(format!("NGINX -V failed: {}", output.stderr)));
    }
    let text = format!("{}\n{}", output.stdout, output.stderr);
    let version = text
        .lines()
        .find_map(|line| line.strip_prefix("nginx version: nginx/"))
        .ok_or_else(|| native("Executable did not identify itself as NGINX"))?;
    let arguments = text
        .lines()
        .find_map(|line| line.strip_prefix("configure arguments: "))
        .unwrap_or("");
    let windows = cfg!(windows);
    let enabled = |flag: &str| {
        arguments
            .split_whitespace()
            .any(|argument| argument == flag)
    };
    Ok(
        json!({"available":true,"binary":options.binary,"version":version,"configureArguments":arguments,"platform":std::env::consts::OS,"arch":std::env::consts::ARCH,
        "capabilities":{"http":!enabled("--without-http"),"httpTLS":enabled("--with-http_ssl_module"),"http2":enabled("--with-http_v2_module"),"http3":!windows&&enabled("--with-http_v3_module"),"stream":enabled("--with-stream")||enabled("--with-stream=dynamic"),"mail":enabled("--with-mail")||enabled("--with-mail=dynamic"),"udp":!windows&&(enabled("--with-stream")||enabled("--with-stream=dynamic")),"threads":enabled("--with-threads"),"dynamicModuleCompatibility":enabled("--with-compat"),"windowsBeta":windows,"effectiveWorkersMaximum":if windows {Some(1)} else {None::<u32>}},
        "qualification":"native executable -V only; protocol behavior requires separate gates"}),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn limits_are_finite_integer_bounds() {
        assert!(ProviderOptions::default().check().is_ok());
        for timeout_ms in [0, MAX_TIMEOUT_MS + 1] {
            assert!(
                ProviderOptions {
                    timeout_ms,
                    ..Default::default()
                }
                .check()
                .is_err()
            );
        }
        for max_output_bytes in [0, MAX_OUTPUT_BYTES + 1] {
            assert!(
                ProviderOptions {
                    max_output_bytes,
                    ..Default::default()
                }
                .check()
                .is_err()
            );
        }
        assert!(serde_json::from_str::<ProviderOptions>(r#"{"timeoutMs":1.5}"#).is_err());
        assert!(
            serde_json::from_str::<ProviderOptions>(r#"{"binary":"nginx","surprise":true}"#)
                .is_err()
        );
    }
    #[test]
    fn nginx_pid_paths_escape_interpolation() {
        assert_eq!(
            quote_path(Path::new("C:\\owned $scope\\a\"b.pid")).unwrap(),
            "\"C:/owned \\$scope/a\\\"b.pid\""
        );
        assert!(checked_text("bad\npath", "path").is_err());
        assert!(checked_text("bad\0path", "path").is_err());
    }
}
