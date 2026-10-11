#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, realpath } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { LOLHTML_SOURCE } from "../build/deps/lolhtml.ts";
import { RUST_ARGON2_PATCHES, RUST_ARGON2_SOURCE } from "../build/deps/rust-argon2.ts";
import { UUTILS_PATCHES, UUTILS_SOURCE } from "../build/deps/uutils.ts";
import { computeSourceIdentity } from "../build/fetch-cli.ts";

export type Gate = { id: string; command: string[]; env?: { CLIPPY_CONF_DIR: string } };
export const gates: Gate[] = [
  ...["check", "test", "clippy"].map((action) => ({
    id: `rust-google-${action}`,
    ...(action === "clippy" ? { env: { CLIPPY_CONF_DIR: "packages/bun-google/aphrody" } } : {}),
    command: [
      "bash",
      "../aphrody/scripts/build/rust/cargo-serial.sh",
      action,
      "--config",
      "packages/bun-google/aphrody/.cargo/config.toml",
      "--manifest-path",
      "packages/bun-google/aphrody/Cargo.toml",
      "-p",
      "aphrody-google",
      "--locked",
      ...(action === "clippy" ? ["--no-deps", "--", "-D", "warnings"] : []),
    ],
  })),
  { id: "install", command: ["bun", "install", "--frozen-lockfile", "--ignore-scripts"] },
  { id: "rust-dependencies", command: ["bun", "scripts/aphrody/native-ci.ts", "dependencies"] },
  ...["check", "test", "clippy"].map((action) => ({
    id: `rust-install-${action}`,
    ...(action === "clippy" ? { env: { CLIPPY_CONF_DIR: "." } } : {}),
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
    ...(action === "clippy" ? { env: { CLIPPY_CONF_DIR: "packages/bun-aphrody-web" } } : {}),
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
export function gateEnvironment(
  gate: Gate,
  checkout: string,
  inherited: Record<string, string | undefined>,
): Record<string, string | undefined> {
  return gate.env
    ? { ...inherited, CLIPPY_CONF_DIR: resolve(checkout, gate.env.CLIPPY_CONF_DIR) }
    : { ...inherited };
}
export async function cargoPathManifests(checkout: string) {
  const paths = new Map<string, string>();
  const manifests = [
    "Cargo.toml",
    ...new Bun.Glob("src/**/Cargo.toml").scanSync({ cwd: checkout, onlyFiles: true }),
  ];
  for (const manifest of manifests) {
    const parsed = Bun.TOML.parse(await readFile(join(checkout, manifest), "utf8"));
    function visit(object: unknown, alias = "", dependency = false) {
      if (!object || typeof object !== "object") return;
      const entry = object as Record<string, unknown>;
      if (dependency && typeof entry.path === "string") {
        const path = resolve(checkout, dirname(manifest), entry.path, "Cargo.toml");
        if (!path.startsWith(checkout + "/") && !path.startsWith(checkout + "\\"))
          throw Error("Cargo path dependency escapes its source checkout");
        paths.set(path, typeof entry.package === "string" ? entry.package : alias);
      }
      for (const [key, value] of Object.entries(entry))
        visit(
          value,
          key,
          dependency ||
            ["dependencies", "dev-dependencies", "build-dependencies", "patch", "replace"].includes(
              key,
            ),
        );
    }
    visit(parsed);
  }
  return paths;
}
async function verifyCargoManifest(path: string, name: string) {
  const manifest = await lstat(path);
  if (!manifest.isFile() || manifest.isSymbolicLink() || (await realpath(path)) !== path)
    throw Error(`Cargo path dependency ${name} manifest must remain canonical`);
  const parsed = Bun.TOML.parse(await readFile(path, "utf8"));
  if ((parsed as { package?: { name?: string } }).package?.name !== name)
    throw Error(`Cargo path dependency ${name} package differs; preserved`);
}
async function verifyCargoPathManifests(checkout: string, absentSources: string[] = []) {
  for (const [path, name] of await cargoPathManifests(checkout)) {
    if (
      absentSources.some(
        (destination) => path.startsWith(destination + "/") || path.startsWith(destination + "\\"),
      )
    )
      continue;
    await verifyCargoManifest(path, name);
  }
}
export async function rustDependencyPlan(checkout: string) {
  const vendor = resolve(checkout, "vendor");
  const directory = await lstat(vendor);
  if (directory.isSymbolicLink() || !directory.isDirectory() || (await realpath(vendor)) !== vendor)
    throw Error("Dependency vendor directory must remain canonical");
  for (const path of [join(checkout, "build"), join(checkout, "build/native-ci-downloads")]) {
    const state = await lstat(path).catch((error) => {
      if (error.code === "ENOENT") return undefined;
      throw error;
    });
    if (
      state &&
      (state.isSymbolicLink() || !state.isDirectory() || (await realpath(path)) !== path)
    )
      throw Error("Dependency download cache must remain within its checkout");
  }
  const dependencies = await Promise.all(
    [
      {
        name: "lolhtml",
        manifest: "Cargo.toml",
        package: "lol_html",
        source: LOLHTML_SOURCE,
        patches: [] as string[],
      },
      {
        name: "rust-argon2",
        manifest: "Cargo.toml",
        package: "rust-argon2",
        source: RUST_ARGON2_SOURCE,
        patches: RUST_ARGON2_PATCHES,
      },
      {
        name: "uutils",
        manifest: "src/uucore/Cargo.toml",
        package: "uucore",
        source: UUTILS_SOURCE,
        patches: UUTILS_PATCHES,
      },
    ].map(async (dependency) => {
      const destination = join(vendor, dependency.name);
      const patches = dependency.patches.map((patch) => resolve(checkout, patch));
      const identity = computeSourceIdentity(
        dependency.source.commit,
        await Promise.all(patches.map((patch) => readFile(patch, "utf8"))),
      );
      const state = await lstat(destination).catch((error) => {
        if (error.code === "ENOENT") return undefined;
        throw error;
      });
      if (state) {
        if (
          state.isSymbolicLink() ||
          !state.isDirectory() ||
          (await realpath(destination)) !== destination
        )
          throw Error(`Dependency ${dependency.name} destination must remain canonical`);
        const stamp = await lstat(join(destination, ".ref"));
        if (
          !stamp.isFile() ||
          stamp.isSymbolicLink() ||
          (await readFile(join(destination, ".ref"), "utf8")).trim() !== identity
        )
          throw Error(`Dependency ${dependency.name} source identity differs; preserved`);
        await verifyCargoManifest(join(destination, dependency.manifest), dependency.package);
      }
      return { ...dependency, destination, patches, identity, present: !!state };
    }),
  );
  await verifyCargoPathManifests(
    checkout,
    dependencies
      .filter((dependency) => !dependency.present)
      .map((dependency) => dependency.destination),
  );
  return dependencies;
}
export async function provisionRustDependencies(
  checkout: string,
  fetchSource: (command: string[]) => Promise<number>,
) {
  const dependencies = await rustDependencyPlan(checkout); // Preflight all destinations before the first fetch.
  for (const dependency of dependencies) {
    const command = [
      "bun",
      join(checkout, "scripts/build/fetch-cli.ts"),
      "dep",
      dependency.name,
      dependency.source.repo,
      dependency.source.commit,
      dependency.destination,
      join(checkout, "build/native-ci-downloads"),
      ...dependency.patches,
    ];
    if (await fetchSource(command)) throw Error(`Dependency ${dependency.name} owner fetch failed`);
    const stamp = await lstat(join(dependency.destination, ".ref"));
    if (
      !stamp.isFile() ||
      stamp.isSymbolicLink() ||
      (await realpath(dependency.destination)) !== dependency.destination ||
      (await readFile(join(dependency.destination, ".ref"), "utf8")).trim() !== dependency.identity
    )
      throw Error(`Dependency ${dependency.name} owner fetch did not qualify`);
    await verifyCargoManifest(
      join(dependency.destination, dependency.manifest),
      dependency.package,
    );
    console.log(
      JSON.stringify({
        dependency: dependency.name,
        repository: dependency.source.repo,
        revision: dependency.source.commit,
        sourceIdentity: dependency.identity,
        manifestSha256: hash(
          await readFile(join(dependency.destination, dependency.manifest), "utf8"),
        ),
      }),
    );
  }
  await verifyCargoPathManifests(checkout); // No generated-source exemptions after provisioning.
}
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
      const child = Bun.spawn(gate.command, {
        cwd: root,
        env: gateEnvironment(gate, root, process.env),
        stdout: "pipe",
        stderr: "pipe",
      });
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
  if (action === "dependencies" && positionals.length === 1 && !values.revision && !values.id) {
    const config = await Bun.file(join(root, "tools/config/native-ci.json")).json();
    if (
      process.env.APHRODY_BUILD_HOST !== "vps" ||
      !process.env.APHRODY_ARTIFACT_ROOT ||
      root !== config.sourceAllocation.bun
    )
      throw Error("Dependency provisioning requires the declared locked Infra factory worker");
    await provisionRustDependencies(root, async (command) => {
      const child = Bun.spawn(command, { cwd: root, stdout: "inherit", stderr: "inherit" });
      return child.exited;
    });
    return 0;
  }
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
