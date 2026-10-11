#!/usr/bin/env bun
import { createHash } from "node:crypto";
import { isAbsolute, relative, resolve } from "node:path";
import { parseArgs } from "node:util";

type Table = Record<string, unknown>;
export type Dependency = { alias: string; package: string; optional: boolean; target: string; kind: string; features: string[] };
export type Crate = { name: string; manifest: string; features: Record<string, string[]>; dependencies: Dependency[] };
export type Combination = { id: string; packages: string[]; features: string[]; platforms: string[]; requirements: string[]; jscOnly: boolean };
export type FeatureConfig = { schema: number; platforms: string[]; sources: string[]; combinations: Combination[];
  runtimeToggles: { name: string; source: string; policy: string; reason: string }[]; incompatibleSelections: string[][] };
const table = (value: unknown): Table => value && typeof value === "object" && !Array.isArray(value) ? value as Table : {};
const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

export function manifestCrate(text: string, manifest: string, workspaceDependencies: Table = {}): Crate {
  const data = table(Bun.TOML.parse(text));
  const name = table(data.package).name;
  if (typeof name !== "string") throw new Error(`Missing package name in ${manifest}`);
  const dependencies: Dependency[] = [];
  function collect(container: Table, target: string) {
    for (const kind of ["dependencies", "build-dependencies", "dev-dependencies"]) {
      for (const [alias, raw] of Object.entries(table(container[kind]))) {
        const own = table(raw);
        const inherited = own.workspace === true ? table(workspaceDependencies[alias]) : {};
        const spec = { ...inherited, ...own };
        dependencies.push({ alias, package: typeof spec.package === "string" ? spec.package : alias,
          optional: spec.optional === true, target, kind, features: [...new Set([...strings(inherited.features), ...strings(own.features)])] });
      }
    }
  }
  collect(data, "all");
  for (const [target, container] of Object.entries(table(data.target))) collect(table(container), target);
  return { name, manifest, dependencies,
    features: Object.fromEntries(Object.entries(table(data.features)).map(([feature, values]) => [feature, strings(values)])) };
}

// Declaration traversal only: preserve target expressions and weak dependency
// edges verbatim. Cargo's owner unit graph remains the feature resolver.
export function featureClosure(crates: Crate[], selections: string[]) {
  const byName = new Map(crates.map(crate => [crate.name, crate]));
  const visited = new Set<string>();
  const external = new Set<string>();
  const invalid = new Set<string>();
  function visit(selection: string) {
    if (visited.has(selection)) return;
    const slash = selection.indexOf("/");
    const crate = byName.get(selection.slice(0, slash));
    const feature = selection.slice(slash + 1);
    if (slash < 1 || !crate || !(feature in crate.features)) { invalid.add(selection); return; }
    visited.add(selection);
    for (const edge of crate.features[feature]!) {
      if (edge.startsWith("dep:")) { external.add(`${crate.name}/${edge}`); continue; }
      if (edge.includes("/")) {
        const [alias, child] = edge.split("/");
        if (alias!.endsWith("?")) { external.add(`${crate.name}/${edge}`); continue; }
        const dependency = crate.dependencies.find(dep => dep.alias === alias);
        if (dependency && byName.has(dependency.package)) visit(`${dependency.package}/${child}`);
        else external.add(`${crate.name}/${edge}`);
      } else if (edge in crate.features) visit(`${crate.name}/${edge}`);
      else if (crate.dependencies.some(dep => dep.alias === edge && dep.optional)) external.add(`${crate.name}/dep:${edge}`);
      else invalid.add(`${crate.name}/${edge}`);
    }
  }
  for (const selection of selections) visit(selection);
  return { declared: [...visited].sort(), dependencyEdges: [...external].sort(), invalid: [...invalid].sort() };
}

export function assessCombination(combo: Combination, crates: Crate[], platform: string) {
  let closure = featureClosure(crates, combo.features);
  const issues: string[] = [];
  if (!combo.platforms.includes(platform)) issues.push(`Platform ${platform} is not declared for this combination`);
  for (const name of combo.packages) if (!crates.some(crate => crate.name === name)) issues.push(`Missing root workspace package ${name}`);
  const reachable = new Set(combo.packages);
  const activeDependency = (crate: Crate, dep: Dependency) => !dep.optional ||
    closure.dependencyEdges.includes(`${crate.name}/dep:${dep.alias}`) ||
    closure.dependencyEdges.some(edge => edge.startsWith(`${crate.name}/${dep.alias}/`)) ||
    closure.declared.some(edge => edge.startsWith(`${dep.package}/`));
  let changed = true;
  while (changed) {
    changed = false;
    closure = featureClosure(crates, [...combo.features, ...crates.filter(crate => reachable.has(crate.name) && "default" in crate.features)
      .map(crate => `${crate.name}/default`)]);
    for (const selection of closure.declared) {
      const name = selection.split("/")[0]!;
      if (!reachable.has(name)) { reachable.add(name); changed = true; }
    }
    for (const crate of crates) if (reachable.has(crate.name)) {
      for (const dep of crate.dependencies) if (activeDependency(crate, dep) && dep.kind !== "dev-dependencies" &&
        crates.some(candidate => candidate.name === dep.package) && !reachable.has(dep.package)) {
        reachable.add(dep.package); changed = true;
      }
    }
  }
  issues.push(...closure.invalid.map(feature => `Undeclared feature ${feature}`));
  const v8 = crates.filter(crate => reachable.has(crate.name) && crate.dependencies.some(dep =>
    dep.kind !== "dev-dependencies" && activeDependency(crate, dep) && ["deno_core", "v8", "rusty_v8"].includes(dep.package))).map(crate => crate.name);
  if (combo.jscOnly && v8.length) issues.push(`JSC-only page execution still reaches V8 dependencies in ${v8.join(", ")}`);
  return { id: combo.id, platform, status: issues.length ? "unsupported" : combo.requirements.length ? "requiring-dependencies" : "supported",
    qualified: false, issues, requirements: combo.requirements, closure, reachablePackages: [...reachable].sort(),
    cargoSelection: ["cargo", "+nightly", "check", "--locked", "--profile", "browser-tests",
      ...combo.packages.flatMap(name => ["-p", name]), ...(combo.features.length ? ["--features", combo.features.join(",")] : [])] };
}

export function incompatibleSelections(selections: string[], groups: string[][]): string[] {
  return groups.filter(group => group.filter(item => selections.includes(item)).length > 1).map(group => `Incompatible selections: ${group.join(", ")}`);
}

export async function inventory(root: string, config: FeatureConfig) {
  if (config.schema !== 1) throw new Error("Unsupported fusion feature schema");
  const evidence: { path: string; sha256: string }[] = [];
  async function source(path: string) {
    const absolute = resolve(root, path);
    const scoped = relative(root, absolute);
    if (isAbsolute(scoped) || scoped === ".." || scoped.startsWith("../") || scoped.startsWith("..\\")) throw new Error("Source outside checkout");
    const file = Bun.file(absolute);
    if (file.size > 4 * 1024 * 1024) throw new Error(`Oversized inventory source ${path}`);
    const text = await file.text();
    evidence.push({ path, sha256: createHash("sha256").update(text).digest("hex") });
    return text;
  }
  const rootManifest = table(Bun.TOML.parse(await source("Cargo.toml")));
  const workspace = table(rootManifest.workspace);
  const crates: Crate[] = [];
  for (const member of strings(workspace.members)) {
    if (member.includes("*")) throw new Error(`Workspace glob requires explicit owner expansion: ${member}`);
    const manifest = `${member}/Cargo.toml`;
    crates.push(manifestCrate(await source(manifest), manifest, table(workspace.dependencies)));
  }
  if (new Set(crates.map(crate => crate.name)).size !== crates.length) throw new Error("Ambiguous root workspace package names");
  const texts = new Map<string, string>();
  for (const path of config.sources.filter(path => path !== "Cargo.toml")) texts.set(path, await source(path));
  const envSource = texts.get("src/bun_core/env_var.rs") ?? "";
  const runtimeFlags = [...new Set([...envSource.matchAll(/new_feature_flag!\(\s*pub\s+(\w+)/g)].map(match => match[1]!))].sort();
  const buildProfiles = [...(texts.get("scripts/build/profiles.ts") ?? "").matchAll(/^  (?:"([\w-]+)"|([\w-]+)):\s*\{/gm)]
    .map(match => match[1] ?? match[2]);
  const partialConfig = /export interface PartialConfig\s*\{([\s\S]*?)^\}/m.exec(texts.get("scripts/build/config.ts") ?? "")?.[1] ?? "";
  const buildOptions = [...partialConfig.matchAll(/^\s+(\w+)\??:\s*([^;]+);/gm)].map(match => ({ name: match[1], type: match[2] }));
  const compileTimeFlags = [...(texts.get("src/bun_core/feature_flags.rs") ?? "").matchAll(/^pub(?:\(crate\))? const (\w+): bool = ([^;]+);/gm)]
    .map(match => ({ name: match[1], expression: match[2], policy: "preserve-target-guards" }));
  return { schema: 1, observedAt: new Date().toISOString(), qualification: "source-only; no build or runtime gate executed",
    crates, evidence, runtimeFlags: runtimeFlags.map(name => ({ name, policy: config.runtimeToggles.find(toggle => toggle.name === name)?.policy ?? "preserve-default; review-before-enabling" })),
    explicitToggles: config.runtimeToggles, compileTimeFlags, buildProfiles, buildOptions, incompatibleSelections: config.incompatibleSelections,
    buildFeatureForwarding: { source: "scripts/build/rust.ts", requiresOwnerReview: true,
      reason: "bd's Cargo unit graph is authoritative; declaration discovery does not prove a feature reaches the final binary" },
    matrix: config.platforms.flatMap(platform => config.combinations.map(combo => assessCombination(combo, crates, platform))) };
}

if (import.meta.main) {
  const { values } = parseArgs({ options: { root: { type: "string", default: process.cwd() },
    config: { type: "string", default: "tools/config/fusion-features.json" },
    "build-selection": { type: "string", multiple: true }, strict: { type: "boolean", default: false } } });
  const root = resolve(values.root!);
  const config = await Bun.file(resolve(root, values.config!)).json() as FeatureConfig;
  const report = await inventory(root, config);
  const requestedBuildSelections = values["build-selection"] ?? [];
  const buildSelectionIssues = incompatibleSelections(requestedBuildSelections, config.incompatibleSelections);
  console.log(JSON.stringify({ ...report, requestedBuildSelections, buildSelectionIssues }, null, 2));
  if (values.strict && (buildSelectionIssues.length || report.matrix.some(row => row.status === "unsupported"))) process.exitCode = 1;
}
