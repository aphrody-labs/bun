// Kept separate from parallel.test.ts for the reason parallel-startup-failure.test.ts
// gives: that file has tests that routinely exceed the default timeout under ASAN
// debug, and file-level pass/fail is what the surrounding tooling checks. These
// tests pin how `bun test --parallel` counts and reports a failure that is not a
// finished test.

import { expect, test } from "bun:test";
import { bunEnv, bunExe, isASAN, isDebug, isWindows, tempDir } from "harness";

test(
  "--parallel counts a failure that is not a finished test as a serial run does",
  async () => {
    using dir = tempDir("parallel-non-test-failures", {
      "a-good.test.js": `import {test,expect} from "bun:test"; test("good",()=>expect(1).toBe(1));`,
      "b-throw.test.js": `throw new Error("top-level-throw");`,
      "c-syntax.test.js": `const x = ;`,
      "d-describe.test.js": `import { describe, expect, test } from "bun:test";
describe("boom", () => {
  throw new Error("describe-body-throw");
});
test("beside", () => expect(1).toBe(1));`,
      "e-hook.test.js": `import { beforeEach, describe, expect, test } from "bun:test";
describe("suite", () => {
  beforeEach(async () => {
    Promise.reject(new Error("leaked-by-beforeEach"));
    await Bun.sleep(1);
  });
  test("one", () => expect(1).toBe(1));
  test("two", () => expect(1).toBe(1));
});`,
    });
    const run = async (...extra: string[]) => {
      await using proc = Bun.spawn({
        cmd: [bunExe(), "test", ...extra],
        env: bunEnv,
        cwd: String(dir),
        stderr: "pipe",
        stdout: "pipe",
      });
      const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
      return {
        parallel: stdout.includes("PARALLEL"),
        counts: stderr.match(/^ *\d+ (pass|fail|errors?)$/gm),
        ran: stderr.match(/^Ran \d+ tests? across \d+ files?\./m)?.[0],
        exitCode,
      };
    };
    const serial = await run();
    const parallel = await run("--parallel=2");

    expect(serial).toEqual({
      parallel: false,
      counts: [" 4 pass", " 2 fail", " 5 errors"],
      ran: "Ran 6 tests across 5 files.",
      exitCode: 1,
    });
    expect(parallel).toEqual({ ...serial, parallel: true });
  },
  isASAN || isDebug ? 60_000 : 20_000,
);

// Sorted, --parallel=2 gives the first worker `a-inflight` and the second
// `b-fastfail` then `c-queued`, so the panic finds one file in flight and one
// that no worker took.
test(
  "--parallel: a worker panic counts the file in flight and the file no worker took as failed",
  async () => {
    using dir = tempDir("parallel-panic-accounting", {
      "a-inflight.test.js": `import { expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
test("passes first", () => expect(1).toBe(1));
test("hang", async () => {
  writeFileSync(join(import.meta.dir, "a-hanging"), "");
  await new Promise(() => {});
}, 999999);`,
      "b-fastfail.test.js": `import { test } from "bun:test";
import { crash_handler } from "bun:internal-for-testing";
import { existsSync } from "node:fs";
import { join } from "node:path";
test("fastfail", () => {
  const deadline = Date.now() + 30_000;
  while (!existsSync(join(import.meta.dir, "a-hanging")) && Date.now() < deadline) Bun.sleepSync(5);
  crash_handler.fastfail();
}, 60_000);`,
      "c-queued.test.js": `import {test,expect} from "bun:test"; test("c",()=>expect(1).toBe(1));`,
    });
    await using proc = Bun.spawn({
      cmd: [bunExe(), "test", "--parallel=2", "--reporter=junit", "--reporter-outfile=out.xml"],
      // CI sets BUN_CRASH_REPORT_URL. A deliberate crash must not upload a report.
      env: {
        ...bunEnv,
        BUN_TEST_PARALLEL_SCALE_MS: "0",
        BUN_CRASH_REPORT_URL: "",
        BUN_ENABLE_CRASH_REPORTING: "0",
      },
      cwd: String(dir),
      stderr: "pipe",
      stdout: "pipe",
    });
    const [, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
    const crash = isWindows ? "exit code 0xC0000409" : "SIGABRT";
    expect(stderr).toContain(`✗ b-fastfail.test.js (worker crashed: ${crash})\n`);
    expect(stderr).toContain("✗ c-queued.test.js (aborted: worker panicked)\n");
    expect(stderr).toContain("✗ a-inflight.test.js (aborted: sibling worker panicked)\n");
    // a-inflight's pass is not counted: its worker never sent the file's totals.
    expect(stderr).toContain(" 0 pass\n 3 fail\n");
    expect(stderr).toContain("Ran 3 tests across 3 files.");
    expect(exitCode).toBe(1);

    // The file in flight keeps the test it finished, the crashed file gets the
    // synthetic failure, and the file no worker took has no suite.
    expect(maskJunit(await Bun.file(`${dir}/out.xml`).text())).toBe(`<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="bun test" tests="2" assertions="1" failures="1" skipped="0">
  <testsuite name="a-inflight.test.js" file="a-inflight.test.js" tests="1" assertions="1" failures="0" skipped="0">
    <testcase name="passes first" classname="" file="a-inflight.test.js" line="4" assertions="1" />
  </testsuite>
  <testsuite name="b-fastfail.test.js" file="b-fastfail.test.js" tests="1" assertions="0" failures="1" skipped="0">
    <testcase name="(worker crashed)" classname="" file="b-fastfail.test.js" assertions="0">
      <failure type="Error" message="worker process crashed before reporting results" />
    </testcase>
  </testsuite>
</testsuites>
`);
  },
  isASAN || isDebug ? 60_000 : 20_000,
);

// Windows has no SIGTERM: kill() terminates the coordinator before it can write the report.
test.skipIf(isWindows)(
  "--parallel --reporter=junit: SIGTERM on the coordinator reports the files in flight as crashed",
  async () => {
    const fixture = (name: string) => `import { test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
test("hang", async () => {
  writeFileSync(join(import.meta.dir, "${name}-hanging"), "");
  await new Promise(() => {});
}, 999999);`;
    using dir = tempDir("parallel-sigterm-junit", {
      "a.test.js": fixture("a"),
      "b.test.js": fixture("b"),
    });
    await using proc = Bun.spawn({
      cmd: [bunExe(), "test", "--parallel=2", "--parallel-delay=0", "--reporter=junit", "--reporter-outfile=out.xml"],
      env: bunEnv,
      cwd: String(dir),
      stderr: "pipe",
      stdout: "pipe",
    });
    const output = Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);

    // Both files are in flight once each has written its marker.
    const hanging = async () =>
      (await Bun.file(`${dir}/a-hanging`).exists()) && (await Bun.file(`${dir}/b-hanging`).exists());
    const deadline = Date.now() + (isASAN || isDebug ? 45_000 : 15_000);
    while (Date.now() < deadline && proc.exitCode === null && !(await hanging())) await Bun.sleep(25);
    expect(await hanging()).toBe(true);

    proc.kill("SIGTERM");
    const [, stderr, exitCode] = await output;
    expect(stderr).toContain("Interrupted while still running:\n");
    expect(exitCode).toBe(143);

    const crashed = (
      file: string,
    ) => `  <testsuite name="${file}" file="${file}" tests="1" assertions="0" failures="1" skipped="0">
    <testcase name="(worker crashed)" classname="" file="${file}" assertions="0">
      <failure type="Error" message="worker process crashed before reporting results" />
    </testcase>
  </testsuite>
`;
    expect(maskJunit(await Bun.file(`${dir}/out.xml`).text())).toBe(`<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="bun test" tests="2" assertions="0" failures="2" skipped="0">
${crashed("a.test.js")}${crashed("b.test.js")}</testsuites>
`);
  },
  isASAN || isDebug ? 60_000 : 20_000,
);

// What differs between two runs or two machines: durations, the host, and the
// <properties> a CI environment adds.
function maskJunit(xml: string) {
  return xml.replace(/ (time|hostname)="[^"]*"/g, "").replace(/ *<properties>[^]*?<\/properties>\n/g, "");
}
