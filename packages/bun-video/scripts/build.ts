import { stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  prepareHyperframesStandalone,
  hyperframesStandaloneConfig,
} from "../packages/hyperframes/aphrody/standalone-build";
import { remotionSourcePlugin } from "../packages/remotion/.aphrody/standalone-build";
import { sharpNativePlugin } from "../packages/hyperframes/aphrody/sharp-native-plugin";
import { remotionModuleAssetsPlugin } from "../packages/remotion/.aphrody/module-assets";
import { mediaPlugin } from "./media-plugin";
import { hyperframesRuntimeAssetsPlugin } from "../packages/hyperframes/aphrody/runtime-assets-plugin";

const root = resolve(import.meta.dir, "..");
const library = Bun.argv[2] === "--library";
const outfile = resolve(
  Bun.argv[library ? 3 : 2] ??
    join(root, library ? "../../tmp/bun-video-build/library" : "../../tmp/bun-video-build/bun-video.exe"),
);
await prepareHyperframesStandalone();
const hyperframes = await hyperframesStandaloneConfig({
  outfile,
  entrypoint: join(root, "src/cli.ts"),
});
const result = await Bun.build({
  ...hyperframes,
  entrypoints: [join(root, library ? "src/index.ts" : "src/cli.ts"), join(root, "src/frame-worker.ts")],
  plugins: [
    await remotionSourcePlugin(),
    await sharpNativePlugin(),
    hyperframesRuntimeAssetsPlugin(),
    await remotionModuleAssetsPlugin(),
    ...(library ? [] : [mediaPlugin()]),
  ],
  ...(library
    ? { compile: undefined, outdir: outfile, naming: "[name].ts", format: "esm" as const }
    : { compile: { outfile, executablePath: process.execPath } }),
});
if (!result.success) throw new AggregateError(result.logs, "Unified bun-video compilation failed");
const artifact = await stat(library ? join(outfile, "index.ts") : outfile);
if (!artifact.isFile() || artifact.size === 0) throw new Error(`Compiler did not write executable ${outfile}`);
console.log(
  JSON.stringify({
    outfile,
    bytes: artifact.size,
    runtime: Bun.version,
    revision: Bun.revision,
    platform: process.platform,
    arch: process.arch,
  }),
);
