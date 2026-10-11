import { existsSync, linkSync, mkdirSync, openSync, closeSync } from "node:fs";
import { join } from "node:path";
import windows from "bun:windows";

const root = "C:/SSH/omar/server";
const repo = "C:/bun";
const pin = "65c232c1db46f01037b983a11499df61229d1511";
const run = (args: string[]) => Bun.spawnSync({ cmd: ["git", "-C", repo, ...args], stdout: "pipe", stderr: "pipe" });
const head = run(["rev-parse", "HEAD"]);
if (head.exitCode !== 0 || head.stdout.toString().trim() !== pin) throw new Error("Source revision changed");
const state = run(["status", "--porcelain=v1"]);
if (state.exitCode !== 0 || state.stdout.toString().trim()) throw new Error("Checkout must be clean before release build");

const bin = join(root, "bin");
mkdirSync(bin, { recursive: true });
const nodeAlias = join(bin, "node.exe");
if (!existsSync(nodeAlias)) linkSync(process.execPath, nodeAlias);
const paths = [bin, "C:/Users/omara/.cargo/bin", "C:/Program Files/LLVM/bin", "C:/Program Files/Go/bin", "C:/Program Files/NASM", "C:/Ruby33-x64/bin", join(root, "node_modules/.bin")];
const env = { ...process.env, PATH: paths.filter(existsSync).join(";") + ";" + process.env.PATH, CARGO_BUILD_JOBS: "4" };
mkdirSync(join(root, "var"), { recursive: true });
const log = join(root, "var", "bun-os-release-build.log");
const fd = openSync(log, "a");
console.log(JSON.stringify({ source: pin, version: "1.4.4", runtime: process.execPath, log, memory: windows.memory.status() }));
const child = Bun.spawn({
  cmd: [process.execPath, "scripts/build.ts", "--profile=release", "--lto=off", "--canary=off", "-j4"],
  cwd: repo,
  env,
  stdin: "ignore",
  stdout: fd,
  stderr: fd,
});
console.log(JSON.stringify({ buildPid: child.pid, startedAt: new Date().toISOString() }));
const code = await child.exited;
closeSync(fd);
console.log(JSON.stringify({ buildExit: code, endedAt: new Date().toISOString(), log }));
process.exitCode = code;
