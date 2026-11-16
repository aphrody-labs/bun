//! `--target rust`: the plan to move native addons and CPU-bound packages to Rust, and the JavaScript tools that
//! already have a command that replaces them.

use bun_core::strings;

use crate::bytes::LineIndex;
use crate::json;
use crate::registry::{Registry, ToolRule};
use crate::scan::Scanner;

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum ItemKind {
    Addon,
    Hot,
    Tool,
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Status {
    /// The text was rewritten.
    Rewritten,
    /// A rewrite exists but the call is not one that a mechanical rewrite understands.
    Manual,
    /// Work for a person.
    Plan,
}

pub struct Item {
    pub kind: ItemKind,
    pub id: Vec<u8>,
    pub file: Vec<u8>,
    pub line: u32,
    pub status: Status,
    /// A command for a tool, a crate for an addon or a hot package.
    pub to: Vec<u8>,
    /// `github:owner/repo` of the crate.
    pub pin: Vec<u8>,
    pub note: Vec<u8>,
}

const CDYLIB: &[u8] = b"Rust cdylib loaded with bun:ffi";
const RUNNERS: [&[u8]; 8] = [b"npx ", b"bunx ", b"pnpm exec ", b"pnpm dlx ", b"yarn dlx ", b"yarn ", b"bun x ", b"npm exec "];

pub(crate) enum Outcome {
    Rewritten { command: Vec<u8>, tool: usize },
    Manual { reason: Vec<u8>, tool: usize },
}

fn pin_of(registry: &Registry, crate_name: &[u8]) -> Vec<u8> {
    let first = strings::index_of_any(crate_name, b", ").map_or(crate_name, |end| &crate_name[..end]);
    registry.repo_of(first).map(|repo| [&b"github:"[..], repo].concat()).unwrap_or_default()
}

fn strip_runners(mut line: &[u8]) -> &[u8] {
    while let Some(rest) = RUNNERS.iter().find_map(|runner| line.strip_prefix(*runner)) {
        line = rest.trim_ascii_start();
    }
    line
}

/// Maps one command, which has no shell operators, to the replacement of its tool. `None`: not a known tool.
pub(crate) fn rewrite_tool(registry: &Registry, command: &[u8]) -> Option<Outcome> {
    let line = strip_runners(command.trim_ascii());
    let tokens: Vec<&[u8]> = line.split(|byte| byte.is_ascii_whitespace()).filter(|token| !token.is_empty()).collect();
    let first = *tokens.first()?;
    let index = registry.tools.iter().position(|tool| tool.name == first)?;
    let tool: &ToolRule = &registry.tools[index];
    let manual = |reason: &[u8]| Some(Outcome::Manual { reason: reason.to_vec(), tool: index });
    if line.iter().any(|byte| b"|$`<>(){}*?&;".contains(byte)) {
        return manual(b"shell syntax in the command");
    }
    if tool.flags.is_empty() {
        return manual(&tool.note);
    }
    let mut out: Vec<Vec<u8>> = vec![tool.to.clone()];
    let mut seen: Vec<&[u8]> = Vec::new();
    let mut at = 1;
    while at < tokens.len() {
        let token = tokens[at];
        at += 1;
        if token.starts_with(b"-") {
            let (name, has_value) = match crate::bytes::find_from(token, b"=", 0) {
                Some(eq) => (&token[..eq], true),
                None => (token, false),
            };
            let Some((_, becomes)) = tool.flags.iter().find(|(flag, _)| flag == name) else {
                return manual(&[&b"flag "[..], name, b" has no equivalent"].concat());
            };
            seen.push(name);
            if tool.valued.iter().any(|flag| flag == name) {
                out.push(becomes.clone());
                if has_value {
                    let last = out.len() - 1;
                    out[last] = [becomes.as_slice(), &token[name.len()..]].concat();
                } else if let Some(value) = tokens.get(at) {
                    out.push(value.to_vec());
                    at += 1;
                }
            } else if !becomes.is_empty() {
                out.push(becomes.clone());
            }
        } else if tool.paths {
            out.push(token.to_vec());
        } else {
            return manual(b"positional arguments");
        }
    }
    if !tool.require.is_empty() && !tool.require.iter().any(|flag| seen.contains(&flag.as_slice())) {
        return manual(&[&b"only runs with "[..], &tool.require.concat(), b" map to this command"].concat());
    }
    Some(Outcome::Rewritten { command: out.join(&b' '), tool: index })
}

/// Rewrites every tool segment of a package.json script. Segments are separated by `&&`, `||` and `;`.
pub(crate) fn rewrite_script(registry: &Registry, script: &[u8]) -> (Vec<u8>, Vec<Outcome>) {
    let mut out = Vec::with_capacity(script.len());
    let mut outcomes = Vec::new();
    let mut at = 0;
    let mut segment_start = 0;
    let flush = |segment: &[u8], out: &mut Vec<u8>, outcomes: &mut Vec<Outcome>| {
        match rewrite_tool(registry, segment) {
            Some(Outcome::Rewritten { command, tool }) => {
                let lead = segment.len() - segment.trim_ascii_start().len();
                out.extend_from_slice(&segment[..lead]);
                out.extend_from_slice(&command);
                out.extend_from_slice(&segment[segment.trim_ascii_end().len()..]);
                outcomes.push(Outcome::Rewritten { command: command.clone(), tool });
            }
            Some(manual) => {
                out.extend_from_slice(segment);
                outcomes.push(manual);
            }
            None => out.extend_from_slice(segment),
        }
    };
    while at < script.len() {
        let separator = if script[at..].starts_with(b"&&") || script[at..].starts_with(b"||") { 2 } else { usize::from(script[at] == b';') };
        if separator > 0 {
            flush(&script[segment_start..at], &mut out, &mut outcomes);
            out.extend_from_slice(&script[at..at + separator]);
            at += separator;
            segment_start = at;
        } else {
            at += 1;
        }
    }
    flush(&script[segment_start..], &mut out, &mut outcomes);
    (out, outcomes)
}

impl Scanner<'_> {
    /// The plan items of a package.json, and its text with the mechanical rewrites of scripts applied.
    pub(crate) fn plan_manifest(&self, path: &[u8], text: &[u8], items: &mut Vec<Item>) -> Option<Vec<u8>> {
        let root = json::parse(text).ok()?;
        let lines = LineIndex::new(text);
        let registry = self.registry;
        let mut edits: Vec<(usize, usize, Vec<u8>)> = Vec::new();
        let mut add = |kind, id: &[u8], offset: usize, status, to: &[u8], pin: Vec<u8>, note: &[u8]| {
            items.push(Item { kind, id: id.to_vec(), file: path.to_vec(), line: lines.locate(offset).0, status, to: to.to_vec(), pin, note: note.to_vec() });
        };
        if let Some(scripts) = root.get(b"scripts") {
            for script in scripts.members() {
                let Some(command) = script.value.as_str() else { continue };
                let id = [&b"scripts."[..], &script.key].concat();
                let (rewritten, outcomes) = rewrite_script(registry, command);
                for outcome in &outcomes {
                    match outcome {
                        Outcome::Rewritten { command, tool } => {
                            let rule = &registry.tools[*tool];
                            let status = if self.apply.safe { Status::Rewritten } else { Status::Plan };
                            add(ItemKind::Tool, &id, script.value.start, status, command, pin_of(registry, &rule.crate_name), &rule.note);
                        }
                        Outcome::Manual { reason, tool } => {
                            let rule = &registry.tools[*tool];
                            add(ItemKind::Tool, &id, script.value.start, Status::Manual, &rule.to, pin_of(registry, &rule.crate_name), reason);
                        }
                    }
                }
                if self.apply.safe && rewritten != command {
                    edits.push((script.value.start, script.value.end, json::quote(&rewritten)));
                }
                if strings_contain(command, b"node-gyp") || strings_contain(command, b"cmake-js") {
                    add(ItemKind::Addon, &id, script.value.start, Status::Plan, CDYLIB, Vec::new(), b"native build step");
                }
            }
        }
        if let Some(node) = root.get(b"gypfile") {
            add(ItemKind::Addon, b"gypfile", node.start, Status::Plan, CDYLIB, Vec::new(), b"binding.gyp addon");
        }
        for section in [&b"dependencies"[..], b"devDependencies", b"optionalDependencies"] {
            let Some(deps) = root.get(section) else { continue };
            for dep in deps.members() {
                let from = [b"in ", section].concat();
                if registry.addons.contains(&dep.key) {
                    add(ItemKind::Addon, &dep.key, dep.key_start, Status::Plan, CDYLIB, Vec::new(), &from);
                } else if let Some(hot) = registry.hot.iter().find(|hot| hot.packages.contains(&dep.key)) {
                    let note = [&hot.area[..], b" (", &from, b")"].concat();
                    add(ItemKind::Hot, &dep.key, dep.key_start, Status::Plan, &hot.crate_name, pin_of(registry, &hot.crate_name), &note);
                } else if let Some(tool) = registry.tools.iter().find(|tool| tool.name == dep.key) {
                    let note = [&from[..], b": ", &tool.note].concat();
                    add(ItemKind::Tool, &dep.key, dep.key_start, Status::Plan, &tool.to, pin_of(registry, &tool.crate_name), &note);
                }
            }
        }
        (!edits.is_empty()).then(|| {
            edits.sort_by_key(|edit| edit.0);
            let mut out = Vec::with_capacity(text.len());
            let mut at = 0;
            for (start, end, replacement) in edits {
                out.extend_from_slice(&text[at..start]);
                out.extend_from_slice(&replacement);
                at = end;
            }
            out.extend_from_slice(&text[at..]);
            out
        })
    }

    /// The plan items of a source file: imports of addon loaders and hot packages, and `.node` binaries.
    pub(crate) fn plan_source(&self, path: &[u8], text: &[u8], items: &mut Vec<Item>) {
        let registry = self.registry;
        let lines = LineIndex::new(text);
        let mut seen: Vec<&[u8]> = Vec::new();
        for found in self.imports.find_all(text) {
            let Some((start, end)) = found.group_range(2) else { continue };
            let specifier = &text[start..end];
            let package = crate::scan::package_name(specifier);
            let line = lines.locate(start).0;
            if specifier.ends_with(b".node") {
                items.push(Item { kind: ItemKind::Addon, id: b"*.node".to_vec(), file: path.to_vec(), line, status: Status::Plan, to: CDYLIB.to_vec(), pin: Vec::new(), note: [&b".node binary ("[..], specifier, b")"].concat() });
            }
            if seen.contains(&package) {
                continue;
            }
            seen.push(package);
            if let Some(hot) = registry.hot.iter().find(|hot| hot.packages.iter().any(|name| name == package)) {
                items.push(Item { kind: ItemKind::Hot, id: package.to_vec(), file: path.to_vec(), line, status: Status::Plan, to: hot.crate_name.clone(), pin: pin_of(registry, &hot.crate_name), note: hot.area.clone() });
            } else if registry.addons.iter().any(|name| name == package) {
                items.push(Item { kind: ItemKind::Addon, id: package.to_vec(), file: path.to_vec(), line, status: Status::Plan, to: CDYLIB.to_vec(), pin: Vec::new(), note: b"native addon loader".to_vec() });
            }
        }
        if let Some(at) = crate::bytes::find_from(text, b"process.dlopen", 0) {
            items.push(Item { kind: ItemKind::Addon, id: b"process.dlopen".to_vec(), file: path.to_vec(), line: lines.locate(at).0, status: Status::Plan, to: CDYLIB.to_vec(), pin: Vec::new(), note: b"loads a native .node addon directly".to_vec() });
        }
    }
}

fn strings_contain(haystack: &[u8], needle: &[u8]) -> bool {
    bun_core::strings::contains(haystack, needle)
}
