// SPDX-License-Identifier: Apache-2.0
//! Discovery of the system tools `bun ssh` and `bun git` drive: OpenSSH (`ssh`, `scp`, `sftp`,
//! `ssh-keygen`, `ssh-add`, `sshd`), `rsync`, `git` and `gh`.
//!
//! Search order: `BUN_SSH_<TOOL>` / `BUN_GIT_BIN` overrides, `PATH`, then the well-known install
//! locations (Windows `System32\OpenSSH`, Git for Windows `usr\bin` and `cmd`, GitHub CLI, and
//! `/usr/bin`, `/usr/sbin`, `/usr/local/bin`, `/opt/homebrew/bin` elsewhere).

use std::path::{Path, PathBuf};

/// Installed tool binaries are checked against the single shipped asset manifest before execution.
pub fn verify_installed_tool(path: &Path, bytes: u64, expected_sha256: &str) -> crate::Result<()> {
    use std::io::Read;
    use sha2::{Digest, Sha256};
    let metadata = std::fs::symlink_metadata(path)?;
    if !metadata.is_file() || metadata.file_type().is_symlink() || metadata.len() != bytes || bytes > 256 * 1024 * 1024 {
        return Err(crate::other("Installed tool has an invalid file type or pinned size"));
    }
    let mut file = std::fs::File::open(path)?;
    let mut hash = Sha256::new();
    let mut chunk = [0; 64 * 1024];
    let mut total = 0_u64;
    loop {
        let read = file.read(&mut chunk)?;
        if read == 0 { break; }
        total += read as u64;
        if total > bytes { return Err(crate::other("Installed tool exceeded its pinned size")); }
        hash.update(&chunk[..read]);
    }
    let actual = hash.finalize().iter().map(|byte| format!("{byte:02x}")).collect::<String>();
    if total != bytes || actual != expected_sha256 { return Err(crate::other("Installed tool SHA-256 mismatch")); }
    Ok(())
}

const EXE: &str = std::env::consts::EXE_SUFFIX;

/// Finds `tool` (without extension). Returns `None` when the tool is not installed.
pub fn find(tool: &str) -> Option<PathBuf> {
    let override_var = format!("BUN_SSH_{}", tool.to_ascii_uppercase().replace('-', "_"));
    for var in [override_var.as_str(), if tool == "git" { "BUN_GIT_BIN" } else { "" }] {
        if var.is_empty() {
            continue;
        }
        if let Some(value) = std::env::var_os(var).filter(|v| !v.is_empty()) {
            if value == "none" {
                return None;
            }
            let path = PathBuf::from(value);
            return path.is_file().then_some(path);
        }
    }
    let file = format!("{tool}{EXE}");
    if let Some(paths) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&paths) {
            let candidate = dir.join(&file);
            if candidate.is_file() && !is_windows_app_alias(&candidate) {
                return Some(candidate);
            }
        }
    }
    well_known_dirs().into_iter().map(|dir| dir.join(&file)).find(|p| p.is_file())
}

/// `%LOCALAPPDATA%\Microsoft\WindowsApps` holds zero-byte execution aliases that only open the
/// Store; they are never a usable tool.
fn is_windows_app_alias(path: &Path) -> bool {
    cfg!(windows) && path.metadata().map(|m| m.len() == 0).unwrap_or(false)
}

#[cfg(windows)]
fn well_known_dirs() -> Vec<PathBuf> {
    let env = |name: &str| std::env::var_os(name).filter(|v| !v.is_empty()).map(PathBuf::from);
    let mut dirs = Vec::new();
    if let Some(root) = env("SystemRoot") {
        dirs.push(root.join("System32").join("OpenSSH"));
    }
    for base in [env("ProgramFiles"), env("ProgramW6432"), env("ProgramFiles(x86)")].into_iter().flatten() {
        dirs.push(base.join("OpenSSH"));
        dirs.push(base.join("Git").join("cmd"));
        dirs.push(base.join("Git").join("usr").join("bin"));
        dirs.push(base.join("GitHub CLI"));
    }
    if let Some(local) = env("LOCALAPPDATA") {
        dirs.push(local.join("Programs").join("Git").join("cmd"));
        dirs.push(local.join("Programs").join("Git").join("usr").join("bin"));
    }
    if let Some(scoop) = crate::home_dir().map(|h| h.join("scoop").join("shims")) {
        dirs.push(scoop);
    }
    dirs
}

#[cfg(not(windows))]
fn well_known_dirs() -> Vec<PathBuf> {
    ["/usr/bin", "/usr/sbin", "/usr/local/bin", "/usr/local/sbin", "/opt/homebrew/bin", "/bin", "/sbin"]
        .into_iter()
        .map(PathBuf::from)
        .collect()
}

/// Origin of a detected OpenSSH, for `bun ssh doctor` and backend selection.
pub fn describe(path: &Path) -> &'static str {
    let lower = path.to_string_lossy().to_ascii_lowercase().replace('\\', "/");
    if lower.contains("/system32/openssh/") {
        "Windows OpenSSH"
    } else if lower.contains("/git/usr/bin/") || lower.contains("/git/cmd/") || lower.contains("/git/mingw64/") {
        "Git for Windows"
    } else if lower.contains("/openssh/") {
        "Win32-OpenSSH"
    } else {
        "system"
    }
}

/// `ssh -V` prints its version on stderr (`OpenSSH_for_Windows_9.5p1, LibreSSL 3.8.2`).
pub fn version(tool: &Path, flag: &str) -> Option<String> {
    let output = std::process::Command::new(tool)
        .arg(flag)
        .stdin(std::process::Stdio::null())
        .output()
        .ok()?;
    let text = if output.stdout.is_empty() { output.stderr } else { output.stdout };
    let line = String::from_utf8_lossy(&text).lines().next()?.trim().to_owned();
    (!line.is_empty()).then_some(line)
}

/// Whether the OpenSSH at `ssh` supports connection multiplexing (`ControlMaster`). The Windows
/// port does not: its `ssh.exe` has no Unix-domain socket support for control sockets.
pub fn supports_control_master(ssh: &Path) -> bool {
    cfg!(unix) && describe(ssh) == "system"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn describes_known_locations() {
        assert_eq!(describe(Path::new("C:\\Windows\\System32\\OpenSSH\\ssh.exe")), "Windows OpenSSH");
        assert_eq!(describe(Path::new("C:\\Program Files\\Git\\usr\\bin\\ssh.exe")), "Git for Windows");
        assert_eq!(describe(Path::new("/usr/bin/ssh")), "system");
    }

    #[test]
    fn override_none_hides_tool() {
        // SAFETY: the variable is unique to this test and read on this thread only.
        unsafe { std::env::set_var("BUN_SSH_BUN_TEST_TOOL", "none") };
        assert!(find("bun-test-tool").is_none());
    }

    #[test]
    fn installed_tool_size_and_sha_are_checked_without_mutating_the_file() {
        use std::io::Write;
        struct Owned(std::path::PathBuf);
        impl Drop for Owned { fn drop(&mut self) { let _ = std::fs::remove_file(&self.0); } }
        let path = std::env::temp_dir().join(format!("bun-tool-pin-fixture-{}-{:016x}", std::process::id(), rand::random::<u64>()));
        let mut file = std::fs::OpenOptions::new().write(true).create_new(true).open(&path).unwrap();
        let owned = Owned(path);
        file.write_all(b"abc").unwrap(); drop(file);
        let pin = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
        verify_installed_tool(&owned.0, 3, pin).unwrap();
        assert!(verify_installed_tool(&owned.0, 4, pin).is_err());
        std::fs::write(&owned.0, b"abd").unwrap();
        assert!(verify_installed_tool(&owned.0, 3, pin).is_err());
        assert_eq!(std::fs::read(&owned.0).unwrap(), b"abd");
    }
}
