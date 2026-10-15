import { availableParallelism } from "node:os";
import { mkdir } from "node:fs/promises";
import { delimiter, dirname, join, resolve } from "node:path";
import { Job, processes } from "bun:windows";

const root = resolve(import.meta.dir, "..");
const enginesOnly = Bun.argv.includes("--engines-only");
const declarationsOnly = Bun.argv.includes("--declarations-only");
const packOnly = Bun.argv.includes("--pack-only");
if ((enginesOnly && declarationsOnly) || ((enginesOnly || declarationsOnly) && packOnly))
  throw new Error("Select one diagnostic or archive qualification scope");
const typesArgument = Bun.argv.indexOf("--types-version");
const typesVersion = typesArgument >= 0 ? Bun.argv[typesArgument + 1] : Bun.env.BUN_VIDEO_TYPES_VERSION;
if (typesArgument >= 0 && (!typesVersion || !/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(typesVersion)))
  throw new Error("Package qualification requires an explicit published types version");
const directory = resolve(root, "../../build/media/video-package-qualification");
await mkdir(directory, { recursive: true });
if (process.platform !== "win32" || process.arch !== "x64")
  throw new Error("The current library native assets require the Windows x64 qualification host");
const env: Record<string, string> = {
  SystemRoot: Bun.env.SystemRoot ?? "",
  PATH: dirname(process.execPath) + delimiter + (Bun.env.PATH ?? ""),
  TEMP: Bun.env.TEMP ?? "",
  TMP: Bun.env.TMP ?? "",
  APHRODY_HOME: resolve(root, "../../build/media/neon-fixture-home"),
  BUN_VIDEO_CATALOG_BACKEND: "sqlite",
  BUN_VIDEO_DECLARATION_TRACE: "1",
  ...(typesVersion ? { BUN_VIDEO_TYPES_VERSION: typesVersion } : {}),
};
const types = await Bun.file(resolve(root, "../bun-types/package.json")).json();
const phases = (
  enginesOnly
    ? [{ name: "engine-diagnostic", cwd: root, args: ["scripts/check-engines.ts", "--trace"], deadline: 50_000 }]
    : declarationsOnly
      ? [{ name: "declarations-diagnostic", cwd: root, args: ["scripts/library-declarations.ts"], deadline: 120_000 }]
      : [
          {
            name: "source-types",
            cwd: root,
            args: ["check", "--threads=1", "--project", "tsconfig.check.json", "--noEmit"],
            deadline: 25_000,
          },
          {
            name: "script-types",
            cwd: root,
            args: ["check", "--threads=1", "--project", "tsconfig.scripts.check.json", "--noEmit"],
            deadline: 10_000,
          },
          { name: "source-engines", cwd: root, args: ["scripts/check-engines.ts", "--trace"], deadline: 50_000 },
          { name: "source-lint", cwd: root, args: ["lint", "src", "test"], deadline: 15_000 },
          { name: "source-format", cwd: root, args: ["scripts/check-format.ts"], deadline: 30_000 },
          ...(!env.BUN_VIDEO_TYPES_VERSION
            ? [
                {
                  name: "types-archive",
                  cwd: resolve(root, "../bun-types"),
                  args: ["pm", "pack", "--ignore-scripts", "--destination", directory, "--quiet"],
                  deadline: 30_000,
                },
              ]
            : []),
          {
            name: "library-build",
            cwd: root,
            args: ["scripts/build.ts", "--library", ...(Bun.argv.includes("--refresh") ? ["--refresh"] : [])],
            deadline: 120_000,
          },
          { name: "archive-consumer", cwd: root, args: ["scripts/pack.ts"], deadline: 225_000 },
        ]
).filter(phase => !packOnly || phase.name === "archive-consumer");
const started = Date.now();
const results: Array<{
  name: string;
  code: number | null;
  passed: boolean;
  elapsedMs: number;
  expired: boolean;
  signal: string | number | null;
}> = [];
const cpuRate = Math.min(100, 200 / availableParallelism());
let passed = false;
try {
  for (const phase of phases) {
    console.log(JSON.stringify({ phase: phase.name, state: "starting" }));
    await Bun.write(join(directory, `${phase.name}.stdout.log`), "");
    await Bun.write(join(directory, `${phase.name}.stderr.log`), "");
    using job = new Job({ killOnClose: true, cpuRate });
    const child = job.spawn([process.execPath, "--no-env-file", ...phase.args], {
      cwd: phase.cwd,
      env,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });
    processes.setAffinity(child, 3);
    const phaseStart = Date.now();
    let expired = false;
    const remaining = Math.min(phase.deadline, 420_000 - (Date.now() - started));
    const deadline = setTimeout(
      () => {
        expired = true;
        job.terminate();
      },
      Math.max(1, remaining),
    );
    const capture = async (stream: ReadableStream<Uint8Array>, suffix: string) => {
      const writer = Bun.file(join(directory, `${phase.name}.${suffix}.log`)).writer();
      let bytes = 0;
      try {
        for await (const part of stream) {
          bytes += part.length;
          if (bytes > 4 * 1024 * 1024) {
            job.terminate();
            throw new Error("Qualification phase output exceeded its bound");
          }
          writer.write(part);
          await writer.flush();
        }
      } finally {
        await writer.end();
      }
    };
    try {
      const [, , code] = await Promise.all([
        capture(child.stdout, "stdout"),
        capture(child.stderr, "stderr"),
        child.exited,
      ]);
      const success = code === 0 && !expired && !child.signalCode;
      results.push({
        name: phase.name,
        code,
        passed: success,
        elapsedMs: Date.now() - phaseStart,
        expired,
        signal: child.signalCode ?? null,
      });
      console.log(JSON.stringify(results.at(-1)));
      if (!success) throw new Error(`Package qualification failed at ${phase.name}`);
    } finally {
      clearTimeout(deadline);
    }
  }
  passed = true;
} finally {
  await Bun.write(
    join(
      directory,
      enginesOnly
        ? "engine-diagnostic-qualification.json"
        : declarationsOnly
          ? "declarations-diagnostic-qualification.json"
          : "package-sequence-qualification.json",
    ),
    JSON.stringify(
      {
        schemaVersion: 1,
        passed,
        runtime: Bun.version,
        revision: Bun.revision,
        cpuRate,
        elapsedMs: Date.now() - started,
        scope: enginesOnly
          ? "engine-diagnostic"
          : declarationsOnly
            ? "declarations-diagnostic"
            : packOnly
              ? "archive-consumer"
              : "complete",
        ...(enginesOnly || declarationsOnly
          ? {}
          : {
              typesSource: env.BUN_VIDEO_TYPES_VERSION ? "registry" : "archive",
              typesVersion: env.BUN_VIDEO_TYPES_VERSION ?? types.version,
            }),
        phases: results,
      },
      null,
      2,
    ) + "\n",
  );
}
