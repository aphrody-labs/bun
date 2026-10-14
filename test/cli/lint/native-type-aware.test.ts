import { expect, test } from "bun:test";
import { bunEnv, bunExe, tempDir } from "harness";

const unsupported = [
  { options: { typeAware: true } },
  { options: { typeCheck: true } },
  { rules: { "typescript/no-floating-promises": "error" } },
  { options: { typeAware: false }, rules: { "typescript/no-floating-promises": "error" } },
  { overrides: [{ files: ["*.ts"], rules: { "typescript/no-floating-promises": "warn" } }] },
];

for (const config of unsupported) {
  test(`native lint rejects unsupported typed checks: ${JSON.stringify(config)}`, async () => {
    using dir = tempDir("native-lint-typed-rejection", {
      ".oxlintrc.json": JSON.stringify(config),
      "entry.ts": "export const value: number = 'bad'; Promise.resolve(1);\n",
    });
    await using proc = Bun.spawn({
      cmd: [bunExe(), "lint", "entry.ts"],
      cwd: String(dir),
      env: bunEnv,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
    expect(stdout + stderr).toContain("Type-aware");
    expect(exitCode).not.toBe(0);
  });
}

for (const config of [
  { options: { typeAware: false, typeCheck: false }, rules: { "typescript/no-floating-promises": "off" } },
  { overrides: [{ files: ["*.js"], rules: { "typescript/no-floating-promises": "error" } }] },
]) {
  test(`native lint preserves disabled and nonmatching typed rules: ${JSON.stringify(config)}`, async () => {
    using dir = tempDir("native-lint-typed-disabled", {
      ".oxlintrc.json": JSON.stringify(config),
      "entry.ts": "export const value = 42;\n",
    });
    await using proc = Bun.spawn({
      cmd: [bunExe(), "lint", "entry.ts"],
      cwd: String(dir),
      env: bunEnv,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
    expect(stdout + stderr).toBe("");
    expect(exitCode).toBe(0);
  });
}
