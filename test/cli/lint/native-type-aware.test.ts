import { expect, test } from "bun:test";
import { bunEnv, bunExe, tempDir } from "harness";
import { join } from "node:path";

const source = "export const value: number = 'bad';\nPromise.resolve(1);\n";

async function lint(config: object, args: string[] = []) {
  using dir = tempDir("native-lint-types", {
    ".oxlintrc.json": JSON.stringify(config),
    "entry.ts": source,
  });
  await using proc = Bun.spawn({
    cmd: [bunExe(), "lint", "--threads", "2", ...args, "entry.ts"],
    cwd: String(dir),
    env: { ...bunEnv, AGENT: "0", CLAUDECODE: undefined, NO_COLOR: "1", FORCE_COLOR: undefined },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
  expect(await Bun.file(join(String(dir), "entry.ts")).text()).toBe(source);
  return { stdout, stderr, exitCode };
}

test("typeAware enables native no-floating-promises diagnostics", async () => {
  const result = await lint({ options: { typeAware: true } }, ["--format", "json-with-metadata"]);
  const { results } = JSON.parse(result.stdout);
  expect(results).toHaveLength(1);
  expect(results[0].messages.map(({ ruleId, severity, line }: any) => ({ ruleId, severity, line }))).toEqual([
    { ruleId: "@typescript-eslint/no-floating-promises", severity: 1, line: 2 },
  ]);
  expect(result.stderr).toBe("");
  expect(result.exitCode).toBe(0);
});

test("typeCheck requires typeAware instead of an unsupported external checker", async () => {
  expect(await lint({ options: { typeCheck: true } })).toEqual({
    stdout:
      "error: The `--type-check` option requires type-aware linting.\n" +
      "Use `--type-aware --type-check` or enable `options.typeAware` in your config.\n",
    stderr: "",
    exitCode: 1,
  });
});

test("native type checking and typed lint rules report their distinct findings together", async () => {
  const result = await lint(
    { options: { typeAware: true, typeCheck: true }, rules: { "typescript/no-floating-promises": "error" } },
    ["--format", "json-with-metadata"],
  );
  const { results } = JSON.parse(result.stdout);
  expect(results).toHaveLength(1);
  expect(results[0].messages.map(({ ruleId, severity }: any) => `${ruleId}:${severity}`).sort()).toEqual([
    "@typescript-eslint/no-floating-promises:2",
    "typescript/TS2322:2",
  ]);
  expect(result.stderr).toBe("");
  expect(result.exitCode).toBe(1);
});

test("an enabled matching override runs a native typed rule", async () => {
  const result = await lint(
    {
      options: { typeAware: true },
      overrides: [{ files: ["*.ts"], rules: { "typescript/no-floating-promises": "error" } }],
    },
    ["--format", "json-with-metadata"],
  );
  const { results } = JSON.parse(result.stdout);
  expect(results).toHaveLength(1);
  expect(results[0].messages.map(({ ruleId, severity }: any) => ({ ruleId, severity }))).toEqual([
    { ruleId: "@typescript-eslint/no-floating-promises", severity: 2 },
  ]);
  expect(result.stderr).toBe("");
  expect(result.exitCode).toBe(1);
});

for (const config of [
  { rules: { "typescript/no-floating-promises": "error" } },
  { options: { typeAware: false }, rules: { "typescript/no-floating-promises": "error" } },
  { overrides: [{ files: ["*.ts"], rules: { "typescript/no-floating-promises": "warn" } }] },
  { options: { typeAware: false, typeCheck: false }, rules: { "typescript/no-floating-promises": "off" } },
  { overrides: [{ files: ["*.js"], rules: { "typescript/no-floating-promises": "error" } }] },
]) {
  test(`Oxlint skips disabled or nonmatching typed rules without an unsupported error: ${JSON.stringify(config)}`, async () => {
    const result = await lint(config);
    expect(result.stdout).toMatch(/^✓ No problems in 1 file \[\d+(?:\.\d+)?(?:ms|s)\]\n$/);
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
  });
}
