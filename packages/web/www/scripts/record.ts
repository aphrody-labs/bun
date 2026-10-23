#!/usr/bin/env bun
// Runs the programs shown in the home page terminal with this runtime and records what they print, so the page shows
// real output: command, exit code, text, platform and Bun version. A scene that this platform cannot run is skipped;
// run the script on each platform and merge the files into src/data/recorded.json.
//
//   bun scripts/record.ts --out runs-win32.json
//   bun scripts/record.ts --only video,linux --out runs-linux.json
//   bun scripts/record.ts --merge runs-win32.json runs-linux.json --out src/data/recorded.json
import { mkdtemp, rm } from "node:fs/promises";
import { release, tmpdir, version } from "node:os";
import { join, resolve } from "node:path";
import { SCENES, type Recorded } from "../src/data/scenes.ts";

const args = Bun.argv.slice(2);
const outIndex = args.indexOf("--out");
if (outIndex < 0 || !args[outIndex + 1]) throw new Error("Pass --out <file>");
const out = resolve(args[outIndex + 1]!);
const repository = resolve(import.meta.dir, "../../../..");

if (args[0] === "--merge") {
  const seen = new Map<string, Recorded>();
  for (const input of args.slice(1, outIndex))
    for (const run of (await Bun.file(resolve(input)).json()) as Recorded[])
      if (!seen.has(run.id)) seen.set(run.id, run);
  const merged = SCENES.flatMap(scene => seen.get(scene.id) ?? []);
  await Bun.write(out, `${JSON.stringify(merged, null, 2)}\n`);
  console.log(merged.map(run => `${run.id} (${run.platform})`).join(", "));
  process.exit(0);
}

const runs: Recorded[] = [];
const onlyIndex = args.indexOf("--only");
const only = onlyIndex >= 0 ? new Set(args[onlyIndex + 1]?.split(",")) : null;
for (const scene of SCENES) {
  if (!scene.platforms.includes(process.platform) || (only && !only.has(scene.id))) continue;
  const directory = await mkdtemp(join(tmpdir(), "bun-record-"));
  try {
    await Bun.write(join(directory, scene.file), scene.code);
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
    if (exitCode !== 0) throw new Error(`${scene.id} exited with ${exitCode}: ${stderr}`);
    runs.push({
      ...scene,
      platform: process.platform,
      os: process.platform === "win32" ? version().split(" ").slice(0, 3).join(" ") : `Linux ${release()}`,
      bun: Bun.version,
      output: stdout.replaceAll(directory, ".").replace(/\r\n/g, "\n").trimEnd(),
      durationMs: Math.round(performance.now() - started),
    });
    console.log(`${scene.id}: ${Math.round(performance.now() - started)} ms`);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
await Bun.write(out, `${JSON.stringify(runs, null, 2)}\n`);
