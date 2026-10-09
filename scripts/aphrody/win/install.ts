#!/usr/bin/env bun
// Installeur Aphrody Windows (remplace msys2-installer et msys2-launcher) : prépare une racine apk utilisateur,
// installe les paquets demandés, ajoute <root>\usr\bin au PATH utilisateur (HKCU, sans droits admin) et peut
// écrire un profil Windows Terminal qui lance bunsh (à la place de mintty).
//
//   bun scripts/aphrody/win/install.ts [--root <dir>] [--repo <url|dir>]… [--key <fichier.pub>]…
//       [--update] [--no-path] [--terminal-profile] [--uninstall] [paquet…]
//   bun build --compile scripts/aphrody/win/install.ts --outfile aphrody-win-setup.exe
import { createHash } from "node:crypto";
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  linkSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
import { parseArgs } from "node:util";
// @ts-ignore -- import texte : la clé est embarquée dans l'exécutable compilé.
import aphrodyKey from "./apk/keys/aphrody-labs.rsa.pub" with { type: "text" };
import { defaultArch, defaultRoot, run as apk } from "./apk/apk.ts";
import { atomicWrite } from "./apk/lib.ts";

export const DEFAULT_REPO =
  "https://github.com/aphrody-labs/aports/releases/download/aphrody-3.24-${APK_ARCH}/APKINDEX.tar.gz";
export const DEFAULT_KEY_NAME = "aphrody-labs.rsa.pub";

/** Ajoute `dirs` en tête d'une liste PATH Windows, sans doublon (casse et séparateur final ignorés). */
export function mergePath(current: string, dirs: string[]): string {
  const norm = (s: string) => s.replace(/[\\/]+$/, "").toLowerCase();
  const want = new Set(dirs.map(norm));
  const rest = current.split(";").filter(p => p && !want.has(norm(p)));
  return [...dirs, ...rest].join(";");
}

export function removeFromPath(current: string, dirs: string[]): string {
  const norm = (s: string) => s.replace(/[\\/]+$/, "").toLowerCase();
  const drop = new Set(dirs.map(norm));
  return current
    .split(";")
    .filter(p => p && !drop.has(norm(p)))
    .join(";");
}

// --- PATH utilisateur : HKCU\Environment\Path via advapi32 (bun:ffi), puis WM_SETTINGCHANGE --------------------

export function userPathApi() {
  const { dlopen, FFIType, ptr } = require("bun:ffi") as typeof import("bun:ffi");
  const adv = dlopen("advapi32.dll", {
    RegOpenKeyExW: { args: [FFIType.u64, FFIType.ptr, FFIType.u32, FFIType.u32, FFIType.ptr], returns: FFIType.i32 },
    RegQueryValueExW: {
      args: [FFIType.u64, FFIType.ptr, FFIType.ptr, FFIType.ptr, FFIType.ptr, FFIType.ptr],
      returns: FFIType.i32,
    },
    RegSetValueExW: {
      args: [FFIType.u64, FFIType.ptr, FFIType.u32, FFIType.u32, FFIType.ptr, FFIType.u32],
      returns: FFIType.i32,
    },
    RegCloseKey: { args: [FFIType.u64], returns: FFIType.i32 },
  });
  const user = dlopen("user32.dll", {
    SendMessageTimeoutW: {
      args: [FFIType.u64, FFIType.u32, FFIType.u64, FFIType.ptr, FFIType.u32, FFIType.u32, FFIType.ptr],
      returns: FFIType.u64,
    },
  });
  const w = (s: string) => Buffer.from(s + "\0", "utf16le");
  const HKCU = 0xffffffff80000001n;
  const open = () => {
    const out = new BigUint64Array(1);
    const rc = adv.symbols.RegOpenKeyExW(HKCU, ptr(w("Environment")), 0, 0x3 /* QUERY|SET */, ptr(out));
    if (rc !== 0) throw new Error(`RegOpenKeyExW(HKCU\\Environment) = ${rc}`);
    return out[0];
  };
  return {
    get(): { value: string; type: number } {
      const k = open();
      try {
        const type = new Uint32Array(1);
        const size = new Uint32Array([0]);
        let rc = adv.symbols.RegQueryValueExW(k, ptr(w("Path")), null, ptr(type), null, ptr(size));
        if (rc === 2 /* ERROR_FILE_NOT_FOUND */) return { value: "", type: 2 };
        if (rc !== 0) throw new Error(`RegQueryValueExW(Path) = ${rc}`);
        const buf = Buffer.alloc(size[0] + 2);
        rc = adv.symbols.RegQueryValueExW(k, ptr(w("Path")), null, ptr(type), ptr(buf), ptr(size));
        if (rc !== 0) throw new Error(`RegQueryValueExW(Path) = ${rc}`);
        return { value: buf.toString("utf16le", 0, size[0]).replace(/\0+$/, ""), type: type[0] };
      } finally {
        adv.symbols.RegCloseKey(k);
      }
    },
    set(value: string, type: number) {
      const k = open();
      try {
        const data = w(value);
        const rc = adv.symbols.RegSetValueExW(k, ptr(w("Path")), 0, type === 1 ? 1 : 2, ptr(data), data.length);
        if (rc !== 0) throw new Error(`RegSetValueExW(Path) = ${rc}`);
      } finally {
        adv.symbols.RegCloseKey(k);
      }
      const res = new BigUint64Array(1);
      // HWND_BROADCAST, WM_SETTINGCHANGE, SMTO_ABORTIFHUNG : les nouveaux processus voient le PATH.
      user.symbols.SendMessageTimeoutW(0xffffn, 0x1a, 0n, ptr(w("Environment")), 0x2, 5000, ptr(res));
    },
  };
}

// --- Profil Windows Terminal (fragment JSON) -------------------------------------------------------------------

export function terminalFragmentDir(): string {
  const base = process.env.LOCALAPPDATA ?? join(process.env.USERPROFILE ?? ".", "AppData", "Local");
  return join(base, "Microsoft", "Windows Terminal", "Fragments", "Aphrody");
}

function guidFor(s: string): string {
  const h = createHash("sha1").update(`aphrody-win:${s.toLowerCase()}`).digest("hex");
  const v = `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
  return `{${v}}`;
}

export function terminalFragment(root: string) {
  return {
    profiles: [
      {
        guid: guidFor(root),
        name: "Aphrody (bunsh)",
        commandline: `"${join(root, "usr", "bin", "bunsh.exe")}" -l`,
        startingDirectory: "%USERPROFILE%",
        icon: "ms-appx:///ProfileIcons/{0caa0dad-35be-5f56-a8ff-afceeeaa6101}.png",
      },
    ],
  };
}

// --- bunsh : bun.exe sous le nom bunsh.exe (argv0) ---------------------------------------------------------------

function isCompiled() {
  return /^(B:[\\/]~BUN|\/\$bunfs)/.test(import.meta.path);
}

/** Lien dur (copie à défaut) de bun.exe vers <root>\usr\bin\bunsh.exe. */
export function provideBunsh(root: string, bunPath?: string): string | undefined {
  const bin = join(root, "usr", "bin");
  const fromPkg = join(bin, process.platform === "win32" ? "bun.exe" : "bun");
  const src =
    bunPath ?? (existsSync(fromPkg) ? fromPkg : (Bun.which("bun") ?? (isCompiled() ? undefined : process.execPath)));
  if (!src) return undefined;
  const dest = join(bin, process.platform === "win32" ? "bunsh.exe" : "bunsh");
  mkdirSync(bin, { recursive: true });
  rmSync(dest, { force: true });
  try {
    linkSync(src, dest);
  } catch {
    copyFileSync(src, dest);
  }
  return dest;
}

// --- Installation ----------------------------------------------------------------------------------------------

export interface InstallOptions {
  root: string;
  repos: string[];
  keys: string[];
  arch: string;
  packages: string[];
  update: boolean;
  path: boolean;
  terminalProfile: boolean;
  terminalDir: string;
  allowUntrusted: boolean;
  quiet: boolean;
  bun?: string;
  out: (s: string) => void;
}

export async function install(o: InstallOptions): Promise<number> {
  const etc = join(o.root, "etc", "apk");
  const keysDir = join(etc, "keys");
  mkdirSync(keysDir, { recursive: true });
  for (const d of [["lib", "apk", "db"], ["var", "cache", "apk"], ["usr", "bin"], ["tmp"]]) {
    mkdirSync(join(o.root, ...d), { recursive: true });
  }
  writeFileSync(join(keysDir, DEFAULT_KEY_NAME), aphrodyKey);
  for (const k of o.keys) copyFileSync(k, join(keysDir, basename(k)));
  atomicWrite(join(etc, "arch"), o.arch + "\n");
  const reposFile = join(etc, "repositories");
  const existing = existsSync(reposFile) ? readFileSync(reposFile, "utf8").split(/\r?\n/).filter(Boolean) : [];
  atomicWrite(reposFile, [...new Set([...existing, ...o.repos])].join("\n") + "\n");
  if (!existsSync(join(etc, "world"))) writeFileSync(join(etc, "world"), "");

  const common = ["--root", o.root, ...(o.allowUntrusted ? ["--allow-untrusted"] : []), ...(o.quiet ? ["-q"] : [])];
  if (o.update || o.packages.length) {
    let rc = await apk([...common, "update"], o.out);
    if (rc) return rc;
    if (o.update) rc = await apk([...common, "upgrade"], o.out);
    if (rc) return rc;
    if (o.packages.length) rc = await apk([...common, "add", ...o.packages], o.out);
    if (rc) return rc;
  }

  const bunsh = provideBunsh(o.root, o.bun);
  if (!bunsh) o.out("ATTENTION : bun introuvable, bunsh.exe non créé (installez le paquet bun)");

  const bin = join(o.root, "usr", "bin");
  if (o.path) {
    if (process.env.GITHUB_PATH) {
      appendFileSync(process.env.GITHUB_PATH, bin + "\n");
    } else if (process.platform === "win32") {
      const api = userPathApi();
      const cur = api.get();
      const next = mergePath(cur.value, [bin]);
      if (next !== cur.value) api.set(next, cur.type);
      if (!o.quiet) o.out(`PATH utilisateur : ${bin}`);
    }
  }
  if (o.terminalProfile) {
    const f = join(o.terminalDir, "aphrody-win.json");
    atomicWrite(f, JSON.stringify(terminalFragment(o.root), null, 2) + "\n");
    if (!o.quiet) o.out(`Profil Windows Terminal : ${f}`);
  }
  if (!o.quiet) o.out(`Racine Aphrody : ${o.root}`);
  return 0;
}

export function uninstall(root: string, terminalDir: string, out: (s: string) => void) {
  const bin = join(root, "usr", "bin");
  if (process.platform === "win32" && !process.env.GITHUB_PATH) {
    const api = userPathApi();
    const cur = api.get();
    const next = removeFromPath(cur.value, [bin]);
    if (next !== cur.value) api.set(next, cur.type);
  }
  rmSync(join(terminalDir, "aphrody-win.json"), { force: true });
  out(`Retiré du PATH et de Windows Terminal ; racine conservée : ${root}`);
}

export async function main(argv: string[], out: (s: string) => void = s => console.log(s)): Promise<number> {
  const { values: v, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      root: { type: "string" },
      repo: { type: "string", multiple: true },
      key: { type: "string", multiple: true },
      arch: { type: "string" },
      packages: { type: "string" },
      update: { type: "boolean" },
      "no-path": { type: "boolean" },
      "terminal-profile": { type: "boolean" },
      "terminal-dir": { type: "string" },
      "allow-untrusted": { type: "boolean" },
      bun: { type: "string" },
      uninstall: { type: "boolean" },
      quiet: { type: "boolean", short: "q" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (v.help) {
    out(
      "Usage : aphrody-win-setup [--root <dir>] [--repo <url|dir>]… [--key <fichier.pub>]… [--arch <arch>]\n" +
        '         [--packages "a b"] [--update] [--no-path] [--terminal-profile] [--allow-untrusted]\n' +
        "         [--bun <bun.exe>] [--uninstall] [-q] [paquet…]",
    );
    return 0;
  }
  const root = v.root ?? defaultRoot();
  const terminalDir = v["terminal-dir"] ?? terminalFragmentDir();
  if (v.uninstall) {
    uninstall(root, terminalDir, out);
    return 0;
  }
  return install({
    root,
    repos: v.repo?.length ? v.repo : [DEFAULT_REPO],
    keys: v.key ?? [],
    arch: v.arch ?? defaultArch(),
    packages: [...(v.packages?.split(/[\s,]+/).filter(Boolean) ?? []), ...positionals],
    update: !!v.update,
    path: !v["no-path"],
    terminalProfile: !!v["terminal-profile"],
    terminalDir,
    allowUntrusted: !!v["allow-untrusted"],
    quiet: !!v.quiet,
    bun: v.bun,
    out,
  });
}

if (import.meta.main) {
  process.exitCode = await main(process.argv.slice(2), s =>
    s.startsWith("ERROR:") ? console.error(s) : console.log(s),
  );
}
