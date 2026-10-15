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
  test(`${name} preserves the exact-source eight-full verifier for native publication`, async () => {
    const steps = (await workflow(name)).jobs[job]!.steps!;
    const gate = steps.findIndex(step => step.run?.includes("release-aggregation.ts download-verify"));
    const publish = steps.findIndex(step => step.name === publication);
    expect(gate).toBeGreaterThanOrEqual(0);
    expect(publish).toBeGreaterThan(gate);
    expect(steps[gate]!.run).toContain('"$GITHUB_SHA"');
    expect(steps[gate]!.run).toContain('"$version"');
    expect(steps[publish]!.if ?? "").not.toContain("always()");
    if (name !== "bun-video-release")
      expect(steps[gate]!.if).toBe(
        name === "aphrody-publish-crates"
          ? "inputs.dry-run != true && inputs.only != 'crates/aphrody-jev'"
          : name === "aphrody-publish-npm"
            ? "inputs.dry-run != true && steps.qualification.outputs.kind != 'portable-source'"
            : "inputs.dry-run != true",
      );
    if (name === "aphrody-publish-npm") {
      const portable = steps.findIndex(step => step.run?.includes("release-portable-npm.ts qualify"));
      expect(portable).toBeGreaterThanOrEqual(0);
      expect(portable).toBeLessThan(publish);
      expect(steps[portable]!.if).toBe(
        "inputs.dry-run != true && steps.qualification.outputs.kind == 'portable-source'",
      );
      expect(steps[publish]!.run).toContain("--portable-qualification");
    }
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

test("runtime candidates keep native target selection and mandatory qualification separate from full media", async () => {
  const jobs = (await workflow("aphrody-release")).jobs;
  const plan = jobs.plan!.steps!.find(step => step.run?.includes("nativeFullReleasePlan"))!.run!;
  expect(plan).toContain('component === "runtime"');
  expect(plan).toContain('process.env.INPUT_CHANNEL !== "candidate"');
  expect(plan).toContain('process.env.INPUT_PUBLISH_NPM === "true"');
  expect(plan).toContain("new Set(targets).size !== targets.length");
  expect(plan).toContain("!native.targets.some(n => n.target === t)");
  expect(plan).toContain("native.targets.filter(t => targets.includes(t.target))");
  const native = jobs["native-full"]!.steps!;
  for (const action of ["preflight-runtime", "produce-runtime"]) {
    const step = native.find(step => step.run?.includes(`release-native-worker.ts ${action}`))!;
    expect(step.if).toBe("needs.plan.outputs.component == 'runtime'");
    expect(step.run).toContain('"$GITHUB_SHA"');
  }
  for (const action of ["preflight", "produce"]) {
    const step = native.find(step => step.run?.includes(`release-native-worker.ts ${action} `))!;
    expect(step.if).toBe("needs.plan.outputs.component == 'media'");
  }
  const aggregate = jobs.aggregate!.steps!.find(step => step.run?.includes(" aggregate-runtime "))!;
  expect(aggregate.if).toBe("needs.plan.outputs.component == 'runtime'");
  expect(aggregate.run).toContain('candidate "${targets[@]}"');
  const steps = jobs.publish!.steps!;
  const upload = steps.findIndex(step => step.name === "Verify and upload immutable runtime candidate assets");
  const publish = steps.findIndex(step => step.name === "Publish qualified draft");
  expect(upload).toBeGreaterThanOrEqual(0);
  expect(publish).toBeGreaterThan(upload);
  expect(steps[upload]!.if).toBe("needs.plan.outputs.component == 'runtime'");
  const script = steps[upload]!.run!;
  expect(script.indexOf(" verify-runtime ")).toBeLessThan(script.indexOf('"upload"'));
  expect(script).toContain('test "$RELEASE_CHANNEL" = candidate');
  expect(script).toContain("names.some(n => existing.has(n))");
  expect(script).not.toContain("--clobber");
  expect(script).toContain("Object.keys(receipt.assets)");
  for (const name of [
    "Verify exact source, checksums, gates and native platform receipts",
    "Mirror the published release to R2 (dist.aphrody.app)",
    "Publish npm from verified factory assets",
  ])
    expect(steps.find(step => step.name === name)!.if).toContain("needs.plan.outputs.component == 'media'");
});
