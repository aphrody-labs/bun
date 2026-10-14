import { expect, test } from "bun:test";

type Step = { name?: string; run?: string; if?: string; uses?: string };
type Workflow = { jobs: Record<string, { steps?: Step[]; needs?: string[]; [key: string]: unknown }> };
async function workflow(name: string): Promise<Workflow> {
  return Bun.YAML.parse(
    await Bun.file(new URL(`../../.github/workflows/${name}.yml`, import.meta.url)).text(),
  ) as Workflow;
}

for (const [name, job, publication] of [
  ["aphrody-publish-npm", "publish", "Publish"],
  ["aphrody-publish-crates", "publish", "Publish"],
  ["aphrody-publish-native", "publish", "Stage or publish verified native packages"],
  ["aphrody-publish-mdx-rs", "publish", "Publish"],
  ["aphrody-publish-web-inspector", "publish", "Build and publish"],
  ["bun-video-release", "release", "Publish npm next"],
] as const) {
  test(`${name} cannot publish before the exact-source eight-full verifier succeeds`, async () => {
    const steps = (await workflow(name)).jobs[job]!.steps!;
    const gate = steps.findIndex(step => step.run?.includes("release-aggregation.ts download-verify"));
    const publish = steps.findIndex(step => step.name === publication);
    expect(gate).toBeGreaterThanOrEqual(0);
    expect(publish).toBeGreaterThan(gate);
    expect(steps[gate]!.run).toContain('"$GITHUB_SHA"');
    expect(steps[gate]!.run).toContain('"$version"');
    expect(steps[publish]!.if ?? "").not.toContain("always()");
    if (name !== "bun-video-release") expect(steps[gate]!.if).toBe("inputs.dry-run != true");
    for (const step of steps) expect(step.if ?? "").not.toContain("secrets.");
  });
}

test("runtime publication depends on the aggregate and rechecks assets before R2", async () => {
  const jobs = (await workflow("aphrody-release")).jobs;
  expect(jobs.publish!.needs).toContain("aggregate");
  expect(jobs.publish!.if).toContain("needs.aggregate.result == 'success'");
  expect(jobs.aggregate!.needs).toContain("native-full");
  const aggregate = jobs.aggregate!.steps!.find(step => step.run?.includes("release-aggregation.ts aggregate"))!;
  expect(aggregate.run).toContain('"$GITHUB_SHA"');
  const steps = jobs.publish!.steps!;
  const verify = steps.findIndex(step => step.run?.includes("release-aggregation.ts verify"));
  const publish = steps.findIndex(step => step.run?.includes("gh release edit"));
  expect(verify).toBeGreaterThanOrEqual(0);
  expect(publish).toBeGreaterThan(verify);
  expect(steps.some(step => step.run?.includes("verifyFactoryRelease"))).toBe(true);
  const r2 = steps.find(step => step.run?.includes("scripts/aphrody/release-r2.ts"))!;
  expect(r2.run!.indexOf("release-aggregation.ts verify")).toBeLessThan(
    r2.run!.indexOf("scripts/aphrody/release-r2.ts"),
  );
});

test("fresh release jobs resolve the locked SDK workspace before loading publication owners", async () => {
  const jobs = (await workflow("aphrody-release")).jobs;
  for (const name of ["plan", "native-full", "aggregate", "publish"]) {
    const steps = jobs[name]!.steps!;
    const install = steps.findIndex(step => step.run === "bun install --frozen-lockfile --ignore-scripts");
    const owner = steps.findIndex(step => step.run?.includes("scripts/aphrody/release-"));
    expect(install).toBeGreaterThanOrEqual(0);
    expect(owner).toBeGreaterThan(install);
  }
});

test("eight native producers consume the source plan with bounded jobs and same-run receipts", async () => {
  const jobs = (await workflow("aphrody-release")).jobs;
  const native = jobs["native-full"]!;
  expect(String(native.needs)).toBe("plan");
  expect(native["runs-on"]).toBe("${{ matrix.runner }}");
  const strategy = native.strategy as { "max-parallel": number; "fail-fast": boolean; matrix: string };
  expect(strategy["max-parallel"]).toBe(2);
  expect(strategy["fail-fast"]).toBe(false);
  expect(strategy.matrix).toContain("needs.plan.outputs.native-matrix");
  const steps = native.steps!;
  const preflight = steps.findIndex(step => step.run?.includes("release-native-worker.ts preflight"));
  const produce = steps.findIndex(step => step.run?.includes("release-native-worker.ts produce"));
  const upload = steps.findIndex(step => step.uses === "actions/upload-artifact@v6");
  expect(preflight).toBeGreaterThanOrEqual(0);
  expect(produce).toBeGreaterThan(preflight);
  expect(upload).toBeGreaterThan(produce);
  expect(steps[produce]!.run).toContain('"$GITHUB_SHA"');
  expect(jobs.aggregate!.steps!.some(step => step.uses === "actions/download-artifact@v6")).toBe(true);
  expect(jobs.aggregate!.steps!.some(step => step.run?.includes("download-verify"))).toBe(false);
});

test("video publication uses Windows x64, registry types and the exact qualified archive", async () => {
  const job = (await workflow("bun-video-release")).jobs.release!;
  expect(job["runs-on"]).toBe("windows-2025");
  const steps = job.steps!;
  const gate = steps.findIndex(step => step.run?.includes("download-verify"));
  const runtime = steps.findIndex(step => step.name === "Use the exact-source qualified native Windows runtime");
  const qualify = steps.findIndex(step => step.run?.includes("bun run qualify:package"));
  expect(runtime).toBeGreaterThan(gate);
  expect(qualify).toBeGreaterThan(runtime);
  expect(steps[qualify]!.run).toContain('test -n "$BUN_VIDEO_TYPES_VERSION"');
  expect(steps.find(step => step.name === "Publish npm next")!.run).toContain("bun scripts/publish.ts");
  const r2 = steps.find(step => step.name === "Upload artifact to Cloudflare R2")!;
  expect(r2.run).toContain("steps.qualified.outputs.archive");
  expect(r2.run).not.toContain("*.tgz");
});
