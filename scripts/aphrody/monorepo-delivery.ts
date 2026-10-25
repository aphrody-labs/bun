#!/usr/bin/env bun
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  realpathSync,
  renameSync,
  statfsSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { freemem } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import type { FactoryHostProfile } from "./build-host.ts";
import { CRATES, WORKSPACES } from "./publish-crates.ts";
import { npmName, PACKAGES } from "./publish-npm.ts";
import { VENDORS } from "./publish-vendors.ts";
import { git, GitTree } from "../../packages/bun-ui/packages/web/site/collect.ts";

type Manifest = Record<string, any>;
export type Product = {
  name: string;
  version: string | null;
  manifest: string;
  kind: "npm" | "cargo";
  private: boolean;
  dependencies: string[];
  adapter: string | null;
  build: string | null;
  publishedName: string | null;
};
export type Inventory = {
  schema: 1;
  source: { revision: string; date: string; version: string; rootTree: string };
  locks: { path: string; blob: string; sha256: string }[];
  npmDependencies: { manifest: string; section: string; name: string; specification: string }[];
  nativeRecipes: { path: string; sha256: string; repositories: string[]; commitPins: string[] }[];
  artifactPipelines: {
    workflow: string;
    blob: string;
    status: "requires-qualified-platform-artifacts";
  }[];
  products: Product[];
  vendors: { path: string; tree: string; repositories: string[]; adapter: string | null }[];
  external: {
    ecosystem: "cargo";
    name: string;
    version: string;
    source: string;
    checksum: string | null;
    lock: string;
  }[];
};
export type ExecutionBudget = {
  host: string;
  target: string;
  resourceClass: "heavy" | "light";
  cpu: number;
  memoryMiB: number;
  diskMiB: number;
  lockKey?: string;
};
export type Step = {
  id: string;
  command: string[];
  directory: string;
  requires: string[];
  execution?: ExecutionBudget;
  outputs?: string[];
};
export type ExecutionReceipt = {
  schema: 1;
  source: Inventory["source"];
  host: string;
  target: string;
  snapshotHash: string;
  steps: {
    id: string;
    inputHash: string;
    state: "completed" | "failed";
    exitCode: number;
    outputs: { path: string; sha256: string }[];
    startedAt: string;
    endedAt: string;
  }[];
};
export type DeliveryJob = {
  schema: 1;
  id: string;
  inputHash: string;
  sourceRevision: string;
  operation: string;
  state: "launching" | "running" | "succeeded" | "failed";
  requestArgs: string[];
  args: string[];
  submittedAt: string;
  startedAt?: string;
  endedAt?: string;
  exitCode?: number;
  error?: string;
};
const sha256 = (text: string | Uint8Array) => createHash("sha256").update(text).digest("hex");

function deliveryJobPath(root: string, id: string) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,95}$/.test(id)) throw new Error("Invalid delivery job ID");
  return join(root, "tmp", "monorepo-delivery-jobs", id, "job.json");
}

export async function installTargetSnapshotHash(target: string) {
  if (existsSync(target) && (!lstatSync(target).isDirectory() || lstatSync(target).isSymbolicLink()))
    throw new Error("Install target must be a real directory");
  const manifests = await Promise.all(
    ["package.json", "bun.lock", "bun.lockb"].map(async name => {
      const path = join(target, name);
      if (!existsSync(path)) return [name, null] as const;
      if (!lstatSync(path).isFile() || lstatSync(path).isSymbolicLink())
        throw new Error(`Install target manifest must be a regular file: ${name}`);
      return [name, sha256(new Uint8Array(await Bun.file(path).arrayBuffer()))] as const;
    }),
  );
  return sha256(JSON.stringify(manifests));
}

export async function readDeliveryJob(root: string, id: string): Promise<DeliveryJob> {
  const path = deliveryJobPath(root, id);
  await validateExecutionReceiptPath(root, root, path, { allowJobId: id });
  if (!(await Bun.file(path).exists())) throw new Error(`Unknown delivery job: ${id}`);
  const job = (await Bun.file(path).json()) as DeliveryJob;
  if (
    job.schema !== 1 ||
    job.id !== id ||
    !["launching", "running", "succeeded", "failed"].includes(job.state) ||
    typeof job.operation !== "string" ||
    !Array.isArray(job.args) ||
    !Array.isArray(job.requestArgs) ||
    !job.args.every(argument => typeof argument === "string") ||
    !job.requestArgs.every(argument => typeof argument === "string") ||
    !/^[a-f0-9]{40}$/.test(job.sourceRevision) ||
    !/^[a-f0-9]{64}$/.test(job.inputHash) ||
    sha256(JSON.stringify({ revision: job.sourceRevision, operation: job.operation, args: job.requestArgs })) !==
      job.inputHash
  )
    throw new Error(`Invalid delivery job receipt: ${id}`);
  const directory = dirname(path);
  if (
    JSON.stringify(job.args) !==
    JSON.stringify([
      ...job.requestArgs,
      "--job",
      id,
      "--out",
      join(directory, "report.json"),
      "--execution-receipt",
      join(directory, "execution.json"),
    ])
  )
    throw new Error(`Delivery job arguments do not match their immutable request: ${id}`);
  return job;
}

async function writeDeliveryJob(root: string, job: DeliveryJob) {
  const path = deliveryJobPath(root, job.id);
  const temporary = `${path}.${process.pid}.pending`;
  await validateExecutionReceiptPath(root, root, path, { allowJobId: job.id });
  await validateExecutionReceiptPath(root, root, temporary);
  await Bun.write(temporary, `${JSON.stringify(job, null, 2)}\n`);
  renameSync(temporary, path);
}

export async function submitDeliveryJob(
  root: string,
  source: Inventory["source"],
  operation: string,
  args: string[],
  requestedId?: string,
  options: {
    launch?: boolean;
    spawn?: (
      command: string[],
      options: Bun.SpawnOptions.SpawnOptions<"ignore", Bun.BunFile, Bun.BunFile>,
    ) => Pick<ReturnType<typeof Bun.spawn>, "unref">;
  } = {},
) {
  const inputHash = sha256(JSON.stringify({ revision: source.revision, operation, args }));
  const id =
    requestedId ??
    `${operation.replaceAll(/[^a-zA-Z0-9._-]/g, "-")}-${source.revision.slice(0, 12)}-${inputHash.slice(0, 12)}`;
  const path = deliveryJobPath(root, id);
  const stdoutPath = join(dirname(path), "stdout.log");
  const stderrPath = join(dirname(path), "stderr.log");
  const jobArgs = [
    ...args,
    "--job",
    id,
    "--out",
    join(dirname(path), "report.json"),
    "--execution-receipt",
    join(dirname(path), "execution.json"),
  ];
  await Promise.all([
    validateExecutionReceiptPath(root, root, path, { allowJobId: id }),
    validateExecutionReceiptPath(root, root, stdoutPath, { allowPlainFile: true }),
    validateExecutionReceiptPath(root, root, stderrPath, { allowPlainFile: true }),
  ]);
  mkdirSync(dirname(path), { recursive: true });
  let existing: DeliveryJob | undefined;
  let created = false;
  if (existsSync(path)) existing = await readDeliveryJob(root, id);
  else {
    const job: DeliveryJob = {
      schema: 1,
      id,
      inputHash,
      sourceRevision: source.revision,
      operation,
      state: "launching",
      requestArgs: args,
      args: jobArgs,
      submittedAt: new Date().toISOString(),
    };
    try {
      writeFileSync(path, `${JSON.stringify(job, null, 2)}\n`, { flag: "wx" });
      existing = job;
      created = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      existing = await readDeliveryJob(root, id);
    }
  }
  if (existing.inputHash !== inputHash) throw new Error(`Delivery job ID already belongs to different inputs: ${id}`);
  if (!created) return { id, state: existing.state, inputHash, statusPath: path, stdoutPath, stderrPath };
  if (options.launch === false)
    return { id, state: existing.state, inputHash, statusPath: path, stdoutPath, stderrPath };
  try {
    await Promise.all([Bun.write(stdoutPath, ""), Bun.write(stderrPath, "")]);
    const spawn = options.spawn ?? Bun.spawn;
    const child = spawn([process.execPath, import.meta.path, "--root", root, "--run-job", id], {
      cwd: root,
      stdin: "ignore",
      stdout: Bun.file(stdoutPath),
      stderr: Bun.file(stderrPath),
      windowsHide: true,
    });
    child.unref();
  } catch (error) {
    await writeDeliveryJob(root, {
      ...existing,
      state: "failed",
      endedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
  return { id, state: "launching", inputHash, statusPath: path, stdoutPath, stderrPath };
}

export async function runDeliveryJob(root: string, id: string) {
  let job = await readDeliveryJob(root, id);
  if (job.state !== "launching") return job;
  const lockPath = join(dirname(deliveryJobPath(root, id)), "worker.lock");
  await validateExecutionReceiptPath(root, root, lockPath, { allowPlainFile: true });
  try {
    writeFileSync(
      lockPath,
      `${JSON.stringify({ pid: process.pid, inputHash: job.inputHash, claimedAt: new Date().toISOString() })}\n`,
      { flag: "wx" },
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST")
      throw new Error(`Delivery job worker is already claimed: ${id}`);
    throw error;
  }
  try {
    job = await readDeliveryJob(root, id);
    if (job.state !== "launching") return job;
    const running = { ...job, state: "running" as const, startedAt: new Date().toISOString() };
    await writeDeliveryJob(root, running);
    try {
      if (git(root, ["rev-parse", "HEAD"]).trim() !== job.sourceRevision)
        throw new Error("Delivery job source revision changed before worker start");
      await main(job.args);
      const completed = { ...running, state: "succeeded" as const, endedAt: new Date().toISOString(), exitCode: 0 };
      await writeDeliveryJob(root, completed);
      return completed;
    } catch (error) {
      const failed = {
        ...running,
        state: "failed" as const,
        endedAt: new Date().toISOString(),
        exitCode: 1,
        error: error instanceof Error ? error.message : String(error),
      };
      await writeDeliveryJob(root, failed);
      throw error;
    }
  } finally {
    unlinkSync(lockPath);
  }
}

export function cargoPublishAdapter(manifest: string, name: string): string | null {
  if (CRATES.some(crate => `${crate.dir}/Cargo.toml` === manifest)) return "publish-crates";
  return WORKSPACES.some(
    workspace =>
      workspace.crates.includes(name) && manifest === (workspace.manifests?.[name] ?? `${workspace.dir}/Cargo.toml`),
  )
    ? "publish-crates"
    : null;
}

function cargoPublishedName(manifest: string, name: string): string | null {
  const renamed = CRATES.find(crate => `${crate.dir}/Cargo.toml` === manifest)?.name;
  if (renamed) return renamed;
  return cargoPublishAdapter(manifest, name) ? name : null;
}

export function validateExecutionBudget(
  budget: ExecutionBudget,
  profile: Pick<FactoryHostProfile, "host" | "target" | "cpu" | "memoryMiB" | "diskMiB" | "lockPath">,
) {
  if (budget.host !== profile.host || budget.target !== profile.target)
    throw new Error("Execution host or target differs from the qualified profile");
  for (const key of ["cpu", "memoryMiB", "diskMiB"] as const)
    if (!Number.isSafeInteger(budget[key]) || budget[key] <= 0 || budget[key] > profile[key])
      throw new Error(`Execution ${key} exceeds the available positive budget`);
  if (!["heavy", "light"].includes(budget.resourceClass)) throw new Error("Unknown resource class");
  if (budget.resourceClass === "heavy" && budget.lockKey !== profile.lockPath)
    throw new Error("Heavy execution requires the canonical shared lock");
  return budget;
}

export function executionInputHash(
  source: Inventory["source"],
  step: Step,
  snapshotHash: string,
  prerequisites: string[],
) {
  return sha256(JSON.stringify({ source, step, snapshotHash, prerequisites }));
}

export function boundedExecutionCommand(command: string[], cpu: number) {
  if (!Number.isSafeInteger(cpu) || cpu < 1) throw new Error("Invalid execution CPU budget");
  let explicitJobs = false;
  for (let index = 1; index < command.length; index++) {
    const argument = command[index]!;
    const match = /^(?:-j|--jobs=|--parallel=)(.*)$/.exec(argument);
    if (match || ["-j", "--jobs", "--parallel"].includes(argument)) {
      const jobs = Number(["-j", "--jobs", "--parallel"].includes(argument) ? command[++index] : match?.[1]);
      if (!Number.isSafeInteger(jobs) || jobs < 1 || jobs > cpu)
        throw new Error("Command jobs exceed the execution CPU budget");
      explicitJobs = true;
    }
  }
  const runtimeBuild = command[1] === "run" && command[2] === "build:release";
  return runtimeBuild && !explicitJobs ? [...command, `-j${cpu}`] : command;
}

export async function validateExecutionReceiptPath(
  root: string,
  factoryRoot: string,
  input: string,
  options: { allowJobId?: string; allowPlainFile?: boolean } = {},
) {
  const canonical = (path: string): string => {
    let ancestor = resolve(path);
    const suffix: string[] = [];
    while (!existsSync(ancestor)) {
      let symlink = false;
      try {
        symlink = lstatSync(ancestor).isSymbolicLink();
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      if (symlink) throw new Error("Execution receipt must not traverse a dangling symlink");
      const parent = dirname(ancestor);
      if (parent === ancestor) throw new Error("Receipt has no existing ancestor");
      suffix.unshift(relative(parent, ancestor));
      ancestor = parent;
    }
    return resolve(realpathSync(ancestor), ...suffix);
  };
  const inside = (base: string, path: string) => {
    const scoped = relative(base, path);
    return !isAbsolute(scoped) && scoped !== ".." && !scoped.startsWith("../") && !scoped.startsWith("..\\");
  };
  const destination = canonical(input);
  const checkout = canonical(root);
  const factory = canonical(factoryRoot);
  if (
    inside(destination, checkout) ||
    inside(destination, factory) ||
    (!inside(factory, destination) && !inside(canonical(join(root, "tmp")), destination))
  )
    throw new Error("Execution receipt must remain in the isolated factory or checkout tmp");
  if (
    resolve(input)
      .split(/[\\/]/)
      .some(
        part =>
          [".ssh", ".codex", ".claude", ".aphrody", "cookies", "sessions"].includes(part) ||
          part === ".env" ||
          part.startsWith(".env.") ||
          /^(?:auth|credentials|tokens)\./i.test(part) ||
          /\.(?:pem|key|p12|sqlite|safetensors|gguf)$/i.test(part),
      )
  )
    throw new Error("Protected execution receipt path");
  if (existsSync(input) && lstatSync(input).isSymbolicLink())
    throw new Error("Execution receipt must not be a symlink");
  if (inside(checkout, destination) && existsSync(join(root, ".git"))) {
    const tracked = Bun.spawnSync(["git", "ls-files", "--error-unmatch", "--", relative(checkout, destination)], {
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
    });
    if (tracked.exitCode === 0) throw new Error("Execution receipt must not overwrite tracked source");
  }
  if (existsSync(destination)) {
    if (options.allowPlainFile) return destination;
    const previous = await Bun.file(destination)
      .json()
      .catch(() => undefined);
    const validExecutionReceipt = previous?.schema === 1 && previous.source && Array.isArray(previous.steps);
    const validJobReceipt =
      previous?.schema === 1 &&
      options.allowJobId === previous.id &&
      typeof previous.id === "string" &&
      /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,95}$/.test(previous.id) &&
      /^[a-f0-9]{64}$/.test(previous.inputHash) &&
      Array.isArray(previous.args);
    if (!validExecutionReceipt && !validJobReceipt)
      throw new Error("Execution receipt must not overwrite unrelated data");
  }
  return destination;
}

export async function canResumeStep(
  root: string,
  source: Inventory["source"],
  step: Step,
  snapshotHash: string,
  prerequisites: string[],
  receipt: ExecutionReceipt,
) {
  if (!receipt?.source || !Array.isArray(receipt.steps)) return false;
  const entry = receipt.steps.find(item => item.id === step.id);
  if (
    receipt.schema !== 1 ||
    !/^[a-f0-9]{64}$/.test(snapshotHash) ||
    receipt.source.revision !== source.revision ||
    receipt.source.rootTree !== source.rootTree ||
    receipt.source.version !== source.version ||
    receipt.snapshotHash !== snapshotHash ||
    receipt.host !== step.execution?.host ||
    receipt.target !== step.execution?.target ||
    !entry ||
    entry.state !== "completed" ||
    entry.exitCode !== 0 ||
    !entry.outputs.length ||
    entry.inputHash !== executionInputHash(source, step, snapshotHash, prerequisites)
  )
    return false;
  try {
    const checkout = realpathSync(root);
    const seen = new Set<string>();
    for (const output of entry.outputs) {
      if (isAbsolute(output.path) || seen.has(output.path) || !/^[a-f0-9]{64}$/.test(output.sha256)) return false;
      seen.add(output.path);
      const file = realpathSync(resolve(root, output.path));
      const path = relative(checkout, file);
      if (!path || isAbsolute(path) || path === ".." || path.startsWith("../") || path.startsWith("..\\")) return false;
      if (sha256(new Uint8Array(await Bun.file(file).arrayBuffer())) !== output.sha256) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function executeDeliveryPlan(
  root: string,
  source: Inventory["source"],
  steps: Step[],
  profile: FactoryHostProfile,
  options: { receiptPath: string; snapshotHash: string; resume?: boolean; signal?: AbortSignal },
) {
  options.signal?.throwIfAborted();
  options = {
    ...options,
    receiptPath: await validateExecutionReceiptPath(root, profile.factoryRoot, options.receiptPath),
  };
  const observationAge = Date.now() - Date.parse(profile.observedAt);
  if (
    !Number.isFinite(observationAge) ||
    observationAge < -30000 ||
    observationAge > 300000 ||
    !Number.isSafeInteger(profile.lightSlots) ||
    profile.lightSlots < 1 ||
    !Number.isSafeInteger(profile.heavySlots) ||
    profile.heavySlots < 1 ||
    profile.schema !== 1 ||
    profile.sourceTree !== source.rootTree ||
    !isAbsolute(profile.lockPath) ||
    !/^[a-f0-9]{64}$/.test(options.snapshotHash) ||
    [profile.cpu, profile.memoryMiB, profile.diskMiB, profile.reserveMemoryMiB, profile.reserveDiskMiB].some(
      value => !Number.isSafeInteger(value) || value <= 0,
    )
  )
    throw new Error("Invalid factory capacity, source tree or canonical lock");
  const receipt: ExecutionReceipt = {
    schema: 1,
    source,
    host: profile.host,
    target: profile.target,
    snapshotHash: options.snapshotHash,
    steps: [],
  };
  const previous =
    options.resume && (await Bun.file(options.receiptPath).exists())
      ? ((await Bun.file(options.receiptPath).json()) as ExecutionReceipt)
      : undefined;
  const pending = new Map(
    steps.map(original => {
      const directory = relative(realpathSync(root), realpathSync(resolve(root, original.directory)));
      if (isAbsolute(directory) || directory === ".." || directory.startsWith("../") || directory.startsWith("..\\"))
        throw new Error(`Delivery step directory escapes checkout: ${original.id}`);
      const heavy = /runtime|native-|cargo|crate|vendor/.test(original.id);
      const execution: ExecutionBudget = original.execution ?? {
        host: profile.host,
        target: profile.target,
        resourceClass: heavy ? "heavy" : "light",
        cpu: heavy ? profile.heavySlots : 1,
        memoryMiB: heavy ? profile.heavySlots * (profile.heavyMemoryMiB ?? 2048) : (profile.lightMemoryMiB ?? 512),
        diskMiB: 1024,
        ...(heavy ? { lockKey: profile.lockPath } : {}),
      };
      validateExecutionBudget(execution, profile);
      boundedExecutionCommand(original.command, execution.cpu);
      if (execution.resourceClass === "heavy" && process.platform === "win32")
        throw new Error(
          "Heavy factory dispatch requires the qualified Linux flock contract; use the native Windows build factory",
        );
      return [original.id, { ...original, execution }] as const;
    }),
  );
  if (pending.size !== steps.length) throw new Error("Duplicate delivery step IDs");
  const completed = new Map<string, string>();
  const active = new Map<string, { promise: Promise<void>; budget: ExecutionBudget }>();
  let failure: Error | undefined;
  let saving: Promise<unknown> = Promise.resolve();
  const save = () => {
    const contents = JSON.stringify(receipt, null, 2) + "\n";
    saving = saving.then(() => Bun.write(options.receiptPath, contents));
    return saving;
  };
  const execute = async (step: Step, prerequisites: string[]) => {
    const startedAt = new Date().toISOString();
    let exitCode = -1;
    try {
      const bounded = boundedExecutionCommand(step.command, step.execution!.cpu);
      const original = bounded[0] === "bun" ? [process.execPath, ...bounded.slice(1)] : bounded;
      let command = original;
      if (step.execution!.resourceClass === "heavy") {
        mkdirSync(dirname(profile.lockPath), { recursive: true });
        command = ["flock", "--exclusive", profile.lockPath, ...original];
      }
      const child = Bun.spawn(command, {
        cwd: resolve(root, step.directory),
        stdout: "inherit",
        stderr: "inherit",
        ...(options.signal ? { signal: options.signal } : {}),
        env: {
          ...process.env,
          CARGO_BUILD_JOBS: String(step.execution!.cpu),
          CMAKE_BUILD_PARALLEL_LEVEL: String(step.execution!.cpu),
        },
      });
      exitCode = await child.exited;
      if (exitCode) throw new Error(`Delivery step failed: ${step.id} (${exitCode})`);
      const inputHash = executionInputHash(source, step, options.snapshotHash, prerequisites);
      const outputs: { path: string; sha256: string }[] = [];
      for (const path of step.outputs ?? []) {
        const canonical = realpathSync(resolve(root, path));
        const scoped = relative(realpathSync(root), canonical);
        if (
          isAbsolute(path) ||
          !scoped ||
          isAbsolute(scoped) ||
          scoped === ".." ||
          scoped.startsWith("../") ||
          scoped.startsWith("..\\")
        )
          throw new Error(`Delivery output escapes checkout: ${path}`);
        outputs.push({
          path,
          sha256: sha256(new Uint8Array(await Bun.file(canonical).arrayBuffer())),
        });
      }
      receipt.steps.push({
        id: step.id,
        inputHash,
        state: "completed",
        exitCode,
        outputs,
        startedAt,
        endedAt: new Date().toISOString(),
      });
      completed.set(step.id, inputHash);
    } catch (error) {
      receipt.steps.push({
        id: step.id,
        inputHash: executionInputHash(source, step, options.snapshotHash, prerequisites),
        state: "failed",
        exitCode,
        outputs: [],
        startedAt,
        endedAt: new Date().toISOString(),
      });
      failure ??= error instanceof Error ? error : new Error(String(error));
    } finally {
      await save();
    }
  };
  while (pending.size || active.size) {
    if (options.signal?.aborted) failure ??= new Error("Delivery cancelled", { cause: options.signal.reason });
    if (!failure)
      for (const [id, original] of pending) {
        if (!original.requires.every(required => completed.has(required))) continue;
        const budget = original.execution;
        const step = { ...original, execution: budget };
        const prerequisites = step.requires.map(required => completed.get(required)!);
        if (previous && (await canResumeStep(root, source, step, options.snapshotHash, prerequisites, previous))) {
          const entry = previous.steps.find(item => item.id === id)!;
          receipt.steps.push(entry);
          completed.set(id, entry.inputHash);
          pending.delete(id);
          await save();
          continue;
        }
        const running = [...active.values()].map(item => item.budget);
        const disk = statfsSync(root);
        const availableDiskMiB = Math.floor((Number(disk.bavail) * Number(disk.bsize)) / 1048576);
        if (
          (running.some(item => item.resourceClass === "heavy") && budget.resourceClass === "heavy") ||
          (running.filter(item => item.resourceClass === "light").length >= profile.lightSlots &&
            budget.resourceClass === "light") ||
          running.reduce((total, item) => total + item.cpu, budget.cpu) > profile.cpu ||
          running.reduce((total, item) => total + item.memoryMiB, budget.memoryMiB) >
            profile.memoryMiB - profile.reserveMemoryMiB ||
          running.reduce((total, item) => total + item.diskMiB, budget.diskMiB) >
            profile.diskMiB - profile.reserveDiskMiB ||
          budget.diskMiB > availableDiskMiB - profile.reserveDiskMiB ||
          budget.memoryMiB > Math.floor(freemem() / 1048576) - profile.reserveMemoryMiB
        )
          continue;
        pending.delete(id);
        const promise = execute(step, prerequisites).finally(() => {
          active.delete(id);
        });
        active.set(id, { promise, budget });
      }
    if (!active.size) {
      if (failure) break;
      if (pending.size) throw new Error("Delivery dependencies or live resource capacity prevent progress");
    } else {
      try {
        await Promise.race([...active.values()].map(item => item.promise));
      } catch (error) {
        failure ??= error instanceof Error ? error : new Error(String(error));
      }
    }
  }
  if (failure) throw failure;
  await save();
  return receipt;
}

export function dependencyOrder<T extends { name: string; dependencies: string[] }>(products: T[]): T[] {
  if (new Set(products.map(p => p.name)).size !== products.length) throw new Error("Duplicate product names");
  const pending = new Map(products.map(p => [p.name, p]));
  const ordered: T[] = [];
  while (pending.size) {
    const ready = [...pending.values()]
      .filter(p => p.dependencies.every(d => !pending.has(d)))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (!ready.length) throw new Error(`Dependency cycle: ${[...pending.keys()].sort().join(", ")}`);
    for (const p of ready) {
      ordered.push(p);
      pending.delete(p.name);
    }
  }
  return ordered;
}

export function inventory(root: string, ref = "HEAD"): Inventory {
  const tree = new GitTree(root, ref);
  const paths = [...tree.files.keys()].filter(p => {
    if (
      !/(^|\/)(package\.json|Cargo\.toml|Cargo\.lock|bun\.lockb?|package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/.test(
        p,
      )
    )
      return false;
    if (!p.includes("/")) return true;
    if (/(?:^|\/)(?:test|tests|fixtures|examples|benches|benchmark)(?:\/|$)/.test(p)) return false;
    if (p.endsWith("package.json"))
      return /^packages\/[^/]+\/package\.json$/.test(p) || /^packages\/[^/]+\/npm\/[^/]+\/package\.json$/.test(p);
    return /^(?:packages|vendor|src)\//.test(p);
  });
  const texts = tree.read(paths.filter(p => !p.endsWith("bun.lockb")));
  const products: Product[] = [];
  const npmDependencies: Inventory["npmDependencies"] = [];
  const repositories = new Map<string, Set<string>>();
  const external: Inventory["external"] = [];
  const npmAdapters = new Map(PACKAGES.map(p => [`packages/${p.dir}/package.json`, "publish-npm"]));
  const npmNames = new Map(PACKAGES.map(p => [`packages/${p.dir}/package.json`, npmName(p)]));
  const workspaces = new Map<string, Manifest>();
  for (const [path, text] of texts) {
    if (path.endsWith("Cargo.toml")) {
      const document = Bun.TOML.parse(text) as Manifest;
      if (document.workspace) workspaces.set(dirname(path).replaceAll("\\", "/"), document.workspace);
    }
  }
  const workspaceFor = (path: string): Manifest => {
    let directory = dirname(path).replaceAll("\\", "/");
    while (true) {
      if (workspaces.has(directory)) return workspaces.get(directory)!;
      if (directory === ".") return {};
      directory = dirname(directory).replaceAll("\\", "/");
    }
  };
  for (const path of paths.sort()) {
    const text = texts.get(path);
    if (!text) continue;
    if (path.endsWith("Cargo.lock")) {
      const document = Bun.TOML.parse(text) as Manifest;
      for (const p of document.package ?? []) {
        if (p.source)
          external.push({
            ecosystem: "cargo",
            name: p.name,
            version: p.version,
            source: p.source,
            checksum: p.checksum ?? null,
            lock: path,
          });
      }
      continue;
    }
    if (!path.endsWith("package.json") && !path.endsWith("Cargo.toml")) continue;
    const document = path.endsWith("package.json") ? JSON.parse(text) : (Bun.TOML.parse(text) as Manifest);
    const cargo = path.endsWith("Cargo.toml");
    const workspace = cargo ? workspaceFor(path) : {};
    const pkg = cargo ? document.package : document;
    if (!cargo)
      for (const section of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
        for (const [name, specification] of Object.entries(document[section] ?? {})) {
          npmDependencies.push({
            manifest: path,
            section,
            name,
            specification: String(specification),
          });
        }
      }
    const vendor = /^vendor\/[^/]+/.exec(path)?.[0];
    if (vendor) {
      const repo =
        typeof pkg?.repository === "string"
          ? pkg.repository
          : pkg?.repository?.workspace
            ? workspace.package?.repository
            : (document.workspace?.package?.repository ?? null);
      if (repo) {
        const entries = repositories.get(vendor) ?? new Set<string>();
        entries.add(repo);
        repositories.set(vendor, entries);
      }
    }
    if (!pkg?.name) continue;
    const deps = {
      ...document.dependencies,
      ...document["build-dependencies"],
      ...document.optionalDependencies,
      ...document.peerDependencies,
    };
    const dependencyNames = Object.entries(deps).map(([name, spec]) => {
      if (cargo && spec && typeof spec === "object") {
        const dependency = spec as Manifest;
        return dependency.package ?? (dependency.workspace ? workspace.dependencies?.[name]?.package : null) ?? name;
      }
      return name;
    });
    const version =
      typeof pkg.version === "string"
        ? pkg.version
        : cargo && pkg.version?.workspace
          ? (workspace.package?.version ?? null)
          : null;
    products.push({
      name: pkg.name,
      version,
      manifest: path,
      kind: cargo ? "cargo" : "npm",
      private: cargo ? pkg.publish === false : pkg.private === true,
      dependencies: dependencyNames.sort(),
      adapter: cargo ? cargoPublishAdapter(path, pkg.name) : (npmAdapters.get(path) ?? null),
      build: !cargo && typeof document.scripts?.build === "string" ? document.scripts.build : null,
      publishedName: cargo ? cargoPublishedName(path, pkg.name) : (npmNames.get(path) ?? null),
    });
  }
  const vendors = [
    ...new Set([...tree.files.keys()].map(p => /^vendor\/[^/]+/.exec(p)?.[0]).filter((p): p is string => !!p)),
  ]
    .sort()
    .map(path => ({
      path,
      tree: git(root, ["rev-parse", `${tree.sha}:${path}`]).trim(),
      repositories: [...(repositories.get(path) ?? [])].sort(),
      adapter: VENDORS.includes(path.slice(7) as (typeof VENDORS)[number]) ? "publish-vendors" : null,
    }));
  const nativeRecipes = [...tree.read(tree.list("scripts/build/deps/*.ts"))].map(([path, text]) => ({
    path,
    sha256: sha256(text),
    repositories: [
      ...new Set(
        [
          ...text.matchAll(/https:\/\/github\.com\/([\w.-]+\/[\w.-]+)/g),
          ...text.matchAll(/\b\w*REPO\w*\s*=\s*["']([\w.-]+\/[\w.-]+)["']/g),
        ].map(m => `https://github.com/${m[1]}`),
      ),
    ].sort(),
    commitPins: [...new Set([...text.matchAll(/["']([a-f0-9]{40})["']/g)].map(m => m[1]!))].sort(),
  }));
  return {
    schema: 1,
    source: {
      revision: tree.sha,
      date: tree.date,
      version: JSON.parse(texts.get("package.json") ?? "{}").version ?? "unknown",
      rootTree: git(root, ["rev-parse", `${tree.sha}^{tree}`]).trim(),
    },
    locks: paths
      .filter(p => /(?:lock|lockb|lock\.json|lock\.yaml)$/.test(p))
      .map(path => ({
        path,
        blob: tree.files.get(path)!,
        sha256: texts.has(path)
          ? sha256(texts.get(path)!)
          : sha256(Bun.spawnSync(["git", "-C", root, "show", `${tree.sha}:${path}`]).stdout),
      })),
    products,
    vendors,
    external,
    npmDependencies,
    nativeRecipes,
    artifactPipelines: tree
      .list(".github/workflows/aphrody-*.yml")
      .filter(path => /(?:release|publish-native|publish-mdx-rs|publish-web-inspector)\.yml$/.test(path))
      .map(workflow => ({
        workflow,
        blob: tree.files.get(workflow)!,
        status: "requires-qualified-platform-artifacts",
      })),
  };
}

export function plan(
  data: Inventory,
  operation: "build" | "release-check" | "release-publish",
  root = process.cwd(),
): { steps: Step[]; unsupported: Product[] } {
  const needsPlatformArtifacts = (p: Product) =>
    /^packages\/bun-build-mdx-rs(?:\/|$)/.test(p.manifest) ||
    /^packages\/bun-(?:n2b|oxc|inspector-frontend)\//.test(p.manifest);
  const steps: Step[] = [
    {
      id: "dependencies",
      command: ["bun", "install", "--frozen-lockfile"],
      directory: ".",
      requires: [],
    },
  ];
  if (operation === "build") {
    steps.push({
      id: "runtime",
      command: ["bun", "run", "build:release"],
      directory: ".",
      requires: ["dependencies"],
    });
    steps.push({
      id: "native-targets",
      command: ["bun", "run", "rust:check-all"],
      directory: ".",
      requires: ["runtime"],
    });
    steps.push({
      id: "native-clippy",
      command: ["bun", "run", "rust:clippy", "--locked", "--", "-D", "warnings"],
      directory: ".",
      requires: ["native-targets"],
    });
    const npm = data.products.filter(
      p => p.kind === "npm" && !p.manifest.startsWith("vendor/") && p.build && p.manifest !== "package.json",
    );
    for (const p of dependencyOrder(npm))
      steps.push({
        id: `npm:${p.name}`,
        command: ["bun", "run", "build"],
        directory: dirname(p.manifest),
        requires: ["dependencies", ...p.dependencies.filter(d => npm.some(q => q.name === d)).map(d => `npm:${d}`)],
      });
    for (const p of data.products.filter(
      p => p.kind === "npm" && !p.private && p.manifest !== "package.json" && !needsPlatformArtifacts(p),
    )) {
      steps.push({
        id: `pack:${p.name}`,
        command: [
          "bun",
          "pm",
          "pack",
          "--ignore-scripts",
          "--destination",
          resolve(root, "tmp/monorepo-delivery-packages"),
        ],
        directory: dirname(p.manifest),
        requires: ["native-clippy", ...npm.filter(q => q.name === p.name).map(q => `npm:${q.name}`)],
      });
    }
  } else {
    for (const vendor of data.vendors.filter(v => v.adapter))
      steps.push({
        id: vendor.path,
        command: [
          "bun",
          "scripts/aphrody/publish-vendors.ts",
          "--vendor",
          vendor.path.slice(7),
          operation === "release-publish" ? "--publish" : "--gate",
        ],
        directory: ".",
        requires: ["dependencies"],
      });
    steps.push({
      id: "crates",
      command: ["bun", "scripts/aphrody/publish-crates.ts", ...(operation === "release-publish" ? ["--publish"] : [])],
      directory: ".",
      requires: steps.filter(s => s.id.startsWith("vendor/")).map(s => s.id),
    });
    steps.push({
      id: "npm",
      command: [
        "bun",
        "scripts/aphrody/publish-npm.ts",
        "--stable",
        "--report",
        resolve(root, "tmp/monorepo-delivery-publication.json"),
        ...(operation === "release-check" ? ["--dry-run"] : []),
      ],
      directory: ".",
      requires: ["dependencies"],
    });
  }
  return {
    steps,
    unsupported: data.products.filter(
      p => !p.private && !p.adapter && (operation !== "build" || (p.kind === "npm" && needsPlatformArtifacts(p))),
    ),
  };
}

export type PublishedPackage = {
  name: string;
  version: string;
  tarball: string;
  integrity: string;
  sourceRevision: string;
};

export function sourceQualified(
  revision: string,
  record: { name: string; version: string; dist: { integrity: string }; gitHead?: string },
  receipt?: {
    sourceRevision?: string;
    packages?: {
      name: string;
      version: string;
      sourceRevision?: string;
      sourceVerified?: boolean;
      integrity?: string;
      action?: string;
      contentHash?: string;
    }[];
  },
): boolean {
  if (record.gitHead === revision) return true;
  return (
    receipt?.sourceRevision === revision &&
    !!receipt.packages?.some(
      p =>
        p.name === record.name &&
        p.version === record.version &&
        p.sourceRevision === revision &&
        p.sourceVerified === true &&
        ["published", "unchanged"].includes(p.action ?? "") &&
        /^[a-f0-9]{64}$/.test(p.contentHash ?? "") &&
        p.integrity === record.dist.integrity,
    )
  );
}
export function verifyIntegrity(bytes: Uint8Array, integrity: string): void {
  const matches = integrity.split(/\s+/).some(entry => {
    const match = /^(sha256|sha384|sha512)-([A-Za-z0-9+/=]+)$/.exec(entry);
    return !!match && createHash(match[1]!).update(bytes).digest("base64") === match[2];
  });
  if (!matches) throw new Error("Published artifact integrity mismatch or unsupported digest");
}

export async function publishedPackages(
  data: Inventory,
  qualification?: Parameters<typeof sourceQualified>[2],
): Promise<{
  packages: PublishedPackage[];
  unavailable: { name: string; version: string | null; reason: string }[];
}> {
  const packages: PublishedPackage[] = [];
  const unavailable: { name: string; version: string | null; reason: string }[] = [];
  const npm = data.products.filter(p => p.kind === "npm" && !p.private && p.adapter);
  for (const product of data.products.filter(p => p.kind === "npm" && !p.private && !p.adapter))
    unavailable.push({
      name: product.name,
      version: product.version,
      reason: "No qualified publication adapter in this pipeline; source declarations are not release artifacts",
    });
  for (const product of npm) {
    if (!product.version) {
      unavailable.push({ name: product.name, version: null, reason: "No concrete source version" });
      continue;
    }
    const name = product.publishedName!;
    const response = await fetch(
      `https://registry.npmjs.org/${encodeURIComponent(name)}/${encodeURIComponent(product.version)}`,
    );
    if (response.status === 404) {
      unavailable.push({
        name: product.name,
        version: product.version,
        reason: "Exact source version not published",
      });
      continue;
    }
    if (!response.ok) throw new Error(`Registry ${product.name}: HTTP ${response.status}`);
    const record = (await response.json()) as Manifest;
    if (record.name !== name || record.version !== product.version || !record.dist?.integrity || !record.dist?.tarball)
      throw new Error(`Incomplete registry provenance: ${name}`);
    if (!sourceQualified(data.source.revision, record as Parameters<typeof sourceQualified>[1], qualification)) {
      unavailable.push({
        name,
        version: product.version,
        reason: "Registry artifact source equivalence has not been qualified",
      });
      continue;
    }
    packages.push({
      name,
      version: product.version,
      tarball: record.dist.tarball,
      integrity: record.dist.integrity,
      sourceRevision: data.source.revision,
    });
  }
  return { packages, unavailable };
}

export async function upstreamReport(data: Inventory, root: string) {
  const upstream = git(root, ["remote", "get-url", "upstream"]).trim();
  const urls = [
    ...new Set([
      upstream,
      ...data.vendors.flatMap(v => v.repositories),
      ...data.nativeRecipes.flatMap(r => r.repositories),
    ]),
  ].filter(url => /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(?:\.git)?\/?$/.test(url));
  const entries: { url: string; observedHead: string | null; error: string | null }[] = [];
  for (const url of urls) {
    const process = Bun.spawnSync(["git", "ls-remote", url, "HEAD"], {
      stdout: "pipe",
      stderr: "pipe",
      timeout: 30000,
    });
    entries.push({
      url,
      observedHead: process.success ? (process.stdout.toString().trim().split(/\s+/)[0] ?? null) : null,
      error: process.success ? null : process.stderr.toString().trim(),
    });
  }
  return {
    sourceRevision: data.source.revision,
    observedAt: new Date().toISOString(),
    entries,
    policy:
      "Observed remote HEAD never changes vendored trees or dependency locks. Source tree IDs are local immutable pins, not upstream commit claims.",
  };
}

export async function main(args = Bun.argv.slice(2)) {
  const { values } = parseArgs({
    args,
    options: {
      root: { type: "string", default: resolve(import.meta.dir, "../..") },
      ref: { type: "string", default: "HEAD" },
      operation: { type: "string", default: "inventory" },
      out: { type: "string" },
      apply: { type: "boolean" },
      "check-upstream": { type: "boolean" },
      "check-registry": { type: "boolean" },
      "allow-partial": { type: "boolean" },
      manifest: { type: "string" },
      qualification: { type: "string" },
      target: { type: "string" },
      profile: { type: "string" },
      resume: { type: "boolean" },
      "execution-receipt": { type: "string" },
      "snapshot-hash": { type: "string" },
      "profile-hash": { type: "string" },
      "manifest-hash": { type: "string" },
      "target-hash": { type: "string" },
      detach: { type: "boolean" },
      status: { type: "boolean" },
      job: { type: "string" },
      "run-job": { type: "string" },
    },
  });
  const root = resolve(values.root!);
  if (values["run-job"]) {
    await runDeliveryJob(root, values["run-job"]);
    return;
  }
  if (values.status) {
    if (!values.job) throw new Error("Status requires --job ID");
    const job = await readDeliveryJob(root, values.job);
    const output = JSON.stringify(job, null, 2) + "\n";
    if (values.out) await Bun.write(resolve(values.out), output);
    else console.log(output);
    return job;
  }
  const data = inventory(root, values.ref);
  const operation = values.operation!;
  if (!["inventory", "build", "release-check", "release-publish", "install"].includes(operation))
    throw new Error(`Unknown operation: ${operation}`);
  if (values.detach && (!values.apply || operation === "inventory"))
    throw new Error("Detached delivery requires --apply and a mutating operation");
  const report: Manifest = { inventory: data };
  if (values["check-upstream"]) report.upstreams = await upstreamReport(data, root);
  if (values["check-registry"])
    report.installation = await publishedPackages(
      data,
      values.qualification ? await Bun.file(resolve(values.qualification)).json() : undefined,
    );
  if (["build", "release-check", "release-publish"].includes(operation)) {
    report.plan = plan(data, operation as "build" | "release-check" | "release-publish", root);
    if (values.apply) {
      if (
        git(root, ["rev-parse", "HEAD"]).trim() !== data.source.revision ||
        git(root, ["status", "--porcelain"]).trim()
      )
        throw new Error("Apply requires the selected revision and a clean owned checkout");
      if (report.plan.unsupported.length && !values["allow-partial"])
        throw new Error(
          "Products without qualified adapters: inspect plan; --allow-partial explicitly selects the supported subset",
        );
      if (values.profile) {
        if (!values["snapshot-hash"] || !/^[a-f0-9]{64}$/.test(values["snapshot-hash"]))
          throw new Error("Factory execution requires --snapshot-hash SHA256");
        const profile = (await Bun.file(resolve(values.profile)).json()) as FactoryHostProfile;
        if (
          values["profile-hash"] &&
          sha256(new Uint8Array(await Bun.file(resolve(values.profile)).arrayBuffer())) !== values["profile-hash"]
        )
          throw new Error("Factory profile changed after detached job submission");
        if (values.detach) {
          const jobArgs: string[] = [
            "--root",
            root,
            "--operation",
            operation,
            "--apply",
            "--profile",
            resolve(values.profile),
            "--snapshot-hash",
            values["snapshot-hash"]!,
            "--profile-hash",
            sha256(new Uint8Array(await Bun.file(resolve(values.profile)).arrayBuffer())),
          ];
          if (values["allow-partial"]) jobArgs.push("--allow-partial");
          if (values.resume) jobArgs.push("--resume");
          if (values.qualification) jobArgs.push("--qualification", resolve(values.qualification));
          report.job = await submitDeliveryJob(root, data.source, operation, jobArgs, values.job);
        } else {
          report.execution = await executeDeliveryPlan(root, data.source, report.plan.steps, profile, {
            receiptPath: resolve(values["execution-receipt"] ?? join(root, "tmp/delivery-execution.json")),
            snapshotHash: values["snapshot-hash"],
            resume: values.resume ?? false,
          });
        }
      } else {
        if (values.detach) throw new Error("Detached factory work requires --profile and --snapshot-hash");
        if (values.resume) throw new Error("Resume requires a qualified factory profile");
        for (const step of report.plan.steps as Step[]) {
          if (step.id.startsWith("pack:"))
            mkdirSync(resolve(root, "tmp/monorepo-delivery-packages"), { recursive: true });
          const command = step.command[0] === "bun" ? [process.execPath, ...step.command.slice(1)] : step.command;
          const child = Bun.spawn(command, {
            cwd: resolve(root, step.directory),
            stdout: "inherit",
            stderr: "inherit",
          });
          if (await child.exited) throw new Error(`Delivery step failed: ${step.id}`);
        }
      }
    }
  }
  if (operation === "install") {
    if (!values.manifest || !values.target)
      throw new Error("Install requires --manifest qualified registry report and --target exact consumer directory");
    const manifestPath = resolve(values.manifest);
    const manifestBytes = new Uint8Array(await Bun.file(manifestPath).arrayBuffer());
    const manifestHash = sha256(manifestBytes);
    if (values["manifest-hash"] && manifestHash !== values["manifest-hash"])
      throw new Error("Installation manifest changed after detached job submission");
    const lock = JSON.parse(new TextDecoder().decode(manifestBytes)) as Manifest;
    const selected = lock.installation as Awaited<ReturnType<typeof publishedPackages>>;
    if (!selected || lock.inventory?.source?.revision !== data.source.revision)
      throw new Error("Installation manifest source revision mismatch");
    if (selected.unavailable.length && !values["allow-partial"])
      throw new Error("Unavailable exact-version artifacts; --allow-partial explicitly selects published subset");
    if (!selected.packages.length) throw new Error("No published packages selected");
    const target = resolve(values.target);
    report.install = {
      target,
      packages: selected.packages.map(p => `${p.name}@${p.version}`),
      unavailable: selected.unavailable,
    };
    if (values.detach) {
      const targetHash = await installTargetSnapshotHash(target);
      if (values["target-hash"] && targetHash !== values["target-hash"])
        throw new Error("Install target manifests changed after detached job submission");
      const jobArgs = [
        "--root",
        root,
        "--operation",
        "install",
        "--manifest",
        manifestPath,
        "--manifest-hash",
        manifestHash,
        "--target",
        target,
        "--target-hash",
        targetHash,
        "--apply",
      ];
      if (values["allow-partial"]) jobArgs.push("--allow-partial");
      report.job = await submitDeliveryJob(root, data.source, operation, jobArgs, values.job);
    } else if (values.apply) {
      mkdirSync(target, { recursive: true });
      const artifactDirectory = join(target, ".bun-delivery");
      mkdirSync(artifactDirectory, { recursive: true });
      if (!lstatSync(artifactDirectory).isDirectory() || lstatSync(artifactDirectory).isSymbolicLink())
        throw new Error("Install artifact directory must be a real directory");
      const installLock = join(artifactDirectory, "install.lock");
      try {
        writeFileSync(installLock, `${values.job ?? `pid-${process.pid}`}\n`, { flag: "wx" });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST")
          throw new Error("Install target is locked by another or unreconciled delivery job");
        throw error;
      }
      try {
        if (values["target-hash"] && (await installTargetSnapshotHash(target)) !== values["target-hash"])
          throw new Error("Install target manifests changed before the worker acquired its lock");
        const artifacts: string[] = [];
        for (const p of selected.packages) {
          if (p.sourceRevision !== data.source.revision || !p.tarball.startsWith("https://registry.npmjs.org/"))
            throw new Error(`Unqualified artifact: ${p.name}`);
          const response = await fetch(p.tarball);
          if (!response.ok) throw new Error(`Artifact ${p.name}: HTTP ${response.status}`);
          const bytes = new Uint8Array(await response.arrayBuffer());
          verifyIntegrity(bytes, p.integrity);
          const file = join(artifactDirectory, `${sha256(bytes)}.tgz`);
          await Bun.write(file, bytes);
          artifacts.push(file);
        }
        const child = Bun.spawn([process.execPath, "add", "--exact", ...artifacts], {
          cwd: target,
          stdout: "inherit",
          stderr: "inherit",
        });
        if (await child.exited) throw new Error("Consumer installation failed");
      } finally {
        unlinkSync(installLock);
      }
    }
  }
  const output = JSON.stringify(report, null, 2) + "\n";
  if (values.out) await Bun.write(resolve(values.out), output);
  else console.log(output);
  return report;
}

if (import.meta.main) await main();
