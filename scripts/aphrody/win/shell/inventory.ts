#!/usr/bin/env bun
// Inventaire des binaires POSIX (Git Bash / MSYS2) réellement invoqués par nos scripts et agents.
// Usage : bun scripts/aphrody/win/shell/inventory.ts [--out <inventory.json>]
// Sortie : { binaires: { <bin>: [{ ref: "fichier:ligne", plateforme, via, ... }] }, ... }
// plateforme : "win32" (exécuté sous Windows), "all" (tout OS, donc aussi Windows), "posix" (jamais sous Windows).
import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import { parseArgs } from "node:util";

export const POSIX_BINS = new Set(
  (
    "bash sh sed grep egrep awk gawk find xargs tar gzip gunzip zcat which env head tail wc sort uniq tr cut mktemp " +
    "chmod chown ln diff cmp readlink realpath tee unzip zip patch du df stat md5sum sha1sum sha256sum shasum nproc uname " +
    "xz zstd flock nice timeout printf test [ file install date sleep basename dirname cat ls cp mv rm rmdir mkdir touch " +
    "id whoami hostname less more od xxd perl expr seq yes true false pwd echo kill ps cygpath"
  ).split(" "),
);

/** Builtins de l'interpréteur Bun Shell (src/runtime/shell/builtin/*.rs). */
export const BUN_SHELL_BUILTINS = new Set(
  "basename cat cd cp dirname echo exit export false ls mkdir mv pwd rm seq touch true which yes test [ :".split(" "),
);

interface Root {
  repo: string;
  base: string;
  globs: string[];
}

const ROOTS: Root[] = [
  {
    repo: "bun",
    base: "C:/bun",
    globs: ["scripts/**/*", "package.json", ".github/workflows/*", ".buildkite/**/*", "test/harness.ts"],
  },
  {
    repo: "aphrody",
    base: "C:/aphrody",
    globs: [
      "scripts/**/*",
      "tools/**/*",
      "package.json",
      ".github/workflows/*",
      "justfile",
      "packages/engine/yolo/yolo.just",
    ],
  },
  { repo: "aports", base: "C:/aports", globs: ["aphrody/scripts/**/*"] },
];

const CODE_EXT = /\.(m?ts|m?js|cjs|tsx)$/;
const SKIP_DIR = /[\\/](node_modules|vendor|target|dist|\.cache|fixtures?|aphrody[\\/]win[\\/]shell)[\\/]/;

/** Fichiers ou dossiers exécutés uniquement sur hôtes Linux/macOS (déploiement, images CI, conteneurs). */
const POSIX_ONLY_PATH =
  /(alpine|linux|darwin|docker|container|ci-images|[\\/]release[\\/]|migration|remote|vps|wsl|xmac|orderfile|debug-coredump|buildkite\.ts|[\\/]infra[\\/]|systemd|nginx|[\\/]host[\\/]|[\\/]os[\\/]|ghidra|cloud-|agent\.ts|db-compare|toolchain-sync|bun-hygiene\.sh|\.buildkite)/i;

/** Scripts .sh dont l'exécution sous Windows est avérée (référencés par justfile ou par les consignes agents Windows). */
const SH_RUN_ON_WINDOWS: Record<string, string> = {
  "aphrody:scripts/build/rust/cargo-serial.sh":
    "justfile check/clippy/test (just → sh de Git) et consignes agents (CLAUDE.md, g-common.md)",
  "aphrody:scripts/build/rust/channel-cargo.sh": "appelé par yolo.just (set shell bash) sous Windows",
  "aphrody:scripts/build/shell/check-all.sh": "gate shell web/tauri lancé localement",
  "bun:scripts/run-clang-format.sh": "package.json clang-format (bun run → Bun Shell → ./x.sh → bash de Git)",
  "aphrody:scripts/audit/ai/scripts/scan-repo.sh": "package.json scan → bash",
};

/** Corrections manuelles vérifiées (lecture du code) : clé "repo:fichier:ligne". */
const OVERRIDES: Record<string, { plateforme: Plateforme; note: string }> = {
  "bun:test/harness.ts:257": {
    plateforme: "win32",
    note: "`tar` résolu par PATH : sous Windows avec Git\\usr\\bin en tête c'est GNU tar msys (pas bsdtar) ; utiliser %SystemRoot%\\System32\\tar.exe comme scripts/build/download.ts:65",
  },
  "bun:scripts/runner.node.ts:104": { plateforme: "all", note: "which(['bash','sh']) : repli si pwsh absent" },
  "bun:scripts/runner.node.ts:91": {
    plateforme: "posix",
    note: "branche else de isWindows (Expand-Archive sous Windows)",
  },
  "bun:scripts/build/download.ts:297": {
    plateforme: "all",
    note: "unzip tenté d'abord sur tout OS, repli bsdtar System32 ; sous Windows unzip vient de Git\\usr\\bin s'il est en PATH",
  },
  "bun:scripts/build/configure.ts:422": {
    plateforme: "all",
    note: "perl requis pour create-hash-table.ts ; sous Windows perl = Git\\usr\\bin\\perl (msys)",
  },
  "bun:scripts/aphrody/perf-gate.ts:433": { plateforme: "posix", note: "Windows utilise System32\\tar.exe (l.431)" },
  "bun:scripts/aphrody/perf-gate.ts:434": { plateforme: "posix", note: "Windows utilise System32\\tar.exe (l.431)" },
  "bun:scripts/find-build.ts:347": { plateforme: "all", note: "mkdir -p : builtin Bun Shell" },
  "bun:scripts/aphrody/publish-web-inspector.ts:68": {
    plateforme: "all",
    note: "tar --wildcards (option GNU) : bsdtar l'ignore/échoue",
  },
};

type Plateforme = "win32" | "all" | "posix";

interface Hit {
  ref: string;
  repo: string;
  via: "bun-shell" | "argv" | "sh-script" | "justfile" | "package.json" | "workflow";
  plateforme: Plateforme;
  builtinBunShell: boolean;
  extrait: string;
  note?: string;
}

function firstWords(cmdline: string): string[] {
  // Découpe une ligne shell en commandes simples et rend le premier mot de chacune.
  const out: string[] = [];
  // Motif de `case` (« build|b|check) ») : pas une commande.
  if (/^\s*[\w|*.+-]+\)/.test(cmdline)) return out;
  const cleaned = cmdline
    .replace(/\$\{[^}]*\}/g, "X")
    .replace(/'[^']*'/g, "''")
    .replace(/"([^"]*)"/g, (q, s: string) => (s.includes("$(") ? q : '""'));
  for (let seg of cleaned.split(/\|\||&&|[|;&]|\$\(|`|\bthen\b|\bdo\b|\belse\b|\(|\{/)) {
    seg = seg.trim();
    while (/^[A-Za-z_][A-Za-z0-9_]*=\S*\s+/.test(seg)) seg = seg.replace(/^[A-Za-z_][A-Za-z0-9_]*=\S*\s+/, "");
    for (;;) {
      const m = /^(exec|command|sudo|time|!|nice(?:\s+-n\s+\S+)?|env|timeout\s+\S+|xargs(?:\s+-\S+)*)\s+/.exec(seg);
      if (!m) break;
      const w = m[1].split(/\s/)[0];
      if (POSIX_BINS.has(w)) out.push(w);
      seg = seg.slice(m[0].length);
    }
    const m = /^([[\w.+-]+)/.exec(seg);
    if (m) out.push(m[1].replace(/\.exe$/, ""));
  }
  return out;
}

function classify(repo: string, rel: string): Plateforme {
  return POSIX_ONLY_PATH.test(`/${rel}`) ? "posix" : "all";
}

async function* walk(root: Root): AsyncGenerator<string> {
  const seen = new Set<string>();
  for (const g of root.globs) {
    if (!g.includes("*")) {
      if (existsSync(join(root.base, g))) yield g;
      continue;
    }
    for await (const f of new Bun.Glob(g).scan({ cwd: root.base, onlyFiles: true, dot: true })) {
      const rel = f.replaceAll("\\", "/");
      if (seen.has(rel) || SKIP_DIR.test(`/${rel}/`)) continue;
      seen.add(rel);
      yield rel;
    }
  }
}

const ARGV_RE =
  /(?:\b(?:spawn|spawnSync|execFile|execFileSync|requireCommand|findSystemTool)\s*\(\s*\[?\s*|(?<![.\w])(?:run|which)\s*\(\s*\[?\s*|\bcmd:\s*\[\s*|\bcommand:\s*)(["'])([\w.+[-]+)\1/g;
const EXECSYNC_RE = /\bexecSync\(\s*(["'`])([\w.+-]+)[\s"'`]/g;
const BUNSHELL_RE = /\$`([^`]*)`/g;

/**
 * Commandes réellement passées par les agents à l'outil Bash (Git Bash sous Windows) :
 * transcripts ~/.claude/projects/C--* (sessions Windows). Rend fréquence + 3 exemples par binaire.
 */
async function agentCommands(home = process.env.USERPROFILE ?? "C:/Users/aphro") {
  const dir = join(home, ".claude", "projects");
  const freq = new Map<string, { n: number; exemples: string[] }>();
  let commandes = 0;
  let fichiers = 0;
  if (!existsSync(dir)) return { source: dir, fichiers, commandes, binaires: {} };
  for await (const f of new Bun.Glob("C--*/**/*.jsonl").scan({ cwd: dir, onlyFiles: true })) {
    fichiers++;
    const text = await Bun.file(join(dir, f)).text();
    for (const line of text.split("\n")) {
      if (!line.includes('"name":"Bash"')) continue;
      let msg: any;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      for (const c of msg?.message?.content ?? []) {
        if (c?.type !== "tool_use" || c.name !== "Bash" || typeof c.input?.command !== "string") continue;
        commandes++;
        const seen = new Set<string>();
        for (const l of c.input.command.split("\n"))
          for (const w of firstWords(l)) {
            if (!POSIX_BINS.has(w) || seen.has(w)) continue;
            seen.add(w);
            const e = freq.get(w) ?? { n: 0, exemples: [] };
            e.n++;
            if (e.exemples.length < 3) e.exemples.push(l.trim().slice(0, 120));
            freq.set(w, e);
          }
      }
    }
  }
  const binaires = Object.fromEntries([...freq].sort((a, b) => b[1].n - a[1].n));
  return { source: dir.replaceAll("\\", "/") + "/C--*/**/*.jsonl", fichiers, commandes, binaires };
}

export async function inventory() {
  const hits: Hit[] = [];
  const push = (h: Omit<Hit, "builtinBunShell">, bin: string) => {
    if (!POSIX_BINS.has(bin)) return;
    const key = `${h.repo}:${h.ref}`;
    const o = OVERRIDES[key];
    hits.push({
      ...h,
      ref: `${h.repo}:${h.ref}`,
      plateforme: o?.plateforme ?? h.plateforme,
      note: o?.note ?? h.note,
      builtinBunShell: BUN_SHELL_BUILTINS.has(bin),
      [Symbol.for("bin")]: bin,
    } as Hit);
  };
  for (const root of ROOTS) {
    for await (const rel of walk(root)) {
      const abs = join(root.base, rel);
      const isSh = rel.endsWith(".sh");
      const isJust = /(^|\/)justfile$|\.just$/.test(rel);
      const isPkg = rel.endsWith("package.json");
      const isWf = /\.github\/workflows\/.*\.ya?ml$/.test(rel);
      if (!(CODE_EXT.test(rel) || isSh || isJust || isPkg || isWf)) continue;
      const text = await Bun.file(abs).text();
      const lines = text.split(/\r?\n/);
      const base = classify(root.repo, rel);

      if (isSh) {
        const shKey = `${root.repo}:${rel}`;
        const winNote = SH_RUN_ON_WINDOWS[shKey];
        const plat: Plateforme = winNote ? "win32" : "posix";
        const bins = new Map<string, number>();
        lines.forEach((l, i) => {
          if (/^\s*#/.test(l)) return;
          for (const w of firstWords(l)) if (POSIX_BINS.has(w) && !bins.has(w)) bins.set(w, i + 1);
        });
        const shebang = /bash/.test(lines[0] ?? "") ? "bash" : "sh";
        push(
          {
            ref: `${rel}:1`,
            repo: root.repo,
            via: "sh-script",
            plateforme: plat,
            extrait: lines[0] ?? "",
            note: winNote,
          },
          shebang,
        );
        for (const [b, ln] of bins)
          push(
            {
              ref: `${rel}:${ln}`,
              repo: root.repo,
              via: "sh-script",
              plateforme: plat,
              extrait: lines[ln - 1].trim().slice(0, 160),
              note: winNote,
            },
            b,
          );
        continue;
      }

      if (isJust) {
        const bash = /set shell := \["bash"/.test(text);
        const winShell = /set windows-shell/.test(text);
        push(
          {
            ref: `${rel}:1`,
            repo: root.repo,
            via: "justfile",
            plateforme: "win32",
            extrait: bash ? 'set shell := ["bash", ...]' : "shell par défaut de just = sh",
            note: winShell ? "windows-shell défini" : "just sous Windows lance sh/bash du PATH (Git)",
          },
          bash ? "bash" : "sh",
        );
        lines.forEach((l, i) => {
          if (!/^\s+\S/.test(l) || /^\s*#/.test(l)) return;
          for (const w of firstWords(l.replace(/^\s*[@-]+/, "")))
            push(
              {
                ref: `${rel}:${i + 1}`,
                repo: root.repo,
                via: "justfile",
                plateforme: "win32",
                extrait: l.trim().slice(0, 160),
              },
              w,
            );
        });
        continue;
      }

      if (isPkg) {
        let scripts: Record<string, string> = {};
        try {
          scripts = JSON.parse(text).scripts ?? {};
        } catch {}
        for (const [name, cmd] of Object.entries(scripts)) {
          const ln = lines.findIndex(l => l.includes(`"${name}":`)) + 1;
          for (const w of firstWords(cmd)) {
            // bun run sous Windows interprète les scripts avec Bun Shell : seuls les non-builtins tombent sur Git\usr\bin.
            const plat: Plateforme = /docker|leak|linux/.test(name) ? "posix" : "all";
            push(
              {
                ref: `${rel}:${ln}`,
                repo: root.repo,
                via: "package.json",
                plateforme: plat,
                extrait: `${name}: ${cmd.slice(0, 140)}`,
              },
              w,
            );
            if (w.endsWith(".sh"))
              push(
                {
                  ref: `${rel}:${ln}`,
                  repo: root.repo,
                  via: "package.json",
                  plateforme: plat,
                  extrait: `${name}: ${cmd.slice(0, 140)}`,
                },
                "bash",
              );
          }
          const sh = /(?:^|\s)(\.\/)?[\w/.-]+\.sh\b/.exec(cmd);
          if (sh)
            push(
              {
                ref: `${rel}:${ln}`,
                repo: root.repo,
                via: "package.json",
                plateforme: "all",
                extrait: `${name}: ${cmd.slice(0, 140)}`,
                note: "script .sh lancé via bash",
              },
              "bash",
            );
        }
        continue;
      }

      if (isWf) {
        const windows = /runs-on:.*windows|runner:\s*windows|windows-20\d\d|windows-latest/.test(text);
        const bashDefault = /shell:\s*bash/.test(text);
        if (windows && bashDefault) {
          let inRun = false;
          lines.forEach((l, i) => {
            if (/^\s*(-\s+)?run:\s*\|?\s*$/.test(l)) return void (inRun = true);
            const single = /^\s*(-\s+)?run:\s*(.+)$/.exec(l);
            const body = single ? single[2] : inRun && /^\s{8,}\S/.test(l) ? l : null;
            if (!single && inRun && !/^\s{8,}/.test(l) && l.trim()) inRun = false;
            if (body == null) return;
            for (const w of firstWords(body))
              push(
                {
                  ref: `${rel}:${i + 1}`,
                  repo: root.repo,
                  via: "workflow",
                  plateforme: "win32",
                  extrait: body.trim().slice(0, 160),
                  note: "job matriciel incluant windows, defaults.run.shell: bash (Git Bash du runner)",
                },
                w,
              );
          });
        }
        continue;
      }

      lines.forEach((l, i) => {
        if (/^\s*(\/\/|\*)/.test(l)) return;
        const ref = `${rel}:${i + 1}`;
        for (const m of l.matchAll(ARGV_RE))
          push(
            { ref, repo: root.repo, via: "argv", plateforme: base, extrait: l.trim().slice(0, 160) },
            m[2].replace(/\.exe$/, ""),
          );
        for (const m of l.matchAll(EXECSYNC_RE))
          push({ ref, repo: root.repo, via: "argv", plateforme: base, extrait: l.trim().slice(0, 160) }, m[2]);
        for (const m of l.matchAll(BUNSHELL_RE))
          for (const w of firstWords(m[1]))
            push({ ref, repo: root.repo, via: "bun-shell", plateforme: base, extrait: l.trim().slice(0, 160) }, w);
      });
    }
  }
  const binaires: Record<string, Hit[]> = {};
  for (const h of hits) {
    const b = (h as any)[Symbol.for("bin")] as string;
    (binaires[b] ??= []).push(h);
  }
  const sorted = Object.fromEntries(Object.entries(binaires).sort(([a], [b]) => a.localeCompare(b)));
  const resume = Object.fromEntries(
    Object.entries(sorted).map(([b, hs]) => [
      b,
      {
        total: hs.length,
        win32: hs.filter(h => h.plateforme === "win32").length,
        all: hs.filter(h => h.plateforme === "all").length,
        posix: hs.filter(h => h.plateforme === "posix").length,
      },
    ]),
  );
  return {
    genere: new Date().toISOString(),
    racines: ROOTS.map(r => ({ repo: r.repo, base: r.base, globs: r.globs })),
    legende: {
      plateforme: {
        win32: "exécuté sous Windows",
        all: "tout OS (donc aussi Windows)",
        posix: "hôtes Linux/macOS uniquement",
      },
      builtinBunShell: "true = déjà servi par Bun Shell sans binaire externe",
    },
    scriptsShSousWindows: SH_RUN_ON_WINDOWS,
    resume,
    binaires: sorted,
    agentsBashWindows: await agentCommands(),
  };
}

if (import.meta.main) {
  const { values } = parseArgs({ options: { out: { type: "string" } } });
  const out = values.out ?? join(import.meta.dir, "inventory.json");
  const inv = await inventory();
  await Bun.write(out, JSON.stringify(inv, null, 2) + "\n");
  const win = Object.entries(inv.resume).filter(([, r]) => r.win32 + r.all > 0);
  console.log(
    `${Object.keys(inv.binaires).length} binaires, ${win.length} atteignables sous Windows -> ${relative(process.cwd(), out)}`,
  );
  for (const [b, r] of win) console.log(`  ${b.padEnd(10)} win32=${r.win32} all=${r.all} posix=${r.posix}`);
  const ag = inv.agentsBashWindows;
  console.log(`agents : ${ag.commandes} commandes Bash dans ${ag.fichiers} transcripts`);
  for (const [b, e] of Object.entries(ag.binaires).slice(0, 30)) console.log(`  ${b.padEnd(10)} ${(e as any).n}`);
}
