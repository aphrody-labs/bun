import { beforeAll, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { bunEnv, bunExe, tempDir } from "harness";
import * as oxc from "../../../packages/bun-oxc/src/index";
import { platformKeys } from "../../../packages/bun-oxc/src/native";
import { buildNapi } from "../../../scripts/aphrody/build-napi";

const pkgDir = join(import.meta.dir, "../../../packages/bun-oxc");
const pluginEntry = join(pkgDir, "src/index.ts");
const hasOxlint = Bun.which("oxlint") !== null;
const hasOxfmt = Bun.which("oxfmt") !== null;

beforeAll(async () => {
  const built = platformKeys().some(key => existsSync(join(pkgDir, `bun-plugin-oxc.${key}.node`)));
  if (!built && !process.env.APHRODY_BUN_PLUGIN_OXC_NATIVE) await buildNapi(pkgDir);
}, 20 * 60_000);

describe("API", () => {
  test("version", () => {
    expect(oxc.version()).toBe("0.2.0");
  });

  test("transform strips TypeScript", () => {
    const out = oxc.transform("enum E { A = 1 }\nexport const f = (a: number): number => a + E.A;", "a.ts");
    expect(out.code).not.toContain(": number");
    expect(out.code).toContain("export const f");
    expect(out.map).toBeUndefined();
  });

  test("transform JSX runtimes", () => {
    const src = 'export const a = <div id="x">hi</div>;';
    expect(oxc.transform(src, "a.tsx").code).toContain("react/jsx-runtime");
    expect(oxc.transform(src, "a.tsx", { jsxImportSource: "preact" }).code).toContain("preact/jsx-runtime");
    const classic = oxc.transform(src, "a.jsx", { jsx: "classic", jsxPragma: "h" }).code;
    expect(classic).toContain('h("div"');
    expect(classic).not.toContain("jsx-runtime");
  });

  test("transform target and sourcemap", () => {
    const out = oxc.transform("export const x = a?.b ?? c;", "a.js", { target: "es2019", sourcemap: true });
    expect(out.code).not.toContain("?.");
    expect(out.code).not.toContain("??");
    expect(JSON.parse(out.map!).version).toBe(3);
  });

  test("errors are thrown with their kind", () => {
    expect(() => oxc.transform("const = ;", "a.ts")).toThrow("[syntax]");
    expect(() => oxc.transform("x", "a.css")).toThrow("[input]");
    expect(() => oxc.transform("x", "a.js", { jsx: "nope" as "classic" })).toThrow("automatic");
  });

  test("minify", () => {
    const out = oxc.minify("const greeting = 'hello'; console.log(greeting);", "a.js");
    expect(out.length).toBeLessThan(48);
    expect(out).toContain("console.log");
  });

  test("analyze and parse", () => {
    const info = oxc.analyze("import './d'; export const v = 1;", "a.ts");
    expect(info.imports).toEqual(["./d"]);
    expect(info.exports).toEqual(["v"]);
    expect(info.spanEncoding).toBe("utf16");
    expect(oxc.parse("export interface S {}", "a.ts").type).toBe("Program");
  });

  test.skipIf(!hasOxfmt)("format", () => {
    expect(oxc.format("const x=1", "a.js")).toBe("const x = 1;\n");
  });

  test.skipIf(!hasOxlint)("lint", () => {
    expect(oxc.lint("export const x = 1;\n", "a.js")).toEqual([]);
    expect(oxc.lint("debugger;\n", "a.js").length).toBeGreaterThan(0);
  });
});

describe("Bun.build", () => {
  const files = {
    "node_modules/mini/jsx-runtime.js": `
      export const Fragment = Symbol.for("f");
      const make = (type, props) => type + ":" + props.children;
      export { make as jsx, make as jsxs, make as jsxDEV };
    `,
    "types.ts": `export interface Shape { n: number }\nexport enum Kind { A = 7 }\n`,
    "index.tsx": `
      import { Kind, type Shape } from "./types";
      const s: Shape = { n: Kind.A };
      console.log(<b>{s.n}</b>);
    `,
  };

  async function run(code: string, dir: string) {
    await Bun.write(join(dir, "out.js"), code);
    await using proc = Bun.spawn({ cmd: [bunExe(), "out.js"], env: bunEnv, cwd: dir, stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
    expect(stderr).toBe("");
    expect(stdout.trim()).toBe("b:7");
    expect(exitCode).toBe(0);
  }

  test("oxcPlugin() onLoad", async () => {
    using dir = tempDir("oxc-onload", files);
    const result = await Bun.build({
      entrypoints: [join(String(dir), "index.tsx")],
      target: "bun",
      plugins: [oxc.oxcPlugin({ transform: { jsxImportSource: "mini" } })],
    });
    expect(result.success).toBe(true);
    await run(await result.outputs[0].text(), String(dir));
  });

  test("oxcPlugin({ native: true }) onBeforeParse", async () => {
    using dir = tempDir("oxc-native", {
      "index.ts": `
        interface Shape { n: number }
        enum Kind { A = 7 }
        const s: Shape = { n: Kind.A };
        console.log("b:" + s.n);
      `,
    });
    const result = await Bun.build({
      entrypoints: [join(String(dir), "index.ts")],
      target: "bun",
      plugins: [oxc.oxcPlugin({ native: true })],
    });
    expect(result.success).toBe(true);
    const code = await result.outputs[0].text();
    expect(code).not.toContain("interface");
    await run(code, String(dir));
  });

  test("native: true rejects JS-side options", () => {
    expect(() => oxc.oxcPlugin({ native: true, minify: true })).toThrow("not supported");
  });

  test("minify option shrinks modules", async () => {
    using dir = tempDir("oxc-minify", {
      "index.ts": `const longVariableName: number = 41;\nconsole.log("b:" + (longVariableName + 1));\n`,
    });
    const result = await Bun.build({
      entrypoints: [join(String(dir), "index.ts")],
      target: "bun",
      plugins: [oxc.oxcPlugin({ minify: true })],
    });
    expect(result.success).toBe(true);
    expect(await result.outputs[0].text()).not.toContain("longVariableName");
  });

  test.skipIf(!hasOxlint)("lint: 'error' fails the build", async () => {
    using dir = tempDir("oxc-lint", { "index.ts": `debugger;\nexport const x: number = 1;\n` });
    const build = Bun.build({
      entrypoints: [join(String(dir), "index.ts")],
      target: "bun",
      plugins: [oxc.oxcPlugin({ lint: "error" })],
    });
    const error = await build.then(
      () => undefined,
      e => e,
    );
    expect(error).toBeInstanceOf(AggregateError);
    expect(error.errors.map((e: Error) => e.message).join(" ")).toContain("oxc lint");
  });
});

describe("Bun.plugin at runtime", () => {
  async function spawn(dir: string, script: string) {
    await Bun.write(join(dir, "main.ts"), script);
    await using proc = Bun.spawn({
      cmd: [bunExe(), "main.ts"],
      env: bunEnv,
      cwd: dir,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
    return { stdout, stderr, exitCode };
  }

  test("plugin options apply to imported modules", async () => {
    using dir = tempDir("oxc-runtime", {
      "mod.ts": `export const f = (a?: { b?: number }, c = 1): number => a?.b ?? c;\n`,
    });
    const { stdout, stderr, exitCode } = await spawn(
      String(dir),
      `import { oxcPlugin } from ${JSON.stringify(pluginEntry)};
       Bun.plugin(oxcPlugin({ transform: { target: "es2019" } }));
       const m = await import("./mod.ts");
       console.log(m.f({ b: 5 }), m.f(), String(m.f).includes("??"));`,
    );
    expect(stderr).toBe("");
    expect(stdout.trim()).toBe("5 1 false");
    expect(exitCode).toBe(0);
  });

  test.skipIf(!hasOxlint)("lint: 'error' rejects the import", async () => {
    using dir = tempDir("oxc-runtime-lint", { "bad.ts": `debugger;\nexport const x = 1;\n` });
    const { stdout, exitCode } = await spawn(
      String(dir),
      `import { oxcPlugin } from ${JSON.stringify(pluginEntry)};
       Bun.plugin(oxcPlugin({ lint: "error" }));
       try { await import("./bad.ts"); console.log("loaded"); } catch (e) { console.log("failed", String(e.message).includes("oxc lint")); }`,
    );
    expect(stdout.trim()).toBe("failed true");
    expect(exitCode).toBe(0);
  });
});
