import { describe, expect, test } from "bun:test";
import {
  contentHash,
  nextVersion,
  npmName,
  PACKAGES,
  publishManifest,
  rewriteSiblingImports,
} from "../../scripts/aphrody/publish-npm.ts";

const spec = (dir: string) => PACKAGES.find(p => p.dir === dir)!;

describe("nextVersion", () => {
  test("starts at aphrody.1", () => {
    expect(nextVersion("1.4.3", [])).toEqual({ next: "1.4.3-aphrody.1", previous: undefined });
  });

  test("increments the highest number for the same base only", () => {
    const published = ["1.4.3-aphrody.1", "1.4.3-aphrody.10", "1.4.3-aphrody.2", "1.4.2-aphrody.40", "1.4.3"];
    expect(nextVersion("1.4.3", published)).toEqual({ next: "1.4.3-aphrody.11", previous: "1.4.3-aphrody.10" });
  });

  test("dots in the base are literal", () => {
    expect(nextVersion("1.4.3", ["1x4x3-aphrody.5"]).next).toBe("1.4.3-aphrody.1");
  });
});

describe("publishManifest", () => {
  const resolved = new Map([
    ["bun-types", "1.4.3-aphrody.2"],
    ["bun-inspector-protocol", "0.0.2-aphrody.1"],
  ]);

  test("pins fork dependencies whatever their spelling, keeps registry ones", () => {
    const out = publishManifest(
      {
        name: "@aphrody/bun-plugin-svelte",
        version: "0.0.6",
        devDependencies: { "@types/bun": "../bun-types", "svelte": "^5.20.4" },
        dependencies: { "bun-inspector-protocol": "workspace:*", "ws": "^8" },
        peerDependencies: { "@aphrody/bun-types": "file:../bun-types" },
      },
      spec("bun-plugin-svelte"),
      "0.0.6-aphrody.3",
      resolved,
    );
    expect(out.version).toBe("0.0.6-aphrody.3");
    expect(out.devDependencies).toEqual({ "@aphrody/bun-types": "1.4.3-aphrody.2", "svelte": "^5.20.4" });
    expect(out.dependencies).toEqual({ "@aphrody/bun-inspector-protocol": "0.0.2-aphrody.1", "ws": "^8" });
    expect(out.peerDependencies).toEqual({ "@aphrody/bun-types": "1.4.3-aphrody.2" });
    expect(out.repository).toEqual({
      type: "git",
      url: "git+https://github.com/aphrody-labs/bun.git",
      directory: "packages/bun-plugin-svelte",
    });
    expect(out.homepage).toBe("https://github.com/aphrody-labs/bun/tree/main/packages/bun-plugin-svelte#readme");
    expect(out.bugs).toEqual({ url: "https://github.com/aphrody-labs/bun/issues" });
    expect(out.license).toBe("MIT");
    expect(out.description).toContain("Aphrody fork of Bun");
  });

  test("upstream registry names of fork packages are pinned too", () => {
    const out = publishManifest(
      { name: "@aphrody/bun-plugin-yaml", devDependencies: { "bun-types": "canary" } },
      spec("bun-plugin-yaml"),
      "0.0.1-aphrody.1",
      resolved,
    );
    expect(out.devDependencies).toEqual({ "@aphrody/bun-types": "1.4.3-aphrody.2" });
  });

  test("debug adapter gains a pinned dependency on the inspector protocol", () => {
    const out = publishManifest(
      { name: "@aphrody/bun-debug-adapter-protocol", version: "0.0.1", dependencies: { semver: "^7.5.4" } },
      spec("bun-debug-adapter-protocol"),
      "0.0.1-aphrody.1",
      resolved,
    );
    expect(out.dependencies).toEqual({ "semver": "^7.5.4", "@aphrody/bun-inspector-protocol": "0.0.2-aphrody.1" });
  });

  test("a fork-only package keeps its own npm name and license", () => {
    const out = publishManifest(
      {
        name: "@aphrody/next-bun",
        version: "0.2.0",
        license: "MIT AND Apache-2.0",
        peerDependencies: { next: ">=16.0.0" },
      },
      spec("bun-next"),
      "0.2.0-aphrody.1",
      resolved,
    );
    expect(npmName(spec("bun-next"))).toBe("@aphrody/next-bun");
    expect(out).toMatchObject({
      name: "@aphrody/next-bun",
      version: "0.2.0-aphrody.1",
      license: "MIT AND Apache-2.0",
      peerDependencies: { next: ">=16.0.0" },
      repository: { directory: "packages/bun-next" },
      publishConfig: { access: "public" },
    });
  });

  test("a fork dependency without a published version is an error", () => {
    expect(() =>
      publishManifest(
        { name: "x", devDependencies: { "@types/bun": "../bun-types" } },
        spec("bun-plugin-svelte"),
        "0.0.6-aphrody.1",
        new Map(),
      ),
    ).toThrow("bun-types");
  });
});

test("rewriteSiblingImports maps monorepo paths of fork packages to npm names", () => {
  const code = [
    `import { a } from "../../../bun-inspector-protocol/index.ts";`,
    `import type { B } from "../../../bun-inspector-protocol/src/inspector/index.d.ts";`,
    `import { c } from "../fixtures/with-sourcemap.js";`,
    `import { d } from "../../../not-a-fork-package/index.ts";`,
  ].join("\n");
  expect(rewriteSiblingImports(code)).toBe(
    [
      `import { a } from "@aphrody/bun-inspector-protocol";`,
      `import type { B } from "@aphrody/bun-inspector-protocol/src/inspector/index.d.ts";`,
      `import { c } from "../fixtures/with-sourcemap.js";`,
      `import { d } from "../../../not-a-fork-package/index.ts";`,
    ].join("\n"),
  );
});

describe("contentHash", () => {
  const files = (version: string, body = "export {}") =>
    new Map<string, string>([
      ["package/package.json", JSON.stringify({ name: "@aphrody/x", version })],
      ["package/index.ts", body],
    ]);

  test("ignores the version so an unchanged package is not republished", () => {
    expect(contentHash(files("1.0.0-aphrody.1"))).toBe(contentHash(files("1.0.0-aphrody.2")));
  });

  test("changes with the content", () => {
    expect(contentHash(files("1.0.0-aphrody.1"))).not.toBe(contentHash(files("1.0.0-aphrody.1", "export {};")));
  });

  test("does not depend on entry order", () => {
    const reversed = new Map([...files("1").entries()].reverse());
    expect(contentHash(reversed)).toBe(contentHash(files("1")));
  });
});
