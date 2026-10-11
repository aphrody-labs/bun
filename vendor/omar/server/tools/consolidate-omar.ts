import { existsSync, lstatSync, mkdirSync, realpathSync, renameSync, symlinkSync } from "node:fs";
import { resolve, dirname } from "node:path";
import windows from "bun:windows";
const workspace = realpathSync.native("C:/SSH");
const canonical = resolve("C:/SSH/omar");
const inside = (path: string) => { const actual = resolve(path); if (!actual.toLowerCase().startsWith(workspace.toLowerCase() + "\\")) throw new Error("Path outside intended C:/SSH workspace"); return actual; };
inside(canonical);
mkdirSync(canonical, { recursive: true });
const moves = [["C:/SSH/omar-codex", `${canonical}/codex`, "junction"], ["C:/SSH/omar-server", `${canonical}/server`, "junction"], ["C:/SSH/omar.md", `${canonical}/private/omar.md`, "file"]] as const;
for (const [from, to] of moves) {
  inside(from); inside(to);
  if (existsSync(to)) {
    if (!existsSync(from) || !lstatSync(from).isSymbolicLink() || realpathSync.native(from) !== realpathSync.native(to)) throw new Error("Unexpected existing consolidation target");
  } else if (!existsSync(from) || lstatSync(from).isSymbolicLink()) throw new Error("Original source is missing or a symlink");
}
const git = (args: string[]) => { const p = Bun.spawnSync({ cmd: ["git.exe", ...args], stdout: "pipe", stderr: "pipe" }); if (p.exitCode) throw new Error(`Git failed ${args[0]} (${p.exitCode})`); return p.stdout.toString(); };
const before = moves.map(([from, to]) => ({ from, to, actualBefore: realpathSync.native(from) }));
const servicePid = windows.services.get("OmarServer").pid;
windows.services.stop("OmarServer");
for (let attempt = 0; attempt < 60 && windows.services.get("OmarServer").state !== "stopped"; attempt++) await Bun.sleep(250);
if (windows.services.get("OmarServer").state !== "stopped") throw new Error("OmarServer stop timeout; no directories moved");
for (let attempt=0;attempt<60&&windows.processes.list().some(p=>p.pid===servicePid);attempt++)await Bun.sleep(250);
await Bun.sleep(1500);
try {
  for (const [from, to, type] of moves) {
    if (existsSync(to)) continue;
    mkdirSync(dirname(to), { recursive: true });
    for(let attempt=0;;attempt++){
      try { renameSync(from, to); break; }
      catch(error){if(attempt===9)throw error;await Bun.sleep(500);}
    }
    try { symlinkSync(to, from, type); }
    catch (error) { renameSync(to, from); throw error; }
    console.log(JSON.stringify({ moved: from, canonical: to, aliasVerified: realpathSync.native(from) === realpathSync.native(to) }));
  }
  const sid = Bun.spawnSync({ cmd: ["whoami.exe", "/user", "/fo", "csv", "/nh"], stdout: "pipe" }).stdout.toString().match(/S-1-5-21-(?:\d+-){3}\d+/)?.[0];
  if (!sid) throw new Error("User SID missing");
  const acl = Bun.spawnSync({ cmd: ["icacls.exe", `${canonical}/private`, "/inheritance:r", "/grant:r", "*S-1-5-18:(OI)(CI)F", "*S-1-5-32-544:(OI)(CI)F", `*${sid}:(OI)(CI)F`, "/T"], stdout: "pipe", stderr: "pipe" });
  if (acl.exitCode) throw new Error("Private ACL application failed");
  await Bun.write(`${canonical}/.gitignore`, ["private/", "**/node_modules/", "server/var/", "server/logs/", "server/.config/", "codex/state/", ".env", ".env.*", "**/*.db", "**/*.sqlite*", "**/*.log", "**/*.pem", "**/*.key", "**/id_ed25519*", "**/.DS_Store", "server/bin/", "server/apps/*/dist/", "server/apps/*/bun.lock", "server/target/", ""].join("\n"));
  await Bun.write(`${canonical}/package.json`, JSON.stringify({ name: "@omar/monorepo", version: "1.0.0", private: true, type: "module", packageManager: "bun@1.4.4", engines: { bun: "1.4.4" }, workspaces: ["server"], scripts: { "status": "bun --no-env-file server/probe-server.ts", "features": "bun --no-env-file server/configure-runtime-features.ts", "index:system32": "bun --no-env-file server/index-system32.ts", "webos:build": "bun --cwd server/apps/bun-webos build.ts" } }, null, 2) + "\n");
  await Bun.write(`${canonical}/README.md`, "# Omar\n\nMonorepo personnel : Bun Aphrody 1.4.4 exclusivement pour JavaScript, TypeScript, orchestration et Python via `bun uv`.\n\n- `codex/` : marketplace, plugin Omar et mémoire locale.\n- `server/` : superviseur Windows, WebOS, Nginx, CUDA et index natifs.\n- `private/omar.md` : fiche confidentielle protégée par ACL, exclue de Git.\n- `server/var/index/omar.sqlite` : inventaire NTFS et PE, hors Git.\n\nLes anciens chemins `C:/SSH/omar-codex`, `C:/SSH/omar-server` et `C:/SSH/omar.md` sont des liens vers ce dossier pour les consommateurs existants. Ils ne contiennent aucune copie indépendante. Les dépôts sources Bun et Aphrody restent leurs propriétaires distincts.\n");
  if (!existsSync(`${canonical}/.git`)) git(["init", "-b", "main", canonical]);
  const top = git(["-C", canonical, "rev-parse", "--show-toplevel"]).trim();
  if (resolve(top) !== canonical) throw new Error("Unexpected Git root");
  const ignored = Bun.spawnSync({ cmd: ["git.exe", "-C", canonical, "check-ignore", "private/omar.md"], stdout: "pipe" });
  if (ignored.exitCode !== 0) throw new Error("Private profile is not excluded from Git");
  await Bun.write(`${canonical}/server/var/consolidation.json`, JSON.stringify({ observedAt: new Date().toISOString(), canonical, gitRoot: top, moves: before, privateProfileIgnored: true, legacyPathsAreAliases: true }, null, 2) + "\n");
  console.log(JSON.stringify({ canonical, gitRoot: top, runtime: Bun.version, privateProfileIgnored: true }));
} finally { windows.services.start("OmarServer"); }
