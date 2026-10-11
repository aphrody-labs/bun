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
        if (within.startsWith("..") || isAbsolute(within))
          imports.push(`${entry}: ${imported.path}`);
      }
    }
    expect(imports).toEqual([]);
    expect(await Bun.file(resolve(root, "src/frame-worker.ts")).exists()).toBe(true);
    expect(await Bun.file(resolve(root, "src/parallel-capture.ts")).text()).toContain(
      '"./frame-worker.ts"',
    );
  });

  test("manifest exports and CLI entry points exist in explicit public directories", async () => {
    expect(manifest.private).not.toBe(true);
    expect(manifest.dependencies["@aphrody/bun-runtime-sdk"]).toBe("1.4.5");
    expect(
      Object.values(manifest.dependencies).every(
        (value) => typeof value === "string" && !value.startsWith("file:"),
      ),
    ).toBe(true);
    expect(manifest.publishConfig).toEqual({ access: "public", tag: "next" });
    for (const entry of [
      ...Object.values(manifest.exports),
      ...Object.values(manifest.bin),
    ] as string[]) {
      expect(/^(\.\/src\/|\.\/labs\/)/.test(entry)).toBe(true);
      expect(await Bun.file(resolve(root, entry)).exists()).toBe(true);
    }
    for (const entry of Object.values(manifest.bin) as string[]) {
      expect((await Bun.file(resolve(root, entry)).text()).startsWith("#!/usr/bin/env bun")).toBe(
        true,
      );
    }
    expect(manifest.files).toEqual([
      "src",
      "docs",
      "labs",
      "assets",
      "README.md",
      "LICENSE",
      "THIRD_PARTY_NOTICES.md",
    ]);
  });

  test("public source and browser assets contain no private fixture files", async () => {
    const invalid: string[] = [];
    for await (const entry of new Bun.Glob("{src,labs,assets,docs}/**/*").scan({
      cwd: root,
      onlyFiles: true,
    })) {
      if (
        /(^|[\\/])(cookie(?:s)?\.json|hls\.json|.*\.har|\.env(?:\..*)?|cookie-reference\.json)$/i.test(
          entry,
        )
      )
        invalid.push(entry);
    }
    expect(invalid).toEqual([]);
  });
});
