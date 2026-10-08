// npm's staged publishing creates `<name>@0.0.0-stage` the first time a new
// package name is published, and the registry lists it as a version. Nothing
// can unpublish it with a granular token (E403: needs 2FA), so every
// @aphrody publish script deprecates it right after publishing, which hides
// it from `npm install <name>` resolution and `npm view` ranges.

import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const PLACEHOLDER_VERSION = "0.0.0-stage";
export const PLACEHOLDER_MESSAGE =
  "Registry placeholder created on first publish, not a release. Use the latest dist-tag.";

type Packument = { versions?: Record<string, { deprecated?: string }> };

export function placeholderNeedsRetiring(packument: Packument): boolean {
  const v = packument.versions?.[PLACEHOLDER_VERSION];
  return v !== undefined && !v.deprecated;
}

function npmCommand(): string[] {
  return Bun.which("npm") ? ["npm"] : [process.execPath, "x", "--bun", "npm"];
}

async function packument(name: string): Promise<Packument | undefined> {
  const res = await fetch(`https://registry.npmjs.org/${name.replace("/", "%2f")}`, {
    headers: { "cache-control": "no-cache" },
  });
  if (res.status === 404) return undefined;
  if (!res.ok) throw new Error(`registry ${name}: HTTP ${res.status}`);
  return (await res.json()) as Packument;
}

/**
 * Deprecates `<name>@0.0.0-stage` if the registry has it; `cwd` holds the `.npmrc` with the token.
 * `published`: a version just published, waited for (a new package takes minutes to appear).
 */
export async function retirePlaceholder(
  name: string,
  opts: { cwd: string; dryRun?: boolean; published?: string },
): Promise<boolean> {
  let doc = await packument(name);
  for (let i = 0; !opts.dryRun && opts.published && !doc?.versions?.[opts.published] && i < 30; i++) {
    await Bun.sleep(10_000);
    doc = await packument(name);
  }
  if (!doc || !placeholderNeedsRetiring(doc)) return false;
  const spec = `${name}@${PLACEHOLDER_VERSION}`;
  console.log(`${opts.dryRun ? "dry-run " : ""}deprecate ${spec}`);
  if (opts.dryRun) return true;
  const [cmd, ...args] = npmCommand();
  const r = spawnSync(cmd!, [...args, "deprecate", spec, PLACEHOLDER_MESSAGE], {
    cwd: opts.cwd,
    stdio: "inherit",
    env: process.env,
  });
  // Not fatal: the release is live; the placeholder only clutters `npm view`.
  if (r.status !== 0) console.log(`::warning::npm deprecate ${spec} failed (${r.error?.message ?? r.status})`);
  return r.status === 0;
}

/** Every package this fork publishes: the runtime, the JS packages, bun-mdx-rs and web-inspector-bun. */
export async function forkPackages(): Promise<string[]> {
  const runtime = await import("./publish-runtime");
  const npm = await import("./publish-npm");
  const mdx = await import("./publish-mdx-rs");
  const inspector = await import("./publish-web-inspector");
  return [
    runtime.RUNTIME_PACKAGE,
    ...runtime.runtimePlatforms.map(p => p.pkg),
    ...npm.PACKAGES.map(p => `@aphrody/${(p as { name?: string }).name ?? p.dir}`),
    ...mdx.mdxPackageNames(),
    inspector.INSPECTOR_PACKAGE,
  ];
}

if (import.meta.main) {
  // bun scripts/aphrody/npm-placeholder.ts retire [--dry-run] [names...]   (no names: every package of the fork)
  const [command, ...rest] = process.argv.slice(2);
  if (command !== "retire") {
    console.error("usage: npm-placeholder.ts retire [--dry-run] [names...]");
    process.exit(2);
  }
  const dryRun = rest.includes("--dry-run");
  const names = rest.filter(a => !a.startsWith("--"));
  const cwd = mkdtempSync(join(tmpdir(), "aphrody-npm-placeholder-"));
  if (process.env.NPM_TOKEN) writeFileSync(join(cwd, ".npmrc"), "//registry.npmjs.org/:_authToken=${NPM_TOKEN}\n");
  for (const name of names.length ? names : await forkPackages()) await retirePlaceholder(name, { cwd, dryRun });
}
