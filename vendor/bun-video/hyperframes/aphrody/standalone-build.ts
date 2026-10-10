import { mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { sharpNativePlugin } from "./sharp-native-plugin";
import { hyperframesRuntimeAssetsPlugin } from "./runtime-assets-plugin";
import { remotionSourcePlugin } from "../../remotion/.aphrody/standalone-build";

export const hyperframesRoot = resolve(import.meta.dir, "..");
export const hyperframesCliEntry = join(hyperframesRoot, "packages/cli/src/cli.ts");

export async function prepareHyperframesStandalone(): Promise<void> {
  for (const script of ["build:svg-selector-aliases", "build:hyperframes-runtime", "build:position-edits-render", "build:audio-fx-runtime"]) {
    const process = Bun.spawn([Bun.which("bun") ?? "bun", "run", script], {
      cwd: join(hyperframesRoot, "packages/core"), stdout: "inherit", stderr: "inherit",
    });
    const code = await process.exited;
    if (code !== 0) throw new Error(`Hyperframes core ${script} failed with exit ${code}`);
  }
}

export async function hyperframesStandaloneConfig(options: {
  outfile: string;
  target?: Bun.Build.CompileTarget;
  entrypoint?: string;
}): Promise<Bun.BuildConfig> {
  const manifest = await Bun.file(join(hyperframesRoot, "packages/cli/package.json")).json();
  await mkdir(dirname(resolve(options.outfile)), { recursive: true });
  return {
    entrypoints: [options.entrypoint ?? hyperframesCliEntry],
    target: "bun",
    compile: { ...(options.target ? { target: options.target } : {}), outfile: resolve(options.outfile), executablePath: process.execPath },
    define: {
      __CLI_VERSION__: JSON.stringify(manifest.version),
      __PRODUCER_VERSION__: JSON.stringify(manifest.version),
      __HYPERFRAMES_ENGINE_VERSION__: JSON.stringify(manifest.version),
      __HYPERFRAMES_STANDALONE__: "true",
    },
    minify: true,
    sourcemap: "none",
    // Literal dynamic imports retain every upstream command in the compiled graph.
    external: [],
  };
}

export async function buildHyperframesStandalone(options: {
  outfile: string;
  target?: Bun.Build.CompileTarget;
  entrypoint?: string;
}): Promise<void> {
  if (options.target && !options.target.startsWith("bun-windows-x64")) {
    throw new Error("This standalone Sharp packaging is qualified only for Windows x64 targets");
  }
  await prepareHyperframesStandalone();
  const bootstrap = join(dirname(resolve(options.outfile)), "hyperframes-standalone-entry.ts");
  await Bun.write(bootstrap, `import {join} from "node:path";
if(!process.env.HYPERFRAMES_FFMPEG_PATH || !process.env.HYPERFRAMES_FFPROBE_PATH){
  const {dir}=await import("@remotion/compositor-win32-x64-msvc");
  process.env.HYPERFRAMES_FFMPEG_PATH ??=join(dir,"ffmpeg.exe");
  process.env.HYPERFRAMES_FFPROBE_PATH ??=join(dir,"ffprobe.exe");
}
await import(${JSON.stringify(options.entrypoint ?? hyperframesCliEntry)});
`);
  const config = await hyperframesStandaloneConfig({ ...options, entrypoint: bootstrap });
  const result = await Bun.build({ ...config, plugins: [await remotionSourcePlugin(), await sharpNativePlugin(), hyperframesRuntimeAssetsPlugin()] });
  if (!result.success) throw new AggregateError(result.logs, "Complete Hyperframes CLI compilation failed");
  if (!(await Bun.file(resolve(options.outfile)).exists())) throw new Error("Compiler did not write the requested executable");
  console.log(JSON.stringify({ outfile: resolve(options.outfile), runtime: Bun.version, entrypoint: options.entrypoint ?? hyperframesCliEntry }));
}

if (import.meta.main) {
  const outfile = Bun.argv[2];
  if (!outfile) throw new Error("Usage: bun aphrody/standalone-build.ts <absolute-outfile>");
  await buildHyperframesStandalone({ outfile });
}
