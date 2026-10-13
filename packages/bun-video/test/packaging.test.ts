import { describe, expect, test } from "bun:test";
import { resolve, relative, isAbsolute, dirname } from "node:path";

const root = resolve(import.meta.dir, "..");
const manifest = await Bun.file(resolve(root, "package.json")).json();

describe("standalone source package", () => {
  test("every relative source import remains inside the packaged directory", async () => {
    const typescript = new Bun.Transpiler({ loader: "ts" });
    const tsx = new Bun.Transpiler({ loader: "tsx" });
    const imports: string[] = [];
    for await (const entry of new Bun.Glob("{src,labs}/**/*.{ts,tsx}").scan({ cwd: root })) {
      const sourcePath = resolve(root, entry);
      const transpiler = entry.endsWith(".tsx") ? tsx : typescript;
      for (const imported of transpiler.scanImports(await Bun.file(sourcePath).text())) {
        if (!imported.path.startsWith(".")) continue;
        const target = resolve(dirname(sourcePath), imported.path);
        const within = relative(root, target);
        if (within.startsWith("..") || isAbsolute(within)) imports.push(`${entry}: ${imported.path}`);
      }
    }
    expect(imports).toEqual([]);
    expect(await Bun.file(resolve(root, "src/frame-worker.ts")).exists()).toBe(true);
    expect(await Bun.file(resolve(root, "src/parallel-capture.ts")).text()).toContain('"./frame-worker.ts"');
  });

  test("manifest exports and CLI entry points exist in explicit public directories", async () => {
    expect(manifest.private).not.toBe(true);
    const sdk = await Bun.file(resolve(root, "../bun-runtime-sdk/package.json")).json();
    expect(manifest.dependencies["@aphrody/bun-runtime-sdk"]).toBe(sdk.version);
    expect(
      Object.values(manifest.dependencies).every(value => typeof value === "string" && !value.startsWith("file:")),
    ).toBe(true);
    expect(manifest.publishConfig).toEqual({ access: "public", tag: "next" });
    for (const entry of [...Object.values(manifest.exports), ...Object.values(manifest.bin)] as string[]) {
      expect(/^(\.\/(src|labs|umbrella-src|packages)\/)/.test(entry)).toBe(true);
      expect(await Bun.file(resolve(root, entry)).exists()).toBe(true);
    }
    for (const entry of Object.values(manifest.bin) as string[]) {
      expect((await Bun.file(resolve(root, entry)).text()).startsWith("#!/usr/bin/env bun")).toBe(true);
    }
    expect(manifest.files.filter((entry: string) => !entry.startsWith("!"))).toEqual([
      "src",
      "umbrella-src",
      "packages/remotion",
      "packages/hyperframes",
      "native",
      "infra",
      "plugin",
      "scripts",
      "video-benchmark",
      "docs",
      "labs",
      "assets",
      "packages/mediabunny",
      "packages/yt-dlp",
      "README.md",
      "LICENSE",
      "THIRD_PARTY_NOTICES.md",
    ]);
    const exclusions = manifest.files.filter((entry: string) => entry.startsWith("!"));
    expect(exclusions).toContain("!**/.env*");
    expect(exclusions).toContain("!**/cookies/**");
    expect(exclusions).toContain("!packages/yt-dlp/test/testdata/certificate/**");
  });

  test("direct engine exports resolve to the absorbed source", async () => {
    expect(manifest.exports["./remotion"]).toBe("./packages/remotion/packages/core/src/index.ts");
    expect(manifest.exports["./hyperframes"]).toBe("./packages/hyperframes/packages/core/src/index.ts");
    for (const entry of [manifest.exports["./remotion"], manifest.exports["./hyperframes"]]) {
      expect(await Bun.file(resolve(root, entry)).exists()).toBe(true);
    }
    expect(manifest.dependencies.remotion).toBeUndefined();
    expect(manifest.dependencies["@hyperframes/core"]).toBeUndefined();
  });

  test("public aliases resolve to their canonical implementation", async () => {
    const main = await import("@aphrody/bun-video");
    const engine = await import("@aphrody/bun-video/engine");
    const encode = await import("@aphrody/bun-video/encode");
    const computer = await import("@aphrody/bun-video/computer");
    const hyperframes = await import("../packages/hyperframes/packages/engine/src/services/nativeWebViewCapture");
    expect(engine).toBe(main);
    expect(encode.encodeVideo).toBe(main.encodeVideo);
    expect(computer.runBrowserTask).toBe(main.runBrowserTask);
    expect(hyperframes.captureNativeWebViewFrames).toBe(main.captureNativeWebViewFrames);
  });

  test("the engine CLI retains its commands after entrypoint consolidation", async () => {
    const child = Bun.spawn([process.execPath, resolve(root, manifest.bin["bun-video-engine"]), "--help"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const [output, errors, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(output).toContain("bun-video capabilities");
    expect(output).toContain("bun-video mcp");
    expect(output).toContain("bun-video encode");
    expect(errors).toBe("");
    expect(exitCode).toBe(0);
  });

  test("absorbed Remotion core loads as Bun source without generated dist files", async () => {
    const core = await import(resolve(root, manifest.exports["./remotion"]));
    expect(typeof core.Composition).toBe("function");
    expect(typeof core.interpolate).toBe("function");
    expect(core.interpolate(5, [0, 10], [0, 100])).toBe(50);
    expect(typeof core.AbsoluteFill).toBe("object");
  });

  test("absorbed HyperFrames core loads as Bun source", async () => {
    const core = await import(resolve(root, manifest.exports["./hyperframes"]));
    expect(typeof core.generateBaseHtml).toBe("function");
    expect(typeof core.parseSlideshowManifest).toBe("function");
  });

  test("public source and browser assets contain no private fixture files", async () => {
    const invalid: string[] = [];
    for await (const entry of new Bun.Glob("{src,labs,assets,docs}/**/*").scan({
      cwd: root,
      onlyFiles: true,
    })) {
      if (/(^|[\\/])(cookie(?:s)?\.json|hls\.json|.*\.har|\.env(?:\..*)?|cookie-reference\.json)$/i.test(entry))
        invalid.push(entry);
    }
    expect(invalid).toEqual([]);
  });
});
