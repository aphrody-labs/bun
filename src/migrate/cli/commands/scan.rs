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

/// Mode scan par défaut (check / fix / aggressive / migrate).
use std::process::ExitCode;

use anyhow::Result;
use crate::{
    report, run,
    types::{Mode, Report, RunOptions, Severity},
};

use crate::cli::cli::args::{Cli, ReportArg};

pub(crate) fn run(cli: &Cli) -> Result<ExitCode> {
    let mode = if cli.migrate || cli.aggressive {
        Mode::Aggressive
    } else if cli.fix {
        Mode::Fix
    } else {
        Mode::Check
    };
    let root = cli.root.canonicalize().unwrap_or_else(|_| cli.root.clone());
    // En mode agent, un format text implicite est promu en JSON pour garder
    // stdout parsable ; le user peut forcer jsonl/md via --report.
    let effective_report: Report = if cli.agent && matches!(cli.report, ReportArg::Text) {
        Report::Json
    } else {
        cli.report.into()
    };
    let opts = RunOptions {
        root,
        mode,
        report: effective_report,
        quiet: cli.quiet,
        ignore: cli.ignore.clone(),
        agent: cli.agent,
        dry_run: cli.dry_run,
        since: cli.since.clone(),
    };

    let settings = run::ScanSettings {
        max_files: cli.max_files,
        max_report_bytes: cli.max_report_bytes,
        submodules: cli.submodules,
    };
    let summary = run::run_with_settings(
        &opts,
        cli.jobs.map_or_else(run::default_jobs, usize::from),
        settings,
    )?;
    let files_scanned = summary.files_scanned;
    let fixes = summary.files;

    // Mode --migrate : applique les side-effects après le scan+fix +
    // génère/persiste le report card (Phase 5 §5.4 + §5.6).
    // Phase 6 §6.3 : `--scaffold-polyfills` opt-in pour bunpp scaffold.
    // Avec --dry-run, le plan est seulement calculé et rapporté.
    let (report_card, migration_plan) = if cli.migrate {
        let migrate_opts = crate::cli::commands::migrate::MigrateOpts {
            scaffold_polyfills: cli.scaffold_polyfills,
            dry_run: cli.dry_run,
        };
        let plan = crate::cli::commands::migrate::run_migrate_side_effects_with_opts(
            &opts.root,
            &fixes,
            opts.quiet,
            migrate_opts,
        )?;
        let card = crate::report_card::build(&fixes);
        if !cli.dry_run {
            let state = crate::report_card::N2bState::from_card(&card, &fixes);
            if let Err(e) = state.write_to(&opts.root) {
                eprintln!("note: impossible d'écrire .n2b/state.json: {e}");
            }
        }
        (Some(card), Some(plan))
    } else {
        (None, None)
    };

    let card_value = report_card.as_ref().and_then(|c| serde_json::to_value(c).ok());
    let plan_value = migration_plan.as_ref().and_then(|p| serde_json::to_value(p).ok());
    let mut output = match opts.report {
        Report::Json => report::render_json_with_scan(
            &fixes,
            &opts,
            card_value.as_ref(),
            plan_value.as_ref(),
            files_scanned,
            settings.max_report_bytes,
        )?,
        Report::Jsonl => report::render_jsonl_with_count(&fixes, &opts, files_scanned),
        Report::Markdown => report::render_markdown(&fixes, &opts),
        Report::Sarif => report::render_sarif(&fixes, &opts),
        Report::Text => report::render_text_with_count(&fixes, &opts, files_scanned),
    };
    if matches!(opts.report, Report::Text)
        && let Some(card) = &report_card
    {
        output.push_str(&report::render_report_card_text(card));
    }
    if output.len() > settings.max_report_bytes {
        anyhow::bail!("scan incomplete: --max-report-bytes limit exceeded");
    }
    if !opts.quiet {
        match opts.report {
            Report::Text | Report::Jsonl => print!("{output}"),
            _ => println!("{output}"),
        }
    }

    let has_errors = fixes.iter().any(|f| f.findings.iter().any(|x| x.severity == Severity::Error));
    let has_findings = fixes.iter().any(|f| !f.findings.is_empty());

    Ok(if has_errors {
        ExitCode::from(2)
    } else if opts.mode == Mode::Check && has_findings {
        ExitCode::from(1)
    } else {
        ExitCode::SUCCESS
    })
}
