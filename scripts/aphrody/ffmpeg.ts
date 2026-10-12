import { mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const root = resolve(import.meta.dir, "../..");
const source = join(root, "vendor/ffmpeg");
const output = join(root, "build/ffmpeg");
const prefix = resolve(Bun.env.BUN_MEDIA_PREFIX ?? join(root, "build/media"));
const action = process.argv[2] ?? "plan";
const bash = Bun.env.BUN_MEDIA_BASH ?? (process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash");
const make = Bun.env.BUN_MEDIA_MAKE ?? Bun.which("make") ?? "make";
const configure = [
  bash,
  join(source, "configure"),
  `--prefix=${prefix.replaceAll("\\", "/")}`,
  "--enable-shared",
  "--disable-static",
  "--disable-doc",
  ...(process.platform === "win32" ? ["--toolchain=msvc", "--cc=clang-cl", "--ld=lld-link"] : []),
];
if (action === "plan") {
  console.log(JSON.stringify({ source, output, prefix, configure, make }, null, 2));
} else if (action === "configure" || action === "build") {
  await mkdir(output, { recursive: true });
  const commands =
    action === "configure"
      ? [configure]
      : [configure, [make, "-j", String(Math.min(16, navigator.hardwareConcurrency))], [make, "install", "V=1"]];
  for (const args of commands) {
    const nativeArgs =
      process.platform === "win32" && args !== configure
        ? [
            bash,
            "-c",
            'exec "$@"',
            "bun-ffmpeg",
            ...args,
            `SHELL=${join(dirname(bash), "../usr/bin/sh.exe").replaceAll("\\", "/")}`,
          ]
        : args;
    const cmd = process.platform === "win32" ? [process.execPath, "msvc", "exec", "--", ...nativeArgs] : nativeArgs;
    const child = Bun.spawn(cmd, { cwd: output, stdout: "inherit", stderr: "inherit" });
    if ((await child.exited) !== 0)
      throw new Error("FFmpeg native build failed; inspect build/ffmpeg/ffbuild/config.log");
    if (args === configure && process.platform === "win32") {
      for (const name of ["Makefile", "ffbuild/config.mak"]) {
        const path = join(output, name);
        const content = await Bun.file(path).text();
        await Bun.write(
          path,
          content.replace(/\/([a-z])\//g, (_, drive: string) => `${drive.toUpperCase()}:/`),
        );
      }
    }
  }
  if (action === "build" && process.platform === "win32") {
    for await (const name of new Bun.Glob("*.lib").scan(join(prefix, "bin"))) {
      await Bun.write(join(prefix, "lib", name), Bun.file(join(prefix, "bin", name)));
    }
  }
} else throw new Error("usage: bun run ffmpeg plan|configure|build");
