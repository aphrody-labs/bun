#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { assemble } from "./assemble.ts";
import { coreCandidates, selectCore, type NativeCore } from "./core.ts";
import { main as fetchInputs } from "./fetch.ts";
import { hostTarget } from "./install.ts";
import { readVendor, ROOT, run } from "./lib.ts";
import { smoke } from "./smoke.ts";

const ALL_STEPS = ["fetch", "core", "assemble", "smoke"] as const;
type Step = (typeof ALL_STEPS)[number];

export async function main(argv: string[]): Promise<number> {
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
  const wanted = value("--steps")?.split(",") ?? ["core", "assemble", "smoke"];
  if (!wanted.length || wanted.some(step => !ALL_STEPS.includes(step as Step)))
    throw new Error("steps must be fetch, core, assemble or smoke; the owner factory builds the core");
  const selection = { executable: value("--buv"), workspace: value("--workspace") };
  if (wanted.some(step => step !== "fetch")) coreCandidates(selection);
  if (wanted.includes("fetch") && !argv.includes("--allow-network")) throw new Error("fetch requires --allow-network");
  const vendor = await readVendor();
  const uv = vendor.sources.find(source => source.name === "uv");
  if (!uv?.embedded) throw new Error("vendor.json must identify UV as embedded in the core");
  const target = value("--target") ?? hostTarget();
  if (target !== hostTarget()) throw new Error("core runtime qualification requires the native host target");
  const revision = (await run(["git", "rev-parse", "HEAD"], { cwd: ROOT })).stdout.trim();
  if (!/^[0-9a-f]{40}$/.test(revision)) throw new Error("source revision is unavailable");
  const startedAt = new Date().toISOString();
  const steps: { name: string; ok: boolean; ms: number; error?: string }[] = [];
  let core: NativeCore | undefined;
  let artifact: string | undefined;
  let checked: Awaited<ReturnType<typeof smoke>> | undefined;
  for (const name of ALL_STEPS) {
    if (!wanted.includes(name)) continue;
    const started = performance.now();
    try {
      if (name === "fetch") {
        await fetchInputs(["--allow-network", ...(argv.includes("--skip-python") ? ["--skip-python"] : [])]);
      } else if (name === "core") {
        core = await selectCore(selection, uv.upstreamTag);
      } else if (name === "assemble") {
        core ??= await selectCore(selection, uv.upstreamTag);
        ({ artifact } = await assemble({
          root: ROOT,
          targetDir: resolve(value("--target-dir") ?? join(ROOT, "target")),
          out: resolve(value("--out") ?? process.env["BUV_ARTIFACTS"] ?? join(ROOT, "dist", "artifacts")),
          revision,
          toolchain: `${core.engine} ${core.webkit}`,
          target,
          core,
        }));
      } else {
        artifact ??= value("--artifact");
        if (!artifact) throw new Error("smoke requires --artifact or the assemble step");
        checked = await smoke(resolve(artifact), {
          expectUv: uv.upstreamTag,
          expectRuff: "0.16.10",
          expectPython: "3.12.15",
          wheel: value("--wheel"),
        });
        if (!checked.ok) throw new Error("artifact smoke qualification failed");
      }
      steps.push({ name, ok: true, ms: performance.now() - started });
    } catch (error) {
      steps.push({
        name,
        ok: false,
        ms: performance.now() - started,
        error: error instanceof Error ? error.message : String(error),
      });
      break;
    }
  }
  const ok = steps.length === wanted.length && steps.every(step => step.ok);
  const receipt = {
    schema: "aphrody.buv-forge/2",
    startedAt,
    finishedAt: new Date().toISOString(),
    revision,
    target,
    core,
    artifact,
    smoke: checked,
    steps,
    ok,
  };
  const receipts = resolve(process.env["BUV_RECEIPT_DIR"] ?? join(homedir(), ".buv", "receipts"));
  mkdirSync(receipts, { recursive: true });
  const path = join(receipts, `${revision.slice(0, 8)}-${startedAt.replaceAll(/[:.]/g, "-")}.json`);
  await Bun.write(path, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify({ receipt: path, ok, artifact }));
  return ok ? 0 : 1;
}

if (import.meta.main) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (error) {
    console.error(`forge: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
  }
}
