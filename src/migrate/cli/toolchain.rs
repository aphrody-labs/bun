// SPDX-License-Identifier: Apache-2.0

//! Locates the `bun` executable the subcommands drive (`bun install`, `bun patch`, `bun build --compile`).

use bun_no_window::command;

use std::{
    ffi::OsStr,
    path::{Path, PathBuf},
    process::Command,
    sync::OnceLock,
};

static EMBEDDED_EXECUTABLE: OnceLock<PathBuf> = OnceLock::new();

pub(crate) fn set_embedded_executable(executable: PathBuf) -> anyhow::Result<()> {
    let installed = EMBEDDED_EXECUTABLE.get_or_init(|| executable.clone());
    anyhow::ensure!(*installed == executable, "N2B host executable already initialized");
    Ok(())
}

pub(crate) struct Bun;

impl Bun {
    /// Explicit `BUN_EXE`, the embedding Bun executable, then `bun` on PATH.
    pub(crate) fn discover(&self) -> anyhow::Result<PathBuf> {
        if let Some(exe) = std::env::var_os("BUN_EXE").map(PathBuf::from)
            && exe.is_file()
        {
            return Ok(exe);
        }
        if let Some(executable) = EMBEDDED_EXECUTABLE.get() {
            return Ok(executable.clone());
        }
        which::which("bun").map_err(|error| anyhow::anyhow!("`bun` not found on PATH: {error}"))
    }

    pub(crate) fn command<I, S>(&self, args: I) -> Command
    where
        I: IntoIterator<Item = S>,
        S: AsRef<OsStr>,
    {
        let mut command = command(self.discover().unwrap_or_else(|_| PathBuf::from("bun")));
        command.args(args);
        command
    }

    pub(crate) fn command_in<I, S>(&self, cwd: &Path, args: I) -> Command
    where
        I: IntoIterator<Item = S>,
        S: AsRef<OsStr>,
    {
        let mut command = self.command(args);
        command.current_dir(cwd);
        command
    }
}
