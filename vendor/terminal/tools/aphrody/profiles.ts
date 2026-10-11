// bun run check:profiles [settings.json] : ouvre la commandline de chaque profil visible dans un PTY
// headless (`aphrody shell term`) et vérifie qu'un écran non vide s'affiche.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { CANONICAL_SETTINGS, LOCALAPPDATA, log } from "./lib.ts";

interface Profile {
  name: string;
  commandline?: string;
  hidden?: boolean;
  source?: string;
  startingDirectory?: string;
}

const APHRODY = join(LOCALAPPDATA, "aphrody", "bin", "aphrody.exe");
const settingsFile = process.argv[2] ?? CANONICAL_SETTINGS;
const settings = (await Bun.file(settingsFile).json()) as {
  profiles: { defaults?: Profile; list: Profile[] };
};

const expand = (s: string) => s.replace(/%([^%]+)%/g, (m, k: string) => process.env[k] ?? m);

/** CommandLineToArgvW-style split (double quotes group, no backslash escapes needed here). */
function argv(commandline: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  let has = false;
  for (const ch of expand(commandline)) {
    if (ch === '"') {
      quoted = !quoted;
      has = true;
    } else if (/\s/.test(ch) && !quoted) {
      if (has) out.push(cur);
      cur = "";
      has = false;
    } else {
      cur += ch;
      has = true;
    }
  }
  if (has) out.push(cur);
  return out;
}

function commandFor(p: Profile): string[] | undefined {
  if (p.commandline) return argv(p.commandline);
  if (p.source === "Microsoft.WSL" || p.source === "Windows.Terminal.Wsl") return ["wsl.exe", "-d", p.name];
  return undefined;
}

const results: { name: string; ok: boolean; detail: string }[] = [];
for (const p of settings.profiles.list.filter(p => !p.hidden)) {
  const cmd = commandFor(p);
  if (!cmd) {
    results.push({ name: p.name, ok: false, detail: "pas de commandline" });
    continue;
  }
  const cwd = expand(p.startingDirectory ?? settings.profiles.defaults?.startingDirectory ?? process.cwd());
  const proc = Bun.spawn([APHRODY, "shell", "term", ...cmd], {
    cwd: existsSync(cwd) ? cwd : undefined,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 90_000,
  });
  const [out, err, code] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
  const screen = out
    .split(/\r?\n/)
    .filter(l => l.trim() && !l.startsWith("=== Aphrody Term"))
    .map(l => l.trimEnd());
  const failed =
    /introuvable|not recognized|not found|cannot find|No such file|Could not resolve|Connection refused|Permission denied/i.test(
      screen.join("\n") + err,
    );
  const ok = code === 0 && screen.length > 0 && !failed;
  results.push({ name: p.name, ok, detail: (screen.slice(0, 3).join(" | ") || err.trim()).slice(0, 160) });
  log(ok ? "ok" : "ÉCHEC", `${p.name} : ${cmd.join(" ")}`);
}

console.log();
for (const r of results) console.log(`${r.ok ? "OK    " : "ÉCHEC "} ${r.name.padEnd(22)} ${r.detail}`);
if (results.some(r => !r.ok)) process.exit(1);
