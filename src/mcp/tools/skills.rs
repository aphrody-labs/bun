//! `skills_list` / `skill_read`: the repository skills (`.claude/skills`, embedded) plus the skills
//! installed on this machine: `~/.claude/skills`, `~/.codex/skills`, `~/.bun/agent/skills` (the
//! legacy agent store), `~/.bun/agent-plugin/<profile>/skills`, `$BUN_MCP_SKILLS_PATH`
//! and the project's `.claude/skills`. A later source
//! replaces an earlier skill of the same name. Skills are also MCP prompts and resources.

use std::fmt::Write as _;
use std::path::{Path, PathBuf};

use crate::embedded;
use crate::registry::{Annotations, Args, Context, Output, Tool, ToolError};
use crate::util::{agent_dir, clip, env, field, frontmatter, home_dir, project_root, words};

pub(crate) enum Body {
    Embedded(&'static str),
    Disk(PathBuf),
}

pub(crate) struct Skill {
    pub(crate) name: String,
    pub(crate) description: String,
    pub(crate) source: String,
    /// Relative path (`SKILL.md` first) and content.
    files: Vec<(String, Body)>,
}

impl Skill {
    fn read(&self, rel: &str) -> Option<String> {
        let (_, body) = self.files.iter().find(|(p, _)| p == rel)?;
        match body {
            Body::Embedded(s) => Some((*s).to_owned()),
            Body::Disk(p) => std::fs::read_to_string(p).ok(),
        }
    }

    /// The `SKILL.md` (or single-file skill) text.
    pub(crate) fn main_text(&self) -> String {
        self.files
            .first()
            .and_then(|(p, _)| self.read(p))
            .unwrap_or_default()
    }
}

fn describe(name_hint: &str, text: &str) -> (String, String) {
    let (fields, body) = frontmatter(text);
    let name = field(&fields, "name").unwrap_or(name_hint).to_owned();
    let description = field(&fields, "description")
        .map(str::to_owned)
        .unwrap_or_else(|| {
            body.lines()
                .map(str::trim)
                .find(|l| !l.is_empty() && !l.starts_with('#'))
                .unwrap_or("")
                .to_owned()
        });
    (name, description)
}

fn embedded_skills(out: &mut Vec<Skill>) {
    let files = embedded::skills();
    let mut i = 0;
    while i < files.len() {
        let (path, text) = &files[i];
        match path.split_once('/') {
            None => {
                let stem = path.strip_suffix(".md").unwrap_or(path);
                let (name, description) = describe(stem, text);
                out.push(Skill {
                    name,
                    description,
                    source: "bun repository".into(),
                    files: vec![(path.clone(), Body::Embedded(text.as_str()))],
                });
                i += 1;
            }
            Some((dir, _)) => {
                let prefix = format!("{dir}/");
                let mut group: Vec<(String, Body)> = Vec::new();
                while i < files.len() && files[i].0.starts_with(&prefix) {
                    group.push((
                        files[i].0[prefix.len()..].to_owned(),
                        Body::Embedded(files[i].1.as_str()),
                    ));
                    i += 1;
                }
                group.sort_by_key(|(p, _)| p != "SKILL.md");
                let main = match group.first() {
                    Some((p, Body::Embedded(t))) if p == "SKILL.md" => *t,
                    _ => continue,
                };
                let (name, description) = describe(dir, main);
                out.push(Skill {
                    name,
                    description,
                    source: "bun repository".into(),
                    files: group,
                });
            }
        }
    }
}

fn disk_files(dir: &Path, rel: &str, depth: usize, out: &mut Vec<(String, Body)>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        if out.len() >= 64 {
            return;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') {
            continue;
        }
        let path = entry.path();
        let rel_name = if rel.is_empty() {
            name
        } else {
            format!("{rel}/{name}")
        };
        match entry.file_type() {
            Ok(t) if t.is_dir() && depth < 3 => disk_files(&path, &rel_name, depth + 1, out),
            Ok(t) if t.is_file() => out.push((rel_name, Body::Disk(path))),
            _ => {}
        }
    }
}

fn disk_skills(root: &Path, source: &str, out: &mut Vec<Skill>) {
    let Ok(entries) = std::fs::read_dir(root) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let stem = entry.file_name().to_string_lossy().into_owned();
        if path.is_dir() {
            let main = path.join("SKILL.md");
            let Ok(text) = std::fs::read_to_string(&main) else {
                continue;
            };
            let (name, description) = describe(&stem, &text);
            let mut files = Vec::new();
            disk_files(&path, "", 0, &mut files);
            files.sort_by(|a, b| (a.0 != "SKILL.md", &a.0).cmp(&(b.0 != "SKILL.md", &b.0)));
            out.push(Skill {
                name,
                description,
                source: source.to_owned(),
                files,
            });
        } else if let Some(stem) = stem.strip_suffix(".md") {
            let Ok(text) = std::fs::read_to_string(&path) else {
                continue;
            };
            let (name, description) = describe(stem, &text);
            out.push(Skill {
                name,
                description,
                source: source.to_owned(),
                files: vec![(format!("{stem}.md"), Body::Disk(path))],
            });
        }
    }
}

/// Every visible skill, sorted by name.
pub(crate) fn all(ctx: &Context) -> Vec<Skill> {
    let mut found = Vec::new();
    embedded_skills(&mut found);
    let home = home_dir();
    let mut roots: Vec<(PathBuf, String)> = vec![
        (
            home.join(".claude").join("skills"),
            "~/.claude/skills".into(),
        ),
        (
            env("CODEX_HOME")
                .map(PathBuf::from)
                .unwrap_or_else(|| home.join(".codex"))
                .join("skills"),
            "~/.codex/skills".into(),
        ),
        (agent_dir().join("skills"), "~/.bun/agent/skills".into()),
    ];
    let agent = match ctx.agent() {
        "claude" => "claude",
        "agy" => "agy",
        _ => "codex",
    };
    roots.push((
        agent_dir()
            .with_file_name("agent-plugin")
            .join(agent)
            .join("skills"),
        format!("installed bun plugin ({agent})"),
    ));
    if let Some(list) = env("BUN_MCP_SKILLS_PATH") {
        for p in std::env::split_paths(&list) {
            let label = p.display().to_string();
            roots.push((p, label));
        }
    }
    roots.push((
        project_root(&ctx.cwd).join(".claude").join("skills"),
        "project".into(),
    ));
    for (root, label) in &roots {
        disk_skills(root, label, &mut found);
    }
    let mut skills: Vec<Skill> = Vec::with_capacity(found.len());
    for skill in found {
        match skills.iter().position(|s| s.name == skill.name) {
            Some(i) => skills[i] = skill,
            None => skills.push(skill),
        }
    }
    skills.sort_by(|a, b| a.name.cmp(&b.name));
    skills
}

fn skills_list(ctx: &Context, args: &Args<'_>) -> Result<Output, ToolError> {
    let terms: Vec<String> = args
        .opt_str("query")
        .map(|q| words(q).collect())
        .unwrap_or_default();
    let limit = args.uint("limit", 50, 200) as usize;
    let offset = args.uint("offset", 0, 10_000) as usize;
    let skills: Vec<Skill> = all(ctx)
        .into_iter()
        .filter(|s| {
            let hay = format!("{} {}", s.name, s.description).to_lowercase();
            terms.iter().all(|t| hay.contains(t.as_str()))
        })
        .collect();
    let end = (offset + limit).min(skills.len());
    let mut out = format!(
        "{} skills (showing {}-{}). Read one with skill_read {{\"name\": ...}}.\n\n",
        skills.len(),
        (offset + 1).min(end),
        end
    );
    for s in skills.iter().take(end).skip(offset) {
        let _ = writeln!(
            out,
            "- {}: {} [{}]",
            s.name,
            clip(&s.description, 240),
            s.source
        );
    }
    if end < skills.len() {
        let _ = write!(out, "\nMore: skills_list {{\"offset\": {end}}}\n");
    }
    Ok(Output::text(out))
}

fn skill_read(ctx: &Context, args: &Args<'_>) -> Result<Output, ToolError> {
    let name = args.str("name")?;
    let skills = all(ctx);
    let Some(skill) = skills.iter().find(|s| s.name == name) else {
        let names: Vec<&str> = skills.iter().map(|s| s.name.as_str()).collect();
        return Ok(Output::error(format!(
            "No skill named \"{name}\". Known: {}",
            names.join(", ")
        )));
    };
    let file = args.opt_str("file");
    let rel = file.unwrap_or_else(|| {
        skill
            .files
            .first()
            .map(|(p, _)| p.as_str())
            .unwrap_or("SKILL.md")
    });
    let Some(text) = skill.read(rel) else {
        return Ok(Output::error(format!("No file \"{rel}\" in skill {name}")));
    };
    let mut out = format!(
        "<!-- skill {} ({}) — {rel} -->\n{text}",
        skill.name, skill.source
    );
    if skill.files.len() > 1 && file.is_none() {
        let others: Vec<&str> = skill
            .files
            .iter()
            .skip(1)
            .map(|(p, _)| p.as_str())
            .collect();
        let _ = write!(
            out,
            "\n\nOther files (skill_read with \"file\"): {}\n",
            others.join(", ")
        );
    }
    Ok(Output::text(out))
}

pub(crate) const TOOLS: &[Tool] = &[
    Tool {
        name: "skills_list",
        title: "List agent skills",
        description: "List the agent skills available here: Bun repository skills (embedded), user skills (~/.claude/skills, ~/.codex/skills, ~/.bun/agent/skills), installed Bun plugin skills and the project's .claude/skills. Filter with `query`.",
        input_schema: r#"{"type":"object","properties":{"query":{"type":"string","description":"Words that must all appear in the name or description"},"limit":{"type":"integer","minimum":1,"maximum":200,"default":50},"offset":{"type":"integer","minimum":0,"default":0}}}"#,
        annotations: Annotations::READ_ONLY,
        call: skills_list,
    },
    Tool {
        name: "skill_read",
        title: "Read an agent skill",
        description: "Read a skill's instructions (SKILL.md) or one of its files, then follow them for the task at hand.",
        input_schema: r#"{"type":"object","properties":{"name":{"type":"string"},"file":{"type":"string","description":"A file of the skill other than SKILL.md"}},"required":["name"]}"#,
        annotations: Annotations::READ_ONLY,
        call: skill_read,
    },
];
