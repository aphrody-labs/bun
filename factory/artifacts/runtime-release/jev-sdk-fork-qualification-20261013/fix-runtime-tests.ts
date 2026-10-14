import { join } from "node:path";
const root = "/home/ubuntu/src/typesafe-sdk-js";
async function replace(name: string, before: string, after: string) {
  const path = join(root, name);
  const content = await Bun.file(path).text();
  if (!content.includes(before)) throw new Error(`expected SDK hunk absent: ${name}`);
  await Bun.write(path, content.replace(before, after));
}
await replace("src/runtime.ts", "export const isBrowser = (): boolean =>\n  typeof g.window !== \"undefined\" &&\n  typeof g.window.document !== \"undefined\" &&\n  typeof g.navigator !== \"undefined\";", "export const isBrowser = (globals: RuntimeGlobals = g): boolean =>\n  typeof globals.window !== \"undefined\" &&\n  typeof globals.window.document !== \"undefined\" &&\n  typeof globals.navigator !== \"undefined\";");
const path = join(root, "src/runtime.ts");
let runtime = await Bun.file(path).text();
runtime = runtime.replace("export const describeRuntime = (): string => {", "export const describeRuntime = (globals: RuntimeGlobals = g): string => {");
const split = runtime.indexOf("export const describeRuntime");
runtime = runtime.slice(0, split) + runtime.slice(split).replaceAll("g.", "globals.").replace("isBrowser()", "isBrowser(globals)");
await Bun.write(path, runtime);
await Bun.write(join(root, "test/runtime.test.ts"), `import { describe, expect, it } from "vitest";
import { describeRuntime, isBrowser } from "../src/runtime";
import { nativeRuntimeHeader } from "./helpers";

const nodeProcess = { versions: { node: "22.15.0" }, platform: "linux", arch: "x64" };

describe("describeRuntime", () => {
  it("reports the native runtime with its exact version, platform and arch", () => {
    expect(describeRuntime()).toBe(nativeRuntimeHeader());
  });

  it("reports node with platform and arch in an isolated environment", () => {
    expect(describeRuntime({ process: nodeProcess })).toBe("node/22.15.0 (linux; x64)");
  });

  it("prefers Bun over node when both are present", () => {
    expect(describeRuntime({ process: nodeProcess, Bun: { version: "1.2.3" } })).toBe(
      "bun/1.2.3 (linux; x64)",
    );
  });

  it("recognizes Deno", () => {
    expect(describeRuntime({ process: nodeProcess, Deno: { version: { deno: "2.1.0" } } })).toBe(
      "deno/2.1.0 (linux; x64)",
    );
  });

  it("recognizes edge runtimes by their markers", () => {
    expect(describeRuntime({ process: nodeProcess, EdgeRuntime: "edge-runtime" })).toBe("vercel-edge");
    expect(describeRuntime({ process: nodeProcess, navigator: { userAgent: "Cloudflare-Workers" } })).toBe(
      "cloudflare-workers",
    );
  });

  it("falls back to browser, then unknown", () => {
    const browser = { window: { document: {} }, navigator: { userAgent: "Mozilla/5.0" } };
    expect(isBrowser(browser)).toBe(true);
    expect(describeRuntime(browser)).toBe("browser");
    const unknown = { navigator: browser.navigator };
    expect(isBrowser(unknown)).toBe(false);
    expect(describeRuntime(unknown)).toBe("unknown");
  });
});
`);
const helpers = join(root, "test/helpers.ts");
await Bun.write(helpers, (await Bun.file(helpers).text()) + `
/** Expected native header, independent of SDK runtime detection. */
export const nativeRuntimeHeader = (): string => {
  const runtime = process.versions.bun ? "bun" : "node";
  return \`\${runtime}/\${process.versions[runtime]} (\${process.platform}; \${process.arch})\`;
};
`);
await replace("test/client.test.ts", 'import { json, mockFetch } from "./helpers";', 'import { json, mockFetch, nativeRuntimeHeader } from "./helpers";');
await replace("test/client.test.ts", 'expect(headers["X-TypeSafe-Runtime"]).toMatch(/^node\\/\\d+\\.\\d+\\.\\d+ \\(\\w+; \\w+\\)$/);', 'expect(headers["X-TypeSafe-Runtime"]).toBe(nativeRuntimeHeader());');
await replace("test/logging.test.ts", 'import { json, mockFetch } from "./helpers";', 'import { json, mockFetch, nativeRuntimeHeader } from "./helpers";');
await replace("test/logging.test.ts", '"X-TypeSafe-Runtime": expect.stringMatching(/^node\\//),', '"X-TypeSafe-Runtime": nativeRuntimeHeader(),');
console.log("SDK_RUNTIME_FIX_APPLIED");
