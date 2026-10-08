// Long-running jobs (bun bd, cargo, docker build, CI watch) in one shared tmux
// session, so any agent can start, list, read and stop them. Native on both
// sides: psmux (`tmux` on Windows) with pwsh, real tmux on Linux.
// `--linux` (= `--alpine`) runs the command in the Alpine build container, the
// fork's primary Linux target (image `aphrody/build-alpine`,
// scripts/aphrody/alpine.Dockerfile, musl); `--ubuntu` in the Ubuntu 26.04 one
// (`aphrody/build-linux`, scripts/aphrody/linux.Dockerfile), the same OS and
// glibc as the vps and dbfr hosts. The directory is bind-mounted at /work,
// unless `--sync`: then /work is a named volume holding a git checkout of the
// directory's HEAD plus its uncommitted changes, which is what a native build
// wants (the bind mount of C:\ is slow, and keeps no symlinks or modes);
// `--sync-head` leaves the uncommitted changes out.
//
//   bun scripts/aphrody/tmux.ts run <name> [--linux|--alpine|--ubuntu] [--sync|--sync-head] [--volume <name>]
//       [--cpus <n>] [--memory <size>] [--cwd <dir>] -- <command...>
//   bun scripts/aphrody/tmux.ts ls | logs <name> [lines] | wait <name> | kill <name> | attach

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const SESSION = process.env.APHRODY_TMUX_SESSION ?? "aphrody";
const ROOT = resolve(import.meta.dir, "..", "..");
const LOGS = join(ROOT, "tmp", "tmux");
export const IMAGES = {
  alpine: process.env.APHRODY_ALPINE_IMAGE ?? "aphrody/build-alpine:3.24",
  ubuntu: process.env.APHRODY_LINUX_IMAGE ?? "aphrody/build-linux:26.04",
} as const;
export type Distro = keyof typeof IMAGES;
/** Docker Desktop has 12 GB: a container never gets more than this. */
const MAX_MEMORY_GB = 10;
const isWindows = process.platform === "win32";

function tmux(...args: string[]) {
  const proc = Bun.spawnSync(["tmux", ...args], { stdout: "pipe", stderr: "pipe" });
  return { code: proc.exitCode, out: proc.stdout.toString().trim(), err: proc.stderr.toString().trim() };
}

function ensureSession() {
  mkdirSync(LOGS, { recursive: true });
  if (tmux("has-session", "-t", SESSION).code !== 0) {
    const r = tmux("new-session", "-d", "-s", SESSION, "-n", "main", "-c", ROOT);
    if (r.code !== 0) throw new Error(`tmux new-session: ${r.err}`);
  }
}

function windows(): string[] {
  return tmux("list-windows", "-t", SESSION, "-F", "#W")
    .out.split(/\r?\n/)
    .filter(w => w && w !== "main");
}

const exitFile = (name: string) => join(LOGS, `${name}.exit`);
const logFile = (name: string) => join(LOGS, `${name}.log`);
const psQuote = (s: string) => `'${s.replaceAll("'", "''")}'`;
const shQuote = (s: string) => `'${s.replaceAll("'", `'\\''`)}'`;

export interface Container {
  distro: Distro;
  /** Named volume for /work, filled from the directory's git HEAD and working tree; undefined = bind mount. */
  volume?: string;
  /** --sync-head: only the committed HEAD, without the working tree (other agents' unfinished edits). */
  headOnly?: boolean;
  cpus: number;
  memory: string;
}

export function parseMemoryGb(memory: string): number {
  const m = /^(\d+(?:\.\d+)?)([gm])$/i.exec(memory);
  if (!m) throw new Error(`--memory must look like 6g or 8192m, got ${memory}`);
  return m[2]!.toLowerCase() === "g" ? Number(m[1]) : Number(m[1]) / 1024;
}

/**
 * The commands that bring a --sync volume up to date with the host directory
 * (mounted read-only at /host): a shallow fetch of HEAD, then the files the
 * host lists as changed (`<job>.changed`) or deleted (`<job>.deleted`).
 * Ignored files (build/, vendor/, node_modules/) stay in the volume.
 */
export function syncScript(job: string): string {
  return [
    "set -e",
    "git config --global --add safe.directory '*'",
    "[ -d /work/.git ] || git init -q /work",
    "cd /work",
    "git fetch -q --depth=1 --no-tags file:///host HEAD",
    "git checkout -q -f FETCH_HEAD",
    `rsync -rlt --from0 --files-from=/aphrody-jobs/${job}.changed /host/ /work/`,
    `xargs -0 -r rm -f -- < /aphrody-jobs/${job}.deleted`,
    "set +e",
  ].join("\n");
}

/** The host shell the job runs in: pwsh on Windows, bash elsewhere. */
const hostQuote = isWindows ? psQuote : shQuote;

export function dockerCommand(job: string, command: string, cwd: string, c: Container, quote = hostQuote): string {
  const work = c.volume
    ? [`-v ${c.volume}:/work`, `-v ${quote(`${cwd}:/host:ro`)}`, `-v ${quote(`${LOGS}:/aphrody-jobs:ro`)}`]
    : [`-v ${quote(`${cwd}:/work`)}`];
  const body = c.volume ? `${syncScript(job)}\n${command}` : command;
  return [
    `docker run --rm --init --cpus ${c.cpus} --memory ${c.memory} --memory-swap ${c.memory}`,
    ...work,
    "-w /work",
    "-v aphrody-bun-cache:/root/.bun/install/cache -v aphrody-cargo-registry:/root/.cargo/registry",
    `-v aphrody-build-cache-${c.distro}:/root/.bun/build-cache`,
    `${IMAGES[c.distro]} bash -lc ${quote(body)}`,
  ].join(" ");
}

/** What --sync copies over HEAD: modified and untracked (not ignored) files, and the deleted ones to remove. */
function writeSyncLists(job: string, cwd: string, headOnly: boolean) {
  if (headOnly) {
    writeFileSync(join(LOGS, `${job}.changed`), "");
    writeFileSync(join(LOGS, `${job}.deleted`), "");
    return;
  }
  const git = (...args: string[]) => {
    const p = Bun.spawnSync(["git", "-C", cwd, ...args], { stdout: "pipe", stderr: "pipe" });
    if (p.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${p.stderr.toString().trim()}`);
    return p.stdout.toString();
  };
  const deleted = git("ls-files", "-z", "--deleted");
  const gone = new Set(deleted.split("\0").filter(Boolean));
  const changed = git("ls-files", "-z", "--modified", "--others", "--exclude-standard")
    .split("\0")
    .filter(f => f && !gone.has(f));
  writeFileSync(join(LOGS, `${job}.changed`), changed.map(f => f + "\0").join(""));
  writeFileSync(join(LOGS, `${job}.deleted`), deleted);
}

// The job body goes to a script file so no command ever needs nested quoting.
function jobScript(name: string, command: string, cwd: string, container: Container | undefined): string[] {
  const log = logFile(name);
  const exit = exitFile(name);
  if (container) {
    if (container.volume) writeSyncLists(name, cwd, container.headOnly ?? false);
    command = dockerCommand(name, command, cwd, container);
  }
  if (isWindows) {
    // The command runs in a child pwsh so its own `exit` cannot skip the exit file.
    const encoded = Buffer.from(command, "utf16le").toString("base64");
    const file = join(LOGS, `${name}.ps1`);
    writeFileSync(
      file,
      [
        `Set-Location -LiteralPath ${psQuote(cwd)}`,
        // `bun bd` needs perl (LUT codegen); on Windows it is Git's, which only Git Bash puts on PATH.
        `if (-not (Get-Command perl -ErrorAction SilentlyContinue) -and (Get-Command git -ErrorAction SilentlyContinue)) { $env:PATH += ';' + (Join-Path (Split-Path (Split-Path (Get-Command git).Source)) 'usr\\bin') }`,
        `pwsh -NoProfile -EncodedCommand ${encoded} *>&1 | Tee-Object -FilePath ${psQuote(log)} -Append`,
        `Set-Content -LiteralPath ${psQuote(exit)} -Value $LASTEXITCODE -NoNewline`,
      ].join("\n"),
    );
    // psmux runs this through its pwsh: an unquoted backslash path is the form it accepts.
    return [`pwsh -NoProfile -File ${file}`];
  }
  const file = join(LOGS, `${name}.sh`);
  writeFileSync(
    file,
    `cd ${shQuote(cwd)}\n{ ${command}\n} 2>&1 | tee -a ${shQuote(log)}\necho \${PIPESTATUS[0]} > ${shQuote(exit)}\nexec bash\n`,
  );
  return [`bash ${shQuote(file)}`];
}

function run(argv: string[]) {
  const name = argv.shift();
  if (!name) throw new Error("name required");
  let distro: Distro | undefined;
  let sync = false;
  let headOnly = false;
  let volume: string | undefined;
  let cpus = 6;
  let memory = "6g";
  let cwd = ROOT;
  while (argv.length && argv[0] !== "--") {
    const opt = argv.shift()!;
    if (opt === "--linux" || opt === "--alpine") distro = "alpine";
    else if (opt === "--ubuntu") distro = "ubuntu";
    else if (opt === "--sync") sync = true;
    else if (opt === "--sync-head") sync = headOnly = true;
    else if (opt === "--volume") volume = argv.shift();
    else if (opt === "--cpus") cpus = Number(argv.shift());
    else if (opt === "--memory") memory = argv.shift() ?? "";
    else if (opt === "--cwd") cwd = resolve(argv.shift() ?? ".");
    else throw new Error(`unknown option ${opt}`);
  }
  if (parseMemoryGb(memory) > MAX_MEMORY_GB) throw new Error(`--memory is capped at ${MAX_MEMORY_GB}g`);
  if (!(cpus > 0 && cpus <= 12)) throw new Error("--cpus must be between 1 and 12");
  if ((sync || volume) && !distro) throw new Error("--sync and --volume need --linux, --alpine or --ubuntu");
  const container: Container | undefined = distro
    ? { distro, volume: sync || volume ? (volume ?? `aphrody-src-${distro}`) : undefined, headOnly, cpus, memory }
    : undefined;
  argv.shift();
  if (!argv.length) throw new Error("command required after --");
  if (windows().includes(name)) throw new Error(`job ${name} already exists; kill it first`);
  writeFileSync(logFile(name), "");
  rmSync(exitFile(name), { force: true });
  const r = tmux("new-window", "-d", "-t", SESSION, "-n", name, ...jobScript(name, argv.join(" "), cwd, container));
  if (r.code !== 0) throw new Error(`tmux new-window: ${r.err}`);
  console.log(`started ${name} → tmp/tmux/${name}.log`);
}

function status(name: string): string {
  return existsSync(exitFile(name)) ? `done exit=${readFileSync(exitFile(name), "utf8").trim()}` : "lost";
}

if (import.meta.main) {
  const [cmd = "ls", ...rest] = process.argv.slice(2);
  try {
    ensureSession();
    switch (cmd) {
      case "up":
        console.log(`session ${SESSION} ready (${ROOT})`);
        break;
      case "run":
        run(rest);
        break;
      case "ls": {
        // A window closes when its job ends: jobs are listed from their log files.
        const live = new Set(windows());
        for (const log of new Bun.Glob("*.log").scanSync(LOGS)) {
          const name = log.slice(0, -4);
          console.log(`${name} ${existsSync(exitFile(name)) || !live.has(name) ? status(name) : "running"}`);
        }
        break;
      }
      case "logs": {
        const lines = readFileSync(logFile(rest[0]), "utf8").split(/\r?\n/);
        console.log(lines.slice(-Number(rest[1] ?? 50)).join("\n"));
        break;
      }
      case "wait":
        while (!existsSync(exitFile(rest[0]))) await Bun.sleep(2000);
        process.exit(Number(readFileSync(exitFile(rest[0]), "utf8").trim()) || 0);
      case "kill":
        tmux("kill-window", "-t", `${SESSION}:${rest[0]}`);
        for (const ext of [".exit", ".log", ".ps1", ".sh", ".changed", ".deleted"])
          rmSync(join(LOGS, rest[0] + ext), { force: true });
        break;
      case "attach":
        Bun.spawnSync(["tmux", "attach", "-t", SESSION], { stdio: ["inherit", "inherit", "inherit"] });
        break;
      default:
        throw new Error(`unknown command ${cmd}`);
    }
  } catch (err) {
    console.error(`error: ${(err as Error).message}`);
    process.exit(1);
  }
}
