#!/usr/bin/env bun
import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { npmName, PACKAGES } from "./publish-npm.ts";
import { CRATES } from "./publish-crates.ts";
import { VENDORS } from "./publish-vendors.ts";
import { git, GitTree } from "./site/collect.ts";

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
  artifactPipelines: { workflow: string; blob: string; status: "requires-qualified-platform-artifacts" }[];
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
export type Step = { id: string; command: string[]; directory: string; requires: string[] };
const sha256 = (text: string | Uint8Array) => createHash("sha256").update(text).digest("hex");

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
  const cargoAdapters = new Map(CRATES.map(p => [`${p.dir}/Cargo.toml`, "publish-crates"]));
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
          npmDependencies.push({ manifest: path, section, name, specification: String(specification) });
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
      adapter: cargo ? (cargoAdapters.get(path) ?? null) : (npmAdapters.get(path) ?? null),
      build: !cargo && typeof document.scripts?.build === "string" ? document.scripts.build : null,
      publishedName: cargo
        ? (CRATES.find(p => `${p.dir}/Cargo.toml` === path)?.name ?? null)
        : (npmNames.get(path) ?? null),
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
    { id: "dependencies", command: ["bun", "install", "--frozen-lockfile"], directory: ".", requires: [] },
  ];
  if (operation === "build") {
    steps.push({ id: "runtime", command: ["bun", "run", "build:release"], directory: ".", requires: ["dependencies"] });
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
      command: ["bun", "scripts/aphrody/publish-npm.ts", ...(operation === "release-check" ? ["--dry-run"] : [])],
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
export function verifyIntegrity(bytes: Uint8Array, integrity: string): void {
  const matches = integrity.split(/\s+/).some(entry => {
    const match = /^(sha256|sha384|sha512)-([A-Za-z0-9+/=]+)$/.exec(entry);
    return !!match && createHash(match[1]!).update(bytes).digest("base64") === match[2];
  });
  if (!matches) throw new Error("Published artifact integrity mismatch or unsupported digest");
}

export async function publishedPackages(
  data: Inventory,
): Promise<{ packages: PublishedPackage[]; unavailable: { name: string; version: string | null; reason: string }[] }> {
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
      unavailable.push({ name: product.name, version: product.version, reason: "Exact source version not published" });
      continue;
    }
    if (!response.ok) throw new Error(`Registry ${product.name}: HTTP ${response.status}`);
    const record = (await response.json()) as Manifest;
    if (record.name !== name || record.version !== product.version || !record.dist?.integrity || !record.dist?.tarball)
      throw new Error(`Incomplete registry provenance: ${name}`);
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
      target: { type: "string" },
    },
  });
  const root = resolve(values.root!);
  const data = inventory(root, values.ref);
  const operation = values.operation!;
  if (!["inventory", "build", "release-check", "release-publish", "install"].includes(operation))
    throw new Error(`Unknown operation: ${operation}`);
  const report: Manifest = { inventory: data };
  if (values["check-upstream"]) report.upstreams = await upstreamReport(data, root);
  if (values["check-registry"]) report.installation = await publishedPackages(data);
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
      for (const step of report.plan.steps as Step[]) {
        if (step.id.startsWith("pack:"))
          mkdirSync(resolve(root, "tmp/monorepo-delivery-packages"), { recursive: true });
        const process = Bun.spawn(step.command, {
          cwd: resolve(root, step.directory),
          stdout: "inherit",
          stderr: "inherit",
        });
        if (await process.exited) throw new Error(`Delivery step failed: ${step.id}`);
      }
    }
  }
  if (operation === "install") {
    if (!values.manifest || !values.target)
      throw new Error("Install requires --manifest qualified registry report and --target exact consumer directory");
    const lock = (await Bun.file(resolve(values.manifest)).json()) as Manifest;
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
    if (values.apply) {
      mkdirSync(target, { recursive: true });
      const artifacts: string[] = [];
      for (const p of selected.packages) {
        if (p.sourceRevision !== data.source.revision || !p.tarball.startsWith("https://registry.npmjs.org/"))
          throw new Error(`Unqualified artifact: ${p.name}`);
        const response = await fetch(p.tarball);
        if (!response.ok) throw new Error(`Artifact ${p.name}: HTTP ${response.status}`);
        const bytes = new Uint8Array(await response.arrayBuffer());
        verifyIntegrity(bytes, p.integrity);
        const file = join(target, ".bun-delivery", `${sha256(bytes)}.tgz`);
        await Bun.write(file, bytes);
        artifacts.push(file);
      }
      const process = Bun.spawn(["bun", "add", "--exact", ...artifacts], {
        cwd: target,
        stdout: "inherit",
        stderr: "inherit",
      });
      if (await process.exited) throw new Error("Consumer installation failed");
    }
  }
  const output = JSON.stringify(report, null, 2) + "\n";
  if (values.out) await Bun.write(resolve(values.out), output);
  else console.log(output);
  return report;
}

if (import.meta.main) await main();
