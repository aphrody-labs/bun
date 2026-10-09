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

use std::path::Path;

use anyhow::{Context, Result};
use crossbeam_channel::bounded;
use globset::{Glob, GlobSet, GlobSetBuilder};
use ignore::{WalkBuilder, WalkState};
use once_cell::sync::Lazy;

use crate::{
    scanners::{
        bunfig::scan_bunfig,
        cargo_toml::{is_cargo_toml, scan_cargo_toml},
        components_json::{is_components_json, scan_components_json},
        docker_compose::{is_docker_compose, scan_docker_compose},
        dockerfile::scan_dockerfile,
        env_file::{is_env_file, scan_env_file},
        husky::{is_husky_hook, scan_husky},
        js_config::{is_js_config, scan_js_config},
        lockfile::{RIVAL_LOCKFILES, check_lockfile},
        next_config::{is_next_config, scan_next_config},
        npmrc::{is_rc_file, scan_npmrc},
        nvmrc::scan_nvmrc,
        package_json::{PackageJsonContext, scan_package_json_in},
        pnpm_workspace::scan_pnpm_workspace,
        procfile::{is_procfile, scan_procfile},
        shell::scan_shell,
        source::scan_source,
        tauri_conf::{is_tauri_conf, scan_tauri_conf},
        tsconfig::scan_tsconfig,
        turbo_json::{is_turbo_json, scan_turbo_json},
        workflows::scan_workflow,
    },
    types::{FileFix, Mode, RunOptions},
};

const SOURCE_EXTS: &[&str] = &["js", "jsx", "ts", "tsx", "mjs", "cjs", "mts", "cts"];
const SHELL_EXTS: &[&str] = &["sh", "bash", "zsh"];
const SHELL_NAMES: &[&str] = &["Dockerfile", "Makefile", "Justfile"];
const DEFAULT_IGNORE: &[&str] = &[
    "**/node_modules/**",
    "**/.git/**",
    "**/dist/**",
    "**/build/**",
    "**/out/**",
    "**/.next/**",
    "**/.turbo/**",
    "**/coverage/**",
    "**/.bun/**",
    "**/target/**",
    "**/upstream/**",
    "**/.pnpm-store/**",
    "**/.yarn/**",
    "**/.cache/**",
    "**/.vercel/**",
    "**/.svelte-kit/**",
    "**/.nuxt/**",
    "**/.output/**",
    "**/.n2b/**",
];

fn is_workflow(rel: &str) -> bool {
    // .github/workflows/*.yml | *.yaml
    let normalized = rel.replace('\\', "/");
    static RE: Lazy<regex::Regex> = Lazy::new(|| {
        regex::Regex::new(r"\.github/workflows/.+\.ya?ml$")
            .expect("invariant: workflow path regex literal is valid")
    });
    RE.is_match(&normalized)
}

/// Upper bound for one recursive scan, including its parallel file workers.
pub const DEFAULT_MAX_JOBS: usize = crate::util::resources::MAX_SCAN_WORKERS;

pub fn default_jobs() -> usize {
    crate::util::resources::default_scan_workers()
}

pub fn run(opts: &RunOptions) -> Result<Vec<FileFix>> {
    run_with_jobs(opts, default_jobs())
}

/// Scan recursively in process with a bounded worker count and pending-result queue.
/// The returned report still owns its complete findings and before/after file texts.
pub fn run_with_jobs(opts: &RunOptions, jobs: usize) -> Result<Vec<FileFix>> {
    run_map_with_jobs(opts, jobs, Ok)
}

/// Project each completed file on a native worker before queuing its result.
/// The callback owns the file and can release source texts after extracting context.
/// It must not call JS/JSC or re-enter this engine: the scan lease is non-reentrant.
pub fn run_map_with_jobs<T, F>(opts: &RunOptions, jobs: usize, map: F) -> Result<Vec<T>>
where
    T: Send,
    F: Fn(FileFix) -> Result<T> + Sync,
{
    // Repository mapping and N2B share this owner across native/JS callers.
    let _lease = crate::util::resources::acquire_scan_lease(jobs)?;
    // Phase 4 §4.7 : résout n2b.json (parent-first, borné au dépôt), valide,
    // applique `ignore` + `rules` overrides. Précédence : flags CLI > n2b.json > défauts.
    let manifest = crate::manifest::resolve_and_load(&opts.root)?;
    let overrides: crate::manifest::RuleOverrideMap =
        manifest.as_ref().map(|m| m.manifest.rules.clone()).unwrap_or_default();

    // Build matcher for default + user ignore globs.
    let mut gsb = GlobSetBuilder::new();
    for p in DEFAULT_IGNORE.iter().copied() {
        gsb.add(Glob::new(p)?);
    }
    for p in opts.ignore.iter() {
        if let Ok(g) = Glob::new(p) {
            gsb.add(g);
        }
    }
    // Merge ignore globs depuis le manifeste (additif aux flags CLI).
    if let Some(m) = manifest.as_ref() {
        for p in &m.manifest.ignore {
            if let Ok(g) = Glob::new(p) {
                gsb.add(g);
            }
        }
        // n2b ignore lui-même son manifeste + .n2b/.
        for p in &["**/n2b.json", "**/.n2b/**"] {
            gsb.add(Glob::new(p)?);
        }
    }
    let ignore_set = gsb.build()?;

    let scan = |abs: &Path, rel: &str| -> Result<Option<(String, T)>> {
        let fix = process_file(abs, rel, opts)
            .and_then(|fix| {
                fix.map(|fix| finalize_file(abs, fix, opts, &overrides))
                    .transpose()
                    .map(Option::flatten)
            })
            .with_context(|| format!("scan {}", abs.display()))?;
        fix.map(|fix| {
            let path = fix.file.clone();
            map(fix).map(|value| (path, value))
        })
        .transpose()
    };

    let mut fixes = match opts.since.as_deref() {
        Some(since) => {
            let files: Vec<String> = crate::since::changed_files(&opts.root, since)?
                .into_iter()
                .filter(|rel| !ignore_set.is_match(rel))
                .collect();
            scan_listed(&opts.root, &files, jobs, &scan)?
        },
        None => scan_tree(&opts.root, &ignore_set, jobs, &scan)?,
    };
    // Restore deterministic order (parallel walk produces non-deterministic order).
    fixes.sort_unstable_by(|a, b| a.0.cmp(&b.0));

    Ok(fixes.into_iter().map(|(_, value)| value).collect())
}

type ScanFn<'a, T> = dyn Fn(&Path, &str) -> Result<Option<(String, T)>> + Sync + 'a;

/// Scan incrémental : fichiers déjà listés (`--since`), répartis sur `jobs` workers.
fn scan_listed<T: Send>(
    root: &Path,
    files: &[String],
    jobs: usize,
    scan: &ScanFn<'_, T>,
) -> Result<Vec<(String, T)>> {
    let next = std::sync::atomic::AtomicUsize::new(0);
    std::thread::scope(|scope| {
        let workers: Vec<_> = (0..jobs.min(files.len()).max(1))
            .map(|_| {
                scope.spawn(|| -> Result<Vec<(String, T)>> {
                    let mut out = Vec::new();
                    loop {
                        let i = next.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                        let Some(rel) = files.get(i) else { return Ok(out) };
                        if let Some(fix) = scan(&root.join(rel), rel)? {
                            out.push(fix);
                        }
                    }
                })
            })
            .collect();
        let mut all = Vec::new();
        for worker in workers {
            all.extend(worker.join().map_err(|_| anyhow::anyhow!("scan worker panicked"))??);
        }
        Ok(all)
    })
}

/// Scan complet : parcours parallèle de l'arbre, `.gitignore` respecté,
/// dossiers ignorés élagués avant d'être lus.
fn scan_tree<T: Send>(
    root: &Path,
    ignore_set: &GlobSet,
    jobs: usize,
    scan: &ScanFn<'_, T>,
) -> Result<Vec<(String, T)>> {
    let (tx, rx) = bounded::<Result<(String, T)>>(jobs * 2);
    // Drain while workers run: a bounded queue followed by collection only after
    // run() joins would deadlock as soon as workers filled the queue.
    std::thread::scope(|scope| -> Result<Vec<(String, T)>> {
        let collector = scope.spawn(move || {
            let mut fixes = Vec::new();
            let mut failure = None;
            for result in rx {
                match result {
                    Ok(fix) => fixes.push(fix),
                    Err(error) => {
                        if failure.is_none() {
                            failure = Some(error);
                        }
                    },
                }
            }
            failure.map_or(Ok(fixes), Err)
        });
        let directory_root = root.to_path_buf();
        let directory_ignores = ignore_set.clone();
        WalkBuilder::new(root)
            .hidden(false)
            .git_ignore(true)
            .git_exclude(true)
            .git_global(false)
            .parents(true)
            .threads(jobs)
            .filter_entry(move |entry| {
                if !entry.file_type().is_some_and(|kind| kind.is_dir()) {
                    return true;
                }
                let rel = entry
                    .path()
                    .strip_prefix(&directory_root)
                    .unwrap_or(entry.path())
                    .to_string_lossy()
                    .replace('\\', "/");
                rel.is_empty()
                    || !(directory_ignores.is_match(&rel)
                        || directory_ignores.is_match(format!("{rel}/")))
            })
            .build_parallel()
            .run(|| {
                let tx = tx.clone();
                Box::new(move |result| {
                    let entry = match result {
                        Ok(entry) => entry,
                        Err(error) => {
                            let _ = tx.send(Err(error.into()));
                            return WalkState::Quit;
                        },
                    };
                    if !entry.file_type().is_some_and(|kind| kind.is_file()) {
                        return WalkState::Continue;
                    }
                    let abs = entry.into_path();
                    let rel =
                        abs.strip_prefix(root).unwrap_or(&abs).to_string_lossy().replace('\\', "/");
                    if ignore_set.is_match(&rel) {
                        return WalkState::Continue;
                    }
                    match scan(&abs, &rel) {
                        Ok(Some(fix)) => {
                            if tx.send(Ok(fix)).is_err() {
                                return WalkState::Quit;
                            }
                        },
                        Ok(None) => {},
                        Err(error) => {
                            let _ = tx.send(Err(error));
                            return WalkState::Quit;
                        },
                    }
                    WalkState::Continue
                })
            });
        drop(tx);
        collector.join().map_err(|_| anyhow::anyhow!("scan result collector panicked"))?
    })
}

fn finalize_file(
    abs: &Path,
    mut fix: FileFix,
    opts: &RunOptions,
    overrides: &crate::manifest::RuleOverrideMap,
) -> Result<Option<FileFix>> {
    // Scanners currently return complete transformed text, not a per-rule edit
    // plan. Keep the whole file intact if any matching rule forbids an edit;
    // reconstructing selected edits from shifted offsets could corrupt source.
    let blocked = fix.findings.iter().any(|finding| {
        overrides
            .get(&finding.rule_id)
            .is_some_and(|rule| rule.is_off() || rule.autofix_override() == Some(false))
    });
    if blocked {
        fix.after.clone_from(&fix.before);
    }
    crate::manifest::apply_rule_overrides(std::slice::from_mut(&mut fix), overrides);
    if fix.findings.is_empty() && fix.before == fix.after {
        return Ok(None);
    }
    if opts.mode != Mode::Check && !opts.dry_run && fix.after != fix.before {
        std::fs::write(abs, &fix.after).context("write transformed source")?;
    }
    Ok(Some(fix))
}

fn process_file(abs: &Path, rel: &str, opts: &RunOptions) -> Result<Option<FileFix>> {
    let name = abs.file_name().and_then(|s| s.to_str()).unwrap_or("");
    let ext = abs
        .extension()
        .and_then(|s| s.to_str())
        .map(|s| s.to_ascii_lowercase())
        .unwrap_or_default();

    if RIVAL_LOCKFILES.contains(&name) {
        if let Some(f) = check_lockfile(rel, name) {
            return Ok(Some(FileFix {
                file: rel.to_string(),
                before: String::new(),
                after: String::new(),
                findings: vec![f],
            }));
        }
        return Ok(None);
    }

    let is_workflow = is_workflow(rel);
    let is_pkg = name == "package.json";
    let is_source = SOURCE_EXTS.contains(&ext.as_str());
    let is_shell = SHELL_EXTS.contains(&ext.as_str()) || SHELL_NAMES.contains(&name);
    let is_dockerfile =
        name == "Dockerfile" || name.starts_with("Dockerfile.") || name.ends_with(".dockerfile");
    let is_nvmrc = name == ".nvmrc" || name == ".node-version";
    let is_tsconfig = name == "tsconfig.json" || name.starts_with("tsconfig.");
    let is_husky = is_husky_hook(rel);
    let is_pnpm_ws = name == "pnpm-workspace.yaml";
    let is_bunfig = name == "bunfig.toml";
    let is_next = is_next_config(name);
    let is_rc = is_rc_file(name);
    let is_cargo = is_cargo_toml(name);
    let is_turbo = is_turbo_json(name);
    let is_tauri = is_tauri_conf(name);
    let is_components = is_components_json(name);
    let is_env = is_env_file(name);
    let is_compose = is_docker_compose(name);
    let is_proc = is_procfile(name);
    let is_jsconf = is_js_config(name);

    if !is_pkg
        && !is_source
        && !is_shell
        && !is_workflow
        && !is_dockerfile
        && !is_nvmrc
        && !is_tsconfig
        && !is_husky
        && !is_pnpm_ws
        && !is_bunfig
        && !is_next
        && !is_rc
        && !is_cargo
        && !is_turbo
        && !is_tauri
        && !is_components
        && !is_env
        && !is_compose
        && !is_proc
        && !is_jsconf
    {
        return Ok(None);
    }

    // Size cap 2 MiB.
    let meta = std::fs::metadata(abs).context("read file metadata")?;
    if meta.len() > 2 * 1024 * 1024 {
        return Ok(None);
    }
    let bytes = std::fs::read(abs).context("read source bytes")?;
    let before = std::str::from_utf8(&bytes).context("source is not valid UTF-8")?.to_string();

    let aggressive = opts.mode == Mode::Aggressive;
    let (findings, after) = if is_pkg {
        scan_package_json_in(
            rel,
            &before,
            PackageJsonContext { root: Some(&opts.root), aggressive },
        )
    } else if is_workflow {
        scan_workflow(rel, &before, aggressive)
    } else if is_source {
        let (source_findings, after) = scan_source(rel, &before, opts);
        // `vitest.config.ts`, `jest.config.js`… sont aussi des sources JS/TS.
        let mut findings = if is_jsconf { scan_js_config(rel, &before).0 } else { Vec::new() };
        findings.extend(source_findings);
        (findings, after)
    } else if is_dockerfile {
        scan_dockerfile(rel, &before, aggressive)
    } else if is_nvmrc {
        scan_nvmrc(rel, &before)
    } else if is_tsconfig {
        scan_tsconfig(rel, &before)
    } else if is_husky {
        scan_husky(rel, &before)
    } else if is_pnpm_ws {
        (scan_pnpm_workspace(rel, &before), before.clone())
    } else if is_bunfig {
        scan_bunfig(rel, &before)
    } else if is_next {
        scan_next_config(rel, &before)
    } else if is_rc {
        scan_npmrc(rel, &before)
    } else if is_cargo {
        scan_cargo_toml(rel, &before)
    } else if is_turbo {
        scan_turbo_json(rel, &before)
    } else if is_tauri {
        scan_tauri_conf(rel, &before)
    } else if is_components {
        scan_components_json(rel, &before)
    } else if is_env {
        scan_env_file(rel, &before)
    } else if is_compose {
        scan_docker_compose(rel, &before, aggressive)
    } else if is_proc {
        scan_procfile(rel, &before, aggressive)
    } else if is_jsconf {
        scan_js_config(rel, &before)
    } else {
        scan_shell(rel, &before, aggressive)
    };

    if findings.is_empty() && before == after {
        return Ok(None);
    }

    Ok(Some(FileFix { file: rel.to_string(), before, after, findings }))
}
