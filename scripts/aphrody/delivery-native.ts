#!/usr/bin/env bun
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { GitTree, git } from "../../packages/bun-ui/packages/web/site/collect.ts";

type Document = Record<string, any>;
export const PIPELINES = {
  native: {
    workflow: "aphrody-publish-native.yml",
    products: ["@aphrody/bun-plugin-n2b", "@aphrody/bun-plugin-oxc"],
    artifacts: "Factory draft Node-API assets, SHA256SUMS.txt and factory-qualification.json",
    publicationRequired: false,
  },
  mdx: {
    workflow: "aphrody-publish-mdx-rs.yml",
    products: ["@aphrody/bun-mdx-rs", "@aphrody/bun-mdx-rs-<platform>"],
    artifacts: "mdx-<platform>",
    publicationRequired: false,
  },
  inspector: {
    workflow: "aphrody-publish-web-inspector.yml",
    products: ["@aphrody/web-inspector-bun"],
    artifacts: "Registry staging only; existing workflow does not upload a build artifact",
    publicationRequired: false,
  },
  runtime: {
    workflow: "aphrody-release.yml",
    products: ["@aphrody/bun-runtime", "bun-<os>-<arch>.zip", "SHA256SUMS.txt"],
    artifacts: "Factory draft runtime zip assets, SHA256SUMS.txt and factory-qualification.json",
    publicationRequired: true,
  },
} as const;
export type Pipeline = keyof typeof PIPELINES;
export type NativePlan = {
  schema: 1;
  repository: string;
  source: { revision: string; version: string; workflow: string; workflowBlob: string; workflowSha256: string };
  pipeline: Pipeline;
  dispatchRef: string;
  inputs: Record<string, string>;
  products: readonly string[];
  productManifests: {
    path: string;
    blob: string;
    name: string;
    sourceVersion: string | null;
    requestedPublishedVersion: string | null;
  }[];
  platforms: string[];
  artifactContract: string;
  bootstrap: string | null;
  blockers: string[];
  publication: boolean;
  qualifications: string[];
};

function ownerRepository(root: string, repository: string): void {
  const remotes = git(root, ["remote", "-v"]);
  if (
    !remotes
      .split("\n")
      .some(line => line.includes(`github.com/${repository}.git`) || line.includes(`github.com:${repository}.git`))
  )
    throw new Error(`Repository is not an existing authorized remote: ${repository}`);
  if (!["aphrody-labs/bun", "aphrody-labs/bun-os"].includes(repository))
    throw new Error(`Unsupported owner repository: ${repository}`);
}

export function nativePlan(
  root: string,
  repository: string,
  ref: string,
  pipeline: Pipeline,
  publish = false,
  version?: string,
  platforms?: string,
  factoryTag?: string,
  releaseChannel?: string,
): NativePlan {
  ownerRepository(root, repository);
  const tree = new GitTree(root, ref);
  const spec = PIPELINES[pipeline];
  const path = `.github/workflows/${spec.workflow}`;
  if (!tree.has(path)) throw new Error(`Missing owner workflow at selected revision: ${path}`);
  const text = tree.text(path)!;
  const workflow = Bun.YAML.parse(text) as Document;
  const inputs: Record<string, string> = {};
  const contract = workflow.on?.workflow_dispatch?.inputs;
  if (!contract) throw new Error(`Workflow has no dispatch input contract: ${path}`);
  for (const [name, value] of Object.entries(contract) as [string, Document][])
    if (value.default !== undefined) inputs[name] = String(value.default);
  if (factoryTag !== undefined) {
    if (!contract["factory-tag"] || !/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(factoryTag))
      throw new Error("Invalid owner factory draft tag");
    inputs["factory-tag"] = factoryTag;
  }
  if (releaseChannel !== undefined) {
    if (!contract["release-channel"] || !["candidate", "stable"].includes(releaseChannel))
      throw new Error("Invalid release channel");
    inputs["release-channel"] = releaseChannel;
  }
  if (pipeline !== "runtime") inputs["dry-run"] = String(!publish);
  else {
    inputs["publish-npm"] = "false";
    if (contract.publish) inputs.publish = String(publish);
    else inputs["publish-only"] = "false";
  }
  if (version !== undefined) {
    if (!contract.version || !/^\d+\.\d+\.\d+(?:-aphrody\.\d+)?$/.test(version))
      throw new Error("Invalid explicit release version");
    inputs.version = version;
  }
  const declaredPlatforms = [
    ...(tree.text("scripts/aphrody/build-napi.ts") ?? "").matchAll(/key:\s*["']([^"']+)["']/g),
  ].map(m => m[1]!);
  const selectedPlatforms = platforms
    ? platforms
        .split(",")
        .map(p => p.trim())
        .filter(Boolean)
    : declaredPlatforms;
  if (platforms !== undefined) {
    if (!contract.platforms || selectedPlatforms.some(p => !declaredPlatforms.includes(p)))
      throw new Error("Requested platform is absent from the source workflow/matrix contract");
    inputs.platforms = selectedPlatforms.join(",");
  }
  const blockers: string[] = [];
  for (const [name, job] of Object.entries(workflow.jobs ?? {}) as [string, Document][]) {
    const condition = String(job.if ?? "");
    if (condition.includes("github.repository")) {
      const allowed = [...condition.matchAll(/github\.repository\s*==\s*['"]([^'"]+)['"]/g)].map(m => m[1]);
      if (!allowed.includes(repository)) blockers.push(`Workflow job ${name} excludes ${repository}`);
    }
  }
  if (spec.publicationRequired && !publish && !contract.publish)
    blockers.push(
      "Runtime workflow publishes GitHub release assets even with publish-npm=false; explicit --publish is required",
    );
  if (publish && contract["factory-tag"] && !inputs["factory-tag"])
    blockers.push("Explicit owner factory draft tag is required before native publication");
  if (publish && pipeline === "native" && contract["release-channel"] && inputs["release-channel"] !== "stable")
    blockers.push("npm latest requires stable factory qualification");
  const declaredVersion = JSON.parse(tree.text("package.json") ?? "{}").version;
  if (version && version.split("-aphrody.")[0] !== declaredVersion)
    blockers.push(`Requested ${version} differs from source ${declaredVersion}`);
  return {
    schema: 1,
    repository,
    source: {
      revision: tree.sha,
      version: declaredVersion,
      workflow: path,
      workflowBlob: tree.files.get(path)!,
      workflowSha256: createHash("sha256").update(text).digest("hex"),
    },
    pipeline,
    dispatchRef: ref,
    inputs,
    products: spec.products,
    productManifests: (pipeline === "native"
      ? ["packages/bun-n2b/package.json", "packages/bun-oxc/package.json"]
      : pipeline === "mdx"
        ? ["packages/bun-build-mdx-rs/package.json"]
        : pipeline === "inspector"
          ? ["packages/bun-inspector-frontend/package.json"]
          : ["package.json"]
    )
      .filter(path => tree.has(path))
      .map(path => {
        const p = JSON.parse(tree.text(path)!);
        return {
          path,
          blob: tree.files.get(path)!,
          name: p.name,
          sourceVersion: p.version ?? null,
          requestedPublishedVersion:
            pipeline === "native"
              ? p.version
              : pipeline === "runtime"
                ? (version ?? declaredVersion)
                : (version ?? null),
        };
      }),
    platforms: pipeline === "native" || pipeline === "mdx" ? selectedPlatforms : [],
    artifactContract: spec.artifacts,
    bootstrap: workflow.env?.BUN_HOST_VERSION ?? null,
    blockers,
    publication: publish,
    qualifications: [
      "Remote dispatch ref must equal selected source SHA",
      "Factory artifacts require exact source, checksums, passing gates and native platform receipts",
      "GitHub artifact digests identify workflow archives, not npm packages",
      "Registry publication and consumer installation require their own exact-version integrity receipts",
    ],
  };
}

function gh(args: string[], input?: string): string {
  const process = Bun.spawnSync(["gh", ...args], {
    stdin: input === undefined ? "ignore" : Buffer.from(input),
    stdout: "pipe",
    stderr: "pipe",
  });
  if (!process.success) throw new Error(`GitHub command failed: ${process.stderr.toString().trim()}`);
  return process.stdout.toString();
}

export function remoteQualification(plan: NativePlan) {
  const remote = JSON.parse(
    gh(["api", `repos/${plan.repository}/commits/${encodeURIComponent(plan.dispatchRef)}`]),
  ) as Document;
  const workflow = JSON.parse(
    gh(["api", `repos/${plan.repository}/actions/workflows/${PIPELINES[plan.pipeline].workflow}`]),
  ) as Document;
  const missingRuntimeAssets: string[] = [];
  let bootstrapAssets: string[] = [];
  if (
    (plan.pipeline === "native" || plan.pipeline === "mdx") &&
    plan.bootstrap &&
    /^(bun-v|aphrody-v)/.test(plan.bootstrap)
  ) {
    const release = JSON.parse(
      gh(["api", `repos/aphrody-labs/bun/releases/tags/${encodeURIComponent(plan.bootstrap)}`]),
    ) as Document;
    bootstrapAssets = release.assets.map((a: Document) => a.name);
    for (const platform of plan.platforms) {
      const [os, arch, abi] = platform.split("-");
      const asset = `bun-${os === "win32" ? "windows" : os}-${arch === "arm64" ? "aarch64" : arch}${abi === "musl" ? "-musl" : ""}.zip`;
      if (!bootstrapAssets.includes(asset)) missingRuntimeAssets.push(`${platform}: ${asset}`);
    }
  }
  return {
    revision: remote.sha as string,
    workflowState: workflow.state as string,
    bootstrapAssets,
    missingRuntimeAssets,
    blockers: [
      ...plan.blockers,
      ...(remote.sha !== plan.source.revision ? ["Remote dispatch ref has another source SHA"] : []),
      ...(workflow.state !== "active" ? [`Workflow state: ${workflow.state}`] : []),
      ...(!plan.bootstrap || !/^(bun-v|aphrody-v)/.test(plan.bootstrap)
        ? ["Bootstrap is not an explicit qualified release tag"]
        : []),
      ...(missingRuntimeAssets.length
        ? [`Missing qualified platform runtime assets: ${missingRuntimeAssets.join(", ")}`]
        : []),
    ],
  };
}

export async function runReceipt(plan: NativePlan, runId: string, out?: string) {
  if (!/^\d+$/.test(runId)) throw new Error("Run ID must be an explicit numeric GitHub run identifier");
  const run = JSON.parse(
    gh([
      "run",
      "view",
      runId,
      "--repo",
      plan.repository,
      "--json",
      "databaseId,headSha,status,conclusion,jobs,url,workflowName,workflowDatabaseId",
    ]),
  ) as Document;
  const definition = JSON.parse(
    gh(["api", `repos/${plan.repository}/actions/workflows/${run.workflowDatabaseId}`]),
  ) as Document;
  const artifacts: Document[] = [];
  for (let page = 1; ; page++) {
    const result = JSON.parse(
      gh(["api", `repos/${plan.repository}/actions/runs/${runId}/artifacts?per_page=100&page=${page}`]),
    ) as Document;
    artifacts.push(...result.artifacts);
    if (artifacts.length >= result.total_count || !result.artifacts.length) break;
  }
  const requiredJobs = (run.jobs ?? []).filter((job: Document) =>
    plan.pipeline === "inspector" ||
    ((plan.pipeline === "native" || plan.pipeline === "runtime") && !plan.artifactContract.startsWith("native-"))
      ? job.name === "publish"
      : /^build\s/.test(job.name),
  );
  const sourceMatches = run.headSha === plan.source.revision && definition.path === plan.source.workflow;
  const completed = run.status === "completed";
  const qualified =
    sourceMatches &&
    completed &&
    run.conclusion === "success" &&
    requiredJobs.length > 0 &&
    requiredJobs.every((job: Document) => job.conclusion === "success");
  const receipt = {
    schema: 1,
    plan,
    run,
    sourceMatches,
    qualified,
    artifacts: artifacts.map(a => ({
      id: a.id,
      name: a.name,
      size: a.size_in_bytes,
      digest: a.digest ?? null,
      expired: a.expired,
      integrity: "GitHub-reported archive digest; download verification required before consumption",
    })),
    publicationEvidence:
      "A successful workflow is not an exact npm version/integrity or installed-consumer receipt. Use monorepo-delivery registry qualification and verified installation separately.",
  };
  if (out) await Bun.write(resolve(out), JSON.stringify(receipt, null, 2) + "\n");
  return receipt;
}

export async function main(args = Bun.argv.slice(2)) {
  const { values } = parseArgs({
    args,
    options: {
      root: { type: "string", default: resolve(import.meta.dir, "../..") },
      repo: { type: "string", default: "aphrody-labs/bun" },
      ref: { type: "string", default: "main" },
      pipeline: { type: "string", default: "native" },
      operation: { type: "string", default: "plan" },
      version: { type: "string" },
      platforms: { type: "string" },
      "factory-tag": { type: "string" },
      "release-channel": { type: "string" },
      publish: { type: "boolean" },
      apply: { type: "boolean" },
      remote: { type: "boolean" },
      run: { type: "string" },
      out: { type: "string" },
    },
  });
  if (!(values.pipeline! in PIPELINES)) throw new Error(`Unknown pipeline: ${values.pipeline}`);
  if (!["plan", "dispatch", "status", "receipt"].includes(values.operation!))
    throw new Error(`Unknown operation: ${values.operation}`);
  const plan = nativePlan(
    resolve(values.root!),
    values.repo!,
    values.ref!,
    values.pipeline as Pipeline,
    values.publish,
    values.version,
    values.platforms,
    values["factory-tag"],
    values["release-channel"],
  );
  let result: Document = { plan };
  if (values.remote || values.operation === "dispatch") result.remote = remoteQualification(plan);
  if (values.operation === "dispatch" && values.apply) {
    if (result.remote.blockers.length) throw new Error(result.remote.blockers.join("; "));
    if (
      values.publish &&
      !git(resolve(values.root!), ["tag", "--points-at", plan.source.revision])
        .trim()
        .split("\n")
        .includes(plan.dispatchRef)
    )
      throw new Error("Publishing dispatch requires an exact selected source tag, not a moving branch");
    result.dispatch = gh(
      [
        "workflow",
        "run",
        PIPELINES[plan.pipeline].workflow,
        "--repo",
        plan.repository,
        "--ref",
        plan.dispatchRef,
        "--json",
      ],
      JSON.stringify(plan.inputs),
    ).trim();
    result.dispatchedAt = new Date().toISOString();
  }
  if (values.operation === "status" || values.operation === "receipt") {
    if (!values.run) throw new Error("Status/receipt requires --run exact GitHub run ID");
    result = await runReceipt(plan, values.run);
  }
  const json = JSON.stringify(result, null, 2) + "\n";
  if (values.out) await Bun.write(resolve(values.out), json);
  else console.log(json);
  return result;
}

if (import.meta.main) await main();
