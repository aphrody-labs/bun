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
  let command = msvc ? [process.execPath, "msvc", "exec", "--", "cargo", ...args] : ["cargo", ...args];
  let env = process.env;
  if (msvc && process.env.BUN_MSVC_SYSROOT) {
    const query = Bun.spawn([process.execPath, "msvc", "env", "--format", "json"], {
      stdout: "pipe",
      stderr: "pipe",
      windowsHide: true,
      timeout: 15_000,
    });
    const [stdout, stderr, status] = await Promise.all([query.stdout.text(), query.stderr.text(), query.exited]);
    if (status !== 0) throw new Error(`Native MSVC environment query failed (${status}): ${stderr}`);
    const native: Record<string, string> = JSON.parse(stdout);
    if (!native.LIB || !Object.values(native).every(value => typeof value === "string"))
      throw new Error("Native MSVC environment is missing its library paths");
    const root = resolve(process.env.BUN_MSVC_SYSROOT).toLowerCase() + "\\";
    const libraries = (process.env.CARGO_ENCODED_RUSTFLAGS ?? "")
      .split("\x1f")
      .filter(flag => flag.startsWith("-Lnative="))
      .map(flag => resolve(flag.slice("-Lnative=".length)))
      .filter(path => path.toLowerCase().startsWith(root));
    if (!libraries.length)
      throw new Error("MSVC sysroot requires encoded native library flags from bun msvc cross env");
    // Rustdoc and host build scripts also need the explicit user sysroot, beyond target-only flags.
    env = { ...process.env, ...native, LIB: [...libraries, native.LIB].join(";") };
    command = ["cargo", ...args];
  }
  await using child = Bun.spawn({
    cmd: command,
    env,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
    windowsHide: true,
  });
  process.exitCode = await child.exited;
} finally {
  unlock();
}
