// SPDX-License-Identifier: Apache-2.0

//! Locates the `bun` executable the subcommands drive (`bun install`, `bun patch`, `bun build --compile`).

use std::{
    ffi::OsStr,
    path::{Path, PathBuf},
    process::Command,
};

pub(crate) struct Bun;

impl Bun {
    /// `BUN_EXE` (set by the plugin to the running Bun), else `bun` on PATH.
    pub(crate) fn discover(&self) -> anyhow::Result<PathBuf> {
        if let Some(exe) = std::env::var_os("BUN_EXE").map(PathBuf::from)
            && exe.is_file()
        {
            return Ok(exe);
        }
        which::which("bun").map_err(|error| anyhow::anyhow!("`bun` not found on PATH: {error}"))
    }

    pub(crate) fn command<I, S>(&self, args: I) -> Command
    where
        I: IntoIterator<Item = S>,
        S: AsRef<OsStr>,
    {
        let mut command = Command::new(self.discover().unwrap_or_else(|_| PathBuf::from("bun")));
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
