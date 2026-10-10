import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { readdir } from "node:fs/promises";

export async function sharpNativePlugin(): Promise<Bun.BunPlugin> {
  if (process.platform !== "win32" || process.arch !== "x64") {
    throw new Error("Sharp standalone packaging currently requires a qualified native Windows x64 addon");
  }
  const cliRequire = createRequire(join(import.meta.dir, "../packages/cli/package.json"));
  const sharpEntry = cliRequire.resolve("sharp");
  const sharpRequire = createRequire(sharpEntry);
  const bindingExport = sharpRequire.resolve("@img/sharp-win32-x64/sharp.node");
  const directory = bindingExport.endsWith(".node") ? dirname(bindingExport) : join(dirname(bindingExport), "lib");
  const assets = (await readdir(directory)).filter((name) => name.endsWith(".dll") || name.endsWith(".node"));
  const addon = join(directory, assets.find((name) => name.endsWith(".node")) ?? "");
  if (!assets.some((name) => name.endsWith(".node")) || !assets.some((name) => name.endsWith(".dll"))) {
    throw new Error("Sharp Windows addon directory is missing its native binding or libvips DLLs");
  }
  return {
    name: "hyperframes-sharp-native-assets",
    setup(build) {
      build.onLoad({ filter: /[\\/]sharp[\\/]dist[\\/]sharp\.[cm]js$/ }, (args) => {
        const imports = assets.map((name, index) => `import asset${index} from ${JSON.stringify(join(directory, name))} with {type:"file"};`).join("\n");
        const writes = assets.map((name, index) => `writeFileSync(join(nativeDir, ${JSON.stringify(name)}), readFileSync(asset${index}));`).join("\n");
        return {
          loader: "js",
          contents: `${imports}
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createRequire} from "node:module";
const nativeDir=mkdtempSync(join(tmpdir(),"bun-video-sharp-"));
let binding;
try {
${writes}
binding=createRequire(import.meta.url)(join(nativeDir,${JSON.stringify(addon.split(/[\\/]/).pop())}));
} catch(error) {
rmSync(nativeDir,{recursive:true,force:true});
throw error;
}
process.once("exit",()=>{try{rmSync(nativeDir,{recursive:true,force:true});}catch{}});
${args.path.endsWith(".mjs") ? "export default binding;" : "module.exports=binding;"}
`,
        };
      });
    },
  };
}
