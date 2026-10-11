#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";

export type Gate = { id: string; command: string[] };
export const gates: Gate[] = [
  ...["check", "test", "clippy"].map((action) => ({
    id: `rust-google-${action}`,
    command: [
      "bash",
      "../aphrody/scripts/build/rust/cargo-serial.sh",
      action,
      "--manifest-path",
      "packages/bun-google/aphrody/Cargo.toml",
      "-p",
      "aphrody-google",
      "--locked",
      ...(action === "clippy" ? ["--no-deps", "--", "-D", "warnings"] : []),
    ],
  })),
  { id: "install", command: ["bun", "install", "--frozen-lockfile", "--ignore-scripts"] },
  ...["check", "test", "clippy"].map((action) => ({
    id: `rust-install-${action}`,
    command: [
      "bash",
      "../aphrody/scripts/build/rust/cargo-serial.sh",
      action,
      "-p",
      "bun_install",
      "--lib",
      "--locked",
      ...(action === "clippy" ? ["--no-deps", "--", "-D", "warnings"] : []),
    ],
  })),
  ...["check", "test", "clippy"].map((action) => ({
    id: `rust-web-${action}`,
    command: [
      "bash",
      "../aphrody/scripts/build/rust/cargo-serial.sh",
      action,
      "--manifest-path",
      "packages/bun-aphrody-web/Cargo.toml",
      "-p",
      "aphrody-web-source",
      "--locked",
      ...(action === "clippy" ? ["--no-deps", "--", "-D", "warnings"] : []),
    ],
  })),
  {
    id: "google-chromium",
    command: [
      "bun",
      "bd",
      "-j1",
      "test",
      "--timeout",
      "30000",
      "test/js/bun/google.test.ts",
      "test/js/bun/chrome/chrome.test.ts",
      "test/internal/chromium.test.ts",
      "test/internal/google-chromium-graph.test.ts",
    ],
  },
  { id: "docs", command: ["bun", "scripts/aphrody/verify-fusion.ts", "--docs-only"] },
  {
    id: "provenance",
    command: ["bun", "bd", "-j1", "test", "scripts/aphrody/fusion-sources.test.ts"],
  },
];
export function validateIdentity(revision: string, id: string): void {
  if (!/^[a-f0-9]{40}$/.test(revision)) throw Error("Full immutable Git revision required");
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) throw Error("Stable lowercase job identity required");
}
export function qualification(results: { id: string; exitCode: number }[]) {
  return (
    results.length === gates.length &&
    gates.every(
      (gate) =>
        results.filter((result) => result.id === gate.id).length === 1 &&
        results.find((result) => result.id === gate.id)?.exitCode === 0,
    )
  );
}
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const root = resolve(import.meta.dir, "../..");

async function worker(revision: string, id: string): Promise<number> {
  validateIdentity(revision, id);
  const config = await Bun.file(join(root, "tools/config/native-ci.json")).json();
  const allocation = config.sourceAllocation;
  validateIdentity(allocation.aphrodyRevision ?? "", id);
  if (root !== allocation.bun || resolve(root, "../aphrody") !== allocation.aphrody)
    throw Error("Worker must use the declared sibling source allocation");
  const verifySibling = () => {
    const head = Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: allocation.aphrody });
    const dirty = Bun.spawnSync(["git", "status", "--porcelain", "--untracked-files=all"], {
      cwd: allocation.aphrody,
    });
    if (
      head.exitCode ||
      dirty.exitCode ||
      head.stdout.toString().trim() !== allocation.aphrodyRevision ||
      dirty.stdout.length
    )
      throw Error("Sibling Aphrody source must remain clean at its declared immutable pin");
  };
  verifySibling();
  if (process.env.APHRODY_BUILD_HOST !== "vps" || !process.env.APHRODY_ARTIFACT_ROOT)
    throw Error("Worker requires the existing Infra factory environment and artifact allocation");
  const head = Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: root });
  const dirty = Bun.spawnSync(["git", "status", "--porcelain", "--untracked-files=all"], {
    cwd: root,
  });
  if (
    head.exitCode ||
    dirty.exitCode ||
    head.stdout.toString().trim() !== revision ||
    dirty.stdout.length
  )
    throw Error("Factory source must be clean at the requested revision");
  const directory = join(process.env.APHRODY_ARTIFACT_ROOT, "native-ci", id);
  await mkdir(dirname(directory), { recursive: true });
  await mkdir(directory); // Refuse reuse: reconcile the existing receipt instead of replaying.
  const results: { id: string; exitCode: number; logSha256: string }[] = [];
  const receipt = async (state: string) =>
    Bun.write(
      join(directory, "receipt.json"),
      JSON.stringify(
        {
          schema: 1,
          revision,
          aphrodyRevision: allocation.aphrodyRevision,
          id,
          state,
          pipelineSha256: hash(await Bun.file(import.meta.path).text()),
          gatesSha256: hash(JSON.stringify(gates)),
          platform: `${process.platform}-${process.arch}`,
          results,
          qualified: qualification(results),
          publicationAllowed: false,
          publicationReason:
            "Single-host tests do not qualify cross-platform release artifacts; existing release owner remains mandatory",
        },
        null,
        2,
      ),
    );
  await receipt("running");
  try {
    for (const gate of gates) {
      verifySibling();
      const child = Bun.spawn(gate.command, { cwd: root, stdout: "pipe", stderr: "pipe" });
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      const log = stdout + stderr;
      if (
        gate.command.includes("test") &&
        gate.command.includes("bd") &&
        (!/\b[1-9]\d* pass\b/.test(log) || /\b[1-9]\d* (?:skip|todo|fail)\b/.test(log))
      ) {
        await Bun.write(join(directory, gate.id + ".log"), log);
        results.push({ id: gate.id, exitCode: exitCode || 1, logSha256: hash(log) });
        await receipt("failed");
        return 1;
      }
      await Bun.write(join(directory, gate.id + ".log"), log);
      results.push({ id: gate.id, exitCode, logSha256: hash(log) });
      await receipt(exitCode ? "failed" : "running");
      if (exitCode) return exitCode;
    }
    verifySibling();
    await receipt("succeeded");
    console.log(await Bun.file(join(directory, "receipt.json")).text());
    return 0;
  } catch (error) {
    await receipt("failed");
    throw error;
  }
}

export async function main(args: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    strict: true,
    options: {
      revision: { type: "string" },
      id: { type: "string" },
      help: { type: "boolean" },
    },
  });
  if (values.help) {
    console.log(
      "native-ci.ts plan|run|status --revision <40hex> --id <stable-id>. No publication or automatic source preparation.",
    );
    return 0;
  }
  const action = positionals[0];
  if (positionals.length !== 1 || !["plan", "run", "status", "worker"].includes(action ?? ""))
    throw Error("Expected plan, run or status");
  validateIdentity(values.revision ?? "", values.id ?? "");
  if (action === "worker") return worker(values.revision!, values.id!);
  const config = await Bun.file(join(root, "tools/config/native-ci.json")).json();
  if (
    config.schema !== 1 ||
    config.repository !== "bun-os" ||
    config.factoryModule !== "packages/infra/workspace/src/build-factory.ts"
  )
    throw Error("Unrecognized owner configuration");
  const factoryRoot = resolve(root, config.factoryRoot);
  const owner = await import(join(factoryRoot, config.factoryModule));
  if (action === "status")
    return owner.runBuildFactory(["status", "--job", values.id!, "--tail", "40"], factoryRoot);
  const factory = await owner.readFactoryConfig(factoryRoot);
  const fusion = await Bun.file(join(root, config.fusionConfig)).json();
  if (
    !factory ||
    factory.repositories[config.repository] !== fusion.repositories[config.repository]
  )
    throw Error("Infra and fusion factory must declare the same qualified source checkout");
  const command = [
    "bun",
    "scripts/aphrody/native-ci.ts",
    "worker",
    "--revision",
    values.revision!,
    "--id",
    values.id!,
  ];
  const plan = owner.buildFactoryPlan(factory, config.repository, values.revision!, command);
  if (action === "plan") {
    console.log(
      JSON.stringify(
        { ...plan, gates, publicationAllowed: false, schedule: config.schedule },
        null,
        2,
      ),
    );
    return 0;
  }
  return owner.runBuildFactory(
    [
      "run",
      "--repo",
      config.repository,
      "--revision",
      values.revision!,
      "--detach",
      "--job",
      values.id!,
      "--",
      ...command,
    ],
    factoryRoot,
  );
}
if (import.meta.main) {
  try {
    process.exit(await main(process.argv.slice(2)));
  } catch (error) {
    console.error(String(error));
    process.exit(1);
  }
}
