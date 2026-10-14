// Copyright 2026 aphrody-code
// SPDX-License-Identifier: Apache-2.0

//! Native Node.js to Bun project migration.

#[path = "engine/ai/mod.rs"]
pub mod ai;

#[path = "engine/audit.rs"]
pub mod audit;

#[path = "engine/github/mod.rs"]
pub mod github;

#[path = "engine/llmstxt/mod.rs"]
pub mod llmstxt;

#[path = "engine/manifest.rs"]
pub mod manifest;

#[path = "engine/pnpm.rs"]
pub mod pnpm;

#[path = "engine/report/mod.rs"]
pub mod report;

#[path = "engine/report_card.rs"]
pub mod report_card;

#[path = "engine/rules/mod.rs"]
pub mod rules;

#[path = "engine/run.rs"]
pub mod run;

#[path = "engine/scanners/mod.rs"]
pub mod scanners;

#[path = "engine/since.rs"]
pub mod since;

#[path = "engine/util/mod.rs"]
pub mod util;

pub mod registry;
#[path = "schema/types.rs"]
pub mod schema;
pub mod types;

pub mod cli;
pub use cli::{install_crypto_provider, run_cli, run_embedded_cli, run_from, run_from_env};

pub const REPORT_SCHEMA_V2: &str = include_str!("schema/v2.json");
