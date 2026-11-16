import { describe, expect, test } from "bun:test";
import { bunEnv, bunExe, tempDir } from "harness";
import { join } from "path";

async function migrate(cwd: string, ...args: string[]) {
  await using proc = Bun.spawn({
    cmd: [bunExe(), "migrate", ...args],
    cwd,
    env: bunEnv,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
  return { stdout, stderr, exitCode };
}

const monorepo = {
  "package.json": JSON.stringify(
    {
      name: "root",
      private: true,
      packageManager: "pnpm@9.0.0",
      scripts: { build: "pnpm -r run build", lint: "cross-env CI=1 eslint .", start: "npm start" },
      devDependencies: { turbo: "^2.0.0" },
    },
    null,
    2,
  ),
  "pnpm-workspace.yaml": "packages:\n  - 'packages/*'\n  - '!packages/legacy'\n",
  "pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
  "turbo.json": JSON.stringify({ tasks: { build: { dependsOn: ["^build"], inputs: ["pnpm-lock.yaml"] } } }, null, 2),
  "packages/app/package.json": JSON.stringify(
    {
      name: "@acme/app",
      scripts: { dev: "ts-node src/index.ts", ci: "npm ci && npx tsc --noEmit" },
      dependencies: { "@acme/lib": "workspace:*", "node-fetch": "^3.0.0" },
    },
    null,
    2,
  ),
  "packages/app/src/index.ts": 'import fs from "fs";\nimport { join } from "node:path";\nconsole.log(fs, join);\n',
  "packages/lib/package.json": JSON.stringify({ name: "@acme/lib", scripts: { build: "tsc" } }, null, 2),
  "packages/legacy/package.json": JSON.stringify({ name: "legacy" }, null, 2),
  "Dockerfile": "FROM node:20-alpine AS base\nRUN npm ci\n",
  ".github/workflows/ci.yml": "steps:\n  - uses: actions/setup-node@v4\n    with:\n      node-version: 20\n      cache: pnpm\n  - run: pnpm install --frozen-lockfile\n",
};

describe("bun migrate", () => {
  test("reports the workspace without changing anything", async () => {
    using dir = tempDir("migrate-report", monorepo);
    const { stdout, stderr, exitCode } = await migrate(String(dir), "--format", "json");
    expect(stderr).toBe("");
    const report = JSON.parse(stdout);
    expect(report.workspace.packageManager).toBe("pnpm");
    expect(report.workspace.taskRunners).toEqual(["turbo"]);
    expect(report.workspace.turboTasks).toEqual(["build"]);
    expect(report.workspace.lockfiles).toEqual(["pnpm-lock.yaml"]);
    expect(report.workspace.packages.map((p: { name: string }) => p.name).sort()).toEqual(["@acme/app", "@acme/lib"]);
    expect(report.workspace.protocols).toEqual([{ protocol: "workspace:", count: 1 }]);
    const rules = new Set(report.findings.map((f: { ruleId: string }) => f.ruleId));
    for (const rule of ["cli/filter-pnpm-all", "cli/cross-env", "docker/node-base-alpine", "ci/setup-node", "imports/node-prefix", "bun/fetch"]) {
      expect(rules).toContain(rule);
    }
    expect(report.findings.every((f: { applied: boolean }) => f.applied === false)).toBe(true);
    expect(await Bun.file(join(String(dir), "Dockerfile")).text()).toBe(monorepo.Dockerfile);
    expect(exitCode).toBe(0);
  });

  test("--write applies the safe rewrites and leaves the ones that change behavior", async () => {
    using dir = tempDir("migrate-write", monorepo);
    const { exitCode } = await migrate(String(dir), "--write");
    expect(exitCode).toBe(0);
    const root = JSON.parse(await Bun.file(join(String(dir), "package.json")).text());
    expect(root.scripts).toEqual({ build: "bun run --filter '*' build", lint: "CI=1 eslint .", start: "bun run start" });
    expect(root.packageManager).toBe("pnpm@9.0.0");
    const app = JSON.parse(await Bun.file(join(String(dir), "packages/app/package.json")).text());
    expect(app.scripts).toEqual({ dev: "ts-node src/index.ts", ci: "bun install --frozen-lockfile && bunx tsc --noEmit" });
    expect(await Bun.file(join(String(dir), "Dockerfile")).text()).toBe("FROM oven/bun:1-alpine AS base\nRUN bun install --frozen-lockfile\n");
    expect(await Bun.file(join(String(dir), ".github/workflows/ci.yml")).text()).toBe(
      "steps:\n  - uses: oven-sh/setup-bun@v2\n    with:\n      bun-version: latest\n  - run: bun install --frozen-lockfile\n",
    );
    expect(await Bun.file(join(String(dir), "packages/app/src/index.ts")).text()).toBe(
      'import fs from "node:fs";\nimport { join } from "node:path";\nconsole.log(fs, join);\n',
    );
    expect(await Bun.file(join(String(dir), "turbo.json")).text()).toContain('"bun.lock"');
  });

  test("--aggressive also runs scripts with bun and drops packageManager", async () => {
    using dir = tempDir("migrate-aggressive", monorepo);
    const { exitCode } = await migrate(String(dir), "--aggressive");
    expect(exitCode).toBe(0);
    const root = JSON.parse(await Bun.file(join(String(dir), "package.json")).text());
    expect(root.packageManager).toBeUndefined();
    const app = JSON.parse(await Bun.file(join(String(dir), "packages/app/package.json")).text());
    expect(app.scripts.dev).toBe("bun src/index.ts");
  });

  test("--check exits with 1 while warnings remain and with 0 once they are fixed", async () => {
    using dir = tempDir("migrate-check", monorepo);
    expect((await migrate(String(dir), "--check")).exitCode).toBe(1);
    await migrate(String(dir), "--aggressive");
    expect((await migrate(String(dir), "--check")).exitCode).toBe(0);
  });

  test("--target rust plans addons, hot packages and tools", async () => {
    using dir = tempDir("migrate-rust", {
      "package.json": JSON.stringify({
        name: "x",
        scripts: { format: "prettier --write src", lint: "eslint --fix src", build: "node-gyp rebuild" },
        dependencies: { sharp: "^0.33.0", nan: "^2.0.0" },
      }),
      "binding.gyp": "{}",
      "src/index.js": 'const addon = require("./build/Release/addon.node");\nprocess.dlopen(module, "x");\n',
    });
    const { stdout, exitCode } = await migrate(String(dir), "--target", "rust", "--format", "json");
    expect(exitCode).toBe(0);
    const { rust } = JSON.parse(stdout);
    const ids = rust.items.map((i: { id: string }) => i.id);
    expect(ids).toEqual(expect.arrayContaining(["scripts.format", "scripts.lint", "scripts.build", "sharp", "nan", "binding.gyp", "*.node", "process.dlopen"]));
    const fmt = rust.items.find((i: { id: string }) => i.id === "scripts.format");
    expect(fmt).toMatchObject({ kind: "tool", to: "bun fmt src", status: "plan" });
    expect(rust.items.find((i: { id: string }) => i.id === "sharp")).toMatchObject({ kind: "hot", to: "image", pin: "github:image-rs/image" });
  });

  test("--registry adds rules and --rule turns one off", async () => {
    using dir = tempDir("migrate-registry", {
      "package.json": JSON.stringify({ name: "x", scripts: { a: "pnpm run build" } }),
      "extra.toml": "[text]\n{ id = \"acme/script\", kinds = [\"script\"], pattern = '\\bbuild\\b', replace = 'compile', message = 'rename', autofix = true }\n",
    });
    const added = await migrate(String(dir), "--registry", "extra.toml", "--format", "jsonl");
    expect(added.stdout).toContain('"ruleId":"acme/script"');
    const off = await migrate(String(dir), "--registry", "extra.toml", "--rule", "acme/=off", "--rule", "cli/run=off", "--format", "jsonl");
    expect(off.stdout).not.toContain("acme/script");
    expect(off.stdout).not.toContain("cli/run");
  });

  test("runs the script of the project that has the name of the command", async () => {
    using dir = tempDir("migrate-script", {
      "package.json": JSON.stringify({ name: "x", scripts: { migrate: "echo database migrated" } }),
    });
    const { stdout, exitCode } = await migrate(String(dir));
    expect(stdout).toContain("database migrated");
    expect(exitCode).toBe(0);
  });

  test("refuses flags it cannot honor", async () => {
    using dir = tempDir("migrate-flags", { "package.json": "{}" });
    for (const [args, message] of [
      [["--bogus"], 'Unknown flag "--bogus"'],
      [["--target", "go"], '--target must be bun or rust, not "go"'],
      [["--check", "--write"], "--check does not write"],
      [["--rule", "x"], "--rule takes <id>=<off|info|warn|error>"],
    ] as const) {
      const { stderr, exitCode } = await migrate(String(dir), ...args);
      expect(stderr).toContain(message);
      expect(exitCode).toBe(2);
    }
  });
});
