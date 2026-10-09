#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
//! Stages one qualified native core as Buv and PyJS, with optional target-matched components.

import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, renameSync } from "node:fs";
import { join, resolve } from "node:path";
import { selectCore, validateCore, type NativeCore } from "./core.ts";
import { hostTarget } from "./install.ts";
import { minorOf, readVendor, ROOT, run, sha256File, workspaceVersion } from "./lib.ts";
import { buildManifest, MANIFEST_PATH, type Manifest } from "./manifest.ts";

export interface AssembleOptions {
  root: string;
  targetDir: string;
  out: string;
  revision: string;
  toolchain: string;
  target?: string;
  executable?: string;
  workspace?: string;
  core?: NativeCore;
}

/** Licence files copied from the fork checkouts and the repository into share/buv/licenses. */
const LICENSES: Record<string, string[]> = {
  uv: ["vendor/uv/LICENSE-APACHE", "vendor/uv/LICENSE-MIT"],
  ruff: ["vendor/ruff/LICENSE"],
  pyo3: ["vendor/pyo3/LICENSE-APACHE", "vendor/pyo3/LICENSE-MIT"],
  buv: ["LICENSE", "NOTICE"],
  bun: ["../../LICENSE"],
  webkit: ["../../vendor/WebKit/Source/JavaScriptCore/COPYING", "../../vendor/WebKit/Source/WTF/COPYING.LIB"],
};

export async function assemble(options: AssembleOptions): Promise<{ artifact: string; manifest: Manifest }> {
  const { root, targetDir, out, revision, toolchain } = options;
  const vendor = await readVendor(root);
  const version = await workspaceVersion(root);
  const target = options.target ?? hostTarget();
  const uv = vendor.sources.find(source => source.name === "uv");
  if (!uv?.embedded) throw new Error("UV must be embedded in the native core");
  const core =
    options.core ??
    (await selectCore({ executable: options.executable, workspace: options.workspace }, uv.upstreamTag));
  validateCore(core);
  if (
    !/^[0-9a-f]{64}$/.test(core.sha256) ||
    !new RegExp(`^uv ${uv.upstreamTag.replaceAll(".", "\\.")}(?:\\s|$)`).test(core.uv)
  )
    throw new Error("invalid qualified core provenance");
  if ((await sha256File(core.executable)) !== core.sha256) throw new Error("qualified core binary changed");
  const release = vendor.releases.find(entry => entry.name === "python-build-standalone");
  if (!release) throw new Error("vendor.json has no python-build-standalone release");
  const python = release.defaultPython;
  const minor = minorOf(python);
  const prefix = join(root, "build", "python");
  const hasPython = existsSync(prefix);
  if (hasPython && release.target !== target)
    throw new Error(`pinned CPython target ${release.target} differs from ${target}`);
  if (hasPython && !existsSync(join(prefix, "lib", `libpython${minor}.so.1.0`)))
    throw new Error("build/python is incomplete: run `bun scripts/fetch.ts` first");
  const name = `${version}-${revision.slice(0, 8)}`;
  const final = join(out, name);
  const staging = `${final}.partial`;
  if (existsSync(staging)) throw new Error(`staging artifact already exists; inspect it first: ${staging}`);
  if (existsSync(final)) throw new Error(`artifact is immutable and already exists: ${final}`);
  mkdirSync(out, { recursive: true });
  if (hasPython) cpSync(prefix, staging, { recursive: true, verbatimSymlinks: true, preserveTimestamps: true });
  mkdirSync(join(staging, "bin"), { recursive: true });
  const extension = target.includes("windows") ? ".exe" : "";
  for (const binary of ["buv", "pyjs"]) {
    const destination = join(staging, "bin", `${binary}${extension}`);
    copyFileSync(core.executable, destination);
    chmodSync(destination, 0o755);
  }
  const ruff = join(targetDir, "release", `ruff${extension}`);
  const hasRuff = existsSync(ruff);
  if (hasRuff) {
    copyFileSync(ruff, join(staging, "bin", `ruff${extension}`));
    chmodSync(join(staging, "bin", `ruff${extension}`), 0o755);
  }
  for (const [part, files] of Object.entries(LICENSES)) {
    const destination = join(staging, "share", "buv", "licenses", part);
    mkdirSync(destination, { recursive: true });
    for (const file of files) {
      const source = file.startsWith("vendor/uv/")
        ? join(root, uv.path, file.slice("vendor/uv/".length))
        : join(root, file);
      if (existsSync(source)) copyFileSync(source, join(destination, file.split("/").at(-1) as string));
    }
  }
  const pins: Record<string, unknown> = Object.fromEntries(
    vendor.sources.map(source => [
      source.name,
      { upstreamTag: source.upstreamTag, ref: source.ref, forkBranch: source.forkBranch },
    ]),
  );
  pins["python"] = {
    version: python,
    release: release.tag,
    sha256: release.assets.find(asset => asset.python === python && asset.name.endsWith("install_only_stripped.tar.gz"))
      ?.sha256,
  };
  const manifest = await buildManifest(staging, {
    schema: 1,
    name: "buv-runtime",
    version,
    target,
    toolchain,
    revision,
    pins,
    compatibility: { cliMajor: Number(version.split(".")[0]) },
    capabilities: ["javascript", "uv", ...(hasRuff ? ["ruff"] : []), ...(hasPython ? ["python-prefix"] : [])],
    nativeCore: core,
  });
  for (const binary of ["buv", "pyjs"]) {
    if (manifest.files[`bin/${binary}${extension}`]?.sha256 !== core.sha256)
      throw new Error("staged core binary differs from qualification");
  }
  mkdirSync(join(staging, "share", "buv"), { recursive: true });
  await Bun.write(join(staging, MANIFEST_PATH), `${JSON.stringify(manifest, null, 2)}\n`);
  renameSync(staging, final);
  return { artifact: final, manifest };
}

function parse(argv: string[]): AssembleOptions {
  const value = (flag: string): string | undefined => {
    const equal = argv.find(arg => arg.startsWith(`${flag}=`));
    if (equal !== undefined) {
      const result = equal.slice(flag.length + 1);
      if (!result) throw new Error(`${flag} requires a value`);
      return result;
    }
    const index = argv.indexOf(flag);
    if (index < 0) return undefined;
    const result = argv[index + 1];
    if (!result || result.startsWith("--")) throw new Error(`${flag} requires a value`);
    return result;
  };
  const targetDir = value("--target-dir");
  const out = value("--out");
  if (!targetDir || !out)
    throw new Error(
      "usage: assemble.ts --target-dir <dir> --out <dir> [--buv <executable> | --workspace <checkout>] [--revision <sha>] [--toolchain <text>]",
    );
  return {
    root: resolve(value("--root") ?? ROOT),
    targetDir: resolve(targetDir),
    out: resolve(out),
    revision: value("--revision") ?? "unknown",
    toolchain: value("--toolchain") ?? "unknown",
    target: value("--target"),
    executable: value("--buv"),
    workspace: value("--workspace"),
  };
}

if (import.meta.main) {
  try {
    const options = parse(process.argv.slice(2));
    if (options.revision === "unknown") {
      options.revision = (await run(["git", "rev-parse", "HEAD"], { cwd: options.root })).stdout.trim();
    }
    if (options.toolchain === "unknown") {
      options.toolchain = (await run(["rustc", "--version"])).stdout.trim();
    }
    const { artifact, manifest } = await assemble(options);
    console.log(
      JSON.stringify({
        artifact,
        files: Object.keys(manifest.files).length,
        links: Object.keys(manifest.links).length,
      }),
    );
  } catch (error) {
    console.error(`assemble: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
