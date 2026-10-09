// `bun lint`, `bun fmt`, `bun n2b`, `bun migrate`, `bun wasm` and `bun build --target=wasm`
// (src/runtime/cli/toolchain_command.rs + src/js/eval/toolchain.ts). oxlint, oxfmt and n2b are
// replaced by local scripts through BUN_OXLINT / BUN_OXFMT / BUN_N2B, so nothing is downloaded.
import { describe, expect, test } from "bun:test";
import { bunEnv, bunExe, normalizeBunSnapshot, tempDir } from "harness";
import { join } from "node:path";

const env = {
  ...bunEnv,
  npm_lifecycle_event: undefined,
  NO_COLOR: "1",
  FORCE_COLOR: undefined,
  YOLO_HOME: undefined,
  BUN_CREATE_APHRODY_DIR: undefined,
};

async function run(args: string[], cwd?: string, extraEnv: Record<string, string | undefined> = {}) {
  await using proc = Bun.spawn({
    cmd: [bunExe(), ...args],
    env: { ...env, ...extraEnv },
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
  return { stdout, stderr, exitCode };
}

// Prints its arguments in the shape oxlint uses for --format=json.
const fakeOxlint = `
const args = process.argv.slice(2);
if (args.includes("--format=json")) console.log(JSON.stringify({ diagnostics: [], args }));
else console.log("oxlint " + JSON.stringify(args));
process.exit(args.includes("--deny-warnings") ? 1 : 0);
`;
const fakeOxfmt = `console.log("oxfmt " + JSON.stringify(process.argv.slice(2)));`;
const fakeN2b = `
const args = process.argv.slice(2);
if (!args.includes("--report=json")) {
  console.log("n2b " + JSON.stringify(args));
  process.exit(0);
}
console.log(JSON.stringify({
  schema_version: 2, tool: "n2b", version: "0.0.0", mode: "scan", root: ".", files_scanned: 1, findings_total: 1,
  files: [{ path: "a.ts", changed: false, findings: [{
    rule_id: "node-fs-readfile", category: "fs", severity: "warn", confidence: 1, message: "Use Bun.file().text()",
    line: 1, col: 1, start_byte: 0, end_byte: 11, original: "readFileSync", replacement: "Bun.file", autofix: true,
    docs_url: "https://bun.com/docs/api/file-io", context: { before: [], line: "", after: [] },
  }] }],
}));
`;

function tools(dir: string) {
  return {
    BUN_OXLINT: join(dir, "tools", "oxlint.ts"),
    BUN_OXFMT: join(dir, "tools", "oxfmt.ts"),
    BUN_N2B: join(dir, "tools", "n2b.ts"),
  };
}

const toolFiles = { "tools/oxlint.ts": fakeOxlint, "tools/oxfmt.ts": fakeOxfmt, "tools/n2b.ts": fakeN2b };

describe("routing", () => {
  test.concurrent("a package.json script with the same name keeps priority", async () => {
    using dir = tempDir("toolchain-script", {
      "package.json": JSON.stringify({ scripts: { lint: "echo the lint script ran", fmt: "echo the fmt script ran" } }),
    });
    const lint = await run(["lint"], String(dir));
    const fmt = await run(["fmt"], String(dir));
    expect(lint.stdout.trim()).toBe("the lint script ran");
    expect(fmt.stdout.trim()).toBe("the fmt script ran");
    expect(lint.exitCode).toBe(0);
    expect(fmt.exitCode).toBe(0);
  });

  test.concurrent("inside that script, `bun lint` is the command", async () => {
    using dir = tempDir("toolchain-script-self", {
      "package.json": JSON.stringify({ scripts: { lint: `${bunExe()} lint --help` } }),
    });
    const { stdout, exitCode } = await run(["lint"], String(dir));
    expect(stdout).toContain("Usage: bun lint [flags] [...paths]");
    expect(exitCode).toBe(0);
  });

  test.concurrent.each([
    ["lint", "Usage: bun lint"],
    ["fmt", "Usage: bun fmt"],
    ["migrate", "Usage: bun migrate"],
    ["wasm", "Usage: bun wasm <command>"],
  ])("bun %s --help", async (command, usage) => {
    const { stdout, exitCode } = await run([command, "--help"]);
    expect(stdout).toContain(usage);
    expect(exitCode).toBe(0);
  });

  test.concurrent("bun build --target=wasm is the wasm build", async () => {
    const help = await run(["build", "--target=wasm", "--help"]);
    expect(help.stdout).toContain("Usage: bun wasm <command>");
    expect(help.exitCode).toBe(0);
    const unknown = await run(["build", "--target", "wasm", "--bogus"]);
    expect(unknown.stderr).toContain("Unknown flag --bogus");
    expect(unknown.exitCode).toBe(1);
  });

  test.concurrent("bun build without --target=wasm still bundles", async () => {
    using dir = tempDir("toolchain-build-js", { "index.ts": `console.log("wasm" as string);` });
    const { stdout, exitCode } = await run(["build", "index.ts", "--target=bun"], String(dir));
    expect(stdout).toContain(`console.log("wasm")`);
    expect(exitCode).toBe(0);
  });
});

describe("bun lint", () => {
  test.concurrent("passes bunfig [lint] and unknown flags to oxlint, then prints n2b findings", async () => {
    using dir = tempDir("toolchain-lint", {
      ...toolFiles,
      "a.ts": `readFileSync("x");\n`,
      "bunfig.toml": `[lint]\nconfig = "lint.json"\nignore = ["dist/**"]\nargs = ["-D", "correctness"]\n`,
    });
    const { stdout, exitCode } = await run(["lint", "-A", "no-console", "src"], String(dir), tools(String(dir)));
    expect(normalizeBunSnapshot(stdout, dir)).toMatchInlineSnapshot(`
      "oxlint ["--config","lint.json","--ignore-pattern","dist/**","-D","correctness","-A","no-console","src"]
      a.ts:1:1 warning n2b(node-fs-readfile) Use Bun.file().text()
        help: Use \`Bun.file\` (bun lint --fix)
        https://bun.com/docs/api/file-io

      n2b: 0 error(s), 1 warning(s)"
    `);
    expect(exitCode).toBe(0);
  });

  test.concurrent("--format=json merges the n2b findings into oxlint's diagnostics", async () => {
    using dir = tempDir("toolchain-lint-json", { ...toolFiles, "a.ts": `readFileSync("x");\n` });
    const { stdout, exitCode } = await run(["lint", "--format=json", "--fix"], String(dir), tools(String(dir)));
    const out = JSON.parse(stdout);
    expect(out.args).toEqual(["--fix", "--format=json"]);
    expect(out.diagnostics).toEqual([
      expect.objectContaining({
        code: "n2b(node-fs-readfile)",
        severity: "warning",
        filename: "a.ts",
        labels: [{ span: { offset: 0, length: 11, line: 1, column: 1 } }],
      }),
    ]);
    expect(exitCode).toBe(0);
  });

  test.concurrent("--format=sarif adds an n2b run", async () => {
    using dir = tempDir("toolchain-lint-sarif", { ...toolFiles, "a.ts": `readFileSync("x");\n` });
    const { stdout, exitCode } = await run(["lint", "--format=sarif", "--n2b-only"], String(dir), tools(String(dir)));
    const out = JSON.parse(stdout);
    expect(out.version).toBe("2.1.0");
    expect(out.runs.map((r: any) => r.tool.driver.name)).toEqual(["n2b"]);
    expect(out.runs[0].results[0].ruleId).toBe("n2b(node-fs-readfile)");
    expect(exitCode).toBe(0);
  });

  test.concurrent("--deny-warnings fails on n2b warnings", async () => {
    using dir = tempDir("toolchain-lint-deny", { ...toolFiles, "a.ts": `readFileSync("x");\n` });
    const { stdout, exitCode } = await run(["lint", "--deny-warnings", "--n2b-only"], String(dir), tools(String(dir)));
    expect(stdout).toContain("n2b: 0 error(s), 1 warning(s)");
    expect(exitCode).toBe(1);
  });

  test.concurrent("--workspaces lints each workspace package", async () => {
    using dir = tempDir("toolchain-lint-ws", {
      ...toolFiles,
      "package.json": JSON.stringify({ workspaces: ["packages/*"] }),
      "packages/a/package.json": JSON.stringify({ name: "a" }),
      "packages/b/package.json": JSON.stringify({ name: "b" }),
    });
    const all = await run(["lint", "--workspaces", "--no-n2b"], String(dir), tools(String(dir)));
    const one = await run(["lint", "--filter", "b", "--no-n2b"], String(dir), tools(String(dir)));
    expect(all.stdout.trim()).toBe(`oxlint ["packages/a","packages/b"]`);
    expect(one.stdout.trim()).toBe(`oxlint ["packages/b"]`);
    expect(all.exitCode).toBe(0);
    expect(one.exitCode).toBe(0);
  });
});

describe("bun fmt", () => {
  test.concurrent("passes --check, bunfig [fmt] and ignores to oxfmt", async () => {
    using dir = tempDir("toolchain-fmt", {
      ...toolFiles,
      "bunfig.toml": `[fmt]\nconfig = "fmt.json"\npaths = ["src"]\nignore = ["dist/**"]\n`,
    });
    const { stdout, exitCode } = await run(["fmt", "--check"], String(dir), tools(String(dir)));
    expect(stdout.trim()).toBe(`oxfmt ["--config","fmt.json","--check","src","!dist/**"]`);
    expect(exitCode).toBe(0);
  });
});

describe("bun n2b / bun migrate", () => {
  test.concurrent("migrate is the --migrate mode of n2b", async () => {
    using dir = tempDir("toolchain-migrate", toolFiles);
    const migrate = await run(["migrate", "--dry-run"], String(dir), tools(String(dir)));
    const n2b = await run(["n2b", "migrate", "--dry-run", "."], String(dir), tools(String(dir)));
    expect(migrate.stdout.trim()).toBe(`n2b ["--migrate","--dry-run"]`);
    expect(n2b.stdout.trim()).toBe(`n2b ["--migrate","--dry-run","."]`);
    expect(migrate.exitCode).toBe(0);
    expect(n2b.exitCode).toBe(0);
  });
});

describe("bun create aphrody/<template>", () => {
  const stack = {
    "aphrody/m3/templates/stack.toml": [
      `[meta]\nname = "aphrody-stack"\n`,
      `[template.base]\npath = "m3/templates/base"\ndescription = "server"\nrequired = true\n`,
      `[template.web]\npath = "m3/templates/web"\ndescription = "web"\nexclusive = "frontend"\n`,
      `[template.react]\npath = "m3/templates/react"\ndescription = "react"\nexclusive = "frontend"\ndependencies = { react = "19.3.0" }\n`,
    ].join("\n"),
    "aphrody/m3/templates/base/package.json": JSON.stringify({
      name: "__NAME__",
      dependencies: { "@aphrody/runtime-sdk": "file:__YOLO__/packages/engine/runtime" },
      devDependencies: {},
    }),
    "aphrody/m3/templates/base/gitignore": "node_modules\n",
    "aphrody/m3/templates/base/src/home.ts": `export const home = "base __IDENT__";\n`,
    "aphrody/m3/templates/web/src/home.ts": `export const home = "web";\n`,
    "aphrody/m3/templates/react/src/app.tsx": `export {};\n`,
  };

  test.concurrent("composes the required layer and the requested ones", async () => {
    using dir = tempDir("toolchain-create", stack);
    const { stdout, stderr, exitCode } = await run(
      ["create", "aphrody/web", "my-app", "--templates", "aphrody/m3/templates"],
      String(dir),
    );
    expect(stderr).toBe("");
    expect(stdout).toContain("Created my-app (3 files: base, web)");
    const app = join(String(dir), "my-app");
    expect(await Bun.file(join(app, "src/home.ts")).text()).toBe(`export const home = "web";\n`);
    expect(await Bun.file(join(app, ".gitignore")).text()).toBe("node_modules\n");
    const pkg = await Bun.file(join(app, "package.json")).json();
    expect(pkg.name).toBe("my-app");
    expect(pkg.dependencies["@aphrody/runtime-sdk"]).toMatch(/^file:.*\/aphrody\/packages\/engine\/runtime$/);
    expect(exitCode).toBe(0);
  });

  test.concurrent("finds the templates of the checkout around the working directory", async () => {
    using dir = tempDir("toolchain-create-checkout", stack);
    const { stdout, exitCode } = await run(["create", "aphrody/react", "app"], join(String(dir), "aphrody"));
    expect(stdout).toContain("Created app (4 files: base, react)");
    const pkg = await Bun.file(join(String(dir), "aphrody", "app", "package.json")).json();
    expect(pkg.dependencies.react).toBe("19.3.0");
    expect(exitCode).toBe(0);
  });

  test.concurrent("rejects two templates of one exclusive group", async () => {
    using dir = tempDir("toolchain-create-exclusive", stack);
    const { stderr, exitCode } = await run(["create", "aphrody/web+react", "app"], join(String(dir), "aphrody"));
    expect(stderr).toContain("Choose one frontend template: web or react");
    expect(exitCode).toBe(1);
  });

  test.concurrent("bun create aphrody --list lists the templates", async () => {
    using dir = tempDir("toolchain-create-list", stack);
    const { stdout, exitCode } = await run(["create", "aphrody", "--list"], join(String(dir), "aphrody"));
    const row = (id: string, always: boolean, description: string) =>
      `  ${id.padEnd(8)} ${always ? "(always) " : "         "}${description}`;
    expect(stdout.split("\n").slice(1)).toEqual([
      row("base", true, "server"),
      row("web", false, "web"),
      row("react", false, "react"),
      "",
    ]);
    expect(exitCode).toBe(0);
  });
});

describe("bun:wasm", () => {
  test.concurrent("exports build, optimize and plugin", async () => {
    const { stdout, exitCode } = await run([
      "-e",
      `const wasm = require("bun:wasm"); console.log(Object.keys(wasm).sort().join(), typeof wasm.plugin().setup);`,
    ]);
    expect(stdout.trim()).toBe("build,optimize,plugin function");
    expect(exitCode).toBe(0);
  });

  // Stands in for cargo: answers `metadata` for the --manifest-path crate, writes an empty module on
  // `build`, and logs each call next to itself.
  const fakeCargo = `
const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2);
const manifest = args[args.indexOf("--manifest-path") + 1];
const logged = args.filter(a => a !== "--manifest-path" && a !== manifest);
fs.appendFileSync(path.join(__dirname, "calls.txt"), logged.join(" ") + "\\n");
const targetDirectory = path.join(__dirname, "target");
if (args[0] === "metadata") {
  console.log(JSON.stringify({
    workspace_root: path.dirname(manifest),
    target_directory: targetDirectory,
    packages: [{ name: "add", version: "0.1.0", manifest_path: manifest, dependencies: [],
      targets: [{ name: "add", kind: ["cdylib"] }] }],
  }));
} else if (args[0] === "build") {
  const out = path.join(targetDirectory, args[args.indexOf("--target") + 1], "release");
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, "add.wasm"), Uint8Array.of(0, 0x61, 0x73, 0x6d, 1, 0, 0, 0));
} else process.exit(2);
`;

  test.concurrent("bun wasm build --cargo and the cargo option replace cargo", async () => {
    using dir = tempDir("toolchain-wasm-cargo", {
      "add/Cargo.toml": `[package]\nname = "add"\nversion = "0.1.0"\n`,
      "fake-cargo.js": fakeCargo,
      "api.ts": `import { build } from "bun:wasm";
const { bytes } = await build({ crate: "add", outdir: "api-pkg", optimize: false, quiet: true, cargo: [process.execPath, import.meta.dir + "/fake-cargo.js"] });
console.log(bytes);
`,
    });
    const fake = join(String(dir), "fake-cargo.js");
    const cli = await run(["wasm", "build", "add", "--no-opt", `--cargo="${bunExe()}" "${fake}"`], String(dir));
    expect(cli.stdout).toContain("built add");
    expect(cli.exitCode).toBe(0);
    const api = await run(["api.ts"], String(dir));
    expect(api.stdout.trim()).toBe("8");
    expect(api.exitCode).toBe(0);
    const calls = await Bun.file(join(String(dir), "calls.txt")).text();
    const cargoCalls = [
      "metadata --format-version 1 --no-deps",
      "build --lib --target wasm32-unknown-unknown --release",
    ];
    expect(calls.split("\n")).toEqual([...cargoCalls, ...cargoCalls, ""]);
    expect(await Bun.file(join(String(dir), "add", "pkg", "add.wasm")).bytes()).toEqual(
      Uint8Array.of(0, 0x61, 0x73, 0x6d, 1, 0, 0, 0),
    );
    expect(await Bun.file(join(String(dir), "add", "pkg", "add.js")).exists()).toBe(true);
  });

  // Compiles a crate: needs cargo with the wasm32-unknown-unknown target.
  test.skipIf(!Bun.which("cargo"))(
    "bun wasm build packages a crate and the plugin imports Cargo.toml",
    async () => {
      using dir = tempDir("toolchain-wasm", {
        "add/Cargo.toml": `[package]\nname = "add"\nversion = "0.1.0"\nedition = "2021"\n\n[lib]\ncrate-type = ["cdylib"]\n\n[workspace]\n`,
        "add/src/lib.rs": `#[no_mangle]\npub extern "C" fn add(a: i32, b: i32) -> i32 { a + b }\n`,
        "main.ts": `import init from "./add/pkg/add.js";\nconsole.log((await init()).add(2, 3));\n`,
        "plugin.ts": `import { plugin } from "bun:wasm";\nBun.plugin(plugin({ optimize: false }));\n`,
        "imported.ts": `import init from "./add/Cargo.toml";\nconsole.log((await init()).add(4, 5));\n`,
      });
      const build = await run(["wasm", "build", "add", "--no-opt"], String(dir));
      expect(build.stderr).not.toContain("error:");
      expect(build.exitCode).toBe(0);
      const main = await run(["main.ts"], String(dir));
      expect(main.stdout.trim()).toBe("5");
      expect(main.exitCode).toBe(0);
      const imported = await run(["--preload", "./plugin.ts", "imported.ts"], String(dir));
      expect(imported.stdout.trim()).toBe("9");
      expect(imported.exitCode).toBe(0);
    },
    240_000,
  );
});
