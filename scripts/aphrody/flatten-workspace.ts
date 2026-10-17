#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
// Folds a nested Cargo workspace into the root workspace of the checkout: every member keeps its
// resolved package fields, dependency specifications and lints inline (nothing inherits from the
// root tables by accident), the nested [workspace] tables, lockfile and toolchain file go away and
// the members join the root `members` list.
//
//   bun scripts/aphrody/flatten-workspace.ts <workspace-dir> [--heavy] [--migrate-tables] [--dry-run]
//   bun scripts/aphrody/flatten-workspace.ts --check
// --heavy: members that need system SDKs or download them in build scripts stay out of default-members.
// --migrate-tables: [profile.*], [patch.*] and [replace] entries of the nested root that the root
//   manifest lacks move into it; without it, or when the root declares them differently, the fold fails.
// --check: lists the committed Cargo.toml files outside the root `exclude` that still declare a
//   [workspace]; exits 1 if there is any.
// After a fold, `cargo metadata` refreshes Cargo.lock and every package whose version went back
// from the root or nested lockfile is reported (exit 1).
import { existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";

type Table = Record<string, unknown>;

/** TOML inline value for strings, numbers, booleans, arrays and inline tables. */
export function inline(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `[${value.map(inline).join(", ")}]`;
  if (value && typeof value === "object")
    return `{ ${Object.entries(value as Table)
      .map(([k, v]) => `${/^[A-Za-z0-9_-]+$/.test(k) ? k : JSON.stringify(k)} = ${inline(v)}`)
      .join(", ")} }`;
  throw new Error(`unsupported TOML value ${String(value)}`);
}

/** A workspace dependency spec as a table, with its path rebased from `from` to `to`. */
export function rebase(spec: unknown, from: string, to: string): Table {
  const table: Table = typeof spec === "string" ? { version: spec } : { ...(spec as Table) };
  if (typeof table.path === "string") table.path = relative(to, resolve(from, table.path)).replaceAll("\\", "/") || ".";
  return table;
}

/** Merges the member's own keys over the workspace spec: features add up, the rest overrides. */
export function merge(base: Table, own: Table): Table {
  const out: Table = { ...base };
  for (const [k, v] of Object.entries(own)) {
    if (k === "workspace") continue;
    if (k === "features" && Array.isArray(base.features))
      out.features = [...new Set([...(base.features as string[]), ...(v as string[])])];
    else out[k] = v;
  }
  return out;
}

const DEP_SECTION = /^\[(?:target\.[^\]]+\.)?(?:dev-|build-)?dependencies\]$/;

/** Rewrites one member manifest; returns the new text. */
export function rewriteMember(text: string, ws: Table, wsDir: string, memberDir: string): string {
  const wsPackage = ((ws.workspace as Table)?.package ?? {}) as Table;
  const wsDeps = ((ws.workspace as Table)?.dependencies ?? {}) as Table;
  const wsLints = ((ws.workspace as Table)?.lints ?? {}) as Table;
  const lines = text.split("\n");
  const out: string[] = [];
  let section = "";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const header = line.trim().match(/^\[[^\]]+\]$/)?.[0];
    if (header) {
      section = header;
      if (header === "[lints]") {
        const next = lines[i + 1]?.trim() ?? "";
        if (/^workspace\s*=\s*true$/.test(next)) {
          i++;
          for (const [tool, rules] of Object.entries(wsLints)) {
            out.push(`[lints.${tool}]`);
            for (const [rule, level] of Object.entries(rules as Table))
              out.push(`${/^[A-Za-z0-9_-]+$/.test(rule) ? rule : JSON.stringify(rule)} = ${inline(level)}`);
            out.push("");
          }
          if (Object.keys(wsLints).length === 0) out.push("[lints]");
          continue;
        }
      }
      out.push(line);
      continue;
    }
    if (section === "[package]") {
      const m =
        line.match(/^(\s*)([A-Za-z0-9_-]+)\.workspace\s*=\s*true\s*$/) ??
        line.match(/^(\s*)([A-Za-z0-9_-]+)\s*=\s*\{\s*workspace\s*=\s*true\s*\}\s*$/);
      if (m) {
        const value = wsPackage[m[2]!];
        if (value === undefined) throw new Error(`${memberDir}: workspace package field ${m[2]} is missing`);
        out.push(`${m[1]}${m[2]} = ${inline(value)}`);
        continue;
      }
    }
    const tableDep = section.match(/dependencies\.([A-Za-z0-9_-]+)\]$/);
    if (tableDep && /^\s*workspace\s*=\s*true\s*$/.test(line)) {
      const base = wsDeps[tableDep[1]!];
      if (base === undefined) throw new Error(`${memberDir}: workspace dependency ${tableDep[1]} is missing`);
      const later = lines.slice(i + 1).findIndex(l => /^\s*\[/.test(l));
      const ownKeys = new Set(
        lines.slice(i + 1, later < 0 ? undefined : i + 1 + later).map(l => l.match(/^\s*([A-Za-z0-9_-]+)\s*=/)?.[1]),
      );
      for (const [k, v] of Object.entries(rebase(base, wsDir, memberDir)))
        if (!ownKeys.has(k)) out.push(`${k} = ${inline(v)}`);
      continue;
    }
    if (DEP_SECTION.test(section)) {
      let joined = line;
      // A multi-line inline table: join it (dropping comments) until its braces balance.
      if (/^\s*[A-Za-z0-9_-]+\s*=\s*\{/.test(line)) {
        const depth = (s: string) => [...s].reduce((n, c) => n + (c === "{" ? 1 : c === "}" ? -1 : 0), 0);
        let open = depth(line.replace(/#.*$/, ""));
        let j = i;
        while (open > 0 && j + 1 < lines.length) {
          j++;
          const next = lines[j]!.replace(/#.*$/, "");
          joined += ` ${next.trim()}`;
          open += depth(next);
        }
        if (j > i && /workspace\s*=\s*true/.test(joined)) {
          i = j;
          joined = joined.replace(/,\s*([\]}])/g, " $1");
        } else joined = line;
      }
      const dotted = joined.match(/^(\s*)([A-Za-z0-9_-]+)\.workspace\s*=\s*true\s*$/);
      const table = joined.match(/^(\s*)([A-Za-z0-9_-]+)\s*=\s*(\{.*\})\s*(#.*)?$/);
      let name: string | undefined;
      let own: Table = {};
      let indent = "";
      if (dotted) [, indent, name] = dotted as unknown as [string, string, string];
      else if (table && /workspace\s*=\s*true/.test(table[3]!)) {
        indent = table[1]!;
        name = table[2]!;
        own = (Bun.TOML.parse(`x = ${table[3]}`) as Table).x as Table;
      }
      if (name) {
        const base = wsDeps[name];
        if (base === undefined) throw new Error(`${memberDir}: workspace dependency ${name} is missing`);
        out.push(`${indent}${name} = ${inline(merge(rebase(base, wsDir, memberDir), own))}`);
        continue;
      }
    }
    out.push(line);
  }
  // The root workspace has lints of its own: a member that declares none opts out explicitly.
  if (!out.some(l => /^\[lints(\.[a-z]+)?\]$/.test(l.trim()))) {
    while (out.length && out.at(-1)!.trim() === "") out.pop();
    out.push("", "[lints]", "");
  }
  return out.join("\n");
}

/** Removes the [workspace*], [profile*], [patch*] and [replace] tables of the nested root, keeping a root [package]. */
export function stripWorkspace(text: string): string | null {
  const parsed = Bun.TOML.parse(text) as Table;
  if (!parsed.package) return null;
  const out: string[] = [];
  let drop = false;
  for (const line of text.split("\n")) {
    const header = line.trim().match(/^\[\[?([^\]]+)\]\]?$/)?.[1];
    if (header) drop = /^(workspace|profile|patch|replace)(\.|$)/.test(header);
    if (!drop) out.push(line);
  }
  return out.join("\n");
}

/** One root-level table entry of a nested manifest that a fold would otherwise drop. */
export type ForeignTable = { key: string[]; value: unknown; conflict: boolean };

const sameValue = (a: unknown, b: unknown) => Bun.deepEquals(a, b, true);

/**
 * The `[profile.<name>]`, `[patch.<source>]` and `[replace]` entries of the nested manifest that
 * the root does not declare identically. `conflict` marks an entry the root declares with another
 * value: it cannot be migrated.
 */
export function foreignTables(nested: Table, root: Table): ForeignTable[] {
  const out: ForeignTable[] = [];
  const add = (key: string[], value: unknown, own: unknown) => {
    if (!sameValue(own, value)) out.push({ key, value, conflict: own !== undefined });
  };
  const rootProfiles = (root.profile ?? {}) as Table;
  for (const [name, value] of Object.entries((nested.profile ?? {}) as Table))
    add(["profile", name], value, rootProfiles[name]);
  const rootPatches = (root.patch ?? {}) as Table;
  for (const [source, crates] of Object.entries((nested.patch ?? {}) as Table))
    for (const [name, value] of Object.entries(crates as Table))
      add(["patch", source, name], value, (rootPatches[source] as Table | undefined)?.[name]);
  const rootReplace = (root.replace ?? {}) as Table;
  for (const [spec, value] of Object.entries((nested.replace ?? {}) as Table))
    add(["replace", spec], value, rootReplace[spec]);
  return out;
}

const tomlKey = (k: string) => (/^[A-Za-z0-9_-]+$/.test(k) ? k : JSON.stringify(k));

/** A patch or replace spec with its `path` rebased from the nested workspace to the root. */
function rebaseSpec(value: unknown, wsDir: string, root: string): unknown {
  return value && typeof value === "object" && typeof (value as Table).path === "string"
    ? rebase(value, wsDir, root)
    : value;
}

/** Appends one entry at the end of `[header]`, creating the table at the end of the manifest if absent. */
function insertUnder(text: string, header: string, line: string): string {
  const lines = text.split("\n");
  const at = lines.findIndex(l => l.trim() === header);
  if (at < 0) return `${text.replace(/\n*$/, "\n")}\n${header}\n${line}\n`;
  let end = at + 1;
  while (end < lines.length && !/^\s*\[/.test(lines[end]!)) end++;
  while (end > at + 1 && lines[end - 1]!.trim() === "") end--;
  lines.splice(end, 0, line);
  return lines.join("\n");
}

/** Writes foreign tables into the root manifest text; a conflicting entry throws. */
export function migrateTables(rootText: string, tables: ForeignTable[], wsDir: string, root: string): string {
  let text = rootText;
  for (const { key, value, conflict } of tables) {
    if (conflict) throw new Error(`${key.join(".")} differs from the root declaration`);
    if (key[0] === "profile") {
      const body = Object.entries(value as Table).map(([k, v]) => `${tomlKey(k)} = ${inline(v)}`);
      text = `${text.replace(/\n*$/, "\n")}\n[profile.${tomlKey(key[1]!)}]\n${body.join("\n")}\n`;
    } else if (key[0] === "patch")
      text = insertUnder(
        text,
        `[patch.${tomlKey(key[1]!)}]`,
        `${tomlKey(key[2]!)} = ${inline(rebaseSpec(value, wsDir, root))}`,
      );
    else text = insertUnder(text, "[replace]", `${JSON.stringify(key[1])} = ${inline(rebaseSpec(value, wsDir, root))}`);
  }
  return text;
}

/** Cargo's semver-compatible series of a version: `1`, `0.13` or `0.0.4`. */
export function compatSeries(version: string): string {
  const [major = "0", minor = "0", patch = "0"] = version.split(/[.+-]/);
  return major !== "0" ? major : minor !== "0" ? `0.${minor}` : `0.0.${patch}`;
}

/** Highest locked version of every `name@series` of a Cargo.lock. */
export function lockVersions(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const pkg of ((Bun.TOML.parse(text) as Table).package ?? []) as { name: string; version: string }[]) {
    const key = `${pkg.name}@${compatSeries(pkg.version)}`;
    const seen = out.get(key);
    if (!seen || Bun.semver.order(pkg.version, seen) > 0) out.set(key, pkg.version);
  }
  return out;
}

/**
 * Packages whose highest version in a semver-compatible series is lower after the fold than in
 * any lockfile before it. A series that disappears is a dropped requirement, not a downgrade.
 */
export function lockDowngrades(before: string[], after: string): { name: string; from: string; to: string }[] {
  const highest = new Map<string, string>();
  for (const text of before)
    for (const [key, version] of lockVersions(text)) {
      const seen = highest.get(key);
      if (!seen || Bun.semver.order(version, seen) > 0) highest.set(key, version);
    }
  const now = lockVersions(after);
  return [...highest]
    .flatMap(([key, from]) => {
      const to = now.get(key);
      const name = key.slice(0, key.lastIndexOf("@"));
      return to !== undefined && Bun.semver.order(to, from) < 0 ? [{ name, from, to }] : [];
    })
    .sort((a, b) => a.name.localeCompare(b.name) || Bun.semver.order(a.from, b.from));
}

/**
 * Manifests (root-relative, `/`-separated) that declare a `[workspace]` of their own, other than
 * the root manifest and those under a root `exclude` entry.
 */
export function nestedWorkspaces(manifests: string[], exclude: string[], read: (path: string) => string): string[] {
  const dirs = exclude.map(e => e.replaceAll("\\", "/").replace(/\/+$/, ""));
  const under = (path: string) => dirs.some(dir => path === dir || path.startsWith(`${dir}/`));
  return manifests
    .map(path => path.replaceAll("\\", "/"))
    .filter(path => path !== "Cargo.toml" && path.endsWith("/Cargo.toml") && !under(dirname(path)))
    .filter(path => {
      const text = read(path);
      try {
        return (Bun.TOML.parse(text) as Table).workspace !== undefined;
      } catch {
        return /^\s*\[workspace[.\]]/m.test(text);
      }
    })
    .sort();
}

if (import.meta.main) {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      "dry-run": { type: "boolean" },
      heavy: { type: "boolean" },
      check: { type: "boolean" },
      "migrate-tables": { type: "boolean" },
    },
  });
  const root = resolve(import.meta.dir, "../..");
  const rootManifest = join(root, "Cargo.toml");
  let rootText = await Bun.file(rootManifest).text();
  const rootParsed = Bun.TOML.parse(rootText) as Table;
  if (values.check) {
    // Committed manifests only: untracked work in progress belongs to its owner until it lands.
    const git = Bun.spawnSync(["git", "ls-files", "-z", "--", "*Cargo.toml"], { cwd: root, stderr: "inherit" });
    if (!git.success) process.exit(git.exitCode ?? 1);
    const manifests = git.stdout.toString().split("\0").filter(Boolean);
    const exclude = ((rootParsed.workspace as Table).exclude ?? []) as string[];
    const read = (path: string) => (existsSync(join(root, path)) ? readFileSync(join(root, path), "utf8") : "");
    const nested = nestedWorkspaces(manifests, exclude, read);
    for (const path of nested) console.log(path);
    process.exit(nested.length ? 1 : 0);
  }
  const wsDir = resolve(root, positionals[0] ?? "");
  const wsManifest = join(wsDir, "Cargo.toml");
  const wsText = await Bun.file(wsManifest).text();
  const ws = Bun.TOML.parse(wsText) as Table;
  // Profiles, patches and replacements only apply at a workspace root: a fold must not lose them.
  const foreign = foreignTables(ws, rootParsed);
  const conflicts = foreign.some(t => t.conflict);
  if (foreign.length && (conflicts || !values["migrate-tables"])) {
    const list = foreign.map(t => `  ${t.key.join(".")}${t.conflict ? " (differs from the root)" : ""}`);
    console.error(
      `${relative(root, wsManifest)} declares tables the root workspace lacks:\n${list.join("\n")}\n` +
        (conflicts
          ? "Reconcile them with the root manifest (for example as a named profile) before folding."
          : "Pass --migrate-tables to move them into the root manifest, or reconcile them first."),
    );
    process.exit(1);
  }
  const members = (((ws.workspace as Table)?.members ?? []) as string[]).flatMap(m =>
    m.includes("*") ? [...new Bun.Glob(`${m}/Cargo.toml`).scanSync({ cwd: wsDir })].map(p => dirname(p)) : [m],
  );
  const dirs = members.map(m => resolve(wsDir, m));
  if (ws.package && !dirs.includes(wsDir)) dirs.push(wsDir);
  const writes = new Map<string, string | null>();
  for (const dir of dirs) {
    const file = join(dir, "Cargo.toml");
    const text = dir === wsDir ? (stripWorkspace(wsText) ?? "") : await Bun.file(file).text();
    writes.set(file, rewriteMember(text, ws, wsDir, dir));
  }
  if (!ws.package) writes.set(wsManifest, null);
  rootText = migrateTables(rootText, foreign, wsDir, root);
  const rel = (dir: string) => relative(root, dir).replaceAll("\\", "/");
  const rootMembers = (rootParsed.workspace as Table).members as string[];
  const added = dirs.map(rel).filter(m => !rootMembers.includes(m));
  rootText = rootText.replace(/^members = \[\n/m, `members = [\n${added.map(m => `  "${m}",\n`).join("")}`);
  // Light crates join the targets of a bare cargo command; --heavy keeps them to explicit `-p` gates.
  if (!values.heavy)
    rootText = rootText.replace(
      /^default-members = \[\n/m,
      `default-members = [\n${added.map(m => `  "${m}",\n`).join("")}`,
    );
  rootText = rootText.replace(/^exclude = (\[[^\]]*\])/m, (_all, list: string) => {
    const kept = (JSON.parse(list) as string[]).filter(entry => resolve(root, entry) !== wsDir);
    return `exclude = ${JSON.stringify(kept).replaceAll('","', '", "')}`;
  });
  if (values["dry-run"]) {
    const migratedTables = foreign.map(t => t.key.join("."));
    console.log(JSON.stringify({ members: dirs.map(rel), rootMembersAdded: added, migratedTables }, null, 1));
    process.exit(0);
  }
  // Lock snapshot: the nested lockfile may pin newer versions than the root resolves to.
  const locks = [join(root, "Cargo.lock"), join(wsDir, "Cargo.lock")]
    .filter(file => existsSync(file))
    .map(file => readFileSync(file, "utf8"));
  for (const [file, text] of writes) {
    if (text === null) rmSync(file);
    else await Bun.write(file, text);
  }
  for (const stale of ["Cargo.lock", "rust-toolchain.toml", "rust-toolchain"])
    if (existsSync(join(wsDir, stale))) rmSync(join(wsDir, stale));
  await Bun.write(rootManifest, rootText);
  console.log(`folded ${dirs.length} crates of ${rel(wsDir)} into the root workspace`);
  const metadata = Bun.spawnSync(["cargo", "metadata", "--format-version", "1"], {
    cwd: root,
    stdout: "ignore",
    stderr: "inherit",
  });
  if (!metadata.success) process.exit(metadata.exitCode ?? 1);
  const downgrades = lockDowngrades(locks, readFileSync(join(root, "Cargo.lock"), "utf8"));
  if (downgrades.length) {
    console.error("Cargo.lock moved these packages back:");
    for (const { name, from, to } of downgrades) console.error(`  ${name} ${from} -> ${to}`);
    console.error("Raise the requirement or pin it with `cargo update -p <name> --precise <version>`.");
    process.exit(1);
  }
}
