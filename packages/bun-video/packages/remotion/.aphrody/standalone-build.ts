import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import type { BunPlugin } from "bun";
import { remotionModuleAssetsPlugin } from "./module-assets";

export const remotionRoot = resolve(import.meta.dir, "..");

/** Resolve public workspace export entrypoints to the vendored source, including subpaths. */
export async function remotionSourcePlugin(): Promise<BunPlugin> {
  const renderer = await Bun.file(join(remotionRoot, "packages/renderer/package.json")).json();
  const compositorName =
    process.platform === "win32" && process.arch === "x64"
      ? "@remotion/compositor-win32-x64-msvc"
      : null;
  let compositorRoot = process.env.BUN_VIDEO_COMPOSITOR_DIR ?? null;
  if (compositorName && !compositorRoot) {
    try {
      compositorRoot = resolve(
        Bun.resolveSync(`${compositorName}/package.json`, join(import.meta.dir, "build-deps")),
        "..",
      );
    } catch {
      throw new Error(
        `Install optional ${compositorName}@${renderer.version} in .aphrody/build-deps or set BUN_VIDEO_COMPOSITOR_DIR`,
      );
    }
  }
  if (compositorName && compositorRoot) {
    compositorRoot = resolve(compositorRoot);
    const manifest = await Bun.file(join(compositorRoot, "package.json")).json();
    if (manifest.name !== compositorName || manifest.version !== renderer.version)
      throw new Error(`Compositor assets must match ${compositorName}@${renderer.version}`);
  }
  const workspaces = new Map<string, { root: string; manifest: Record<string, any> }>();
  for (const item of readdirSync(join(remotionRoot, "packages"), { withFileTypes: true })) {
    if (!item.isDirectory()) continue;
    const root = join(remotionRoot, "packages", item.name);
    const manifestPath = join(root, "package.json");
    if (!existsSync(manifestPath)) continue;
    const manifest = await Bun.file(manifestPath).json();
    if (manifest.name) workspaces.set(manifest.name, { root, manifest });
  }
  return {
    name: "remotion-vendored-source",
    setup(build) {
      build.onResolve({ filter: /^(?:@remotion\/|remotion(?:\/|$))/ }, ({ path }) => {
        if (path === compositorName && compositorRoot) {
          return { path, namespace: "remotion-native-compositor" };
        }
        const parts = path.split("/");
        const name = path.startsWith("@") ? parts.splice(0, 2).join("/") : parts.shift()!;
        const workspace = workspaces.get(name);
        if (!workspace) return;
        const subpath = parts.length ? "./" + parts.join("/") : ".";
        if (subpath === "./package.json") return { path: join(workspace.root, "package.json") };
        let entry = workspace.manifest.exports?.[subpath];
        if (typeof entry === "object")
          entry = entry.import ?? entry.module ?? entry.require ?? entry.default;
        if (typeof entry !== "string") entry = subpath === "." ? workspace.manifest.main : subpath;
        entry = (entry ?? "./dist/index.js")
          .replace(/^\.\//, "")
          .replace(/^dist\/(?:cjs\/|esm\/)?/, "src/");
        const stem = join(workspace.root, entry.replace(/\.(?:m?js|cjs)$/, ""));
        const candidates = [
          stem + ".ts",
          stem + ".tsx",
          stem + ".js",
          stem + ".mjs",
          join(stem, "index.ts"),
          join(stem, "index.tsx"),
          join(workspace.root, entry),
        ];
        const found = candidates.find(existsSync);
        if (!found) throw new Error(`No vendored source for ${path}: ${candidates.join(", ")}`);
        return { path: found };
      });
      build.onLoad({ filter: /.*/, namespace: "remotion-native-compositor" }, () => {
        if (!compositorRoot || !existsSync(compositorRoot)) {
          throw new Error(
            "Install the pinned optional compositor package or set BUN_VIDEO_COMPOSITOR_DIR before compilation",
          );
        }
        const files = readdirSync(compositorRoot).filter((name) => /\.(exe|dll)$/.test(name));
        if (
          !files.includes("remotion.exe") ||
          !files.includes("ffmpeg.exe") ||
          !files.includes("ffprobe.exe")
        ) {
          throw new Error(
            "The compositor asset directory must contain remotion.exe, ffmpeg.exe and ffprobe.exe",
          );
        }
        const imports = files
          .map(
            (name, index) =>
              `import asset${index} from ${JSON.stringify(join(compositorRoot, name))} with {type: "file"};`,
          )
          .join("\n");
        const writes = files
          .map(
            (name, index) =>
              `writeFileSync(join(dir, ${JSON.stringify(name)}), readFileSync(asset${index}));`,
          )
          .join("\n");
        return {
          loader: "js",
          contents: `${imports}\nimport {mkdtempSync, readFileSync, writeFileSync, rmSync} from 'node:fs';\nimport {tmpdir} from 'node:os';\nimport {join} from 'node:path';\nexport const dir = mkdtempSync(join(tmpdir(), 'bun-video-compositor-'));\ntry {${writes}} catch(error) {rmSync(dir, {recursive:true}); throw error;}\nprocess.once('exit', () => rmSync(dir, {recursive:true}));\n`,
        };
      });
      build.onResolve({ filter: /^[^./]/ }, ({ path, importer }) => {
        if (!importer.startsWith(remotionRoot)) return;
        if (path.startsWith("node:") || path.startsWith("bun:") || path === "bun") return;
        try {
          return { path: Bun.resolveSync(path, join(import.meta.dir, "build-deps")) };
        } catch {
          return;
        }
      });
    },
  };
}

export async function buildRemotionStandalone(outfile: string): Promise<void> {
  const result = await Bun.build({
    entrypoints: [join(import.meta.dir, "standalone-entry.ts")],
    plugins: [await remotionSourcePlugin(), await remotionModuleAssetsPlugin()],
    target: "bun",
    minify: true,
    compile: { outfile: resolve(outfile), executablePath: process.execPath },
  });
  if (!result.success)
    throw new AggregateError(result.logs, "Remotion standalone compilation failed");
}

if (import.meta.main) {
  await buildRemotionStandalone(
    process.argv[2] ?? resolve(remotionRoot, "../../../tmp/bun-video-build/remotion.exe"),
  );
}
