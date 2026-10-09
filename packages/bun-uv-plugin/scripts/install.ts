#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
import { cp, mkdir, realpath, rename, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

export function pluginDestination(env: Readonly<Record<string, string | undefined>> = process.env): string {
  return join(resolve(env["APHRODY_HOME"] ?? join(homedir(), ".aphrody")), "plugins", "bun-uv");
}

export async function installPlugin(options: {
  workspace: string;
  executable?: string;
  apply?: boolean;
  signal?: AbortSignal;
  env?: Readonly<Record<string, string | undefined>>;
}) {
  if (!options.workspace || options.workspace.includes("\0")) throw new Error("invalid Bun workspace path");
  const workspace = resolve(options.workspace);
  const source = join(workspace, "packages", "bun-uv-plugin");
  const destination = pluginDestination(options.env);
  options.signal?.throwIfAborted();
  const { coreCandidates, selectCore } = await import(
    pathToFileURL(join(workspace, "packages/buv/scripts/core.ts")).href
  );
  const selection = { workspace, executable: options.executable, env: options.env };
  const candidates: string[] = coreCandidates(selection);
  const manifests = await Promise.all([
    Bun.file(join(source, ".codex-plugin/plugin.json")).json(),
    Bun.file(join(source, ".claude-plugin/plugin.json")).json(),
  ]);
  if (manifests.some(manifest => manifest.name !== "bun-uv" || manifest.version !== "0.1.0"))
    throw new Error("unexpected private plugin identity");
  const plan = {
    source,
    destination,
    executable: candidates.length === 1 ? candidates[0]! : null,
    candidates,
    version: manifests[0].version,
    apply: options.apply === true,
  };
  if (!options.apply) return plan;
  options.signal?.throwIfAborted();
  const core = await selectCore(selection);
  const parent = resolve(destination, "..");
  await mkdir(parent, { recursive: true });
  const actualParent = await realpath(parent);
  const staged = join(actualParent, `.bun-uv.${crypto.randomUUID()}.partial`);
  const target = join(actualParent, "bun-uv");
  const backup = join(actualParent, `.bun-uv.${crypto.randomUUID()}.previous`);
  const owned = (path: string) => {
    const child = relative(actualParent, resolve(path));
    if (!child || child.includes(sep) || child.startsWith(".."))
      throw new Error("plugin target is outside the configured home");
  };
  for (const path of [staged, target, backup]) owned(path);
  let previous = false;
  try {
    await mkdir(staged);
    for (const directory of ["scripts", "skills", "references", ".codex-plugin", ".claude-plugin"]) {
      options.signal?.throwIfAborted();
      await cp(join(source, directory), join(staged, directory), { recursive: true, dereference: false });
    }
    for (const file of ["package.json", "tsconfig.json", "README.md", ".gitignore"])
      await cp(join(source, file), join(staged, file));
    manifests[1].lspServers.pyjs.command = core.executable;
    await Bun.write(join(staged, ".claude-plugin/plugin.json"), JSON.stringify(manifests[1], null, 2) + "\n");
    await Bun.write(
      join(staged, "workspace.json"),
      JSON.stringify(
        { workspace, core: { version: core.version, revision: core.revision, sha256: core.sha256, uv: core.uv } },
        null,
        2,
      ) + "\n",
    );
    options.signal?.throwIfAborted();
    try {
      await rename(target, backup);
      previous = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    try {
      await rename(staged, target);
    } catch (error) {
      if (previous) await rename(backup, target);
      throw error;
    }
    return {
      ...plan,
      executable: core.executable,
      installed: true,
      backup: previous ? backup : null,
      core: { version: core.version, sha256: core.sha256 },
    };
  } finally {
    owned(staged);
    await rm(staged, { recursive: true, force: true });
  }
}

export function parseInstallArgs(args: string[]) {
  const options: { workspace?: string; executable?: string; apply: boolean } = { apply: false };
  for (let index = 0; index < args.length; index++) {
    const argument = args[index]!;
    if (argument === "--apply") {
      options.apply = true;
      continue;
    }
    const equal = argument.indexOf("=");
    const flag = equal < 0 ? argument : argument.slice(0, equal);
    if (flag !== "--workspace" && flag !== "--buv") throw new Error(`unknown installation option: ${argument}`);
    const value = equal < 0 ? args[++index] : argument.slice(equal + 1);
    if (!value || value.startsWith("--") || value.includes("\0")) throw new Error(`${flag} requires a path`);
    if (flag === "--workspace") options.workspace = value;
    else options.executable = value;
  }
  return options;
}

if (import.meta.main) {
  const options = parseInstallArgs(process.argv.slice(2));
  const workspace =
    options.workspace ??
    process.env["BUV_WORKSPACE"] ??
    process.env["APHRODY_BUN_CHECKOUT"] ??
    resolve(import.meta.dir, "../../..");
  console.log(JSON.stringify(await installPlugin({ ...options, workspace })));
}
