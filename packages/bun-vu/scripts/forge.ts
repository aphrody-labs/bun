#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
//! Builds the standalone vu artifact in this optional package without joining Bun's default build graph.

import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { readVendor, ROOT, run, workspaceVersion } from "./lib.ts";

const ALL_STEPS = ["fetch", "uv", "ruff", "vu", "test", "clippy", "assemble", "smoke"] as const;
type Step = (typeof ALL_STEPS)[number];
interface StepResult { name: Step; ok: boolean; ms: number; detail?: string }

const TARGET_DIR = resolve(process.env["VU_TARGET_DIR"] ?? join(ROOT, "target"));
const ARTIFACTS = resolve(process.env["VU_ARTIFACTS"] ?? join(ROOT, "dist", "artifacts"));
const RECEIPTS = resolve(process.env["VU_RECEIPT_DIR"] ?? join(homedir(), ".vu", "receipts"));

function lastJson(text: string): unknown {
  const line = text.trim().split("\n").filter((entry) => entry.startsWith("{")).at(-1);
  if (!line) throw new Error(`no JSON in command output: ${text.slice(-300)}`);
  return JSON.parse(line);
}

export async function main(argv: string[]): Promise<number> {
  const value = (flag: string): string | undefined => {
    const index = argv.indexOf(flag);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const wanted = (value("--steps")?.split(",") ?? [...ALL_STEPS]) as Step[];
  const unknown = wanted.filter((step) => !ALL_STEPS.includes(step));
  if (unknown.length) throw new Error(`unknown steps: ${unknown.join(", ")}`);
  if (wanted.includes("fetch") && !argv.includes("--allow-network"))
    throw new Error("fetch is network-enabled; pass --allow-network explicitly");

  const vendor = await readVendor();
  const version = await workspaceVersion();
  const host = (await run(["rustc", "-vV"])).stdout.match(/^host:\s*(\S+)/m)?.[1];
  if (!host) throw new Error("rustc did not report a host target");
  const target = value("--target") ?? process.env["VU_TARGET"] ?? host;
  const pythonRelease = vendor.releases.find((entry) => entry.name === "python-build-standalone");
  if (!pythonRelease?.target || pythonRelease.target !== target)
    throw new Error(`no pinned CPython artifact for ${target}; pinned target is ${pythonRelease?.target ?? "unknown"}`);
  const toolchain = (await run(["rustc", "--version"])).stdout.trim();
  const head = (await run(["git", "rev-parse", "HEAD"], { cwd: ROOT })).stdout.trim();
  if (!/^[0-9a-f]{40}$/.test(head)) throw new Error("cannot resolve the package source revision");
  const dirty = (await run(["git", "status", "--porcelain", "--", "packages/bun-vu"], { cwd: ROOT })).stdout.trim().length > 0;
  const startedAt = new Date().toISOString();
  const results: StepResult[] = [];
  let artifact: { artifact: string } | undefined;
  let smoke: unknown;

  const step = async (name: Step, command: string[], env: Record<string, string | undefined> = {}): Promise<boolean> => {
    if (!wanted.includes(name)) return true;
    const started = performance.now();
    const result = await run(command, { cwd: ROOT, env });
    const detail = (result.stderr || result.stdout).trim().split("\n").at(-1)?.slice(0, 240);
    results.push({ name, ok: result.code === 0, ms: Math.round(performance.now() - started), detail });
    console.log(`== ${name}: ${result.code === 0 ? "ok" : `FAILED (${result.code})`}${detail ? ` (${detail})` : ""}`);
    if (result.code !== 0) return false;
    if (name === "assemble") artifact = lastJson(result.stdout) as { artifact: string };
    if (name === "smoke") smoke = JSON.parse(result.stdout.trim()) as unknown;
    return true;
  };

  const commands: Record<Step, () => Promise<boolean>> = {
    fetch: () => step("fetch", ["bun", "scripts/fetch.ts", "--allow-network"]),
    uv: () => step("uv", ["cargo", "build", "--release", "--locked", "--manifest-path", join(ROOT, "vendor/uv/Cargo.toml"), "-p", "uv", "--target", target, "--target-dir", join(TARGET_DIR, "uv")]),
    ruff: () => step("ruff", ["cargo", "build", "--release", "--locked", "--manifest-path", join(ROOT, "vendor/ruff/Cargo.toml"), "-p", "ruff", "--target", target, "--target-dir", join(TARGET_DIR, "ruff")]),
    vu: async () => {
      const built = await step("vu", ["cargo", "build", "--release", "--locked", "-p", "vu", "--target", target, "--target-dir", join(TARGET_DIR, "runtime")]);
      if (!built) return false;
      const output = join(TARGET_DIR, "runtime", target, "release");
      mkdirSync(join(TARGET_DIR, "release"), { recursive: true });
      for (const [name, from] of [
        ["vu", join(output, "vu")],
        ["uv", join(TARGET_DIR, "uv", target, "release/uv")],
        ["ruff", join(TARGET_DIR, "ruff", target, "release/ruff")],
      ]) {
        copyFileSync(from, join(TARGET_DIR, "release", name));
      }
      return true;
    },
    test: () => step("test", ["cargo", "test", "--locked", "-p", "vu-runtime", "--target-dir", join(TARGET_DIR, "runtime")]),
    clippy: () => step("clippy", ["cargo", "clippy", "--locked", "--all-targets", "-p", "vu", "-p", "vu-runtime", "--target-dir", join(TARGET_DIR, "runtime"), "--", "-D", "warnings"]),
    assemble: () => step("assemble", ["bun", "scripts/assemble.ts", "--target-dir", TARGET_DIR, "--out", ARTIFACTS, "--revision", head, "--toolchain", toolchain, "--target", target]),
    smoke: async () => {
      if (!artifact?.artifact) throw new Error("smoke requires an artifact from the assemble step");
      const command = ["bun", "scripts/smoke.ts", artifact.artifact];
      const wheel = value("--wheel");
      if (wheel) command.push("--wheel", resolve(wheel));
      return step("smoke", command);
    },
  };

  for (const name of ALL_STEPS) {
    if (wanted.includes(name) && !(await commands[name]())) break;
  }

  const receipt = {
    schema: "aphrody.vu-forge/1",
    version,
    startedAt,
    finishedAt: new Date().toISOString(),
    ok: results.length > 0 && results.every((entry) => entry.ok) && wanted.every((name) => results.some((entry) => entry.name === name)),
    revision: head,
    dirty,
    host: process.platform,
    toolchain,
    target,
    pins: Object.fromEntries(vendor.sources.map((source) => [source.name, { tag: source.upstreamTag, ref: source.ref }])),
    steps: results,
    artifact,
    smoke,
  };
  mkdirSync(RECEIPTS, { recursive: true });
  const receiptPath = join(RECEIPTS, `${head.slice(0, 8)}-${startedAt.replaceAll(/[:.]/g, "-")}.json`);
  writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(`receipt ${receiptPath}: ${receipt.ok ? "OK" : "FAILED"}`);
  return receipt.ok ? 0 : 1;
}

if (import.meta.main) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (error) {
    console.error(`forge: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
  }
}
