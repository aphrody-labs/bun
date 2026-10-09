#!/usr/bin/env bun
/**
 * Flux des prébuilts WebKit du fork (PLAN-ALPINE-BUN.md, chantier P).
 *
 *   bun scripts/aphrody/webkit-prebuilt.ts status
 *   bun scripts/aphrody/webkit-prebuilt.ts build  [--ref <sha|branche>] [--lanes <regex,regex|all>]
 *   bun scripts/aphrody/webkit-prebuilt.ts record [--sha <sha>]   # liste les assets de la release aphrody
 *   bun scripts/aphrody/webkit-prebuilt.ts bump   --sha <sha>     # WEBKIT_VERSION = sha (puis `record` après la CI)
 *
 * `build` lance `aphrody-prebuilts.yml` sur aphrody-labs/WebKit ; `record` écrit dans
 * `APHRODY_WEBKIT_PREBUILTS` (scripts/build/deps/webkit.ts) les archives publiées pour le sha, ce qui fait basculer
 * le build du fork sur ces archives (sinon oven-sh/WebKit reste la source).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const FORK = "aphrody-labs/WebKit";
const WEBKIT_TS = join(import.meta.dir, "..", "build", "deps", "webkit.ts");

function gh(...args: string[]): string {
  const p = Bun.spawnSync(["gh", ...args], { stdout: "pipe", stderr: "pipe" });
  if (p.exitCode !== 0) throw new Error(`gh ${args.join(" ")}: ${p.stderr.toString().trim()}`);
  return p.stdout.toString().trim();
}

function option(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

function pinnedSha(): string {
  const m = /export const WEBKIT_VERSION = "([0-9a-f]{40})"/.exec(readFileSync(WEBKIT_TS, "utf8"));
  if (!m) throw new Error("WEBKIT_VERSION introuvable dans webkit.ts");
  return m[1];
}

/** Archives `bun-webkit-*.tar.gz` de la release `autobuild-<sha>` de aphrody-labs/WebKit (publiée uniquement). */
export function publishedArchives(sha: string): string[] {
  let out: string;
  try {
    out = gh("api", `repos/${FORK}/releases/tags/autobuild-${sha}`, "--jq", "[.draft, (.assets[].name)] | @tsv");
  } catch {
    return [];
  }
  const [draft, ...names] = out.split(/\s+/);
  if (draft === "true") return [];
  return names
    .filter(n => n.endsWith(".tar.gz"))
    .map(n => n.slice(0, -".tar.gz".length))
    .sort();
}

const cmd = process.argv[2];
if (cmd === "status") {
  const sha = pinnedSha();
  console.log(`WEBKIT_VERSION  ${sha}`);
  console.log(
    `fork vs upstream ${gh("api", `repos/${FORK}/compare/main...oven-sh:WebKit:main`, "--jq", '"\\(.status) ahead=\\(.ahead_by) behind=\\(.behind_by)"')}`,
  );
  const archives = publishedArchives(sha);
  console.log(`archives aphrody pour ${sha.slice(0, 12)}: ${archives.length}`);
  for (const a of archives) console.log(`  ${a}`);
} else if (cmd === "build") {
  const ref = option("--ref") ?? pinnedSha();
  const args = ["workflow", "run", "aphrody-prebuilts.yml", "-R", FORK, "-f", `ref=${ref}`];
  const lanes = option("--lanes");
  if (lanes) args.push("-f", `lanes=${lanes}`);
  gh(...args);
  console.log(`lancé: ${ref}${lanes ? ` lanes=${lanes}` : ""} -> gh run list -R ${FORK}`);
} else if (cmd === "record") {
  const sha = option("--sha") ?? pinnedSha();
  const archives = publishedArchives(sha);
  if (archives.length === 0) throw new Error(`aucune release publiée autobuild-${sha} sur ${FORK}`);
  const src = readFileSync(WEBKIT_TS, "utf8");
  const re =
    /(export const APHRODY_WEBKIT_PREBUILTS: Readonly<Record<string, readonly string\[\]>> = )\{[\s\S]*?\n?\};/;
  if (!re.test(src)) throw new Error("APHRODY_WEBKIT_PREBUILTS introuvable dans webkit.ts");
  const current = (() => {
    const m = /APHRODY_WEBKIT_PREBUILTS[^=]*= (\{[\s\S]*?\n?\});/.exec(src)![1];
    return Function(`return (${m})`)() as Record<string, string[]>;
  })();
  current[sha] = archives;
  const body = Object.entries(current)
    .map(([k, v]) => `  "${k}": [\n${v.map(n => `    "${n}",`).join("\n")}\n  ],`)
    .join("\n");
  writeFileSync(WEBKIT_TS, src.replace(re, `$1{\n${body}\n};`));
  console.log(`${archives.length} archives enregistrées pour ${sha}`);
} else if (cmd === "bump") {
  const sha = option("--sha");
  if (!sha || !/^[0-9a-f]{40}$/.test(sha)) throw new Error("--sha <40 hex> requis");
  const src = readFileSync(WEBKIT_TS, "utf8");
  writeFileSync(WEBKIT_TS, src.replace(/(export const WEBKIT_VERSION = ")[0-9a-f]{40}(")/, `$1${sha}$2`));
  console.log(`WEBKIT_VERSION = ${sha}`);
} else {
  console.error("usage: webkit-prebuilt.ts status | build [--ref] [--lanes] | record [--sha] | bump --sha");
  process.exit(2);
}
