import { expect, test } from "bun:test";
import { tempDir } from "../../../test/harness.ts";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { BunPython } from "../../../scripts/aphrody/pyjs-store.ts";
import {
  applyPatches,
  buildCommands,
  fileSHA256,
  freshPrefix,
  hostTarget,
  inventory,
  loadManifests,
  scopedPath,
  qualifiedVisualStudio,
  validateManifest,
  verifyBuild,
  verifySource,
  stageWindowsLaunchers,
  windowsBinaryPath,
  type PatchManifest,
  type PythonBuildReceipt,
} from "./cpython.ts";

async function git(root: string, ...args: string[]) {
  await using proc = Bun.spawn({
    cmd: ["git", "-C", root, ...args],
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exit] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
  if (exit !== 0) throw new Error(`Fixture Git failed with exit ${exit}: ${stderr}`);
  return stdout;
}

async function fixture(root: string) {
  const source = join(root, "source"),
    directory = join(root, "patches");
  await mkdir(join(source, "Include"), { recursive: true });
  await mkdir(directory);
  const content = ["old-json\n", "old-ssl\n"];
  const paths = ["json.c", "ssl.py"];
  await Bun.write(join(source, "Include/patchlevel.h"), '#define PY_VERSION "3.13.16"\n');
  for (let i = 0; i < paths.length; i++) await Bun.write(join(source, paths[i]!), content[i]!);
  await git(source, "init", "--quiet");
  await git(source, "config", "core.autocrlf", "false");
  await git(source, "add", ".");
  await git(
    source,
    "-c",
    "user.name=fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "commit",
    "--quiet",
    "-m",
    "fixture",
  );
  const revision = (await git(source, "rev-parse", "HEAD")).trim();
  await Bun.write(join(directory, "LICENSE"), "Fixture license\n");
  for (let index = 0; index < paths.length; index++) {
    const path = paths[index]!,
      prefix = index === 0 ? "cpython-json-ascii" : "cpython-ssl-winerror";
    const preimageSHA256 = await fileSHA256(join(source, path));
    await Bun.write(join(source, path), content[index]!.replace("old", "new"));
    const patch = await git(source, "diff", "--no-ext-diff", "--", path);
    await Bun.write(join(directory, `${prefix}.patch`), patch);
    const manifest: PatchManifest = {
      schemaVersion: 1,
      component: "cpython",
      version: "3.13.16",
      revision,
      upstream: "https://github.com/python/cpython",
      license: { path: "LICENSE", sha256: await fileSHA256(join(directory, "LICENSE")) },
      patch: {
        path: `${prefix}.patch`,
        sha256: await fileSHA256(join(directory, `${prefix}.patch`)),
        strip: 1,
      },
      files: [{ path, preimageSHA256, postimageSHA256: await fileSHA256(join(source, path)) }],
    };
    await Bun.write(join(directory, `${prefix}.json`), JSON.stringify(manifest));
    await Bun.write(join(source, path), content[index]!);
  }
  return { source, directory, patches: await loadManifests(directory) };
}

test("patch manifests reject traversal and ambiguous proofs", () => {
  const proof: PatchManifest = {
    schemaVersion: 1,
    component: "cpython",
    version: "3.13.16",
    revision: "a".repeat(40),
    upstream: "https://github.com/python/cpython",
    license: { path: "LICENSE", sha256: "b".repeat(64) },
    patch: { path: "fix.patch", sha256: "c".repeat(64), strip: 1 },
    files: [{ path: "Modules/_json.c", preimageSHA256: "d".repeat(64), postimageSHA256: "e".repeat(64) }],
  };
  expect(() => validateManifest(proof)).not.toThrow();
  expect(() => validateManifest({ ...proof, patch: { ...proof.patch, path: "../outside.patch" } })).toThrow("escapes");
  expect(() => validateManifest({ ...proof, files: [proof.files[0], proof.files[0]] })).toThrow("proof");
  for (const path of ["../outside", "C:/outside", "source\\file", "file\0suffix"])
    expect(() => scopedPath(resolve("root"), path)).toThrow();
});

test("exact pins and patches apply once while preserving unrelated edits", async () => {
  using dir = tempDir("cpython-factory", {});
  const root = String(dir),
    data = await fixture(root);
  using registry = new BunPython(join(root, "state.sqlite"));
  await Bun.write(join(data.source, "Include/patchlevel.h"), '#define PY_VERSION "3.13.16"\n// unrelated edit\n');
  expect((await verifySource(registry, data.source, data.patches)).map(item => item.state)).toEqual([
    "pending",
    "pending",
  ]);
  await applyPatches(registry, data.source, data.patches);
  await applyPatches(registry, data.source, data.patches);
  expect((await verifySource(registry, data.source, data.patches)).map(item => item.state)).toEqual([
    "applied",
    "applied",
  ]);
  expect(await Bun.file(join(data.source, "Include/patchlevel.h")).text()).toContain("unrelated edit");
  await Bun.write(join(data.source, "json.c"), "foreign edit\n");
  await expect(verifySource(registry, data.source, data.patches)).rejects.toThrow("unrelated changes");
}, 10000);

test("patch and pinned HEAD drift stop before changing source", async () => {
  using dir = tempDir("cpython-factory-drift", {});
  const root = String(dir),
    data = await fixture(root);
  using registry = new BunPython(join(root, "state.sqlite"));
  await Bun.write(data.patches[0]!.patch, "corrupted\n");
  await expect(loadManifests(data.directory)).rejects.toThrow("SHA256 mismatch");
  await expect(applyPatches(registry, data.source, data.patches)).rejects.toThrow("Patch changed");
  const changed = data.patches.map(item => ({
    ...item,
    manifest: { ...item.manifest, revision: "0".repeat(40) },
  }));
  await expect(verifySource(registry, data.source, changed)).rejects.toThrow("pinned revision");
  expect(await Bun.file(join(data.source, "json.c")).text()).toBe("old-json\n");
});

test("native factories use complete release builds and explicit POSIX prefixes", () => {
  const source = resolve("cpython");
  const windows = buildCommands({ source, platform: "win32", arch: "x64", jobs: 3 });
  expect(windows[0]!.argv.slice(4)).toEqual(["-p", "x64", "-c", "Release", "-e", "-M", "-q", '"/p:CL_MPCount=3"']);
  expect(() => buildCommands({ source, platform: "linux", arch: "x64", libc: "gnu" })).toThrow("explicit");
  const linux = buildCommands({
    source,
    platform: "linux",
    arch: "arm64",
    libc: "musl",
    buildDir: resolve("build"),
    prefix: resolve("stage"),
    jobs: 2,
  });
  expect(linux[0]!.argv).toContain("--enable-shared");
  expect(linux[1]!.argv).toEqual(["make", "-j2"]);
  expect(hostTarget("linux", "arm64", "musl")).toBe("aarch64-unknown-linux-musl");
  expect(() => hostTarget("linux", "x64")).toThrow("qualified");
  const complete = {
    installationPath: resolve("complete-vs"),
    isComplete: true,
    isLaunchable: true,
  };
  const partial = {
    installationPath: resolve("partial-vs"),
    isComplete: false,
    isLaunchable: true,
  };
  expect(qualifiedVisualStudio([partial, complete])).toEqual([complete]);
  expect(qualifiedVisualStudio([partial, complete], join(partial.installationPath, "MSBuild.exe"))).toEqual([]);
  expect(qualifiedVisualStudio([partial, complete], join(complete.installationPath, "MSBuild.exe"))).toEqual([
    complete,
  ]);
});

test("staging rejects existing, source-contained and protected destinations", async () => {
  using dir = tempDir("cpython-prefix", {});
  const root = String(dir),
    source = join(root, "source");
  await mkdir(source);
  await expect(freshPrefix(root, source)).rejects.toThrow("already exists");
  await expect(freshPrefix(join(source, "..prefix"), source)).rejects.toThrow("source checkout");
  await expect(freshPrefix(join(root, ".aphrody", "runtime"), source)).rejects.toThrow("protected");
  expect(await freshPrefix(join(root, "stage", "3.13.16"), source)).toBe(join(root, "stage", "3.13.16"));
});

test("runtime inventories hash SDK, native modules and Python bytecode", async () => {
  using dir = tempDir("cpython-inventory", {
    "include/Python.h": "headers",
    "DLLs/_json.pyd": "native",
    "Lib/__pycache__/module.pyc": "bytecode",
    "cpython.receipt.json": "excluded receipt",
  });
  const root = String(dir),
    before = await inventory(root);
  expect(Object.keys(before.files)).toEqual(["DLLs/_json.pyd", "Lib/__pycache__/module.pyc", "include/Python.h"]);
  await Bun.write(join(root, "DLLs/_json.pyd"), "different native bytes");
  expect((await inventory(root)).treeSHA256).not.toBe(before.treeSHA256);
  const build = join(root, "PCbuild");
  await mkdir(build);
  await Bun.write(join(build, "venvlauncher.exe"), "console redirector");
  await expect(stageWindowsLaunchers(build, root)).rejects.toThrow();
  await Bun.write(join(build, "venvwlauncher.exe"), "window redirector");
  await stageWindowsLaunchers(build, root);
  expect(await Bun.file(join(root, "Lib/venv/scripts/nt/venvlauncher.exe")).text()).toBe("console redirector");
  expect(await Bun.file(join(root, "Lib/venv/scripts/nt/venvwlauncher.exe")).text()).toBe("window redirector");
  for (const name of ["_ctypes.pyd", "libffi-8.dll", "libcrypto-3.dll", "libssl-3.dll", "tcl86t.dll"])
    expect(windowsBinaryPath(root, name)).toBe(join(root, "DLLs", name));
  for (const name of ["python.exe", "python313.dll", "python3.dll", "vcruntime140.dll", "vcruntime140_1.dll"])
    expect(windowsBinaryPath(root, name)).toBe(join(root, name));
  expect(windowsBinaryPath(root, "python313.lib")).toBe(join(root, "libs", "python313.lib"));
});

test("build receipts require recorded provenance, test qualification and unchanged binaries", async () => {
  using dir = tempDir("cpython-build-receipt", {});
  const root = String(dir),
    data = await fixture(root);
  using registry = new BunPython(join(root, "state.sqlite"));
  await applyPatches(registry, data.source, data.patches);
  const output = process.platform === "win32" ? join(data.source, "PCbuild/amd64") : join(root, "build");
  await mkdir(output, { recursive: true });
  const executable = join(output, process.platform === "win32" ? "python.exe" : "python");
  const library = join(output, process.platform === "win32" ? "python313.dll" : "libpython3.13.so");
  await Bun.write(executable, "fixture executable");
  await Bun.write(library, "fixture library");
  const sourceDiff = join(root, "source.diff");
  await Bun.write(sourceDiff, await git(data.source, "diff", "--binary", "--no-ext-diff", "HEAD", "--"));
  const options = {
    source: data.source,
    buildDir: output,
    prefix: join(root, "prefix"),
    libc: "gnu" as const,
  };
  const receipt: PythonBuildReceipt = {
    schema: "aphrody.cpython-build/1",
    id: "fixture",
    version: "3.13.16",
    revision: data.patches[0]!.manifest.revision,
    target: hostTarget(process.platform, process.arch, options.libc),
    source: data.source,
    output,
    prefix: options.prefix,
    executable,
    library,
    executableSHA256: await fileSHA256(executable),
    librarySHA256: await fileSHA256(library),
    abi: {
      version: "3.13.16",
      implementation: "cpython",
      EXT_SUFFIX: ".pyd",
      shared: 1,
      gilDisabled: 0,
    },
    patches: data.patches.map(item => ({
      manifestSHA256: item.sha256,
      patchSHA256: item.manifest.patch.sha256,
    })),
    commands: [],
    sourceDiff,
    sourceDiffSHA256: await fileSHA256(sourceDiff),
    environment: {},
    qualified: false,
    createdAt: new Date().toISOString(),
  };
  const path = join(root, "receipt.json");
  await Bun.write(path, JSON.stringify(receipt));
  await expect(verifyBuild(registry, path, options, data.patches)).rejects.toThrow("immutable artifact");
  await registry.artifact(path, "cpython-build-receipt");
  await expect(verifyBuild(registry, path, options, data.patches)).rejects.toThrow("qualify");
  expect((await verifyBuild(registry, path, options, data.patches, false)).qualified).toBe(false);
  const qualified = join(root, "qualified.json");
  await Bun.write(qualified, JSON.stringify({ ...receipt, qualified: true }));
  await registry.artifact(qualified, "cpython-build-receipt");
  expect((await verifyBuild(registry, qualified, options, data.patches)).qualified).toBe(true);
  await Bun.write(executable, "changed executable");
  await expect(verifyBuild(registry, qualified, options, data.patches)).rejects.toThrow("binary digest");
}, 10000);
