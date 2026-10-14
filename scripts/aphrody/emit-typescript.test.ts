import { expect, test } from "bun:test";
import { join, resolve } from "node:path";
import { isDebug, tempDir } from "../../test/harness";
import { emitTypeScript, loadEmissionSdk } from "./emit-typescript";

const ts = loadEmissionSdk();
const options = { target: "es2020", module: "commonjs", types: [], skipLibCheck: true };

test("SDK emission resolves a project directory and CLI outputs against the supplied cwd", async () => {
  using dir = tempDir("typescript-sdk-cwd", {
    project: {
      "tsconfig.json": JSON.stringify({ compilerOptions: { ...options, outDir: "config-output" }, files: ["input.ts"] }),
      "input.ts": "export const answer = 42;\n",
    },
  });
  const cwd = String(dir);
  expect(emitTypeScript(["--project", "project", "--outDir", "output", "--declaration", "--singleThreaded"], cwd, ts)).toBe(0);
  expect(await Bun.file(join(cwd, "output", "input.js")).text()).toContain("exports.answer = 42");
  expect(await Bun.file(join(cwd, "output", "input.d.ts")).text()).toBe("export declare const answer = 42;\n");
  expect(await Bun.file(join(cwd, "project", "config-output", "input.js")).exists()).toBe(false);
}, isDebug ? 20_000 : 5_000);

test("SDK declaration-only emission produces declarations without JavaScript", async () => {
  using dir = tempDir("typescript-sdk-declarations", {
    "tsconfig.json": JSON.stringify({ compilerOptions: { ...options, declaration: true, outDir: "types" }, files: ["index.ts"] }),
    "index.ts": "export interface Item { name: string }\nexport const item: Item = { name: 'Bun' };\n",
  });
  const cwd = String(dir);
  expect(emitTypeScript(["--emitDeclarationOnly"], cwd, ts)).toBe(0);
  expect(await Bun.file(join(cwd, "types", "index.d.ts")).text()).toContain("export declare const item: Item");
  expect(await Bun.file(join(cwd, "types", "index.js")).exists()).toBe(false);
}, isDebug ? 20_000 : 5_000);

test("SDK solution builds emit referenced projects", async () => {
  using dir = tempDir("typescript-sdk-solution", {
    "tsconfig.json": JSON.stringify({ files: [], references: [{ path: "library" }] }),
    library: {
      "tsconfig.json": JSON.stringify({ compilerOptions: { ...options, composite: true, outDir: "../built" }, files: ["index.ts"] }),
      "index.ts": "export const version = '1';\n",
    },
  });
  const cwd = String(dir);
  expect(emitTypeScript(["-b"], cwd, ts)).toBe(0);
  expect(await Bun.file(join(cwd, "built", "index.js")).text()).toMatch(/exports\.version = ["']1["']/);
  expect(await Bun.file(join(cwd, "built", "index.d.ts")).text()).toMatch(/export declare const version = ["']1["']/);
}, isDebug ? 20_000 : 5_000);

test("automatic SDK resolution emits from root and a subpackage using the same pinned owner", async () => {
  using dir = tempDir("typescript-sdk-automatic", {
    "tsconfig.json": JSON.stringify({ compilerOptions: options, files: ["input.ts"] }),
    "input.ts": "export const answer = 42;\n",
  });
  const directory = String(dir);
  const callers = [resolve(import.meta.dir, "../.."), resolve(import.meta.dir, "../../packages/bun-plugin-svelte")];
  for (const [index, cwd] of callers.entries()) {
    const output = join(directory, `output-${index}`);
    expect(emitTypeScript(["--project", directory, "--outDir", output, "--declaration"], cwd)).toBe(0);
    expect(await Bun.file(join(output, "input.js")).text()).toContain("exports.answer = 42");
    expect(await Bun.file(join(output, "input.d.ts")).text()).toBe("export declare const answer = 42;\n");
  }
}, isDebug ? 20_000 : 5_000);
