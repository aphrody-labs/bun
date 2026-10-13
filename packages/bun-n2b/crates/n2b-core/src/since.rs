// Copyright 2026 aphrody-code
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

//! Scan incrémental (`--since <ref>`) : liste des fichiers à scanner d'après git.

use std::{
    collections::BTreeSet,
    io::Read,
    path::Path,
    process::{Command, Stdio},
    sync::mpsc,
    time::{Duration, Instant},
};

use anyhow::{Context, Result, bail};

/// Manifestes de la racine du scan, toujours rescannés en mode incrémental :
/// ils décident de la migration du dépôt entier même s'ils n'ont pas changé.
pub const ROOT_MANIFESTS: &[&str] = &[
    "package.json",
    "pnpm-workspace.yaml",
    "bunfig.toml",
    "tsconfig.json",
    "turbo.json",
    ".npmrc",
    ".nvmrc",
    ".node-version",
    "package-lock.json",
    "npm-shrinkwrap.json",
    "pnpm-lock.yaml",
    "yarn.lock",
];

fn read_bounded(mut stream: impl Read, limit: usize) -> Result<Vec<u8>> {
    let mut bytes = Vec::new();
    stream.by_ref().take(limit.saturating_add(1) as u64).read_to_end(&mut bytes)?;
    if bytes.len() > limit {
        bail!(
            "scan incomplete: Git output exceeds --max-report-bytes; narrow the scan or raise the limit"
        );
    }
    Ok(bytes)
}

fn git(root: &Path, args: &[&str], max_bytes: usize) -> Result<Vec<String>> {
    let mut child = Command::new("git")
        .arg("-C")
        .arg(root)
        .args(["-c", "core.quotepath=off"])
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .context("--since requires Git in PATH")?;
    let stdout = child.stdout.take().expect("piped Git stdout");
    let stderr = child.stderr.take().expect("piped Git stderr");
    let (stdout, stderr, status) = std::thread::scope(|scope| {
        let (tx, rx) = mpsc::channel();
        let stderr_tx = tx.clone();
        scope.spawn(move || {
            let _ = tx.send((true, read_bounded(stdout, max_bytes)));
        });
        scope.spawn(move || {
            let _ = stderr_tx.send((false, read_bounded(stderr, max_bytes.min(64 * 1024))));
        });
        let result = (|| -> Result<_> {
            let deadline = Instant::now() + Duration::from_secs(30);
            let (mut stdout, mut stderr, mut status) = (None, None, None);
            loop {
                if status.is_none() {
                    status = child.try_wait()?;
                }
                if stdout.is_some() && stderr.is_some() && status.is_some() {
                    return Ok((
                        stdout.take().expect("collected Git stdout"),
                        stderr.take().expect("collected Git stderr"),
                        status.expect("collected Git status"),
                    ));
                }
                if Instant::now() >= deadline {
                    bail!("scan incomplete: Git --since command exceeded 30 seconds");
                }
                match rx.recv_timeout(Duration::from_millis(10)) {
                    Ok((is_stdout, bytes)) => {
                        if is_stdout {
                            stdout = Some(bytes?);
                        } else {
                            stderr = Some(bytes?);
                        }
                    },
                    Err(mpsc::RecvTimeoutError::Timeout) => {},
                    Err(mpsc::RecvTimeoutError::Disconnected) => {
                        std::thread::park_timeout(Duration::from_millis(10));
                    },
                }
            }
        })();
        if result.is_err() {
            let _ = child.kill();
            let _ = child.wait();
        }
        result
    })?;
    if !status.success() {
        bail!(
            "`git {}` failed in {}: {}",
            args.join(" "),
            root.display(),
            String::from_utf8_lossy(&stderr).trim()
        );
    }
    Ok(stdout
        .split(|b| *b == 0)
        .filter(|p| !p.is_empty())
        .map(|p| String::from_utf8_lossy(p).replace('\\', "/"))
        .collect())
}

/// Fichiers (chemins relatifs à `root`, séparateur `/`) modifiés depuis `since` :
/// commits de `<since>...HEAD`, modifications indexées ou non, fichiers non
/// suivis non ignorés, plus les [`ROOT_MANIFESTS`] présents. Les fichiers
/// supprimés sont exclus.
pub fn changed_files(root: &Path, since: &str) -> Result<Vec<String>> {
    changed_paths(root, since, false)
}

/// Opted-in changed Git links are scan scopes, never treated as source files.
pub fn changed_paths(root: &Path, since: &str, submodules: bool) -> Result<Vec<String>> {
    changed_paths_with_limit(root, since, submodules, crate::run::DEFAULT_MAX_REPORT_BYTES)
}

pub(crate) fn changed_paths_with_limit(
    root: &Path,
    since: &str,
    submodules: bool,
    max_bytes: usize,
) -> Result<Vec<String>> {
    if since.starts_with('-') {
        bail!("--since attend une ref git, reçu {since:?}");
    }
    let range = format!("{since}...HEAD");
    let mut files: BTreeSet<String> = BTreeSet::new();
    let mut retained = 0usize;
    for args in [
        vec!["diff", "--name-only", "--relative", "-z", &range, "--"],
        vec!["diff", "--name-only", "--relative", "-z", "HEAD", "--"],
        vec!["ls-files", "--others", "--exclude-standard", "-z", "--"],
    ] {
        for path in git(root, &args, max_bytes)? {
            if !files.contains(&path) {
                retained = retained.saturating_add(path.len()).saturating_add(64);
                if retained > max_bytes {
                    bail!(
                        "scan incomplete: Git paths exceed --max-report-bytes; narrow the scan or raise the limit"
                    );
                }
                files.insert(path);
            }
        }
    }
    files.extend(ROOT_MANIFESTS.iter().map(|name| (*name).to_string()));
    Ok(files
        .into_iter()
        .filter(|rel| {
            let path = root.join(rel);
            path.is_file() || (submodules && path.is_dir() && path.join(".git").exists())
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn run(dir: &Path, args: &[&str]) {
        let status = Command::new("git")
            .arg("-C")
            .arg(dir)
            .args(["-c", "user.name=n2b", "-c", "user.email=n2b@example.invalid"])
            .args(args)
            .status()
            .unwrap();
        assert!(status.success(), "git {args:?}");
    }

    #[test]
    fn lists_committed_modified_and_untracked_files_since_a_ref() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        std::fs::write(root.join("package.json"), "{}").unwrap();
        std::fs::write(root.join("old.ts"), "1").unwrap();
        std::fs::write(root.join("edited.ts"), "1").unwrap();
        std::fs::write(root.join(".gitignore"), "ignored.ts\n").unwrap();
        run(root, &["init", "-q", "-b", "main"]);
        run(root, &["add", "."]);
        run(root, &["commit", "-q", "-m", "base"]);
        run(root, &["tag", "base"]);

        std::fs::create_dir_all(root.join("src")).unwrap();
        std::fs::write(root.join("src/committed.ts"), "1").unwrap();
        run(root, &["add", "."]);
        run(root, &["commit", "-q", "-m", "next"]);
        std::fs::write(root.join("edited.ts"), "2").unwrap();
        std::fs::write(root.join("untracked.ts"), "1").unwrap();
        std::fs::write(root.join("ignored.ts"), "1").unwrap();

        let files = changed_files(root, "base").unwrap();
        assert_eq!(files, ["edited.ts", "package.json", "src/committed.ts", "untracked.ts"]);
    }

    #[test]
    fn rejects_option_like_refs_and_unknown_refs() {
        let tmp = tempfile::tempdir().unwrap();
        run(tmp.path(), &["init", "-q"]);
        assert!(changed_files(tmp.path(), "--output=x").is_err());
        assert!(changed_files(tmp.path(), "does-not-exist").is_err());
    }
}
