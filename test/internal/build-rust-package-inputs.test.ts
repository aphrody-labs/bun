import { beforeAll, expect, test } from "bun:test";
import { tempDir } from "harness";
import { readFileSync, utimesSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Config } from "../../scripts/build/config.ts";
import { Ninja } from "../../scripts/build/ninja.ts";
import { emitRustPlan, registerRustUnitRules } from "../../scripts/build/rust/emit.ts";
import type { PlanInput } from "../../scripts/build/rust/plan.ts";
import { globAllSources } from "../../scripts/glob-sources.ts";

const root = resolve(import.meta.dirname, "../..");
const manifest = join(root, "packages/aphrody-pkg-system/Cargo.toml");
let rustSources: string[];
// A native debug runtime scans the full real checkout for this owner snapshot.
// Take it once during bounded fixture setup rather than once per assertion.
beforeAll(() => {
  rustSources = globAllSources().rust;
}, 40000);

test("the system-package manifest and Rust sources enter the native input snapshot", () => {
  expect(rustSources).toContain(manifest);
  for (const file of ["sqlite.rs", "version.rs", "winget.rs"]) {
    expect(rustSources).toContain(join(root, "packages/aphrody-pkg-system/src", file));
  }
});

test("changing the watched package manifest makes the real Ninja Rust plan edge dirty", () => {
  using dir = tempDir("rust-package-input", {});
  const cwd = String(dir);
  const watched = join(cwd, "Cargo.toml");
  const plan = join(cwd, "plan.json");
  expect(rustSources.filter(p => p.endsWith("Cargo.toml"))).toContain(manifest);
  writeFileSync(watched, readFileSync(manifest));
  const n = new Ninja({ buildDir: cwd });
  // Only the fields consumed by the real rule/edge emitters are required here.
  const cfg = {
    host: { os: process.platform },
    bun: process.execPath,
    jsRuntime: JSON.stringify(process.execPath),
  } as Config;
  registerRustUnitRules(n, cfg);
  const input: PlanInput = {
    cwd,
    cargo: "cargo",
    rustc: "rustc",
    host: "x86_64-unknown-linux-gnu",
    sysroot: cwd,
    triple: "x86_64-unknown-linux-gnu",
    rustflags: [],
    buildScripts: [],
    args: ["build", "-p", "bun_runtime"],
    env: {},
  };
  emitRustPlan(n, cfg, cwd, { input, inputs: [watched] });
  writeFileSync(join(cwd, "build.ninja"), n.toString());
  writeFileSync(plan, "{}\n");
  const future = Date.now() / 1000 + 10;
  utimesSync(plan, future, future);
  const ninja = Bun.which("ninja");
  expect(ninja).not.toBeNull();
  const dryRun = () =>
    Bun.spawnSync([ninja!, "-C", cwd, "-d", "explain", "-n", "plan.json"], {
      stdout: "pipe",
      stderr: "pipe",
    });
  const before = dryRun();
  expect(before.exitCode).toBe(0);
  // Without an execution log Ninja also notices an unrecorded command;
  // before the edit it must not report the manifest as a dirty input.
  expect(before.stderr.toString()).not.toContain("Cargo.toml");
  writeFileSync(watched, `${readFileSync(watched, "utf8")}\n# dependency graph changed\n`);
  utimesSync(watched, future + 2, future + 2);
  const after = dryRun();
  expect(after.exitCode).toBe(0);
  expect(after.stderr.toString()).toContain("Cargo.toml");
  expect(after.stdout.toString()).toContain("cargo plan");
});
