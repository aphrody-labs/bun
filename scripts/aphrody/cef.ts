#!/usr/bin/env bun
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

export const CEF_VERSION = "152.3.0";
export const CEF_CHROMIUM_VERSION = "152.0.7977.83";
export const CHROMIUM_REVISION = "e20c553087353010f4b71143841c189447ac1628";

export interface CEFLayout {
  root: string;
  chromiumSource: string;
  cache: string;
  distribution: string;
  marker: string;
  target: string;
}

function targetTriple(platform = process.platform, arch = process.arch): string {
  if (platform === "win32" && arch === "x64") return "x86_64-pc-windows-msvc";
  if (platform === "win32" && arch === "arm64") return "aarch64-pc-windows-msvc";
  if (platform === "darwin" && arch === "arm64") return "aarch64-apple-darwin";
  if (platform === "darwin") return "x86_64-apple-darwin";
  if (platform === "linux" && arch === "arm64") return "aarch64-unknown-linux-gnu";
  if (platform === "linux") return "x86_64-unknown-linux-gnu";
  throw new Error(`CEF n'est pas supporté pour ${platform}/${arch}`);
}

function marker(platform = process.platform): string {
  if (platform === "win32") return "libcef.dll";
  if (platform === "darwin") return "Chromium Embedded Framework.framework";
  if (platform === "linux") return "libcef.so";
  throw new Error(`CEF n'est pas supporté pour ${platform}`);
}

export function repoRoot(from = import.meta.dir): string {
  return resolve(from, "../..");
}

export function layout(env: NodeJS.ProcessEnv = process.env): CEFLayout {
  const root = repoRoot();
  const target = targetTriple();
  const cache = resolve(env.CEF_CACHE ?? join(root, "build", "cef-cache"));
  const explicit = env.CEF_PATH ? resolve(env.CEF_PATH) : undefined;
  const distribution = explicit ?? join(cache, CEF_VERSION, target);
  return {
    root,
    chromiumSource: join(root, "vendor", "chromium", "src"),
    cache,
    distribution,
    marker: marker(),
    target,
  };
}

export function validate(layoutValue = layout()): string[] {
  const errors: string[] = [];
  if (!existsSync(layoutValue.chromiumSource)) errors.push(`Chromium source absent: ${layoutValue.chromiumSource}`);
  if (!existsSync(join(layoutValue.chromiumSource, ".gn"))) errors.push("Chromium source non configuré (.gn absent)");
  if (!existsSync(layoutValue.distribution)) errors.push(`Distribution CEF absente: ${layoutValue.distribution}`);
  if (!existsSync(join(layoutValue.distribution, layoutValue.marker)))
    errors.push(`Fichier CEF absent: ${join(layoutValue.distribution, layoutValue.marker)}`);
  return errors;
}

export function environment(layoutValue = layout(), current: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env = { ...current, CEF_PATH: layoutValue.distribution };
  env.BUN_CHROMIUM_SOURCE = layoutValue.chromiumSource;
  env.BUN_CEF_VERSION = CEF_VERSION;
  env.BUN_CEF_CHROMIUM_VERSION = CEF_CHROMIUM_VERSION;
  env.BUN_CHROMIUM_REVISION = CHROMIUM_REVISION;
  return env;
}

export function plan(env: NodeJS.ProcessEnv = process.env) {
  const value = layout(env);
  return {
    ...value,
    cefVersion: CEF_VERSION,
    chromiumVersion: CEF_CHROMIUM_VERSION,
    chromiumRevision: CHROMIUM_REVISION,
    valid: validate(value).length === 0,
    errors: validate(value),
  };
}

function help() {
  console.log(`Usage: bun cef <doctor|plan|env>\n\nCEF est résolu via CEF_PATH, sinon build/cef-cache/<version>/<target>.`);
}

if (import.meta.main) {
  const command = process.argv[2] ?? "help";
  if (command === "help" || command === "-h") help();
  else if (command === "plan") console.log(JSON.stringify(plan(), null, 2));
  else if (command === "env") console.log(JSON.stringify(environment(), null, 2));
  else if (command === "doctor") {
    const result = plan();
    console.log(JSON.stringify(result, null, 2));
    if (!result.valid) process.exitCode = 1;
  } else {
    console.error(`Commande CEF inconnue: ${command}`);
    process.exitCode = 2;
  }
}
