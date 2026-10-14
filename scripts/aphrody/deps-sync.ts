#!/usr/bin/env bun

export {};

const root = new URL("../..", import.meta.url).pathname.replace(/^\/(.:)/, "$1");
const apply = process.argv.includes("--apply");
const clean = process.argv.includes("--clean");

async function run(label: string, args: string[], quiet = false) {
  const proc = Bun.spawn(args, {
    cwd: root,
    stdout: quiet ? "ignore" : "inherit",
    stderr: "inherit",
    env: process.env,
  });
  const code = await proc.exited;
  if (code !== 0) throw new Error(`${label} failed with exit ${code}`);
}

await run("vendor sync", ["git", "submodule", "sync", "--recursive"]);
await run("vendor materialization", ["git", "submodule", "update", "--init"]);

if (apply) {
  await run("Bun package update", ["bun", "update"]);
  await run("Cargo crate update", ["bun", "scripts/build/rust/cargo-serial.ts", "--msvc", "update", "--workspace"]);
} else {
  await run("Bun lock verification", ["bun", "install", "--frozen-lockfile"]);
  await run(
    "Cargo lock verification",
    [
      "bun",
      "scripts/build/rust/cargo-serial.ts",
      "--msvc",
      "metadata",
      "--locked",
      "--no-deps",
      "--format-version=1",
    ],
    true,
  );
}

if (clean) {
  await run("Bun package cache cleanup", ["bun", "pm", "cache", "rm"]);
  await run("worktree metadata cleanup", ["git", "worktree", "prune"]);
}

console.log(JSON.stringify({ mode: apply ? "apply" : "check", clean, root }));
