import { expect, test } from "bun:test";

type Step = { name?: string; run?: string; if?: string; uses?: string; env?: Record<string, string> };
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
          ? "inputs.dry-run != true && inputs.only != 'crates/aphrody-jev' && inputs.only != 'src/browser/crates/ssrf'"
          : name === "aphrody-publish-npm"
            ? "inputs.dry-run != true && steps.qualification.outputs.kind != 'portable-source' && steps.qualification.outputs.kind != 'plugin-source'"
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
      const plugin = steps.findIndex(step => step.run?.includes("release-portable-npm.ts qualify-plugin"));
      expect(plugin).toBeGreaterThan(gate);
      expect(plugin).toBeLessThan(publish);
      expect(steps[plugin]!.if).toBe("inputs.dry-run != true && steps.qualification.outputs.plugin == 'true'");
      expect(steps[plugin]!.run).toContain("--only bun-agent-plugin");
      expect(steps[plugin]!.run).toContain('"$GITHUB_SHA"');
      expect(steps[publish]!.run).toContain("--plugin-qualification");
      expect(steps[publish]!.run).toContain('"$INCLUDES_PLUGIN" = true');
      const setup = steps.findIndex(step => step.name === "Setup exact-source plugin runtime");
      expect(setup).toBeGreaterThan(gate);
      expect(setup).toBeLessThan(plugin);
      expect((steps[setup] as Step & { with: Record<string, string> }).with["expected-source"]).toBe(
        "${{ github.sha }}",
      );
    }
    for (const step of steps) expect(step.if ?? "").not.toContain("secrets.");
  });
}

test("push candidates select runtime while manual media and publication guards remain explicit", async () => {
  const jobs = (await workflow("aphrody-release")).jobs;
  const plan = jobs.plan!;
  const step = plan.steps!.find(step => step.run?.includes("release-matrix.ts"))!;
  const env = (step as Step & { env: Record<string, string> }).env;
  expect(env.INPUT_COMPONENT).toBe("${{ github.event_name == 'push' && 'runtime' || inputs.component || 'media' }}");
  const select = new Function("github", "inputs", `return (${env.INPUT_COMPONENT!.slice(3, -2)});`);
  for (const ref of ["refs/heads/main", "refs/tags/bun-v1.4.5"])
    expect(select({ event_name: "push", ref }, {})).toBe("runtime");
  for (const component of ["media", "runtime"])
    expect(select({ event_name: "workflow_dispatch" }, { component })).toBe(component);
  expect(select({ event_name: "workflow_dispatch" }, {})).toBe("media");
  expect(jobs.publish!.if).toContain("inputs.publish");
  expect(jobs.publish!.if).toContain("needs.aggregate.result == 'success'");
  const yaml = Bun.YAML.parse(
    await Bun.file(new URL("../../.github/workflows/aphrody-release.yml", import.meta.url)).text(),
  ) as { on: { workflow_dispatch: { inputs: Record<string, { default?: string; options?: string[] }> } } };
  expect(yaml.on.workflow_dispatch.inputs.component!.default).toBe("media");
  expect(yaml.on.workflow_dispatch.inputs.component!.options).toEqual(["media", "runtime"]);
});

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

test("main runtime delivery derives stable version guards from source and artifact identities", async () => {
  const jobs = (await workflow("aphrody-main-runtime")).jobs;
  const build = jobs.build!.steps!.find(step => step.name === "Build exact main runtime")!.run!;
  const publish = jobs.publish!.steps!.find(step => step.name === "Verify, publish and expose checksums")!.run!;
  expect(build).toContain('Bun.file("package.json")');
  expect(publish).toContain('expected_version="$(./bun-linux-x64 --version)"');
  for (const run of [build, publish]) {
    expect(run).not.toContain("1.4.4+");
    expect(run).toContain('"${BASH_REMATCH[1]}" != "$expected_version"');
    expect(run).toContain('suffix="${BASH_REMATCH[2]}"');
    expect(run).toContain('case "$GITHUB_SHA" in "$suffix"*)');
    expect(run).toContain("[a-f0-9]{7,40}");
  }
});

test("main runtime updater accepts stable version changes while preserving source and format bounds", async () => {
  const owner = await Bun.file(new URL("./deploy/sync-main-runtime.ts", import.meta.url)).text();
  const expression = /^const revisionSuffix = (.+);$/m.exec(owner)?.[1];
  expect(expression).toBeString();
  const suffix = new Function("revision", "return (" + expression + ");") as (revision: string) => string;
  const source = "a".repeat(40);
  for (const version of ["1.4.4", "1.4.5", "1.5.0"])
    for (const length of [7, 12, 40])
      expect(suffix(version + "+" + source.slice(0, length))).toBe(source.slice(0, length));
  for (const revision of [
    "1.4.5",
    "1.4.5+",
    "1.4.5+abc",
    "1.4.5+" + source + "a",
    "1.4.5-debug+aaaaaaaa",
    "1.4.5-canary.1+aaaaaaaa",
    "1.4.5+ABCDEF12",
  ])
    expect(suffix(revision)).toBe("");
  expect(source.startsWith(suffix("1.4.5+bbbbbbbb"))).toBe(false);
  expect(owner).toContain("!release.target_commitish.startsWith(revisionSuffix)");
  expect(owner).toContain("probe.exitCode !== 0 || !revisionSuffix");
});

test("crate source qualification is restricted to exact registered JeV and browser selections", async () => {
  const steps = (await workflow("aphrody-publish-crates")).jobs.publish!.steps!;
  const prepare = steps.find(step => step.name === "Prepare pinned Rust workspace sources for portable qualification")!;
  const qualify = steps.find(step => step.name === "Qualify the exact portable Rust crate selection")!;
  const verify = steps.find(step => step.name === "Verify portable source and package evidence before publication")!;
  const native = steps.find(step => step.run?.includes("release-aggregation.ts download-verify"))!;
  const evaluate = (expression: string, inputs: Record<string, unknown>) =>
    new Function("inputs", "return (" + expression.replaceAll("inputs.dry-run", 'inputs["dry-run"]') + ");")(inputs);
  for (const only of ["crates/aphrody-jev", "src/browser/crates/ssrf"]) {
    const inputs = { only, "dry-run": false };
    expect(evaluate(prepare.if!, inputs)).toBe(true);
    expect(evaluate(qualify.if!, inputs)).toBe(true);
    expect(evaluate(verify.if!, inputs)).toBe(true);
    expect(evaluate(native.if!, inputs)).toBe(false);
  }
  for (const only of [
    "",
    "sdk",
    "packages/bun-google/crates/boq",
    "unknown",
    "src/browser/crates/dom",
    "src/browser/crates/ssrf,sdk",
    "crates/aphrody-jev,src/browser/crates/ssrf",
    "src/browser/crates/ssrf,",
  ])
    for (const dryRun of [false, true]) {
      const inputs = { only, "dry-run": dryRun };
      expect(evaluate(qualify.if!, inputs)).toBe(false);
      expect(evaluate(verify.if!, inputs)).toBe(false);
      expect(evaluate(native.if!, inputs)).toBe(!dryRun);
    }
  for (const step of [qualify, verify]) {
    expect(step.env!.PORTABLE_SELECTION).toBe("${{ inputs.only }}");
    expect(step.run).toContain('"$GITHUB_SHA" "$PORTABLE_SELECTION"');
  }
  const publish = steps.find(step => step.name === "Publish")!;
  expect(publish.run).toContain('if [ "$ONLY" = crates/aphrody-jev ] || [ "$ONLY" = src/browser/crates/ssrf ]');
  expect(publish.run).toContain('if [ "${{ inputs.dry-run }}" != "true" ]; then args+=(--publish); fi');
  expect(native.run).toContain('"$GITHUB_SHA" "$version" "$channel"');
});
