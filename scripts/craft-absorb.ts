#!/usr/bin/env bun
/**
 * Brings Craft Anything and the Craft libraries into this repository, headless, with their history.
 *
 *   src/craft       storytold/craft-anything (engine, 320 tools, CLI, MCP server, setup)
 *   src/craft/libs  storytold/craft-libs (the format crates the engine reads files with)
 *
 * The first run of a source merges its upstream history and reads its tree under the prefix (the subtree merge
 * strategy, so the `git subtree` contrib command is not needed). Later runs merge with `-X subtree=<prefix>`. Every run
 * then removes what needs a window or a browser build, so a modify/delete conflict on a pull ends the same way, and
 * points the git dependencies between the two at the absorbed paths.
 *
 * Each tree keeps its upstream layout so pulls stay mechanical, and each is its own Cargo workspace, excluded from
 * Bun's, until its crates build under Bun's lints.
 *
 * Usage:
 *   bun scripts/craft-absorb.ts                    # every source, from the aphrody forks' main
 *   bun scripts/craft-absorb.ts --only libs        # one source
 *   bun scripts/craft-absorb.ts --ref <rev>        # a given branch, tag or commit
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

const repo = resolve(import.meta.dirname, "..");
const org = process.env.CRAFT_ORG ?? "https://github.com/aphrody-labs";

/** Manifest lines that start with these (dependency keys and patch entries) belong to the windowed editions. */
const guiKeys = ["craft-anything-ui-egui", "eframe", "egui", "ecolor", "emath", "epaint", "winit", "wgpu", "rfd", "arboard"];

interface Source {
  key: string;
  repo: string;
  prefix: string;
  /** Paths under the prefix that only the windowed or browser editions use. */
  drop: string[];
  /** Whole manifest tables to remove. */
  dropTables: string[];
}

const sources: Source[] = [
  {
    key: "anything",
    repo: "craft-anything",
    prefix: "src/craft",
    drop: [
      "apps/craft-anything",
      "apps/craft-anything-web",
      "crates/ui-egui",
      "vendor/wgpu-hal",
      "packaging",
      ".github",
      ".githooks",
      ".coderabbit.yaml",
      ".cargo",
    ],
    dropTables: ["[profile.web-release]", "[patch.crates-io]"],
  },
  {
    key: "libs",
    repo: "craft-libs",
    prefix: "src/craft/libs",
    drop: [".github", ".coderabbit.yaml", ".cargo", ".config"],
    dropTables: [],
  },
];

const { values } = parseArgs({
  options: { ref: { type: "string", default: "main" }, only: { type: "string" } },
});

async function git(...args: string[]): Promise<string> {
  const proc = Bun.spawn(["git", ...args], { cwd: repo, stdout: "pipe", stderr: "inherit" });
  const [out, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
  if (code !== 0) throw new Error(`git ${args.join(" ")} exited with ${code}`);
  return out.trim();
}

async function absorb(source: Source, ref: string): Promise<void> {
  const remote = `${org}/${source.repo}.git`;
  const added = existsSync(join(repo, source.prefix, "Cargo.toml"));
  const message = `craft: ${added ? "pull" : "add"} ${source.repo} ${ref} from ${remote}`;
  await git("fetch", "-q", "--no-tags", remote, ref);
  if (added) {
    await git("merge", "-q", "--no-edit", "-X", `subtree=${source.prefix}`, "-m", message, "FETCH_HEAD");
  } else {
    await git("merge", "-q", "-s", "ours", "--no-commit", "--allow-unrelated-histories", "FETCH_HEAD");
    await git("read-tree", `--prefix=${source.prefix}/`, "-u", "FETCH_HEAD");
    await git("commit", "-q", "-m", message);
  }

  const guiCrates = windowedCrates(join(repo, source.prefix));
  const drop = [...source.drop, ...guiCrates.map(c => `crates/${c}`)];
  const present = drop.filter(p => existsSync(join(repo, source.prefix, p)));
  if (present.length > 0) await git("rm", "-r", "-q", "--", ...present.map(p => `${source.prefix}/${p}`));

  const dropKeys = [...guiKeys, ...guiCrates.map(c => `craft-${c}`)];
  await rewrite(`${source.prefix}/Cargo.toml`, text => headlessManifest(text, dropKeys, source.dropTables));
  await commitStaged(`craft: headless ${source.repo} (no window crates, web build or desktop packaging)`);
}

async function commitStaged(message: string): Promise<void> {
  if ((await git("diff", "--cached", "--name-only")) !== "") await git("commit", "-q", "-m", message);
}

/**
 * The crates under `crates/` that need a window: those naming a GUI dependency, then, until nothing changes, those
 * naming one of them.
 */
function windowedCrates(root: string): string[] {
  const dir = join(root, "crates");
  if (!existsSync(dir)) return [];
  const manifests = new Map<string, string>();
  for (const name of readdirSync(dir)) {
    const path = join(dir, name, "Cargo.toml");
    if (existsSync(path)) manifests.set(name, readFileSync(path, "utf8"));
  }
  const names = (text: string, keys: string[]) =>
    keys.some(key => new RegExp(`^${key.replace(/[-]/g, "\\-")}(-[a-z_-]+)?\\s*[=.]`, "m").test(text));
  const out = new Set<string>();
  for (const [name, text] of manifests) if (names(text, guiKeys)) out.add(name);
  for (let grew = true; grew; ) {
    grew = false;
    const keys = [...out].map(c => `craft-${c}`);
    for (const [name, text] of manifests) {
      if (!out.has(name) && keys.some(key => new RegExp(`^${key}\\s*[=.]`, "m").test(text))) {
        out.add(name);
        grew = true;
      }
    }
  }
  return [...out].sort();
}

/** Removes the given dependency keys and tables, each with the comment block above it. */
function headlessManifest(text: string, dropKeys: string[], dropTables: string[]): string {
  const out: string[] = [];
  let comments: string[] = [];
  let inDroppedTable = false;
  for (const line of text.split("\n")) {
    if (line.startsWith("#")) {
      comments.push(line);
      continue;
    }
    if (line.startsWith("[")) inDroppedTable = dropTables.some(table => line.startsWith(table));
    const key = line.match(/^([A-Za-z0-9_-]+)\s*=/)?.[1];
    const dropped =
      inDroppedTable || (key !== undefined && dropKeys.some(k => key === k || key.startsWith(`${k}-`) || key.startsWith(`${k}_`)));
    if (!dropped) out.push(...comments, line);
    comments = [];
  }
  out.push(...comments);
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

/** Points Craft Anything's git dependencies on craft-libs at `src/craft/libs`. */
function localLibs(text: string): string {
  return text.replace(
    /^(craft-([a-z0-9-]+)) = \{ git = "https:\/\/github\.com\/storytold\/craft-libs"[^}]*\}/gm,
    (_line, pkg: string, dir: string) => `${pkg} = { path = "libs/crates/${dir}" }`,
  );
}

async function rewrite(path: string, edit: (text: string) => string): Promise<void> {
  const file = join(repo, path);
  const before = readFileSync(file, "utf8");
  const after = edit(before);
  if (after === before) return;
  writeFileSync(file, after);
  await git("add", "--", path);
}

async function main(): Promise<void> {
  if ((await git("status", "--porcelain", "--untracked-files=no")) !== "") {
    throw new Error("the work tree has tracked changes; commit them first");
  }
  const chosen = sources.filter(s => values.only === undefined || s.key === values.only);
  if (chosen.length === 0) throw new Error(`no source named ${values.only}`);
  for (const source of chosen) await absorb(source, values.ref!);

  if (existsSync(join(repo, "src/craft/libs/Cargo.toml"))) await rewrite("src/craft/Cargo.toml", localLibs);
  await rewrite("Cargo.toml", root =>
    root.replace(/^exclude = \[([^\]]*)\]/m, (line, list: string) =>
      list.includes('"src/craft"') ? line : `exclude = [${list}, "src/craft"]`,
    ),
  );

  await commitStaged("craft: Craft Anything builds against src/craft/libs; Bun's workspace leaves src/craft out");
  console.log(await git("log", "-1", "--format=%h %s"));
}

await main();
