// SPDX-License-Identifier: Apache-2.0
//! `bun ssh server`: drives the system OpenSSH server (Windows "OpenSSH Server" capability and
//! service, `sshd` under systemd/OpenRC elsewhere), and an embedded `russh` server for tests and
//! machines without sshd (exec, shell, sftp, `direct-tcpip` and `tcpip-forward`).

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use russh::keys::{Algorithm, PrivateKey, PublicKey};
use russh::server::{Auth, ChannelOpenHandle, Handle, Msg, Session};
use russh::{Channel, ChannelId, ChannelMsg, MethodKind, MethodSet};
use russh_sftp::protocol::{Attrs, Data, File, FileAttributes, Handle as SftpHandle, Name, OpenFlags, Status, StatusCode};
use tokio::io::{AsyncReadExt, AsyncSeekExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};

use crate::{Error, Result};

/// Options of the embedded server.
pub struct EmbeddedOptions {
    pub listen: String,
    pub port: u16,
    pub authorized_keys: Vec<PublicKey>,
    /// Accepted password, read from an environment variable by the CLI.
    pub password: Option<String>,
    pub host_key: Option<PathBuf>,
}

/// Reads an `authorized_keys` file (options before the key type are skipped).
pub fn read_authorized_keys(path: &Path) -> Result<Vec<PublicKey>> {
    let text = std::fs::read_to_string(path)?;
    let mut keys = Vec::new();
    for line in text.lines().map(str::trim).filter(|l| !l.is_empty() && !l.starts_with('#')) {
        let start = line.find("ssh-").or_else(|| line.find("ecdsa-")).unwrap_or(0);
        if let Ok(key) = PublicKey::from_openssh(&line[start..]) {
            keys.push(key);
        }
    }
    Ok(keys)
}

#[derive(Clone)]
struct Shared {
    authorized: Arc<Vec<PublicKey>>,
    password: Arc<Option<String>>,
}

struct Connection {
    shared: Shared,
    channels: HashMap<ChannelId, Channel<Msg>>,
}

fn shell_command(command: Option<&str>) -> tokio::process::Command {
    #[cfg(windows)]
    {
        let comspec = std::env::var_os("ComSpec").unwrap_or_else(|| "cmd.exe".into());
        let mut cmd = tokio::process::Command::new(comspec);
        match command {
            Some(command) => {
                cmd.raw_arg("/d /s /c \"").raw_arg(command).raw_arg("\"");
            },
            None => {
                cmd.arg("/q");
            },
        }
        cmd
    }
    #[cfg(not(windows))]
    {
        let shell = std::env::var_os("SHELL").filter(|s| !s.is_empty()).unwrap_or_else(|| "/bin/sh".into());
        let mut cmd = tokio::process::Command::new(shell);
        if let Some(command) = command {
            cmd.arg("-c").arg(command);
        }
        cmd
    }
}

async fn run_process(channel: Channel<Msg>, command: Option<String>) {
    let (mut read, write) = channel.split();
    let mut cmd = shell_command(command.as_deref());
    cmd.stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true);
    let mut child = match cmd.spawn() {
        Ok(child) => child,
        Err(err) => {
            let mut stderr = write.make_writer_ext(Some(1));
            let _ = stderr.write_all(format!("bun ssh server: {err}\n").as_bytes()).await;
            let _ = write.exit_status(127).await;
            let _ = write.eof().await;
            let _ = write.close().await;
            return;
        },
    };
    let mut stdin = child.stdin.take();
    let mut stdout = child.stdout.take();
    let mut stderr = child.stderr.take();
    let stdin_task = tokio::spawn(async move {
        while let Some(msg) = read.wait().await {
            match msg {
                ChannelMsg::Data { data } => {
                    if let Some(input) = stdin.as_mut() {
                        if input.write_all(&data).await.is_err() {
                            stdin = None;
                        }
                    }
                },
                ChannelMsg::Eof | ChannelMsg::Close => {
                    stdin = None;
                },
                _ => {},
            }
        }
    });
    let mut out_writer = write.make_writer();
    let mut err_writer = write.make_writer_ext(Some(1));
    let out_task = async {
        if let Some(stdout) = stdout.as_mut() {
            let _ = tokio::io::copy(stdout, &mut out_writer).await;
        }
        let _ = out_writer.flush().await;
    };
    let err_task = async {
        if let Some(stderr) = stderr.as_mut() {
            let _ = tokio::io::copy(stderr, &mut err_writer).await;
        }
        let _ = err_writer.flush().await;
    };
    tokio::join!(out_task, err_task);
    let code = child.wait().await.ok().and_then(|s| s.code()).unwrap_or(255);
    let _ = write.exit_status(u32::try_from(code).unwrap_or(255)).await;
    let _ = write.eof().await;
    let _ = write.close().await;
    stdin_task.abort();
}

impl russh::server::Handler for Connection {
    type Error = russh::Error;

    async fn auth_publickey(&mut self, _user: &str, key: &PublicKey) -> Result<Auth, Self::Error> {
        Ok(if self.shared.authorized.iter().any(|k| k.key_data() == key.key_data()) { Auth::Accept } else { Auth::reject() })
    }

    async fn auth_password(&mut self, _user: &str, password: &str) -> Result<Auth, Self::Error> {
        Ok(match self.shared.password.as_deref() {
            Some(expected) if expected == password => Auth::Accept,
            _ => Auth::reject(),
        })
    }

    async fn channel_open_session(&mut self, channel: Channel<Msg>, reply: ChannelOpenHandle, _session: &mut Session) -> Result<(), Self::Error> {
        reply.accept().await;
        self.channels.insert(channel.id(), channel);
        Ok(())
    }

    async fn channel_open_direct_tcpip(
        &mut self,
        channel: Channel<Msg>,
        host: &str,
        port: u32,
        _originator_address: &str,
        _originator_port: u32,
        reply: ChannelOpenHandle,
        _session: &mut Session,
    ) -> Result<(), Self::Error> {
        let Ok(port) = u16::try_from(port) else {
            reply.reject(russh::ChannelOpenFailure::ConnectFailed).await;
            return Ok(());
        };
        match TcpStream::connect((host, port)).await {
            Ok(mut socket) => {
                reply.accept().await;
                tokio::spawn(async move {
                    let mut stream = channel.into_stream();
                    let _ = tokio::io::copy_bidirectional(&mut socket, &mut stream).await;
                });
            },
            Err(_) => reply.reject(russh::ChannelOpenFailure::ConnectFailed).await,
        }
        Ok(())
    }

    async fn pty_request(
        &mut self,
        channel: ChannelId,
        _term: &str,
        _cols: u32,
        _rows: u32,
        _pix_width: u32,
        _pix_height: u32,
        _modes: &[(russh::Pty, u32)],
        session: &mut Session,
    ) -> Result<(), Self::Error> {
        session.channel_success(channel)
    }

    async fn exec_request(&mut self, channel: ChannelId, data: &[u8], session: &mut Session) -> Result<(), Self::Error> {
        let Some(chan) = self.channels.remove(&channel) else { return session.channel_failure(channel) };
        session.channel_success(channel)?;
        let command = String::from_utf8_lossy(data).into_owned();
        tokio::spawn(run_process(chan, Some(command)));
        Ok(())
    }

    async fn shell_request(&mut self, channel: ChannelId, session: &mut Session) -> Result<(), Self::Error> {
        let Some(chan) = self.channels.remove(&channel) else { return session.channel_failure(channel) };
        session.channel_success(channel)?;
        tokio::spawn(run_process(chan, None));
        Ok(())
    }

    async fn subsystem_request(&mut self, channel: ChannelId, name: &str, session: &mut Session) -> Result<(), Self::Error> {
        if name != "sftp" {
            return session.channel_failure(channel);
        }
        let Some(chan) = self.channels.remove(&channel) else { return session.channel_failure(channel) };
        session.channel_success(channel)?;
        tokio::spawn(russh_sftp::server::run(chan.into_stream(), SftpServer::default()));
        Ok(())
    }

    async fn tcpip_forward(&mut self, address: &str, port: &mut u32, session: &mut Session) -> Result<bool, Self::Error> {
        let Ok(requested) = u16::try_from(*port) else { return Ok(false) };
        let bind = if address.is_empty() || address == "localhost" { "127.0.0.1" } else { address };
        let Ok(listener) = TcpListener::bind((bind, requested)).await else { return Ok(false) };
        let bound = listener.local_addr().map(|a| u32::from(a.port())).unwrap_or(*port);
        *port = bound;
        let handle: Handle = session.handle();
        let address = address.to_owned();
        tokio::spawn(async move {
            while let Ok((mut socket, peer)) = listener.accept().await {
                let Ok(channel) = handle
                    .channel_open_forwarded_tcpip(address.clone(), bound, peer.ip().to_string(), u32::from(peer.port()))
                    .await
                else {
                    return;
                };
                tokio::spawn(async move {
                    let mut stream = channel.into_stream();
                    let _ = tokio::io::copy_bidirectional(&mut socket, &mut stream).await;
                });
            }
        });
        Ok(true)
    }
}

struct Factory {
    shared: Shared,
}

impl russh::server::Server for Factory {
    type Handler = Connection;

    fn new_client(&mut self, _peer: Option<std::net::SocketAddr>) -> Connection {
        Connection { shared: self.shared.clone(), channels: HashMap::new() }
    }
}

/// Binds the embedded server and returns its port and host public key; `serve` runs it.
pub async fn bind_embedded(options: EmbeddedOptions) -> Result<(u16, PublicKey, impl std::future::Future<Output = Result<()>>)> {
    let host_key = match &options.host_key {
        Some(path) => crate::auth::load_identity(path, true)?,
        None => PrivateKey::random(&mut rand::rng(), Algorithm::Ed25519).map_err(russh::keys::Error::from)?,
    };
    let public = host_key.public_key().clone();
    let mut methods = vec![MethodKind::PublicKey];
    if options.password.is_some() {
        methods.push(MethodKind::Password);
    }
    let config = Arc::new(russh::server::Config {
        keys: vec![host_key],
        methods: MethodSet::from(&methods[..]),
        auth_rejection_time: std::time::Duration::from_millis(50),
        auth_rejection_time_initial: Some(std::time::Duration::ZERO),
        ..Default::default()
    });
    let listener = TcpListener::bind((options.listen.as_str(), options.port)).await?;
    let port = listener.local_addr()?.port();
    let mut factory = Factory {
        shared: Shared { authorized: Arc::new(options.authorized_keys), password: Arc::new(options.password) },
    };
    let serve = async move {
        use russh::server::Server as _;
        factory.run_on_socket(config, &listener).await?;
        Ok(())
    };
    Ok((port, public, serve))
}

#[derive(Default)]
struct SftpServer {
    handles: HashMap<String, SftpOpen>,
    next: u64,
}

enum SftpOpen {
    File(tokio::fs::File),
    Dir(Option<Vec<File>>),
}

fn local_path(path: &str) -> PathBuf {
    #[cfg(windows)]
    {
        let bytes = path.as_bytes();
        if bytes.len() >= 3 && bytes[0] == b'/' && bytes[2] == b':' {
            return PathBuf::from(&path[1..]);
        }
    }
    if path.is_empty() { PathBuf::from(".") } else { PathBuf::from(path) }
}

fn remote_path(path: &Path) -> String {
    let text = path.to_string_lossy().replace('\\', "/");
    if cfg!(windows) && text.as_bytes().get(1) == Some(&b':') { format!("/{text}") } else { text }
}

fn status(id: u32, code: StatusCode, message: &str) -> Status {
    Status { id, status_code: code, error_message: message.to_owned(), language_tag: "en-US".into() }
}

fn io_status(err: &std::io::Error) -> StatusCode {
    match err.kind() {
        std::io::ErrorKind::NotFound => StatusCode::NoSuchFile,
        std::io::ErrorKind::PermissionDenied => StatusCode::PermissionDenied,
        _ => StatusCode::Failure,
    }
}

impl SftpServer {
    fn insert(&mut self, open: SftpOpen) -> String {
        self.next += 1;
        let handle = self.next.to_string();
        self.handles.insert(handle.clone(), open);
        handle
    }
}

impl russh_sftp::server::Handler for SftpServer {
    type Error = StatusCode;

    fn unimplemented(&self) -> Self::Error {
        StatusCode::OpUnsupported
    }

    async fn init(&mut self, _version: u32, _extensions: std::collections::HashMap<String, String>) -> Result<russh_sftp::protocol::Version, Self::Error> {
        Ok(russh_sftp::protocol::Version::new())
    }

    async fn open(&mut self, id: u32, filename: String, flags: OpenFlags, _attrs: FileAttributes) -> Result<SftpHandle, Self::Error> {
        let mut options = tokio::fs::OpenOptions::new();
        options
            .read(flags.contains(OpenFlags::READ))
            .write(flags.contains(OpenFlags::WRITE) || flags.contains(OpenFlags::APPEND))
            .append(flags.contains(OpenFlags::APPEND))
            .truncate(flags.contains(OpenFlags::TRUNCATE));
        if flags.contains(OpenFlags::CREATE) {
            if flags.contains(OpenFlags::EXCLUDE) {
                options.create_new(true);
            } else {
                options.create(true);
            }
        }
        let file = options.open(local_path(&filename)).await.map_err(|e| io_status(&e))?;
        Ok(SftpHandle { id, handle: self.insert(SftpOpen::File(file)) })
    }

    async fn close(&mut self, id: u32, handle: String) -> Result<Status, Self::Error> {
        if let Some(SftpOpen::File(mut file)) = self.handles.remove(&handle) {
            let _ = file.flush().await;
        }
        Ok(status(id, StatusCode::Ok, ""))
    }

    async fn read(&mut self, id: u32, handle: String, offset: u64, len: u32) -> Result<Data, Self::Error> {
        let Some(SftpOpen::File(file)) = self.handles.get_mut(&handle) else { return Err(StatusCode::Failure) };
        file.seek(std::io::SeekFrom::Start(offset)).await.map_err(|e| io_status(&e))?;
        let mut data = vec![0u8; len.min(256 * 1024) as usize];
        let n = file.read(&mut data).await.map_err(|e| io_status(&e))?;
        if n == 0 {
            return Err(StatusCode::Eof);
        }
        data.truncate(n);
        Ok(Data { id, data })
    }

    async fn write(&mut self, id: u32, handle: String, offset: u64, data: Vec<u8>) -> Result<Status, Self::Error> {
        let Some(SftpOpen::File(file)) = self.handles.get_mut(&handle) else { return Err(StatusCode::Failure) };
        file.seek(std::io::SeekFrom::Start(offset)).await.map_err(|e| io_status(&e))?;
        file.write_all(&data).await.map_err(|e| io_status(&e))?;
        Ok(status(id, StatusCode::Ok, ""))
    }

    async fn lstat(&mut self, id: u32, path: String) -> Result<Attrs, Self::Error> {
        let meta = tokio::fs::symlink_metadata(local_path(&path)).await.map_err(|e| io_status(&e))?;
        Ok(Attrs { id, attrs: FileAttributes::from(&meta) })
    }

    async fn stat(&mut self, id: u32, path: String) -> Result<Attrs, Self::Error> {
        let meta = tokio::fs::metadata(local_path(&path)).await.map_err(|e| io_status(&e))?;
        Ok(Attrs { id, attrs: FileAttributes::from(&meta) })
    }

    async fn fstat(&mut self, id: u32, handle: String) -> Result<Attrs, Self::Error> {
        let Some(SftpOpen::File(file)) = self.handles.get(&handle) else { return Err(StatusCode::Failure) };
        let meta = file.metadata().await.map_err(|e| io_status(&e))?;
        Ok(Attrs { id, attrs: FileAttributes::from(&meta) })
    }

    async fn setstat(&mut self, id: u32, _path: String, _attrs: FileAttributes) -> Result<Status, Self::Error> {
        Ok(status(id, StatusCode::Ok, ""))
    }

    async fn fsetstat(&mut self, id: u32, _handle: String, _attrs: FileAttributes) -> Result<Status, Self::Error> {
        Ok(status(id, StatusCode::Ok, ""))
    }

    async fn opendir(&mut self, id: u32, path: String) -> Result<SftpHandle, Self::Error> {
        let mut entries = Vec::new();
        let mut dir = tokio::fs::read_dir(local_path(&path)).await.map_err(|e| io_status(&e))?;
        while let Ok(Some(entry)) = dir.next_entry().await {
            if let Ok(meta) = entry.metadata().await {
                entries.push(File::new(entry.file_name().to_string_lossy().into_owned(), FileAttributes::from(&meta)));
            }
        }
        Ok(SftpHandle { id, handle: self.insert(SftpOpen::Dir(Some(entries))) })
    }

    async fn readdir(&mut self, id: u32, handle: String) -> Result<Name, Self::Error> {
        let Some(SftpOpen::Dir(entries)) = self.handles.get_mut(&handle) else { return Err(StatusCode::Failure) };
        match entries.take() {
            Some(files) if !files.is_empty() => Ok(Name { id, files }),
            _ => Err(StatusCode::Eof),
        }
    }

    async fn remove(&mut self, id: u32, filename: String) -> Result<Status, Self::Error> {
        tokio::fs::remove_file(local_path(&filename)).await.map_err(|e| io_status(&e))?;
        Ok(status(id, StatusCode::Ok, ""))
    }

    async fn mkdir(&mut self, id: u32, path: String, _attrs: FileAttributes) -> Result<Status, Self::Error> {
        tokio::fs::create_dir(local_path(&path)).await.map_err(|e| io_status(&e))?;
        Ok(status(id, StatusCode::Ok, ""))
    }

    async fn rmdir(&mut self, id: u32, path: String) -> Result<Status, Self::Error> {
        tokio::fs::remove_dir(local_path(&path)).await.map_err(|e| io_status(&e))?;
        Ok(status(id, StatusCode::Ok, ""))
    }

    async fn realpath(&mut self, id: u32, path: String) -> Result<Name, Self::Error> {
        let resolved = std::fs::canonicalize(local_path(&path)).map_err(|e| io_status(&e))?;
        let text = resolved.to_string_lossy();
        let text = text.strip_prefix(r"\\?\").unwrap_or(&text);
        Ok(Name { id, files: vec![File::dummy(remote_path(Path::new(text)))] })
    }

    async fn rename(&mut self, id: u32, old: String, new: String) -> Result<Status, Self::Error> {
        tokio::fs::rename(local_path(&old), local_path(&new)).await.map_err(|e| io_status(&e))?;
        Ok(status(id, StatusCode::Ok, ""))
    }
}

/// One system command that manages sshd, run with inherited stdio.
fn run(program: &str, args: &[&str]) -> Result<i32> {
    let status = std::process::Command::new(program).args(args).status()?;
    Ok(status.code().unwrap_or(1))
}

/// `bun ssh server status|install|start|stop|enable` against the system OpenSSH server.
pub fn manage_system(action: &str) -> Result<i32> {
    #[cfg(windows)]
    {
        let ps = |script: &str| run("powershell.exe", &["-NoProfile", "-NonInteractive", "-Command", script]);
        match action {
            "status" => ps("Get-WindowsCapability -Online -Name 'OpenSSH.Server*' | Select-Object Name,State; Get-Service sshd -ErrorAction SilentlyContinue | Select-Object Name,Status,StartType"),
            "install" => ps("Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0"),
            "start" => ps("Start-Service sshd"),
            "stop" => ps("Stop-Service sshd"),
            "enable" => ps("Set-Service -Name sshd -StartupType Automatic; Start-Service sshd"),
            other => Err(Error::InvalidInput(format!("unknown server action `{other}`"))),
        }
    }
    #[cfg(not(windows))]
    {
        let systemctl = crate::system::find("systemctl");
        let service = if Path::new("/lib/systemd/system/ssh.service").exists() || Path::new("/usr/lib/systemd/system/ssh.service").exists() { "ssh" } else { "sshd" };
        match (action, systemctl) {
            ("status", Some(_)) => run("systemctl", &["--no-pager", "status", service]),
            ("start" | "stop" | "enable", Some(_)) => {
                let verb = if action == "enable" { "enable --now" } else { action };
                let mut args: Vec<&str> = verb.split(' ').collect();
                args.push(service);
                run("systemctl", &args)
            },
            ("status" | "start" | "stop" | "enable", None) => {
                let verb = if action == "enable" { "start" } else { action };
                if crate::system::find("rc-service").is_some() {
                    if action == "enable" {
                        run("rc-update", &["add", "sshd"])?;
                    }
                    run("rc-service", &["sshd", verb])
                } else {
                    run("service", &[service, verb])
                }
            },
            ("install", _) => {
                if crate::system::find("apt-get").is_some() {
                    run("apt-get", &["install", "-y", "openssh-server"])
                } else if crate::system::find("apk").is_some() {
                    run("apk", &["add", "openssh-server"])
                } else if crate::system::find("dnf").is_some() {
                    run("dnf", &["install", "-y", "openssh-server"])
                } else if crate::system::find("pacman").is_some() {
                    run("pacman", &["-S", "--noconfirm", "openssh"])
                } else {
                    Err(crate::other("no supported package manager (apt-get, apk, dnf, pacman)"))
                }
            },
            (other, _) => Err(Error::InvalidInput(format!("unknown server action `{other}`"))),
        }
    }
}
