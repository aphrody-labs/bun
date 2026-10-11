// SPDX-License-Identifier: Apache-2.0
//! APT/dpkg own signature verification, dependency solving and transactions.
use super::{field, hash, paragraphs, version};
use crate::system::{
    Ctx, Error, InstallKind, InstallRoot, InstalledRecord, LockEntry, PackageInfo, Result,
    SearchHit, Source, SourceKind, fs, join, lossy,
};

const USAGE: &str = "usage: bun pm apt|deb [--root DIR] [--simulate] [--yes] [--download-only] [--no-download] [--no-install-recommends] <install|add|remove|update|upgrade|download|source|search|show|list|check> [packages]\nAPT/dpkg native adapter, Linux only. Transactions require an explicit initialized Debian root.\nbun pm apt plan --help describes the separate local metadata planner.";

fn invalid(message: impl Into<String>) -> Error {
    Error::Parse(message.into())
}

fn selector(value: &str) -> bool {
    let (name, v) = value
        .split_once('=')
        .map_or((value, None), |(name, v)| (name, Some(v)));
    let (name, arch) = name
        .split_once(':')
        .map_or((name, None), |(name, arch)| (name, Some(arch)));
    super::package_name(name)
        && arch.is_none_or(|a| {
            !a.is_empty()
                && a.bytes()
                    .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-')
        })
        && v.is_none_or(version::valid)
}

fn host() -> Result<()> {
    if !cfg!(target_os = "linux") {
        return Err(Error::Unsupported(
            "the native APT adapter requires Linux with /usr/bin/apt-get and /usr/bin/dpkg".into(),
        ));
    }
    Ok(())
}

fn root(value: &[u8]) -> Result<String> {
    let value = std::str::from_utf8(value).map_err(|_| invalid("APT root must be UTF-8"))?;
    if !value.starts_with('/')
        || value.contains(['\0', '\n', '\r'])
        || value.split('/').any(|p| p == ".." || p == ".")
    {
        return Err(invalid(
            "APT root must be an absolute Linux directory without dot components",
        ));
    }
    let value = value.trim_end_matches('/');
    Ok(if value.is_empty() {
        "/".into()
    } else {
        value.into()
    })
}

fn initialized(root: &str) -> Result<()> {
    let status = join(root.as_bytes(), &[b"var/lib/dpkg/status"]);
    if fs::read(&status).is_none() {
        return Err(invalid(format!(
            "APT root {root} has no readable var/lib/dpkg/status; initialize a Debian rootfs first"
        )));
    }
    Ok(())
}

/// Paths are rooted separately: RootDir would also relocate /usr/bin/dpkg.
fn options(root: &str) -> Vec<String> {
    let mut result = Vec::new();
    if root != "/" {
        for value in [
            format!("Dir={root}"),
            format!("Dir::Etc={root}/etc/apt"),
            format!("Dir::State={root}/var/lib/apt"),
            format!("Dir::State::status={root}/var/lib/dpkg/status"),
            format!("Dir::Cache={root}/var/cache/apt"),
            format!("Dir::Log={root}/var/log/apt"),
            "Dir::Bin::dpkg=/usr/bin/dpkg".into(),
            format!("DPkg::Options::=--root={root}"),
        ] {
            result.extend(["-o".into(), value]);
        }
    }
    for value in [
        "APT::Get::AllowUnauthenticated=false",
        "Acquire::AllowInsecureRepositories=false",
        "Acquire::AllowDowngradeToInsecureRepositories=false",
        "Acquire::Check-Valid-Until=true",
    ] {
        result.extend(["-o".into(), value.into()]);
    }
    result
}

fn capture(binary: &str, args: &[String]) -> Result<Vec<u8>> {
    host()?;
    use bun_spawn::process::sync;
    let mut argv = vec![binary.as_bytes().into()];
    argv.extend(args.iter().map(|s| s.as_bytes().into()));
    let spawned = sync::spawn(&sync::Options {
        argv,
        stdout: sync::SyncStdio::Buffer,
        stderr: sync::SyncStdio::Buffer,
        ..Default::default()
    })
    .map_err(|e| Error::Io(format!("{binary}: {e}")))?
    .map_err(|e| Error::Io(format!("{binary}: {e}")))?;
    if !spawned.is_ok() {
        return Err(Error::Io(format!("{binary}: {}", lossy(&spawned.stderr))));
    }
    if spawned.stdout.len() > 64 * 1024 * 1024 {
        return Err(invalid("APT output exceeds 64 MiB"));
    }
    Ok(spawned.stdout)
}

fn inherit(binary: &str, args: &[String]) -> Result<i32> {
    host()?;
    let mut argv = vec![binary.as_bytes().to_vec()];
    argv.extend(args.iter().map(|s| s.as_bytes().to_vec()));
    bun_core::util::spawn_sync_inherit(&argv)
        .map(|s| s.code())
        .map_err(|e| Error::Io(format!("{binary}: {e}")))
}

fn ctx_root(ctx: &Ctx<'_>) -> Result<String> {
    ctx.options
        .root
        .as_deref()
        .map(root)
        .transpose()
        .map(|r| r.unwrap_or_else(|| "/".into()))
}

fn metadata(root: &str, id: &str) -> Result<Vec<super::Fields>> {
    if !selector(id) {
        return Err(invalid("invalid Debian package selector"));
    }
    let mut args = options(root);
    args.extend(["show".into(), id.into()]);
    paragraphs(&capture("/usr/bin/apt-cache", &args)?)
}

fn range_matches(v: &str, range: &str) -> Result<bool> {
    if matches!(range, "" | "*" | "latest") {
        return Ok(true);
    }
    for op in [">=", "<=", ">>", "<<", "="] {
        if let Some(target) = range.strip_prefix(op) {
            let target = target.trim();
            if !version::valid(target) {
                return Err(invalid("invalid Debian version constraint"));
            }
            let c = version::compare(v, target);
            return Ok(match op {
                ">=" => !c.is_lt(),
                "<=" => !c.is_gt(),
                ">>" => c.is_gt(),
                "<<" => c.is_lt(),
                _ => c.is_eq(),
            });
        }
    }
    if !version::valid(range) {
        return Err(invalid(
            "Debian versions use exact versions or dpkg constraints, not npm semver ranges",
        ));
    }
    Ok(version::compare(v, range).is_eq())
}

pub struct Deb;

impl Source for Deb {
    fn kind(&self) -> SourceKind {
        SourceKind::Deb
    }
    fn host_can_install(&self, _ctx: &Ctx<'_>) -> bool {
        cfg!(target_os = "linux")
    }

    fn search(&mut self, ctx: &Ctx<'_>, query: &str, limit: usize) -> Result<Vec<SearchHit>> {
        if query.starts_with('-') || query.contains('\0') {
            return Err(invalid("invalid APT search query"));
        }
        let mut args = options(&ctx_root(ctx)?);
        args.extend(["search".into(), "--names-only".into(), query.into()]);
        let output = capture("/usr/bin/apt-cache", &args)?;
        Ok(lossy(&output)
            .lines()
            .take(limit)
            .filter_map(|line| line.split_once(" - "))
            .map(|(name, description)| SearchHit {
                id: name.into(),
                name: name.into(),
                description: Some(description.into()),
                ..Default::default()
            })
            .collect())
    }

    fn info(&mut self, ctx: &Ctx<'_>, id: &str) -> Result<PackageInfo> {
        let rows = metadata(&ctx_root(ctx)?, id)?;
        let row = rows.first().ok_or_else(|| Error::NotFound(id.into()))?;
        Ok(PackageInfo {
            id: id.into(),
            name: field(row, "package")?.into(),
            latest: field(row, "version")?.into(),
            versions: rows
                .iter()
                .filter_map(|r| r.get("version").cloned())
                .collect(),
            publisher: row.get("maintainer").cloned(),
            description: row
                .get("description-en")
                .or_else(|| row.get("description"))
                .cloned(),
            homepage: row.get("homepage").cloned(),
            license: None,
        })
    }

    fn resolve(&mut self, ctx: &Ctx<'_>, id: &str, range: &str) -> Result<LockEntry> {
        let root = ctx_root(ctx)?;
        let rows = metadata(&root, id)?;
        let mut selected = None;
        for row in &rows {
            let v = field(row, "version")?;
            if range_matches(v, range)?
                && selected.is_none_or(|prev: &super::Fields| {
                    version::compare(v, &prev["version"]).is_gt()
                })
            {
                selected = Some(row);
            }
        }
        let row = selected.ok_or_else(|| Error::NoMatchingVersion {
            id: id.into(),
            range: range.into(),
        })?;
        let sha = field(row, "sha256")?;
        if !hash(sha) {
            return Err(invalid("APT package has no valid SHA256"));
        }
        let v = field(row, "version")?;
        let mut args = options(&root);
        args.extend([
            "--print-uris".into(),
            "download".into(),
            format!("{id}={v}"),
        ]);
        let output = lossy(&capture("/usr/bin/apt-get", &args)?);
        let uri = output
            .lines()
            .find_map(|line| {
                line.strip_prefix('\'')
                    .and_then(|s| s.split_once('\'').map(|(uri, _)| uri))
            })
            .ok_or_else(|| invalid("APT did not return an archive URI"))?;
        let mut entry = LockEntry::new(SourceKind::Deb, id);
        entry.version = v.into();
        entry.specifier = range.into();
        entry.url = uri.into();
        entry.hash = format!("sha256:{}", sha.to_ascii_lowercase());
        entry
            .meta
            .insert("architecture".into(), field(row, "architecture")?.into());
        entry.meta.insert("solver".into(), "native-apt".into());
        Ok(entry)
    }

    fn install(
        &mut self,
        ctx: &Ctx<'_>,
        entry: &LockEntry,
        install_root: &InstallRoot,
    ) -> Result<InstalledRecord> {
        let explicit = ctx.options.root.as_deref().ok_or_else(|| invalid("Debian installation requires BUN_SYSTEM_ROOT pointing to an initialized Debian root"))?;
        let install_dir = root(&install_root.dir)?;
        let root = root(explicit)?;
        if root != install_dir {
            return Err(invalid("APT install root differs from the requested root"));
        }
        initialized(&root)?;
        if root == "/" && !ctx.options.elevate {
            return Err(Error::NeedsElevation("APT machine installation".into()));
        }
        let locked = self.resolve(ctx, &entry.id, &entry.version)?;
        if locked.hash != entry.hash
            || locked.url != entry.url
            || locked.meta.get("architecture") != entry.meta.get("architecture")
        {
            return Err(invalid(
                "locked Debian archive changed in current APT metadata",
            ));
        }
        let mut args = options(&root);
        if ctx.options.offline {
            args.push("--no-download".into());
        }
        args.extend([
            "--yes".into(),
            "install".into(),
            format!("{}={}", entry.id, entry.version),
        ]);
        let code = inherit("/usr/bin/apt-get", &args)?;
        if code != 0 {
            return Err(Error::InstallerFailed {
                id: entry.id.clone(),
                code: code.into(),
            });
        }
        let mut record = InstalledRecord::new(
            SourceKind::Deb,
            &entry.id,
            &entry.version,
            &entry.hash,
            InstallKind::Native,
        );
        record.meta.insert("root".into(), root);
        record.meta.insert("solver".into(), "native-apt".into());
        Ok(record)
    }

    fn remove(
        &mut self,
        ctx: &Ctx<'_>,
        record: &InstalledRecord,
        install_root: &InstallRoot,
    ) -> Result<()> {
        let install_dir = root(&install_root.dir)?;
        let root = root(
            ctx.options
                .root
                .as_deref()
                .ok_or_else(|| invalid("Debian removal requires BUN_SYSTEM_ROOT"))?,
        )?;
        if record.meta.get("root") != Some(&root) || root != install_dir {
            return Err(invalid(
                "APT removal root differs from the recorded installation",
            ));
        }
        initialized(&root)?;
        if root == "/" && !ctx.options.elevate {
            return Err(Error::NeedsElevation("APT machine removal".into()));
        }
        if !selector(&record.id) {
            return Err(invalid("invalid recorded Debian package"));
        }
        let mut args = options(&root);
        args.extend(["--yes".into(), "remove".into(), record.id.clone()]);
        let code = inherit("/usr/bin/apt-get", &args)?;
        if code != 0 {
            return Err(Error::InstallerFailed {
                id: record.id.clone(),
                code: code.into(),
            });
        }
        Ok(())
    }

    fn compare_versions(&self, a: &str, b: &str) -> std::cmp::Ordering {
        version::compare(a, b)
    }
}

pub fn run(args: &[&[u8]]) -> Result<i32> {
    if args.is_empty() || args.iter().any(|a| matches!(*a, b"--help" | b"-h")) {
        bun_core::prettyln!("{}", USAGE);
        return Ok(0);
    }
    let mut target = None;
    let mut command: Option<String> = None;
    let mut flags = Vec::new();
    let mut packages = Vec::new();
    let mut i = 0;
    while i < args.len() {
        let arg =
            std::str::from_utf8(args[i]).map_err(|_| invalid("APT arguments must be UTF-8"))?;
        match arg {
            "--root" => {
                i += 1;
                target = Some(root(
                    args.get(i)
                        .ok_or_else(|| invalid("--root requires a directory"))?,
                )?);
            }
            "--simulate"
            | "--yes"
            | "--download-only"
            | "--no-download"
            | "--no-install-recommends" => flags.push(arg.to_owned()),
            _ if arg.starts_with('-') => {
                return Err(invalid(format!("unsupported APT option {arg}")));
            }
            _ if command.is_none() => command = Some(arg.to_owned()),
            _ => packages.push(arg.to_owned()),
        }
        i += 1;
    }
    let command = command.ok_or_else(|| invalid(USAGE))?;
    let command = match command.as_str() {
        "add" => "install",
        "del" => "remove",
        "info" => "show",
        c => c,
    };
    let cache = matches!(command, "search" | "show");
    let mutation = matches!(
        command,
        "install" | "remove" | "update" | "upgrade" | "download" | "source"
    );
    if !cache && !mutation && !matches!(command, "list" | "check") {
        return Err(invalid(format!("unsupported APT command {command}")));
    }
    if mutation && target.is_none() {
        return Err(invalid(
            "APT transactions require --root DIR explicitly (use --root / for the host)",
        ));
    }
    let root = target.as_deref().unwrap_or("/");
    host()?;
    initialized(root)?;
    if !matches!(command, "update" | "upgrade" | "list" | "check") && packages.is_empty() {
        return Err(invalid(
            "APT command requires at least one package or query",
        ));
    }
    if matches!(command, "update" | "upgrade" | "check") && !packages.is_empty() {
        return Err(invalid("this APT command takes no package arguments"));
    }
    for package in &packages {
        let local = command == "install"
            && package.starts_with('/')
            && package.ends_with(".deb")
            && !package.contains(['\0', '\n', '\r']);
        let query = command == "search" && !package.starts_with('-') && !package.contains('\0');
        if !selector(package) && !local && !query {
            return Err(invalid(format!(
                "invalid Debian package selector {package}"
            )));
        }
    }
    if cache && !flags.is_empty() {
        return Err(invalid("APT transaction flags do not apply to apt-cache"));
    }
    if command == "list" {
        if !flags.is_empty() {
            return Err(invalid("APT transaction flags do not apply to dpkg-query"));
        }
        let mut query = vec![format!("--admindir={root}/var/lib/dpkg"), "--show".into()];
        query.extend(packages);
        return inherit("/usr/bin/dpkg-query", &query);
    }
    let mut native = options(root);
    native.extend(flags);
    native.push(command.into());
    native.extend(packages);
    inherit(
        if cache {
            "/usr/bin/apt-cache"
        } else {
            "/usr/bin/apt-get"
        },
        &native,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn selectors_do_not_accept_options_or_npm_ranges() {
        assert!(selector("libc6:amd64=2.43-0ubuntu1"));
        for s in [
            "--allow-unauthenticated",
            "a",
            "libc6=^2.0",
            "libc6:amd64:other",
            "libc6=1\n-x",
        ] {
            assert!(!selector(s));
        }
        assert!(range_matches("1:2.0-1", ">= 2.9").unwrap());
        assert!(range_matches("1.0~rc1", "<< 1.0").unwrap());
        assert!(range_matches("1.0", "^1.0").is_err());
    }
    #[test]
    fn roots_and_dpkg_state_stay_scoped() {
        assert_eq!(root(b"/srv/debian/").unwrap(), "/srv/debian");
        assert!(root(b"/srv/../debian").is_err());
        assert!(root(b"relative").is_err());
        let opts = options("/srv/debian");
        assert!(opts.contains(&"Dir::State::status=/srv/debian/var/lib/dpkg/status".into()));
        assert!(opts.contains(&"DPkg::Options::=--root=/srv/debian".into()));
        assert!(!opts.iter().any(|o| o.starts_with("RootDir=")));
    }
}
