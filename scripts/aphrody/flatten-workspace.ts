#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
// Folds a nested Cargo workspace into the root workspace of the checkout: every member keeps its
// resolved package fields, dependency specifications and lints inline (nothing inherits from the
// root tables by accident), the nested [workspace] tables, lockfile and toolchain file go away and
// the members join the root `members` list.
//
//   bun scripts/aphrody/flatten-workspace.ts <workspace-dir> [--dry-run]
import { existsSync, rmSync } from "node:fs";
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
      const dotted = line.match(/^(\s*)([A-Za-z0-9_-]+)\.workspace\s*=\s*true\s*$/);
      const table = line.match(/^(\s*)([A-Za-z0-9_-]+)\s*=\s*(\{.*\})\s*(#.*)?$/);
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
  if (!out.some(l => /^\[lints(\.[a-z]+)?\]$/.test(l.trim()))) out.push("", "[lints]");
  return out.join("\n");
}

/** Removes the [workspace*] and [profile*] tables of the nested root, keeping a root [package]. */
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

if (import.meta.main) {
  const { positionals, values } = parseArgs({ allowPositionals: true, options: { "dry-run": { type: "boolean" } } });
  const root = resolve(import.meta.dir, "../..");
  const wsDir = resolve(root, positionals[0] ?? "");
  const wsManifest = join(wsDir, "Cargo.toml");
  const wsText = await Bun.file(wsManifest).text();
  const ws = Bun.TOML.parse(wsText) as Table;
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
  const rootManifest = join(root, "Cargo.toml");
  let rootText = await Bun.file(rootManifest).text();
  const rel = (dir: string) => relative(root, dir).replaceAll("\\", "/");
  const rootMembers = ((Bun.TOML.parse(rootText) as Table).workspace as Table).members as string[];
  const added = dirs.map(rel).filter(m => !rootMembers.includes(m));
  rootText = rootText.replace(/^members = \[\n/m, `members = [\n${added.map(m => `  "${m}",\n`).join("")}`);
  rootText = rootText.replace(/^exclude = (\[[^\]]*\])/m, (_all, list: string) => {
    const kept = (JSON.parse(list) as string[]).filter(entry => resolve(root, entry) !== wsDir);
    return `exclude = ${JSON.stringify(kept).replaceAll('","', '", "')}`;
  });
  if (values["dry-run"]) {
    console.log(JSON.stringify({ members: dirs.map(rel), rootMembersAdded: added }, null, 1));
    process.exit(0);
  }
  for (const [file, text] of writes) {
    if (text === null) rmSync(file);
    else await Bun.write(file, text);
  }
  for (const stale of ["Cargo.lock", "rust-toolchain.toml", "rust-toolchain", ".cargo/config.toml"])
    if (existsSync(join(wsDir, stale))) rmSync(join(wsDir, stale));
  await Bun.write(rootManifest, rootText);
  console.log(`folded ${dirs.length} crates of ${rel(wsDir)} into the root workspace`);
}
