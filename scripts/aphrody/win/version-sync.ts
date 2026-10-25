#!/usr/bin/env bun
import { readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

export const DEFAULT_VERSION = "1.4.4";
const DEFAULT_ROOT = resolve(import.meta.dir, "../../..");
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
export const OWNED_PRIVATE_MANIFESTS: Readonly<Record<string, string>> = {
  "packages/bun-error/package.json": "bun-error",
  "packages/bun-lambda/package.json": "bun-lambda",
  "packages/bun-release/package.json": "bun-release-action",
};
export type Change = { path: string; before: string; after: string; reason: string };

export function validateVersion(version: string): void {
  if (version.trim() !== version || !SEMVER.test(version))
    throw new Error(`Expected stable X.Y.Z, got ${JSON.stringify(version)}`);
}

export function sourceChanges(
  read: (path: string) => string,
  version = DEFAULT_VERSION,
  paths = ["package.json", "packages/bun-agent-plugin/package.json"],
): Change[] {
  validateVersion(version);
  const changes: Change[] = [];
  const manifests = paths.map(path => {
    if (
      path !== "package.json" &&
      (!/^packages\/(?:[^/\\:]+\/)*package\.json$/.test(path) ||
        path.split("/").some(part => part === "." || part === ".."))
    )
      throw new Error(`Manifest outside owned packages: ${path}`);
    const before = read(path);
    const manifest = JSON.parse(before);
    const owned =
      path === "package.json"
        ? manifest.name === "bun"
        : path === "packages/bun-agent-plugin/package.json"
          ? manifest.name === "bun-agent-plugin"
          : OWNED_PRIVATE_MANIFESTS[path]
            ? manifest.name === OWNED_PRIVATE_MANIFESTS[path] && manifest.private === true
            : typeof manifest.name === "string" && manifest.name.startsWith("@aphrody/");
    if (!owned) throw new Error(`Wrong manifest owner: ${path}`);
    return { path, before, manifest };
  });
  const names = new Set(manifests.map(({ manifest }) => manifest.name));
  for (const { path, before, manifest } of manifests) {
    const newline = before.includes("\r\n") ? "\r\n" : "\n";
    let after =
      manifest.version === undefined
        ? before.replace(/^(\s*"name"\s*:\s*"[^"]+"\s*,)\r?\n/m, `$1${newline}  "version": "${version}",${newline}`)
        : before.replace(/^(\s*"version"\s*:\s*")[^"]+("\s*,?\s*)$/m, `$1${version}$2`);
    if (JSON.parse(after).version !== version) throw new Error(`Missing unique version field: ${path}`);
    const updated = JSON.parse(after);
    let dependencyChanged = false;
    for (const section of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
      for (const [name, range] of Object.entries(updated[section] ?? {})) {
        if (names.has(name) && typeof range === "string" && /^[~^]?\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(range)) {
          const next = `${/^[~^]/.test(range) ? range[0] : ""}${version}`;
          if (range !== next) {
            updated[section][name] = next;
            dependencyChanged = true;
          }
        }
      }
    }
    if (dependencyChanged) after = JSON.stringify(updated, null, 2).replaceAll("\n", newline) + newline;
    if (path.includes("bun-agent-plugin")) {
      const minimum = manifest.engines?.bun;
      if (!/^>=\d+\.\d+\.\d+$/.test(minimum)) throw new Error(`Unexpected Bun engine range: ${path}`);
      after = after.replace(/^(\s*"bun"\s*:\s*")>=\d+\.\d+\.\d+("\s*,?\s*)$/m, `$1>=${version}$2`);
      if (JSON.parse(after).engines.bun !== `>=${version}`) throw new Error(`Missing Bun engine field: ${path}`);
    }
    if (after !== before) changes.push({ path, before, after, reason: "owned product release version" });
  }
  return changes;
}

const RELEASE_PATHS = [
  "scripts/aphrody/docker-sync.ts",
  "scripts/aphrody/docker-doctor.ts",
  "scripts/aphrody/deploy/docker/compose.yaml",
  "scripts/aphrody/deploy/docker/k8s.yaml",
  "scripts/aphrody/deploy/docker/Dockerfile",
  "scripts/aphrody/alpine/runtime.Dockerfile",
] as const;

export function releaseChanges(read: (path: string) => string, version: string, tag: string, sums: string): Change[] {
  validateVersion(version);
  if (
    tag.trim() !== tag ||
    (tag !== `bun-v${version}` &&
      !new RegExp(`^aphrody-v${version.replaceAll(".", "\\.")}-aphrody\\.[1-9]\\d*$`).test(tag))
  ) {
    throw new Error("Release tag must match the requested source version");
  }
  const hashes = new Map<string, string>();
  for (const line of sums.split(/\r?\n/)) {
    const match = /^([a-fA-F0-9]{64})\s+\*?(bun-[a-z0-9-]+\.zip)$/.exec(line);
    const digest = match?.[1];
    const asset = match?.[2];
    if (digest && asset) {
      if (hashes.has(asset)) throw new Error(`Duplicate checksum: ${asset}`);
      hashes.set(asset, digest.toLowerCase());
    }
  }
  const required = [
    "bun-linux-x64.zip",
    "bun-linux-x64-musl.zip",
    "bun-linux-x64-musl-baseline.zip",
    "bun-linux-aarch64-musl.zip",
  ];
  for (const asset of required) if (!hashes.has(asset)) throw new Error(`Release checksum missing: ${asset}`);
  const imageVersion = tag.replace(/^(?:bun-v|aphrody-v)/, "");
  return RELEASE_PATHS.flatMap(path => {
    const before = read(path);
    let after = before.replace(
      /ghcr\.io\/aphrody-labs\/bun:\d+\.\d+\.\d+(?:-aphrody\.\d+)?/g,
      `ghcr.io/aphrody-labs/bun:${imageVersion}`,
    );
    after = after.replace(/aphrody-v\d+\.\d+\.\d+-aphrody\.\d+|bun-v\d+\.\d+\.\d+/g, tag);
    if (path.endsWith("alpine/runtime.Dockerfile")) {
      for (const asset of required.slice(1)) {
        const name = asset.replace(/\.zip$/, "");
        const pattern = new RegExp(`(asset=${name} sum=)[a-f0-9]{64}(?= )`, "g");
        if (!pattern.test(after)) throw new Error(`Missing pinned Alpine asset: ${asset}`);
        after = after.replace(pattern, `$1${hashes.get(asset)}`);
      }
    }
    return before === after ? [] : [{ path, before, after, reason: "verified release artifact pin" }];
  });
}

export function sourceVersionPlan(root: string, version = DEFAULT_VERSION): Change[] {
  return sourceChanges(path => readFileSync(join(root, path), "utf8"), version);
}

export function applyChanges(root: string, changes: Change[]): void {
  // Check every input before writing any file: concurrent edits invalidate the plan.
  for (const change of changes) {
    if (readFileSync(join(root, change.path), "utf8") !== change.before)
      throw new Error(`Concurrent change: ${change.path}`);
  }
  for (const change of changes) {
    const path = join(root, change.path);
    const temporary = `${path}.version-sync-${process.pid}`;
    let created = false;
    try {
      writeFileSync(temporary, change.after, { flag: "wx" });
      created = true;
      if (readFileSync(path, "utf8") !== change.before) throw new Error(`Concurrent change: ${change.path}`);
      renameSync(temporary, path);
    } catch (error) {
      try {
        if (created) unlinkSync(temporary);
      } catch (cleanupError) {
        if ((cleanupError as NodeJS.ErrnoException).code !== "ENOENT")
          console.error(`Temporary file cleanup failed: ${temporary}`);
      }
      throw error;
    }
  }
}

function git(root: string, args: string[]): string {
  const result = Bun.spawnSync(["git", "-C", root, ...args], { stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  return result.stdout.toString();
}

function gh(args: string[]): string {
  const result = Bun.spawnSync(["gh", ...args], { stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  return result.stdout.toString();
}

export function inventory(root: string) {
  const files = git(root, [
    "ls-files",
    "-z",
    "scripts",
    ".github",
    ".buildkite",
    "dockerhub",
    ".devcontainer",
    "package.json",
    "packages/*/package.json",
  ])
    .split("\0")
    .filter(Boolean);
  const references: { path: string; line: number; value: string; role: string }[] = [];
  let scanned = 0;
  for (const path of files) {
    if (
      !/\.(?:ts|tsx|js|mjs|cjs|json|sh|ps1|cmd|bat|nu|py|rb|rs|c|cpp|h|zig|md|mdx|yml|yaml|toml)$|Dockerfile$/.test(
        path,
      )
    )
      continue;
    const contents = readFileSync(join(root, path), "utf8");
    scanned++;
    contents.split(/\r?\n/).forEach((line, index) => {
      if (
        !/(?:bun-version|BUN_VERSION|BUN_RELEASE|aphrody-v|bun-v|ghcr\.io\/aphrody-labs\/bun:|"version"\s*:|engines)/.test(
          line,
        )
      )
        return;
      const role =
        path.includes("/shell/") && path.endsWith(".json")
          ? "historical evidence"
          : RELEASE_PATHS.includes(path as (typeof RELEASE_PATHS)[number])
            ? "release artifact"
            : /bun-version|BUN_VERSION/.test(line)
              ? "bootstrap toolchain"
              : "manifest or release contract";
      references.push({ path, line: index + 1, value: line.trim(), role });
    });
  }
  return { scanned, references };
}

if (import.meta.main) {
  try {
    const { values } = parseArgs({
      args: Bun.argv.slice(2),
      options: {
        version: { type: "string", default: DEFAULT_VERSION },
        root: { type: "string", default: DEFAULT_ROOT },
        apply: { type: "boolean" },
        check: { type: "boolean" },
        audit: { type: "string" },
        "release-tag": { type: "string" },
        help: { type: "boolean" },
      },
      strict: true,
    });
    if (values.help) {
      console.log(
        "bun run bun:windows [--version 1.4.4] [--apply | --check] [--audit FILE] [--release-tag bun-v1.4.4] [--root CHECKOUT]\nDefault: print a plan. --release-tag verifies GitHub release/checksums before changing artifact pins. Native Windows only; no WSL, host deployment or publication.",
      );
      process.exit(0);
    }
    if (process.platform !== "win32") throw new Error("Run this command on native Windows");
    const windows = (await import("bun:windows")).default;
    const host = windows.systemInfo();
    if (values.apply && values.check) throw new Error("Choose --apply or --check");
    const root = realpathSync(values.root!);
    if (realpathSync(git(root, ["rev-parse", "--show-toplevel"]).trim()) !== root)
      throw new Error("--root must be the checkout root");
    const read = (path: string) => readFileSync(join(root, path), "utf8");
    const changes = sourceVersionPlan(root, values.version);
    if (values["release-tag"]) {
      const tag = values["release-tag"];
      const release = JSON.parse(gh(["api", `repos/aphrody-labs/bun/releases/tags/${encodeURIComponent(tag)}`]));
      if (release.draft || release.prerelease || release.tag_name !== tag)
        throw new Error("Expected a published stable release");
      const imageVersion = tag.replace(/^(?:bun-v|aphrody-v)/, "");
      const imageVersions = JSON.parse(
        gh(["api", "--paginate", "--slurp", "orgs/aphrody-labs/packages/container/bun/versions?per_page=100"]),
      ).flat();
      if (
        !imageVersions.some((image: { metadata?: { container?: { tags?: string[] } } }) =>
          image.metadata?.container?.tags?.includes(imageVersion),
        )
      ) {
        throw new Error(`Published GHCR image missing: ghcr.io/aphrody-labs/bun:${imageVersion}`);
      }
      const checksum = release.assets.find((asset: { name: string }) => asset.name === "SHA256SUMS.txt");
      if (!checksum) throw new Error("Release has no SHA256SUMS.txt");
      const sums = gh([
        "api",
        "-H",
        "Accept: application/octet-stream",
        `repos/aphrody-labs/bun/releases/assets/${checksum.id}`,
      ]);
      const releasePlan = releaseChanges(read, values.version!, tag, sums);
      for (const name of [
        "bun-linux-x64.zip",
        "bun-linux-x64-musl.zip",
        "bun-linux-x64-musl-baseline.zip",
        "bun-linux-aarch64-musl.zip",
      ]) {
        if (!release.assets.some((asset: { name: string }) => asset.name === name))
          throw new Error(`Release asset missing: ${name}`);
      }
      changes.push(...releasePlan);
    }
    const audit = inventory(root);
    const report = {
      root,
      version: values.version,
      platform: process.platform,
      host,
      runtime: Bun.version,
      mode: values.apply ? "apply" : values.check ? "check" : "plan",
      changes: changes.map(({ path, reason }) => ({ path, reason })),
      ...audit,
    };
    if (values.audit) {
      const destination = resolve(root, values.audit);
      if (git(root, ["ls-files", "--", destination]).trim())
        throw new Error("Audit output must not overwrite a tracked file");
      writeFileSync(destination, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
    }
    console.log(
      JSON.stringify(
        {
          ...report,
          references: `${audit.references.length} references (use --audit FILE for details)`,
        },
        null,
        2,
      ),
    );
    if (values.apply) applyChanges(root, changes);
    if (values.check && changes.length) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
