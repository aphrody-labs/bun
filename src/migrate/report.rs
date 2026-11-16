//! The report: what was found, what changed, and what to do next.

use crate::json::quote;
use crate::registry::Severity;
use crate::rust_plan::{Item, ItemKind, Status};
use crate::scan::Finding;
use crate::workspace::Workspace;

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Format {
    Text,
    Json,
    Jsonl,
    Markdown,
    Sarif,
}

impl Format {
    pub fn parse(name: &[u8]) -> Option<Format> {
        Some(match name {
            b"text" => Format::Text,
            b"json" => Format::Json,
            b"jsonl" => Format::Jsonl,
            b"md" | b"markdown" => Format::Markdown,
            b"sarif" => Format::Sarif,
            _ => return None,
        })
    }
}

pub struct Report {
    pub files_scanned: usize,
    pub findings: Vec<Finding>,
    pub workspace: Workspace,
    pub plan: Option<Vec<Item>>,
    pub changed: Vec<Vec<u8>>,
}

const TEXT_LIMIT: usize = 100;

impl Report {
    pub fn render(&self, format: Format) -> Vec<u8> {
        match format {
            Format::Text => self.text(),
            Format::Json => self.json(),
            Format::Jsonl => self.jsonl(),
            Format::Markdown => self.markdown(),
            Format::Sarif => self.sarif(),
        }
    }

    /// The findings that a rewrite has not fixed.
    pub fn remaining(&self) -> usize {
        self.findings.iter().filter(|finding| !finding.applied && finding.severity >= Severity::Warn).count()
    }

    fn rules(&self) -> Vec<(&[u8], Severity, usize, usize)> {
        let mut rules: Vec<(&[u8], Severity, usize, usize)> = Vec::new();
        for finding in &self.findings {
            match rules.iter_mut().find(|(id, ..)| *id == finding.rule.as_slice()) {
                Some(entry) => {
                    entry.2 += 1;
                    entry.3 += usize::from(finding.fixable);
                }
                None => rules.push((&finding.rule, finding.severity, 1, usize::from(finding.fixable))),
            }
        }
        rules.sort_by(|a, b| b.2.cmp(&a.2).then(a.0.cmp(b.0)));
        rules
    }

    fn setup_line(&self) -> String {
        let workspace = &self.workspace;
        let mut line = format!("package manager: {}", workspace.package_manager);
        if !workspace.lockfiles.is_empty() {
            line += &format!(" (lockfiles: {})", join(&workspace.lockfiles, ", "));
        }
        if !workspace.task_runners.is_empty() {
            line += &format!("; task runner: {}", workspace.task_runners.join(", "));
        }
        if !workspace.turbo_tasks.is_empty() {
            line += &format!(" (tasks: {})", join(&workspace.turbo_tasks, ", "));
        }
        line
    }

    fn next_steps(&self) -> Vec<String> {
        let mut steps = Vec::new();
        if self.workspace.package_manager != "bun" || !self.workspace.lockfiles.iter().any(|name| name.starts_with(b"bun.lock")) {
            steps.push("bun install    reads the lockfile of the old package manager and writes bun.lock".to_string());
        }
        let rival: Vec<&Vec<u8>> = self.workspace.lockfiles.iter().filter(|name| !name.starts_with(b"bun.lock")).collect();
        if !rival.is_empty() {
            steps.push(format!("delete {} once bun.lock is committed", rival.iter().map(|name| String::from_utf8_lossy(name)).collect::<Vec<_>>().join(", ")));
        }
        if self.findings.iter().any(|finding| finding.fixable && !finding.applied) {
            steps.push("bun migrate --write    applies the safe rewrites; --aggressive also applies the ones that change behavior".to_string());
        }
        steps
    }

    fn text(&self) -> Vec<u8> {
        let mut out = String::new();
        let workspace = &self.workspace;
        out += &format!("{} files scanned, {} packages\n{}\n", self.files_scanned, workspace.packages.len() + 1, self.setup_line());
        if !self.changed.is_empty() {
            out += &format!("\nchanged {} files\n", self.changed.len());
        }
        if !workspace.protocols.is_empty() {
            let protocols: Vec<String> = workspace.protocols.iter().map(|(name, count)| format!("{name} {count}")).collect();
            out += &format!("dependency protocols: {} (bun install reads them)\n", protocols.join(", "));
        }
        let rules = self.rules();
        if !rules.is_empty() {
            out += "\nrule                             severity  findings  fixable\n";
            for (id, severity, count, fixable) in &rules {
                out += &format!("{:<32} {:<9} {:>8}  {:>7}\n", String::from_utf8_lossy(id), severity.name(), count, fixable);
            }
            out += "\n";
            for finding in self.findings.iter().filter(|finding| finding.severity >= Severity::Warn).take(TEXT_LIMIT) {
                out += &format!("{}:{}:{} {} {}: {}", String::from_utf8_lossy(&finding.file), finding.line, finding.column, finding.severity.name(), String::from_utf8_lossy(&finding.rule), String::from_utf8_lossy(&finding.message));
                if let Some(replacement) = &finding.replacement {
                    out += &format!(" ({} -> {})", String::from_utf8_lossy(&finding.original), String::from_utf8_lossy(replacement));
                }
                out += if finding.applied { " [applied]\n" } else { "\n" };
            }
            let shown = self.findings.iter().filter(|finding| finding.severity >= Severity::Warn).count();
            if shown > TEXT_LIMIT {
                out += &format!("... {} more, see --report json\n", shown - TEXT_LIMIT);
            }
        }
        if let Some(plan) = &self.plan {
            out += &format!("\nrust plan: {} addons, {} packages to port, {} tool calls\n", count(plan, ItemKind::Addon), count(plan, ItemKind::Hot), count(plan, ItemKind::Tool));
            for item in plan.iter().take(TEXT_LIMIT) {
                out += &format!("{}:{} {} -> {} {}\n", String::from_utf8_lossy(&item.file), item.line, String::from_utf8_lossy(&item.id), String::from_utf8_lossy(&item.to), String::from_utf8_lossy(&item.pin));
            }
        }
        let steps = self.next_steps();
        if !steps.is_empty() {
            out += "\nnext:\n";
            for step in steps {
                out += &format!("  {step}\n");
            }
        }
        out.into_bytes()
    }

    fn findings_json(&self) -> String {
        let items: Vec<String> = self.findings.iter().map(finding_json).collect();
        format!("[{}]", items.join(","))
    }

    fn json(&self) -> Vec<u8> {
        let workspace = &self.workspace;
        let packages: Vec<String> = workspace
            .packages
            .iter()
            .map(|package| format!("{{\"dir\":{},\"name\":{},\"scripts\":{},\"internalDependencies\":{}}}", s(&package.dir), s(&package.name), package.scripts, package.internal))
            .collect();
        let protocols: Vec<String> = workspace.protocols.iter().map(|(name, count)| format!("{{\"protocol\":{},\"count\":{}}}", s(name.as_bytes()), count)).collect();
        let mut out = format!(
            "{{\"schemaVersion\":1,\"summary\":{{\"filesScanned\":{},\"findings\":{},\"remaining\":{},\"changed\":{}}},\"workspace\":{{\"packageManager\":\"{}\",\"lockfiles\":{},\"taskRunners\":{},\"turboTasks\":{},\"patterns\":{},\"packages\":[{}],\"protocols\":[{}]}},\"findings\":{}",
            self.files_scanned,
            self.findings.len(),
            self.remaining(),
            list(&self.changed),
            workspace.package_manager,
            list(&workspace.lockfiles),
            strs(&workspace.task_runners),
            list(&workspace.turbo_tasks),
            list(&workspace.patterns),
            packages.join(","),
            protocols.join(","),
            self.findings_json()
        );
        if let Some(plan) = &self.plan {
            let items: Vec<String> = plan.iter().map(item_json).collect();
            out += &format!(",\"rust\":{{\"addons\":{},\"hot\":{},\"tools\":{},\"items\":[{}]}}", count(plan, ItemKind::Addon), count(plan, ItemKind::Hot), count(plan, ItemKind::Tool), items.join(","));
        }
        out += "}\n";
        out.into_bytes()
    }

    fn jsonl(&self) -> Vec<u8> {
        let mut out = String::new();
        for finding in &self.findings {
            out += &finding_json(finding);
            out += "\n";
        }
        for item in self.plan.iter().flatten() {
            out += &item_json(item);
            out += "\n";
        }
        out.into_bytes()
    }

    fn markdown(&self) -> Vec<u8> {
        let workspace = &self.workspace;
        let mut out = format!("# bun migrate\n\n{} files scanned, {} packages. {}.\n\n", self.files_scanned, workspace.packages.len() + 1, self.setup_line());
        let rules = self.rules();
        if !rules.is_empty() {
            out += "## Rules\n\n| rule | severity | findings | fixable |\n| --- | --- | ---: | ---: |\n";
            for (id, severity, count, fixable) in &rules {
                out += &format!("| `{}` | {} | {} | {} |\n", String::from_utf8_lossy(id), severity.name(), count, fixable);
            }
            out += "\n";
        }
        if !workspace.packages.is_empty() {
            out += "## Packages\n\n| package | directory | scripts | internal dependencies |\n| --- | --- | ---: | ---: |\n";
            for package in &workspace.packages {
                out += &format!("| {} | `{}` | {} | {} |\n", String::from_utf8_lossy(Workspace::label(package)), String::from_utf8_lossy(&package.dir), package.scripts, package.internal);
            }
            out += "\n";
        }
        if let Some(plan) = &self.plan {
            out += "## Rust\n\n| id | status | to | pin | where | note |\n| --- | --- | --- | --- | --- | --- |\n";
            for item in plan {
                let status = match item.status {
                    Status::Rewritten => "rewritten",
                    Status::Manual => "manual",
                    Status::Plan => "plan",
                };
                out += &format!("| {} | {} | {} | {} | `{}:{}` | {} |\n", String::from_utf8_lossy(&item.id), status, String::from_utf8_lossy(&item.to), String::from_utf8_lossy(&item.pin), String::from_utf8_lossy(&item.file), item.line, String::from_utf8_lossy(&item.note));
            }
            out += "\n";
        }
        let steps = self.next_steps();
        if !steps.is_empty() {
            out += "## Next\n\n";
            for step in steps {
                out += &format!("- {step}\n");
            }
        }
        out.into_bytes()
    }

    fn sarif(&self) -> Vec<u8> {
        let rules: Vec<String> = self.rules().iter().map(|(id, ..)| format!("{{\"id\":{}}}", s(id))).collect();
        let results: Vec<String> = self
            .findings
            .iter()
            .map(|finding| {
                let level = match finding.severity {
                    Severity::Info => "note",
                    Severity::Warn => "warning",
                    Severity::Error => "error",
                };
                format!(
                    "{{\"ruleId\":{},\"level\":\"{}\",\"message\":{{\"text\":{}}},\"locations\":[{{\"physicalLocation\":{{\"artifactLocation\":{{\"uri\":{}}},\"region\":{{\"startLine\":{},\"startColumn\":{}}}}}}}]}}",
                    s(&finding.rule),
                    level,
                    s(&finding.message),
                    s(&finding.file),
                    finding.line,
                    finding.column
                )
            })
            .collect();
        format!("{{\"$schema\":\"https://json.schemastore.org/sarif-2.1.0.json\",\"version\":\"2.1.0\",\"runs\":[{{\"tool\":{{\"driver\":{{\"name\":\"bun migrate\",\"rules\":[{}]}}}},\"results\":[{}]}}]}}\n", rules.join(","), results.join(",")).into_bytes()
    }
}

fn count(plan: &[Item], kind: ItemKind) -> usize {
    plan.iter().filter(|item| item.kind == kind).count()
}

fn s(text: &[u8]) -> String {
    String::from_utf8_lossy(&quote(text)).into_owned()
}

fn list(items: &[Vec<u8>]) -> String {
    format!("[{}]", items.iter().map(|item| s(item)).collect::<Vec<_>>().join(","))
}

fn strs(items: &[&str]) -> String {
    format!("[{}]", items.iter().map(|item| s(item.as_bytes())).collect::<Vec<_>>().join(","))
}

fn join(items: &[Vec<u8>], separator: &str) -> String {
    items.iter().map(|item| String::from_utf8_lossy(item)).collect::<Vec<_>>().join(separator)
}

fn finding_json(finding: &Finding) -> String {
    let replacement = finding.replacement.as_ref().map_or_else(|| "null".to_string(), |text| s(text));
    format!(
        "{{\"file\":{},\"line\":{},\"column\":{},\"ruleId\":{},\"severity\":\"{}\",\"message\":{},\"original\":{},\"replacement\":{},\"fixable\":{},\"aggressive\":{},\"applied\":{}}}",
        s(&finding.file),
        finding.line,
        finding.column,
        s(&finding.rule),
        finding.severity.name(),
        s(&finding.message),
        s(&finding.original),
        replacement,
        finding.fixable,
        finding.aggressive,
        finding.applied
    )
}

fn item_json(item: &Item) -> String {
    let kind = match item.kind {
        ItemKind::Addon => "addon",
        ItemKind::Hot => "hot",
        ItemKind::Tool => "tool",
    };
    let status = match item.status {
        Status::Rewritten => "rewritten",
        Status::Manual => "manual",
        Status::Plan => "plan",
    };
    format!("{{\"kind\":\"{}\",\"id\":{},\"file\":{},\"line\":{},\"status\":\"{}\",\"to\":{},\"pin\":{},\"note\":{}}}", kind, s(&item.id), s(&item.file), item.line, status, s(&item.to), s(&item.pin), s(&item.note))
}
