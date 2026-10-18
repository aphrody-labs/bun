#!/usr/bin/env bun
import { createHash } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, readSync, realpathSync, statfsSync, writeSync } from "node:fs";
import { hostname } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import factory from "../../tools/config/fusion-factory.json";
import { validateExecutionBudget, validateExecutionReceiptPath } from "./monorepo-delivery.ts";
import type { FactoryHostProfile } from "./build-host.ts";
import {
  collectFusionSources,
  summarizeOfficialHtml,
  type FusionSourcePlan,
  type ResearchSummary,
} from "./fusion-sources.ts";

export type FusionStep = {
  id: string;
  requires: string[];
  scope: string[];
  command: string[];
  kind: "heavy" | "light";
  required: boolean;
  allOnly?: boolean;
  minimumPasses?: number;
  maximumSkips?: number;
  env?: Record<string, string>;
};
export type FusionConfig = {
  schema: 1;
  vpsHostnames: string[];
  factory: { resource: string; cargoWrapper: string };
  execution?: { maxCpu: number; cargoTargetDir: string };
  research: string[];
  pipeline: string;
  steps: FusionStep[];
};
type State = "passed" | "failed" | "blocked";
export type StepReceipt = {
  id: string;
  inputHash: string;
  state: State;
  exitCode: number | null;
  log: string | null;
  logSha256?: string;
  diagnosticPaths: string[];
  reason?: string;
  startedAt: string;
  endedAt: string;
  reused?: boolean;
};
type ResearchReceipt = {
  url: string;
  fetchedAt: string;
  status: number;
  sha256: string | null;
  summary?: ResearchSummary;
  error?: string;
};
type Journal = {
  schema: 1;
  revision: string;
  sourceHash: string;
  configHash: string;
  mode: "all" | "changed";
  coverage: { selected: string[]; omitted: string[]; crossPlatformCI: "required" | "not-claimed" };
  research: ResearchReceipt[];
  sourcePlan: FusionSourcePlan;
  steps: StepReceipt[];
  crossPlatformCI: { state: State; reason: string };
};
const sha256 = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const MAX_FACTORY_CPU = 6;
const CARGO_FACTORY_TARGET = `${factory.cacheRoot}/cargo`;
export type GateResourceObservation = {
  filesystemType: bigint;
  availableDiskMiB: number;
  availableMemoryMiB: number;
};
export function resourceBlockReason(observation: GateResourceObservation): string | undefined {
  if (observation.filesystemType <= 0n || [0x01021994n, 0x858458f6n].includes(observation.filesystemType))
    return "Cargo cache filesystem is not qualified as persistent (tmpfs/ramfs/unknown)";
  if (!Number.isFinite(observation.availableDiskMiB) || observation.availableDiskMiB < 8192)
    return `Cargo cache has ${observation.availableDiskMiB} MiB available; at least 8192 MiB is required`;
  if (!Number.isFinite(observation.availableMemoryMiB) || observation.availableMemoryMiB < 2048)
    return `VPS MemAvailable is ${observation.availableMemoryMiB} MiB; at least 2048 MiB is required`;
  return undefined;
}
function observeGateResources(): GateResourceObservation {
  const cache = realpathSync(CARGO_FACTORY_TARGET);
  if (cache !== CARGO_FACTORY_TARGET) throw new Error("Cargo cache must resolve to its declared dedicated allocation");
  const filesystem = statfsSync(cache, { bigint: true });
  const descriptor = openSync("/proc/meminfo", "r");
  const buffer = Buffer.alloc(16 * 1024);
  let length: number;
  try {
    length = readSync(descriptor, buffer, 0, buffer.length, null);
  } finally {
    closeSync(descriptor);
  }
  if (length === buffer.length) throw new Error("/proc/meminfo exceeds its bounded observation buffer");
  const available = /^MemAvailable:\s+(\d+)\s+kB$/m.exec(buffer.toString("utf8", 0, length));
  if (!available) throw new Error("Cannot inspect VPS MemAvailable from /proc/meminfo");
  return {
    filesystemType: filesystem.type,
    availableDiskMiB: Number((filesystem.bavail * filesystem.bsize) / 1048576n),
    availableMemoryMiB: Number(available[1]) / 1024,
  };
}
function git(root: string, args: string[]): string {
  const child = Bun.spawnSync(["git", ...args], { cwd: root, stdout: "pipe", stderr: "pipe" });
  if (child.exitCode !== 0) throw new Error(`git ${args[0]} failed: ${child.stderr.toString().trim()}`);
  return child.stdout.toString();
}
export function gateFlags(step: FusionStep): Record<string, string> {
  const flags = step.env ?? {};
  for (const [name, value] of Object.entries(flags)) {
    if (
      !["BUN_LIVE_WEBSITE_TEST", "BUN_SYSTEM_DEB_TEST_ROOT", "BUN_JSC_validateExceptionChecks"].includes(name) ||
      !["0", "1"].includes(value)
    )
      throw new Error(`Unsupported qualification flag ${name}`);
  }
  return flags;
}
export function orderSteps(steps: FusionStep[]): FusionStep[] {
  for (const step of steps) gateFlags(step);
  const byId = new Map(steps.map(step => [step.id, step]));
  if (byId.size !== steps.length) throw new Error("Duplicate step identity");
  const active = new Set<string>();
  const visited = new Set<string>();
  const result: FusionStep[] = [];
  function visit(id: string) {
    if (!/^[a-z][a-z0-9-]*$/.test(id)) throw new Error("Unsafe step identity");
    if (active.has(id)) throw new Error(`Dependency cycle at ${id}`);
    if (visited.has(id)) return;
    const step = byId.get(id);
    if (!step) throw new Error(`Missing dependency ${id}`);
    if (!step.command.length || !step.scope.length) throw new Error(`Empty command/scope ${id}`);
    active.add(id);
    for (const dependency of step.requires) visit(dependency);
    active.delete(id);
    visited.add(id);
    result.push(step);
  }
  for (const step of steps) visit(step.id);
  return result;
}
function matches(path: string, scope: string) {
  return path === scope || path.startsWith(`${scope.replace(/\/$/, "")}/`);
}
export function selectSteps(steps: FusionStep[], mode: "all" | "changed", changed: string[]) {
  const ordered = orderSteps(steps);
  if (mode === "all") return ordered;
  const selected = new Set(
    ordered
      .filter(step => !step.allOnly && changed.some(path => step.scope.some(scope => matches(path, scope))))
      .map(step => step.id),
  );
  // Add every prerequisite and every affected non-full-suite dependent until
  // the DAG reaches a fixed point. This is a finite graph, not a retry loop.
  let grew = true;
  while (grew) {
    grew = false;
    for (const step of ordered) {
      if (selected.has(step.id)) {
        for (const dependency of step.requires) {
          if (!selected.has(dependency)) {
            selected.add(dependency);
            grew = true;
          }
        }
      } else if (!step.allOnly && step.requires.some(id => selected.has(id))) {
        selected.add(step.id);
        grew = true;
      }
    }
  }
  return ordered.filter(step => selected.has(step.id));
}
export function mayRetry(previous: StepReceipt | undefined, inputHash: string) {
  return previous === undefined || previous.inputHash !== inputHash;
}
export function diagnosticPaths(output: string): string[] {
  return [
    ...new Set(
      [
        ...output.matchAll(
          /(?:^|\s|-->\s)((?:src|scripts|test|packages|docs)\/[\w./-]+\.(?:rs|ts|tsx|js|cpp|h|mdx?))(?::\d+)?/gm,
        ),
      ].map(match => match[1]!),
    ),
  ].sort();
}
export function testsQualified(step: FusionStep, output: string) {
  if (step.minimumPasses === undefined && step.maximumSkips === undefined) return true;
  const withoutAnsi = output.replace(/\x1b\[[0-9;]*m/g, "");
  const passed = [...withoutAnsi.matchAll(/(?:^|\n)\s*(\d+) pass\b/g)].at(-1);
  const skipped = [...withoutAnsi.matchAll(/(?:^|\n)\s*(\d+) skip\b/g)].at(-1);
  return (
    (step.minimumPasses === undefined || (!!passed && Number(passed[1]) >= step.minimumPasses)) &&
    (step.maximumSkips === undefined || Number(skipped?.[1] ?? 0) <= step.maximumSkips)
  );
}
export function assertVps(
  config: FusionConfig,
  profile: FactoryHostProfile,
  platform: string,
  host: string,
  root: string,
) {
  if (platform !== "linux" || !config.vpsHostnames.includes(host) || profile.host !== "vps")
    throw new Error("Execute is allowed only on the declared SSH VPS host");
  const age = Date.now() - Date.parse(profile.observedAt);
  if (!Number.isFinite(age) || age < -60_000 || age > 300_000)
    throw new Error("Factory profile requires a live observation within five minutes");
  const scoped = relative(realpathSync(profile.factoryRoot), realpathSync(root));
  if (isAbsolute(scoped) || scoped === ".." || scoped.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`))
    throw new Error("Checkout must reside inside the declared factory root");
  if (!profile.heavySlots || profile.target !== "linux-x64") throw new Error("VPS native slot unavailable");
  if (
    config.execution &&
    (!Number.isSafeInteger(config.execution.maxCpu) ||
      config.execution.maxCpu < 1 ||
      config.execution.maxCpu > MAX_FACTORY_CPU ||
      config.execution.cargoTargetDir !== CARGO_FACTORY_TARGET)
  )
    throw new Error("Fusion execution requires at most six CPUs and the declared factory Cargo cache");
  for (const path of Object.values(config.factory)) {
    if (!isAbsolute(path) || !existsSync(path)) throw new Error(`Missing declared factory owner: ${path}`);
  }
}
async function scopeHash(root: string, scope: string[]) {
  const hash = createHash("sha256");
  hash.update(git(root, ["rev-parse", "HEAD"]));
  hash.update(git(root, ["diff", "HEAD", "--binary", "--", ...scope]));
  const untracked = git(root, ["ls-files", "--others", "--exclude-standard", "-z", "--", ...scope])
    .split("\0")
    .filter(Boolean)
    .sort();
  for (const path of untracked) {
    hash.update(path);
    hash.update(await Bun.file(join(root, path)).bytes());
  }
  return hash.digest("hex");
}
export function factoryCommand(config: FusionConfig, step: FusionStep): string[] {
  const [program, ...args] = step.command;
  const command =
    program === "cargo"
      ? [process.execPath, config.factory.cargoWrapper, ...args]
      : program === "bun"
        ? [process.execPath, ...args]
        : step.command;
  return [
    process.execPath,
    config.factory.resource,
    "run",
    "--",
    ...command,
  ];
}
export async function research(urls: string[], fetcher: typeof fetch = fetch): Promise<ResearchReceipt[]> {
  const receipts: ResearchReceipt[] = [];
  for (const url of urls) {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.hostname !== "bun.sh")
      throw new Error("Research must use official Bun HTTPS sources");
    const fetchedAt = new Date().toISOString();
    try {
      const response = await fetcher(url, {
        signal: AbortSignal.timeout(20_000),
        redirect: "error",
      });
      const bytes = new Uint8Array(await response.arrayBuffer());
      receipts.push({
        url,
        fetchedAt,
        status: response.status,
        sha256: response.ok ? sha256(bytes) : null,
        ...(response.ok ? { summary: await summarizeOfficialHtml(url, new TextDecoder().decode(bytes)) } : {}),
      });
    } catch (error) {
      receipts.push({ url, fetchedAt, status: 0, sha256: null, error: String(error) });
    }
  }
  return receipts;
}
export async function fileHash(path: string) {
  const hash = createHash("sha256");
  const reader = Bun.file(path).stream().getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      hash.update(value);
    }
  } finally {
    reader.releaseLock();
  }
  return hash.digest("hex");
}
async function docsContent(root: string) {
  const paths = git(root, ["ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", "docs"])
    .split("\0")
    .filter(path => /\.(md|mdx)$/.test(path));
  const failures: string[] = [];
  for (const path of new Set(paths)) {
    const text = await Bun.file(join(root, path)).text();
    if (/^(?:<<<<<<< |>>>>>>> )/m.test(text)) failures.push(`${path}: unresolved merge marker`);
    if (/\t+\r?$/m.test(text) || /^.*\S(?: | {3,})\r?$/m.test(text))
      failures.push(`${path}: trailing whitespace (Markdown two-space breaks are allowed)`);
    // Rooted route links belong to the documentation router; this gate checks
    // only explicit relative file references, not remote/route rendering.
    for (const match of text.matchAll(/\]\((\.{1,2}\/[^\s)#]+)(?:#[^)]*)?\)/g)) {
      const target = resolve(root, dirname(path), decodeURIComponent(match[1]!));
      if (
        ![target, `${target}.mdx`, `${target}.md`, join(target, "index.mdx"), join(target, "index.md")].some(existsSync)
      )
        failures.push(`${path}: missing relative reference ${match[1]}`);
    }
  }
  console.log(
    JSON.stringify(
      {
        checkedFiles: paths.length,
        coverage: "content and explicit relative file links; not MDX compilation",
        failures,
      },
      null,
      2,
    ),
  );
  return failures.length ? 1 : 0;
}
export async function main(argv = process.argv.slice(2)) {
  const { values } = parseArgs({
    args: argv,
    options: {
      root: { type: "string" },
      config: { type: "string" },
      mode: { type: "string", default: "changed" },
      base: { type: "string" },
      execute: { type: "boolean", default: false },
      profile: { type: "string" },
      journal: { type: "string" },
      "ci-receipt": { type: "string" },
      "docs-only": { type: "boolean", default: false },
    },
  });
  if (values.mode !== "all" && values.mode !== "changed") throw new Error("mode must be all or changed");
  const root = resolve(values.root ?? join(import.meta.dir, "../.."));
  const configText = await Bun.file(resolve(values.config ?? join(import.meta.dir, "fusion-verification.json"))).text();
  const config = JSON.parse(configText) as FusionConfig;
  if (config.schema !== 1) throw new Error("Unsupported fusion config");
  config.factory.resource = resolve(root, config.factory.resource);
  config.factory.cargoWrapper = resolve(root, config.factory.cargoWrapper);
  for (const url of config.research) {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.hostname !== "bun.sh")
      throw new Error("Research requires official Bun HTTPS URLs");
  }
  if (values["docs-only"]) {
    if (process.platform !== "linux" || !config.vpsHostnames.includes(hostname()))
      throw new Error("Documentation execute requires declared SSH VPS");
    return docsContent(root);
  }
  const changed = [
    ...new Set(
      [
        ...(values.base ? git(root, ["diff", "--name-only", `${values.base}...HEAD`]).split("\n") : []),
        ...git(root, ["diff", "HEAD", "--name-only"]).split("\n"),
        ...git(root, ["ls-files", "--others", "--exclude-standard"]).split("\n"),
      ].filter(Boolean),
    ),
  ].sort();
  const selected = selectSteps(config.steps, values.mode, changed);
  const plan = {
    mode: values.mode,
    changed,
    selected,
    omitted: config.steps.filter(step => !selected.some(entry => entry.id === step.id)).map(step => step.id),
    research: config.research,
    crossPlatformCI:
      values.mode === "all"
        ? { required: true, pipeline: config.pipeline }
        : { required: false, claim: "changed scopes only" },
  };
  if (!values.execute) {
    console.log(JSON.stringify(plan, null, 2));
    return 0;
  }
  if (!values.profile) throw new Error("Execute requires --profile from the factory owner");
  const profile = (await Bun.file(resolve(values.profile)).json()) as FactoryHostProfile;
  assertVps(config, profile, process.platform, hostname(), root);
  const cpu = Math.min(profile.cpu, config.execution?.maxCpu ?? MAX_FACTORY_CPU, MAX_FACTORY_CPU);
  if (git(root, ["rev-parse", "HEAD^{tree}"]).trim() !== profile.sourceTree)
    throw new Error("Factory profile source tree differs from this checkout");
  const journalPath = await validateExecutionReceiptPath(
    root,
    profile.factoryRoot,
    resolve(values.journal ?? join(root, "tmp/fusion/verification.json")),
  );
  const journalRelative = relative(root, journalPath).replaceAll("\\", "/");
  const ignored = Bun.spawnSync(["git", "check-ignore", "--no-index", journalRelative], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });
  if (ignored.exitCode !== 0) throw new Error("Journal/logs must be Git-ignored runtime output");
  const tracked = git(root, ["ls-files", "--", journalRelative, `${dirname(journalRelative)}/*.log`]).trim();
  if (tracked) throw new Error("Journal/logs must never replace tracked files");
  const prior = (await Bun.file(journalPath).exists()) ? ((await Bun.file(journalPath).json()) as Journal) : undefined;
  const journal: Journal = {
    schema: 1,
    revision: git(root, ["rev-parse", "HEAD"]).trim(),
    sourceHash: await scopeHash(root, ["."]),
    configHash: sha256(configText),
    mode: values.mode,
    coverage: {
      selected: selected.map(step => step.id),
      omitted: plan.omitted,
      crossPlatformCI: values.mode === "all" ? "required" : "not-claimed",
    },
    research: [],
    sourcePlan: await collectFusionSources(root),
    steps: [],
    crossPlatformCI: { state: "blocked", reason: "No full matrix evidence supplied" },
  };
  mkdirSync(dirname(journalPath), { recursive: true });
  const persist = () => Bun.write(journalPath, `${JSON.stringify(journal, null, 2)}\n`);
  const researchPromise =
    prior?.sourceHash === journal.sourceHash && prior.configHash === journal.configHash
      ? Promise.resolve(prior.research)
      : research(config.research);
  for (const step of selected) {
    const prerequisite = step.requires.map(id => journal.steps.find(entry => entry.id === id));
    const inputHash = sha256(
      JSON.stringify({
        source: await scopeHash(root, step.scope),
        config: journal.configHash,
        step,
        prerequisites: prerequisite.map(entry => [entry?.inputHash, entry?.state]),
      }),
    );
    const previous = prior?.steps.find(entry => entry.id === step.id);
    if (!mayRetry(previous, inputHash)) {
      const evidenceValid =
        !previous!.log ||
        (previous!.logSha256 !== undefined &&
          (await Bun.file(previous!.log).exists()) &&
          (await fileHash(previous!.log)) === previous!.logSha256);
      journal.steps.push(
        evidenceValid
          ? { ...previous!, reused: true }
          : {
              ...previous!,
              state: "blocked",
              reason: "Unchanged attempt has missing or altered evidence; change source/configuration before retry",
              reused: true,
            },
      );
      await persist();
      continue;
    }
    const startedAt = new Date().toISOString();
    if (prerequisite.some(entry => !entry || entry.state !== "passed")) {
      journal.steps.push({
        id: step.id,
        inputHash,
        state: "blocked",
        reason: "Required prerequisite did not pass",
        exitCode: null,
        log: null,
        diagnosticPaths: [],
        startedAt,
        endedAt: new Date().toISOString(),
      });
      await persist();
      continue;
    }
    let resourceReason: string | undefined;
    try {
      resourceReason = resourceBlockReason(observeGateResources());
    } catch (error) {
      resourceReason = `Unable to inspect the declared VPS cache/memory allocation: ${String(error)}`;
    }
    if (resourceReason) {
      journal.steps.push({
        id: step.id,
        inputHash,
        state: "blocked",
        reason: resourceReason,
        exitCode: null,
        log: null,
        diagnosticPaths: [],
        startedAt,
        endedAt: new Date().toISOString(),
      });
      console.warn(JSON.stringify({ step: step.id, state: "blocked", reason: resourceReason }));
      await persist();
      continue;
    }
    validateExecutionBudget(
      {
        host: "vps",
        target: profile.target,
        resourceClass: step.kind,
        cpu,
        memoryMiB: profile.memoryMiB,
        diskMiB: profile.diskMiB,
        ...(step.kind === "heavy" ? { lockKey: profile.lockPath } : {}),
      },
      profile,
    );
    const log = join(dirname(journalPath), `${step.id}.log`);
    console.log(JSON.stringify({ step: step.id, state: "running", log }));
    const descriptor = openSync(log, "w");
    let exitCode: number;
    try {
      const command = step.command.map(argument => (argument === "-j6" ? `-j${cpu}` : argument));
      const child = Bun.spawn(factoryCommand(config, { ...step, command }), {
        cwd: root,
        env: {
          ...process.env,
          ...gateFlags(step),
          APHRODY_BUILD_HOST: "vps",
          APHRODY_CARGO_JOBS: String(cpu),
          CARGO_BUILD_JOBS: String(cpu),
          CARGO_TARGET_DIR: CARGO_FACTORY_TARGET,
          APHRODY_CARGO_TARGET_DIR: CARGO_FACTORY_TARGET,
        },
        stdout: descriptor,
        stderr: descriptor,
      });
      exitCode = await child.exited;
    } catch (error) {
      writeSync(descriptor, `Unable to execute declared gate: ${String(error)}\n`);
      exitCode = 127;
    } finally {
      closeSync(descriptor);
    }
    const output = await Bun.file(log).slice(-65_536).text();
    const qualified = exitCode === 0 && testsQualified(step, output);
    journal.steps.push({
      id: step.id,
      inputHash,
      state: qualified ? "passed" : "failed",
      exitCode,
      log,
      ...(!qualified && exitCode === 0 ? { reason: "Required native tests were absent or skipped" } : {}),
      logSha256: await fileHash(log),
      diagnosticPaths: diagnosticPaths(output),
      startedAt,
      endedAt: new Date().toISOString(),
    });
    console.log(JSON.stringify({ step: step.id, state: qualified ? "passed" : "failed", exitCode }));
    await persist();
  }
  journal.research = await researchPromise;
  if (values.mode === "all" && values["ci-receipt"]) {
    const receipt = (await Bun.file(resolve(values["ci-receipt"])).json()) as {
      sourceHash?: string;
      revision?: string;
      pipeline?: string;
      status?: string;
      url?: string;
      platforms?: string[];
    };
    const full =
      receipt.sourceHash === journal.sourceHash &&
      receipt.revision === journal.revision &&
      receipt.pipeline === config.pipeline &&
      receipt.status === "passed" &&
      receipt.url?.startsWith("https://buildkite.com/") &&
      ["linux", "windows", "darwin"].every(platform => receipt.platforms?.includes(platform));
    journal.crossPlatformCI = {
      state: full ? "passed" : "failed",
      reason: full
        ? "Source-matched existing CI matrix receipt supplied"
        : "CI receipt lacks matching source, pipeline, result, URL or platforms",
    };
  } else if (values.mode === "changed")
    journal.crossPlatformCI = {
      state: "blocked",
      reason: "Changed-mode does not claim full CI matrix",
    };
  await persist();
  const failed =
    selected.some(step => step.required && journal.steps.find(entry => entry.id === step.id)?.state !== "passed") ||
    journal.research.some(entry => entry.status < 200 || entry.status >= 300) ||
    (values.mode === "all" && journal.crossPlatformCI.state !== "passed");
  console.log(
    JSON.stringify(
      {
        journal: journalPath,
        coverage: journal.coverage,
        steps: journal.steps.map(({ id, state, reused }) => ({ id, state, reused })),
        research: journal.research,
        crossPlatformCI: journal.crossPlatformCI,
      },
      null,
      2,
    ),
  );
  return failed ? 1 : 0;
}
if (import.meta.main) process.exit(await main());
