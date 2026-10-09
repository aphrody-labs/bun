//! `bun mcp install|uninstall [claude|codex|agy|all]`: registers this binary as the `bun` MCP
//! server in each agent's configuration, keeping every other server and setting:
//!
//! - Claude Code: `~/.claude.json` `mcpServers.bun` (`--project`: `./.mcp.json`)
//! - Codex: `$CODEX_HOME/config.toml` (`~/.codex`) table `[mcp_servers.bun]`
//! - Antigravity (agy): `~/.gemini/config/mcp_config.json` `mcpServers.bun`
//!
//! It also writes `~/.bun/agent/mcp/manifest.json` (version, executable, installed agents and the
//! tool descriptors). A server whose version differs from the manifest's rewrites the manifest and
//! re-registers the recorded agents, so an upgraded binary refreshes its plugin entries.

use std::path::{Path, PathBuf};

use serde_json::{Map, Value, json};

use crate::registry::Registry;
use crate::util::{agent_dir, env, home_dir, write_atomic};

const AGENTS: [&str; 3] = ["claude", "codex", "agy"];

fn manifest_path() -> PathBuf {
    agent_dir().join("mcp").join("manifest.json")
}

fn exe() -> String {
    std::env::current_exe()
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_else(|_| "bun".into())
}

fn read_json(path: &Path) -> Result<Map<String, Value>, String> {
    match std::fs::read_to_string(path) {
        Ok(text) if !text.trim().is_empty() => match serde_json::from_str::<Value>(&text) {
            Ok(Value::Object(o)) => Ok(o),
            Ok(_) => Err(format!("{}: not a JSON object", path.display())),
            Err(e) => Err(format!("{}: {e}", path.display())),
        },
        _ => Ok(Map::new()),
    }
}

fn write_json(path: &Path, value: &Map<String, Value>) -> Result<(), String> {
    let mut text = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
    text.push('\n');
    write_atomic(path, text.as_bytes()).map_err(|e| format!("{}: {e}", path.display()))
}

fn json_entry(path: &Path, entry: Option<Value>) -> Result<String, String> {
    let mut root = read_json(path)?;
    let servers = root
        .entry("mcpServers")
        .or_insert_with(|| Value::Object(Map::new()));
    let Value::Object(servers) = servers else {
        return Err(format!("{}: mcpServers is not an object", path.display()));
    };
    match entry {
        Some(e) => {
            servers.insert("bun".into(), e);
        }
        None => {
            if servers.remove("bun").is_none() {
                return Ok(format!("{}: no bun entry", path.display()));
            }
        }
    }
    write_json(path, &root)?;
    Ok(path.display().to_string())
}

fn toml_quote(s: &str) -> String {
    let mut out = String::from('"');
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

/// `text` without the `[mcp_servers.bun]` table and its sub-tables, plus `table` when given.
fn replace_toml_table(text: &str, table: Option<&str>) -> String {
    let mut out = String::with_capacity(text.len());
    let mut skipping = false;
    for line in text.split_inclusive('\n') {
        let t = line.trim();
        if t.starts_with('[') {
            let name = t.trim_start_matches('[').trim_end_matches(']').trim();
            let name = name
                .split('#')
                .next()
                .unwrap_or(name)
                .trim_end()
                .trim_end_matches(']')
                .trim();
            skipping = name == "mcp_servers.bun"
                || name == "mcp_servers.\"bun\""
                || name.starts_with("mcp_servers.bun.")
                || name.starts_with("mcp_servers.\"bun\".");
        }
        if !skipping {
            out.push_str(line);
        }
    }
    if let Some(table) = table {
        if !out.is_empty() && !out.ends_with('\n') {
            out.push('\n');
        }
        if !out.is_empty() && !out.ends_with("\n\n") {
            out.push('\n');
        }
        out.push_str(table);
    }
    out
}

fn codex_config() -> PathBuf {
    env("CODEX_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| home_dir().join(".codex"))
        .join("config.toml")
}

fn apply(agent: &str, install: bool, project: bool, cwd: &Path) -> Result<String, String> {
    let exe = exe();
    match agent {
        "claude" => {
            let path = if project {
                cwd.join(".mcp.json")
            } else {
                home_dir().join(".claude.json")
            };
            json_entry(
                &path,
                install
                    .then(|| json!({"type": "stdio", "command": exe, "args": ["mcp"], "env": {}})),
            )
        }
        "codex" => {
            let path = codex_config();
            let text = std::fs::read_to_string(&path).unwrap_or_default();
            let table = install.then(|| {
                format!(
                    "[mcp_servers.bun]\ncommand = {}\nargs = [\"mcp\"]\nstartup_timeout_sec = 10\n",
                    toml_quote(&exe)
                )
            });
            let next = replace_toml_table(&text, table.as_deref());
            write_atomic(&path, next.as_bytes()).map_err(|e| format!("{}: {e}", path.display()))?;
            Ok(path.display().to_string())
        }
        "agy" => json_entry(
            &home_dir()
                .join(".gemini")
                .join("config")
                .join("mcp_config.json"),
            install.then(|| json!({"command": exe, "args": ["mcp"]})),
        ),
        other => Err(format!(
            "unknown agent \"{other}\" (claude, codex, agy or all)"
        )),
    }
}

fn write_manifest(registry: &Registry, installed: &[String]) -> Result<(), String> {
    let manifest = json!({
        "name": "bun",
        "version": crate::cli::version(),
        "exe": exe(),
        "installed": installed,
        "tools": registry.descriptors(),
    });
    let Value::Object(map) = manifest else {
        unreachable!()
    };
    write_json(&manifest_path(), &map)
}

fn installed_agents() -> Vec<String> {
    read_json(&manifest_path())
        .ok()
        .and_then(|m| m.get("installed").cloned())
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default()
}

/// `bun mcp install|uninstall <agents...> [--project]`.
pub(crate) fn run(registry: &Registry, install: bool, args: &[String], cwd: &Path) -> i32 {
    let project = args.iter().any(|a| a == "--project");
    let mut agents: Vec<String> = args
        .iter()
        .filter(|a| !a.starts_with('-'))
        .cloned()
        .collect();
    if agents.is_empty() || agents.iter().any(|a| a == "all") {
        agents = AGENTS.iter().map(|a| (*a).to_owned()).collect();
    }
    let mut code = 0;
    let mut recorded = installed_agents();
    for agent in &agents {
        match apply(agent, install, project, cwd) {
            Ok(path) => {
                println!(
                    "{} {agent}: {path}",
                    if install { "installed" } else { "removed" }
                );
                recorded.retain(|a| a != agent);
                if install && !project {
                    recorded.push(agent.clone());
                }
            }
            Err(e) => {
                eprintln!("error: {e}");
                code = 1;
            }
        }
    }
    recorded.sort();
    recorded.dedup();
    if let Err(e) = write_manifest(registry, &recorded) {
        eprintln!("error: {e}");
        code = 1;
    }
    code
}

/// Called at server start, off the response path: when the installed executable was replaced by
/// another version (`bun upgrade`), rewrite the manifest and refresh the recorded agent entries.
/// Another binary (a debug build, a second install) leaves them alone.
pub(crate) fn refresh_if_stale(registry: &Registry, cwd: &Path) {
    let Ok(manifest) = read_json(&manifest_path()) else {
        return;
    };
    if manifest.get("exe").and_then(Value::as_str) != Some(exe().as_str())
        || manifest.get("version").and_then(Value::as_str) == Some(crate::cli::version())
    {
        return;
    }
    let agents = installed_agents();
    for agent in &agents {
        let _ = apply(agent, true, false, cwd);
    }
    let _ = write_manifest(registry, &agents);
}
