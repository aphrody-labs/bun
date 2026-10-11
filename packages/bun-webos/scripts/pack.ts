#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const args = Bun.argv.slice(2);
const flag = (name: string) => {
  const at = args.indexOf(name);
  return at < 0 ? undefined : args[at + 1];
};
const source = resolve(import.meta.dir, "..");
const owner = resolve(flag("--tailwind-package") ?? join(source, "../bun-plugin-tailwind"));
const destination = flag("--output");
if (!destination) throw new Error("Provide --output <archive.tgz>");
const output = resolve(destination);
const temporary = await mkdtemp(join(tmpdir(), "bun-webos-pack-"));
const run = async (cwd: string, command: string[]) => {
  await using proc = Bun.spawn([process.execPath, ...command], {
    cwd,
    stdin: "ignore",
    stdout: "inherit",
    stderr: "inherit",
  });
  if ((await proc.exited) !== 0)
    throw new Error(`Packaging command failed: ${command[0]} ${command[1]}`);
};
try {
  const helper = join(temporary, "tailwind-owner.tgz");
  const sourceArchive = join(temporary, "webos-source.tgz");
  await run(owner, ["pm", "pack", "--ignore-scripts", "--quiet", "--filename", helper]);
  await run(source, ["pm", "pack", "--ignore-scripts", "--quiet", "--filename", sourceArchive]);
  await new Bun.Archive(await Bun.file(sourceArchive).bytes()).extract(temporary);
  const staged = join(temporary, "package");
  const manifestPath = join(staged, "package.json");
  const original = await Bun.file(manifestPath).text();
  const manifest = JSON.parse(original);
  manifest.dependencies["@aphrody/bun-plugin-tailwind"] = helper;
  delete manifest.devDependencies;
  await Bun.write(manifestPath, JSON.stringify(manifest, null, 2));
  await Bun.write(join(staged, "bun.lock"), Bun.file(join(source, "bun.lock")));
  await run(staged, ["install", "--backend=copyfile", "--ignore-scripts"]);
  const published = JSON.parse(original);
  published.dependencies["@aphrody/bun-plugin-tailwind"] = ">=0.1.0 <2";
  await Bun.write(manifestPath, JSON.stringify(published, null, 2) + "\n");
  await run(staged, ["pm", "pack", "--ignore-scripts", "--quiet", "--filename", output]);
  console.log(JSON.stringify({ archive: output, tailwindOwner: owner }));
} finally {
  await rm(temporary, { recursive: true, force: true });
}
