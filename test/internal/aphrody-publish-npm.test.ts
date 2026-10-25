import { describe, expect, test } from "bun:test";
import {
  contentHash,
  nextVersion,
  nextStableVersion,
  npmName,
  PACKAGES,
  publicationStatus,
  publishManifest,
  rewriteSiblingImports,
  validateOutputDirectory,
  exportTrackedPackage,
  verifyPreparedPackage,
  assertPublicationSources,
  assertLatestVersionDoesNotRegress,
  facadeSourcePaths,
  publishAll,
} from "../../scripts/aphrody/publish-npm.ts";
import { tempDir } from "harness";
import { join } from "node:path";
import { mkdirSync, existsSync } from "node:fs";

test("plugin publication library refuses missing or foreign proofs before any package write", async () => {
  using directory = tempDir("plugin-publication-no-write", {});
  for (const only of [["bun-agent-plugin"], ["bun-tools", "bun-agent-plugin"], undefined]) {
    const out = join(String(directory), only?.join("-") ?? "all");
    await expect(publishAll({ only, out, registry: "http://127.0.0.1:1" })).rejects.toThrow("--plugin-qualification");
    expect(existsSync(out)).toBe(false);
  }
  await expect(publishAll({ only: ["bun-tools"], pluginQualification: "unused" })).rejects.toThrow(
    "without bun-agent-plugin",
  );
  const invalid = join(String(directory), "invalid.json");
  await Bun.write(invalid, JSON.stringify({ kind: "bun-portable-npm-source-qualification" }));
  const out = join(String(directory), "invalid-proof");
  await expect(
    publishAll({ only: ["bun-agent-plugin"], pluginQualification: invalid, out, registry: "http://127.0.0.1:1" }),
  ).rejects.toThrow("Invalid plugin");
  expect(existsSync(out)).toBe(false);
});

test("plugin publication CLI enforces the library proof guard for mixed and plugin selections", async () => {
  using directory = tempDir("plugin-cli-no-write", {});
  for (const only of ["bun-agent-plugin", "bun-tools,bun-agent-plugin"]) {
    const out = join(String(directory), only);
    const child = Bun.spawn(
      [
        process.execPath,
        "scripts/aphrody/publish-npm.ts",
        "--only",
        only,
        "--out",
        out,
        "--registry",
        "http://127.0.0.1:1",
      ],
      {
        cwd: join(import.meta.dir, "../.."),
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    const [stdout, stderr, code] = await Promise.all([child.stdout.text(), child.stderr.text(), child.exited]);
    expect(stderr).toContain("requires --plugin-qualification");
    expect(stdout).toBe("");
    expect(code).not.toBe(0);
    expect(existsSync(out)).toBe(false);
  }
});

test("publication cannot downgrade independent Windows or SDK latest identities", () => {
  expect(nextVersion("1.4.10", ["1.4.10"])).toEqual({ next: "1.4.10-aphrody.1", previous: "1.4.10" });
  expect(() => assertLatestVersionDoesNotRegress("1.4.4", "71.0.30-preview")).toThrow("latest backwards");
  expect(() => assertLatestVersionDoesNotRegress("1.4.10-aphrody.1", "1.4.10")).toThrow("latest backwards");
  expect(() => assertLatestVersionDoesNotRegress("1.4.11", "1.4.10")).not.toThrow();
  expect(() => assertLatestVersionDoesNotRegress("71.0.30-preview", "71.0.30-preview")).not.toThrow();
  expect(() => assertLatestVersionDoesNotRegress("1.4.4")).not.toThrow();
});

test("source facade selections retain metadata and reject new unqualified shipped roots", () => {
  const manifest = {
    files: ["js", "LICENSE-*", "README.md"],
    exports: { ".": "./js/index.ts", "./api/*": "./js/api/*.ts" },
  };
  expect(
    facadeSourcePaths(
      manifest,
      ["js"],
      ["package.json", "README.md", "LICENSE-MIT", "LICENSE-APACHE-2.0", "NOTICE", "crates"],
    ),
  ).toEqual(["LICENSE-APACHE-2.0", "LICENSE-MIT", "NOTICE", "README.md", "js", "package.json"]);
  expect(() => facadeSourcePaths({ ...manifest, files: [...manifest.files, "native"] }, ["js"], ["README.md"])).toThrow(
    "source closure",
  );
  expect(() =>
    facadeSourcePaths({ ...manifest, exports: { ".": "./assets/generated.js" } }, ["js"], ["README.md"]),
  ).toThrow("source closure");
  expect(() => facadeSourcePaths({ ...manifest, bin: { command: "native/cli" } }, ["js"], ["README.md"])).toThrow(
    "source closure",
  );
});

test("portable facade archives preserve exports and import without activating native payloads", async () => {
  using directory = tempDir("portable-facade-consumer", {});
  const root = String(directory);
  const checkout = join(import.meta.dir, "../..");
  const revision = Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: checkout }).stdout.toString().trim();
  const command = async (args: string[], cwd = root) => {
    const child = Bun.spawn(args, { cwd, stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, code] = await Promise.all([child.stdout.text(), child.stderr.text(), child.exited]);
    if (code !== 0) throw new Error(`Archive command failed: ${stderr}`);
    return stdout;
  };
  for (const dir of ["bun-supervisor", "bun-tools"]) {
    const consumerRoot = join(root, dir);
    mkdirSync(consumerRoot);
    const sourceRoot = join(root, dir + "-source");
    await command([
      process.execPath,
      "-e",
      `import{exportTrackedPackage,packageSourcePaths,PACKAGES}from${JSON.stringify(join(checkout, "scripts/aphrody/publish-npm.ts"))};const spec=PACKAGES.find(s=>s.dir===${JSON.stringify(dir)});const manifest=JSON.parse(Bun.spawnSync(["git","show",${JSON.stringify(`${revision}:packages/${dir}/package.json`)}],{cwd:${JSON.stringify(checkout)}}).stdout.toString());await exportTrackedPackage(${JSON.stringify(checkout)},${JSON.stringify(revision)},${JSON.stringify(`packages/${dir}`)},${JSON.stringify(sourceRoot)},packageSourcePaths(${JSON.stringify(checkout)},${JSON.stringify(revision)},spec,manifest));`,
    ]);
    const archive = join(root, `${dir}.tgz`);
    await command([process.execPath, "pm", "pack", "--ignore-scripts", "--filename", archive], sourceRoot);
    const names = (await command(["tar", "-tzf", archive])).trim().split("\n");
    expect(
      names.every(name => /^package\/(?:package\.json|LICENSE[^/]*|README\.md|NOTICE|src\/|systemd\/)/.test(name)),
    ).toBe(true);
    expect(names.some(name => /(?:\.env|cookies|\.sqlite|\.node$|\.dll$|\.so$)/i.test(name))).toBe(false);
    await command(["tar", "-xzf", archive, "-C", consumerRoot]);
    const manifest = await Bun.file(join(consumerRoot, "package/package.json")).json();
    expect(manifest.name).toBe(dir === "bun-supervisor" ? "@aphrody/supervisor" : "@aphrody/bun-tools");
    const facade = await import(join(consumerRoot, "package/src/index.ts"));
    expect(typeof (dir === "bun-supervisor" ? facade.Supervisor : facade.toolAssetPin)).toBe("function");
  }
}, 20000);

test("publication exports immutable tracked blobs and excludes ignored protected files", async () => {
  using directory = tempDir("publication-git-source", {
    "packages/fixture/package.json": "{}",
    "packages/fixture/index.ts": "export const value = 1;\n",
    "packages/fixture/.env": "protected-fixture",
    "packages/fixture/cache.bin": "ignored-fixture",
    ".gitignore": ".env\ncache.bin\n",
  });
  const root = String(directory);
  const git = (...args: string[]) => {
    const result = Bun.spawnSync(["git", ...args], { cwd: root, stdout: "pipe", stderr: "pipe" });
    if (result.exitCode) throw new Error(result.stderr.toString());
    return result.stdout.toString().trim();
  };
  git("init", "--quiet");
  git("add", ".");
  git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--quiet", "-m", "fixture");
  const revision = git("rev-parse", "HEAD");
  await Bun.write(join(root, "unrelated-work.ts"), "parallel work\n");
  expect(() => assertPublicationSources(root, revision, ["packages/fixture"])).not.toThrow();
  await Bun.write(join(root, "packages/fixture/index.ts"), "dirty working copy");
  expect(() => assertPublicationSources(root, revision, ["packages/fixture"])).toThrow("pinned commit");
  git("add", "packages/fixture/index.ts");
  expect(() => assertPublicationSources(root, revision, ["packages/fixture"])).toThrow("pinned commit");
  await Bun.write(join(root, "packages/fixture/index.ts"), "export const value = 1;\n");
  git("add", "packages/fixture/index.ts");
  await Bun.write(join(root, "packages/fixture/new.ts"), "untracked build input\n");
  expect(() => assertPublicationSources(root, revision, ["packages/fixture"])).toThrow("pinned commit");
  expect(() => assertPublicationSources(root, revision, ["../outside"])).toThrow("inside the checkout");
  expect(() => assertPublicationSources(root, revision, ["packages/fixture/new.ts"])).toThrow("pinned commit");
  await Bun.write(join(root, "packages/fixture/index.ts"), "dirty working copy");
  const output = join(root, "tmp", "export");
  const receipt = await exportTrackedPackage(root, revision, "packages/fixture", output);
  expect(await Bun.file(join(output, "index.ts")).text()).toBe("export const value = 1;\n");
  expect(await Bun.file(join(output, ".env")).exists()).toBe(false);
  expect(await Bun.file(join(output, "cache.bin")).exists()).toBe(false);
  expect(receipt.files.map(file => file.path).sort()).toEqual(["index.ts", "package.json"]);
  await Bun.write(join(output, "unexpected.js"), "generated");
  await expect(verifyPreparedPackage(output, receipt.files, [])).rejects.toThrow("Undeclared");
  expect(await verifyPreparedPackage(output, receipt.files, ["unexpected.js"])).toHaveLength(1);
  await expect(exportTrackedPackage(root, revision, "packages/fixture", output)).rejects.toThrow("must not exist");
  const hashed = Bun.spawnSync(["git", "hash-object", "-w", "--stdin"], {
    cwd: root,
    stdin: new TextEncoder().encode("../../outside"),
    stdout: "pipe",
    stderr: "pipe",
  });
  expect(hashed.exitCode).toBe(0);
  git("update-index", "--add", "--cacheinfo", `120000,${hashed.stdout.toString().trim()},packages/fixture/escape`);
  git(
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "commit",
    "--quiet",
    "-m",
    "escaping symlink",
  );
  await expect(
    exportTrackedPackage(root, git("rev-parse", "HEAD"), "packages/fixture", join(root, "tmp", "rejected")),
  ).rejects.toThrow("Escaping");
}, 10000);

test("publication staging rejects checkout roots, ancestors and tracked source directories", () => {
  using directory = tempDir("publication-staging", {
    "repository/package.json": "{}",
    "temporary/keep": "",
  });
  const root = join(String(directory), "repository");
  const temporary = join(String(directory), "temporary");
  for (const target of [root, String(directory), join(root, "packages", "bun-types")])
    expect(() => validateOutputDirectory(target, root, temporary)).toThrow("checkout");
  expect(validateOutputDirectory(join(root, "tmp", "packages"), root, temporary)).toBe(join(root, "tmp", "packages"));
  expect(validateOutputDirectory(join(temporary, "packages"), root, temporary)).toBe(join(temporary, "packages"));
});

const spec = (dir: string) => PACKAGES.find(p => p.dir === dir)!;

test("publication requires matching public package, version and uploaded archive integrity", async () => {
  const expected = { name: "@aphrody/fixture", version: "1.2.3", integrity: "sha512-qualified" };
  await expect(publicationStatus(new Response(null, { status: 404 }), expected)).resolves.toBe("pending");
  await expect(publicationStatus(Response.json({ name: expected.name, versions: {} }), expected)).resolves.toBe(
    "pending",
  );
  await expect(
    publicationStatus(
      Response.json({
        name: expected.name,
        versions: { [expected.version]: { ...expected, dist: { integrity: expected.integrity } } },
      }),
      expected,
    ),
  ).resolves.toBe("published");
  await expect(
    publicationStatus(
      Response.json({
        name: expected.name,
        versions: { [expected.version]: { ...expected, dist: { integrity: "sha512-other" } } },
      }),
      expected,
    ),
  ).rejects.toThrow("integrity differs");
  await expect(
    publicationStatus(Response.json({ ...expected, dist: { integrity: expected.integrity } }), expected),
  ).resolves.toBe("published");
  await expect(
    publicationStatus(
      Response.json({ ...expected, version: "1.2.4", dist: { integrity: expected.integrity } }),
      expected,
    ),
  ).rejects.toThrow("different package or version");
  await expect(
    publicationStatus(Response.json({ ...expected, dist: { integrity: "sha512-other" } }), expected),
  ).rejects.toThrow("integrity differs");
  await expect(publicationStatus(new Response(null, { status: 503 }), expected)).rejects.toThrow("HTTP 503");
});

describe("nextVersion", () => {
  test("Google and Chromium source SDKs retain runtime coupling without a separate Chrome package", () => {
    expect(spec("bun-google").bunVersion).toBe(true);
    expect(spec("bun-nginx").bunVersion).toBe(true);
    expect(spec("bun-google").requiresBuild).toBeUndefined();
    expect(npmName(spec("bun-google"))).toBe("@aphrody/bun-google");
    expect(PACKAGES.some(candidate => candidate.dir === "bun-chrome")).toBe(false);
    expect(spec("bun-chromium").bunVersion).toBe(true);
    expect(spec("bun-chromium").requiresBuild).toBeUndefined();
  });
  test("occupied stable types keep their base and advance the fork suffix", () => {
    expect(nextVersion("1.4.4", ["1.4.4", "1.4.4-aphrody.2", "1.4.5"])).toEqual({
      next: "1.4.4-aphrody.3",
      previous: "1.4.4-aphrody.2",
    });
  });
  test("stable releases have no Aphrody suffix and advance independent occupied versions", () => {
    expect(nextStableVersion("1.4.4", ["1.4.3", "1.4.4-aphrody.1"])).toEqual({
      next: "1.4.4",
      previous: undefined,
    });
    expect(nextStableVersion("0.1.0", ["0.1.0", "0.1.2", "0.2.0"])).toEqual({
      next: "0.1.3",
      previous: "0.1.2",
    });
    expect(() => nextStableVersion("1.4.4-aphrody.1", [])).toThrow();
  });
  test("starts at aphrody.1", () => {
    expect(nextVersion("1.4.3", [])).toEqual({ next: "1.4.3-aphrody.1", previous: undefined });
  });

  test("increments the highest number for the same base only", () => {
    const published = ["1.4.3-aphrody.1", "1.4.3-aphrody.10", "1.4.3-aphrody.2", "1.4.2-aphrody.40", "1.4.3"];
    expect(nextVersion("1.4.3", published)).toEqual({
      next: "1.4.3-aphrody.11",
      previous: "1.4.3-aphrody.10",
    });
  });

  test("dots in the base are literal", () => {
    expect(nextVersion("1.4.3", ["1x4x3-aphrody.5"]).next).toBe("1.4.3-aphrody.1");
  });
});

describe("publishManifest", () => {
  test("rejects private products instead of converting them into public packages", () => {
    expect(() =>
      publishManifest(
        { name: "private", version: "1.4.4", private: true },
        spec("bun-agent-plugin"),
        "1.4.4",
        new Map(),
      ),
    ).toThrow("private packages cannot be published");
  });

  test("Windows projections are not published as separate npm packages", () => {
    expect(PACKAGES.some(candidate => candidate.dir.startsWith("bun-windows-"))).toBe(false);
    expect(PACKAGES.some(candidate => candidate.dir === "bun-dotnet")).toBe(false);
    expect(PACKAGES.some(candidate => candidate.dir === "bun-vscode")).toBe(false);
  });
  const resolved = new Map([
    ["bun-types", "1.4.3-aphrody.2"],
    ["bun-inspector-protocol", "0.0.2-aphrody.1"],
  ]);

  test("portable supervisor and tools retain their declared public package identities", () => {
    expect(npmName(spec("bun-supervisor"))).toBe("@aphrody/supervisor");
    expect(npmName(spec("bun-tools"))).toBe("@aphrody/bun-tools");
    for (const dir of ["bun-supervisor", "bun-tools"]) {
      expect(spec(dir).requiresBuild).toBeUndefined();
      expect(spec(dir).platform).toBeUndefined();
    }
    const out = publishManifest(
      { name: "consumer", dependencies: { "@aphrody/supervisor": "workspace:*" } },
      spec("bun-tools"),
      "1.4.4",
      new Map([["bun-supervisor", "1.4.4"]]),
    );
    expect(out.dependencies).toEqual({ "@aphrody/supervisor": "1.4.4" });
  });

  test("pins fork dependencies whatever their spelling, keeps registry ones", () => {
    const out = publishManifest(
      {
        name: "@aphrody/bun-plugin-svelte",
        version: "0.0.6",
        devDependencies: { "@types/bun": "../bun-types", svelte: "^5.20.4" },
        dependencies: { "bun-inspector-protocol": "workspace:*", ws: "^8" },
        peerDependencies: { "@aphrody/bun-types": "file:../bun-types" },
      },
      spec("bun-plugin-svelte"),
      "0.0.6-aphrody.3",
      resolved,
    );
    expect(out.version).toBe("0.0.6-aphrody.3");
    expect(out.devDependencies).toEqual({
      "@aphrody/bun-types": "1.4.3-aphrody.2",
      svelte: "^5.20.4",
    });
    expect(out.dependencies).toEqual({
      "@aphrody/bun-inspector-protocol": "0.0.2-aphrody.1",
      ws: "^8",
    });
    expect(out.peerDependencies).toEqual({ "@aphrody/bun-types": "1.4.3-aphrody.2" });
    expect(out.repository).toEqual({
      type: "git",
      url: "git+https://github.com/aphrody-labs/bun.git",
      directory: "packages/bun-plugin-svelte",
    });
    expect(out.homepage).toBe("https://github.com/aphrody-labs/bun/tree/main/packages/bun-plugin-svelte#readme");
    expect(out.bugs).toEqual({ url: "https://github.com/aphrody-labs/bun/issues" });
    expect(out.license).toBe("MIT");
    expect(out.description).toContain("Aphrody runtime, based on Bun");
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

  test("pins renamed product dependencies using their public package identity", () => {
    const out = publishManifest(
      { dependencies: { "@aphrody/fuzzy": "workspace:*" } },
      spec("bun-agent-plugin"),
      "1.4.4",
      new Map([["bun-fuzzy", "1.4.4"]]),
    );
    expect(out.dependencies).toEqual({ "@aphrody/fuzzy": "1.4.4" });
    expect(rewriteSiblingImports('import "../bun-fuzzy/index.ts";')).toBe('import "@aphrody/fuzzy";');
  });

  test("debug adapter gains a pinned dependency on the inspector protocol", () => {
    const out = publishManifest(
      {
        name: "@aphrody/bun-debug-adapter-protocol",
        version: "0.0.1",
        dependencies: { semver: "^7.5.4" },
      },
      spec("bun-debug-adapter-protocol"),
      "0.0.1-aphrody.1",
      resolved,
    );
    expect(out.dependencies).toEqual({
      semver: "^7.5.4",
      "@aphrody/bun-inspector-protocol": "0.0.2-aphrody.1",
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
