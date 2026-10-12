import { resolve, join, delimiter } from "node:path";

const root = resolve(import.meta.dir, "../..");
const source = join(root, "vendor/mpv");
const output = join(root, "build/libmpv");
const prefix = resolve(Bun.env.BUN_MEDIA_PREFIX ?? join(root, "build/media"));
const dependencyPrefixes = (Bun.env.BUN_MEDIA_DEPENDENCIES ?? "")
  .split(delimiter)
  .filter(Boolean)
  .map(path => resolve(path));
const action = process.argv[2] ?? "plan";
const meson = [process.execPath, "uv", "tool", "run", "--from", "meson", "meson"];
const setup = [
  ...meson,
  "setup",
  output,
  source,
  "--buildtype=release",
  `--prefix=${prefix}`,
  "-Dlibmpv=true",
  "-Dcplayer=false",
  "-Ddefault_library=shared",
  "-Dbuild-date=false",
  `--pkg-config-path=${[prefix, ...dependencyPrefixes].map(path => join(path, "lib/pkgconfig")).join(delimiter)}`,
];
if (action === "plan") {
  console.log(JSON.stringify({ source, output, prefix: prefix ?? null, setup }, null, 2));
} else if (action === "build") {
  for (const args of [setup, [...meson, "compile", "-C", output], [...meson, "install", "-C", output]]) {
    const cmd = process.platform === "win32" ? [process.execPath, "msvc", "exec", "--", ...args] : args;
    const child = Bun.spawn(cmd, { cwd: root, stdout: "inherit", stderr: "inherit" });
    if ((await child.exited) !== 0) throw new Error("libmpv native build failed");
  }
} else {
  throw new Error("usage: bun run libmpv plan|build");
}
