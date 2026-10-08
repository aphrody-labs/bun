import { describe, expect, test } from "bun:test";
import { tempDir } from "harness";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  cdylibName,
  mdxPackageNames,
  mdxPlatforms,
  nodeFile,
  platformManifest,
  rootManifest,
  stage,
} from "../../scripts/aphrody/publish-mdx-rs";
import { inspectorManifest, stage as inspectorStage } from "../../scripts/aphrody/publish-web-inspector";

describe("@aphrody/bun-mdx-rs packaging", () => {
  test("platforms use napi keys and the right cdylib", () => {
    expect(mdxPlatforms.map(p => p.key)).toEqual([
      "darwin-arm64",
      "darwin-x64",
      "linux-x64-gnu",
      "linux-arm64-gnu",
      "linux-x64-musl",
      "linux-arm64-musl",
      "win32-x64-msvc",
      "win32-arm64-msvc",
    ]);
    const byKey = Object.fromEntries(mdxPlatforms.map(p => [p.key, p]));
    expect(cdylibName(byKey["win32-arm64-msvc"])).toBe("bun_mdx_rs.dll");
    expect(cdylibName(byKey["darwin-x64"])).toBe("libbun_mdx_rs.dylib");
    expect(cdylibName(byKey["linux-arm64-musl"])).toBe("libbun_mdx_rs.so");
    expect(byKey["linux-x64-gnu"].container).toBe("rust:1-bullseye");
    expect(mdxPackageNames().at(-1)).toBe("@aphrody/bun-mdx-rs");
  });

  test("manifests", () => {
    const musl = mdxPlatforms.find(p => p.key === "linux-x64-musl")!;
    expect(platformManifest(musl, "1.4.3-aphrody.1")).toMatchObject({
      name: "@aphrody/bun-mdx-rs-linux-x64-musl",
      main: "bun-mdx-rs.linux-x64-musl.node",
      files: ["bun-mdx-rs.linux-x64-musl.node"],
      os: ["linux"],
      cpu: ["x64"],
      libc: ["musl"],
    });
    expect(rootManifest("1.4.3-aphrody.1", [musl]).optionalDependencies).toEqual({
      "@aphrody/bun-mdx-rs-linux-x64-musl": "1.4.3-aphrody.1",
    });
  });

  test("stage packages only the binaries that were built", () => {
    const win = mdxPlatforms.find(p => p.key === "win32-x64-msvc")!;
    using dir = tempDir("mdx-stage", { [`artifacts/mdx-win32-x64-msvc/${nodeFile(win)}`]: "binary" });
    const staged = stage("1.4.3-aphrody.1", join(String(dir), "artifacts"), join(String(dir), "out"));
    expect(staged.platforms.map(s => s.platform.key)).toEqual(["win32-x64-msvc"]);
    const root = JSON.parse(readFileSync(join(staged.root, "package.json"), "utf8"));
    expect(root).toMatchObject({ name: "@aphrody/bun-mdx-rs", main: "index.js", types: "index.d.ts" });
    expect(Object.keys(root.optionalDependencies)).toEqual(["@aphrody/bun-mdx-rs-win32-x64-msvc"]);
    expect(readFileSync(join(staged.root, "index.js"), "utf8")).toContain('symbol = "bun_mdx_rs"');
    expect(readFileSync(join(staged.platforms[0].dir, nodeFile(win)), "utf8")).toBe("binary");
  });
});

describe("@aphrody/web-inspector-bun packaging", () => {
  test("stage copies the build and writes the manifest", () => {
    using dir = tempDir("inspector-stage", {
      "built/index.html": "<html></html>",
      "built/Protocol/InspectorBackendCommands.js": "// commands",
    });
    const out = inspectorStage("1.4.3-aphrody.1", join(String(dir), "built"), join(String(dir), "npm"));
    expect(JSON.parse(readFileSync(join(out, "package.json"), "utf8"))).toEqual(inspectorManifest("1.4.3-aphrody.1"));
    expect(inspectorManifest("1.4.3-aphrody.1")).toMatchObject({
      name: "@aphrody/web-inspector-bun",
      exports: { ".": "./index.html", "./*": "./*" },
    });
    expect(readFileSync(join(out, "Protocol/InspectorBackendCommands.js"), "utf8")).toBe("// commands");
    expect(() => inspectorStage("1.4.3-aphrody.1", join(String(dir), "missing"), join(String(dir), "x"))).toThrow(
      /no index.html/,
    );
  });
});
