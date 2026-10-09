// SPDX-License-Identifier: MIT
//! `bun dotnet info`: what `dotnet --info` prints, computed from the inventory without
//! starting a process or the SDK, plus every other install, workloads and .NET Framework.

use std::fmt::Write as _;
use std::path::Path;

use serde_json::{Value, json};

use crate::inventory::{self, Install, Inventory};
use crate::select::{self, SdkResolution};
use crate::{ARCH, locate};

pub struct Info {
    pub inventory: Inventory,
    /// Index in [`Inventory::installs`] of the install `dotnet` would use.
    pub primary: Option<usize>,
    pub primary_source: Option<String>,
    pub sdk: Option<SdkResolution>,
}

pub fn collect(cwd: &Path) -> Info {
    let inventory = inventory::scan();
    let located = locate(None).ok();
    let primary = located.as_ref().and_then(|location| {
        let key = inventory::canonical(&location.dotnet_root)?;
        inventory.installs.iter().position(|install| install.root == key)
    });
    let sdk = primary.map(|index| select::resolve_sdk(&inventory.installs[index].root, cwd));
    Info {
        primary_source: located.map(|location| location.source.as_str().to_owned()),
        inventory,
        primary,
        sdk,
    }
}

fn versions(components: &[inventory::Component]) -> Vec<String> {
    components.iter().map(|component| component.version.to_string()).collect()
}

fn install_json(install: &Install) -> Value {
    let workloads = &install.workloads;
    json!({
        "root": install.root,
        "arch": install.arch,
        "sources": install.sources,
        "muxer": install.muxer,
        "hostfxr": install.hostfxr.iter().map(|c| json!({ "version": c.version.to_string(), "path": c.path })).collect::<Vec<_>>(),
        "sdks": versions(&install.sdks),
        "frameworks": inventory::frameworks_map(install),
        "workloads": {
            "installed": workloads.installed.iter().map(|w| json!({ "band": w.band, "id": w.id, "source": w.source })).collect::<Vec<_>>(),
            "installerTypes": workloads.installer_types.iter().map(|(band, kind)| json!({ "band": band, "type": kind })).collect::<Vec<_>>(),
            "sets": workloads.sets.iter().map(|(band, version)| json!({ "band": band, "version": version })).collect::<Vec<_>>(),
            "manifests": workloads.manifests.iter().map(|(band, id, version)| json!({ "band": band, "id": id, "version": version })).collect::<Vec<_>>(),
        },
    })
}

impl Info {
    pub fn primary(&self) -> Option<&Install> {
        self.primary.map(|index| &self.inventory.installs[index])
    }

    pub fn to_json(&self) -> Value {
        let sdk = self.sdk.as_ref().map(|resolution| {
            let request = &resolution.request;
            json!({
                "globalJson": request.global_json,
                "globalJsonError": request.global_json_error,
                "requested": request.version.as_ref().map(ToString::to_string),
                "rollForward": request.policy.as_str(),
                "allowPrerelease": request.allow_prerelease,
                "searchRoots": resolution.roots,
                "selected": resolution.selected.as_ref().map(|c| json!({ "version": c.version.to_string(), "path": c.path })),
                "error": resolution.error,
            })
        });
        json!({
            "hostArch": self.inventory.host_arch,
            "primary": self.primary().map(|install| install.root.clone()),
            "primarySource": self.primary_source,
            "sdk": sdk,
            "installs": self.inventory.installs.iter().map(install_json).collect::<Vec<_>>(),
            "netFramework": self.inventory.net_framework.iter().map(|f| json!({
                "version": f.version, "build": f.build, "release": f.release, "servicePack": f.service_pack,
            })).collect::<Vec<_>>(),
            "environment": ENV_SHOWN.iter().map(|name| (name.to_string(), std::env::var(name).ok().map_or(Value::Null, Value::from))).collect::<serde_json::Map<_, _>>(),
        })
    }

    /// Text in the layout of `dotnet --info`.
    pub fn to_text(&self) -> String {
        let mut out = String::new();
        let primary = self.primary();
        if let Some(resolution) = &self.sdk {
            match &resolution.selected {
                Some(sdk) => {
                    let _ = writeln!(out, ".NET SDK:\n Version:           {}\n Base Path:         {}{}\n", sdk.version, sdk.path.display(), std::path::MAIN_SEPARATOR);
                }
                None => {
                    let _ = writeln!(out, ".NET SDK:\n {}\n", resolution.error.as_deref().unwrap_or("none"));
                }
            }
        }
        let _ = writeln!(out, "Runtime Environment:\n OS Platform: {}\n RID:         {}\n", std::env::consts::OS, crate::releases::host_rid());
        if let Some(install) = primary {
            let _ = writeln!(out, "Host:");
            if let Some(hostfxr) = install.latest_hostfxr() {
                let _ = writeln!(out, "  Version:      {}", hostfxr.version);
            }
            let _ = writeln!(out, "  Architecture: {}", install.arch.unwrap_or(ARCH));
            let _ = writeln!(out, "  Path:         {}", install.muxer.as_deref().unwrap_or(&install.root).display());
            let _ = writeln!(out, "  Found by:     {}\n", self.primary_source.as_deref().unwrap_or("?"));
            write_install(&mut out, install);
        } else {
            let _ = writeln!(out, "Host:\n  No .NET install found for {ARCH}.\n");
        }
        let others: Vec<&Install> = self
            .inventory
            .installs
            .iter()
            .enumerate()
            .filter(|(index, _)| Some(*index) != self.primary)
            .map(|(_, install)| install)
            .collect();
        if others.is_empty() {
            let _ = writeln!(out, "Other installs found:\n  None\n");
        } else {
            let _ = writeln!(out, "Other installs found:");
            for install in others {
                let _ = writeln!(out, "  {:<6} [{}]", install.arch.unwrap_or("?"), install.root.display());
                let _ = writeln!(out, "    found by {}", install.sources.join(", "));
                let _ = writeln!(
                    out,
                    "    hostfxr {}; SDKs {}; runtimes {}",
                    join(&versions(&install.hostfxr)),
                    join(&versions(&install.sdks)),
                    join(
                        &install
                            .frameworks
                            .iter()
                            .flat_map(|framework| framework.versions.iter().map(|c| format!("{} {}", short(&framework.name), c.version)))
                            .collect::<Vec<_>>()
                    )
                );
            }
            out.push('\n');
        }
        if !self.inventory.net_framework.is_empty() {
            let _ = writeln!(out, ".NET Framework installed:");
            for framework in &self.inventory.net_framework {
                let _ = write!(out, "  {}", framework.version);
                if let Some(build) = &framework.build {
                    let _ = write!(out, " ({build})");
                }
                if let Some(release) = framework.release {
                    let _ = write!(out, " release {release}");
                }
                out.push('\n');
            }
            out.push('\n');
        }
        let _ = writeln!(out, "Environment variables:");
        for name in ENV_SHOWN {
            let _ = writeln!(out, "  {name:<24} [{}]", std::env::var(name).unwrap_or_else(|_| "not set".into()));
        }
        out.push('\n');
        let _ = writeln!(out, "global.json file:");
        match self.sdk.as_ref().and_then(|resolution| resolution.request.global_json.as_ref()) {
            Some(path) => {
                let _ = writeln!(out, "  {}", path.display());
                if let Some(error) = self.sdk.as_ref().and_then(|resolution| resolution.request.global_json_error.as_ref()) {
                    let _ = writeln!(out, "  ignored: {error}");
                }
            }
            None => {
                let _ = writeln!(out, "  Not found");
            }
        }
        out
    }
}

const ENV_SHOWN: [&str; 6] = [
    "DOTNET_ROOT",
    "DOTNET_ROOT_X64",
    "DOTNET_ROOT_X86",
    "DOTNET_ROOT_ARM64",
    "DOTNET_HOST_PATH",
    "DOTNET_ROLL_FORWARD",
];

fn short(name: &str) -> &str {
    name.strip_prefix("Microsoft.").and_then(|rest| rest.strip_suffix(".App")).unwrap_or(name)
}

fn join(items: &[String]) -> String {
    if items.is_empty() { "none".into() } else { items.join(", ") }
}

fn write_install(out: &mut String, install: &Install) {
    let workloads = &install.workloads;
    let _ = writeln!(out, ".NET workloads installed:");
    if workloads.installed.is_empty() {
        let _ = writeln!(out, " There are no installed workloads to display.");
    }
    for workload in &workloads.installed {
        let _ = writeln!(out, " [{}] {} ({})", workload.id, workload.band, workload.source);
    }
    for (band, kind) in &workloads.installer_types {
        let _ = writeln!(out, " Installer type for {band}: {kind}");
    }
    for (band, version) in &workloads.sets {
        let _ = writeln!(out, " Workload set {version} ({band})");
    }
    out.push('\n');
    let _ = writeln!(out, ".NET SDKs installed:");
    if install.sdks.is_empty() {
        let _ = writeln!(out, "  No SDKs were found.");
    }
    for sdk in &install.sdks {
        let _ = writeln!(out, "  {} [{}]", sdk.version, install.root.join("sdk").display());
    }
    out.push('\n');
    let _ = writeln!(out, ".NET runtimes installed:");
    for framework in &install.frameworks {
        for runtime in &framework.versions {
            let _ = writeln!(
                out,
                "  {} {} [{}]",
                framework.name,
                runtime.version,
                install.root.join("shared").join(&framework.name).display()
            );
        }
    }
    out.push('\n');
}
