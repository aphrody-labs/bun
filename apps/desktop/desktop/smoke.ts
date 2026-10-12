#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Runs each built desktop exe with --smoke and checks its JSON report.
 *
 *   bun desktop/smoke.ts                 the host exe from desktop/dist
 *   bun desktop/smoke.ts --docker        also bun-webos-linux-x64 in aphrody/webos-desktop:ubuntu and
 *                                        bun-webos-linux-x64-musl in aphrody/webos-desktop:alpine (see Dockerfile)
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { DESKTOP_TARGETS, hostTarget } from "./build.ts";

interface SmokeReport {
  ok: boolean;
  compiled: boolean;
  platform: string;
  launchers: string[];
  window?: { width?: number; height?: number; windowState?: string };
}

const dist = join(import.meta.dir, "dist");
const runs: { name: string; cmd: string[] }[] = [];
const hostExe = join(dist, DESKTOP_TARGETS[hostTarget()]);
if (existsSync(hostExe)) runs.push({ name: hostTarget(), cmd: [hostExe, "--smoke"] });
if (Bun.argv.includes("--docker")) {
  for (const [image, target] of [
    ["aphrody/webos-desktop:ubuntu", "bun-linux-x64"],
    ["aphrody/webos-desktop:alpine", "bun-linux-x64-musl"],
  ] as const) {
    if (!existsSync(join(dist, DESKTOP_TARGETS[target]))) continue;
    runs.push({
      name: `${image} ${target}`,
      cmd: [
        "docker",
        "run",
        "--rm",
        "-v",
        `${dist}:/dist:ro`,
        image,
        "xvfb-run",
        "-a",
        `/dist/${DESKTOP_TARGETS[target]}`,
        "--smoke",
      ],
    });
  }
}
if (runs.length === 0) throw new Error(`no desktop exe in ${dist}; run bun desktop/build.ts first`);

let failed = 0;
for (const run of runs) {
  const proc = Bun.spawn({ cmd: run.cmd, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  const line = stdout.trim().split("\n").at(-1) ?? "";
  let report: SmokeReport | undefined;
  try {
    report = JSON.parse(line);
  } catch {}
  const ok = exitCode === 0 && report?.ok === true && report.compiled && report.launchers.length >= 7;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${run.name} exit=${exitCode} ${line}`);
  if (!ok && stderr) console.log(stderr.trim().split("\n").slice(-20).join("\n"));
}
process.exit(failed ? 1 : 0);
