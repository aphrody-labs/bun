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

use std::{collections::BTreeSet, path::Path, process::Command};

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

fn git(root: &Path, args: &[&str]) -> Result<Vec<String>> {
    let out = Command::new("git")
        .arg("-C")
        .arg(root)
        .args(["-c", "core.quotepath=off"])
        .args(args)
        .output()
        .context("--since requiert git dans le PATH")?;
    if !out.status.success() {
        bail!(
            "`git {}` a échoué dans {}: {}",
            args.join(" "),
            root.display(),
            String::from_utf8_lossy(&out.stderr).trim()
        );
    }
    Ok(out
        .stdout
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
    if since.starts_with('-') {
        bail!("--since attend une ref git, reçu {since:?}");
    }
    let range = format!("{since}...HEAD");
    let mut files: BTreeSet<String> = BTreeSet::new();
    files.extend(git(root, &["diff", "--name-only", "--relative", "-z", &range, "--"])?);
    files.extend(git(root, &["diff", "--name-only", "--relative", "-z", "HEAD", "--"])?);
    files.extend(git(root, &["ls-files", "--others", "--exclude-standard", "-z", "--"])?);
    files.extend(ROOT_MANIFESTS.iter().map(|name| (*name).to_string()));
    Ok(files.into_iter().filter(|rel| root.join(rel).is_file()).collect())
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
