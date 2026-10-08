import { beforeAll, describe, expect, test } from "bun:test";
import { bunEnv, bunExe, tempDir } from "harness";
import { existsSync, readFileSync } from "node:fs";
import { join, sep } from "node:path";

// @aphrody/bun-plugin-n2b (packages/bun-n2b): the n2b crates behind a Node-API
// addon. The addon is built from the package's own Cargo workspace when it is
// not already next to the package.

const pkgDir = join(import.meta.dir, "..", "..", "..", "packages", "bun-n2b");
const bin = join(pkgDir, "bin", "n2b.ts");

type Api = typeof import("../../../packages/bun-n2b/src/index.ts");
type Shims = typeof import("../../../packages/bun-n2b/src/shims/index.ts");
let n2b: Api;
let shims: Shims;

beforeAll(async () => {
  const { platformKeys } = await import("../../../packages/bun-n2b/src/native.ts");
  const built = platformKeys().some(key => existsSync(join(pkgDir, `bun-plugin-n2b.${key}.node`)));
  if (!built) {
    const build = Bun.spawnSync(
      [bunExe(), join(pkgDir, "..", "..", "scripts", "aphrody", "build-napi.ts"), pkgDir, "--debug"],
      { env: bunEnv, stdout: "pipe", stderr: "pipe" },
    );
    if (build.exitCode !== 0) throw new Error(`build-napi failed:\n${build.stdout}\n${build.stderr}`);
  }
  n2b = await import("../../../packages/bun-n2b/src/index.ts");
  shims = await import("../../../packages/bun-n2b/src/shims/index.ts");
}, 900_000);

const nodeFile = `import fs from "fs";\nexport const text = fs.readFileSync("data.txt", "utf8");\n`;

async function cli(args: string[], cwd: string) {
  await using proc = Bun.spawn({
    cmd: [bunExe(), bin, ...args],
    env: { ...bunEnv, NO_COLOR: "1" },
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
  return { stdout, stderr, exitCode };
}

describe("API", () => {
  test("version matches the package", () => {
    const pkg = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
    expect(n2b.version()).toBe(pkg.version);
  });

  test("transform applies the import prefix fix and leaves APIs alone", () => {
    const out = n2b.transform("index.ts", nodeFile, "fix");
    expect(out.changed).toBe(true);
    expect(out.code).toBe(`import fs from "node:fs";\nexport const text = fs.readFileSync("data.txt", "utf8");\n`);
    expect(out.findings.map(f => f.rule_id).sort()).toEqual(["api/fs-readFileSync", "imports/node-prefix"]);
  });

  test("transform aggressive migrates fs.readFileSync to Bun.file", () => {
    const out = n2b.transform("index.ts", nodeFile, "aggressive");
    expect(out.code).toContain(`await Bun.file("data.txt").text()`);
  });

  test("transform check reports without rewriting", () => {
    const out = n2b.transform("index.ts", nodeFile, "check");
    expect(out.code).toBe(nodeFile);
    expect(out.changed).toBe(false);
    expect(out.findings.length).toBe(2);
  });

  test("scan returns a schema v2 report and never writes in dry run", () => {
    using dir = tempDir("n2b-scan", { "index.ts": nodeFile, "data.txt": "hi" });
    const report = n2b.scan(String(dir), { mode: "fix" });
    expect(report.schema_version).toBe(2);
    const file = report.files.find(f => f.path.endsWith("index.ts"));
    expect(file?.findings.map(f => f.rule_id)).toContain("imports/node-prefix");
    expect(readFileSync(join(String(dir), "index.ts"), "utf8")).toBe(nodeFile);
  });

  test("scan rejects an unknown mode", () => {
    expect(() => n2b.scan(".", { mode: "nope" as never })).toThrow();
  });
});

describe("plugin", () => {
  test("Bun.build with mode fix rewrites loaded sources in memory", async () => {
    using dir = tempDir("n2b-build", { "index.ts": nodeFile, "data.txt": "hi" });
    const result = await Bun.build({
      entrypoints: [join(String(dir), "index.ts")],
      target: "bun",
      plugins: [n2b.n2bPlugin({ mode: "aggressive", quiet: true })],
    });
    expect(result.success).toBe(true);
    const code = await result.outputs[0].text();
    expect(code).toContain("Bun.file(");
    expect(code).not.toContain("readFileSync");
    expect(readFileSync(join(String(dir), "index.ts"), "utf8")).toBe(nodeFile);
  });

  test("Bun.build with onFindings error fails the build", async () => {
    using dir = tempDir("n2b-build-error", { "index.ts": nodeFile, "data.txt": "hi" });
    let error: unknown;
    try {
      await Bun.build({
        entrypoints: [join(String(dir), "index.ts")],
        target: "bun",
        plugins: [n2b.n2bPlugin({ root: String(dir), mode: "report", onFindings: "error", quiet: true })],
      });
    } catch (e) {
      error = e;
    }
    expect(String(error)).toContain("[n2b]");
  });

  test("runtime Bun.plugin migrates a module before it runs", async () => {
    const entry = join(pkgDir, "src", "index.ts").replaceAll("\\", "/");
    using dir = tempDir("n2b-runtime", {
      "preload.ts": `import { n2bPlugin } from "${entry}";\nBun.plugin(n2bPlugin({ mode: "aggressive", quiet: true, filter: /app\\.ts$/ }));\n`,
      "app.ts": `${nodeFile}console.log(text, typeof fs.readFileSync);\n`,
      "data.txt": "from-bun-file",
    });
    await using proc = Bun.spawn({
      cmd: [bunExe(), "--preload", "./preload.ts", "./app.ts"],
      env: bunEnv,
      cwd: String(dir),
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
    expect(stderr).not.toContain("error");
    expect(stdout.trim()).toBe("from-bun-file function");
    expect(exitCode).toBe(0);
  });
});

describe("CLI", () => {
  test.concurrent("scan exits 1 on findings and prints them as JSON", async () => {
    using dir = tempDir("n2b-cli-scan", { "index.ts": nodeFile });
    const { stdout, exitCode } = await cli([".", "--report=json"], String(dir));
    const report = JSON.parse(stdout);
    expect(report.findings_total).toBeGreaterThan(0);
    expect(exitCode).toBe(1);
  });

  test.concurrent("fix verb writes the safe fixes", async () => {
    using dir = tempDir("n2b-cli-fix", { "index.ts": nodeFile });
    const { exitCode } = await cli(["fix", "."], String(dir));
    expect(readFileSync(join(String(dir), "index.ts"), "utf8")).toContain(`from "node:fs"`);
    expect([0, 1]).toContain(exitCode);
  });

  test.concurrent("report verb prints Markdown", async () => {
    using dir = tempDir("n2b-cli-report", { "index.ts": nodeFile });
    const { stdout } = await cli(["report", "."], String(dir));
    expect(stdout).toContain("imports/node-prefix");
    expect(stdout).toMatch(/^#/m);
  });

  test.concurrent("rules lists the catalogue", async () => {
    using dir = tempDir("n2b-cli-rules", {});
    const { stdout, exitCode } = await cli(["rules", "--report=json"], String(dir));
    const rules = JSON.parse(stdout) as { id: string }[];
    expect(rules.map(r => r.id)).toContain("imports/node-prefix");
    expect(exitCode).toBe(0);
  });

  test.concurrent("an unknown flag exits 2", async () => {
    using dir = tempDir("n2b-cli-bad", {});
    const { stderr, exitCode } = await cli(["--definitely-not-a-flag"], String(dir));
    expect(stderr).toContain("--definitely-not-a-flag");
    expect(exitCode).toBe(2);
  });
});

describe("shims", () => {
  test("env parses typed values and enforces required keys", () => {
    process.env.N2B_SHIM_INT = "42";
    process.env.N2B_SHIM_BOOL = "yes";
    expect(shims.env.int("N2B_SHIM_INT")).toBe(42);
    expect(shims.env.bool("N2B_SHIM_BOOL")).toBe(true);
    expect(() => shims.env.str("N2B_SHIM_MISSING", { required: true })).toThrow(shims.EnvError);
    expect(shims.env.str("N2B_SHIM_MISSING", { default: "x" })).toBe("x");
    delete process.env.N2B_SHIM_INT;
    delete process.env.N2B_SHIM_BOOL;
  });

  test("fs round-trips text and JSON", async () => {
    using dir = tempDir("n2b-shims-fs", {});
    const file = join(String(dir), "a.json");
    await shims.fs.writeJson(file, { a: 1 });
    expect(await shims.fs.exists(file)).toBe(true);
    expect(await shims.fs.readJson(file)).toEqual({ a: 1 });
    expect(await shims.fs.size(join(String(dir), "missing"))).toBeNull();
  });

  test("path resolves relative to the importing module", () => {
    expect(shims.path.dirOf(import.meta)).toBe(import.meta.dir);
    expect(shims.path.fileOf(import.meta).endsWith(`${sep}bun-plugin-n2b.test.ts`)).toBe(true);
  });
});
