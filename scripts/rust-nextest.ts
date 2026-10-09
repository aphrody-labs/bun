#!/usr/bin/env bun
/**
 * `cargo nextest run` (natively, not under Miri) for the crates whose tests
 * link without bun's C/C++ objects. Configuration: `.config/nextest.toml`.
 *
 * Usage:
 *   bun run rust:nextest                  # default crate set, profile `default`
 *   bun run rust:nextest --profile ci     # retries + junit (CI)
 *   bun run rust:nextest -p bun_paths     # any `-p` replaces the default set
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const repo = resolve(import.meta.dirname, "..");

// The `MIRI_CRATES` of scripts/rust-miri.ts: tests that call no vendored C,
// so the test binaries link against Rust std alone.
const CRATES = [
  "bun_collections",
  "bun_ast",
  "bun_paths",
  "bun_hash",
  "bun_base64",
  "bun_bundler",
  "bun_clap",
  "bun_dispatch",
  "bun_errno",
  "bun_http_types",
  "bun_md",
  "bun_ptr",
  "bun_resolve_builtins",
  "bun_shell_parser",
  "bun_threading",
  "bun_url",
  "bun_vfs",
  "bun_wyhash",
];

for (const [path, hint] of [
  ["build/debug/codegen/build_options.rs", "bun run build --configure-only"],
  ["vendor/lolhtml/Cargo.toml", "bun run build --target=clone-lolhtml"],
  ["vendor/rust-argon2/Cargo.toml", "bun run build --target=clone-rust-argon2"],
  ["vendor/uutils/Cargo.toml", "bun run build --target=clone-uutils"],
] as const) {
  if (!existsSync(resolve(repo, path))) {
    console.error(`\x1b[31m[nextest]\x1b[0m ${path} missing — run: ${hint}`);
    process.exit(1);
  }
}

const args = process.argv.slice(2);
const crates = args.includes("-p") || args.includes("--package") ? [] : CRATES.flatMap(c => ["-p", c]);
const result = spawnSync("cargo", ["nextest", "run", ...crates, ...args], {
  stdio: "inherit",
  cwd: repo,
  env: { ...process.env, BUN_CODEGEN_DIR: process.env.BUN_CODEGEN_DIR ?? resolve(repo, "build/debug/codegen") },
});
process.exit(result.status ?? 1);
