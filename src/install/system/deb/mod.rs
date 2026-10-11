// SPDX-License-Identifier: Apache-2.0
//! Local Debian metadata planner. It is not an install-capable Source.
pub mod version;

use super::{Error, Result, lossy};
use super::rootfs::crypto::{self, Alg};
use super::value::json_string;
use std::collections::{BTreeMap, BTreeSet, VecDeque};

const USAGE: &str = "usage: bun pm apt plan --packages-file FILE --release-file FILE --index-path main/binary-amd64/Packages --arch amd64 PACKAGE...\nLocal metadata only; no network, installation, lock or database writes. Release signatures are NOT verified.";
type Fields = BTreeMap<String, String>;

fn invalid(s: impl Into<String>) -> Error { Error::Parse(s.into()) }

fn read(path: &[u8], limit: usize) -> Result<Vec<u8>> {
    let file = bun_sys::File::openat(bun_sys::Fd::cwd(), path, bun_sys::O::RDONLY, 0)
        .map_err(|e| Error::Io(format!("read {}: {e}", lossy(path))))?;
    let mut out = Vec::new();
    let mut buf = [0u8; 8192];
    loop {
        let n = file.read(&mut buf).map_err(|e| Error::Io(format!("read {}: {e}", lossy(path))))?;
        if n == 0 { return Ok(out); }
        if out.len().saturating_add(n) > limit { return Err(invalid("Debian metadata exceeds byte limit")); }
        out.extend_from_slice(&buf[..n]);
    }
}

fn paragraphs(data: &[u8]) -> Result<Vec<Fields>> {
    let text = std::str::from_utf8(data).map_err(|_| invalid("Debian metadata must be UTF-8"))?;
    let mut rows = Vec::new(); let mut row = Fields::new(); let mut previous = String::new();
    for line in text.lines().chain(std::iter::once("")) {
        if line.len() > 65536 { return Err(invalid("Debian metadata line exceeds limit")); }
        if line.is_empty() {
            if !row.is_empty() { rows.push(std::mem::take(&mut row)); }
            previous.clear();
            if rows.len() > 100000 { return Err(invalid("Debian metadata stanza count exceeds limit")); }
        } else if line.starts_with([' ', '\t']) {
            let value = row.get_mut(&previous).ok_or_else(|| invalid("orphan Debian continuation"))?;
            if value.len() + line.len() > 262144 { return Err(invalid("Debian metadata field exceeds limit")); }
            value.push('\n'); value.push_str(line.trim_start());
        } else {
            let (name, value) = line.split_once(':').ok_or_else(|| invalid("invalid Debian field"))?;
            if name.is_empty() || !name.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-') {
                return Err(invalid("invalid Debian field name"));
            }
            let name = name.to_ascii_lowercase();
            if row.insert(name.clone(), value.trim().into()).is_some() { return Err(invalid("duplicate Debian field")); }
            previous = name;
        }
    }
    Ok(rows)
}

fn field<'a>(row: &'a Fields, name: &str) -> Result<&'a str> {
    row.get(name).map(String::as_str).filter(|v| !v.is_empty()).ok_or_else(|| invalid(format!("missing Debian {name}")))
}
fn relative(path: &str) -> bool {
    !path.is_empty() && !path.contains(['\\', ':', '\0'])
        && path.split('/').all(|p| !p.is_empty() && p != "." && p != "..")
}
fn hash(s: &str) -> bool { s.len() == 64 && s.bytes().all(|c| c.is_ascii_hexdigit()) }
fn package_name(s: &str) -> bool {
    s.len() >= 2 && s.as_bytes()[0].is_ascii_alphanumeric()
        && s.bytes().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || b"+.-".contains(&c))
}

/// Verifies bytes against an unsigned Release. This proves integrity, not origin.
fn integrity(release: &[u8], packages: &[u8], path: &str) -> Result<()> {
    if !relative(path) { return Err(invalid("unsafe Debian index path")); }
    let rows = paragraphs(release)?;
    if rows.len() != 1 { return Err(invalid("expected one plain Release stanza")); }
    let checksums = field(&rows[0], "sha256")?;
    let mut expected = None;
    for line in checksums.lines().filter(|l| !l.is_empty()) {
        let parts: Vec<_> = line.split_whitespace().collect();
        if parts.len() != 3 || !hash(parts[0]) || !relative(parts[2]) { return Err(invalid("invalid Release SHA256 entry")); }
        let size: usize = parts[1].parse().map_err(|_| invalid("invalid Release size"))?;
        if parts[2] == path && expected.replace((parts[0], size)).is_some() { return Err(invalid("duplicate Release index path")); }
    }
    let (sha, size) = expected.ok_or_else(|| invalid("index absent from Release SHA256"))?;
    if size != packages.len() { return Err(invalid("Release Packages size mismatch")); }
    if crypto::hex_decode(sha.as_bytes()).as_deref() != Some(crypto::digest(Alg::Sha256, packages).as_slice()) {
        return Err(invalid("Release Packages SHA256 mismatch"));
    }
    Ok(())
}

#[derive(Clone)]
struct Requirement { name: String, constraint: Option<(String, String)> }
fn requirement(text: &str) -> Result<Requirement> {
    let text = text.trim();
    let (name, constraint) = if let Some((name, rest)) = text.split_once('(') {
        let rest = rest.strip_suffix(')').ok_or_else(|| invalid("unsupported Debian dependency syntax"))?;
        let parts: Vec<_> = rest.split_whitespace().collect();
        if parts.len() != 2 || !matches!(parts[0], "<<" | "<=" | "=" | ">=" | ">>") || !version::valid(parts[1]) {
            return Err(invalid("invalid Debian dependency version"));
        }
        (name.trim(), Some((parts[0].into(), parts[1].into())))
    } else { (text, None) };
    // Multi-Arch qualifiers, build profiles, architecture restrictions and virtual
    // packages need an actual Debian solver; never erase them to fake resolution.
    if !package_name(name) { return Err(invalid(format!("unsupported Debian dependency: {text}"))); }
    Ok(Requirement { name: name.into(), constraint })
}
fn satisfies(version: &str, req: &Requirement) -> bool {
    let Some((op, target)) = &req.constraint else { return true; };
    let c = version::compare(version, target);
    match op.as_str() { "<<" => c.is_lt(), "<=" => !c.is_gt(), "=" => c.is_eq(), ">=" => !c.is_lt(), ">>" => c.is_gt(), _ => false }
}

pub fn run(args: &[&[u8]]) -> Result<i32> {
    if args.is_empty() || args == [b"--help".as_slice()] || args == [b"plan".as_slice(), b"--help".as_slice()] {
        bun_core::prettyln!("{}", USAGE); return Ok(0);
    }
    if args[0] != b"plan" { return Err(Error::Unsupported("Debian installation is unavailable; only local apt plan is implemented".into())); }
    let mut options = BTreeMap::new(); let mut requests = Vec::new(); let mut i = 1;
    while i < args.len() {
        let arg = lossy(args[i]);
        if arg.starts_with("--") {
            if !matches!(arg.as_str(), "--packages-file" | "--release-file" | "--index-path" | "--arch") { return Err(invalid(format!("unknown Debian plan option {arg}"))); }
            i += 1;
            let value = args.get(i).ok_or_else(|| invalid(format!("{arg} requires a value")))?;
            if options.insert(arg, lossy(value)).is_some() { return Err(invalid("duplicate Debian plan option")); }
        } else { requests.push(requirement(&arg)?); }
        i += 1;
    }
    let option = |key: &str| options.get(key).map(String::as_str).ok_or_else(|| invalid(format!("missing {key}\n{USAGE}")));
    let arch = option("--arch")?;
    if arch.is_empty() || !arch.bytes().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-') { return Err(invalid("invalid Debian architecture")); }
    if requests.is_empty() { return Err(invalid("Debian plan needs at least one package")); }
    let packages = read(option("--packages-file")?.as_bytes(), 64 * 1024 * 1024)?;
    let release = read(option("--release-file")?.as_bytes(), 2 * 1024 * 1024)?;
    integrity(&release, &packages, option("--index-path")?)?;
    let rows = paragraphs(&packages)?;
    let mut candidates: BTreeMap<&str, Vec<&Fields>> = BTreeMap::new();
    for row in &rows {
        let name = field(row, "package")?; let v = field(row, "version")?;
        if !package_name(name) || !version::valid(v) { return Err(invalid("invalid Debian package name/version")); }
        let package_arch = field(row, "architecture")?;
        if package_arch != arch && package_arch != "all" { continue; }
        if !relative(field(row, "filename")?) || !hash(field(row, "sha256")?) { return Err(invalid("invalid Debian archive path/hash")); }
        field(row, "size")?.parse::<u64>().map_err(|_| invalid("invalid Debian archive size"))?;
        candidates.entry(name).or_default().push(row);
    }
    let mut selected: BTreeMap<String, &Fields> = BTreeMap::new();
    let mut queue: VecDeque<Vec<Requirement>> = requests.into_iter().map(|r| vec![r]).collect();
    let mut issues = BTreeSet::new();
    while let Some(alternatives) = queue.pop_front() {
        if selected.len() >= 4096 { return Err(invalid("Debian closure exceeds package limit")); }
        if alternatives.iter().any(|req| selected.get(&req.name).is_some_and(|r| satisfies(&r["version"], req))) { continue; }
        let candidate = alternatives.iter().find_map(|req| candidates.get(req.name.as_str()).and_then(|rows| rows.iter()
            .filter(|row| satisfies(&row["version"], req))
            .max_by(|a,b| version::compare(&a["version"], &b["version"]))
            .map(|row| (req, *row))));
        let Some((req, row)) = candidate else { issues.insert(format!("unresolved dependency: {}", alternatives.iter().map(|r| r.name.as_str()).collect::<Vec<_>>().join(" | "))); continue; };
        if selected.contains_key(&req.name) { issues.insert(format!("dependency requires backtracking: {}", req.name)); continue; }
        selected.insert(req.name.clone(), row);
        for relation in ["provides", "conflicts", "breaks", "replaces", "multi-arch"] {
            if row.contains_key(relation) { issues.insert(format!("{} requires Debian {relation} semantics", req.name)); }
        }
        for kind in ["pre-depends", "depends"] {
            if let Some(deps) = row.get(kind) {
                for group in deps.split(',') {
                    match group.split('|').map(requirement).collect::<Result<Vec<_>>>() {
                        Ok(group) => queue.push_back(group),
                        Err(e) => { issues.insert(format!("{} {kind}: {e}", req.name)); }
                    }
                }
            }
        }
    }
    let mut total = 0u64;
    let mut entries = Vec::new();
    for (name,row) in &selected {
        let size = row["size"].parse::<u64>().map_err(|_| invalid("invalid archive size"))?;
        total = total.checked_add(size).ok_or_else(|| invalid("archive sizes overflow"))?;
        entries.push(format!("{{\"name\":{},\"version\":{},\"architecture\":{},\"filename\":{},\"sha256\":{},\"size\":{}}}", json_string(name), json_string(&row["version"]), json_string(&row["architecture"]), json_string(&row["filename"]), json_string(&row["sha256"]),size));
    }
    let issues = issues.iter().map(|s| json_string(s)).collect::<Vec<_>>().join(",");
    bun_core::prettyln!("{}", format!("{{\"schema\":\"bun.debian.plan.v1\",\"installable\":false,\"installed\":false,\"network\":false,\"metadataIntegrity\":\"sha256-matched\",\"releaseTrust\":\"unverified\",\"releaseFreshness\":\"unverified\",\"solver\":\"greedy-concrete-packages\",\"architecture\":{},\"archiveBytes\":{},\"packages\":[{}],\"issues\":[{}]}}", json_string(arch),total,entries.join(","),issues));
    Ok(0)
}
