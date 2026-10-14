import { expect, test } from "bun:test";
import { bunEnv, bunExe, isWindows, tempDir } from "harness";
import { existsSync, mkdirSync, renameSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { familyDefinition, familyFiles, obsoleteFamilyFiles, sharedFiles } from "../../scripts/aphrody/win32/gen";

const root = resolve(import.meta.dir, "../..");
const owner = join(root, "packages/bun-windows-win32");

test("all generated public declarations and dependency versions survive common descriptor ownership", async () => {
  const manifest = await Bun.file(join(owner, "manifest.json")).json();
  const shared = sharedFiles();
  const sharedManifest = JSON.parse(shared["package.json"]);
  expect(await Bun.file(join(owner, "index.js")).text()).toBe(shared["index.js"]);
  expect(sharedManifest.files).toContain("families");
  expect(sharedManifest.types).toBe("index.d.ts");
  for (const [name, summary] of Object.entries(manifest.families) as [string, { dll: string; functions: number }][]) {
    const definition = await Bun.file(join(owner, "families", `${name}.json`)).json();
    const data = { dll: definition.dll, fns: definition.functions, ns: new Set<string>(definition.namespaces) };
    expect(familyDefinition(name, data)).toEqual(definition);
    expect(definition.dll).toBe(summary.dll);
    expect(Object.keys(definition.functions)).toHaveLength(summary.functions);
    const files = familyFiles(name, data);
    const folder = join(root, "packages", `bun-windows-${name}`);
    expect(await Bun.file(join(folder, "index.d.ts")).text()).toBe(files["index.d.ts"]);
    expect(await Bun.file(join(folder, "index.js")).text()).toBe(files["index.js"]);
    const pkg = JSON.parse(await Bun.file(join(folder, "package.json")).text());
    expect(pkg.dependencies[sharedManifest.name]).toBe(sharedManifest.version);
    expect(pkg.files).toEqual(["index.js", "index.d.ts"]);
    expect(existsSync(join(folder, "family.json"))).toBe(false);
  }
});

async function pack(folder: string, archive: string) {
  await using process = Bun.spawn([bunExe(), "pm", "pack", "--quiet", `--filename=${archive}`], {
    cwd: folder,
    env: bunEnv,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    timeout: 20000,
  });
  const [output, error, code] = await Promise.all([process.stdout.text(), process.stderr.text(), process.exited]);
  expect(error).toBe("");
  expect(output).toContain(".tgz");
  expect(code).toBe(0);
  expect(await Bun.file(archive).exists()).toBe(true);
}
function moveInside(root: string, from: string, to: string) {
  for (const path of [from, to]) {
    const relativePath = relative(root, resolve(path));
    if (!relativePath || relativePath.startsWith("..") || /^[A-Za-z]:/.test(relativePath))
      throw new Error("Archive move escapes test workspace");
  }
  mkdirSync(resolve(to, ".."), { recursive: true });
  renameSync(from, to);
}

test.skipIf(!isWindows)(
  "real npm archives work outside the monorepo with nested metadata and native consumers",
  async () => {
    using dir = tempDir("win32-common-owner", {});
    const staging = String(dir);
    const coreArchive = join(staging, "metadata.tgz"),
      familyArchive = join(staging, "kernel32.tgz");
    await pack(owner, coreArchive);
    await pack(join(root, "packages/bun-windows-kernel32"), familyArchive);
    const metaExtract = join(staging, "unpack-metadata"),
      familyExtract = join(staging, "unpack-family");
    await new Bun.Archive(await Bun.file(coreArchive).bytes()).extract(metaExtract);
    await new Bun.Archive(await Bun.file(familyArchive).bytes()).extract(familyExtract);
    const consumer = join(staging, "consumer");
    const packageRoot = join(consumer, "node_modules/@aphrody/bun-windows-kernel32");
    moveInside(staging, join(familyExtract, "package"), packageRoot);
    // Metadata is an isolated transitive dependency, not resolvable from the consumer's cwd.
    moveInside(staging, join(metaExtract, "package"), join(packageRoot, "node_modules/@aphrody/bun-windows-win32"));
    const installed = join(packageRoot, "node_modules/@aphrody/bun-windows-win32");
    expect(await Bun.file(join(installed, "families/kernel32.json")).exists()).toBe(true);
    expect(await Bun.file(join(packageRoot, "family.json")).exists()).toBe(false);
    const env = { ...bunEnv };
    delete env.BUN_WINDOWS_FAMILY_PATH;
    delete env.NODE_PATH;
    const script = `const windows = require("bun:windows");
const family = windows.family("kernel32");
const metadata = require("./node_modules/@aphrody/bun-windows-kernel32/node_modules/@aphrody/bun-windows-win32");
const memory = family.struct("MEMORYSTATUSEX");
let missing = ""; try { metadata.family("../escape"); } catch (error) { missing = error.name; }
console.log(JSON.stringify({ processMatches: family.GetCurrentProcessId() === process.pid, cached: metadata.family("kernel32") === family && windows.families.kernel32 === family, constant: family.constants.PROCESS_QUERY_LIMITED_INFORMATION, size: family.sizeof("MEMORYSTATUSEX"), length: memory.dwLength, invalidName: missing }));`;
    await using child = Bun.spawn([bunExe(), "-e", script], {
      cwd: consumer,
      env,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      timeout: 15000,
    });
    const [out, error, code] = await Promise.all([child.stdout.text(), child.stderr.text(), child.exited]);
    expect(error).toBe("");
    expect(JSON.parse(out)).toEqual({
      processMatches: true,
      cached: true,
      constant: 0x1000,
      size: 64,
      length: 64,
      invalidName: "TypeError",
    });
    expect(code).toBe(0);
  },
  30000,
);

test("regeneration retires only owned descriptors and preserves unrelated metadata", () => {
  const descriptor = (family: string) =>
    JSON.stringify({ family, metadata: "Microsoft.Windows.SDK.Win32Metadata 71.0.30-preview" });
  using dir = tempDir("win32-retired-definitions", {
    "bun-windows-kernel32/family.json": descriptor("kernel32"),
    "bun-windows-user32/family.json": descriptor("user32"),
    "bun-windows-win32/families/retired.json": descriptor("retired"),
    "bun-windows-win32/families/foreign.json": JSON.stringify({ family: "foreign", metadata: "unrelated" }),
    "bun-windows-win32/families/kernel32.json": descriptor("kernel32"),
  });
  const folder = String(dir);
  expect(
    obsoleteFamilyFiles(folder, ["kernel32", "user32"]).map(file => relative(folder, file).replaceAll("\\", "/")),
  ).toEqual([
    "bun-windows-kernel32/family.json",
    "bun-windows-user32/family.json",
    "bun-windows-win32/families/retired.json",
  ]);
  expect(obsoleteFamilyFiles(folder, ["kernel32", "user32"], new Set(["kernel32"]))).toEqual([
    join(folder, "bun-windows-kernel32/family.json"),
  ]);
  expect(() => obsoleteFamilyFiles(folder, ["../escape"])).toThrow("Invalid generated Win32 family");
});
