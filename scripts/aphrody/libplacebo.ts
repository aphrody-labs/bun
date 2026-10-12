import { delimiter, join, resolve } from "node:path";

const root = resolve(import.meta.dir, "../..");
const source = join(root, "vendor/libplacebo");
const output = join(root, "build/libplacebo");
const prefix = resolve(Bun.env.BUN_MEDIA_PREFIX ?? join(root, "build/media"));
const dependencies = (Bun.env.BUN_MEDIA_DEPENDENCIES ?? "")
  .split(delimiter)
  .filter(Boolean)
  .map(path => resolve(path));
const meson = [process.execPath, "uv", "tool", "run", "--from", "meson", "--with", "jinja2", "meson"];
const setup = [
  ...meson,
  "setup",
  output,
  source,
  `--prefix=${prefix}`,
  "--buildtype=release",
  "-Ddefault_library=shared",
  "-Ddemos=false",
  "-Dglslang=enabled",
  ...(process.platform === "win32" ? ["-Dd3d11=enabled", "-Dopengl=disabled"] : []),
  `--pkg-config-path=${[prefix, ...dependencies].map(path => join(path, "lib/pkgconfig")).join(delimiter)}`,
];
const action = process.argv[2] ?? "plan";
if (action === "plan") console.log(JSON.stringify({ source, output, prefix, setup }, null, 2));
else if (action === "build") {
  for (const args of [setup, [...meson, "compile", "-C", output], [...meson, "install", "-C", output]]) {
    const cmd = process.platform === "win32" ? [process.execPath, "msvc", "exec", "--", ...args] : args;
    const child = Bun.spawn(cmd, {
      cwd: root,
      env: { ...Bun.env, ...(process.platform === "win32" ? { CC: "clang-cl", CXX: "clang-cl" } : {}) },
      stdout: "inherit",
      stderr: "inherit",
    });
    if ((await child.exited) !== 0) throw new Error("libplacebo native build failed");
  }
} else throw new Error("usage: bun run libplacebo plan|build");
