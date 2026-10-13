import { describe, expect, test } from "bun:test";
import { tempDir } from "harness";
import {
  DENO_CORE_REPOSITORY,
  DENO_CORE_REVISION,
  DENO_CORE_UPSTREAM_REVISION,
  denoSourcePath,
  verifyDenoCore,
} from "../../scripts/aphrody/vendor-deno-core.ts";

import { createHash } from "node:crypto";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { lstat, readlink, symlink } from "node:fs/promises";
import { join } from "node:path";
import type { FactoryHostProfile } from "../../scripts/aphrody/build-host.ts";
import { nativePlan } from "../../scripts/aphrody/delivery-native.ts";
import {
  boundedExecutionCommand,
  canResumeStep,
  cargoPublishAdapter,
  dependencyOrder,
  executeDeliveryPlan,
  executionInputHash,
  installTargetSnapshotHash,
  inventory,
  plan,
  readDeliveryJob,
  runDeliveryJob,
  sourceQualified,
  submitDeliveryJob,
  validateExecutionBudget,
  validateExecutionReceiptPath,
  verifyIntegrity,
  type ExecutionReceipt,
  type Step,
} from "../../scripts/aphrody/monorepo-delivery.ts";
import { apply, rewrite } from "../../scripts/aphrody/scope.ts";
import {
  commentUpdateTimestamp,
  consumeRequestBudget,
  createSnapshotWriter,
  graphqlRequest,
  nextCommentWindow,
  nextPage,
  outsideCheckout,
  PUBLIC_API_REQUEST_BUDGET,
  publicPageEntries,
  publicRepository,
  verifiedPublicCache,
  writePublicCache,
} from "../../scripts/aphrody/sync-public-upstream.ts";
import { sync } from "../../scripts/aphrody/sync-upstream.ts";
import { vendorApply, vendorPlan, verifyVendorReceipt } from "../../scripts/aphrody/vendor-oxc.ts";

test("public snapshot reconstruction truncates stale trailing rows", async () => {
  using directory = tempDir("public-snapshot-rebuild", {});
  const path = join(String(directory), "snapshot.partial");
  await Bun.write(path, '{"id":1}\n{"id":99999}\n');
  const writer = await createSnapshotWriter(path);
  writer.write('{"id":2}\n');
  await writer.end();
  expect(await Bun.file(path).text()).toBe('{"id":2}\n');
});

test("public cache commits complete checksum records and rejects altered responses", async () => {
  using directory = tempDir("public-response-cache", {});
  const path = join(String(directory), "page.json");
  const value = { data: [{ id: 1 }], next: null };
  await writePublicCache(path, value);
  const record = await Bun.file(path).json();
  expect(verifiedPublicCache(record)).toEqual(value);
  expect(() => verifiedPublicCache({ ...record, value: { data: [{ id: 2 }], next: null } })).toThrow("Corrupt");
  expect(() => verifiedPublicCache({ sha256: record.sha256 })).toThrow("Corrupt");
  // An interrupted temporary write cannot replace the last committed cache record.
  await Bun.write(`${path}.interrupted.pending`, "{");
  expect(verifiedPublicCache(await Bun.file(path).json())).toEqual(value);
});

test("public GraphQL input preserves variables and continuation cursors in the request body", () => {
  const query = "query($id:ID!,$cursor:String){node(id:$id){id}}";
  expect(graphqlRequest({ query, id: "D_public_fixture", cursor: "next-page" })).toEqual({
    query,
    variables: { id: "D_public_fixture", cursor: "next-page" },
  });
  expect(graphqlRequest({ query, cursor: null }).variables).toEqual({ cursor: null });
  expect(() => graphqlRequest({ id: "D_public_fixture" })).toThrow("GraphQL query");
});

test("public comments advance bounded overlapping timestamp windows", () => {
  const initial = "2024-01-01T00:00:00Z";
  expect(nextCommentWindow(initial, "2024-02-01T00:00:00Z", 30000, 30000)).toBe("2024-01-31T23:59:59.000Z");
  expect(nextCommentWindow(initial, undefined, 0, 0)).toBeNull();
  expect(nextCommentWindow(initial, "2024-02-01T00:00:00Z", 12, 0)).toBe("2024-01-31T23:59:59.000Z");
  expect(nextCommentWindow(initial, "2024-01-01T00:00:01Z", 12, 0)).toBeNull();
  expect(() => nextCommentWindow(initial, "2024-01-01T00:00:01Z", 30000, 30000)).toThrow("saturated");
  expect(() => nextCommentWindow(initial, "invalid", 1, 1)).toThrow("timestamp");
  expect(() => nextCommentWindow(initial, undefined, 1, 2)).toThrow("counts");
});

test("public comment pagination validates monotone updates and stable id overlap", () => {
  const previous = Date.parse("2024-01-01T00:00:00Z");
  expect(commentUpdateTimestamp("2024-01-01T00:00:00Z", previous)).toBe(previous);
  expect(commentUpdateTimestamp("2024-01-02T00:00:00Z", previous)).toBeGreaterThan(previous);
  expect(() => commentUpdateTimestamp("2023-12-31T23:59:59Z", previous)).toThrow("monotone");
  expect(() => commentUpdateTimestamp(undefined, previous)).toThrow("timestamp");
  const seen = new Set<number>();
  expect(publicPageEntries([{ id: 1 }, { id: 2 }], seen)).toEqual([{ id: 1 }, { id: 2 }]);
  expect(publicPageEntries([{ id: 2 }, { id: 3 }], seen)).toEqual([{ id: 3 }]);
  expect(publicPageEntries([{ id: 3 }], seen)).toEqual([]);
  expect(() => publicPageEntries([{ id: -1 }], seen)).toThrow("stable id");
});

test("public export uncached request budget has a hard boundary", () => {
  expect(consumeRequestBudget(0)).toBe(1);
  expect(consumeRequestBudget(PUBLIC_API_REQUEST_BUDGET - 1)).toBe(PUBLIC_API_REQUEST_BUDGET);
  expect(() => consumeRequestBudget(PUBLIC_API_REQUEST_BUDGET)).toThrow("budget reached");
  expect(() => consumeRequestBudget(-1)).toThrow("request count");
});

test("execution receipts refuse tracked source, protected data and escaping symlinks", async () => {
  using directory = tempDir("delivery-receipt-path", {
    "source/package.json": "{}",
    "outside/keep": "protected fixture",
  });
  const root = join(String(directory), "source");
  const git = (...args: string[]) => {
    const result = Bun.spawnSync(["git", ...args], { cwd: root, stdout: "pipe", stderr: "pipe" });
    if (result.exitCode) throw new Error(result.stderr.toString());
  };
  git("init", "--quiet");
  git("add", "package.json");
  await expect(validateExecutionReceiptPath(root, root, join(root, "package.json"))).rejects.toThrow("tracked");
  await expect(validateExecutionReceiptPath(root, root, join(root, ".codex", "receipt.json"))).rejects.toThrow(
    "Protected",
  );
  await expect(
    validateExecutionReceiptPath(root, root, join(String(directory), "outside", "receipt.json")),
  ).rejects.toThrow("isolated");
  await symlink(join(String(directory), "outside", "keep"), join(root, "receipt-link.json"), "file");
  await expect(validateExecutionReceiptPath(root, String(directory), join(root, "receipt-link.json"))).rejects.toThrow(
    "symlink",
  );
  expect(await Bun.file(join(String(directory), "outside", "keep")).text()).toBe("protected fixture");
  expect(await validateExecutionReceiptPath(root, root, join(root, "tmp", "receipt.json"))).toBe(
    join(root, "tmp", "receipt.json"),
  );
});

test("delivery bounds real compiler parallelism and refuses unlimited or excessive jobs", () => {
  expect(boundedExecutionCommand(["bun", "run", "build:release"], 8)).toEqual(["bun", "run", "build:release", "-j8"]);
  expect(boundedExecutionCommand(["bun", "run", "build:release", "-j4"], 8)).toEqual([
    "bun",
    "run",
    "build:release",
    "-j4",
  ]);
  for (const flag of [["-j0"], ["-j", "9"], ["--jobs=16"], ["--parallel", "-1"]])
    expect(() => boundedExecutionCommand(["cargo", "check", ...flag], 8)).toThrow("CPU budget");
});

test("delivery runner executes real artifacts and resumes only verified output bytes", async () => {
  using directory = tempDir("delivery-runner", {});
  const root = String(directory);
  const source = {
    revision: "a".repeat(40),
    rootTree: "b".repeat(40),
    date: "2026-10-11",
    version: "1.4.4",
  };
  const profile: FactoryHostProfile = {
    schema: 1,
    host: "fixture",
    target: process.platform === "win32" ? "windows-x64" : "linux-x64",
    factoryRoot: root,
    sourceTree: source.rootTree,
    cpu: 2,
    memoryMiB: 4096,
    diskMiB: 65536,
    heavySlots: 1,
    lightSlots: 1,
    lockPath: join(root, "heavy.lock"),
    reserveMemoryMiB: 512,
    reserveDiskMiB: 8192,
    observedAt: new Date().toISOString(),
  };
  const step: Step = {
    id: "fixture",
    command: [
      "bun",
      "-e",
      "const f=Bun.file('counter');const n=await f.exists()?Number(await f.text())+1:1;await Bun.write('counter',String(n));await Bun.write('artifact','qualified-'+n)",
    ],
    directory: ".",
    requires: [],
    outputs: ["artifact"],
  };
  const options = {
    receiptPath: join(root, "receipt.json"),
    snapshotHash: "c".repeat(64),
    resume: true,
  };
  await executeDeliveryPlan(root, source, [step], profile, options);
  expect(await Bun.file(join(root, "counter")).text()).toBe("1");
  await executeDeliveryPlan(root, source, [step], profile, options);
  expect(await Bun.file(join(root, "counter")).text()).toBe("1");
  await Bun.write(join(root, "artifact"), "tampered");
  await executeDeliveryPlan(root, source, [step], profile, options);
  expect(await Bun.file(join(root, "counter")).text()).toBe("2");
  await executeDeliveryPlan(root, { ...source, revision: "d".repeat(40) }, [step], profile, options);
  expect(await Bun.file(join(root, "counter")).text()).toBe("3");
}, 10000);

test("delivery jobs hand off once and keep durable idempotent receipts", async () => {
  using directory = tempDir("delivery-jobs", {
    "package.json": JSON.stringify({ name: "delivery-jobs-fixture", version: "1.0.0" }),
  });
  const root = String(directory);
  const git = (...args: string[]) => {
    const result = Bun.spawnSync(["git", ...args], { cwd: root, stdout: "pipe", stderr: "pipe" });
    if (result.exitCode) throw new Error(result.stderr.toString());
    return result.stdout.toString().trim();
  };
  git("init", "--quiet");
  git("add", "package.json");
  git("-c", "user.name=fixture", "-c", "user.email=fixture@example.com", "commit", "--quiet", "-m", "fixture");
  const source = {
    revision: git("rev-parse", "HEAD"),
    rootTree: git("rev-parse", "HEAD^{tree}"),
    date: "2026-10-11",
    version: "1.4.4",
  };
  let spawnCalls = 0;
  let unrefCalls = 0;
  const spawn: NonNullable<Parameters<typeof submitDeliveryJob>[5]>["spawn"] = () => {
    spawnCalls++;
    return { unref: () => unrefCalls++ };
  };
  const submitted = await submitDeliveryJob(
    root,
    source,
    "inventory",
    ["--root", root, "--operation", "inventory"],
    "inventory-fixture",
    { spawn },
  );
  expect(submitted.state).toBe("launching");
  expect(spawnCalls).toBe(1);
  expect(unrefCalls).toBe(1);
  const persisted = await readDeliveryJob(root, submitted.id);
  expect(persisted.sourceRevision).toBe(source.revision);
  expect(persisted.args).toContain(join(root, "tmp", "monorepo-delivery-jobs", submitted.id, "execution.json"));
  const jobPath = join(root, "tmp", "monorepo-delivery-jobs", submitted.id, "job.json");
  await Bun.write(
    jobPath,
    JSON.stringify({ ...persisted, requestArgs: [...persisted.requestArgs, "--allow-partial"] }),
  );
  await expect(readDeliveryJob(root, submitted.id)).rejects.toThrow("Invalid delivery job receipt");
  await Bun.write(jobPath, `${JSON.stringify(persisted, null, 2)}\n`);
  const workerLock = join(root, "tmp", "monorepo-delivery-jobs", submitted.id, "worker.lock");
  await Bun.write(workerLock, JSON.stringify({ pid: process.pid, inputHash: persisted.inputHash }));
  await expect(runDeliveryJob(root, submitted.id)).rejects.toThrow("already claimed");
  expect((await readDeliveryJob(root, submitted.id)).state).toBe("launching");
  unlinkSync(workerLock);
  expect(await runDeliveryJob(root, submitted.id)).toMatchObject({ state: "succeeded", exitCode: 0 });
  expect(await Bun.file(workerLock).exists()).toBe(false);
  expect(await Bun.file(join(root, "tmp", "monorepo-delivery-jobs", submitted.id, "report.json")).exists()).toBe(true);
  expect(
    await submitDeliveryJob(root, source, "inventory", ["--root", root, "--operation", "inventory"], submitted.id, {
      launch: false,
    }),
  ).toMatchObject({ id: submitted.id, state: "succeeded" });
  await expect(
    submitDeliveryJob(root, source, "inventory", ["--operation", "different"], submitted.id, { launch: false }),
  ).rejects.toThrow("different inputs");
  await expect(readDeliveryJob(root, "../protected")).rejects.toThrow("Invalid delivery job ID");
  const drifted = await submitDeliveryJob(
    root,
    { ...source, revision: "f".repeat(40) },
    "inventory",
    ["--root", root, "--operation", "inventory"],
    "source-drift",
    { launch: false },
  );
  await expect(runDeliveryJob(root, drifted.id)).rejects.toThrow("source revision changed");
  expect(await readDeliveryJob(root, drifted.id)).toMatchObject({ state: "failed", exitCode: 1 });
}, 15000);

test("detached install target fingerprints track manifests and reject symlink roots", async () => {
  using directory = tempDir("delivery-install-target", { "package.json": JSON.stringify({ name: "consumer" }) });
  const target = String(directory);
  const initial = await installTargetSnapshotHash(target);
  await Bun.write(join(target, "bun.lock"), "lock-v1");
  const withLock = await installTargetSnapshotHash(target);
  expect(withLock).not.toBe(initial);
  await Bun.write(join(target, "package.json"), JSON.stringify({ name: "changed-consumer" }));
  expect(await installTargetSnapshotHash(target)).not.toBe(withLock);
  await expect(installTargetSnapshotHash(join(target, "package.json"))).rejects.toThrow("real directory");
});

test("delivery scheduler overlaps independent light commands and waits for DAG prerequisites", async () => {
  using directory = tempDir("delivery-scheduler", {});
  const root = String(directory);
  const source = {
    revision: "a".repeat(40),
    rootTree: "b".repeat(40),
    date: "2026-10-11",
    version: "1.4.4",
  };
  const profile: FactoryHostProfile = {
    schema: 1,
    host: "fixture",
    target: process.platform === "win32" ? "windows-x64" : "linux-x64",
    factoryRoot: root,
    sourceTree: source.rootTree,
    cpu: 2,
    memoryMiB: 4096,
    diskMiB: 65536,
    heavySlots: 1,
    lightSlots: 2,
    lockPath: join(root, "heavy.lock"),
    reserveMemoryMiB: 512,
    reserveDiskMiB: 1024,
    observedAt: new Date().toISOString(),
  };
  let requests = 0;
  let release!: () => void;
  const barrier = new Promise<void>(resolve => {
    release = resolve;
  });
  const server = Bun.serve({
    port: 0,
    async fetch() {
      if (++requests === 2) release();
      await barrier;
      return new Response("ready");
    },
  });
  try {
    const steps: Step[] = ["first", "second"].map(id => ({
      id,
      directory: ".",
      requires: [],
      outputs: [id],
      command: [
        "bun",
        "-e",
        `const r=await fetch(${JSON.stringify(server.url.href)});await Bun.write(${JSON.stringify(id)},await r.text())`,
      ],
    }));
    steps.push({
      id: "joined",
      directory: ".",
      requires: ["first", "second"],
      outputs: ["joined"],
      command: [
        "bun",
        "-e",
        "await Bun.write('joined',await Bun.file('first').text()+'-'+await Bun.file('second').text())",
      ],
    });
    const receipt = await executeDeliveryPlan(root, source, steps, profile, {
      receiptPath: join(root, "receipt.json"),
      snapshotHash: "c".repeat(64),
    });
    expect(requests).toBe(2);
    expect(await Bun.file(join(root, "joined")).text()).toBe("ready-ready");
    expect(receipt.steps.map(step => step.id).sort()).toEqual(["first", "joined", "second"]);
    expect(
      receipt.steps.every(step => step.state === "completed" && step.exitCode === 0 && step.outputs.length === 1),
    ).toBe(true);
  } finally {
    server.stop(true);
  }
}, 10000);

test("delivery budgets remain within the observed host and heavy shared lock", () => {
  const profile = {
    host: "vps",
    target: "linux-x64",
    cpu: 12,
    memoryMiB: 46080,
    diskMiB: 140288,
    lockPath: "/tmp/factory.lock",
  };
  const budget = {
    host: profile.host,
    target: profile.target,
    resourceClass: "heavy" as const,
    cpu: 8,
    memoryMiB: 32768,
    diskMiB: 40960,
    lockKey: profile.lockPath,
  };
  expect(validateExecutionBudget(budget, profile)).toEqual(budget);
  for (const patch of [
    { cpu: 0 },
    { cpu: 13 },
    { memoryMiB: 46081 },
    { diskMiB: -1 },
    { host: "dbfr" },
    { lockKey: "/tmp/other.lock" },
  ])
    expect(() => validateExecutionBudget({ ...budget, ...patch }, profile)).toThrow();
});

test("delivery resume requires unchanged source, inputs and actual artifact bytes", async () => {
  using directory = tempDir("delivery-resume", { "output/artifact": "qualified fixture" });
  const source = {
    revision: "a".repeat(40),
    rootTree: "b".repeat(40),
    date: "2026-10-11",
    version: "1.4.4",
  };
  const snapshotHash = "c".repeat(64);
  const step: Step = {
    id: "fixture",
    command: ["bun", "build"],
    directory: ".",
    requires: [],
    execution: {
      host: "vps",
      target: "linux-x64",
      resourceClass: "light",
      cpu: 1,
      memoryMiB: 512,
      diskMiB: 1024,
    },
  };
  const receipt: ExecutionReceipt = {
    schema: 1,
    source,
    host: "vps",
    target: "linux-x64",
    snapshotHash,
    steps: [
      {
        id: step.id,
        inputHash: executionInputHash(source, step, snapshotHash, []),
        state: "completed",
        exitCode: 0,
        outputs: [
          {
            path: "output/artifact",
            sha256: createHash("sha256").update("qualified fixture").digest("hex"),
          },
        ],
        startedAt: "2026-10-11T00:00:00Z",
        endedAt: "2026-10-11T00:00:01Z",
      },
    ],
  };
  expect(await canResumeStep(String(directory), source, step, snapshotHash, [], receipt)).toBe(true);
  expect(
    await canResumeStep(String(directory), { ...source, revision: "d".repeat(40) }, step, snapshotHash, [], receipt),
  ).toBe(false);
  expect(
    await canResumeStep(String(directory), source, { ...step, command: ["bun", "test"] }, snapshotHash, [], receipt),
  ).toBe(false);
  expect(await canResumeStep(String(directory), source, step, snapshotHash, ["changed dependency"], receipt)).toBe(
    false,
  );
  receipt.steps[0].exitCode = 1;
  expect(await canResumeStep(String(directory), source, step, snapshotHash, [], receipt)).toBe(false);
  receipt.steps[0].exitCode = 0;
  await Bun.write(join(String(directory), "output/artifact"), "tampered artifact");
  expect(await canResumeStep(String(directory), source, step, snapshotHash, [], receipt)).toBe(false);
});

test("registry existence does not qualify source provenance or a dry-run receipt", () => {
  const revision = "a".repeat(40);
  const record = {
    name: "@aphrody/fixture",
    version: "1.4.4",
    dist: { integrity: "sha512-pinned" },
  };
  const entry = {
    name: record.name,
    version: record.version,
    sourceRevision: revision,
    sourceVerified: true,
    integrity: record.dist.integrity,
    contentHash: "b".repeat(64),
    action: "unchanged",
  };
  expect(sourceQualified(revision, record)).toBe(false);
  expect(sourceQualified(revision, { ...record, gitHead: revision })).toBe(true);
  expect(sourceQualified(revision, record, { sourceRevision: revision, packages: [entry] })).toBe(true);
  for (const patch of [
    { sourceRevision: "c".repeat(40) },
    { sourceVerified: false },
    { integrity: "sha512-changed" },
    { action: "dry-run" },
    { contentHash: "unqualified" },
  ])
    expect(
      sourceQualified(revision, record, {
        sourceRevision: revision,
        packages: [{ ...entry, ...patch }],
      }),
    ).toBe(false);
});

describe("immutable OXC vendoring", () => {
  test("local tracked-source export preserves hashes and refuses drift or an unrelated target", async () => {
    using source = tempDir("vendor-source", {
      LICENSE: "MIT\n",
      "Cargo.toml": "[workspace]\n",
      "source.rs": "pub fn owner() {}\n",
      "fixtures/node_modules/example/index.js": "export default 1;\n",
      ".gitattributes": "source.rs text eol=crlf\n",
      "ignored.cache": "not source",
    });
    using workspace = tempDir("vendor-workspace", {});
    async function git(args: string[]) {
      const proc = Bun.spawn(["git", "-C", String(source), ...args], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const [stdout, stderr, code] = await Promise.all([
        Bun.readableStreamToText(proc.stdout),
        Bun.readableStreamToText(proc.stderr),
        proc.exited,
      ]);
      if (code !== 0) throw new Error(stderr);
      expect(code).toBe(0);
      return stdout.trim();
    }
    await git(["init", "--quiet"]);
    await symlink("source.rs", join(String(source), "link.rs"), "file");
    await git([
      "add",
      "LICENSE",
      "Cargo.toml",
      "source.rs",
      "fixtures/node_modules/example/index.js",
      ".gitattributes",
      "link.rs",
    ]);
    await git([
      "-c",
      "user.name=aphrody-dev",
      "-c",
      "user.email=contact@aphrody.com",
      "commit",
      "--quiet",
      "-m",
      "source fixture",
    ]);
    const revision = await git(["rev-parse", "HEAD"]);
    const options = {
      workspace: String(workspace),
      source: String(source),
      target: join(String(workspace), "vendor/oxc"),
      revision,
    };
    const plan = await vendorPlan(options);
    expect(plan.trackedFiles).toBe(6);
    expect(plan.symlinks).toBe(1);
    expect(await Bun.file(join(options.target, "source.rs")).exists()).toBe(false);
    await expect(vendorPlan({ ...options, target: join(String(workspace), "unrelated") })).rejects.toThrow(
      "vendor/oxc",
    );
    const applied = await vendorApply(options);
    expect(applied.archiveSha256).toMatch(/^[a-f0-9]{64}$/);
    expect((await lstat(join(options.target, "link.rs"))).isSymbolicLink()).toBe(true);
    expect(await readlink(join(options.target, "link.rs"))).toBe("source.rs");
    expect(await Bun.file(join(options.target, "source.rs")).text()).toBe("pub fn owner() {}\n");
    expect(await Bun.file(join(options.target, "ignored.cache")).exists()).toBe(false);
    expect((await vendorApply(options)).unchanged).toBe(true);
    expect((await verifyVendorReceipt(options.target, revision)).revision).toBe(revision);
    expect(await Bun.file(join(options.target, ".ref")).exists()).toBe(false);
    await expect(verifyVendorReceipt(options.target, "0".repeat(40))).rejects.toThrow("immutable source");
    const receiptPath = join(options.target, ".bun-vendor.json");
    const receiptText = await Bun.file(receiptPath).text();
    const altered = JSON.parse(receiptText);
    altered.files[0].sha256 = "0".repeat(64);
    await Bun.write(receiptPath, JSON.stringify(altered));
    await expect(verifyVendorReceipt(options.target, revision)).rejects.toThrow("hashes differ");
    await Bun.write(receiptPath, receiptText);
    await Bun.write(join(options.target, ".ref"), "qualified-stamp\n");
    expect((await verifyVendorReceipt(options.target, revision)).files).toHaveLength(6);
    expect(await Bun.file(join(options.target, "fixtures/node_modules/example/index.js")).text()).toBe(
      "export default 1;\n",
    );
    await Bun.write(join(options.target, "source.rs"), "changed\n");
    await expect(vendorApply(options)).rejects.toThrow("integrity differs");
    await expect(verifyVendorReceipt(options.target, revision)).rejects.toThrow("integrity differs");
    expect(await Bun.file(join(options.target, "source.rs")).text()).toBe("changed\n");
  });
});

describe("scope rewrite", () => {
  test("compact manifests preserve whitespace and only rename root package fields", () => {
    const text =
      '{"metadata":{"name":"bun-plugin-yaml"},"name":"bun-plugin-yaml","dependencies":{"bun-types":"workspace:*"},"nested":{"dependencies":{"bun-types":"workspace:*"}}}\n';
    const expected =
      '{"metadata":{"name":"bun-plugin-yaml"},"name":"@aphrody/bun-plugin-yaml","dependencies":{"@aphrody/bun-types":"workspace:*"},"nested":{"dependencies":{"bun-types":"workspace:*"}}}\n';
    expect(rewrite("packages/fixture/package.json", text)).toBe(expected);
    expect(rewrite("packages/fixture/package.json", expected)).toBe(expected);
    expect(rewrite("packages/fixture/package.json", '{"name"\t:\n"bun-types"}')).toBe(
      '{"name"\t:\n"@aphrody/bun-types"}',
    );
  });

  test("a manifest renames itself and local dependencies, not registry ones", () => {
    const manifest = JSON.stringify(
      {
        name: "bun-plugin-yaml",
        devDependencies: { "bun-types": "canary", "bun-inspector-protocol": "workspace:*" },
      },
      null,
      2,
    );
    expect(JSON.parse(rewrite("packages/bun-plugin-yaml/package.json", manifest))).toEqual({
      name: "@aphrody/bun-plugin-yaml",
      devDependencies: { "bun-types": "canary", "@aphrody/bun-inspector-protocol": "workspace:*" },
    });
  });

  test("mdx-rs platform packages are scoped, their binaries are not", () => {
    const manifest = `{\n  "name": "bun-mdx-rs-linux-x64-gnu",\n  "main": "bun-mdx-rs.linux-x64-gnu.node"\n}\n`;
    expect(rewrite("packages/bun-build-mdx-rs/npm/linux-x64-gnu/package.json", manifest)).toBe(
      `{\n  "name": "@aphrody/bun-mdx-rs-linux-x64-gnu",\n  "main": "bun-mdx-rs.linux-x64-gnu.node"\n}\n`,
    );
  });

  test("code rewrites string literals but keeps relative paths", () => {
    const code = `import a from "bun-inspector-protocol";\nimport b from "../../bun-inspector-protocol/index.ts";\n`;
    expect(rewrite("packages/x/src/a.ts", code)).toBe(
      `import a from "@aphrody/bun-inspector-protocol";\nimport b from "../../bun-inspector-protocol/index.ts";\n`,
    );
  });

  test("prose rewrites bare names, keeps paths, URLs and lines about upstream", () => {
    const md = [
      "bun add -d @types/bun bun-plugin-svelte",
      "See packages/bun-plugin-svelte and https://npmjs.com/package/bun-plugin-svelte.",
      "Upstream publishes bun-types as @types/bun.",
    ].join("\n");
    expect(rewrite("packages/bun-plugin-svelte/README.md", md)).toBe(
      [
        "bun add -d @aphrody/bun-types @aphrody/bun-plugin-svelte",
        "See packages/bun-plugin-svelte and https://npmjs.com/package/bun-plugin-svelte.",
        "Upstream publishes bun-types as @types/bun.",
      ].join("\n"),
    );
  });

  test("is idempotent and leaves files outside packages/ alone", () => {
    const md = "bun add bun-plugin-yaml";
    const once = rewrite("packages/bun-plugin-yaml/README.md", md);
    expect(rewrite("packages/bun-plugin-yaml/README.md", once)).toBe(once);
    expect(rewrite("docs/typescript.mdx", "bun add -d @types/bun")).toBe("bun add -d @types/bun");
  });

  test("the checkout has no unscoped references left", async () => {
    expect(await apply(join(import.meta.dir, "..", ".."), false)).toEqual([]);
  });
});

function git(cwd: string, ...args: string[]) {
  const proc = Bun.spawnSync(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  if (proc.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${proc.stderr.toString()}`);
  return proc.stdout.toString().trim();
}

const README = "packages/bun-plugin-yaml/README.md";
const MANIFEST = "packages/bun-plugin-yaml/package.json";

// A repo where `upstream` is a branch that edits the same lines the fork renamed.
function forkRepo(prefix: string) {
  const dir = tempDir(prefix, {
    [README]: "# bun-plugin-yaml\n\nbun add bun-plugin-yaml\n\nUsage.\n",
    [MANIFEST]: `{\n  "name": "bun-plugin-yaml",\n  "version": "1.0.0"\n}\n`,
  });
  const root = String(dir);
  git(root, "init", "--quiet", "--initial-branch=main");
  git(root, "config", "user.email", "sync@example.com");
  git(root, "config", "user.name", "sync");
  git(root, "config", "core.autocrlf", "false");
  git(root, "add", "-A");
  git(root, "commit", "--quiet", "-m", "base");
  git(root, "branch", "upstream");
  return { dir, root };
}

const options = (root: string) => ({
  root,
  remote: "origin",
  ref: "upstream",
  branch: "main",
  fetch: false,
  push: false,
  dryRun: false,
  keepConflicts: false,
  index: false,
});

describe("monorepo delivery", () => {
  test("publication adapters cover explicitly registered Cargo workspace crates only", () => {
    expect(cargoPublishAdapter("packages/bun-n2b/crates/core/Cargo.toml", "aphrody-n2b-core")).toBe("publish-crates");
    expect(cargoPublishAdapter("src/browser/crates/ssrf/Cargo.toml", "bun_browser_ssrf")).toBe("publish-crates");
    expect(cargoPublishAdapter("vendor/uv/crates/uv/Cargo.toml", "uv")).toBeNull();
    expect(cargoPublishAdapter("packages/bun-n2b/crates/core/Cargo.toml", "other-crate")).toBeNull();
  });

  test("native plans preserve dry-run semantics and reject source version drift", () => {
    const common =
      "name: fixture\non:\n  workflow_dispatch:\n    inputs:\n      version:\n        type: string\n      dry-run:\n        type: boolean\n        default: false\n      publish-npm:\n        type: boolean\n        default: true\nenv:\n  BUN_HOST_VERSION: aphrody-v1.4.3-aphrody.4\njobs:\n  plan:\n    if: github.repository == 'aphrody-labs/bun' || github.repository == 'aphrody-labs/bun-os'\n    runs-on: ubuntu-latest\n";
    using dir = tempDir("native-delivery-plan", {
      "package.json": JSON.stringify({ name: "bun", version: "1.4.4" }),
      ".github/workflows/aphrody-publish-native.yml": common,
      ".github/workflows/aphrody-release.yml": common,
    });
    const root = String(dir);
    git(root, "init", "--quiet", "--initial-branch=main");
    git(root, "config", "user.email", "test@example.com");
    git(root, "config", "user.name", "test");
    git(root, "remote", "add", "bun-os", "https://github.com/aphrody-labs/bun-os.git");
    git(root, "add", "-A");
    git(root, "commit", "--quiet", "-m", "workflow");
    const plugin = nativePlan(root, "aphrody-labs/bun-os", "main", "native");
    expect(plugin.inputs["dry-run"]).toBe("true");
    expect(plugin.blockers).toEqual([]);
    expect(plugin.source.workflowSha256).toMatch(/^[a-f0-9]{64}$/);
    const runtime = nativePlan(root, "aphrody-labs/bun-os", "main", "runtime");
    expect(runtime.inputs["publish-npm"]).toBe("false");
    expect(runtime.blockers[0]).toContain("publishes GitHub release assets");
    expect(nativePlan(root, "aphrody-labs/bun-os", "main", "runtime", true, "1.4.5").blockers[0]).toContain(
      "differs from source",
    );
  });

  test("inventory reads immutable Git manifests, excludes regression fixtures, and retains lock checksums", () => {
    using dir = tempDir("delivery-pins", {
      "package.json": JSON.stringify({ name: "bun", private: true, version: "1.4.4" }),
      "Cargo.toml": "[workspace]\nresolver = '3'\n",
      "Cargo.lock":
        "version = 4\n[[package]]\nname = 'external'\nversion = '1.2.3'\nsource = 'registry+https://github.com/rust-lang/crates.io-index'\nchecksum = 'abc'\n",
      "packages/bun-types/package.json": JSON.stringify({
        name: "@aphrody/bun-types",
        version: "1.4.4",
      }),
      "test/fixtures/package.json": "invalid syntax intentionally",
      "vendor/native/LICENSE": "License notice retained",
      "scripts/build/deps/native.ts":
        "const pin = '1234567890123456789012345678901234567890'; const source = 'https://github.com/owner/native'; const file = 'lib/native';\n",
    });
    const root = String(dir);
    git(root, "init", "--quiet", "--initial-branch=main");
    git(root, "config", "user.email", "test@example.com");
    git(root, "config", "user.name", "test");
    git(root, "add", "-A");
    git(root, "commit", "--quiet", "-m", "source");
    const first = inventory(root);
    writeFileSync(join(root, "packages/bun-types/package.json"), JSON.stringify({ name: "wrong", version: "99" }));
    expect(inventory(root)).toEqual(first);
    expect(first.products.map(p => p.name)).toEqual(["bun", "@aphrody/bun-types"]);
    expect(first.external[0]).toMatchObject({ name: "external", checksum: "abc" });
    expect(first.vendors[0]?.tree).toMatch(/^[0-9a-f]{40}$/);
    expect(first.nativeRecipes[0]?.repositories).toEqual(["https://github.com/owner/native"]);
    expect(plan(first, "release-check").steps.find(s => s.id === "npm")?.command).toContain("--dry-run");
    expect(plan(first, "release-check").steps.find(s => s.id === "npm")?.command).toContain("--stable");
    expect(plan(first, "release-publish").steps.find(s => s.id === "npm")?.command).toContain("--stable");
    expect(plan(first, "release-check").steps.some(s => s.command.includes("--publish"))).toBe(false);
    const build = plan(first, "build", root);
    expect(build.steps.find(s => s.id === "pack:@aphrody/bun-types")?.command).toContain("--ignore-scripts");
    expect(build.unsupported).toEqual([]);
  });

  test("dependency ordering rejects cycles instead of publishing partially ordered products", () => {
    expect(
      dependencyOrder([
        { name: "consumer", dependencies: ["base"] },
        { name: "base", dependencies: [] },
      ]).map(p => p.name),
    ).toEqual(["base", "consumer"]);
    expect(() =>
      dependencyOrder([
        { name: "a", dependencies: ["b"] },
        { name: "b", dependencies: ["a"] },
      ]),
    ).toThrow("Dependency cycle");
  });

  test("one-click installation refuses changed archive bytes", () => {
    const original = new TextEncoder().encode("qualified tarball");
    const integrity = `sha512-${createHash("sha512").update(original).digest("base64")}`;
    expect(() => verifyIntegrity(original, integrity)).not.toThrow();
    expect(() => verifyIntegrity(new TextEncoder().encode("changed tarball"), integrity)).toThrow("integrity mismatch");
    expect(() => verifyIntegrity(original, "sha1-legacy")).toThrow("unsupported digest");
  });
});

describe("sync-upstream", () => {
  test("public export follows server cursors and rejects foreign pagination links", () => {
    expect(
      nextPage(
        'Link: <https://api.github.com/repositories/357728969/issues?after=cursor&page=100>; rel="next"',
        357728969,
      ),
    ).toBe("repositories/357728969/issues?after=cursor");
    expect(() =>
      nextPage('Link: <https://api.github.com/repositories/123/issues?after=cursor>; rel="next"', 357728969),
    ).toThrow("Unexpected public");
    expect(
      nextPage(
        'HTTP/2.0 200 OK\nLink: <https://api.github.com/repos/oven-sh/bun/issues?after=Y3Vyc29y&per_page=100>; rel="next", <https://api.github.com/repos/oven-sh/bun/issues?before=end>; rel="prev"',
      ),
    ).toBe("repos/oven-sh/bun/issues?after=Y3Vyc29y&per_page=100");
    expect(nextPage("HTTP/2.0 200 OK")).toBeNull();
    expect(() => nextPage('Link: <https://evil.example/data>; rel="next"')).toThrow("Unexpected public");
    expect(() => nextPage('Link: <https://api.github.com/repos/private/data/issues>; rel="next"')).toThrow(
      "Unexpected public",
    );
  });

  test("public collaboration sync rejects private repositories and checkout output", () => {
    expect(() => publicRepository({ full_name: "oven-sh/bun", private: false })).not.toThrow();
    expect(() => publicRepository({ full_name: "oven-sh/bun", private: true })).toThrow("verified public");
    expect(() => publicRepository({ full_name: "aphrody-labs/bun-os", private: false })).toThrow("verified public");
    expect(() => publicRepository({ full_name: "oven-sh/bun" })).toThrow("verified public");
    const root = join(process.cwd(), "source-fixture");
    expect(outsideCheckout(root, root)).toBe(false);
    expect(outsideCheckout(root, join(root, "docs"))).toBe(false);
    expect(outsideCheckout(root, join(process.cwd(), "source-fixture-other"))).toBe(true);
  });

  test("rename resolution uses the linked worktree Git directory", async () => {
    const { dir, root } = forkRepo("aphrody-sync-worktree");
    using _ = dir;
    git(root, "checkout", "--quiet", "upstream");
    writeFileSync(join(root, MANIFEST), '{"name":"bun-plugin-yaml","version":"2.0.0"}\n');
    git(root, "commit", "--quiet", "-am", "upstream version");
    git(root, "checkout", "--quiet", "main");
    const worktree = join(root, "linked");
    git(root, "worktree", "add", "--quiet", "-b", "fork-linked", worktree, "main");
    try {
      await apply(worktree, true);
      git(worktree, "commit", "--quiet", "-am", "fork scope");
      const result = await sync({ ...options(worktree), branch: "fork-linked" });
      expect(result).toMatchObject({ status: "merged", behind: 1, pushed: false });
      expect(JSON.parse(readFileSync(join(worktree, MANIFEST), "utf8"))).toEqual({
        name: "@aphrody/bun-plugin-yaml",
        version: "2.0.0",
      });
      expect(git(worktree, "status", "--porcelain")).toBe("");
      expect(readFileSync(join(worktree, ".git"), "utf8")).toStartWith("gitdir: ");
    } finally {
      git(root, "worktree", "remove", "--force", worktree);
    }
  }, 30000);

  test("conflicts that only differ by the rename merge, upstream changes are kept", async () => {
    const { dir, root } = forkRepo("aphrody-sync-clean");
    using _ = dir;

    git(root, "checkout", "--quiet", "upstream");
    writeFileSync(join(root, README), "# bun-plugin-yaml\n\nbun add bun-plugin-yaml@2\n\nUsage.\n");
    writeFileSync(join(root, MANIFEST), `{\n  "name": "bun-plugin-yaml",\n  "version": "2.0.0"\n}\n`);
    writeFileSync(join(root, "packages/bun-plugin-yaml/index.ts"), `export const name = "bun-plugin-yaml";\n`);
    git(root, "add", "-A");
    git(root, "commit", "--quiet", "-m", "upstream: v2");

    git(root, "checkout", "--quiet", "main");
    await apply(root, true);
    writeFileSync(join(root, README), readFileSync(join(root, README), "utf8") + "\nFork note.\n");
    git(root, "commit", "--quiet", "-am", "fork: scope");

    const result = await sync(options(root));

    expect(result).toMatchObject({ status: "merged", behind: 1, pushed: false });
    expect(readFileSync(join(root, README), "utf8")).toBe(
      "# @aphrody/bun-plugin-yaml\n\nbun add @aphrody/bun-plugin-yaml@2\n\nUsage.\n\nFork note.\n",
    );
    expect(JSON.parse(readFileSync(join(root, MANIFEST), "utf8"))).toEqual({
      name: "@aphrody/bun-plugin-yaml",
      version: "2.0.0",
    });
    expect(readFileSync(join(root, "packages/bun-plugin-yaml/index.ts"), "utf8")).toBe(
      `export const name = "@aphrody/bun-plugin-yaml";\n`,
    );
    expect(git(root, "log", "-1", "--format=%P").split(" ")).toHaveLength(2);
    expect(git(root, "status", "--porcelain")).toBe("");
  }, 30000);

  test("a real conflict aborts the merge and reports the file", async () => {
    const { dir, root } = forkRepo("aphrody-sync-conflict");
    using _ = dir;

    git(root, "checkout", "--quiet", "upstream");
    writeFileSync(join(root, README), "# bun-plugin-yaml\n\nbun add bun-plugin-yaml\n\nUpstream usage.\n");
    git(root, "commit", "--quiet", "-am", "upstream: usage");

    git(root, "checkout", "--quiet", "main");
    writeFileSync(join(root, README), "# bun-plugin-yaml\n\nbun add bun-plugin-yaml\n\nFork usage.\n");
    git(root, "commit", "--quiet", "-am", "fork: usage");
    const before = git(root, "rev-parse", "HEAD");

    expect(await sync(options(root))).toEqual({
      status: "conflicts",
      behind: 1,
      conflicts: [README],
    });
    expect(git(root, "rev-parse", "HEAD")).toBe(before);
    expect(git(root, "status", "--porcelain")).toBe("");
  }, 30000);

  test("a conflict in a file the repository owns keeps the local version", async () => {
    const { dir, root } = forkRepo("aphrody-sync-owned");
    using _ = dir;
    writeFileSync(join(root, "README.md"), "# Bun\n\nUpstream intro.\n");
    git(root, "add", "-A");
    git(root, "commit", "--quiet", "-m", "base readme");
    git(root, "branch", "-f", "upstream");

    git(root, "checkout", "--quiet", "upstream");
    writeFileSync(join(root, "README.md"), "# Bun\n\nNew upstream intro.\n");
    writeFileSync(join(root, README), "# bun-plugin-yaml\n\nbun add bun-plugin-yaml\n\nUpstream usage.\n");
    git(root, "commit", "--quiet", "-am", "upstream: readme");

    git(root, "checkout", "--quiet", "main");
    await apply(root, true);
    writeFileSync(join(root, "README.md"), "# Aphrody runtime\n\nComponent intro.\n");
    git(root, "commit", "--quiet", "-am", "fork: readme");

    const result = await sync(options(root));

    expect(result).toMatchObject({
      status: "merged",
      behind: 1,
      kept: ["README.md"],
      pushed: false,
    });
    expect({
      readme: readFileSync(join(root, "README.md"), "utf8"),
      package: readFileSync(join(root, README), "utf8"),
    }).toEqual({
      readme: "# Aphrody runtime\n\nComponent intro.\n",
      package: "# @aphrody/bun-plugin-yaml\n\nbun add @aphrody/bun-plugin-yaml\n\nUpstream usage.\n",
    });
    expect(git(root, "status", "--porcelain")).toBe("");
  }, 30000);

  test("nothing to merge is a no-op", async () => {
    const { dir, root } = forkRepo("aphrody-sync-noop");
    using _ = dir;
    expect(await sync(options(root))).toEqual({ status: "up-to-date", behind: 0 });
  });
});

describe("Deno core source owner", () => {
  function fixture() {
    const files = {
      "Cargo.toml": "[workspace]\n",
      "LICENSE.md": "MIT\n",
      "libs/core/Cargo.toml": "core\n",
      "libs/ops/Cargo.toml": "ops\n",
      "libs/serde_v8/Cargo.toml": "serde\n",
      "libs/deno_v8/Cargo.toml": "v8\n",
    };
    const receipt = {
      schema: 1,
      repository: DENO_CORE_REPOSITORY,
      revision: DENO_CORE_REVISION,
      upstreamRevision: DENO_CORE_UPSTREAM_REVISION,
      archiveSha256: "a".repeat(64),
      files: Object.entries(files).map(([path, text]) => {
        const bytes = new TextEncoder().encode(text);
        return {
          path,
          mode: "100644",
          size: bytes.length,
          blob: new Bun.CryptoHasher("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex"),
          sha256: new Bun.CryptoHasher("sha256").update(bytes).digest("hex"),
        };
      }),
    };
    return tempDir("deno-core-receipt", { ...files, ".bun-vendor.json": JSON.stringify(receipt) });
  }

  test("qualifies the exact source closure read-only and preserves rejected changes", async () => {
    using dir = fixture();
    const manifest = join(String(dir), "libs/core/Cargo.toml");
    const before = readFileSync(manifest, "utf8");
    expect(await verifyDenoCore(String(dir))).toEqual({ revision: DENO_CORE_REVISION, files: 6 });
    expect(readFileSync(manifest, "utf8")).toBe(before);
    writeFileSync(manifest, "changed source\n");
    await expect(verifyDenoCore(String(dir))).rejects.toThrow("source drift");
    expect(readFileSync(manifest, "utf8")).toBe("changed source\n");
  });

  test("rejects another revision and unreceipted source", async () => {
    using dir = fixture();
    const receiptPath = join(String(dir), ".bun-vendor.json");
    const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
    receipt.revision = DENO_CORE_UPSTREAM_REVISION;
    writeFileSync(receiptPath, JSON.stringify(receipt));
    await expect(verifyDenoCore(String(dir))).rejects.toThrow("receipt mismatch");
    receipt.revision = DENO_CORE_REVISION;
    writeFileSync(receiptPath, JSON.stringify(receipt));
    writeFileSync(join(String(dir), "legacy.ts"), "retained\n");
    await expect(verifyDenoCore(String(dir))).rejects.toThrow("Unexpected Deno core source");
    expect(readFileSync(join(String(dir), "legacy.ts"), "utf8")).toBe("retained\n");
  });

  test("limits the export to the core library closure", () => {
    expect(denoSourcePath("libs/core/runtime/jsruntime.rs")).toBe(true);
    expect(denoSourcePath("runtime/lib.rs")).toBe(false);
    expect(denoSourcePath("cli/main.rs")).toBe(false);
    expect(() => denoSourcePath("libs/core/../credentials")).toThrow("Invalid Deno source path");
    expect(() => denoSourcePath("C:/protected/session")).toThrow("Invalid Deno source path");
  });
});
