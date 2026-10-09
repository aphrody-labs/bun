import { expect, test } from "bun:test";
import { bunEnv, bunExe, tempDir } from "harness";
import { join } from "path";

test("template literal", () => {
  const { stdout, exitCode } = Bun.spawnSync({
    cmd: [bunExe(), "run", join(import.meta.dir, "template-literal-fixture-test.js")],
    env: bunEnv,
    stdout: "pipe",
    stderr: "inherit",
  });

  expect(exitCode).toBe(0);
  expect(stdout.toString()).toBe(
    // This is base64 encoded contents of the template literal
    // this narrows down the test to the transpiler instead of the runtime
    "8J+QsDEyMzEyM/CfkLDwn5Cw8J+QsPCfkLDwn5Cw8J+QsDEyM/CfkLAxMjPwn5CwMTIzMTIz8J+QsDEyM/CfkLAxMjPwn5CwLPCfkLB0cnVl",
  );
});

for (const [name, entry] of [
  ["entry point", "module.ts"],
  ["require", "require.cjs"],
  ["dynamic import", "import.mjs"],
  ["already bundled", "bundled.js"],
] as const) {
  test.concurrent(`tagged template Unicode survives ${name} source loading`, async () => {
    const source = `
      const tag = (strings, value) => [strings[0], strings.raw[0], value, strings.raw[1]];
      console.log(JSON.stringify(tag\`café🐍\${42}été\\u0061\`));
    `;
    using dir = tempDir("raw-template-unicode", {
      "module.ts": source,
      "require.cjs": "require('./module.ts');",
      "import.mjs": "await import('./module.ts');",
      "bundled.js": "// @bun\n" + source,
    });
    await using child = Bun.spawn({
      cmd: [bunExe(), entry],
      cwd: String(dir),
      env: bunEnv,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([child.stdout.text(), child.stderr.text(), child.exited]);
    expect({ stdout, stderr }).toEqual({
      stdout: '["café🐍","café🐍",42,"été\\\\u0061"]\n',
      stderr: "",
    });
    expect(exitCode).toBe(0);
  });
}

for (const format of ["cjs"] as const) {
  test.concurrent(`raw template Unicode survives ${format} sidecar bytecode`, async () => {
    using dir = tempDir("raw-template-bytecode", {
      "entry.js": "console.log(String.raw`café🐍`);",
    });
    const result = await Bun.build({
      entrypoints: [join(String(dir), "entry.js")],
      outdir: join(String(dir), "out"),
      target: "bun",
      format,
      bytecode: true,
    });
    expect(result.logs).toEqual([]);
    expect(result.success).toBeTrue();
    expect(Bun.file(join(String(dir), "out", "entry.js.jsc")).size).toBeGreaterThan(0);
    await using child = Bun.spawn({
      cmd: [bunExe(), join(String(dir), "out", "entry.js")],
      env: { ...bunEnv, BUN_JSC_verboseDiskCache: "1" },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([child.stdout.text(), child.stderr.text(), child.exited]);
    expect(stdout).toBe("café🐍\n");
    expect(stderr.trim().split(/\r?\n/)).toContain("[Disk Cache] Cache hit for sourceCode");
    expect(exitCode).toBe(0);
  });
}

test.concurrent("raw template Unicode survives compiled ESM bytecode", async () => {
  using dir = tempDir("raw-template-compiled-bytecode", {
    "entry.js": "console.log(String.raw`café🐍`);",
  });
  const outfile = join(String(dir), process.platform === "win32" ? "program.exe" : "program");
  const result = await Bun.build({
    entrypoints: [join(String(dir), "entry.js")],
    target: "bun",
    format: "esm",
    bytecode: true,
    compile: { outfile },
  });
  expect(result.logs).toEqual([]);
  expect(result.success).toBeTrue();
  await using child = Bun.spawn({ cmd: [outfile], env: bunEnv, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([child.stdout.text(), child.stderr.text(), child.exited]);
  expect({ stdout, stderr }).toEqual({ stdout: "café🐍\n", stderr: "" });
  expect(exitCode).toBe(0);
});
