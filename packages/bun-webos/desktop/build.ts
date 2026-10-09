#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Compiles desktop/main.ts (WebOS server + assets + window) into one executable per target.
 *
 *   bun desktop/build.ts                                   host target, with the running bun
 *   bun desktop/build.ts --target bun-linux-x64-musl --bun /path/to/fork/bun-linux-x64-musl/bun
 *   bun desktop/build.ts --target all --bun-dir <dir>      <dir>/<target>/bun[.exe] for each target
 *
 * `--bun` / `--bun-dir` select the fork's runtime as the executable base (compile.executablePath);
 * without them a cross target would embed the upstream runtime Bun downloads by default.
 */
import { tailwind } from "@aphrody/bun-plugin-tailwind";
import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

export const DESKTOP_TARGETS = {
  "bun-windows-x64": "bun-webos-windows-x64.exe",
  "bun-linux-x64": "bun-webos-linux-x64",
  "bun-linux-x64-musl": "bun-webos-linux-x64-musl",
  "bun-linux-arm64": "bun-webos-linux-arm64",
  "bun-linux-arm64-musl": "bun-webos-linux-arm64-musl",
} as const;
export type DesktopTarget = keyof typeof DESKTOP_TARGETS;

export function hostTarget(): DesktopTarget {
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  if (process.platform === "win32") return "bun-windows-x64";
  if (process.platform !== "linux") throw new Error(`no desktop target for ${process.platform}`);
  const musl = !process.report?.getReport?.()?.header?.glibcVersionRuntime;
  return `bun-linux-${arch}${musl ? "-musl" : ""}` as DesktopTarget;
}

const pkg = join(import.meta.dir, "..");

/** Runs the package's build.ts (page bundle + workers into dist/) and packs dist/ into desktop/dist/webos-dist.tar.gz. */
export async function packWebDist(outdir: string): Promise<string> {
  const web = Bun.spawn({ cmd: [process.execPath, "build.ts"], cwd: pkg, stdio: ["ignore", "inherit", "inherit"] });
  if ((await web.exited) !== 0) throw new Error("packages/bun-webos/build.ts failed");
  const dist = join(pkg, "dist");
  const files: Record<string, Blob> = {};
  for await (const rel of new Bun.Glob("**/*").scan({ cwd: dist, onlyFiles: true }))
    files[rel.replaceAll("\\", "/")] = Bun.file(join(dist, rel));
  if (Object.keys(files).length === 0) throw new Error(`${dist} is empty after build.ts`);
  const archive = join(outdir, "webos-dist.tar.gz");
  await Bun.Archive.write(archive, files, { compress: "gzip" });
  return archive;
}

export interface DesktopBuild {
  target: DesktopTarget;
  outfile: string;
  bytes: number;
}

export async function buildDesktop(options: {
  target?: DesktopTarget;
  executablePath?: string;
  outdir?: string;
  /** Prebuilt webos-dist.tar.gz (one pack for several targets). */
  webDist?: string;
}): Promise<DesktopBuild> {
  const target = options.target ?? hostTarget();
  const outdir = resolve(options.outdir ?? join(import.meta.dir, "dist"));
  mkdirSync(outdir, { recursive: true });
  const outfile = join(outdir, DESKTOP_TARGETS[target]);
  const executablePath = options.executablePath ?? (target === hostTarget() ? process.execPath : undefined);
  if (executablePath && !existsSync(executablePath)) throw new Error(`--bun ${executablePath} does not exist`);
  const result = await Bun.build({
    // bench-worker: `new Worker(new URL(...))` in server.ts; the tarball: Bun.embeddedFiles, extracted by main.ts.
    entrypoints: [
      join(import.meta.dir, "main.ts"),
      join(pkg, "src", "server", "bench-worker.ts"),
      options.webDist ?? (await packWebDist(outdir)),
    ],
    plugins: [tailwind({ theme: "m3" })],
    compile: { target, outfile, ...(executablePath ? { executablePath } : {}) },
    minify: true,
    sourcemap: "linked",
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
  });
  if (!result.success) throw new AggregateError(result.logs, `bun-webos desktop build failed for ${target}`);
  return { target, outfile, bytes: Bun.file(outfile).size };
}

if (import.meta.main) {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      target: { type: "string" },
      bun: { type: "string" },
      "bun-dir": { type: "string" },
      outdir: { type: "string" },
    },
    strict: true,
  });
  const targets: DesktopTarget[] =
    values.target === "all"
      ? (Object.keys(DESKTOP_TARGETS) as DesktopTarget[])
      : [(values.target as DesktopTarget | undefined) ?? hostTarget()];
  const outdir = resolve(values.outdir ?? join(import.meta.dir, "dist"));
  mkdirSync(outdir, { recursive: true });
  const webDist = await packWebDist(outdir);
  for (const target of targets) {
    if (!(target in DESKTOP_TARGETS)) throw new Error(`unknown target ${target}`);
    const executablePath =
      values.bun ??
      (values["bun-dir"]
        ? join(values["bun-dir"], target, target === "bun-windows-x64" ? "bun.exe" : "bun")
        : undefined);
    if (values["bun-dir"] && executablePath && !existsSync(executablePath)) {
      console.log(`skip ${target}: ${executablePath} missing`);
      continue;
    }
    const built = await buildDesktop({ target, executablePath, outdir, webDist });
    console.log(`${built.target} -> ${built.outfile} (${(built.bytes / 1048576).toFixed(1)} MiB)`);
  }
}
