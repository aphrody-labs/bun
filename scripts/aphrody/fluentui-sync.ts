#!/usr/bin/env bun

import { join, relative } from "node:path";

const root = join(import.meta.dir, "../..");
const vendor = join(root, "vendor/fluentui");
const source = join(vendor, "packages/tokens/src");
const target = join(root, "packages/bun-ui/packages/bun-fluent/src/tokens");
const sync = process.argv.includes("--sync");
const json = process.argv.includes("--json");

type PackageJson = { name: string; version: string; dependencies?: Record<string, string> };

async function packageJson(path: string): Promise<PackageJson> {
  return Bun.file(path).json();
}

async function git(...args: string[]) {
  const result = Bun.spawnSync({ cmd: ["git", "-C", vendor, ...args], stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString().trim());
  return result.stdout.toString().trim();
}

const files = [...new Bun.Glob("**/*.ts").scanSync({ cwd: source, onlyFiles: true })]
  .filter(path => !/(?:^|\/)(?:[^/]+\.)?(?:test|spec|spec-e2e)\.ts$/.test(path.replaceAll("\\", "/")))
  .sort();
const drift: string[] = [];
for (const path of files) {
  const upstream = await Bun.file(join(source, path)).text();
  const destination = Bun.file(join(target, path));
  if (!(await destination.exists())) {
    drift.push(path.replaceAll("\\", "/"));
    if (sync) await Bun.write(destination, upstream);
  }
}

const [upstreamTokens, bunTokens] = await Promise.all([
  import(join(source, "index.ts")),
  import(join(target, "index.ts")),
]);
const comparable = (module: Record<string, unknown>) => ({
  exports: Object.keys(module).sort(),
  values: Object.fromEntries(Object.entries(module).filter(([, value]) => typeof value !== "function")),
});
if (JSON.stringify(comparable(upstreamTokens)) !== JSON.stringify(comparable(bunTokens))) drift.push("runtime exports");

const suite = await packageJson(join(vendor, "packages/react-components/react-components/package.json"));
const theme = await packageJson(join(vendor, "packages/react-components/react-theme/library/package.json"));
const tokens = await packageJson(join(vendor, "packages/tokens/package.json"));
const componentPackages = Object.keys(suite.dependencies ?? {}).filter(name => name.startsWith("@fluentui/react-"));
const report = {
  source: "aphrody-labs/fluentui",
  upstream: "microsoft/fluentui",
  commit: await git("rev-parse", "HEAD"),
  branch: await git("branch", "--show-current"),
  packages: {
    reactComponents: suite.version,
    reactTheme: theme.version,
    tokens: tokens.version,
  },
  reactV9ComponentPackages: componentPackages.length,
  tokenSourceFiles: files.length,
  drift,
  legacyIncluded: false,
};

if (json) console.log(JSON.stringify(report, null, 2));
else {
  console.log(
    `Fluent UI ${report.commit.slice(0, 12)}: React v9 ${suite.version}, ${componentPackages.length} component packages, ${files.length} token files`,
  );
  console.log(drift.length ? `${drift.length} token files differ: ${drift.join(", ")}` : "Bun token SDK is in sync");
}

if (drift.length && !sync) {
  console.error(`Run ${relative(root, import.meta.path)} --sync, then bun bd fmt packages/bun-ui/packages/bun-fluent/src/tokens`);
  process.exitCode = 1;
}
