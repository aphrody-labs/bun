import { resolve } from "node:path";
import { lockBuildDir } from "../lock.ts";

const args = process.argv.slice(2);
const msvc = args[0] === "--msvc";
if (msvc) args.shift();
if (!args.length) {
  console.error("Usage: bun scripts/build/rust/cargo-serial.ts [--msvc] <cargo arguments>");
  process.exit(2);
}
const unlock = lockBuildDir(resolve(import.meta.dir, "../../../build/cargo-serial"), () => {
  console.error("Waiting for the Bun Cargo serialization lock");
});
try {
  const command = msvc ? [process.execPath, "msvc", "exec", "--", "cargo", ...args] : ["cargo", ...args];
  await using child = Bun.spawn({
    cmd: command,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
    windowsHide: true,
  });
  process.exitCode = await child.exited;
} finally {
  unlock();
}
