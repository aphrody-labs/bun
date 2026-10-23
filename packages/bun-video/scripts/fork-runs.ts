#!/usr/bin/env bun
/**
 * Runs the fork scenes of src/apps/site/fork-scenes.ts with this runtime and records what each one printed, for the
 * showcase build (BUN_VIDEO_FORK_RUNS). Scenes that this platform cannot run are skipped; run the script on each
 * platform and merge the results.
 *
 *   bun scripts/fork-runs.ts --out runs-win32.json
 *   bun scripts/fork-runs.ts --only fork-linux --out runs-linux.json
 *   bun scripts/fork-runs.ts --merge runs-win32.json runs-linux.json --out fork-runs.json
 */
import { mkdtemp, rm } from "node:fs/promises";
import { release, tmpdir, version } from "node:os";
import { join, resolve } from "node:path";
import { forkScenes, type ForkRun, type ForkRuns } from "../src/apps/site/fork-scenes";

const args = Bun.argv.slice(2);
const outIndex = args.indexOf("--out");
if (outIndex < 0 || !args[outIndex + 1]) throw new Error("Pass --out <file>");
const out = resolve(args[outIndex + 1]!);
const repository = resolve(import.meta.dir, "../../..");

if (args[0] === "--merge") {
  const inputs = args.slice(1, outIndex);
  const runs = new Map<string, ForkRun>();
  for (const input of inputs) {
    const file = (await Bun.file(resolve(input)).json()) as ForkRuns;
    if (file.schema !== "bun-video/fork-runs/v1") throw new Error(`${input} is not a fork runs file`);
    // The first file that ran a scene keeps it; list the preferred platform first.
    for (const run of file.runs) if (!runs.has(run.id)) runs.set(run.id, run);
  }
  const merged: ForkRuns = { schema: "bun-video/fork-runs/v1", runs: forkScenes.flatMap(s => runs.get(s.id) ?? []) };
  await Bun.write(out, `${JSON.stringify(merged, null, 2)}\n`);
  console.log(`${merged.runs.length} runs: ${merged.runs.map(run => `${run.id} (${run.platform})`).join(", ")}`);
  process.exit(0);
}

const runs: ForkRun[] = [];
const onlyIndex = args.indexOf("--only");
const only = onlyIndex >= 0 ? new Set(args[onlyIndex + 1]?.split(",")) : null;
for (const scene of forkScenes) {
  if (!scene.platforms.includes(process.platform) || (only && !only.has(scene.id))) continue;
  const directory = await mkdtemp(join(tmpdir(), "bun-fork-scene-"));
  try {
    for (const [name, content] of Object.entries(scene.files)) await Bun.write(join(directory, name), content);
    for (const [name, path] of Object.entries(scene.fixtures ?? {}))
      await Bun.write(join(directory, name), Bun.file(join(repository, path)));
    const started = performance.now();
    const child = Bun.spawn([process.execPath, ...scene.args], {
      cwd: directory,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    const durationMs = Math.round(performance.now() - started);
    // A scene shows what the program printed; a failure is a broken scene, not something to film.
    if (exitCode !== 0 && scene.args[0] !== "n2b") throw new Error(`${scene.id} exited with ${exitCode}: ${stderr}`);
    runs.push({
      id: scene.id,
      platform: process.platform,
      os: `${version()} ${release()}`,
      bun: { version: Bun.version, revision: Bun.revision },
      command: `bun ${scene.args.join(" ")}`,
      exitCode,
      // The scene directory is temporary: show it as ".", including its Windows extended-length form.
      stdout: stdout.replaceAll(`\\\\?\\${directory}`, ".").replaceAll(directory, ".").replace(/\r\n/g, "\n").trimEnd(),
      durationMs,
    });
    console.log(`${scene.id}: exit ${exitCode}, ${durationMs} ms`);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
const file: ForkRuns = { schema: "bun-video/fork-runs/v1", runs };
await Bun.write(out, `${JSON.stringify(file, null, 2)}\n`);
