import { expect, test } from "bun:test";
import { bunEnv, bunExe } from "harness";

const requireSearch = Bun.env.BUN_TEST_REQUIRE_SEARCH === "1";

test("native search help does not execute or expose account credentials", async () => {
  const child = Bun.spawn([bunExe(), "search", "--help"], { env: bunEnv, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(stdout).toContain("Usage: bun search");
  expect(stdout).toContain("--anonymous");
  expect(stdout).toContain("--timeout-ms");
  if (requireSearch) expect(stdout).not.toContain("This build requires --google-search=on");
  expect(stderr).toBe("");
  expect(code).toBe(0);
});

test("native search rejects an unreviewed domain without querying the network", async () => {
  const child = Bun.spawn([bunExe(), "search", "--anonymous", "--domain", "unreviewed.invalid", "fixture"], {
    env: bunEnv,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(stdout).toBe("");
  if (requireSearch) expect(stderr).toContain("Invalid Google search domain or options");
  else expect(stderr).toMatch(/Invalid Google search domain|requires a build with --google-search=on/);
  expect(code).toBe(2);
});
