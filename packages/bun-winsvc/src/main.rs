//! `bun-winsvc install --name N [--display D] [--log FILE] -- <exe> [args]` registers a service whose binary is this file;
//! the service runs `<exe> [args]` in a job object (the whole tree dies with the service), restarts it with a growing
//! delay when it exits, and stops it on SC stop/shutdown. `run` is the service entry, `console` runs in the foreground.
use std::ffi::OsString;
use std::fs::OpenOptions;
use std::os::windows::io::AsRawHandle;
use std::os::windows::process::CommandExt;
use std::process::{Child, Command, Stdio};
use std::sync::mpsc::{self, RecvTimeoutError};
use std::time::{Duration, Instant};
use windows_service::service::{
    ServiceAccess, ServiceControl, ServiceControlAccept, ServiceErrorControl, ServiceExitCode, ServiceInfo,
    ServiceStartType, ServiceState, ServiceStatus, ServiceType,
};
use windows_service::service_control_handler::{self, ServiceControlHandlerResult};
use windows_service::service_manager::{ServiceManager, ServiceManagerAccess};
use windows_service::{define_windows_service, service_dispatcher};
use windows_sys::Win32::Foundation::HANDLE;
use windows_sys::Win32::System::JobObjects::{
    AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation, SetInformationJobObject,
    JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
};

const DEFAULT_NAME: &str = "AphrodyBun";
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

struct Spec {
    name: String,
    log: Option<String>,
    cmd: Vec<OsString>,
}

fn parse(args: &[OsString]) -> Result<(Spec, Option<String>), String> {
    let mut name = DEFAULT_NAME.to_string();
    let (mut display, mut log) = (None, None);
    let mut i = 0;
    while i < args.len() {
        let a = args[i].to_string_lossy().into_owned();
        if a == "--" {
            i += 1;
            break;
        }
        if !matches!(a.as_str(), "--name" | "--display" | "--log") {
            return Err(format!("unknown option {a}"));
        }
        let v = args.get(i + 1).ok_or(format!("{a} needs a value"))?.to_string_lossy().into_owned();
        match a.as_str() {
            "--name" => name = v,
            "--display" => display = Some(v),
            _ => log = Some(v),
        }
        i += 2;
    }
    let cmd = args[i..].to_vec();
    if cmd.is_empty() {
        return Err("missing command after --".into());
    }
    Ok((Spec { name, log, cmd }, display))
}

struct Job(HANDLE);

impl Job {
    fn new() -> Job {
        // SAFETY: plain Win32 calls on a handle owned by this value; the info struct is zero-initialised POD.
        unsafe {
            let h = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            SetInformationJobObject(
                h,
                JobObjectExtendedLimitInformation,
                &info as *const _ as *const _,
                std::mem::size_of_val(&info) as u32,
            );
            Job(h)
        }
    }

    fn assign(&self, child: &Child) {
        // SAFETY: both handles are valid for the duration of the call.
        unsafe { AssignProcessToJobObject(self.0, child.as_raw_handle() as HANDLE) };
    }
}

fn spawn(spec: &Spec) -> std::io::Result<Child> {
    let mut c = Command::new(&spec.cmd[0]);
    c.args(&spec.cmd[1..]).stdin(Stdio::null()).creation_flags(CREATE_NO_WINDOW);
    if let Some(log) = &spec.log {
        let f = OpenOptions::new().create(true).append(true).open(log)?;
        c.stdout(f.try_clone()?).stderr(f);
    }
    c.spawn()
}

/// Runs the command until `stop` fires or its sender is dropped, restarting it with a growing delay.
fn supervise(spec: &Spec, stop: mpsc::Receiver<()>) {
    let job = Job::new();
    let mut delay = Duration::from_secs(1);
    loop {
        let started = Instant::now();
        if let Ok(mut child) = spawn(spec) {
            job.assign(&child);
            loop {
                match stop.recv_timeout(Duration::from_millis(500)) {
                    Err(RecvTimeoutError::Timeout) => {
                        if matches!(child.try_wait(), Ok(Some(_))) {
                            break;
                        }
                    }
                    _ => {
                        let _ = child.kill();
                        let _ = child.wait();
                        return;
                    }
                }
            }
        }
        delay = if started.elapsed() > Duration::from_secs(60) {
            Duration::from_secs(1)
        } else {
            (delay * 2).min(Duration::from_secs(30))
        };
        if !matches!(stop.recv_timeout(delay), Err(RecvTimeoutError::Timeout)) {
            return;
        }
    }
}

define_windows_service!(ffi_service_main, service_main);

fn service_main(args: Vec<OsString>) {
    let _ = run_service(args);
}

fn run_service(_: Vec<OsString>) -> windows_service::Result<()> {
    let argv: Vec<OsString> = std::env::args_os().skip(2).collect();
    let Ok((spec, _)) = parse(&argv) else { return Err(windows_service::Error::LaunchArgumentsNotSupported) };
    let (tx, rx) = mpsc::channel();
    let handle = service_control_handler::register(spec.name.clone(), move |ev| match ev {
        ServiceControl::Stop | ServiceControl::Shutdown => {
            let _ = tx.send(());
            ServiceControlHandlerResult::NoError
        }
        ServiceControl::Interrogate => ServiceControlHandlerResult::NoError,
        _ => ServiceControlHandlerResult::NotImplemented,
    })?;
    let status = |state, accept| ServiceStatus {
        service_type: ServiceType::OWN_PROCESS,
        current_state: state,
        controls_accepted: accept,
        exit_code: ServiceExitCode::Win32(0),
        checkpoint: 0,
        wait_hint: Duration::from_secs(10),
        process_id: None,
    };
    handle.set_service_status(status(
        ServiceState::Running,
        ServiceControlAccept::STOP | ServiceControlAccept::SHUTDOWN,
    ))?;
    supervise(&spec, rx);
    handle.set_service_status(status(ServiceState::Stopped, ServiceControlAccept::empty()))
}

fn install(spec: &Spec, display: Option<String>) -> windows_service::Result<()> {
    let manager = ServiceManager::local_computer(None::<&str>, ServiceManagerAccess::CREATE_SERVICE)?;
    let mut launch: Vec<OsString> = vec!["run".into(), "--name".into(), spec.name.clone().into()];
    if let Some(l) = &spec.log {
        launch.extend(["--log".into(), l.into()]);
    }
    launch.push("--".into());
    launch.extend(spec.cmd.iter().cloned());
    let info = ServiceInfo {
        name: spec.name.clone().into(),
        display_name: display.unwrap_or_else(|| spec.name.clone()).into(),
        service_type: ServiceType::OWN_PROCESS,
        start_type: ServiceStartType::AutoStart,
        error_control: ServiceErrorControl::Normal,
        executable_path: std::env::current_exe().expect("current_exe"),
        launch_arguments: launch,
        dependencies: vec![],
        account_name: None,
        account_password: None,
    };
    let svc = manager.create_service(&info, ServiceAccess::CHANGE_CONFIG | ServiceAccess::START)?;
    svc.set_description("Bun (aphrody-labs fork) run as a Windows service by bun-winsvc")?;
    svc.start::<&str>(&[])
}

fn uninstall(name: &str) -> windows_service::Result<()> {
    let manager = ServiceManager::local_computer(None::<&str>, ServiceManagerAccess::CONNECT)?;
    let svc = manager.open_service(name, ServiceAccess::STOP | ServiceAccess::DELETE | ServiceAccess::QUERY_STATUS)?;
    if svc.query_status()?.current_state != ServiceState::Stopped {
        let _ = svc.stop();
        let t = Instant::now();
        while svc.query_status()?.current_state != ServiceState::Stopped && t.elapsed() < Duration::from_secs(15) {
            std::thread::sleep(Duration::from_millis(300));
        }
    }
    svc.delete()
}

fn fail(m: String) -> ! {
    eprintln!("bun-winsvc: {m}");
    std::process::exit(1)
}

fn main() {
    let args: Vec<OsString> = std::env::args_os().collect();
    let verb = args.get(1).map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
    let rest = args.get(2..).unwrap_or(&[]);
    match verb.as_str() {
        "run" => {
            let (spec, _) = parse(rest).unwrap_or_else(|e| fail(e));
            if let Err(e) = service_dispatcher::start(spec.name.clone(), ffi_service_main) {
                fail(format!("service dispatcher: {e} (use `console` to run in the foreground)"));
            }
        }
        "console" => {
            let (spec, _) = parse(rest).unwrap_or_else(|e| fail(e));
            let (_keep, rx) = mpsc::channel::<()>();
            supervise(&spec, rx);
        }
        "install" => {
            let (spec, display) = parse(rest).unwrap_or_else(|e| fail(e));
            install(&spec, display).unwrap_or_else(|e| fail(format!("install: {e}")));
            println!("service {} installed and started", spec.name);
        }
        "uninstall" => {
            let name = rest.first().map(|s| s.to_string_lossy().into_owned()).unwrap_or(DEFAULT_NAME.into());
            uninstall(&name).unwrap_or_else(|e| fail(format!("uninstall: {e}")));
            println!("service {name} removed");
        }
        _ => fail("usage: bun-winsvc install|uninstall|run|console --name N [--display D] [--log FILE] -- <exe> [args]".into()),
    }
}
