#!/usr/bin/env bun
// Miroir MSYS2 (C:/msys64) vers Aphrody Alpine (C:/aports) et Bun (C:/bun).
//
//   bun scripts/aphrody/msys2-mirror.ts inventory [--root C:/msys64] [--re]   regénère msys2-inventory.json
//   bun scripts/aphrody/msys2-mirror.ts verify [--json] [--min <pct>]       vérifie chaque équivalent, taux de couverture
//   bun scripts/aphrody/msys2-mirror.ts report                              regénère le tableau de M-msys2-mirror.md
//   bun scripts/aphrody/msys2-mirror.ts shell [--root C:/msys64]            scripts sh/bash MSYS2 analysés par Bun Shell
//
// L'inventaire lit C:/msys64 en lecture seule : paquets (var/lib/pacman/local/*/desc|files), et pour chaque
// fichier l'environnement, le paquet propriétaire, le type, le sha256 et, pour les PE, l'arch, le
// sous-système, les DLL importées (`aphrody re triage` quand le binaire installé expose `libraries`,
// sinon le lecteur PE ci-dessous) et la dépendance à msys-2.0.dll.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { MAP, windowsDefault, type Equivalent, type PackageMapping } from "./msys2-mirror-map.ts";

const BUN_ROOT = join(import.meta.dir, "..", "..");
const MERGE_DIR = join(BUN_ROOT, "docs", "aphrody", "merge");
const INVENTORY = join(MERGE_DIR, "msys2-inventory.json");
const REPORT_MD = join(MERGE_DIR, "M-msys2-mirror.md");
const APORTS = process.env.APHRODY_APORTS ?? "C:/aports";
const APORTS_UPSTREAM_REF = "origin/3.24-stable";

export const ENVS = ["msys", "ucrt64", "mingw64", "clang64", "clangarm64", "mingw32", "installer"] as const;
export type Env = (typeof ENVS)[number];
export type FileType = "pe" | "elf" | "script" | "lib" | "data";

export interface InventoryPackage {
  name: string;
  base: string;
  version: string;
  env: Env;
  desc: string;
  url: string;
  depends: string[];
  installedSize: number;
  files: number;
  explicit: boolean;
}

export interface InventoryFile {
  path: string;
  env: Env;
  pkg: string | null;
  type: FileType;
  size: number;
  sha256: string;
  arch?: string;
  subsystem?: string;
  dll?: boolean;
  dlls?: string[];
  msys?: boolean;
  interp?: string;
  maxEntropy?: number;
}

export interface Inventory {
  generated: string;
  root: string;
  installer: { version: string | null; source: string };
  totals: {
    packages: number;
    files: number;
    bytes: number;
    pe: number;
    peMsys: number;
    unowned: number;
  };
  byEnv: Record<string, { packages: number; files: number; bytes: number; pe: number }>;
  windows: WindowsFootprint;
  packages: InventoryPackage[];
  files: InventoryFile[];
}

export interface WindowsFootprint {
  source: string;
  environment: { scope: string; name: string; mentionsMsys: boolean }[];
  uninstall: {
    key: string;
    displayName: string;
    displayVersion: string;
    installLocation: string;
  }[];
  shortcuts: string[];
  launchers: string[];
}

function envOf(path: string): Env {
  const top = path.split("/", 1)[0];
  switch (top) {
    case "ucrt64":
    case "mingw64":
    case "clang64":
    case "clangarm64":
    case "mingw32":
      return top;
    case "usr":
    case "etc":
    case "var":
    case "dev":
    case "opt":
    case "home":
    case "tmp":
      return "msys";
    default:
      return path.includes("/") ? "msys" : "installer";
  }
}

const PREFIXES: [string, Env][] = [
  ["mingw-w64-ucrt-x86_64-", "ucrt64"],
  ["mingw-w64-clang-x86_64-", "clang64"],
  ["mingw-w64-clang-aarch64-", "clangarm64"],
  ["mingw-w64-x86_64-", "mingw64"],
  ["mingw-w64-i686-", "mingw32"],
];

export function splitPackageName(name: string): { base: string; env: Env } {
  for (const [prefix, env] of PREFIXES) if (name.startsWith(prefix)) return { base: name.slice(prefix.length), env };
  return { base: name, env: "msys" };
}

function parseDesc(text: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  let key = "";
  for (const line of text.split(/\r?\n/)) {
    const m = /^%([A-Z0-9]+)%$/.exec(line);
    if (m) {
      key = m[1];
      out.set(key, []);
    } else if (line && key) out.get(key)!.push(line);
  }
  return out;
}

// ---- lecteur PE minimal (en-têtes, sections, table d'import) ----

interface PeInfo {
  arch: string;
  subsystem: string;
  dll: boolean;
  dlls: string[];
}

const MACHINES: Record<number, string> = {
  0x8664: "x86_64",
  0x14c: "i386",
  0xaa64: "aarch64",
  0x1c4: "arm",
};
const SUBSYSTEMS: Record<number, string> = {
  1: "native",
  2: "gui",
  3: "console",
  9: "windows_ce_gui",
  10: "efi_application",
  11: "efi_boot_service_driver",
  12: "efi_runtime_driver",
  13: "efi_rom",
  16: "windows_boot_application",
};

export function readPe(buf: Uint8Array): PeInfo | null {
  if (buf.length < 64 || buf[0] !== 0x4d || buf[1] !== 0x5a) return null;
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const peOff = dv.getUint32(0x3c, true);
  if (peOff + 24 > buf.length || dv.getUint32(peOff, true) !== 0x00004550) return null;
  const machine = dv.getUint16(peOff + 4, true);
  const nSections = dv.getUint16(peOff + 6, true);
  const optSize = dv.getUint16(peOff + 20, true);
  const characteristics = dv.getUint16(peOff + 22, true);
  const opt = peOff + 24;
  if (opt + 2 > buf.length) return null;
  const magic = dv.getUint16(opt, true);
  const is64 = magic === 0x20b;
  const subsystem = opt + 68 + 2 <= buf.length ? dv.getUint16(opt + 68, true) : 0;
  const ddBase = opt + (is64 ? 112 : 96);
  const numDd = opt + (is64 ? 108 : 92) + 4 <= buf.length ? dv.getUint32(opt + (is64 ? 108 : 92), true) : 0;
  const secTable = opt + optSize;
  const sections: { va: number; vsize: number; raw: number; rawSize: number }[] = [];
  for (let i = 0; i < nSections; i++) {
    const s = secTable + i * 40;
    if (s + 40 > buf.length) break;
    sections.push({
      vsize: dv.getUint32(s + 8, true),
      va: dv.getUint32(s + 12, true),
      rawSize: dv.getUint32(s + 16, true),
      raw: dv.getUint32(s + 20, true),
    });
  }
  const rva = (r: number): number => {
    for (const s of sections) if (r >= s.va && r < s.va + Math.max(s.vsize, s.rawSize)) return r - s.va + s.raw;
    return -1;
  };
  const cstr = (off: number): string => {
    let end = off;
    while (end < buf.length && buf[end] !== 0 && end - off < 260) end++;
    return new TextDecoder().decode(buf.subarray(off, end));
  };
  const dlls: string[] = [];
  const readTable = (ddIndex: number, entrySize: number, nameOffset: number) => {
    if (numDd <= ddIndex || ddBase + ddIndex * 8 + 8 > buf.length) return;
    const dirRva = dv.getUint32(ddBase + ddIndex * 8, true);
    if (!dirRva) return;
    let off = rva(dirRva);
    if (off < 0) return;
    for (let n = 0; n < 4096 && off + entrySize <= buf.length; n++, off += entrySize) {
      const nameRva = dv.getUint32(off + nameOffset, true);
      if (!nameRva) break;
      const nameOff = rva(nameRva);
      if (nameOff < 0) break;
      const name = cstr(nameOff);
      if (name && !dlls.includes(name)) dlls.push(name);
    }
  };
  readTable(1, 20, 12); // IMAGE_IMPORT_DESCRIPTOR.Name
  readTable(13, 32, 4); // IMAGE_DELAYLOAD_DESCRIPTOR.DllNameRVA
  return {
    arch: MACHINES[machine] ?? `IMAGE_FILE_MACHINE_0x${machine.toString(16).padStart(4, "0")}`,
    subsystem: SUBSYSTEMS[subsystem] ?? `unknown_${subsystem}`,
    dll: (characteristics & 0x2000) !== 0,
    dlls,
  };
}

const MSYS_RUNTIME = new Set(["msys-2.0.dll", "cygwin1.dll"]);

function classify(path: string, head: Uint8Array): FileType {
  if (head[0] === 0x4d && head[1] === 0x5a) return "pe";
  if (head[0] === 0x7f && head[1] === 0x45 && head[2] === 0x4c && head[3] === 0x46) return "elf";
  if (head[0] === 0x21 && head[1] === 0x3c && head[2] === 0x61 && head[3] === 0x72) return "lib"; // !<arch>
  if (head[0] === 0x23 && head[1] === 0x21) return "script"; // #!
  if (/\.(sh|bash|zsh|csh|bat|cmd|ps1|py|pl|pm|tcl|awk|sed)$/i.test(path)) return "script";
  return "data";
}

function interpreterOf(head: Uint8Array): string | undefined {
  if (head[0] !== 0x23 || head[1] !== 0x21) return undefined;
  const line = new TextDecoder().decode(head.subarray(2, 160)).split(/\r?\n/, 1)[0].trim();
  const parts = line.split(/\s+/);
  const exe = parts[0]?.split("/").pop() ?? "";
  return exe === "env" ? (parts[1] ?? "env") : exe;
}

function walk(root: string, rel = "", out: string[] = []): string[] {
  for (const ent of readdirSync(join(root, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${ent.name}` : ent.name;
    if (ent.isDirectory()) walk(root, r, out);
    else if (ent.isFile() || ent.isSymbolicLink()) out.push(r);
  }
  return out;
}

async function aphrodyTriage(path: string): Promise<any | null> {
  try {
    const proc = Bun.spawn(["aphrody", "re", "triage", path], { stdout: "pipe", stderr: "ignore" });
    const [text, code] = await Promise.all([proc.stdout.text(), proc.exited]);
    return code === 0 ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = Array.from({ length: items.length });
  let next = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

async function winclean(tool: string, args: Record<string, string>): Promise<any | null> {
  if (process.platform !== "win32") return null;
  const argv = ["aphrody", "winclean", "call", tool, "--json"];
  for (const [k, v] of Object.entries(args)) argv.push("--arg", `${k}=${v}`);
  try {
    const proc = Bun.spawn(argv, { stdout: "pipe", stderr: "ignore" });
    const [text, code] = await Promise.all([proc.stdout.text(), proc.exited]);
    if (code !== 0) return null;
    const res = JSON.parse(text);
    return res.isError ? null : res.structuredContent;
  } catch {
    return null;
  }
}

async function windowsFootprint(root: string): Promise<WindowsFootprint> {
  const rootWin = root.replaceAll("/", "\\").toLowerCase();
  const mentions = (s: string) => /msys|mingw|ucrt64|clang64/i.test(s) || s.toLowerCase().includes(rootWin);
  const environment: WindowsFootprint["environment"] = [];
  for (const [scope, path] of [
    ["HKCU", "HKCU:\\Environment"],
    ["HKLM", "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment"],
  ] as const) {
    const key = await winclean("list_registry_key", { path });
    // Seuls les noms des variables qui pointent vers MSYS2 ; jamais les valeurs (jetons possibles).
    for (const v of key?.Values ?? [])
      if (mentions(String(v.data ?? ""))) environment.push({ scope, name: v.name, mentionsMsys: true });
  }
  const uninstall: WindowsFootprint["uninstall"] = [];
  for (const hive of [
    "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
    "HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
    "HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
  ]) {
    const key = await winclean("list_registry_key", { path: hive });
    for (const sub of key?.SubKeys ?? []) {
      const name = String(typeof sub === "string" ? sub : sub.name);
      const full = name.includes(":\\") ? name : `${hive}\\${name}`;
      const entry = await winclean("list_registry_key", { path: full });
      const val = (n: string) => String(entry?.Values?.find((v: any) => v.name === n)?.data ?? "");
      const displayName = val("DisplayName");
      if (!/msys/i.test(displayName) && !mentions(val("InstallLocation"))) continue;
      uninstall.push({
        key: full,
        displayName,
        displayVersion: val("DisplayVersion"),
        installLocation: val("InstallLocation"),
      });
    }
  }
  const shortcuts: string[] = [];
  for (const dir of [
    join(process.env.APPDATA ?? "", "Microsoft/Windows/Start Menu/Programs"),
    join(process.env.ProgramData ?? "C:/ProgramData", "Microsoft/Windows/Start Menu/Programs"),
  ]) {
    const found = await winclean("search_files", { path: dir, pattern: "*.lnk" });
    for (const f of found?.entries ?? []) {
      const p = String(f.path ?? "").replace(/^\\\\\?\\/, "");
      if (/msys|mingw|ucrt|clang/i.test(p)) shortcuts.push(p.replaceAll("\\", "/"));
    }
  }
  const launchers = readdirSync(root).filter(f => /\.(exe|ini|cmd|bat|ico)$/i.test(f));
  return {
    source: "aphrody winclean call list_registry_key|search_files",
    environment,
    uninstall,
    shortcuts,
    launchers,
  };
}

async function inventory(root: string, useRe: boolean) {
  const t0 = performance.now();
  const localDb = join(root, "var/lib/pacman/local");
  const owner = new Map<string, string>();
  const packages: InventoryPackage[] = [];
  for (const dir of readdirSync(localDb)
    .filter(d => statSync(join(localDb, d)).isDirectory())
    .sort()) {
    const desc = parseDesc(readFileSync(join(localDb, dir, "desc"), "utf8"));
    const files = parseDesc(readFileSync(join(localDb, dir, "files"), "utf8")).get("FILES") ?? [];
    const name = desc.get("NAME")![0];
    let count = 0;
    for (const f of files) {
      if (f.endsWith("/")) continue;
      owner.set(f, name);
      count++;
    }
    const { base, env } = splitPackageName(name);
    packages.push({
      name,
      base,
      version: desc.get("VERSION")?.[0] ?? "",
      env,
      desc: desc.get("DESC")?.[0] ?? "",
      url: desc.get("URL")?.[0] ?? "",
      depends: desc.get("DEPENDS") ?? [],
      installedSize: Number(desc.get("SIZE")?.[0] ?? 0),
      files: count,
      explicit: (desc.get("REASON")?.[0] ?? "0") === "0",
    });
  }

  const paths = walk(root).sort();
  const files: InventoryFile[] = [];
  const peQueue: InventoryFile[] = [];
  for (const path of paths) {
    const abs = join(root, path);
    let bytes: Uint8Array;
    try {
      bytes = readFileSync(abs);
    } catch {
      continue;
    }
    const type = classify(path, bytes.subarray(0, 8));
    const entry: InventoryFile = {
      path,
      env: envOf(path),
      pkg: owner.get(path) ?? null,
      type,
      size: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
    if (type === "pe") {
      const pe = readPe(bytes);
      if (pe) {
        entry.arch = pe.arch;
        entry.subsystem = pe.subsystem;
        entry.dll = pe.dll;
        entry.dlls = pe.dlls;
        entry.msys =
          pe.dlls.some(d => MSYS_RUNTIME.has(d.toLowerCase())) || /^msys-2\.0\.dll$/i.test(path.split("/").pop()!);
        peQueue.push(entry);
      } else entry.type = "data";
    } else if (type === "script") {
      const interp = interpreterOf(bytes.subarray(0, 160));
      if (interp) entry.interp = interp;
    }
    files.push(entry);
  }

  if (useRe) {
    let viaRe = 0;
    await pool(peQueue, 12, async entry => {
      const r = await aphrodyTriage(join(root, entry.path));
      if (!r) return;
      if (r.sha256 !== entry.sha256) throw new Error(`sha256 divergent pour ${entry.path}`);
      const ent = (r.sections ?? []).map((s: any) => s.entropy ?? 0);
      if (ent.length) entry.maxEntropy = Math.round(Math.max(...ent) * 1000) / 1000;
      if (Array.isArray(r.libraries)) {
        entry.dlls = r.libraries;
        if (r.subsystem) entry.subsystem = r.subsystem;
        if (r.arch) entry.arch = r.arch;
        viaRe++;
      }
    });
    console.error(`aphrody re triage : ${peQueue.length} PE, ${viaRe} avec libraries natives`);
  }

  const byEnv: Inventory["byEnv"] = {};
  for (const env of ENVS) byEnv[env] = { packages: 0, files: 0, bytes: 0, pe: 0 };
  for (const p of packages) byEnv[p.env].packages++;
  for (const f of files) {
    const e = byEnv[f.env];
    e.files++;
    e.bytes += f.size;
    if (f.type === "pe") e.pe++;
  }
  const comps = existsSync(join(root, "components.xml")) ? readFileSync(join(root, "components.xml"), "utf8") : "";
  const inv: Inventory = {
    generated: new Date().toISOString(),
    root: root.replaceAll("\\", "/"),
    installer: {
      version: /<Version>(\d+)<\/Version>/.exec(comps)?.[1] ?? null,
      source: "components.xml",
    },
    totals: {
      packages: packages.length,
      files: files.length,
      bytes: files.reduce((a, f) => a + f.size, 0),
      pe: peQueue.length,
      peMsys: peQueue.filter(f => f.msys).length,
      unowned: files.filter(f => !f.pkg).length,
    },
    byEnv,
    windows: await windowsFootprint(root),
    packages,
    files,
  };
  // Une ligne par fichier : diff git lisible, taille contenue.
  const body = JSON.stringify({ ...inv, files: undefined, packages: undefined }, null, 1).replace(/\n}$/, "");
  const lines = [
    body + ',\n "packages": [',
    inv.packages.map(p => "  " + JSON.stringify(p)).join(",\n"),
    ' ],\n "files": [',
    inv.files.map(f => "  " + JSON.stringify(f)).join(",\n"),
    " ]\n}\n",
  ];
  await Bun.write(INVENTORY, lines.join("\n"));
  console.log(
    `${relative(BUN_ROOT, INVENTORY)} : ${inv.totals.packages} paquets, ${inv.totals.files} fichiers, ` +
      `${inv.totals.pe} PE (${inv.totals.peMsys} liés à msys-2.0.dll), ${inv.totals.unowned} sans paquet, ` +
      `${Math.round(performance.now() - t0)} ms`,
  );
}

// ---- vérification des équivalents ----

let upstreamAports: Set<string> | null = null;
function upstream(): Set<string> {
  if (upstreamAports) return upstreamAports;
  const proc = Bun.spawnSync([
    "git",
    "-C",
    APORTS,
    "ls-tree",
    "-d",
    "--name-only",
    APORTS_UPSTREAM_REF,
    "main/",
    "community/",
  ]);
  upstreamAports = new Set(proc.stdout.toString().split(/\r?\n/).filter(Boolean));
  return upstreamAports;
}

const BUN_BUILTINS = new Set(
  readdirSync(join(BUN_ROOT, "src/runtime/shell/builtin"))
    .filter(f => f.endsWith(".rs") && f !== "mod.rs")
    .map(f => f.replace(/_?\.rs$/, "")),
);

export function checkEquivalent(e: Equivalent): { ok: boolean; why: string } {
  switch (e.kind) {
    case "aport": {
      const ok = upstream().has(`${e.repo}/${e.name}`);
      return { ok, why: `${e.repo}/${e.name}` };
    }
    case "aphrody-aport": {
      const ok = existsSync(join(APORTS, "aphrody", e.name, "APKBUILD"));
      return { ok, why: `aphrody/${e.name}` };
    }
    case "bun-builtin": {
      const ok = BUN_BUILTINS.has(e.name);
      return { ok, why: `Bun Shell ${e.name}` };
    }
    case "bun": {
      const abs = join(BUN_ROOT, e.file);
      const ok = existsSync(abs) && (!e.pattern || readFileSync(abs, "utf8").includes(e.pattern));
      return { ok, why: `${e.file}${e.pattern ? ` (${e.pattern})` : ""}` };
    }
    case "windows": {
      const ok =
        process.platform !== "win32" ? true : existsSync(e.path.replace(/%(\w+)%/g, (_, v) => process.env[v] ?? ""));
      return { ok, why: e.path };
    }
    case "built": {
      const ok = existsSync(e.path);
      return { ok, why: e.path };
    }
    case "aphrody-mingw": {
      const dirs = [`mingw-w64/${e.name}`, `mingw-w64/mingw-w64-${e.name}`, `mingw-w64-${e.name}`];
      const hit = dirs.find(d => existsSync(join(APORTS, "aphrody", d, "APKBUILD")));
      return { ok: !!hit, why: `aphrody/${hit ?? dirs[0]}` };
    }
    case "na":
      return { ok: true, why: `sans objet : ${e.reason}` };
    case "planned":
      return { ok: false, why: e.plan };
  }
}

export interface Verdict {
  pkg: InventoryPackage;
  mapping: PackageMapping | undefined;
  alpine: { ok: boolean; why: string }[];
  windows: { ok: boolean; why: string }[];
  bun: { ok: boolean; why: string }[];
}

function verdicts(inv: Inventory): Verdict[] {
  return inv.packages.map(pkg => {
    const mapping = MAP[pkg.base];
    return {
      pkg,
      mapping,
      alpine: (mapping?.alpine ?? []).map(checkEquivalent),
      windows: (pkg.env === "msys" ? (mapping?.windows ?? []) : windowsDefault(pkg.base)).map(checkEquivalent),
      bun: (mapping?.bun ?? []).map(checkEquivalent),
    };
  });
}

const covered = (v: Verdict) => v.alpine.some(c => c.ok) || v.bun.some(c => c.ok);

function verify(asJson: boolean, min: number | null) {
  const inv: Inventory = JSON.parse(readFileSync(INVENTORY, "utf8"));
  const vs = verdicts(inv);
  const unmapped = vs.filter(v => !v.mapping).map(v => v.pkg.name);
  const pct = (n: number, d: number) => (d ? Math.round((1000 * n) / d) / 10 : 100);
  const winPkgs = vs.filter(v => v.pkg.env !== "msys");
  const coveredNames = new Set(vs.filter(covered).map(v => v.pkg.name));
  const files = inv.files.filter(f => f.pkg);
  const result = {
    packages: vs.length,
    mapped: vs.length - unmapped.length,
    covered: coveredNames.size,
    coverage: pct(coveredNames.size, vs.length),
    alpineLinux: pct(vs.filter(v => v.alpine.some(c => c.ok)).length, vs.length),
    bun: pct(vs.filter(v => v.bun.some(c => c.ok)).length, vs.length),
    windowsRebuild: pct(winPkgs.filter(v => v.windows.some(c => c.ok)).length, winPkgs.length),
    files: files.length,
    filesCovered: pct(files.filter(f => coveredNames.has(f.pkg!)).length, files.length),
    pe: inv.totals.pe,
    peCovered: pct(
      files.filter(f => f.type === "pe" && coveredNames.has(f.pkg!)).length,
      files.filter(f => f.type === "pe").length,
    ),
    unmapped,
    missing: vs.filter(v => v.mapping && !covered(v)).map(v => v.pkg.name),
    windowsPlanned: winPkgs.filter(v => !v.windows.some(c => c.ok)).length,
  };
  if (asJson) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(
      `paquets ${result.packages}, mappés ${result.mapped}, couverts ${result.covered} (${result.coverage} %)`,
    );
    console.log(
      `  Alpine Linux ${result.alpineLinux} %, Bun ${result.bun} %, reconstruction Windows (aports mingw) ${result.windowsRebuild} %`,
    );
    console.log(
      `fichiers possédés ${result.files} : ${result.filesCovered} % couverts ; PE ${result.pe} : ${result.peCovered} %`,
    );
    if (unmapped.length) console.log(`non mappés : ${unmapped.join(", ")}`);
    if (result.missing.length) console.log(`sans équivalent vérifié : ${result.missing.join(", ")}`);
  }
  if (min !== null && result.coverage < min) process.exit(1);
}

const SH_INTERPS = new Set(["sh", "bash", "dash", "ash"]);

function shellScripts(inv: Inventory): { path: string; kind: string }[] {
  const out: { path: string; kind: string }[] = [];
  for (const f of inv.files) {
    if (/^var\/lib\/pacman\/local\/[^/]+\/install$/.test(f.path)) out.push({ path: f.path, kind: "pacman install" });
    else if (/^etc\/(profile|bash\.bashrc|bash\.bash_logout|profile\.d\/[^/]+\.sh)$/.test(f.path))
      out.push({ path: f.path, kind: "etc/profile*" });
    else if (f.type === "script" && (f.interp ? SH_INTERPS.has(f.interp) : /\.(sh|bash)$/i.test(f.path)))
      out.push({ path: f.path, kind: `${f.env} sh/bash` });
  }
  return out;
}

// Parse only (bun:internal-for-testing shellInternals.parse): nothing from C:/msys64 is executed.
async function shell(root: string) {
  if (!process.env.BUN_FEATURE_FLAG_INTERNAL_FOR_TESTING) {
    const proc = Bun.spawn([process.execPath, import.meta.path, "shell", "--root", root], {
      env: {
        ...process.env,
        BUN_GARBAGE_COLLECTOR_LEVEL: "0",
        BUN_FEATURE_FLAG_INTERNAL_FOR_TESTING: "1",
      },
      stdio: ["ignore", "inherit", "inherit"],
    });
    process.exit(await proc.exited);
  }
  const { shellInternals } = require("bun:internal-for-testing");
  const inv: Inventory = JSON.parse(readFileSync(INVENTORY, "utf8"));
  const byKind = new Map<string, { total: number; ok: number }>();
  const errors = new Map<string, { n: number; example: string }>();
  for (const { path, kind } of shellScripts(inv)) {
    const text = readFileSync(join(root, path), "utf8").replace(/^#![^\n]*\n/, "");
    const k = byKind.get(kind) ?? { total: 0, ok: 0 };
    byKind.set(kind, k);
    k.total++;
    try {
      shellInternals.parse(Object.assign([text], { raw: [text] }));
      k.ok++;
    } catch (e) {
      const msg = String((e as Error).message ?? e)
        .split("\n", 1)[0]
        .slice(0, 80);
      const err = errors.get(msg) ?? { n: 0, example: path };
      err.n++;
      errors.set(msg, err);
    }
  }
  const total = [...byKind.values()].reduce((a, k) => a + k.total, 0);
  const ok = [...byKind.values()].reduce((a, k) => a + k.ok, 0);
  const pct = (a: number, b: number) => (b ? ((100 * a) / b).toFixed(1) : "0.0");
  const lines = [
    `Analyse syntaxique seule (\`shellInternals.parse\`, rien n'est exécuté) de ${total} scripts sh/bash de C:/msys64 par Bun Shell (\`bun\` ${Bun.version}) : ${ok} acceptés (${pct(ok, total)} %).`,
    "",
    "| Famille | Scripts | Acceptés par Bun Shell |",
    "| --- | --- | --- |",
    ...[...byKind]
      .sort((a, b) => b[1].total - a[1].total)
      .map(([kind, k]) => `| ${kind} | ${k.total} | ${k.ok} (${pct(k.ok, k.total)} %) |`),
    "",
    "| Erreur d'analyse (10 premières) | Scripts | Exemple |",
    "| --- | --- | --- |",
    ...[...errors]
      .sort((a, b) => b[1].n - a[1].n)
      .slice(0, 10)
      .map(([m, e]) => `| ${m.replaceAll("|", "\\|").replaceAll("`", "'")} | ${e.n} | \`${e.example}\` |`),
  ].join("\n");
  const md = readFileSync(REPORT_MD, "utf8");
  const begin = "<!-- msys2-mirror:shell:begin -->";
  const end = "<!-- msys2-mirror:shell:end -->";
  const a = md.indexOf(begin);
  const b = md.indexOf(end);
  if (a < 0 || b < 0) throw new Error(`marqueurs ${begin}/${end} absents de ${REPORT_MD}`);
  await Bun.write(REPORT_MD, md.slice(0, a + begin.length) + "\n" + lines + "\n" + md.slice(b));
  console.log(`shell : ${ok}/${total} scripts acceptés (${pct(ok, total)} %)`);
}

function report() {
  const inv: Inventory = JSON.parse(readFileSync(INVENTORY, "utf8"));
  const vs = verdicts(inv);
  const fmt = (cs: { ok: boolean; why: string }[]) => {
    if (!cs.length) return "—";
    const shell = cs.filter(c => c.why.startsWith("Bun Shell "));
    const rest = cs.filter(c => !c.why.startsWith("Bun Shell ")).map(c => `${c.ok ? "✅" : "⏳"} ${c.why}`);
    if (shell.length)
      rest.unshift(`${shell.every(c => c.ok) ? "✅" : "⏳"} Bun Shell : ${shell.map(c => c.why.slice(10)).join(", ")}`);
    return rest.join("<br>");
  };
  const rows = vs.map(v => {
    const status = covered(v)
      ? v.pkg.env === "msys" || v.windows.some(c => c.ok)
        ? "✅"
        : "✅ Linux / ⏳ Windows"
      : "⏳";
    const use = (v.mapping?.use || v.pkg.desc).replaceAll("|", "\\|");
    return `| \`${v.pkg.name}\` ${v.pkg.version} | ${use} | ${fmt(v.alpine)} | ${fmt(v.windows)} | ${fmt(v.bun)} | ${status} |`;
  });
  const table = [
    "| Paquet MSYS2 | Usage | Aphrody Alpine (Linux) | Reconstruction Windows (aport mingw / natif) | Bun | Statut |",
    "| --- | --- | --- | --- | --- | --- |",
    ...rows,
  ].join("\n");
  const md = readFileSync(REPORT_MD, "utf8");
  const begin = "<!-- msys2-mirror:table:begin -->";
  const end = "<!-- msys2-mirror:table:end -->";
  const a = md.indexOf(begin);
  const b = md.indexOf(end);
  if (a < 0 || b < 0) throw new Error(`marqueurs ${begin}/${end} absents de ${REPORT_MD}`);
  Bun.write(REPORT_MD, md.slice(0, a + begin.length) + "\n" + table + "\n" + md.slice(b));
  console.log(`${relative(BUN_ROOT, REPORT_MD)} : ${rows.length} lignes`);
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const cmd = args[0] && !args[0].startsWith("--") ? args.shift()! : "verify";
  const flag = (n: string) => {
    const i = args.indexOf(n);
    return i >= 0 ? (args[i + 1] ?? "") : null;
  };
  if (cmd === "inventory") await inventory(flag("--root") ?? "C:/msys64", args.includes("--re"));
  else if (cmd === "verify") verify(args.includes("--json"), flag("--min") === null ? null : Number(flag("--min")));
  else if (cmd === "report") report();
  else if (cmd === "shell") await shell(flag("--root") ?? "C:/msys64");
  else {
    console.error(
      "usage: msys2-mirror.ts [inventory [--root C:/msys64] [--re] | verify [--json] [--min <pct>] | report | shell [--root C:/msys64]]",
    );
    process.exit(2);
  }
}
