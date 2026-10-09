#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
//! Before and after measurements of the Python toolchain on the same host (plan, section 13.4).
//!
//!   bun scripts/bench.ts --py <py/ workspace> --before-env <venv> --after-env <venv> [--buv <runtime prefix>] [--quick]
//!
//! "Before" is what the SDK used until buv: the PATH uv and the distribution's `python3`. "After" is the runtime: its
//! uv and its interpreter. Both arms run the same commands on the same tree, in alternating order, and every case
//! reports the median and the 10th percentile of its runs. The environments must be prepared with the same locked
//! packages (`uv sync --frozen --inexact --all-packages --extra rag --extra dedup --no-install-package aphrody`, then the
//! aphrody wheel). Nothing is claimed here: the ratio of each case is printed as measured, and the receipt
//! (`receipts/bench-<time>.json`, schema aphrody.buv-bench/1) keeps the raw samples.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buvHome, hostTarget } from "./install.ts";
import { ROOT, run as execute } from "./lib.ts";

interface Arm {
  readonly name: "before" | "after";
  readonly python: string;
  readonly uv: string[];
  readonly env: string;
}

interface Sample {
  readonly ms: number[];
  readonly median: number;
  readonly p10: number;
  readonly min: number;
}

export function summarize(ms: readonly number[]): Sample {
  const sorted = [...ms].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? Number.NaN;
  return { ms: [...ms], median: at(0.5), p10: at(0.1), min: sorted[0] ?? Number.NaN };
}

export function ratio(before: Sample, after: Sample): number {
  return before.median / after.median;
}

async function time(command: string[], options: { cwd?: string; env?: Record<string, string> }): Promise<number> {
  const start = performance.now();
  const run = Bun.spawn(command, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    stdout: "ignore",
    stderr: "ignore",
  });
  const exitCode = await run.exited;
  const elapsed = performance.now() - start;
  if (exitCode !== 0) throw new Error(`${command.join(" ")} exited ${exitCode}`);
  return elapsed;
}

interface Case {
  readonly name: string;
  readonly runs: number;
  readonly command: (arm: Arm) => string[];
  readonly cwd?: string;
  readonly env?: (arm: Arm) => Record<string, string>;
  readonly prepare?: (arm: Arm) => void;
}

export async function main(args: string[]): Promise<number> {
  const flag = (name: string): string | undefined => {
    const at = args.indexOf(name);
    return at >= 0 ? args[at + 1] : undefined;
  };
  const py = flag("--py");
  const beforeEnv = flag("--before-env");
  const afterEnv = flag("--after-env");
  if (!py || !beforeEnv || !afterEnv) {
    console.error(
      "usage: bun scripts/bench.ts --py <dir> --before-env <venv> --after-env <venv> [--buv <prefix>] [--quick]",
    );
    return 64;
  }
  const prefix = flag("--buv") ?? join(buvHome(), "runtime", hostTarget(), "current");
  const beforePython = flag("--before-python") ?? Bun.which(process.platform === "win32" ? "python" : "python3");
  const beforeUv = flag("--before-uv") ?? Bun.which("uv");
  if (!beforePython || !beforeUv) throw new Error("provide --before-python and --before-uv for the actual baseline");
  const suffix = process.platform === "win32" ? ".exe" : "";
  const quick = args.includes("--quick");
  const arms: Arm[] = [
    {
      name: "before",
      python: beforePython,
      uv: [beforeUv],
      env: beforeEnv,
    },
    {
      name: "after",
      python: join(prefix, "bin", `python3${suffix}`),
      uv: [join(prefix, "bin", `buv${suffix}`), "uv"],
      env: afterEnv,
    },
  ];
  const scratch = mkdtempSync(join(tmpdir(), "buv-bench-"));
  const n = (full: number, short: number) => (quick ? short : full);
  const envPython = (arm: Arm) => join(arm.env, process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
  const cases: Case[] = [
    { name: "python start (-c pass)", runs: n(60, 10), command: a => [a.python, "-c", "pass"] },
    {
      name: "python stdlib imports (asyncio json ssl sqlite3 decimal email)",
      runs: n(40, 8),
      command: a => [a.python, "-c", "import asyncio, json, ssl, sqlite3, decimal, email.message"],
    },
    { name: "uv start (--version)", runs: n(60, 10), command: a => [...a.uv, "--version"] },
    {
      name: "import aphrody.aphrody_rust (installed wheel)",
      runs: n(40, 8),
      command: a => [envPython(a), "-c", "from aphrody import aphrody_rust"],
    },
    {
      name: "uv sync --frozen into a fresh venv (warm cache, 19 packages)",
      runs: n(5, 2),
      cwd: py,
      command: a => [...a.uv, "sync", "--frozen", "--no-install-package", "aphrody", "--python", a.python],
      env: a => ({ UV_PROJECT_ENVIRONMENT: join(scratch, `venv-${a.name}`) }),
      prepare: a => rmSync(join(scratch, `venv-${a.name}`), { recursive: true, force: true }),
    },
    {
      name: "pytest of py/ (all packages, rag and dedup extras)",
      runs: n(3, 1),
      cwd: py,
      command: a => [...a.uv, "run", "--no-sync", "pytest", "-q", "-p", "no:cacheprovider"],
      env: a => ({ UV_PROJECT_ENVIRONMENT: a.env }),
    },
  ];
  const results: Record<string, { before: Sample; after: Sample; ratio: number }> = {};
  for (const item of cases) {
    const samples: Record<Arm["name"], number[]> = { before: [], after: [] };
    for (let run = 0; run < item.runs; run++) {
      // Alternate the arms so drift (thermal state, cache pressure) hits both the same way.
      for (const arm of run % 2 === 0 ? arms : [...arms].reverse()) {
        item.prepare?.(arm);
        samples[arm.name].push(await time(item.command(arm), { cwd: item.cwd, env: item.env?.(arm) }));
      }
    }
    const before = summarize(samples.before);
    const after = summarize(samples.after);
    results[item.name] = { before, after, ratio: ratio(before, after) };
    console.log(
      `${item.name.padEnd(62)} before ${before.median.toFixed(1).padStart(9)} ms  after ${after.median.toFixed(1).padStart(9)} ms  x${ratio(before, after).toFixed(2)}`,
    );
  }
  const versions = await Promise.all(
    arms.map(async arm => {
      const [python, uv] = await Promise.all([
        execute([arm.python, "-c", "import sys; print(sys.version.split()[0])"]),
        execute([...arm.uv, "--version"]),
      ]);
      if (python.code || uv.code) throw new Error("benchmark provenance commands failed");
      return {
        arm: arm.name,
        python: python.stdout.trim(),
        uv: uv.stdout.trim(),
        pythonExecutable: arm.python,
        uvCommand: arm.uv,
      };
    }),
  );
  const at = new Date().toISOString();
  const receipt = {
    schema: "aphrody.buv-bench/1",
    at,
    host: { cpus: navigator.hardwareConcurrency, platform: process.platform, arch: process.arch },
    arms: versions,
    quick,
    results,
  };
  await Bun.write(
    join(ROOT, "receipts", `bench-${at.replaceAll(/[:.]/g, "-")}.json`),
    `${JSON.stringify(receipt, null, 2)}\n`,
  );
  rmSync(scratch, { recursive: true, force: true });
  return 0;
}

if (import.meta.main) process.exitCode = await main(process.argv.slice(2));
