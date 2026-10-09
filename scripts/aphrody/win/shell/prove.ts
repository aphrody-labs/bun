#!/usr/bin/env bun
// Preuve qu'une commande POSIX de l'inventaire tourne sous Windows sans Git Bash ni MSYS2.
// Chaque cas est exécuté (a) par Git Bash (référence), (b) par Bun.$ avec un PATH filtré
// (uutils en tête ; ni Git\usr\bin, ni Git\bin, ni Git\mingw64\bin, ni C:\msys64, ni dossier contenant msys-2.0.dll ou cygwin1.dll)
// et, avec --bunsh <exe>, (c) par `<exe> -c` sous le même PATH. Sorties et codes de retour comparés, rapport dans report.json.
// Usage : bun scripts/aphrody/win/shell/prove.ts [--bunsh <exe>] [--uutils <dir>] [--out <report.json>]
import { $ } from "bun";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, delimiter, dirname, join } from "node:path";
import { parseArgs } from "node:util";

export const POSIX_RUNTIME_DLLS = ["msys-2.0.dll", "cygwin1.dll"];

/** Dossiers de la couche POSIX MSYS2 (Git for Windows, MSYS2, Cygwin). Git\cmd (git.exe natif) reste permis. */
const POSIX_LAYER_DIR =
  /[\\/](git[\\/](usr[\\/]bin|bin|mingw(32|64)[\\/]bin)|msys(32|64)(?=[\\/]|$)|cygwin(64)?(?=[\\/]|$))([\\/].*)?$/i;

function dirHasPosixRuntime(dir: string): boolean {
  return POSIX_RUNTIME_DLLS.some(dll => existsSync(join(dir, dll)));
}

export interface FilteredPath {
  path: string;
  removed: string[];
}

/**
 * PATH sans couche MSYS2 : retire les dossiers Git Bash/MSYS2/Cygwin et tout dossier qui embarque msys-2.0.dll
 * ou cygwin1.dll, place `prepend` en tête, supprime vides et doublons (comparaison insensible à la casse).
 */
export function filterPath(
  path: string,
  opts: { prepend?: string[]; sep?: string; hasPosixRuntime?: (dir: string) => boolean } = {},
): FilteredPath {
  const sep = opts.sep ?? delimiter;
  const hasRuntime = opts.hasPosixRuntime ?? dirHasPosixRuntime;
  const seen = new Set<string>();
  const kept: string[] = [];
  const removed: string[] = [];
  for (const raw of [...(opts.prepend ?? []), ...path.split(sep)]) {
    const dir = raw.trim().replace(/^"(.*)"$/, "$1");
    if (!dir) continue;
    const key = dir
      .replace(/[\\/]+$/, "")
      .replaceAll("/", "\\")
      .toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (POSIX_LAYER_DIR.test(dir) || hasRuntime(dir)) {
      removed.push(dir);
      continue;
    }
    kept.push(dir);
  }
  return { path: kept.join(sep), removed };
}

/** Environnement du processus avec PATH filtré ; retire les variables qui font croire à un shell MSYS2. */
export function filteredEnv(base: Record<string, string | undefined>, path: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(base)) {
    if (v === undefined) continue;
    const lk = k.toLowerCase();
    if (lk === "path" || lk === "msystem" || lk === "msys" || lk === "chere_invoking" || lk === "shell") continue;
    env[k] = v;
  }
  env.PATH = path;
  return env;
}

interface Case {
  id: string;
  bins: string[];
  cmd: string;
  /** Commande de remplacement côté natif quand le binaire n'a pas d'équivalent direct. */
  alt?: string;
  /** "code" : seul le code de retour est comparé (sortie dépendante du chemin ou aléatoire). */
  compare?: "code";
  note?: string;
}

const SYNTAX = "(syntaxe)";

const CASES: Case[] = [
  { id: "echo", bins: ["echo"], cmd: "echo hello world" },
  { id: "printf", bins: ["printf"], cmd: "printf '%s-%03d\\n' x 7" },
  { id: "dirname", bins: ["dirname"], cmd: "dirname a/b/c.txt" },
  { id: "basename", bins: ["basename"], cmd: "basename a/b/c.txt .txt" },
  { id: "test", bins: ["test"], cmd: "test -d sub && test -f a.txt && test 3 -lt 10 && echo ok" },
  { id: "bracket", bins: ["["], cmd: "[ -s a.txt ] && [ ! -e nope ] && echo ok" },
  { id: "colon", bins: [":"], cmd: ": ignored && echo ok" },
  { id: "true-false", bins: ["true", "false"], cmd: "true && false || echo ok" },
  { id: "head-n", bins: ["head"], cmd: "head -n 3 lines.txt" },
  { id: "head-c", bins: ["head"], cmd: "head -c 5 lines.txt" },
  { id: "tail-n", bins: ["tail"], cmd: "tail -n 2 lines.txt" },
  { id: "cat", bins: ["cat"], cmd: "cat a.txt b.txt" },
  { id: "ls", bins: ["ls"], cmd: "ls sub" },
  { id: "wc-l", bins: ["wc"], cmd: "wc -l lines.txt" },
  { id: "wc-pipe", bins: ["wc", "cat"], cmd: "cat lines.txt | wc -l" },
  { id: "cut", bins: ["cut"], cmd: "cut -d, -f2 data.csv" },
  { id: "sort", bins: ["sort"], cmd: "sort words.txt" },
  { id: "sort-n", bins: ["sort"], cmd: "sort -n nums.txt" },
  { id: "sort-u", bins: ["sort"], cmd: "sort -u words.txt" },
  { id: "sort-k", bins: ["sort"], cmd: "sort -t, -k2 -n data.csv" },
  { id: "uniq-c", bins: ["uniq", "sort"], cmd: "sort words.txt | uniq -c" },
  { id: "tr", bins: ["tr"], cmd: "echo hello | tr a-z A-Z" },
  { id: "sed-n", bins: ["sed"], cmd: "sed -n 2,3p lines.txt" },
  { id: "sed-s", bins: ["sed"], cmd: "sed 's/foo/qux/g' a.txt" },
  { id: "sed-E", bins: ["sed"], cmd: "sed -E 's/([a-z]+) ([0-9])/\\2 \\1/' a.txt" },
  { id: "sed-i", bins: ["sed", "cp"], cmd: "cp b.txt e.txt && sed -i 's/baz/BAZ/' e.txt && cat e.txt" },
  { id: "awk-F", bins: ["awk"], cmd: "awk -F, '{print $1}' data.csv" },
  { id: "awk-sum", bins: ["awk"], cmd: "awk '{s+=$2} END {print s}' a.txt" },
  { id: "grep-n", bins: ["grep"], cmd: "grep -n foo a.txt", alt: "rg -n foo a.txt" },
  { id: "grep-c", bins: ["grep"], cmd: "grep -c foo a.txt", alt: "rg -c foo a.txt" },
  { id: "grep-v", bins: ["grep"], cmd: "grep -v foo a.txt", alt: "rg -v foo a.txt" },
  { id: "grep-E", bins: ["grep"], cmd: "grep -E 'ba[rz]' a.txt b.txt", alt: "rg --sort path --no-heading 'ba[rz]' a.txt b.txt" },
  { id: "grep-rl", bins: ["grep"], cmd: "grep -rl foo sub", alt: "rg -l foo sub" },
  { id: "find-name", bins: ["find"], cmd: "find sub -name '*.txt'" },
  { id: "find-type", bins: ["find"], cmd: "find . -maxdepth 1 -type f -name '*.csv'" },
  { id: "xargs", bins: ["xargs", "cat"], cmd: "echo a.txt b.txt | xargs cat" },
  { id: "diff", bins: ["diff"], cmd: "diff a.txt b.txt" },
  { id: "diff-same", bins: ["diff"], cmd: "diff a.txt a.txt && echo same" },
  { id: "cmp", bins: ["cmp"], cmd: "cmp -s a.txt b.txt || echo differ" },
  { id: "env", bins: ["env", "printenv"], cmd: "env FOO=bar printenv FOO" },
  { id: "mktemp", bins: ["mktemp", "test"], cmd: 'test -d "$(mktemp -d)" && echo ok' },
  {
    id: "fs-ops",
    bins: ["mkdir", "touch", "cp", "mv", "ls", "rm"],
    cmd: "mkdir -p x/y && touch x/y/z && cp a.txt x/ && mv x/a.txt x/m.txt && ls x && rm -rf x && echo gone",
  },
  { id: "ln-s", bins: ["ln"], cmd: "ln -s a.txt l.txt && cat l.txt" },
  { id: "chmod", bins: ["chmod"], cmd: "chmod +x a.txt && echo ok", note: "sans objet sous Windows (pas de bit x)" },
  { id: "sha256sum", bins: ["sha256sum"], cmd: "sha256sum a.txt" },
  { id: "md5sum", bins: ["md5sum"], cmd: "md5sum a.txt" },
  { id: "timeout", bins: ["timeout", "echo"], cmd: "timeout 5 echo hi" },
  { id: "sleep", bins: ["sleep"], cmd: "sleep 0.1 && echo ok" },
  { id: "nproc", bins: ["nproc"], cmd: "nproc" },
  { id: "nice", bins: ["nice", "echo"], cmd: "nice -n 19 echo hi" },
  { id: "seq", bins: ["seq"], cmd: "seq 3" },
  { id: "tee", bins: ["tee"], cmd: "echo hi | tee t.txt && cat t.txt" },
  { id: "expr", bins: ["expr"], cmd: "expr 2 + 3" },
  { id: "date", bins: ["date"], cmd: "date +%Y" },
  { id: "tar-gz", bins: ["tar"], cmd: "tar -czf o.tgz a.txt b.txt && tar -tzf o.tgz" },
  {
    id: "unzip",
    bins: ["unzip"],
    cmd: "unzip -o -q x.zip -d out && cat out/a.txt",
    alt: "mkdir out && tar -xf x.zip -C out && cat out/a.txt",
  },
  {
    id: "gzip",
    bins: ["gzip"],
    cmd: "gzip -c a.txt | gzip -dc",
    note: "remplaçant hors shell : Bun.gzipSync / tar -z",
  },
  { id: "which", bins: ["which"], cmd: "which bun", compare: "code" },
  { id: "uname", bins: ["uname"], cmd: "uname -s", compare: "code", note: "MINGW64_NT-… contre Windows_NT : attendu" },
  {
    id: "cygpath",
    bins: ["cygpath"],
    cmd: "cygpath -w /c/x",
    note: "inutile en natif : les chemins sont déjà Windows",
  },
  { id: "file", bins: ["file"], cmd: "file a.txt" },
  { id: "perl", bins: ["perl"], cmd: "perl -e 'print 1'" },
  { id: "flock", bins: ["flock"], cmd: "flock x.lock echo hi", note: "cargo-serial.sh : portage TS du verrou requis" },
  { id: "id", bins: ["id"], cmd: "id -u", compare: "code" },
  { id: "bash", bins: ["bash"], cmd: "bash -c 'echo ok'", note: "scripts .sh : portage TS ou bunsh" },
  { id: "dbl-bracket", bins: [SYNTAX], cmd: "[[ -d sub ]] && echo ok" },
  { id: "assign", bins: [SYNTAX], cmd: "X=1; echo $X" },
  { id: "glob", bins: [SYNTAX], cmd: "echo *.csv" },
  { id: "devnull", bins: [SYNTAX], cmd: "echo a > /dev/null && echo ok" },
  { id: "subst", bins: [SYNTAX], cmd: "echo $(echo hi)" },
  { id: "default-exp", bins: [SYNTAX], cmd: "echo ${UNSET_V:-dflt}" },
  { id: "for", bins: [SYNTAX], cmd: "for i in 1 2; do echo $i; done" },
  { id: "while", bins: [SYNTAX], cmd: "while false; do echo x; done; echo ok" },
  { id: "case", bins: [SYNTAX], cmd: "case a in a) echo A;; esac" },
  { id: "function", bins: [SYNTAX], cmd: "f() { echo fn; }; f" },
  { id: "group", bins: [SYNTAX], cmd: "{ echo a; echo b; }" },
  { id: "heredoc", bins: [SYNTAX], cmd: "cat <<EOF\nhi\nEOF" },
  { id: "arith", bins: [SYNTAX], cmd: "echo $((1+2))" },
  { id: "status", bins: [SYNTAX], cmd: "false; echo $?" },
  { id: "set-e", bins: [SYNTAX], cmd: "set -e; echo ok" },
  { id: "command-v", bins: [SYNTAX], cmd: "command -v cat > /dev/null && echo ok" },
  { id: "negate", bins: [SYNTAX], cmd: "! false && echo ok" },
];

const FIXTURE: Record<string, string> = {
  "lines.txt": Array.from({ length: 10 }, (_, i) => `l${i + 1}\n`).join(""),
  "a.txt": "foo 1\nbar 2\nfoo 3\n",
  "b.txt": "foo 1\nbaz 2\nfoo 3\n",
  "data.csv": "x,1\ny,22\nz,3\n",
  "words.txt": "pear\napple\npear\nfig\n",
  "nums.txt": "10\n9\n100\n",
  "sub/c.txt": "foo\n",
};

const SYSTEM32 = join(process.env.SystemRoot ?? "C:\\Windows", "System32");
const GIT_BASH = "C:\\Program Files\\Git\\bin\\bash.exe";
/** `bash` résolu dans System32 est le lanceur WSL : il sortirait de Windows, ce n'est pas un remplaçant. */
const REJECTED_RESOLUTION = /[\\/]system32[\\/](bash|wsl)\.exe$/i;
const TIMEOUT_MS = 20_000;

function makeFixture(root: string) {
  for (const [rel, body] of Object.entries(FIXTURE)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), body);
  }
  const zip = Bun.spawnSync([join(SYSTEM32, "tar.exe"), "-a", "-cf", "x.zip", "a.txt"], { cwd: root });
  if (zip.exitCode !== 0) throw new Error(`fixture x.zip : ${zip.stderr.toString()}`);
}

interface Run {
  code: number | null;
  stdout: string;
  stderr: string;
  ms: number;
  timeout?: boolean;
}

const crlf = (s: string) => s.replaceAll("\r\n", "\n");

async function runSpawn(argv: string[], cwd: string, env: Record<string, string>): Promise<Run> {
  const t0 = performance.now();
  await using proc = Bun.spawn(argv, {
    cwd,
    env,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    timeout: TIMEOUT_MS,
  });
  const [stdout, stderr, code] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
  const ms = Math.round(performance.now() - t0);
  return { code, stdout: crlf(stdout), stderr: crlf(stderr), ms, ...(proc.signalCode ? { timeout: true } : {}) };
}

async function runBunShell(cmd: string, cwd: string, env: Record<string, string>): Promise<Run> {
  const t0 = performance.now();
  try {
    const p = $`${{ raw: cmd }}`.cwd(cwd).env(env).nothrow().quiet();
    const r = await Promise.race([p, Bun.sleep(TIMEOUT_MS).then(() => null)]);
    const ms = Math.round(performance.now() - t0);
    if (!r) return { code: null, stdout: "", stderr: "", ms, timeout: true };
    return { code: r.exitCode, stdout: crlf(r.stdout.toString()), stderr: crlf(r.stderr.toString()), ms };
  } catch (e) {
    return { code: null, stdout: "", stderr: `exception : ${String((e as Error)?.message ?? e)}`, ms: 0 };
  }
}

/** Équivalence tolérée : séparateurs de chemin, chemins de fixture, blancs de remplissage. */
function loose(s: string, dirs: string[]): string {
  let out = s;
  for (const d of dirs) out = out.replaceAll(d, "<DIR>");
  return out
    .replace(/^([0-9a-f]{32,128}) \*/gm, "$1  ")
    .replaceAll("\\", "/")
    .replace(/\.\//g, "")
    .split("\n")
    .map(l => l.trim().replace(/\s+/g, " "))
    .join("\n")
    .trim();
}

const NOT_FOUND = /command not found/i;

type Match = "identique" | "équivalent" | "code seulement" | "différent";

function compare(ref: Run, got: Run, c: Case, dirs: string[]): { ok: boolean; match: Match } {
  if (got.timeout || got.code === null) return { ok: false, match: "différent" };
  if (got.code !== ref.code) return { ok: false, match: "différent" };
  // `while`/`set` inconnus : Bun Shell continue avec un code 0 que la sortie seule ne trahit pas.
  if (NOT_FOUND.test(got.stderr) && !NOT_FOUND.test(ref.stderr)) return { ok: false, match: "différent" };
  if (c.compare === "code") return { ok: true, match: "code seulement" };
  if (got.stdout === ref.stdout) return { ok: true, match: "identique" };
  if (loose(got.stdout, dirs) === loose(ref.stdout, dirs)) return { ok: true, match: "équivalent" };
  return { ok: false, match: "différent" };
}

const BUN_SHELL_BUILTINS = new Set(
  "basename cat cd cp dirname echo exit export false ls mkdir mv pwd rm seq touch true which yes".split(" "),
);
/** Builtins ajoutés dans le fork (src/runtime/shell/builtin/test_.rs, Builtin.rs) : absents du bun installé. */
const FORK_BUILTINS = new Set(["test", "[", ":"]);

function describeResolution(bin: string, path: string, uutilsDir: string, forBunsh: boolean): string {
  if (bin === SYNTAX) return "grammaire Bun Shell";
  if (BUN_SHELL_BUILTINS.has(bin) || (forBunsh && FORK_BUILTINS.has(bin))) return "builtin Bun Shell";
  const where = Bun.which(bin, { PATH: path });
  if (!where) return "introuvable";
  if (REJECTED_RESOLUTION.test(where)) return `rejeté (${where} = lanceur WSL)`;
  if (where.toLowerCase().startsWith(uutilsDir.toLowerCase())) return `uutils (${basename(where)})`;
  if (where.toLowerCase().startsWith(SYSTEM32.toLowerCase())) return `System32 (${basename(where)})`;
  return where;
}

/** DLL importées par un exécutable PE (llvm-readobj --coff-imports). */
async function peImports(exe: string): Promise<string[]> {
  const r = await $`llvm-readobj --coff-imports ${exe}`.nothrow().quiet();
  if (r.exitCode !== 0) return [`<llvm-readobj : ${r.stderr.toString().trim().slice(0, 120)}>`];
  return [...new Set([...r.stdout.toString().matchAll(/^\s*Name:\s*(\S+\.dll)\s*$/gim)].map(m => m[1].toLowerCase()))];
}

async function firstLine(argv: string[]): Promise<string> {
  try {
    const r = Bun.spawnSync(argv, { stdin: "ignore" });
    return (r.stdout.toString() || r.stderr.toString()).split(/\r?\n/)[0].trim();
  } catch {
    return "<absent>";
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      bunsh: { type: "string" },
      uutils: { type: "string", default: "C:\\tools\\uutils\\bin" },
      out: { type: "string", default: join(import.meta.dir, "report.json") },
      inventory: { type: "string", default: join(import.meta.dir, "inventory.json") },
    },
  });
  if (process.platform !== "win32") throw new Error("prove.ts compare Git Bash et Bun Shell sous Windows uniquement");
  const uutilsDir = values.uutils!;
  if (!existsSync(join(uutilsDir, "coreutils.exe"))) throw new Error(`uutils absent : ${uutilsDir}`);
  if (!existsSync(GIT_BASH)) throw new Error(`Git Bash absent : ${GIT_BASH}`);

  const basePath = process.env.PATH ?? process.env.Path ?? "";
  const filtered = filterPath(basePath, { prepend: [uutilsDir] });
  const env = filteredEnv(process.env, filtered.path);
  const bashEnv = filteredEnv(process.env, basePath);

  const work = mkdtempSync(join(tmpdir(), "ms-a-prove-"));
  const tpl = join(work, "tpl");
  makeFixture(tpl);

  const inventory = existsSync(values.inventory!) ? await Bun.file(values.inventory!).json() : null;
  const results: any[] = [];
  for (const c of CASES) {
    const dirs = { a: join(work, `a-${c.id}`), b: join(work, `b-${c.id}`), alt: join(work, `alt-${c.id}`) };
    const bunshDir = join(work, `c-${c.id}`);
    for (const d of [...Object.values(dirs), bunshDir]) cpSync(tpl, d, { recursive: true });
    const dirForms = [
      work,
      work.replaceAll("\\", "/"),
      "/" + work[0].toLowerCase() + work.slice(2).replaceAll("\\", "/"),
    ];

    const rejected = c.bins
      .map(b => describeResolution(b, filtered.path, uutilsDir, false))
      .find(r => r.startsWith("rejeté"));
    const a = await runSpawn([GIT_BASH, "-c", c.cmd], dirs.a, bashEnv);
    const b: Run = rejected
      ? { code: null, stdout: "", stderr: rejected, ms: 0 }
      : await runBunShell(c.cmd, dirs.b, env);
    const cmpB = compare(a, b, c, dirForms);
    const entry: any = {
      id: c.id,
      bins: c.bins,
      cmd: c.cmd,
      ...(c.note ? { note: c.note } : {}),
      resolution: Object.fromEntries(
        c.bins.map(bin => [bin, describeResolution(bin, filtered.path, uutilsDir, false)]),
      ),
      gitBash: a,
      bunShell: { ...b, ...cmpB },
    };
    if (c.alt) {
      const alt = await runBunShell(c.alt, dirs.alt, env);
      entry.remplacant = { cmd: c.alt, ...alt, ...compare(a, alt, c, dirForms) };
    }
    if (values.bunsh) {
      const s = rejected
        ? { code: null, stdout: "", stderr: rejected, ms: 0 }
        : await runSpawn([values.bunsh, "-c", c.cmd], bunshDir, env);
      entry.bunsh = { ...s, ...compare(a, s, c, dirForms) };
    }
    entry.prouve = Boolean(entry.bunShell.ok || entry.remplacant?.ok || entry.bunsh?.ok);
    results.push(entry);
    const mark = (x?: { ok: boolean }) => (x ? (x.ok ? "oui" : "non") : "-");
    console.log(
      `${c.id.padEnd(12)} bun=${mark(entry.bunShell)} alt=${mark(entry.remplacant)} bunsh=${mark(entry.bunsh)}  ${c.cmd.split("\n")[0]}`,
    );
  }

  const binaires: Record<string, any> = {};
  for (const r of results) {
    for (const bin of r.bins) {
      const e = (binaires[bin] ??= { cas: [], prouve: true, remplacant: r.resolution[bin], usage: null });
      e.cas.push(r.id);
      e.prouve &&= r.prouve;
      if (r.remplacant?.ok && !r.bunShell.ok)
        e.remplacant = `${r.remplacant.cmd.split(" ")[0]} (commande de remplacement)`;
      if (inventory && bin !== SYNTAX) {
        e.usage = {
          scripts: inventory.resume?.[bin] ?? null,
          agents: inventory.agentsBashWindows?.binaires?.[bin]?.n ?? 0,
        };
      }
    }
  }

  const exes = readdirSync(uutilsDir).filter(f => f.endsWith(".exe"));
  const imports: Record<string, string[]> = {};
  for (let i = 0; i < exes.length; i += 16) {
    const batch = exes.slice(i, i + 16);
    const res = await Promise.all(batch.map(f => peImports(join(uutilsDir, f))));
    batch.forEach((f, j) => (imports[`uutils/${f}`] = res[j]));
  }
  for (const extra of [join(SYSTEM32, "tar.exe"), Bun.which("rg")].filter(Boolean) as string[]) {
    imports[extra] = await peImports(extra);
  }
  if (values.bunsh) imports[values.bunsh] = await peImports(values.bunsh);
  const allDlls = [...new Set(Object.values(imports).flat())].sort();
  const posixRuntime = Object.entries(imports)
    .filter(([, dlls]) => dlls.some(d => POSIX_RUNTIME_DLLS.includes(d)))
    .map(([exe]) => exe);

  const count = (k: "bunShell" | "remplacant" | "bunsh") => results.filter(r => r[k]?.ok).length;
  const report = {
    genere: new Date().toISOString(),
    commande: `bun scripts/aphrody/win/shell/prove.ts${values.bunsh ? ` --bunsh ${values.bunsh}` : ""}`,
    machine: {
      bun: `${Bun.version}+${Bun.revision.slice(0, 9)}`,
      gitBash: await firstLine([GIT_BASH, "--version"]),
      uutils: uutilsDir,
      versions: {
        coreutils: await firstLine([join(uutilsDir, "coreutils.exe"), "--version"]),
        find: await firstLine([join(uutilsDir, "find.exe"), "--version"]),
        diff: await firstLine([join(uutilsDir, "diff.exe"), "--version"]),
        sed: await firstLine([join(uutilsDir, "sed.exe"), "--version"]),
        awk: await firstLine([join(uutilsDir, "awk.exe"), "--version"]),
        tar: await firstLine([join(SYSTEM32, "tar.exe"), "--version"]),
        rg: await firstLine(["rg", "--version"]),
        ...(values.bunsh ? { bunsh: await firstLine([values.bunsh, "--revision"]) } : {}),
      },
    },
    pathFiltre: { entete: uutilsDir, retires: filtered.removed },
    legende: {
      gitBash: "référence : C:\\Program Files\\Git\\bin\\bash.exe -c",
      bunShell: "Bun.$ (bun installé) avec PATH filtré",
      remplacant: "commande native de remplacement sous Bun.$ (grep → rg, unzip → tar)",
      bunsh: "<exe> -c avec PATH filtré (passe finale, binaire du fork)",
      match:
        "identique | équivalent (séparateurs, chemins de fixture, blancs, marqueur binaire `*` de sha*sum msys) | code seulement | différent",
    },
    resume: {
      cas: results.length,
      bunShellOk: count("bunShell"),
      remplacantOk: count("remplacant"),
      ...(values.bunsh ? { bunshOk: count("bunsh") } : {}),
      prouves: results.filter(r => r.prouve).length,
      binairesProuves: Object.entries(binaires)
        .filter(([b, e]) => b !== SYNTAX && e.prouve)
        .map(([b]) => b),
      binairesNonProuves: Object.entries(binaires)
        .filter(([b, e]) => b !== SYNTAX && !e.prouve)
        .map(([b]) => b),
      syntaxeManquante: results.filter(r => r.bins.includes(SYNTAX) && !r.prouve).map(r => r.id),
    },
    imports: { executables: Object.keys(imports).length, dll: allDlls, runtimePosix: posixRuntime, parExe: imports },
    binaires,
    cas: results,
  };
  await Bun.write(values.out!, JSON.stringify(report, null, 2) + "\n");
  rmSync(work, { recursive: true, force: true });
  console.log(
    `\n${report.resume.prouves}/${results.length} cas prouvés ; Bun.$ ${report.resume.bunShellOk}, remplaçant ${report.resume.remplacantOk}` +
      (values.bunsh ? `, bunsh ${report.resume.bunshOk}` : "") +
      `\nnon prouvés : ${report.resume.binairesNonProuves.join(" ")}\nsyntaxe manquante : ${report.resume.syntaxeManquante.join(" ")}` +
      `\nimports msys/cygwin : ${posixRuntime.length ? posixRuntime.join(" ") : "aucun"} (${Object.keys(imports).length} exe)\n→ ${values.out}`,
  );
}

if (import.meta.main) await main();
