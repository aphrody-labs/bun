//! The shape of the repository: which package manager and task runner it uses and which packages it holds.

use crate::bytes::{basename, dirname};
use crate::json;
use crate::scan::Manifest;

pub struct Package {
    pub dir: Vec<u8>,
    pub name: Vec<u8>,
    pub scripts: usize,
    /// How many of its dependencies are other packages of the repository.
    pub internal: usize,
}

pub struct Workspace {
    pub package_manager: &'static str,
    /// Lockfiles at the root, the ones Bun reads when it migrates and `bun.lock`.
    pub lockfiles: Vec<Vec<u8>>,
    /// Task runners: turbo, nx, lerna and rush.
    pub task_runners: Vec<&'static str>,
    /// Tasks that `turbo.json` defines.
    pub turbo_tasks: Vec<Vec<u8>>,
    pub patterns: Vec<Vec<u8>>,
    pub packages: Vec<Package>,
    /// Dependency ranges by protocol, such as `workspace:` and `catalog:`.
    pub protocols: Vec<(&'static str, usize)>,
}

const LOCKFILES: [&[u8]; 6] = [b"package-lock.json", b"npm-shrinkwrap.json", b"yarn.lock", b"pnpm-lock.yaml", b"bun.lock", b"bun.lockb"];
const PROTOCOLS: [&str; 8] = ["workspace:", "catalog:", "link:", "file:", "npm:", "patch:", "github:", "git+"];

pub(crate) fn analyze(paths: &[Vec<u8>], manifests: &[Manifest], read: &dyn Fn(&[u8]) -> Option<Vec<u8>>) -> Workspace {
    let at_root = |name: &[u8]| paths.iter().any(|path| path == name);
    let root = manifests.iter().find(|manifest| manifest.path == b"package.json");
    let lockfiles: Vec<Vec<u8>> = LOCKFILES.iter().filter(|name| at_root(name)).map(|name| name.to_vec()).collect();
    let mut task_runners = Vec::new();
    for (file, runner) in [(&b"turbo.json"[..], "turbo"), (b"nx.json", "nx"), (b"lerna.json", "lerna"), (b"rush.json", "rush")] {
        if at_root(file) {
            task_runners.push(runner);
        }
    }

    let package_manager = match root.map_or(&b""[..], |root| root.package_manager.as_slice()) {
        name if name.starts_with(b"pnpm") => "pnpm",
        name if name.starts_with(b"yarn") => "yarn",
        name if name.starts_with(b"npm") => "npm",
        name if name.starts_with(b"bun") => "bun",
        _ if at_root(b"bun.lock") || at_root(b"bun.lockb") => "bun",
        _ if at_root(b"pnpm-lock.yaml") || at_root(b"pnpm-workspace.yaml") => "pnpm",
        _ if at_root(b"yarn.lock") || at_root(b".yarnrc.yml") => "yarn",
        _ => "npm",
    };

    let mut patterns: Vec<Vec<u8>> = root.map(|root| root.workspaces.clone()).unwrap_or_default();
    if patterns.is_empty() && at_root(b"pnpm-workspace.yaml") {
        patterns = read(b"pnpm-workspace.yaml").map(|yaml| yaml_packages(&yaml)).unwrap_or_default();
    }
    if patterns.is_empty() && at_root(b"lerna.json") {
        let packages = read(b"lerna.json").and_then(|text| json::parse(&text).ok()).map(|node| node.get(b"packages").map_or_else(Vec::new, |list| list.strings().into_iter().map(<[u8]>::to_vec).collect()));
        patterns = packages.unwrap_or_default();
    }

    let turbo_tasks = if at_root(b"turbo.json") {
        read(b"turbo.json")
            .and_then(|text| json::parse(&text).ok())
            .and_then(|node| node.get(b"tasks").or_else(|| node.get(b"pipeline")).map(|tasks| tasks.members().iter().map(|member| member.key.clone()).collect()))
            .unwrap_or_default()
    } else {
        Vec::new()
    };

    let members: Vec<&Manifest> = manifests
        .iter()
        .filter(|manifest| manifest.path != b"package.json" && manifest.path.ends_with(b"/package.json") && is_member(&patterns, dirname(&manifest.path)))
        .collect();
    let names: Vec<&[u8]> = members.iter().map(|member| member.name.as_slice()).collect();
    let packages = members
        .iter()
        .map(|member| Package {
            dir: dirname(&member.path).to_vec(),
            name: member.name.clone(),
            scripts: member.scripts.len(),
            internal: member.dependencies.iter().filter(|(name, _)| names.contains(&name.as_slice())).count(),
        })
        .collect();

    let protocols = PROTOCOLS
        .iter()
        .filter_map(|&protocol| {
            let count = manifests.iter().flat_map(|manifest| &manifest.dependencies).filter(|(_, range)| range.starts_with(protocol.as_bytes())).count();
            (count > 0).then_some((protocol, count))
        })
        .collect();

    Workspace { package_manager, lockfiles, task_runners, turbo_tasks, patterns, packages, protocols }
}

/// The `packages:` list of a `pnpm-workspace.yaml`.
fn yaml_packages(yaml: &[u8]) -> Vec<Vec<u8>> {
    let mut patterns = Vec::new();
    let mut inside = false;
    let mut at = 0;
    while at < yaml.len() {
        let end = crate::bytes::line_end(yaml, at);
        let line = yaml[at..end].trim_ascii();
        at = end + 1;
        if line.starts_with(b"packages:") {
            inside = true;
        } else if inside && line.starts_with(b"-") {
            let item = line[1..].trim_ascii();
            let item = item.strip_prefix(b"'").and_then(|rest| rest.strip_suffix(b"'")).or_else(|| item.strip_prefix(b"\"").and_then(|rest| rest.strip_suffix(b"\""))).unwrap_or(item);
            patterns.push(item.to_vec());
        } else if inside && !line.is_empty() && !line.starts_with(b"#") {
            inside = false;
        }
    }
    patterns
}

/// Whether `dir` is a package that the workspace patterns select; a pattern that starts with `!` takes packages out.
fn is_member(patterns: &[Vec<u8>], dir: &[u8]) -> bool {
    let matches = |pattern: &[u8]| segments_match(&split_path(pattern.strip_prefix(b"./").unwrap_or(pattern)), &split_path(dir));
    let selected = patterns.iter().filter(|pattern| !pattern.starts_with(b"!")).any(|pattern| matches(pattern));
    selected && !patterns.iter().filter_map(|pattern| pattern.strip_prefix(b"!")).any(matches)
}

fn split_path(path: &[u8]) -> Vec<&[u8]> {
    path.split(|&byte| byte == b'/').filter(|segment| !segment.is_empty()).collect()
}

fn segments_match(pattern: &[&[u8]], dir: &[&[u8]]) -> bool {
    match pattern.split_first() {
        None => dir.is_empty(),
        Some((first, rest)) if *first == b"**" => (0..=dir.len()).any(|skip| segments_match(rest, &dir[skip..])),
        Some((first, rest)) => dir.split_first().is_some_and(|(segment, tail)| crate::bytes::glob_matches(first, segment) && segments_match(rest, tail)),
    }
}

impl Workspace {
    /// The name that identifies a package in the report.
    pub fn label(package: &Package) -> &[u8] {
        if package.name.is_empty() { basename(&package.dir) } else { &package.name }
    }
}
