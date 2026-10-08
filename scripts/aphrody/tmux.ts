// Long-running jobs (bun bd, cargo, docker build, CI watch) in one shared tmux
// session, so any agent can start, list, read and stop them. Native on both
// sides: psmux (`tmux` on Windows) with pwsh, real tmux on Linux.
// `--linux` runs the command in the Ubuntu 26.04 build container instead
// (image `aphrody/build-linux`, scripts/aphrody/linux.Dockerfile), the same OS
// and glibc as the vps and dbfr hosts.
//
//   bun scripts/aphrody/tmux.ts run <name> [--linux] [--cwd <dir>] -- <command...>
//   bun scripts/aphrody/tmux.ts ls | logs <name> [lines] | wait <name> | kill <name> | attach

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const SESSION = process.env.APHRODY_TMUX_SESSION ?? "aphrody";
const ROOT = resolve(import.meta.dir, "..", "..");
const LOGS = join(ROOT, "tmp", "tmux");
const IMAGE = process.env.APHRODY_LINUX_IMAGE ?? "aphrody/build-linux:26.04";
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

// The job body goes to a script file so no command ever needs nested quoting.
function jobScript(name: string, command: string, cwd: string, linux: boolean): string[] {
  const log = logFile(name);
  const exit = exitFile(name);
  if (linux) {
    const docker = [
      "docker run --rm --init --cpus 6 --memory 6g",
      `-v ${shQuote(`${cwd}:/work`)} -w /work`,
      "-v aphrody-bun-cache:/root/.bun/install/cache -v aphrody-cargo-registry:/root/.cargo/registry",
      `${IMAGE} bash -lc ${shQuote(command)}`,
    ].join(" ");
    command = docker;
  }
  if (isWindows) {
    // The command runs in a child pwsh so its own `exit` cannot skip the exit file.
    const encoded = Buffer.from(command, "utf16le").toString("base64");
    const file = join(LOGS, `${name}.ps1`);
    writeFileSync(
      file,
      [
        `Set-Location -LiteralPath ${psQuote(cwd)}`,
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
  let linux = false;
  let cwd = ROOT;
  while (argv.length && argv[0] !== "--") {
    const opt = argv.shift()!;
    if (opt === "--linux") linux = true;
    else if (opt === "--cwd") cwd = resolve(argv.shift() ?? ".");
    else throw new Error(`unknown option ${opt}`);
  }
  argv.shift();
  if (!argv.length) throw new Error("command required after --");
  if (windows().includes(name)) throw new Error(`job ${name} already exists; kill it first`);
  writeFileSync(logFile(name), "");
  rmSync(exitFile(name), { force: true });
  const r = tmux("new-window", "-d", "-t", SESSION, "-n", name, ...jobScript(name, argv.join(" "), cwd, linux));
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
        for (const ext of [".exit", ".log", ".ps1", ".sh"]) rmSync(join(LOGS, rest[0] + ext), { force: true });
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
