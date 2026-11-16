#!/usr/bin/env bun
/**
 * Brings Craft Anything into this repository as `src/craft`, headless, with its history.
 *
 * The first run merges the upstream history and reads its tree into `src/craft` (the subtree merge strategy, so the
 * `git subtree` contrib command is not needed). Later runs merge with `-X subtree=src/craft`. Every run then
 * removes the parts that need a window or a browser build (the egui app, its UI crate, the Trunk web app, the wgpu-hal
 * patch and the desktop packaging), so a modify/delete conflict on a pull ends the same way.
 *
 * The tree keeps its upstream layout (`src/craft/crates/*`, `src/craft/apps/craft-anything-cli`) so pulls stay
 * mechanical. It is its own Cargo workspace, excluded from Bun's, until each crate builds with Bun's lints.
 *
 * Usage:
 *   bun scripts/craft-absorb.ts              # add or pull from the aphrody fork's main
 *   bun scripts/craft-absorb.ts --ref <rev>  # a given branch, tag or commit
 *   CRAFT_REMOTE=<url> bun scripts/craft-absorb.ts
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

const repo = resolve(import.meta.dirname, "..");
const prefix = "src/craft";
const remote = process.env.CRAFT_REMOTE ?? "https://github.com/aphrody-labs/craft-anything.git";

/** Paths under `src/craft` that only the windowed or browser editions use. */
const headlessDrop = [
  "apps/craft-anything",
  "apps/craft-anything-web",
  "crates/ui-egui",
  "vendor/wgpu-hal",
  "packaging",
  ".github",
  ".githooks",
  ".coderabbit.yaml",
  ".cargo",
] as const;

/** Workspace dependencies that only the dropped crates name. */
const guiDeps = ["eframe", "egui", "egui_extras", "egui_kittest", "rfd", "arboard"] as const;

/** Manifest tables for the browser build and the wgpu-hal patch. */
const guiTables = ["[profile.web-release]", "[patch.crates-io]"] as const;

const { values } = parseArgs({ options: { ref: { type: "string", default: "main" } } });

async function git(...args: string[]): Promise<string> {
  const proc = Bun.spawn(["git", ...args], { cwd: repo, stdout: "pipe", stderr: "inherit" });
  const [out, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
  if (code !== 0) throw new Error(`git ${args.join(" ")} exited with ${code}`);
  return out.trim();
}

async function main(): Promise<void> {
  if ((await git("status", "--porcelain", "--untracked-files=no")) !== "") {
    throw new Error("the work tree has tracked changes; commit them first");
  }
  const ref = values.ref!;
  const added = existsSync(join(repo, prefix));
  const message = `craft: ${added ? "pull" : "add"} Craft Anything ${ref} from ${remote}`;
  await git("fetch", "-q", "--no-tags", remote, ref);
  if (added) {
    await git("merge", "-q", "--no-edit", "-X", `subtree=${prefix}`, "-m", message, "FETCH_HEAD");
  } else {
    await git("merge", "-q", "-s", "ours", "--no-commit", "--allow-unrelated-histories", "FETCH_HEAD");
    await git("read-tree", `--prefix=${prefix}/`, "-u", "FETCH_HEAD");
    await git("commit", "-q", "-m", message);
  }

  const present = headlessDrop.filter(p => existsSync(join(repo, prefix, p)));
  if (present.length > 0) await git("rm", "-r", "-q", "--", ...present.map(p => `${prefix}/${p}`));

  const manifest = join(repo, prefix, "Cargo.toml");
  const before = readFileSync(manifest, "utf8");
  const after = headlessManifest(before);
  if (after !== before) {
    writeFileSync(manifest, after);
    await git("add", "--", `${prefix}/Cargo.toml`);
  }

  const rootManifest = join(repo, "Cargo.toml");
  const root = readFileSync(rootManifest, "utf8");
  const excluded = root.replace(/^exclude = \[([^\]]*)\]/m, (line, list: string) =>
    list.includes(`"${prefix}"`) ? line : `exclude = [${list}, "${prefix}"]`,
  );
  if (excluded !== root) {
    writeFileSync(rootManifest, excluded);
    await git("add", "--", "Cargo.toml");
  }

  if ((await git("diff", "--cached", "--name-only")) !== "") {
    await git("commit", "-q", "-m", "craft: headless tree (no egui app, web app, wgpu-hal patch or desktop packaging)");
  }
  console.log(await git("log", "-1", "--format=%h %s"));
}

/** Drops the GUI dependencies and the wgpu-hal patch from the Craft Anything workspace manifest. */
function headlessManifest(text: string): string {
  const out: string[] = [];
  let comments: string[] = [];
  let inDroppedTable = false;
  for (const line of text.split("\n")) {
    if (line.startsWith("#")) {
      comments.push(line);
      continue;
    }
    if (line.startsWith("[")) inDroppedTable = guiTables.some(table => line.startsWith(table));
    const dropped = inDroppedTable || guiDeps.some(dep => line.startsWith(`${dep} = `));
    // A comment block belongs to the line under it and goes with it.
    if (!dropped) out.push(...comments, line);
    comments = [];
  }
  out.push(...comments);
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

await main();
