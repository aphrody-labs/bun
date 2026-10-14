import { expect, test } from "bun:test";
import { bunEnv, bunExe } from "harness";

async function run(args: string[]) {
  await using child = Bun.spawn([bunExe(), "--no-env-file", "exec", ...args], {
    env: { ...bunEnv, BUN_EXEC_NOUNSET_UNSET: undefined, BUN_EXEC_NOUNSET_EMPTY: "" },
    stdout: "pipe",
    stderr: "pipe",
    timeout: 10000,
    windowsHide: true,
  });
  const [stdout, stderr, exitCode] = await Promise.all([child.stdout.text(), child.stderr.text(), child.exited]);
  return { stdout, stderr, exitCode };
}

test.each([
  'echo "$BUN_EXEC_NOUNSET_UNSET"; echo unexpected',
  "echo $BUN_EXEC_NOUNSET_UNSET; echo unexpected",
  'LOCAL="$BUN_EXEC_NOUNSET_UNSET"; echo unexpected',
])("bun exec --nounset rejects an unset expansion and stops the script: %s", async source => {
  const result = await run(["--nounset", source]);
  expect(result.stdout).toBe("");
  expect(result.stderr).toContain("BUN_EXEC_NOUNSET_UNSET: unbound variable");
  expect(result.exitCode).toBe(1);
});

test("bun exec --nounset accepts empty exported and shell variables", async () => {
  expect(await run(["--nounset", 'LOCAL=; echo "[$LOCAL][$BUN_EXEC_NOUNSET_EMPTY]"'])).toEqual({
    stdout: "[][]\n",
    stderr: "",
    exitCode: 0,
  });
});

test("bun exec --nounset initializes the last exit status without treating it as unset", async () => {
  expect(await run(["--nounset", 'echo "$?"; false; echo "$?"'])).toEqual({
    stdout: "0\n1\n",
    stderr: "",
    exitCode: 0,
  });
});

test("bun exec --nounset distinguishes missing and empty positional arguments", async () => {
  const missing = await run(["--nounset", 'echo "$1"; echo unexpected', "recipe"]);
  expect(missing.stdout).toBe("");
  expect(missing.stderr).toContain("1: unbound variable");
  expect(missing.exitCode).toBe(1);
  expect(await run(["--nounset", 'echo "[$0][$1]"', "recipe", ""])).toEqual({
    stdout: "[recipe][]\n",
    stderr: "",
    exitCode: 0,
  });
});

test("bun exec keeps unset expansion permissive without --nounset", async () => {
  expect(await run(['echo "[$BUN_EXEC_NOUNSET_UNSET][$1]"; echo after'])).toEqual({
    stdout: "[][]\nafter\n",
    stderr: "",
    exitCode: 0,
  });
});

test("bun exec treats --nounset after the source as a positional argument", async () => {
  expect(await run(['echo "[$BUN_EXEC_NOUNSET_UNSET][$1]"', "recipe", "--nounset"])).toEqual({
    stdout: "[][--nounset]\n",
    stderr: "",
    exitCode: 0,
  });
});
