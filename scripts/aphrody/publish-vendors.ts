#!/usr/bin/env bun
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";

const ROOT = resolve(import.meta.dir, "../..");
export const VENDORS = ["uv", "windows-rs", "russh-sftp"] as const;
type Document = Record<string, any>;
type Product = { original: string; name: string; version: string; manifest: string; dependencies: string[] };

export const forkCrateName = (name: string) => `aphrody-bun-${name}`;

function tomlValue(value: any): string {
  if (typeof value === "string" || typeof value === "boolean" || typeof value === "number") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(tomlValue).join(", ")}]`;
  if (value && typeof value === "object") return `{ ${Object.entries(value).map(([key, item]) => `${JSON.stringify(key)} = ${tomlValue(item)}`).join(", ")} }`;
  throw new Error("Unsupported TOML value");
}

export function stringifyManifest(document: Document): string {
  return Object.entries(document).map(([key, value]) => `${JSON.stringify(key)} = ${tomlValue(value)}`).join("\n") + "\n";
}

export function rewriteManifest(document: Document, names: ReadonlyMap<string, string>): Document {
  const result = structuredClone(document);
  const pkg = result.package;
  if (pkg && names.has(pkg.name)) {
    const original = pkg.name;
    pkg.name = names.get(original);
    pkg.repository = "https://github.com/aphrody-labs/bun";
    pkg.metadata = { ...pkg.metadata, "bun-vendor": { upstreamName: original } };
    if (result.lib || pkg.autolib !== false) {
      result.lib ??= {};
      result.lib.name ??= original.replaceAll("-", "_");
    }
  }
  const dependencies = (table: Document | undefined) => {
    if (!table) return;
    for (const [alias, value] of Object.entries(table)) {
      const dependency = typeof value === "string" ? { version: value } : value;
      if (dependency.workspace) continue;
      const name = dependency.package ?? alias;
      if (names.has(name)) table[alias] = { ...dependency, package: names.get(name) };
    }
  };
  const sections = (owner: Document) => {
    for (const section of ["dependencies", "build-dependencies", "dev-dependencies"]) dependencies(owner[section]);
  };
  sections(result);
  if (result.workspace) sections(result.workspace);
  for (const target of Object.values<Document>(result.target ?? {})) sections(target);
  for (const patch of Object.values<Document>(result.patch ?? {})) dependencies(patch);
  return result;
}

export function dependencyOrder(products: Product[]): Product[] {
  const pending = new Map(products.map(product => [product.original, product]));
  const ordered: Product[] = [];
  while (pending.size) {
    const ready = [...pending.values()].filter(product => product.dependencies.every(name => !pending.has(name)));
    if (!ready.length) throw new Error(`Vendor dependency cycle: ${[...pending.keys()].join(", ")}`);
    for (const product of ready) { ordered.push(product); pending.delete(product.original); }
  }
  return ordered;
}

function run(command: string[], cwd: string): string {
  const process = Bun.spawnSync(command, { cwd, stdout: "pipe", stderr: "pipe" });
  if (!process.success) throw new Error(`${command.slice(0, 3).join(" ")}: ${process.stderr.toString()}`);
  return process.stdout.toString();
}

export async function stageVendor(vendor: (typeof VENDORS)[number], out: string): Promise<Product[]> {
  const prefix = `vendor/${vendor}/`;
  const paths = run(["git", "ls-files", "-z", "--", `vendor/${vendor}`], ROOT).split("\0").filter(path => path.endsWith("/Cargo.toml"));
  const documents = new Map(paths.map(path => [path, Bun.TOML.parse(run(["git", "show", `HEAD:${path}`], ROOT)) as Document]));
  const products: Product[] = [];
  for (const [manifest, document] of documents) {
    const pkg = document.package;
    if (!pkg || pkg.publish === false || Array.isArray(pkg.publish) && !pkg.publish.includes("crates-io")) continue;
    if (/(?:^|\/)(?:tests?|fixtures?|examples?|benches)\//.test(manifest)) continue;
    if (typeof pkg.version !== "string") throw new Error(`Inherited vendor version needs an explicit release adapter: ${manifest}`);
    const dependencies = [...Object.keys(document.dependencies ?? {}), ...Object.keys(document["build-dependencies"] ?? {})];
    for (const target of Object.values<Document>(document.target ?? {})) dependencies.push(...Object.keys(target.dependencies ?? {}), ...Object.keys(target["build-dependencies"] ?? {}));
    products.push({ original: pkg.name, name: forkCrateName(pkg.name), version: pkg.version, manifest, dependencies });
  }
  const ordered = dependencyOrder(products);
  const names = new Map(products.map(product => [product.original, product.name]));
  if (existsSync(join(out, "vendor", vendor))) throw new Error(`Staging directory already exists: ${out}`);
  mkdirSync(out, { recursive: true });
  const archive = Bun.spawnSync(["git", "archive", "--format=tar", "HEAD", `vendor/${vendor}`], { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
  if (!archive.success) throw new Error(archive.stderr.toString());
  await new Bun.Archive(archive.stdout).extract(out);
  for (const [path, document] of documents) {
    writeFileSync(join(out, path), stringifyManifest(rewriteManifest(document, names)));
  }
  const lock = join(out, prefix, "Cargo.lock");
  if (existsSync(lock)) {
    let text = readFileSync(lock, "utf8");
    for (const [original, renamed] of names) text = text.replaceAll(`"${original}"`, `"${renamed}"`).replaceAll(`"${original} `, `"${renamed} `);
    writeFileSync(lock, text);
  }
  writeFileSync(join(out, "vendor", vendor, "BUN-FORK-PROVENANCE.json"), JSON.stringify({ repository: "aphrody-labs/bun", commit: run(["git", "rev-parse", "HEAD"], ROOT).trim(), products: ordered }, null, 2) + "\n");
  return ordered;
}

if (import.meta.main) {
  try {
    const { values } = parseArgs({ args: Bun.argv.slice(2), options: { vendor: { type: "string", default: "uv" }, out: { type: "string" }, publish: { type: "boolean" }, gate: { type: "boolean" }, toolchain: { type: "string", default: "nightly-2026-09-15" } }, strict: true });
    if (!VENDORS.includes(values.vendor as (typeof VENDORS)[number])) throw new Error(`Choose --vendor ${VENDORS.join("|")}`);
    const out = resolve(values.out ?? join(tmpdir(), `bun-vendor-${values.vendor}-${Date.now()}`));
    const products = await stageVendor(values.vendor as (typeof VENDORS)[number], out);
    const workspace = join(out, "vendor", values.vendor!);
    console.log(JSON.stringify({ out, products }, null, 2));
    if (values.gate || values.publish) {
      run(["cargo", `+${values.toolchain}`, "metadata", "--no-deps", "--locked", "--format-version", "1"], workspace);
      run(["cargo", `+${values.toolchain}`, "check", "--workspace", "--locked"], workspace);
      run(["cargo", `+${values.toolchain}`, "test", "--workspace", "--lib", "--locked"], workspace);
      run(["cargo", `+${values.toolchain}`, "clippy", "--workspace", "--no-deps", "--locked", "--", "-D", "warnings"], workspace);
      for (const product of products) {
        const response = await fetch(`https://crates.io/api/v1/crates/${product.name}/${product.version}`, { headers: { "User-Agent": "aphrody-labs/bun vendor release" } });
        if (response.ok) { console.log(`= ${product.name}@${product.version} already published`); continue; }
        if (response.status !== 404) throw new Error(`Registry lookup failed: ${product.name} HTTP ${response.status}`);
        const args = ["cargo", `+${values.toolchain}`, "publish", "--manifest-path", join(out, product.manifest), "--allow-dirty"];
        if (!values.publish) args.push("--dry-run");
        run(args, dirname(join(out, product.manifest)));
        console.log(`${values.publish ? "+" : "~"} ${product.name}@${product.version}`);
      }
    }
  } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
}
