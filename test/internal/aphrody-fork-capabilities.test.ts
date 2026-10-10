import { expect, test } from "bun:test";
import { tempDir, isASAN } from "harness";
import { exportForkCapabilities, moduleNames, parseDelta } from "../../scripts/aphrody/fork-capabilities.ts";
import { exportForkGraphDocs } from "../../scripts/aphrody/fork-graph-docs.ts";

test("module inventory includes newly registered modules without a maintained allowlist", () => {
  expect(
    moduleNames(
      '#[strum(serialize = "bun:python")]\n#[strum(serialize = "node:fs")]\n#[strum(serialize = "bun:new")]\n#[strum(serialize = "bun:python")]',
    ),
  ).toEqual(["bun:new", "bun:python"]);
});

test("source delta preserves spaces, deletions and newly added sources", () => {
  expect(parseDelta("D\0src/old file.rs\0A\0src/new.rs\0")).toEqual([
    { status: "A", path: "src/new.rs" },
    { status: "D", path: "src/old file.rs" },
  ]);
  expect(() => parseDelta("A\0")).toThrow("Invalid Git source delta");
  expect(() => parseDelta("A\0../outside\0")).toThrow("Invalid Git source delta entry");
});

test(
  "catalog exports the committed fork delta and hashes current package and native manifests",
  async () => {
    using dir = tempDir("fork-capabilities", {
      "src/resolve_builtins/HardcodedModule.rs": '#[strum(serialize = "bun:ffi")]\n',
    });
    const root = String(dir);
    const run = (args: string[]) => {
      const result = Bun.spawnSync(["git", "-C", root, ...args], {
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: "fixture",
          GIT_AUTHOR_EMAIL: "fixture@example.test",
          GIT_COMMITTER_NAME: "fixture",
          GIT_COMMITTER_EMAIL: "fixture@example.test",
        },
        stdout: "pipe",
        stderr: "pipe",
      });
      expect(result.stderr.toString()).not.toContain("fatal:");
      expect(result.exitCode).toBe(0);
      return result.stdout.toString().trim();
    };
    run(["init", "--quiet"]);
    run(["add", "."]);
    run(["-c", "core.hooksPath=", "commit", "--quiet", "-m", "upstream"]);
    const upstream = run(["rev-parse", "HEAD"]);
    await Bun.write(
      `${root}/src/resolve_builtins/HardcodedModule.rs`,
      '#[strum(serialize = "bun:ffi")]\n#[strum(serialize = "bun:python")]\n',
    );
    await Bun.write(
      `${root}/packages/future/package.json`,
      JSON.stringify({ name: "@aphrody/future", version: "1.0.0", exports: { ".": "./index.ts" } }),
    );
    await Bun.write(
      `${root}/packages/native/Cargo.toml`,
      '[package]\nname="future_native"\nversion="1.0.0"\n[lib]\ncrate-type=["cdylib","rlib"]\n',
    );
    await Bun.write(`${root}/packages/unscoped/package.json`, '{"name":"other","version":"1.0.0"}');
    await Bun.write(`${root}/packages/unversioned/package.json`, '{"name":"@aphrody/unversioned","private":true}');
    run(["add", "."]);
    run(["-c", "core.hooksPath=", "commit", "--quiet", "-m", "fork"]);
    const catalog = await exportForkCapabilities(root, upstream);
    expect(catalog.modules.map(({ name, forkOnly }) => ({ name, forkOnly }))).toEqual([
      { name: "bun:ffi", forkOnly: false },
      { name: "bun:python", forkOnly: true },
    ]);
    expect(catalog.packages.map(({ name, version }) => ({ name, version }))).toEqual([
      { name: "@aphrody/future", version: "1.0.0" },
      { name: "@aphrody/unversioned", version: null },
    ]);
    expect(catalog.nativeCrates.map(({ name, crateTypes }) => ({ name, crateTypes }))).toEqual([
      { name: "future_native", crateTypes: ["cdylib", "rlib"] },
    ]);
    expect(catalog.coverage).toEqual({ modules: 2, packages: 2, nativeCrates: 1, sourceDelta: 5 });
    expect(catalog.source.dirty).toBe(false);
    expect(catalog.packages[0]!.sha256).toBe(
      new Bun.CryptoHasher("sha256")
        .update(await Bun.file(`${root}/packages/future/package.json`).bytes())
        .digest("hex"),
    );
    await Bun.write(`${root}/packages/future/package.json`, '{"name":"@aphrody/future","version":"2.0.0"}');
    await Bun.write(`${root}/untracked-secret.txt`, "not exported");
    const changed = await exportForkCapabilities(root, upstream);
    expect(changed.source.dirty).toBe(true);
    expect(changed.packages[0]!.version).toBe("2.0.0");
    expect(changed.sourceDelta.some(entry => entry.path === "untracked-secret.txt")).toBe(false);
    await expect(exportForkCapabilities(`${root}/packages`, upstream)).rejects.toThrow("--root must select");
    await Bun.write(
      `${root}/src/demo/index.ts`,
      "function twice(value: number) { return value * 2; }\nexport function answer() { return twice(21); }\n",
    );
    const evidence = await exportForkGraphDocs(root, changed, { out: `${root}/evidence`, domains: ["src/demo"] });
    expect(
      evidence.index.domains.map(domain => ({
        domain: domain.domain,
        nativeFiles: domain.coverage.nativeFiles,
        parseErrors: domain.coverage.parseErrors,
      })),
    ).toEqual([{ domain: "src/demo", nativeFiles: 1, parseErrors: 0 }]);
    expect(evidence.documents).toHaveLength(1);
    const manifest = await Bun.file(`${evidence.documents[0]!.out}/manifest.json`).json();
    expect(manifest.scope.profile).toBe("bun");
    expect(manifest.counts.files).toBe(1);
    expect(manifest.truncated).toEqual({ inputs: false, nodes: false, edges: false });
    const inputs = await Bun.file(`${evidence.documents[0]!.out}/inputs.json`).json();
    expect(inputs[0].path).toBe("index.ts");
    expect(inputs[0].sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(evidence.capabilities.publication).toBe(false);
  },
  isASAN ? 15000 : 5000,
);
