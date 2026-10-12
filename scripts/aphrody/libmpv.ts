import { resolve, join } from "node:path";

const root = resolve(import.meta.dir, "../..");
const source = join(root, "vendor/mpv");
const output = join(root, "build/libmpv");
const prefix = Bun.env.BUN_MEDIA_PREFIX;
const action = process.argv[2] ?? "plan";
const meson = [process.execPath, "uv", "tool", "run", "--from", "meson", "meson"];
const setup = [
  ...meson,
  "setup",
  output,
  source,
  "--buildtype=release",
  "-Dlibmpv=true",
  "-Dcplayer=false",
  "-Ddefault_library=shared",
  "-Dbuild-date=false",
  ...(prefix ? [`--pkg-config-path=${join(resolve(prefix), "lib/pkgconfig")}`] : []),
];
if (action === "plan") {
  console.log(JSON.stringify({ source, output, prefix: prefix ?? null, setup }, null, 2));
} else if (action === "build") {
  if (!prefix) throw new Error("BUN_MEDIA_PREFIX must name the native FFmpeg/libass dependency prefix");
  for (const args of [setup, [...meson, "compile", "-C", output]]) {
    const cmd = process.platform === "win32" ? [process.execPath, "msvc", "exec", "--", ...args] : args;
    const child = Bun.spawn(cmd, { cwd: root, stdout: "inherit", stderr: "inherit" });
    if ((await child.exited) !== 0) throw new Error("libmpv native build failed");
  }
} else {
  throw new Error("usage: bun run libmpv plan|build");
}
