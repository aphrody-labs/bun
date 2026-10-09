#!/usr/bin/env bun
// Client apk natif Windows en Bun : remplace pacman (MSYS2) sur une racine utilisateur sans émulation POSIX.
//
//   bun scripts/aphrody/win/apk/apk.ts [options] <update|search|info|add|del|upgrade|list> [args]
//
// Options : --root <dir> (défaut %LOCALAPPDATA%\aphrody\win), --repo <url|dir> (répétable, s'ajoute à
// <root>\etc\apk\repositories), --keys-dir <dir> (défaut <root>\etc\apk\keys), --arch <arch>,
// --allow-untrusted, --no-scripts, -q. `list --installed`, `add -u`, `search -d`, `info -L`.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, openSync, closeSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  ApkError,
  atomicWrite,
  extractEntries,
  formatInstalledDb,
  openApk,
  parseDep,
  parseInstalledDb,
  readIndex,
  removeFiles,
  resolve,
  satisfies,
  compareVersions,
  type InstalledPkg,
  type OpenedPkg,
  type Pkg,
  type Repo,
} from "./lib.ts";

export function defaultRoot(): string {
  const base =
    process.env.LOCALAPPDATA ?? join(homedir(), process.platform === "win32" ? "AppData/Local" : ".local/share");
  return join(base, "aphrody", "win");
}

/** Arch apk des paquets PE natifs : distincte des paquets ELF d'Alpine (x86_64, aarch64). */
export function defaultArch(): string {
  const cpu = process.arch === "arm64" ? "aarch64" : process.arch === "x64" ? "x86_64" : process.arch;
  return process.platform === "win32" ? `windows-${cpu}` : cpu;
}

export interface Ctx {
  root: string;
  keysDir: string;
  arch: string;
  repos: Repo[];
  allowUntrusted: boolean;
  scripts: boolean;
  quiet: boolean;
  out: (s: string) => void;
}

const P = {
  repositories: "etc/apk/repositories",
  world: "etc/apk/world",
  arch: "etc/apk/arch",
  keys: "etc/apk/keys",
  installed: "lib/apk/db/installed",
  lock: "lib/apk/db/lock",
  scripts: "lib/apk/db/scripts",
  cache: "var/cache/apk",
};

function at(ctx: Ctx, rel: string) {
  return join(ctx.root, ...rel.split("/"));
}

export function parseRepo(spec: string, arch: string): Repo {
  const s = spec.trim().replace(/\$\{APK_ARCH\}/g, arch);
  if (s.endsWith(".tar.gz")) {
    const cut = Math.max(s.lastIndexOf("/"), s.lastIndexOf("\\"));
    return { spec, index: s, base: s.slice(0, cut + 1) };
  }
  const dir = s.replace(/[\\/]+$/, "");
  return { spec, index: `${dir}/${arch}/APKINDEX.tar.gz`, base: `${dir}/${arch}/` };
}

async function readResource(loc: string): Promise<Uint8Array> {
  if (/^https?:\/\//i.test(loc)) {
    const res = await fetch(loc, { redirect: "follow" });
    if (!res.ok) throw new ApkError(`${loc} : HTTP ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }
  const path = loc.startsWith("file:") ? fileURLToPath(loc) : loc;
  if (!existsSync(path)) throw new ApkError(`${loc} : introuvable`);
  return readFileSync(path);
}

function cacheName(repo: Repo) {
  return `APKINDEX.${createHash("sha1").update(repo.index).digest("hex").slice(0, 8)}.tar.gz`;
}

function readLines(path: string): string[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l && !l.startsWith("#"));
}

export function loadInstalled(ctx: Ctx): InstalledPkg[] {
  const f = at(ctx, P.installed);
  return existsSync(f) ? parseInstalledDb(readFileSync(f, "utf8")) : [];
}

function saveState(ctx: Ctx, installed: InstalledPkg[], world: string[]) {
  installed.sort((a, b) => a.name.localeCompare(b.name));
  atomicWrite(at(ctx, P.installed), formatInstalledDb(installed));
  atomicWrite(at(ctx, P.world), world.length ? world.join("\n") + "\n" : "");
}

async function update(ctx: Ctx, only?: Repo[]): Promise<Pkg[]> {
  if (!ctx.repos.length) throw new ApkError(`aucun dépôt : --repo ou ${at(ctx, P.repositories)}`);
  const all: Pkg[] = [];
  for (const repo of only ?? ctx.repos) {
    const bytes = await readResource(repo.index);
    const pkgs = readIndex(bytes, ctx.keysDir, repo, ctx.allowUntrusted);
    atomicWrite(join(at(ctx, P.cache), cacheName(repo)), bytes);
    if (!only && !ctx.quiet) ctx.out(`[${repo.spec}] ${pkgs.length} paquets`);
    all.push(...pkgs);
  }
  return all;
}

export async function loadAvailable(ctx: Ctx): Promise<Pkg[]> {
  const all: Pkg[] = [];
  for (const repo of ctx.repos) {
    const cached = join(at(ctx, P.cache), cacheName(repo));
    const pkgs = existsSync(cached)
      ? readIndex(readFileSync(cached), ctx.keysDir, repo, ctx.allowUntrusted)
      : await update(ctx, [repo]);
    all.push(...pkgs);
  }
  return all.filter(p => !p.arch || p.arch === ctx.arch || p.arch === "noarch");
}

function lock(ctx: Ctx): () => void {
  const f = at(ctx, P.lock);
  mkdirSync(join(f, ".."), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = openSync(f, "wx");
      writeFileSync(fd, String(process.pid));
      closeSync(fd);
      return () => rmSync(f, { force: true });
    } catch (e: any) {
      if (e?.code !== "EEXIST") throw e;
      const pid = Number(readFileSync(f, "utf8"));
      let alive = false;
      try {
        if (pid) {
          process.kill(pid, 0);
          alive = true;
        }
      } catch {}
      if (alive) throw new ApkError(`base verrouillée par le processus ${pid} (${f})`);
      rmSync(f, { force: true });
    }
  }
  throw new ApkError(`verrou impossible : ${f}`);
}

const SCRIPT_ORDER = {
  install: [".pre-install", ".post-install"],
  upgrade: [".pre-upgrade", ".post-upgrade"],
  deinstall: [".pre-deinstall", ".post-deinstall"],
} as const;

async function runScript(ctx: Ctx, pkg: Pkg, name: string, body: Uint8Array | undefined, args: string[]) {
  if (!body || !ctx.scripts) return;
  const text = new TextDecoder().decode(body);
  const shebang = text.startsWith("#!") ? text.slice(2, text.indexOf("\n")).trim() : "";
  const isShell = /\bbunsh\b/.test(shebang);
  if (!isShell && !/\bbun\b/.test(shebang)) {
    ctx.out(
      `ATTENTION : ${pkg.name}${name} ignoré (interpréteur « ${shebang || "sh"} » non natif ; attendu bun ou bunsh)`,
    );
    return;
  }
  const file = join(tmpdir(), `apk-${pkg.name}${name}-${process.pid}.${isShell ? "sh" : "ts"}`);
  writeFileSync(file, body);
  try {
    // BUN_BE_BUN : un exécutable compilé (aphrody-win-setup.exe) se comporte alors comme bun.
    await using proc = Bun.spawn({
      cmd: [process.execPath, file, ...args],
      cwd: ctx.root,
      env: { ...process.env, BUN_BE_BUN: "1", APK_ROOT: ctx.root, APK_PACKAGE: pkg.name },
      stdout: "inherit",
      stderr: "inherit",
    });
    const code = await proc.exited;
    if (code !== 0) ctx.out(`ATTENTION : ${pkg.name}${name} a terminé avec le code ${code}`);
  } finally {
    rmSync(file, { force: true });
  }
}

function storedScripts(ctx: Ctx, name: string): Record<string, Uint8Array> {
  const dir = join(at(ctx, P.scripts), name);
  const out: Record<string, Uint8Array> = {};
  for (const s of SCRIPT_ORDER.deinstall) if (existsSync(join(dir, s))) out[s] = readFileSync(join(dir, s));
  return out;
}

/** Ordre d'installation : dépendances d'abord. */
function installOrder(pkgs: Pkg[], selected: Map<string, Pkg>): Pkg[] {
  const todo = new Set(pkgs.map(p => p.name));
  const out: Pkg[] = [];
  const seen = new Set<string>();
  const visit = (p: Pkg) => {
    if (seen.has(p.name)) return;
    seen.add(p.name);
    for (const raw of p.depends) {
      const d = parseDep(raw);
      if (d.conflict) continue;
      for (const s of selected.values()) {
        if (s.name === d.name || s.provides.some(x => x.split("=")[0] === d.name)) visit(s);
      }
    }
    if (todo.has(p.name)) out.push(p);
  };
  for (const p of pkgs) visit(p);
  return out;
}

async function fetchPackage(ctx: Ctx, p: Pkg): Promise<Uint8Array> {
  const cached = join(at(ctx, P.cache), `${p.name}-${p.version}.apk`);
  if (existsSync(cached)) {
    const b = readFileSync(cached);
    if (!p.size || b.length === p.size) return b;
  }
  if (!p.repo) throw new ApkError(`${p.name}-${p.version} : aucun dépôt ne le fournit`);
  const bytes = await readResource(`${p.repo.base}${p.name}-${p.version}.apk`);
  atomicWrite(cached, bytes);
  return bytes;
}

/** Applique l'état final `selected` (installe, met à jour, supprime). */
async function commit(ctx: Ctx, selected: Map<string, Pkg>, world: string[]) {
  const installed = loadInstalled(ctx);
  const byName = new Map(installed.map(p => [p.name, p]));
  const changes = [...selected.values()].filter(p => byName.get(p.name)?.version !== p.version);
  const removals = installed.filter(p => !selected.has(p.name));
  const ordered = installOrder(changes, selected);
  const total = ordered.length + removals.length;

  // Tout télécharger et vérifier avant de toucher la racine.
  const opened = new Map<string, OpenedPkg>();
  for (const p of ordered) opened.set(p.name, openApk(await fetchPackage(ctx, p), ctx.keysDir, p, ctx.allowUntrusted));

  const owner = new Map<string, string>();
  for (const p of installed) for (const f of p.files) owner.set(f.path.toLowerCase(), p.name);
  const leaving = new Set([...removals.map(p => p.name), ...ordered.map(p => p.name)]);
  for (const p of ordered) {
    for (const e of opened.get(p.name)!.files) {
      if (e.type === "dir") continue;
      const o = owner.get(e.name.toLowerCase());
      if (o && o !== p.name && !leaving.has(o)) {
        throw new ApkError(`${p.name}-${p.version} : ${e.name} appartient déjà à ${o}`);
      }
    }
  }

  let step = 0;
  const pad = (n: number) => String(n).padStart(String(total).length);
  for (const p of ordered) {
    const old = byName.get(p.name);
    if (!ctx.quiet) {
      ctx.out(
        `(${pad(++step)}/${total}) ${old ? `Mise à jour ${p.name} (${old.version} -> ${p.version})` : `Installation ${p.name} (${p.version})`}`,
      );
    }
    const o = opened.get(p.name)!;
    const kind = old ? "upgrade" : "install";
    const args = old ? [p.version, old.version] : [p.version];
    await runScript(ctx, p, SCRIPT_ORDER[kind][0], o.scripts[SCRIPT_ORDER[kind][0]], args);
    const res = extractEntries(ctx.root, o.files);
    for (const w of res.warnings) ctx.out(`ATTENTION : ${w}`);
    if (old) {
      const keep = new Set(res.files.map(f => f.path.toLowerCase()));
      removeFiles(
        ctx.root,
        old.files.map(f => f.path).filter(f => !keep.has(f.toLowerCase())),
        old.dirs,
      );
    }
    const sdir = join(at(ctx, P.scripts), p.name);
    rmSync(sdir, { recursive: true, force: true });
    for (const [n, body] of Object.entries(o.scripts)) atomicWrite(join(sdir, n), body);
    const { repo: _repo, ...meta } = p;
    const rec: InstalledPkg = { ...meta, files: res.files, dirs: res.dirs };
    byName.set(p.name, rec);
    await runScript(ctx, p, SCRIPT_ORDER[kind][1], o.scripts[SCRIPT_ORDER[kind][1]], args);
    saveState(ctx, [...byName.values()], world);
  }
  for (const p of removals) {
    if (!ctx.quiet) ctx.out(`(${pad(++step)}/${total}) Suppression ${p.name} (${p.version})`);
    const s = storedScripts(ctx, p.name);
    await runScript(ctx, p, ".pre-deinstall", s[".pre-deinstall"], [p.version]);
    removeFiles(
      ctx.root,
      p.files.map(f => f.path),
      p.dirs,
    );
    await runScript(ctx, p, ".post-deinstall", s[".post-deinstall"], [p.version]);
    rmSync(join(at(ctx, P.scripts), p.name), { recursive: true, force: true });
    byName.delete(p.name);
    saveState(ctx, [...byName.values()], world);
  }
  saveState(ctx, [...byName.values()], world);
  if (!ctx.quiet) {
    const size = [...byName.values()].reduce((a, p) => a + (p.installedSize || 0), 0);
    ctx.out(`OK: ${(size / 1048576).toFixed(1)} MiB dans ${byName.size} paquets`);
  }
}

function worldWith(world: string[], adds: string[]): string[] {
  const names = new Set(adds.map(a => parseDep(a).name));
  return [...world.filter(w => !names.has(parseDep(w).name)), ...adds].sort();
}

function fmtList(p: Pkg, installed: boolean) {
  return `${p.name}-${p.version} ${p.arch} {${p.origin || p.name}} (${p.license})${installed ? " [installed]" : ""}`;
}

function globMatcher(pattern: string): (s: string) => boolean {
  const pat = /[*?[]/.test(pattern) ? pattern : `*${pattern}*`;
  const g = new Bun.Glob(pat);
  return s => g.match(s);
}

function latestByName(pkgs: Pkg[]): Pkg[] {
  const m = new Map<string, Pkg>();
  for (const p of pkgs) {
    const cur = m.get(p.name);
    if (!cur || compareVersions(p.version, cur.version) > 0) m.set(p.name, p);
  }
  return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
}

const HELP = `Usage : apk [options] <commande> [arguments]

Commandes :
  update                 télécharge et vérifie les index des dépôts
  search [-d] <motif>…   cherche des paquets (nom, ou description avec -d)
  info [-L] [paquet…]    décrit un paquet (installé ou disponible) ; -L liste ses fichiers
  add [-u] <dép>…        installe (nom, nom>=1.0, so:libfoo.dll…) ; -u met aussi à jour
  del <nom>…             retire du monde et supprime les paquets devenus inutiles
  upgrade                met à jour tous les paquets installés
  list [--installed] [motif]

Options :
  --root <dir>           racine (défaut ${defaultRoot()})
  --repo <url|dir>       dépôt supplémentaire (répétable)
  --keys-dir <dir>       clés publiques (défaut <root>\\etc\\apk\\keys)
  --arch <arch>          architecture (défaut <root>\\etc\\apk\\arch ou ${defaultArch()})
  --allow-untrusted      accepte index et paquets non signés
  --no-scripts           n'exécute pas les scripts de paquet
  -q, --quiet`;

export async function run(argv: string[], out: (s: string) => void = s => console.log(s)): Promise<number> {
  const { values: o, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      root: { type: "string" },
      repo: { type: "string", multiple: true, short: "X" },
      "keys-dir": { type: "string" },
      arch: { type: "string" },
      "allow-untrusted": { type: "boolean" },
      "no-scripts": { type: "boolean" },
      quiet: { type: "boolean", short: "q" },
      installed: { type: "boolean", short: "I" },
      upgrade: { type: "boolean", short: "u" },
      description: { type: "boolean", short: "d" },
      contents: { type: "boolean", short: "L" },
      help: { type: "boolean", short: "h" },
    },
  });
  const [cmd, ...args] = positionals;
  if (o.help || !cmd) {
    out(HELP);
    return cmd || o.help ? 0 : 1;
  }
  const root = o.root ?? defaultRoot();
  const archFile = join(root, ...P.arch.split("/"));
  const arch = o.arch ?? (existsSync(archFile) ? readFileSync(archFile, "utf8").trim() : defaultArch());
  const ctx: Ctx = {
    root,
    arch,
    keysDir: o["keys-dir"] ?? join(root, ...P.keys.split("/")),
    repos: [],
    allowUntrusted: !!o["allow-untrusted"],
    scripts: !o["no-scripts"],
    quiet: !!o.quiet,
    out,
  };
  const specs = [...readLines(at(ctx, P.repositories)), ...(o.repo ?? [])];
  ctx.repos = [...new Set(specs)].map(s => parseRepo(s, arch));

  try {
    switch (cmd) {
      case "update": {
        const pkgs = await update(ctx);
        if (!ctx.quiet) out(`OK: ${new Set(pkgs.map(p => p.name)).size} paquets distincts disponibles`);
        return 0;
      }
      case "search": {
        const ms = args.map(globMatcher);
        for (const p of latestByName(await loadAvailable(ctx))) {
          if (ms.length && !ms.some(m => m(p.name) || (o.description && m(p.description)))) continue;
          out(o.quiet ? p.name : `${p.name}-${p.version}${o.description ? ` - ${p.description}` : ""}`);
        }
        return 0;
      }
      case "list": {
        const inst = loadInstalled(ctx);
        const names = new Set(inst.map(p => `${p.name}-${p.version}`));
        const m = args.length ? args.map(globMatcher) : [];
        const pkgs = o.installed ? inst : latestByName(await loadAvailable(ctx));
        for (const p of pkgs.sort((a, b) => a.name.localeCompare(b.name))) {
          if (m.length && !m.some(f => f(p.name))) continue;
          out(fmtList(p, names.has(`${p.name}-${p.version}`)));
        }
        return 0;
      }
      case "info": {
        const inst = loadInstalled(ctx);
        if (!args.length) {
          for (const p of inst) out(p.name);
          return 0;
        }
        const avail = inst.length && args.every(a => inst.some(p => p.name === a)) ? [] : await loadAvailable(ctx);
        let missing = 0;
        for (const name of args) {
          const ip = inst.find(p => p.name === name);
          const p = ip ?? latestByName(avail.filter(x => x.name === name))[0];
          if (!p) {
            out(`ERROR: ${name} : paquet inconnu`);
            missing++;
            continue;
          }
          const id = `${p.name}-${p.version}`;
          out(`${id} description:\n${p.description}\n`);
          out(`${id} webpage:\n${p.url}\n`);
          out(`${id} installed size:\n${Math.ceil(p.installedSize / 1024)} KiB\n`);
          if (p.depends.length) out(`${id} depends on:\n${p.depends.join("\n")}\n`);
          if (p.provides.length) out(`${id} provides:\n${p.provides.join("\n")}\n`);
          out(`${id} état : ${ip ? "installé" : "disponible"}\n`);
          if (o.contents && ip) out(`${id} contains:\n${ip.files.map(f => f.path).join("\n")}\n`);
        }
        return missing ? 1 : 0;
      }
      case "add":
      case "del":
      case "upgrade": {
        if (cmd !== "upgrade" && !args.length) throw new ApkError(`${cmd} : au moins un paquet attendu`);
        mkdirSync(ctx.keysDir, { recursive: true });
        const unlock = lock(ctx);
        try {
          const installed = loadInstalled(ctx);
          let world = readLines(at(ctx, P.world));
          let available: Pkg[] = [];
          if (cmd === "del") {
            const names = new Set(args);
            for (const n of names) {
              if (!world.some(w => parseDep(w).name === n) && !installed.some(p => p.name === n)) {
                throw new ApkError(`${n} : ni dans le monde ni installé`);
              }
            }
            world = world.filter(w => !names.has(parseDep(w).name));
            const { selected } = resolve(world, installed, []);
            for (const n of names) {
              const still = selected.get(n);
              if (still) {
                const by = [...selected.values()]
                  .filter(s => s.depends.some(d => satisfies(still, parseDep(d))))
                  .map(s => s.name);
                throw new ApkError(`${n} est encore requis par ${by.join(", ") || "le monde"}`);
              }
            }
            await commit(ctx, selected, world);
          } else {
            available = await loadAvailable(ctx);
            if (cmd === "add") world = worldWith(world, args);
            const { selected } = resolve(world, installed, available, cmd === "upgrade" || !!o.upgrade);
            await commit(ctx, selected, world);
          }
        } finally {
          unlock();
        }
        return 0;
      }
      default:
        out(`ERROR: commande inconnue : ${cmd}\n\n${HELP}`);
        return 1;
    }
  } catch (e) {
    if (e instanceof ApkError) {
      out(`ERROR: ${e.message}`);
      return 1;
    }
    throw e;
  }
}

if (import.meta.main) {
  process.exitCode = await run(process.argv.slice(2), s =>
    s.startsWith("ERROR:") ? console.error(s) : console.log(s),
  );
}
