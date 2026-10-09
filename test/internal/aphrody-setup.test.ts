// scripts/aphrody/setup.ts: the one-command setup of the fork. Run with the system bun (`bun test`): it only
// spawns setup.ts in dry-run mode and reads the checkout.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { collectDependencies, parseOptions } from "../../scripts/aphrody/setup.ts";

const root = join(import.meta.dir, "..", "..");
const setup = join(root, "scripts/aphrody/setup.ts");

test("deps.json lists exactly what the checkout pins", async () => {
  const inventory = JSON.parse(readFileSync(join(root, "scripts/aphrody/deps.json"), "utf8"));
  const key = (d: any) => `${d.kind} ${d.repo}@${d.ref} ${d.usedBy.join(",")}`;
  const fresh = await collectDependencies(root);
  expect(inventory.dependencies.map(key).sort()).toEqual(fresh.map(key).sort());
  const repos = fresh.map(d => d.repo);
  expect(repos).toContain("aphrody-labs/uutils-coreutils");
  expect(repos).toContain("aphrody-labs/WebKit");
  expect(repos).toContain("aphrody-labs/oxc");
  for (const d of fresh.filter(d => d.kind === "github-archive")) expect(d.ref).toMatch(/^[0-9a-f]{40}$/);
});

test("options", () => {
  expect(parseOptions(["--dry-run", "--no-build", "--dir=x", "--ref", "v1"])).toMatchObject({
    dryRun: true,
    build: false,
    ref: "v1",
  });
  expect(parseOptions(["deps", "--check"])).toMatchObject({ command: "deps", check: true });
  expect(() => parseOptions(["--nope"])).toThrow("unknown argument");
});

test("dry run plans every step and changes nothing", async () => {
  await using proc = Bun.spawn({
    cmd: [process.execPath, setup, "--dry-run", "--json", "--no-system", "--no-update", "--packages"],
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
  expect(stderr).toBe("");
  const plan = JSON.parse(stdout);
  const ids = plan.steps.map((s: { id: string }) => s.id);
  expect(ids).toEqual([
    "bun",
    "llvm",
    "rustup",
    "rust-toolchain",
    ...(process.platform === "win32" ? ["msvc"] : []),
    "bun-install",
    "vendor",
    "packages",
    "build",
  ]);
  const build = plan.steps.find((s: { id: string }) => s.id === "build");
  expect(build.commands.at(-1)).toEndWith("run bd --version");
  const packages = plan.steps.find((s: { id: string }) => s.id === "packages");
  expect(packages.commands.join("\n")).toContain("packages/bun-oxc/Cargo.toml");
  expect(exitCode).toBe(0);
});
