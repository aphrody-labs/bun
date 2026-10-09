import { beforeAll, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { bunEnv, bunExe, tempDir } from "harness";
import * as oxc from "../../../packages/bun-oxc/src/index";
import { platformKeys } from "../../../packages/bun-oxc/src/native";
import { buildNapi } from "../../../scripts/aphrody/build-napi";

const pkgDir = join(import.meta.dir, "../../../packages/bun-oxc");
const pluginEntry = join(pkgDir, "src/index.ts");
const cliEntry = join(pkgDir, "src/cli.ts");
const debuggerIsError = { rules: { "no-debugger": "error" } };

beforeAll(async () => {
  const built = platformKeys().some(key => existsSync(join(pkgDir, `bun-plugin-oxc.${key}.node`)));
  if (!built && !process.env.APHRODY_BUN_PLUGIN_OXC_NATIVE) await buildNapi(pkgDir);
}, 20 * 60_000);

describe("API", () => {
  test("version", () => {
    expect(oxc.version()).toBe("0.3.0");
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

  test("transform decorators, React Refresh, styled-components", () => {
    const decorated = "function d(t: any) {}\n@d class A { @d m() {} }\nexport { A };";
    expect(oxc.transform(decorated, "a.ts", { decorators: "legacy" }).code).toContain("_decorate");
    const component = "export function App() { const [s] = useState(0); return <p>{s}</p>; }";
    expect(oxc.transform(component, "a.tsx", { reactRefresh: true }).code).toContain("$RefreshReg$");
    const styled = 'import styled from "styled-components";\nexport const Box = styled.div`color: red;`;';
    expect(oxc.transform(styled, "a.ts", { styledComponents: true }).code).toContain("displayName");
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
    expect(oxc.minify("console.log(1); debugger;", "a.js", { dropConsole: true })).not.toContain("console");
    const mapped = oxc.minifyWithMap("export const value = 1 + 2;", "a.js", { sourcemap: true });
    expect(JSON.parse(mapped.map!).version).toBe(3);
  });

  test("isolatedDeclaration", () => {
    const out = oxc.isolatedDeclaration("export function f(a: number): string { return String(a); }", "a.ts");
    expect(out.code).toContain("export declare function f(a: number): string;");
    expect(() => oxc.isolatedDeclaration("export const g = (a) => a;", "a.ts")).toThrow("[transform]");
  });

  test("check reports semantic errors with UTF-16 offsets", () => {
    expect(oxc.check("let a = 1;", "a.ts")).toEqual({ ok: true, diagnostics: [] });
    const result = oxc.check("// 🐈\nlet a; let a;", "a.ts");
    expect(result.ok).toBe(false);
    expect(result.diagnostics[0].severity).toBe("error");
    expect(result.diagnostics[0].labels.some(label => label.start === 17)).toBe(true);
  });

  test("analyze and parse", () => {
    const info = oxc.analyze("import './d'; export const v = 1;", "a.ts");
    expect(info.imports).toEqual(["./d"]);
    expect(info.exports).toEqual(["v"]);
    expect(info.spanEncoding).toBe("utf16");
    expect(oxc.parse("export interface S {}", "a.ts").type).toBe("Program");
  });

  test("format runs oxfmt in process", () => {
    expect(oxc.format("const x=1", "a.js")).toBe("const x = 1;\n");
    expect(oxc.format("const x=1", "a.ts", { config: { semi: false } })).toBe("const x = 1\n");
    expect(oxc.format('{"a":1}', "a.json")).toContain('"a": 1');
    expect(() => oxc.format("x", "a.unknown")).toThrow("[input]");
  });

  test("lint runs oxlint in process, with config and fixes", () => {
    expect(oxc.lint("export const x = 1;\n", "a.js").diagnostics).toEqual([]);
    const report = oxc.lint("debugger;\nexport const x = 1;\n", "a.js", { config: debuggerIsError });
    expect(report.errorCount).toBe(1);
    expect(report.diagnostics[0].code).toContain("no-debugger");
    expect(report.diagnostics[0].fixable).toBe("fix");
    const fixed = oxc.lint("debugger;\nexport const x = 1;\n", "a.js", { config: debuggerIsError, fix: true });
    expect(fixed.fixed).not.toContain("debugger");
    expect(fixed.errorCount).toBe(0);
    expect(oxc.lintFix("debugger;\n", "a.js", { config: debuggerIsError })).not.toContain("debugger");
  });

  test("lint discovers .oxlintrc.json", () => {
    using dir = tempDir("oxc-lint-config", { ".oxlintrc.json": JSON.stringify(debuggerIsError) });
    const file = join(String(dir), "a.js");
    expect(oxc.lint("debugger;\n", file, { discoverConfig: true }).errorCount).toBe(1);
  });

  test("lintRules lists every plugin", () => {
    const rules = oxc.lintRules();
    expect(rules.length).toBeGreaterThan(500);
    expect(rules.find(rule => rule.name === "no-debugger")?.fixable).toBe(true);
    for (const plugin of ["eslint", "typescript", "unicorn", "react", "import", "jest"]) {
      expect(rules.some(rule => rule.plugin === plugin)).toBe(true);
    }
  });

  test("resolve", () => {
    using dir = tempDir("oxc-resolve", {
      "node_modules/pkg/package.json": JSON.stringify({
        name: "pkg",
        exports: { ".": { import: "./esm.js", require: "./cjs.js" } },
      }),
      "node_modules/pkg/esm.js": "export {};",
      "node_modules/pkg/cjs.js": "module.exports = {};",
      "src/util.ts": "export {};",
    });
    const root = String(dir);
    expect(oxc.resolve(root, "pkg", { conditionNames: ["import"] }).path).toEndWith("esm.js");
    expect(oxc.resolve(root, "pkg", { conditionNames: ["require"] }).path).toEndWith("cjs.js");
    expect(oxc.resolve(join(root, "src"), "./util", { extensions: [".ts"] }).path).toEndWith("util.ts");
    expect(() => oxc.resolve(root, "missing")).toThrow("[resolve]");
  });
});

describe("oxc-parser / oxc-transform / oxc-minify drop-ins", () => {
  test("parseSync and parse", async () => {
    const parser = await import("../../../packages/bun-oxc/src/parser");
    const result = parser.parseSync("a.ts", "// note\nimport x from 'y';\nconst v: number = 1;");
    expect(result.program.type).toBe("Program");
    expect(result.comments.map(comment => comment.value)).toEqual([" note"]);
    expect(result.module.staticImports[0].moduleRequest.value).toBe("y");
    expect(result.errors).toEqual([]);
    expect((await parser.parse("a.js", "let a")).program.body.length).toBe(1);
    expect(parser.rawTransferSupported()).toBe(false);
    expect(oxc.parseSync("a.js", "let b").program.body.length).toBe(1);
  });

  test("transformSync, isolatedDeclarationSync, minifySync", async () => {
    const transform = await import("../../../packages/bun-oxc/src/transform");
    const out = transform.transformSync("a.ts", "export const v: number = 1;");
    expect(out.code).toContain("export const v = 1");
    expect(out.errors).toEqual([]);
    expect((await transform.transform("a.ts", "let v: string;")).code).not.toContain("string");
    expect(transform.isolatedDeclarationSync("a.ts", "export const v: number = 1;").code).toContain(
      "export declare const v: number;",
    );
    const minify = await import("../../../packages/bun-oxc/src/minify");
    expect(minify.minifySync("a.js", "const longName = 1; console.log(longName);").code).not.toContain("longName");
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

  test("native: true with transform options uses oxc_transform_with", async () => {
    using dir = tempDir("oxc-native-options", files);
    const result = await Bun.build({
      entrypoints: [join(String(dir), "index.tsx")],
      target: "bun",
      plugins: [oxc.oxcPlugin({ native: true, transform: { jsxImportSource: "mini" } })],
    });
    expect(result.success).toBe(true);
    await run(await result.outputs[0].text(), String(dir));
  });

  test("native: true rejects JS-side options", () => {
    expect(() => oxc.oxcPlugin({ native: true, minify: true })).toThrow("not supported");
    expect(() => oxc.oxcPlugin({ native: true, dts: { outdir: "x" } })).toThrow("not supported");
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

  test("dts option writes isolated declarations", async () => {
    using dir = tempDir("oxc-dts", {
      "src/index.ts": `import { twice } from "./math";\nconsole.log(twice(2));\n`,
      "src/math.ts": `export function twice(n: number): number { return n * 2; }\n`,
    });
    const root = String(dir);
    const result = await Bun.build({
      entrypoints: [join(root, "src/index.ts")],
      target: "bun",
      plugins: [oxc.oxcPlugin({ dts: { outdir: join(root, "types"), root: join(root, "src") } })],
    });
    expect(result.success).toBe(true);
    expect(await Bun.file(join(root, "types/math.d.ts")).text()).toContain(
      "export declare function twice(n: number): number;",
    );
  });

  test("lint: 'error' fails the build", async () => {
    using dir = tempDir("oxc-lint", {
      ".oxlintrc.json": JSON.stringify(debuggerIsError),
      "index.ts": `debugger;\nexport const x: number = 1;\n`,
    });
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

  test("lint with fix compiles the fixed source", async () => {
    using dir = tempDir("oxc-lint-fix", { "index.ts": `debugger;\nconsole.log("b:7");\n` });
    const result = await Bun.build({
      entrypoints: [join(String(dir), "index.ts")],
      target: "bun",
      plugins: [oxc.oxcPlugin({ lint: { level: "error", config: debuggerIsError, fix: true } })],
    });
    expect(result.success).toBe(true);
    const code = await result.outputs[0].text();
    expect(code).not.toContain("debugger");
    await run(code, String(dir));
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

  test("legacy decorators run", async () => {
    using dir = tempDir("oxc-runtime-decorators", {
      "mod.ts": `
        const seen: string[] = [];
        function log(_target: any, key: string) { seen.push(key); }
        export class A { @log m() {} }
        export { seen };
      `,
    });
    const { stdout, stderr, exitCode } = await spawn(
      String(dir),
      `import { oxcPlugin } from ${JSON.stringify(pluginEntry)};
       Bun.plugin(oxcPlugin({ transform: { decorators: "legacy" } }));
       const m = await import("./mod.ts");
       console.log(m.seen.join(","));`,
    );
    expect(stderr).toBe("");
    expect(stdout.trim()).toBe("m");
    expect(exitCode).toBe(0);
  });

  test("lint: 'error' rejects the import", async () => {
    using dir = tempDir("oxc-runtime-lint", {
      ".oxlintrc.json": JSON.stringify(debuggerIsError),
      "bad.ts": `debugger;\nexport const x = 1;\n`,
    });
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

describe("bun-oxc CLI", () => {
  async function cli(args: string[], cwd: string) {
    await using proc = Bun.spawn({
      cmd: [bunExe(), cliEntry, ...args],
      env: bunEnv,
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
    return { stdout, stderr, exitCode };
  }

  test.concurrent("transform, dts and check", async () => {
    using dir = tempDir("oxc-cli", {
      "a.ts": "export const f = (n: number): number => n + 1;\n",
      "bad.ts": "let a; let a;\n",
    });
    const cwd = String(dir);
    const transformed = await cli(["transform", "a.ts", "--target", "es2015"], cwd);
    expect(transformed.stdout).not.toContain(": number");
    expect(transformed.exitCode).toBe(0);
    const dts = await cli(["dts", "a.ts"], cwd);
    expect(dts.stdout).toContain("export declare const f: (n: number) => number;");
    expect(dts.exitCode).toBe(0);
    const checked = await cli(["check", "bad.ts"], cwd);
    expect(checked.stdout).toContain("bad.ts:1:");
    expect(checked.exitCode).toBe(1);
  });

  test.concurrent("format --check/--write and lint --fix", async () => {
    using dir = tempDir("oxc-cli-tools", {
      ".oxlintrc.json": JSON.stringify(debuggerIsError),
      "f.js": "const x=1\n",
      "l.js": "debugger;\nexport const y = 1;\n",
    });
    const cwd = String(dir);
    expect((await cli(["format", "--check", "f.js"], cwd)).exitCode).toBe(1);
    expect((await cli(["format", "--write", "f.js"], cwd)).exitCode).toBe(0);
    expect(await Bun.file(join(cwd, "f.js")).text()).toBe("const x = 1;\n");
    const linted = await cli(["lint", "l.js"], cwd);
    expect(linted.stdout).toContain("no-debugger");
    expect(linted.exitCode).toBe(1);
    expect((await cli(["lint", "--fix", "l.js"], cwd)).exitCode).toBe(0);
    expect(await Bun.file(join(cwd, "l.js")).text()).not.toContain("debugger");
  });

  test.concurrent("rules and version", async () => {
    using dir = tempDir("oxc-cli-rules", {});
    const rules = await cli(["rules", "--plugin", "eslint", "--json"], String(dir));
    const list = JSON.parse(rules.stdout) as { plugin: string }[];
    expect(list.length).toBeGreaterThan(50);
    expect(list.every(rule => rule.plugin === "eslint")).toBe(true);
    expect(rules.exitCode).toBe(0);
    const version = await cli(["version"], String(dir));
    expect(version.stdout.trim()).toBe("0.3.0");
    expect(version.exitCode).toBe(0);
  });
});

describe("oxlint JS plugin helpers", () => {
  test("definePlugin and defineRule are identities", async () => {
    const { definePlugin, defineRule } = await import("../../../packages/bun-oxc/src/oxlint");
    const rule = defineRule({ create: () => ({}) });
    const plugin = definePlugin({ meta: { name: "local" }, rules: { r: rule } });
    expect(plugin.rules.r).toBe(rule);
  });
});
