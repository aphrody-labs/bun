//! Bun's native client for the Mullvad VPN daemon.
//!
//! The upstream management interface owns its local IPC protocol and DTOs.

#[cfg(not(target_os = "android"))]
mod cli_input;

use std::io::Write as _;
use std::path::PathBuf;

fn write_stdout(bytes: &[u8]) {
    let _ = std::io::stdout().lock().write_all(bytes);
}

fn write_stderr(bytes: &[u8]) {
    let _ = std::io::stderr().lock().write_all(bytes);
}

pub use mullvad_management_interface::Error;
pub use mullvad_types::states::TunnelState;
pub type EmbeddedDaemon = mullvad_daemon::Daemon;

/// Mullvad keeps its settings in the system profile and its cache in ProgramData (/etc and
/// /var/cache on Unix), which only an elevated session can create. Any other session gets
/// per-user directories; MULLVAD_SETTINGS_DIR and MULLVAD_CACHE_DIR still win when set.
#[allow(clippy::disallowed_methods)]
fn user_dir(kind: &str) -> Result<PathBuf, String> {
    let base = if cfg!(windows) {
        std::env::var_os("LOCALAPPDATA").map(PathBuf::from)
    } else {
        std::env::var_os("XDG_STATE_HOME")
            .map(PathBuf::from)
            .or_else(|| {
                std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".local/state"))
            })
    }
    .ok_or("no per-user data directory (LOCALAPPDATA or HOME is unset)")?;
    let dir = base.join("Bun").join("vpn").join(kind);
    std::fs::create_dir_all(&dir).map_err(|error| format!("{}: {error}", dir.display()))?;
    Ok(dir)
}

pub async fn start_embedded_daemon() -> Result<EmbeddedDaemon, String> {
    let settings_dir = mullvad_paths::settings_dir()
        .or_else(|_| user_dir("settings"))
        .map_err(|error| error.to_string())?;
    let cache_dir = mullvad_paths::cache_dir()
        .or_else(|_| user_dir("cache"))
        .map_err(|error| error.to_string())?;
    let log_handle =
        mullvad_daemon::logging::detached_log_handle().map_err(|error| error.to_string())?;
    let config = mullvad_daemon::DaemonConfig {
        log_dir: None,
        resource_dir: mullvad_paths::get_resource_dir(),
        settings_dir,
        cache_dir,
        rpc_socket_path: mullvad_paths::get_rpc_socket_path(),
        endpoint: mullvad_api::ApiEndpoint::from_env_vars(),
        log_handle,
    };
    mullvad_daemon::Daemon::start(config, mullvad_daemon::DaemonCommandChannel::new())
        .await
        .map_err(|error| error.to_string())
}

pub async fn run_embedded_daemon() -> Result<(), String> {
    start_embedded_daemon()
        .await?
        .run()
        .await
        .map_err(|error| error.to_string())
}

/// Controls the installed Mullvad daemon through its native management IPC.
#[cfg(not(target_os = "android"))]
pub struct VpnClient(mullvad_management_interface::client::MullvadProxyClient);

#[cfg(not(target_os = "android"))]
impl VpnClient {
    /// Connect to the platform's configured Mullvad management endpoint.
    pub async fn connect() -> Result<Self, Error> {
        mullvad_management_interface::client::MullvadProxyClient::new()
            .await
            .map(Self)
    }

    /// Read tunnel state reported by the Mullvad daemon.
    pub async fn state(&mut self) -> Result<TunnelState, Error> {
        self.0.get_tunnel_state().await
    }

    /// Authenticate through the configured management IPC without exposing the account.
    pub async fn login_account(&mut self, account: String) -> Result<(), Error> {
        self.0.login_account(account).await
    }

    /// Ask the Mullvad daemon to connect using its current settings.
    pub async fn connect_tunnel(&mut self) -> Result<bool, Error> {
        self.0.connect_tunnel().await
    }

    /// Disconnect the tunnel and attribute the request to Bun.
    pub async fn disconnect_tunnel(&mut self) -> Result<bool, Error> {
        self.0.disconnect_tunnel("Bun").await
    }
}

/// Mullvad's management interface has no Android client.
#[cfg(target_os = "android")]
pub fn cli(_args: &[String]) -> i32 {
    write_stderr(b"bun vpn: not supported on Android\n");
    1
}

/// Bun's single VPN CLI, backed by the same native daemon IPC client.
#[cfg(not(target_os = "android"))]
pub fn cli(args: &[String]) -> i32 {
    use cli_input::Command;
    let command = match cli_input::command(args) {
        Ok(command) => command,
        Err(usage) => {
            write_stderr(format!("{usage}\n").as_bytes());
            return 2;
        }
    };
    let runtime = match tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
    {
        Ok(runtime) => runtime,
        Err(error) => {
            write_stderr(
                format!("bun vpn: failed to start native async runtime: {error}\n").as_bytes(),
            );
            return 1;
        }
    };
    if command == Command::Daemon {
        return match runtime.block_on(run_embedded_daemon()) {
            Ok(()) => 0,
            Err(error) => {
                write_stderr(format!("bun vpn: {error}\n").as_bytes());
                1
            }
        };
    }
    if matches!(command, Command::Login | Command::LoginEnv) {
        let read = if command == Command::LoginEnv {
            cli_input::account_from_env(&args[2])
        } else {
            cli_input::read_account(std::io::stdin().lock())
        };
        let account = match read {
            Ok(account) => account,
            Err(error) => {
                write_stderr(format!("bun vpn: {error}\n").as_bytes());
                return 2;
            }
        };
        return match runtime
            .block_on(async move { VpnClient::connect().await?.login_account(account).await })
        {
            Ok(()) => {
                write_stdout(b"account login completed\n");
                0
            }
            Err(_) => {
                write_stderr(b"bun vpn: account login failed\n");
                1
            }
        };
    }
    match runtime.block_on(async move {
        let mut client = VpnClient::connect().await?;
        match command {
            Command::Status => client.state().await.map(|state| format!("{state:?}")),
            Command::Connect => client
                .connect_tunnel()
                .await
                .map(|changed| format!("connect requested: {changed}")),
            Command::Disconnect => client
                .disconnect_tunnel()
                .await
                .map(|changed| format!("disconnect requested: {changed}")),
            _ => unreachable!(),
        }
    }) {
        Ok(output) => {
            write_stdout(format!("{output}\n").as_bytes());
            0
        }
        Err(error) => {
            write_stderr(format!("bun vpn: {error}\n").as_bytes());
            1
        }
    }
}
