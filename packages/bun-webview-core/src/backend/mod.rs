//! Engines and their UI loops. Each `run` owns the main thread until the parent closes the pipe
//! or sends `Browser.close`.

pub mod mock;
#[cfg(all(target_os = "linux", feature = "gtk4"))]
pub mod webkitgtk;

use crate::cdp::{Out, Server};
use crate::pipe::{self, Inbound};
use crate::{BackendKind, HostConfig};
use std::io::{Read, Write};

/// Engines compiled into this build, in preference order.
pub fn available() -> Vec<BackendKind> {
    let mut v = Vec::new();
    #[cfg(all(target_os = "linux", feature = "gtk4"))]
    v.push(BackendKind::WebKitGtk);
    v.push(BackendKind::Mock);
    v
}

/// Serve CDP for `kind` over `input`/`output` until EOF. Returns the process exit code.
pub fn run(kind: BackendKind, cfg: HostConfig, input: Box<dyn Read + Send>, output: Box<dyn Write + Send>) -> Result<i32, String> {
    let out = Out::new(pipe::spawn_writer(output));
    match kind {
        BackendKind::Mock => {
            let (tx, rx) = std::sync::mpsc::channel();
            pipe::spawn_reader(input, move |m| {
                let _ = tx.send(m);
            });
            let mut server = Server::new(Box::new(mock::Mock::default()), out, cfg.headless);
            for m in rx {
                match m {
                    Inbound::Message(s) => server.handle(&s),
                    Inbound::Eof => break,
                }
            }
            server.shutdown();
            Ok(0)
        }
        #[cfg(all(target_os = "linux", feature = "gtk4"))]
        BackendKind::WebKitGtk => webkitgtk::run(cfg, input, out),
        other => Err(format!(
            "backend \"{}\" is not built into this bun-webview-host (available: {})",
            other.name(),
            available().iter().map(|k| k.name()).collect::<Vec<_>>().join(", ")
        )),
    }
}
