//! Bun's native client for the Mullvad VPN daemon.
//!
//! The upstream management interface owns its local IPC protocol and DTOs.

pub use mullvad_management_interface::Error;
pub use mullvad_types::states::TunnelState;

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
    eprintln!("bun vpn: not supported on Android");
    1
}

/// Bun's single VPN CLI, backed by the same native daemon IPC client.
#[cfg(not(target_os = "android"))]
pub fn cli(args: &[String]) -> i32 {
    let Some(command) = args.first().map(String::as_str) else {
        eprintln!("usage: bun vpn <status|connect|disconnect>");
        return 2;
    };
    if args.len() != 1 || !matches!(command, "status" | "connect" | "disconnect") {
        eprintln!("usage: bun vpn <status|connect|disconnect>");
        return 2;
    }
    let runtime = match tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
    {
        Ok(runtime) => runtime,
        Err(error) => {
            eprintln!("bun vpn: failed to start native async runtime: {error}");
            return 1;
        }
    };
    match runtime.block_on(async move {
        let mut client = VpnClient::connect().await?;
        match command {
            "status" => client.state().await.map(|state| format!("{state:?}")),
            "connect" => client
                .connect_tunnel()
                .await
                .map(|changed| format!("connect requested: {changed}")),
            "disconnect" => client
                .disconnect_tunnel()
                .await
                .map(|changed| format!("disconnect requested: {changed}")),
            _ => unreachable!(),
        }
    }) {
        Ok(output) => {
            println!("{output}");
            0
        }
        Err(error) => {
            eprintln!("bun vpn: {error}");
            1
        }
    }
}
