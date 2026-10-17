//! Windows service host; see `windows.rs`. Other platforms build a stub so the workspace checks everywhere.
#[cfg(windows)]
mod windows;

#[cfg(windows)]
fn main() {
    windows::main();
}

#[cfg(not(windows))]
fn main() {
    eprintln!("bun-winsvc: Windows only");
    std::process::exit(1);
}
