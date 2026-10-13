import { mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { runMediaSDKCommand } from "../../packages/bun-video/src/sdk";
import { runMediaSDKFactory, verifyMediaSource } from "./media-sdk-factory";

const root = resolve(import.meta.dir, "../..");
if (await runMediaSDKFactory("ffmpeg")) process.exit(0);
if (await runMediaSDKCommand("ffmpeg", root)) process.exit(0);
const source = resolve(Bun.env.BUN_FFMPEG_SOURCE ?? join(root, "build/media-sources/ffmpeg"));
const output = join(root, "build/ffmpeg");
const prefix = resolve(Bun.env.BUN_MEDIA_PREFIX ?? join(root, "build/media"));
const action = process.argv[2] ?? "plan";
const bash = Bun.env.BUN_MEDIA_BASH ?? Bun.which("bash") ?? "bash";
const make = Bun.env.BUN_MEDIA_MAKE ?? Bun.which("make") ?? "make";
const jobs = Number(Bun.env.BUN_MEDIA_JOBS ?? Math.min(4, navigator.hardwareConcurrency));
if (!Number.isSafeInteger(jobs) || jobs < 1 || jobs > 16)
  throw new RangeError("BUN_MEDIA_JOBS must be an integer from 1 to 16");
const compressionOutput = join(root, "build/media-zlib");
const compression =
  process.platform === "win32"
    ? [
        [
          "cmake",
          "-S",
          join(root, "packages/bun-video/native/zlib"),
          "-B",
          compressionOutput,
          "-G",
          "Ninja",
          `-DBUN_ZLIB_SOURCE=${join(root, "vendor/zlib")}`,
          `-DCMAKE_INSTALL_PREFIX=${prefix}`,
          "-DCMAKE_BUILD_TYPE=Release",
          "-DCMAKE_C_COMPILER=clang-cl",
          "-DCMAKE_LINKER=lld-link",
        ],
        ["cmake", "--build", compressionOutput, "--parallel", String(jobs)],
        ["cmake", "--install", compressionOutput],
      ]
    : [];
const configure = [
  bash,
  join(source, "configure"),
  `--prefix=${prefix.replaceAll("\\", "/")}`,
  "--enable-shared",
  "--disable-static",
  "--disable-doc",
  ...(process.platform === "win32"
    ? [
        "--toolchain=msvc",
        "--cc=clang-cl",
        "--ld=lld-link",
        "--enable-zlib",
        `--extra-cflags=-I${join(prefix, "include").replaceAll("\\", "/")}`,
        `--extra-ldflags=-libpath:${join(prefix, "lib").replaceAll("\\", "/")}`,
      ]
    : []),
];
if (action === "plan") {
  console.log(JSON.stringify({ source, output, prefix, compression, configure, make, jobs }, null, 2));
} else if (action === "configure" || action === "build") {
  await verifyMediaSource("ffmpeg", source);
  await mkdir(output, { recursive: true });
  for (const args of compression) {
    const child = Bun.spawn([process.execPath, "msvc", "exec", "--", ...args], {
      cwd: root,
      stdout: "inherit",
      stderr: "inherit",
    });
    if ((await child.exited) !== 0) throw new Error("Bun Video native zlib build failed");
  }
  const commands =
    action === "configure" ? [configure] : [configure, [make, "-j", String(jobs)], [make, "install", "V=1"]];
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
