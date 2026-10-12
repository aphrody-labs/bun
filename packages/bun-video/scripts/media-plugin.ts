import { isAbsolute } from "node:path";
import type { BunPlugin } from "bun";

export function mediaPlugin(): BunPlugin {
  return {
    name: "bun-video-native-media",
    setup(build) {
      build.onResolve({ filter: /^bun-video:media-runtime$/ }, () => ({
        path: "media",
        namespace: "bun-video-media",
      }));
      build.onLoad({ filter: /.*/, namespace: "bun-video-media" }, async () => {
        const assets = {
          nativeExecutable: process.env.BUN_VIDEO_NATIVE_EXECUTABLE,
          ffmpegExecutable: process.env.BUN_VIDEO_FFMPEG,
          ffprobeExecutable: process.env.BUN_VIDEO_FFPROBE,
        };
        for (const [name, path] of Object.entries(assets))
          if (!path || !isAbsolute(path) || !(await Bun.file(path).exists()))
            throw new Error(
              `Set ${name} to an existing qualified absolute media asset before compilation`,
            );
        const extension = process.platform === "win32" ? ".exe" : "";
        const entries = Object.entries(assets);
        const imports = entries
          .map(([, path], i) => `import asset${i} from ${JSON.stringify(path)} with {type:'file'};`)
          .join("\n");
        const writes = entries
          .map(
            ([name], i) =>
              `const ${name}=join(dir,${JSON.stringify(name + extension)});writeFileSync(${name},readFileSync(asset${i}),{mode:0o700});`,
          )
          .join("\n");
        return {
          loader: "js",
          contents: `${imports}\nimport {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';const dir=mkdtempSync(join(tmpdir(),'bun-video-media-'));process.once('exit',()=>rmSync(dir,{recursive:true}));${writes}\nexport const mediaAssets={nativeExecutable,ffmpegExecutable,ffprobeExecutable};`,
        };
      });
    },
  };
}
